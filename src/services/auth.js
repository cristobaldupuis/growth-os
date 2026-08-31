// src/services/auth.js — the browser's Supabase Auth session. ROADMAP Phase 2.0.
//
// ## Why this is hand-rolled rather than @supabase/supabase-js
//
// The same reason api/_supabase.js gives for the server half: this project's
// runtime dependencies are react and react-dom, and every other provider in it is
// reached with `fetch` and a header. Supabase Auth's password grant is two POSTs
// and a refresh timer. A client library to save that is a dependency in the
// critical path of loading a client's workspace.
//
// ## Where the project config comes from
//
// `/api/state?action=status`, not the bundle. There is no `VITE_`-prefixed
// anything here on purpose — see DECISIONS.md on the shared secret that shipped
// inside a build once. The publishable key is genuinely publishable, so this is
// not about secrecy; it is that a credential baked into a build artefact is
// rotated by a redeploy and one served from configuration is rotated by changing
// configuration.
//
// ## What is stored, and where
//
// The session — access token, refresh token, expiry — in `localStorage`, which is
// what every Supabase client does and is the only place a browser can keep a
// session across reloads. This is the user's own credential for their own
// workspace, not a shared secret, and it is scoped by RLS to the workspaces they
// belong to.
//
// The `_v1` suffix is the same discipline the store keys use: a shape change is a
// new key, so an old session never gets read as if it were a new one.

const SESSION_KEY = "gos_session_v1";

// Refresh this far before the token actually expires. Sixty seconds is enough to
// cover a slow refresh and a request already in flight; without a margin the app
// discovers expiry as a 401 on a save the user has already been told succeeded.
const REFRESH_MARGIN_MS = 60 * 1000;

let config = null;      // { url, key } once /api/state has answered
let configPromise = null;

/**
 * The deployment's auth configuration, fetched once.
 *
 * Resolves to `{ configured, auth }` where `auth` is null on a deployment with no
 * Supabase project. Cached as the PROMISE rather than the result so that the
 * several callers racing at boot make one request between them.
 */
export function loadAuthConfig(fetchImpl = fetch) {
  if (configPromise) return configPromise;
  configPromise = fetchImpl("/api/state?action=status")
    .then(r => (r.ok ? r.json() : { configured: false, auth: null }))
    .then(body => {
      config = body && body.auth ? body.auth : null;
      return { configured: !!(body && body.configured), auth: config };
    })
    .catch(() => {
      // A deployment with no api/ at all — `npm run dev` serves the bundle but not
      // the functions. Reported as unconfigured rather than thrown, because the
      // correct behaviour is to run on the browser store, which is what the whole
      // app did until this phase.
      config = null;
      return { configured: false, auth: null };
    });
  return configPromise;
}

/** Test seam and reset. */
export function _setAuthConfig(next) { config = next; configPromise = next ? Promise.resolve({ configured: true, auth: next }) : null; }

export const authConfigured = () => !!config;

// -- Session storage -----------------------------------------------------------

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.access_token && s.refresh_token ? s : null;
  } catch { return null; }
}

function writeSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
    return true;
  } catch {
    // A session that cannot be persisted still works for this tab. Worth not
    // throwing over: the alternative is refusing to sign in at all in a browser
    // with storage disabled, when the session in memory would have served.
    return false;
  }
}

/** Normalise a token response into what is stored. `expires_in` is seconds. */
function toSession(body) {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    user: body.user ? { id: body.user.id, email: body.user.email || null } : null,
  };
}

/** The signed-in user, without touching the network. Null when signed out. */
export function currentUser() {
  const s = readSession();
  return s ? s.user : null;
}

// -- The three calls -----------------------------------------------------------

async function authFetch(path, body, fetchImpl) {
  if (!config) throw new Error("Auth is not configured on this deployment.");
  const res = await fetchImpl(`${config.url}${path}`, {
    method: "POST",
    headers: { apikey: config.key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Supabase spells the reason several ways depending on the failure. Prefer
    // its own message: "Invalid login credentials" and "Email not confirmed" need
    // different actions from whoever is reading it, and collapsing them into one
    // "sign-in failed" is how someone spends ten minutes retyping a correct
    // password.
    const message = parsed.error_description || parsed.msg || parsed.message || parsed.error || `Sign-in failed (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return parsed;
}

/** Sign in with a password. Returns the user; throws with a readable message. */
export async function signIn(email, password, fetchImpl = fetch) {
  const body = await authFetch("/token?grant_type=password", { email, password }, fetchImpl);
  if (!body.access_token) throw new Error("Sign-in returned no session.");
  const session = toSession(body);
  writeSession(session);
  return session.user;
}

/**
 * Clear the session, telling Supabase to revoke the refresh token first.
 *
 * The local clear happens whether or not the revoke succeeds. A sign-out that
 * fails because the network is down must still sign the person out of this
 * browser — the opposite leaves them looking at a workspace they asked to leave.
 */
export async function signOut(fetchImpl = fetch) {
  const s = readSession();
  writeSession(null);
  if (!s || !config) return;
  try {
    await fetchImpl(`${config.url}/logout`, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${s.access_token}` },
    });
  } catch { /* already signed out locally, which is the part that matters */ }
}

// One refresh at a time. Without this, six save requests arriving on an expired
// token each start their own refresh, five of which then present a refresh token
// that the first one has already rotated — and Supabase rejects a reused refresh
// token, so the session dies on a burst of activity rather than on expiry.
let refreshing = null;

async function refresh(session, fetchImpl) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const body = await authFetch("/token?grant_type=refresh_token", { refresh_token: session.refresh_token }, fetchImpl);
      if (!body.access_token) throw new Error("Refresh returned no session.");
      const next = toSession(body);
      // Supabase omits the user on a refresh response; keep the one we have.
      if (!next.user) next.user = session.user;
      writeSession(next);
      return next;
    } catch (err) {
      // A refresh token that no longer works means signed out, not an error to
      // retry. Clearing it here is what stops every subsequent request retrying a
      // credential that will never work again.
      writeSession(null);
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * A usable access token, refreshed if it is close to expiring. Null when signed
 * out or when the refresh failed — both of which mean the caller should ask for
 * a sign-in rather than retry.
 */
export async function accessToken(fetchImpl = fetch) {
  const s = readSession();
  if (!s) return null;
  if (s.expires_at - REFRESH_MARGIN_MS > Date.now()) return s.access_token;
  try {
    return (await refresh(s, fetchImpl)).access_token;
  } catch {
    return null;
  }
}
