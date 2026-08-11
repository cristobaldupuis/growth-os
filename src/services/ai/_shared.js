import { modelById } from "./registry.js";
import { mkUsageRow, priceTextCall } from "../usage.js";

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

// -- Spend recording -------------------------------------------------------------
//
// Every proxy response already carries its own token counts — Anthropic returns
// `usage` natively and api/_adapters.js normalises Gemini's `usageMetadata` and
// OpenAI's `usage` into the same shape. Nothing read them, so the admin console
// could say which model each feature group was pointed at and nothing could say
// what that choice had cost.
//
// The sink is module-level for the same reason `activeRouting` is in models.js:
// every AI call site is a plain async function a long way from React state, and
// the alternative is threading a recorder through twelve signatures that have no
// other use for it. App.jsx installs one at boot; until it does, rows are dropped
// rather than queued — a ledger is not worth a memory leak on a page that never
// mounted the app.

let usageSink = null;
/** Install the recorder. Called once, at app init. */
export function onUsage(fn) { usageSink = fn; }

function record(row) {
  if (!usageSink) return;
  // A broken ledger must never break a working AI call. This is bookkeeping
  // wrapped around the thing the user actually asked for, so it fails quietly
  // and loudly in the console rather than surfacing as "your brief failed".
  try { usageSink(row); } catch (err) { console.error("usage recording failed:", err); }
}

/**
 * POST to the text proxy, record what it cost, and return the parsed body.
 *
 * Replaces the fetch/ok-check/parse/error-check preamble that was copy-pasted
 * into all twelve call sites — which is also why recording lives here rather
 * than at each one: a twelfth copy of the same six lines is where the drift
 * starts, and a call site that forgets to record is invisible in the console
 * rather than obviously broken.
 *
 * `group` and `fn` are both recorded because they answer different questions:
 * the group is what the admin console routes and what an operator changes, the
 * function is which surface actually spent the money.
 */
export async function postProxy({ group, fn, initiativeId = null, body }) {
  const model = body?.model || "";
  const entry = modelById(model);
  const base = { group, fn, model, provider: entry?.provider || "", modality: "text", initiativeId };

  let resp;
  try {
    resp = await fetch(PROXY_URL, { method: "POST", headers: AI_HEADERS(), body: JSON.stringify(body) });
  } catch (err) {
    // A network failure spent nothing, but it is still worth a row: a console
    // showing calls-with-no-cost is how an operator notices the proxy is down.
    record(mkUsageRow({ ...base, ok: false, errorKind: "network" }));
    throw err;
  }

  if (!resp.ok) {
    record(mkUsageRow({ ...base, ok: false, errorKind: "http_" + resp.status }));
    throw new Error(await proxyError(resp));
  }

  const data = await resp.json();
  if (data.error) {
    record(mkUsageRow({ ...base, ok: false, errorKind: "provider" }));
    throw new Error(data.error.message || "The AI service returned an error.");
  }

  const inputTokens  = data.usage?.input_tokens  ?? null;
  const outputTokens = data.usage?.output_tokens ?? null;
  record(mkUsageRow({
    ...base,
    inputTokens, outputTokens,
    costUsd: priceTextCall(entry?.price, inputTokens, outputTokens),
    // The rate is frozen onto the row alongside the figure it produced, so a
    // later change to the catalogue does not silently restate history.
    rate: entry?.price || null,
  }));
  return data;
}

/** The first text block of a proxy response, or "" — the shape every structured
 *  call site unwraps by hand today. */
export const firstText = (data) =>
  data.content && data.content[0] && typeof data.content[0].text === "string"
    ? data.content[0].text.trim()
    : "";

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
