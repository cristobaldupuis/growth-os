// Tests for the admin session cookie.
//
// This is the only thing standing between a visitor and a control that repoints
// every AI feature in the deployment and can be made to spend money on four
// providers. It is also the kind of code that looks obviously correct and is
// obviously correct right up until one of these properties quietly stops holding:
//
//   - an expired session must be refused (a signature with no expiry check never
//     ages out, and the TTL is the only revocation this design has)
//   - a forged or edited signature must be refused (the expiry is a value the
//     client controls, so it is worthless unsigned)
//   - a missing ADMIN_PASSWORD must close the console rather than open it
//
// The third is the one worth writing a test for even though it reads as paranoid.
// An admin surface that defaults to reachable because an env var was never set is
// a far worse outcome than one that defaults to broken, and "we forgot to
// configure production" is a normal thing to happen.
//
// Run with: node --test api/session.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Set before importing: the module reads process.env at call time, not import
// time, but being explicit here keeps the tests independent of ambient config.
process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
process.env.ADMIN_SESSION_SECRET = "test-signing-secret";

const {
  adminConfigError, passwordMatches, sessionCookie, clearedCookie, hasValidSession,
} = await import("./_session.js");

/** A request carrying `token` as the admin cookie. */
const reqWith = (token) => ({ headers: { cookie: `gos_admin=${token}` } });

/** Extract the cookie value out of a Set-Cookie header. */
const valueOf = (setCookie) => setCookie.split(";")[0].split("=").slice(1).join("=");

const sign = (payload) => createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(payload).digest("hex");

// -- Configuration -------------------------------------------------------------

test("a fully configured console reports no config error", () => {
  assert.equal(adminConfigError(), null);
});

test("a missing password disables the console rather than opening it", () => {
  const saved = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    assert.match(adminConfigError(), /ADMIN_PASSWORD/);
    // The two properties that matter: nothing authenticates, and no existing
    // cookie keeps working either.
    assert.equal(passwordMatches("anything"), false);
    assert.equal(passwordMatches(""), false);
    assert.equal(hasValidSession(reqWith(valueOf(sessionCookie()))), false);
  } finally { process.env.ADMIN_PASSWORD = saved; }
});

test("a missing signing secret disables the console", () => {
  const saved = process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_SESSION_SECRET;
  try {
    assert.match(adminConfigError(), /ADMIN_SESSION_SECRET/);
    assert.equal(passwordMatches(process.env.ADMIN_PASSWORD), false);
  } finally { process.env.ADMIN_SESSION_SECRET = saved; }
});

// -- Password ------------------------------------------------------------------

test("the correct password matches", () => {
  assert.equal(passwordMatches("correct-horse-battery-staple"), true);
});

test("a wrong password does not match", () => {
  assert.equal(passwordMatches("wrong"), false);
  // Length differences must not throw — timingSafeEqual rejects mismatched
  // lengths, which is why both sides are hashed to a fixed width first.
  assert.equal(passwordMatches("a"), false);
  assert.equal(passwordMatches("correct-horse-battery-staple-extra"), false);
});

test("a non-string or empty password does not match", () => {
  for (const bad of ["", null, undefined, 0, {}, []]) {
    assert.equal(passwordMatches(bad), false, `${JSON.stringify(bad)} should not authenticate`);
  }
});

// -- Session cookie ------------------------------------------------------------

test("a freshly issued cookie is accepted", () => {
  assert.equal(hasValidSession(reqWith(valueOf(sessionCookie()))), true);
});

test("the cookie carries the flags that make it not readable or cross-site", () => {
  const header = sessionCookie();
  assert.match(header, /HttpOnly/,          "script must not be able to read the session");
  assert.match(header, /Secure/,            "the session must not travel over plain HTTP");
  assert.match(header, /SameSite=Strict/,   "no cross-site request may carry the session");
  assert.match(header, /Path=\//);
});

test("no session is accepted when there is no cookie at all", () => {
  assert.equal(hasValidSession({ headers: {} }), false);
  assert.equal(hasValidSession({ headers: { cookie: "" } }), false);
  assert.equal(hasValidSession({ headers: { cookie: "other=1" } }), false);
});

test("an expired session is refused", () => {
  // Correctly signed, but for a moment that has passed. Without the expiry check a
  // leaked cookie would be valid forever, and this design has no other revocation.
  const past = Date.now() - 1000;
  assert.equal(hasValidSession(reqWith(`${past}.${sign(String(past))}`)), false);
});

test("an unsigned expiry is refused", () => {
  const future = Date.now() + 60_000;
  assert.equal(hasValidSession(reqWith(String(future))), false);
  assert.equal(hasValidSession(reqWith(`${future}.`)), false);
});

test("a forged signature is refused", () => {
  const future = Date.now() + 60_000;
  assert.equal(hasValidSession(reqWith(`${future}.${"0".repeat(64)}`)), false);
});

test("extending the expiry invalidates the signature", () => {
  // The attack this design has to survive: take a real cookie and push its expiry
  // out. The signature covers the expiry, so the edit breaks it.
  const original = valueOf(sessionCookie());
  const [, signature] = original.split(".");
  const extended = `${Date.now() + 10 * 365 * 24 * 60 * 60 * 1000}.${signature}`;
  assert.equal(hasValidSession(reqWith(extended)), false);
});

test("a session signed with a different secret is refused", () => {
  const future = Date.now() + 60_000;
  const foreign = createHmac("sha256", "not-our-secret").update(String(future)).digest("hex");
  assert.equal(hasValidSession(reqWith(`${future}.${foreign}`)), false);
});

test("a non-numeric expiry is refused even when correctly signed", () => {
  assert.equal(hasValidSession(reqWith(`later.${sign("later")}`)), false);
});

test("the cleared cookie expires immediately and cannot be replayed", () => {
  const header = clearedCookie();
  assert.match(header, /Max-Age=0/);
  assert.equal(hasValidSession(reqWith(valueOf(header))), false);
});

test("the session is read from among several cookies", () => {
  const token = valueOf(sessionCookie());
  assert.equal(hasValidSession({ headers: { cookie: `a=1; gos_admin=${token}; b=2` } }), true);
});
