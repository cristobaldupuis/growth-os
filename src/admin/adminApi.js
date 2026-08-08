// Client for api/admin.js.
//
// One place that knows the endpoint and the action names, so a rename is one edit
// rather than a search. `credentials: "same-origin"` is the default for fetch on a
// same-origin request, but it is stated explicitly here because the session cookie
// is the only thing making these calls work and a future reader should not have to
// know the default to see that.

const ADMIN_URL = "/api/admin";

/**
 * Call an admin action. Resolves to the parsed body; throws an Error carrying the
 * server's own message on a non-2xx, because those messages are written to be
 * shown (which env var is missing, why a routing was rejected) and replacing them
 * with a status code would throw away the useful part.
 *
 * `status` is attached to the thrown error so the caller can tell "not signed in"
 * apart from "that was invalid" without parsing prose — the console uses it to
 * bounce back to the login screen on a 401.
 */
async function call(action, payload = {}) {
  let res;
  try {
    res = await fetch(ADMIN_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    // A network-level failure here almost always means the API functions are not
    // running — the usual case is `npm run dev`, which serves the Vite bundle but
    // not the Vercel functions. Say that rather than "Failed to fetch".
    throw Object.assign(
      new Error("Could not reach /api/admin. If this is local development, the serverless functions need `vercel dev` rather than `npm run dev`."),
      { status: 0 }
    );
  }

  let body = null;
  try { body = await res.json(); } catch { /* a non-JSON error body falls through */ }

  if (!res.ok) {
    throw Object.assign(
      new Error(body?.error || `Admin request failed (${res.status}).`),
      { status: res.status, durable: body?.durable }
    );
  }
  return body;
}

export const login        = (password) => call("login", { password });
export const logout       = ()         => call("logout");
export const getConfig    = ()         => call("getConfig");
export const setRouting   = (routing)  => call("setRouting", { routing });
export const resetRouting = ()         => call("resetRouting");
export const verifyModel  = (model)    => call("verifyModel", { model });
export const listModels   = (provider) => call("listModels", { provider });
