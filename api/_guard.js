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

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://growth-os-iota-seven.vercel.app")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const HOUR_MS = 60 * 60 * 1000;

function originAllowed(req) {
  const origin = req.headers.origin;
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  // Some browsers omit Origin on same-origin POSTs; fall back to Referer prefix.
  const referer = req.headers.referer;
  if (referer) return ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  return false;
}

/** First forwarded hop, or "unknown". The rate-limit identity. */
export function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
}

// Local-dev fallback only. On serverless this is per-instance and resets on cold
// start, which is exactly why the Redis path below exists for production.
const memoryLog = new Map();

function memoryRateLimit(key, max, window) {
  const now = Date.now();
  const entry = memoryLog.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > window) { entry.count = 0; entry.windowStart = now; }
  entry.count += 1;
  memoryLog.set(key, entry);
  return entry.count > max;
}

// Durable, shared across instances. Uses the Upstash REST API so there's no
// connection pooling to manage in a Lambda. Configure UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN; without them the caller falls back to the in-memory
// limiter and logs that the deployment is not durably limited.
//
// Returns null when Redis is not configured, so the caller can tell "not
// configured" apart from "configured and under the limit".
async function redisRateLimit(key, max, window) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const bucketKey = `${key}:${Math.floor(Date.now() / window)}`;
  const ttl = Math.ceil(window / 1000);
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", bucketKey], ["EXPIRE", bucketKey, ttl]]),
  });
  if (!res.ok) throw new Error(`rate-limit backend returned ${res.status}`);
  const out = await res.json();
  const count = Number(out?.[0]?.result);
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
 */
export function guardEntry(req, res, { maxBodyBytes }) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return true; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return true; }
  if (!originAllowed(req)) { res.status(403).json({ error: "Forbidden" }); return true; }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > maxBodyBytes) { res.status(413).json({ error: "Request body too large." }); return true; }

  return false;
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
    const limited = await redisRateLimit(key, max, window);
    if (limited === null) {
      // No Redis configured. Still limit, but say so — a production deployment
      // running on the in-memory limiter is effectively unlimited.
      console.warn(`${label} rate limiting is in-memory only; set UPSTASH_REDIS_REST_URL/TOKEN for a durable limit.`);
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
