// api/_guard.js — the transport-level controls every endpoint shares.
//
// Underscore-prefixed so Vercel does not route it as a function; it is a module
// the three real endpoints import.
//
// ## What belongs here and what deliberately does not
//
// This file holds the parts that were copied verbatim into proxy.js, image.js
// and video.js: the origin allowlist, the CORS preamble, the method and body
// size checks, and the durable-or-memory rate limiter. Roughly 150 lines that
// existed three times, differing only in a Redis key prefix, two numbers and
// the wording of a 429.
//
// What stays in each endpoint is the part that is genuinely per-provider: the
// request VALIDATOR. `validateBody`, `validateImageBody`, `validateSubmitBody`
// and `validatePollBody` are the actual security controls — the model
// allowlist, the token ceiling, the script length cap — and each is tight
// precisely because it knows exactly one request shape. Folding them together
// would mean loosening whichever one lost the argument, which is the reasoning
// already written at the top of image.js for why it is a second endpoint rather
// than a branch. Sharing the plumbing does not disturb that; the validators are
// untouched and still called by their own handlers.
//
// ## Why the limiter fails closed
//
// If the limiter is unavailable we cannot bound spend, and an unbounded proxy
// in front of a metered API is worse than a brief outage. Every endpoint made
// that call independently and identically; it is now made once, here.

import { supabaseConfigured, rpc } from "./_supabase.js";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://growth-os-iota-seven.vercel.app")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const HOUR_MS = 60 * 60 * 1000;

function originAllowed(req) {
  const origin = req.headers.origin;
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  // Some browsers omit Origin on same-origin POSTs; fall back to Referer.
  //
  // Matched at a path boundary, not as a bare string prefix. A plain
  // `referer.startsWith(o)` also accepts `https://our-app.example.com.evil.test/`
  // — the allowed origin really is a prefix of that string — which hands the
  // check to anyone who can register a hostname with ours on the front. Requiring
  // the next character to be `/` (or the string to end there) means the authority
  // component has to match exactly.
  const referer = req.headers.referer;
  if (referer) return ALLOWED_ORIGINS.some((o) => referer === o || referer.startsWith(o + "/"));
  return false;
}

/** First forwarded hop, or "unknown". The rate-limit identity. */
export function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
}

// Local-dev fallback only. On serverless this is per-instance and resets on cold
// start, which is exactly why the durable path below exists for production.
const memoryLog = new Map();

function memoryRateLimit(key, max, window) {
  const now = Date.now();
  const entry = memoryLog.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > window) { entry.count = 0; entry.windowStart = now; }
  entry.count += 1;
  memoryLog.set(key, entry);
  return entry.count > max;
}

// Durable, shared across instances, backed by Postgres through PostgREST.
//
// This used to talk to Upstash Redis, which was never configured on this
// deployment — so the limiter in front of a metered API had been silently
// running on the per-instance memory fallback below. See api/_supabase.js for
// why there is now one datastore rather than two.
//
// The window is encoded INTO the key rather than tracked as state, which is what
// the Redis implementation did and is worth keeping: a new window is a new row,
// so there is no reset logic to get wrong and no read-modify-write race to lose
// increments to. The increment itself is atomic inside one SQL statement — see
// `increment_rate_limit` in supabase/migrations/0003_runtime.sql, and the note
// there about why a SELECT-then-UPDATE would quietly overshoot the ceiling under
// exactly the concurrency this exists to bound.
//
// Returns null when Supabase is not configured, so the caller can tell "not
// configured" apart from "configured and under the limit".
async function durableRateLimit(key, max, window) {
  if (!supabaseConfigured()) return null;

  const bucketKey = `${key}:${Math.floor(Date.now() / window)}`;
  const count = Number(await rpc("increment_rate_limit", {
    p_key: bucketKey,
    p_window_seconds: Math.ceil(window / 1000),
  }));
  if (!Number.isFinite(count)) throw new Error("rate-limit backend returned an unreadable count");
  return count > max;
}

/**
 * CORS preamble, method check, origin allowlist, body size ceiling.
 *
 * Returns true when it has already written a response and the caller must
 * return immediately; false when the request should proceed.
 *
 * Split from the rate limit rather than fused with it because video.js has to
 * read `action` off the body in between — which bucket and which ceiling apply
 * is decided by whether the call is a submit or a poll.
 *
 * `methods` defaults to POST-only, which is what the three provider proxies want:
 * they all take a body and none is safely repeatable from a URL. api/routing.js
 * is the exception — it is a plain read of which model serves which feature
 * group, fetched by the app at boot, so it opts into GET rather than being forced
 * to POST an empty body to satisfy a default it has no reason to share. Note that
 * browsers omit `Origin` on same-origin GETs, so that endpoint authorises on the
 * Referer fallback below; it exposes nothing a visitor could not infer from the
 * model IDs in their own network tab either way.
 */
export function guardEntry(req, res, { maxBodyBytes, methods = ["POST"] }) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return true; }
  if (!methods.includes(req.method)) { res.status(405).json({ error: "Method not allowed" }); return true; }
  if (!originAllowed(req)) { res.status(403).json({ error: "Forbidden" }); return true; }

  // Content-Length is the cheap check and it is the one an honest client trips.
  // It is not a guarantee: a chunked request omits the header entirely, so a
  // caller who wants to evade it can. The real ceiling is the platform's own body
  // limit plus each endpoint's validator (script length, prompt length, reference
  // count) — this exists to reject an oversized body before it is parsed, not to
  // be the only thing standing between the function and a large upload.
  //
  // Measured rather than trusted where it matters: once the body has been parsed,
  // a missing or lying header is checked against what actually arrived.
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > maxBodyBytes) { res.status(413).json({ error: "Request body too large." }); return true; }

  if (!contentLength && req.body !== undefined && actualBodyBytes(req.body) > maxBodyBytes) {
    res.status(413).json({ error: "Request body too large." });
    return true;
  }

  return false;
}

/** Byte length of a parsed body, for the case where no Content-Length arrived. */
function actualBodyBytes(body) {
  if (typeof body === "string") return Buffer.byteLength(body, "utf8");
  if (Buffer.isBuffer(body)) return body.length;
  try { return Buffer.byteLength(JSON.stringify(body) || "", "utf8"); }
  // An unserialisable body (a cycle) cannot be measured. Treated as zero so this
  // check abstains rather than rejecting a request the validators would judge on
  // their own terms — this is a size guard, not a well-formedness one.
  catch { return 0; }
}

/**
 * Durable rate limit, falling back to the in-memory limiter, failing closed on
 * an unavailable backend.
 *
 * Returns true when it has already written a response (429 or 503) and the
 * caller must return immediately; false when the request should proceed.
 *
 * `key` is the full identity for the bucket, prefix included — callers keep
 * their own namespaces (`gos:rl`, `gos:img`, `gos:vid:submit`) so that image
 * spend cannot exhaust, or be exhausted by, text calls.
 */
export async function guardRateLimit(req, res, { key, max, window = HOUR_MS, limitMessage, label }) {
  try {
    const limited = await durableRateLimit(key, max, window);
    if (limited === null) {
      // No durable store configured. Still limit, but say so — a production
      // deployment running on the in-memory limiter is effectively unlimited,
      // because that Map is per warm Lambda instance.
      console.warn(`${label} rate limiting is in-memory only; set SUPABASE_URL/SUPABASE_SECRET_KEY and apply 0003_runtime.sql for a durable limit.`);
      if (memoryRateLimit(key, max, window)) { res.status(429).json({ error: limitMessage }); return true; }
    } else if (limited) {
      res.status(429).json({ error: limitMessage });
      return true;
    }
  } catch (err) {
    // Fail closed. If the limiter is unavailable we cannot bound spend, and an
    // unbounded proxy in front of a metered API is worse than a brief outage.
    console.error(`${label} rate limit check failed:`, err);
    res.status(503).json({ error: "Service temporarily unavailable." });
    return true;
  }
  return false;
}
