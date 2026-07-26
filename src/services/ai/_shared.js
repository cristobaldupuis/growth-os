export const PROXY_URL = "/api/proxy";

// There is deliberately no credential here.
//
// This module used to export `GOS_SECRET = import.meta.env.VITE_GOS_SECRET` and
// send it as an `x-gos-secret` header. Vite substitutes `VITE_`-prefixed values
// into the bundle at build time, so that "secret" was a literal string sitting in
// the JavaScript every visitor downloads — a credential you could read out of
// devtools and use to spend the operator's Anthropic budget. A secret that ships
// to the client is not a secret; it is a speed bump with a misleading name.
//
// The proxy now authorises requests on properties the browser cannot forge
// (Origin/Referer allowlist) and bounds them on shape (model allowlist,
// max_tokens ceiling, body size) rather than on possession of a token. See
// api/proxy.js for the reasoning and DECISIONS.md for when this needs to become
// real per-user auth.
export const AI_HEADERS = () => ({
  "Content-Type": "application/json",
});

// Kept so call sites that gate UI on "is AI configured" keep compiling. Whether
// the key is present is now purely a server-side fact, so from the browser's
// point of view AI is always available to attempt; failures surface as errors
// from the proxy instead.
export const getApiKey = () => "proxied";

/**
 * Read a proxy error response into a message worth showing a user.
 * The proxy returns `{error, type}`; a bare `res.statusText` is not useful.
 */
export async function proxyError(res) {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error || "";
  } catch { /* non-JSON error body — fall through to the status-based message */ }
  if (res.status === 429) return "Rate limit reached. Wait a few minutes and try again.";
  if (res.status === 403) return "This deployment is not authorised to call the AI proxy.";
  if (res.status === 503) return "AI is temporarily unavailable. Try again shortly.";
  return detail || `AI request failed (${res.status}).`;
}

// Defensive JSON extraction for LLM responses. Tries direct parse, then largest
// balanced bracket substring, then (for arrays) wraps a single object. Returns
// null on total failure so callers can show a useful error.
export function safeParseJSON(raw, expectArray) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through to bracket extraction */ }
  const open  = expectArray ? "[" : "{";
  const close = expectArray ? "]" : "}";
  const start = cleaned.indexOf(open);
  const end   = cleaned.lastIndexOf(close);
  if (start !== -1 && end !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try { return JSON.parse(slice); } catch { /* fall through to single-object wrap */ }
  }
  if (expectArray) {
    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === "object") return [obj];
    } catch { /* nothing recoverable */ }
  }
  return null;
}
