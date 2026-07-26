// api/proxy.js — Anthropic API proxy
//
// Sits between Growth OS and Anthropic so the Anthropic key never reaches the
// browser. That part always worked. What did not work was the thing guarding it.
//
// ## What was wrong
//
// The previous version authenticated callers with a shared secret read from
// `import.meta.env.VITE_GOS_SECRET` in the client. Vite inlines any `VITE_`
// prefixed variable into the production bundle as a string literal at build
// time, so the "secret" shipped to every visitor: open devtools, search the
// bundle, and you have a credential that spends the operator's Anthropic budget
// through this endpoint. The per-IP rate limit did not contain that, because it
// lived in a module-level Map — on Vercel that is per warm Lambda instance, so it
// reset on every cold start and was enforced independently per concurrent
// instance. Fifty requests per hour was, in practice, fifty per instance per warm
// period.
//
// ## What this does instead
//
// There is no browser-held credential at all. Access is decided from properties
// the browser cannot forge and an attacker replaying the bundle does not get:
//
//   1. Origin/Referer must match an allowlist. Browsers set these headers
//      themselves and script cannot override them, so this stops the bundle being
//      driven from another page. It does nothing against curl, which is why it is
//      not the only control.
//   2. Requests are shape-checked and bounded before any upstream call: model
//      allowlist, max_tokens ceiling, total body size, and a system-prompt length
//      cap. This is what actually caps spend per request, and it means a stolen
//      request cannot be reshaped into something expensive.
//   3. Rate limiting is durable and global via Upstash Redis when configured,
//      falling back to the in-memory limiter only for local development.
//
// For a deployment carrying real client data, layer real per-user auth on top —
// verify a session JWT here and rate limit per user rather than per IP. See
// DECISIONS.md ("Proxy authentication") for the trigger and the shape of that
// change. This file is the hardened single-tenant version, not multi-tenant auth.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// Comma-separated list, e.g. "https://growth-os.vercel.app,https://app.client.com".
// Falls back to the canonical deployment so a missing env var fails closed
// against everything else rather than opening up to `*`.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://growth-os-iota-seven.vercel.app")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Only models this app actually calls. An allowlist means a leaked request can't
// be edited to invoke something with a different cost profile.
export const ALLOWED_MODELS = new Set([
  "claude-sonnet-5",
  "claude-haiku-4-5",
]);

export const MAX_TOKENS_CEILING = 4000;   // highest max_tokens any feature legitimately needs
const MAX_BODY_BYTES     = 512 * 1024;
const MAX_SYSTEM_CHARS   = 60000;

const RATE_LIMIT_MAX    = 60;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

// Local-dev fallback only. On serverless this is per-instance and resets on cold
// start, which is exactly why the Redis path below exists for production.
const memoryLog = new Map();

function memoryRateLimit(id) {
  const now = Date.now();
  const entry = memoryLog.get(id) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) { entry.count = 0; entry.windowStart = now; }
  entry.count += 1;
  memoryLog.set(id, entry);
  return entry.count > RATE_LIMIT_MAX;
}

// Durable, shared across instances. Uses the Upstash REST API so there's no
// connection pooling to manage in a Lambda. Configure UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN; without them we fall back to the in-memory limiter
// and log that the deployment is not durably limited.
async function redisRateLimit(id) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const key = `gos:rl:${id}:${Math.floor(Date.now() / RATE_LIMIT_WINDOW)}`;
  const ttl = Math.ceil(RATE_LIMIT_WINDOW / 1000);
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", key], ["EXPIRE", key, ttl]]),
  });
  if (!res.ok) throw new Error(`rate-limit backend returned ${res.status}`);
  const out = await res.json();
  const count = Number(out?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("rate-limit backend returned an unreadable count");
  return count > RATE_LIMIT_MAX;
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  // Some browsers omit Origin on same-origin POSTs; fall back to Referer prefix.
  const referer = req.headers.referer;
  if (referer) return ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  return false;
}

// Returns an error string, or null when the body is acceptable.
// Exported so the request-shape test can assert against the real rules rather
// than a copy of them that can drift.
export function validateBody(body) {
  if (!body || typeof body !== "object") return "Malformed request body.";
  if (!ALLOWED_MODELS.has(body.model)) return "Unsupported model.";

  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1) return "max_tokens must be a positive integer.";
  if (body.max_tokens > MAX_TOKENS_CEILING) return `max_tokens exceeds the ${MAX_TOKENS_CEILING} ceiling.`;

  if (!Array.isArray(body.messages) || body.messages.length === 0) return "messages must be a non-empty array.";
  if (typeof body.system === "string" && body.system.length > MAX_SYSTEM_CHARS) return "System prompt is too long.";

  // Streaming would need different response plumbing than the JSON passthrough
  // below; reject rather than silently returning a broken body.
  if (body.stream) return "Streaming is not supported through this proxy.";
  return null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!originAllowed(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Request body too large." });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  try {
    const limited = await redisRateLimit(ip);
    if (limited === null) {
      // No Redis configured. Still limit, but say so — a production deployment
      // running on the in-memory limiter is effectively unlimited.
      console.warn("Rate limiting is in-memory only; set UPSTASH_REDIS_REST_URL/TOKEN for a durable limit.");
      if (memoryRateLimit(ip)) return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    } else if (limited) {
      return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    }
  } catch (err) {
    // Fail closed. If the limiter is unavailable we cannot bound spend, and an
    // unbounded proxy in front of a metered API is worse than a brief outage.
    console.error("Rate limit check failed:", err);
    return res.status(503).json({ error: "Service temporarily unavailable." });
  }

  const invalid = validateBody(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const upstream = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      // Log the upstream detail server-side; return a generic shape so provider
      // error text (which can echo request content) isn't handed to the browser.
      console.error("Anthropic error", upstream.status, data?.error?.type, data?.error?.message);
      return res.status(upstream.status).json({
        error: data?.error?.message || "Upstream request failed",
        type: data?.error?.type,
      });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
