// api/_session.js — the admin session cookie.
//
// ## Why there is any auth here at all
//
// DECISIONS.md says this deployment has no authentication layer, and that is
// still true of the *app*: Growth OS gates nothing per user, because there is one
// client per deployment and their portfolio is the only thing in it.
//
// The admin console is a different kind of surface. It can repoint any AI feature
// at any model in the catalogue and it can run the test bench, which spends real
// money on every provider it compares. "No auth" is defensible for a view of your
// own data; it is not defensible for a control that changes what every visitor's
// session runs on and can be made to spend. So this is an operator gate, narrower
// than the per-user auth in the "Proxy authentication" forcing condition — that
// one is still outstanding and this does not close it.
//
// ## Why a signed cookie and not a stored session
//
// A server-side session table would need the store to be reachable on every
// request, and _routing.js already establishes that Redis here is best-effort. An
// HMAC-signed cookie needs no storage at all: the signature proves the server
// issued it and the embedded expiry bounds it. The tradeoff is that it cannot be
// revoked before it expires, which is why the TTL is twelve hours rather than
// weeks — for a single operator logging into a console that is the right shape.
//
// node:crypto only, so this adds no dependency to a project whose runtime deps
// are react and react-dom.
//
// ## What the password is checked against
//
// ADMIN_PASSWORD, compared with timingSafeEqual. A plain `===` on a secret leaks
// its length and prefix through response timing; the comparison is cheap to do
// properly and the alternative is a subtle bug nobody notices until it matters.
// Both values are hashed to a fixed 32 bytes first, because timingSafeEqual
// throws on length mismatch — which would itself be a length oracle.
//
// If ADMIN_PASSWORD is unset the console is unreachable rather than open. An admin
// surface that defaults to no password because someone forgot to configure one is
// worse than no admin surface.

import { createHmac, timingSafeEqual, createHash } from "node:crypto";

const COOKIE_NAME = "gos_admin";
const TTL_MS = 12 * 60 * 60 * 1000;

/** Fixed-width digest so timingSafeEqual never sees mismatched lengths. */
const digest = (s) => createHash("sha256").update(String(s), "utf8").digest();

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Why the console is unavailable, or null when it is properly configured.
 * Surfaced verbatim so a misconfigured deployment says which variable is missing
 * rather than just refusing to log in.
 */
export function adminConfigError() {
  if (!process.env.ADMIN_PASSWORD) return "ADMIN_PASSWORD is not set, so the admin console is disabled.";
  if (!process.env.ADMIN_SESSION_SECRET) return "ADMIN_SESSION_SECRET is not set, so admin sessions cannot be signed.";
  return null;
}

/** Constant-time password check. False whenever the console is misconfigured. */
export function passwordMatches(supplied) {
  if (adminConfigError()) return false;
  if (typeof supplied !== "string" || !supplied) return false;
  return timingSafeEqual(digest(supplied), digest(process.env.ADMIN_PASSWORD));
}

/** A `Set-Cookie` value carrying a fresh signed session. */
export function sessionCookie() {
  const expiry = Date.now() + TTL_MS;
  const token = `${expiry}.${sign(String(expiry), process.env.ADMIN_SESSION_SECRET)}`;
  // HttpOnly: script cannot read it, so an XSS in the console cannot exfiltrate
  //   the session.
  // SameSite=Strict: it is never sent on a cross-site request, so nothing can
  //   drive an admin action from another page.
  // Secure: HTTPS only. Vercel serves HTTPS everywhere including previews.
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}`;
}

/** A `Set-Cookie` value that clears the session. */
export function clearedCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/**
 * True when the request carries a session this server issued and that has not
 * expired.
 *
 * Both halves matter and neither is sufficient: an unsigned expiry is a value the
 * client picks, and a signature without an expiry never ages out.
 */
export function hasValidSession(req) {
  if (adminConfigError()) return false;
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return false;

  const [expiryPart, signature] = token.split(".");
  if (!expiryPart || !signature) return false;

  const expected = sign(expiryPart, process.env.ADMIN_SESSION_SECRET);
  // Compare digests rather than the hex strings directly, for the same
  // length-oracle reason as the password check above.
  if (!timingSafeEqual(digest(signature), digest(expected))) return false;

  const expiry = Number(expiryPart);
  return Number.isFinite(expiry) && expiry > Date.now();
}
