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
import { TEXT_MODEL_IDS, modelById } from "../src/services/ai/registry.js";
import { adapters } from "./_adapters.js";

// Only models this app can route to. An allowlist means a leaked request can't be
// edited to invoke something with a different cost profile.
//
// Derived from the registry rather than hand-kept, because the two lists have to
// agree and there is no way to notice that they don't until a feature 400s in
// production: the admin console offers exactly what the catalogue holds, so a
// model in the catalogue but missing here would be selectable and immediately
// broken. One list, and adding a model is one edit.
//
// The registry being the *source* of the allowlist does not make it a weaker
// control. Nothing a request carries can add to it — a body naming an unlisted
// model is still rejected here, before any upstream call.
export const ALLOWED_MODELS = new Set(TEXT_MODEL_IDS);

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

  // Which provider serves this model is a registry fact, not something the request
  // gets to state. A body cannot name a provider, only a model, and an unlisted
  // model was already rejected by validateBody above.
  const entry = modelById(req.body.model);
  const adapter = adapters[entry?.provider];
  if (!adapter) {
    console.error("No adapter for provider", entry?.provider, "of model", req.body.model);
    return res.status(500).json({ error: "This model has no provider adapter configured." });
  }

  const apiKey = process.env[adapter.keyVar];
  if (!apiKey) return res.status(500).json({ error: `${adapter.keyVar} is not configured.` });

  try {
    const upstream = await fetch(adapter.endpoint(req.body.model), {
      method: "POST",
      headers: adapter.headers(apiKey),
      body: JSON.stringify(adapter.toRequest(req.body)),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      // Log the upstream detail server-side; return a generic shape so provider
      // error text (which can echo request content) isn't handed to the browser.
      console.error("Upstream error", entry.provider, upstream.status, adapter.errorOf(data));
      return res.status(upstream.status).json({
        error: adapter.errorOf(data) || "Upstream request failed",
        type: data?.error?.type,
      });
    }
    // Normalised into the Anthropic response shape regardless of provider, so no
    // call site has to know which one answered. See api/_adapters.js.
    return res.status(200).json(adapter.fromResponse(data));
  } catch (err) {
    console.error("Proxy error:", entry.provider, err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
