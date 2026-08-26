// api/_supabase.js — the deployment's server-side datastore.
//
// Underscore-prefixed so Vercel does not route it as a function; it is a module
// the real endpoints import.
//
// ## What moved here, and why there is only one datastore now
//
// This app used to assume two: Supabase for generated-asset bytes, and Upstash
// Redis for durable rate limiting and model routing. Upstash was chosen when it
// was the only durable store the deployment had; Supabase arrived later, for
// blob storage, and the Redis half was never actually configured. So the two
// controls that depended on it — the ceiling in front of a metered API, and the
// routing an operator sets for every visitor — were running degraded in
// production while the code described them as durable.
//
// Neither job is Redis-shaped. Routing is one row read once per page load.
// Rate limiting is a counter, and Postgres increments one atomically in a single
// statement (see `increment_rate_limit` in 0003_runtime.sql). Two managed
// datastores for a single-operator app is one more account, one more bill and one
// more thing to be silently unconfigured.
//
// ## Why raw REST rather than @supabase/supabase-js
//
// This project's runtime dependencies are react and react-dom, and every other
// provider here is reached with `fetch` and a header — see api/_adapters.js and
// api/_geminiAuth.js, which mints RS256 JWTs with node:crypto rather than pull in
// google-auth-library. PostgREST is an HTTP API; a client library would add a
// dependency to serverless functions to save a fetch call.
//
// ## The key
//
// Server-side only, and it must be the SECRET key rather than the publishable
// one. Both runtime tables have RLS enabled with no policies, so the anon key
// can read and write neither — which is the point. A rate-limit counter the
// browser can reset is not a rate limit, and a routing row a visitor can write
// lets them repoint every AI feature in the app at the dearest model in the
// catalogue.

/**
 * The server-side key, under either name Supabase has used for it.
 *
 * `SUPABASE_SECRET_KEY` is the current naming — Supabase renamed the
 * `service_role` key to the "secret key" (`sb_secret_...`) — and
 * `SUPABASE_SERVICE_KEY` is what deployments configured before that rename
 * carry. Reading both removes an entire class of silent misconfiguration: a
 * project that is genuinely set up, an env var that is genuinely present, and a
 * feature reporting itself unconfigured because the two names disagree.
 */
export const secretKey = () =>
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";

/** True when this deployment has somewhere durable to read and write. */
export const supabaseConfigured = () => !!(process.env.SUPABASE_URL && secretKey());

const baseUrl = () => String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");

/** REST root. Storage lives at a sibling path — see api/asset.js. */
export const restBase = () => baseUrl() + "/rest/v1";

export const authHeaders = () => ({
  apikey: secretKey(),
  Authorization: "Bearer " + secretKey(),
});

// Bounded so a hung datastore cannot hold a serverless function open. Short
// because every caller here is on a request path a person is waiting on, and
// both callers have a defined behaviour for "could not reach it" — routing
// serves the committed defaults, the limiter fails closed.
const TIMEOUT_MS = 4000;

/**
 * Call a Postgres function through PostgREST.
 *
 * Used for the rate-limit counter, which has to be atomic and therefore has to
 * be one statement executed in the database rather than a read and a write
 * issued from here. Throws on any non-2xx so the caller can decide — and the two
 * callers decide differently, which is the whole reason this does not swallow.
 */
export async function rpc(fn, args) {
  const res = await fetch(`${restBase()}/rpc/${fn}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`supabase rpc ${fn} returned ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
  return res.json();
}

/**
 * Read one `app_config` row's value, or null when the key is absent.
 *
 * Absent and unreachable are deliberately NOT distinguished in the return value:
 * both mean "no stored value", and the one caller treats them the same way by
 * merging over committed defaults. A caller that needs to tell them apart should
 * catch instead.
 */
export async function readConfig(key) {
  const res = await fetch(
    `${restBase()}/app_config?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`supabase config read returned ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0].value : null;
}

/** Insert or replace one `app_config` row. Throws on failure — a save that did
 *  not happen must never be reported as one. */
export async function writeConfig(key, value) {
  const res = await fetch(`${restBase()}/app_config`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      // PostgREST's upsert. Without it a second save of the same key is a
      // primary-key violation rather than an update.
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`supabase config write returned ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
}
