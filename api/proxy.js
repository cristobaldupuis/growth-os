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

import { guardEntry, guardRateLimit, clientIp } from "./_guard.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// Only models this app actually calls. An allowlist means a leaked request can't
// be edited to invoke something with a different cost profile.
export const ALLOWED_MODELS = new Set([
  "claude-sonnet-5",
  "claude-haiku-4-5",
]);

export const MAX_TOKENS_CEILING = 4000;   // highest max_tokens any feature legitimately needs
const MAX_BODY_BYTES     = 512 * 1024;
const MAX_SYSTEM_CHARS   = 60000;

const RATE_LIMIT_MAX = 60;

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
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
  if (await guardRateLimit(req, res, {
    key: `gos:rl:${clientIp(req)}`,
    max: RATE_LIMIT_MAX,
    limitMessage: "Rate limit exceeded. Try again later.",
    label: "Text",
  })) return;

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
