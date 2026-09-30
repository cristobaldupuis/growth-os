import test from "node:test";
import assert from "node:assert/strict";
import { loadAuthConfig, signIn, signOut, accessToken, currentUser, _setAuthConfig } from "./auth.js";

// auth.js reads localStorage only inside functions, so installing the shim at
// module scope (which runs after the import above) is early enough.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

function reset() {
  backing.clear();
  _setAuthConfig({ url: "https://p.supabase.co/auth/v1", key: "pub_key" });
}

function mockFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers || {} });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return {
      ok: next.status === undefined || (next.status >= 200 && next.status < 300),
      status: next.status ?? 200,
      json: async () => next.body ?? {},
    };
  };
  impl.calls = calls;
  return impl;
}

const session = (expiresIn) => ({
  access_token: "at." + expiresIn, refresh_token: "rt", expires_in: expiresIn,
  user: { id: "u1", email: "a@b.c" },
});

// -- Configuration -------------------------------------------------------------

test("config comes from the endpoint, never from the bundle", async () => {
  reset();
  _setAuthConfig(null);
  const f = mockFetch([{ body: { configured: true, auth: { url: "https://p/auth/v1", key: "k" } } }]);
  const cfg = await loadAuthConfig(f);
  assert.equal(f.calls[0].url, "/api/state?action=status");
  assert.equal(cfg.auth.key, "k");
});

test("a deployment with no api/ reads as unconfigured rather than throwing", async () => {
  reset();
  _setAuthConfig(null);
  // `npm run dev` serves the bundle but not the functions. The app must fall back
  // to the browser store, which is what it did before this phase existed.
  const cfg = await loadAuthConfig(async () => { throw new Error("ECONNREFUSED"); });
  assert.equal(cfg.configured, false);
  assert.equal(cfg.auth, null);
});

// -- Sign in and out -----------------------------------------------------------

test("signing in stores the session and reports the user", async () => {
  reset();
  const f = mockFetch([{ body: session(3600) }]);
  const user = await signIn("a@b.c", "pw", f);
  assert.equal(user.email, "a@b.c");
  assert.match(f.calls[0].url, /grant_type=password$/);
  assert.equal(f.calls[0].headers.apikey, "pub_key");
  assert.equal(currentUser().id, "u1");
});

test("the password goes to Supabase, never to this deployment", async () => {
  reset();
  const f = mockFetch([{ body: session(3600) }]);
  await signIn("a@b.c", "pw", f);
  assert.ok(f.calls[0].url.startsWith("https://p.supabase.co/"));
  assert.ok(!f.calls[0].url.includes("/api/"));
});

test("Supabase's own reason survives, because the reasons need different actions", async () => {
  reset();
  // "Invalid login credentials" and "Email not confirmed" are different problems,
  // and collapsing them is how someone retypes a correct password for ten minutes.
  const f = mockFetch([{ status: 400, body: { error_description: "Email not confirmed" } }]);
  await assert.rejects(() => signIn("a@b.c", "pw", f), /Email not confirmed/);
});

test("signing out clears this browser even when the revoke fails", async () => {
  reset();
  await signIn("a@b.c", "pw", mockFetch([{ body: session(3600) }]));
  await signOut(async () => { throw new Error("offline"); });
  assert.equal(currentUser(), null);
});

// -- Tokens --------------------------------------------------------------------

test("a fresh token is returned without a network call", async () => {
  reset();
  await signIn("a@b.c", "pw", mockFetch([{ body: session(3600) }]));
  const f = mockFetch([{ body: {} }]);
  assert.equal(await accessToken(f), "at.3600");
  assert.equal(f.calls.length, 0);
});

test("a token inside the refresh margin is refreshed before it is handed out", async () => {
  reset();
  // Without the margin, expiry is discovered as a 401 on a save the user has
  // already been told succeeded.
  await signIn("a@b.c", "pw", mockFetch([{ body: session(30) }]));
  const f = mockFetch([{ body: { access_token: "at.new", refresh_token: "rt2", expires_in: 3600 } }]);
  assert.equal(await accessToken(f), "at.new");
  assert.match(f.calls[0].url, /grant_type=refresh_token$/);
});

test("the user survives a refresh, which does not return one", async () => {
  reset();
  await signIn("a@b.c", "pw", mockFetch([{ body: session(30) }]));
  await accessToken(mockFetch([{ body: { access_token: "at.new", refresh_token: "rt2", expires_in: 3600 } }]));
  assert.equal(currentUser().email, "a@b.c");
});

test("concurrent callers share one refresh", async () => {
  reset();
  await signIn("a@b.c", "pw", mockFetch([{ body: session(30) }]));
  // Supabase rotates the refresh token, so a second concurrent refresh presents
  // one that has already been used and kills the session on a burst of saves.
  const f = mockFetch([{ body: { access_token: "at.new", refresh_token: "rt2", expires_in: 3600 } }]);
  const tokens = await Promise.all([accessToken(f), accessToken(f), accessToken(f)]);
  assert.deepEqual(tokens, ["at.new", "at.new", "at.new"]);
  assert.equal(f.calls.length, 1);
});

test("a refresh token that no longer works signs the browser out", async () => {
  reset();
  await signIn("a@b.c", "pw", mockFetch([{ body: session(30) }]));
  const f = mockFetch([{ status: 400, body: { error: "invalid_grant" } }]);
  assert.equal(await accessToken(f), null);
  // Cleared, so every later request stops retrying a credential that will never
  // work again.
  assert.equal(currentUser(), null);
});

test("signed out returns no token and makes no request", async () => {
  reset();
  const f = mockFetch([{ body: {} }]);
  assert.equal(await accessToken(f), null);
  assert.equal(f.calls.length, 0);
});

// -- Invitation and reset links ------------------------------------------------------

import { parseAuthFragment, consumeAuthRedirect, requestPasswordReset, updatePassword } from "./auth.js";

test("an auth fragment is told apart from a route, and its failure is readable", () => {
  assert.equal(parseAuthFragment("#/dashboard"), null);
  assert.equal(parseAuthFragment("#/i/e-123/edit"), null);
  assert.equal(parseAuthFragment(""), null);
  const ok = parseAuthFragment("#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer&type=invite");
  assert.deepEqual(ok, { type: "invite", tokens: { access_token: "AT", refresh_token: "RT", expires_in: 3600 } });
  const dead = parseAuthFragment("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  assert.match(dead.error, /expired or was already used/);
});

test("a reset link's session is adopted, named, and the tokens leave the address bar", async () => {
  reset();
  const replaced = [];
  globalThis.window = { location: { pathname: "/", search: "", hash: "" }, history: { replaceState: (...a) => replaced.push(a) } };
  const fetchImpl = mockFetch([{ body: { id: "u9", email: "lead@acme.com" } }]);
  const out = await consumeAuthRedirect(fetchImpl, "#access_token=AT&refresh_token=RT&expires_in=3600&type=recovery");
  assert.deepEqual(out, { type: "recovery", user: { id: "u9", email: "lead@acme.com" } });
  assert.equal(currentUser().email, "lead@acme.com");
  assert.equal(replaced[0][2], "/#/", "the fragment is replaced, not left in history");
  assert.match(fetchImpl.calls[0].url, /\/user$/);
  assert.equal(fetchImpl.calls[0].headers.Authorization, "Bearer AT");
  assert.equal(await consumeAuthRedirect(fetchImpl, "#access_token=AT&refresh_token=RT"), null, "consumed once");
  delete globalThis.window;
});

test("a password reset request goes to Supabase with a return address, and setting one uses the session", async () => {
  reset();
  const send = mockFetch([{ body: {} }]);
  await requestPasswordReset("lead@acme.com", "https://app.example/", send);
  assert.match(send.calls[0].url, /\/recover\?redirect_to=https%3A%2F%2Fapp\.example%2F$/);
  assert.deepEqual(send.calls[0].body, { email: "lead@acme.com" });

  await signIn("lead@acme.com", "pw", mockFetch([{ body: session(3600) }]));
  const put = mockFetch([{ body: { id: "u1" } }]);
  await updatePassword("a-long-password", put);
  assert.match(put.calls[0].url, /\/user$/);
  assert.deepEqual(put.calls[0].body, { password: "a-long-password" });
  assert.equal(put.calls[0].headers.Authorization, "Bearer at.3600");
});
