import { modelById } from "./registry.js";
import { mkUsageRow, priceTextCall } from "../usage.js";
import { imageCostUsd } from "../assets.js";

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

// `getApiKey()` used to live here, returning the literal string "proxied" so that
// call sites gating UI on "is AI configured" kept compiling after the credential
// moved server-side. Its last caller was CopilotPanel, which opened every debate
// with `if (!apiKey) { setError("AI features are not configured...") }` — a branch
// that could not be taken, guarding against a condition the browser cannot
// observe, and whose message named a cause ("check your API key in Settings")
// that has not been true since the secret was removed from the bundle.
//
// Whether a provider key is present is purely a server-side fact. From the
// browser's side AI is always available to *attempt*, and a missing key surfaces
// as a real error from the proxy with the actual variable named. Removed rather
// than left as a no-op, because a dead configuration check reads like a live one.

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

// -- Image and video spend ---------------------------------------------------
//
// Text calls record themselves inside postProxy below, because every one of them
// goes through it. Image and video do not: they are their own endpoints with
// their own request shapes (see api/image.js and api/video.js), so they record
// here explicitly.
//
// This was the ledger's largest blind spot and it was blind in the worst
// direction. A video render is priced per second and runs one to nine dollars a
// clip — two orders of magnitude above a text call — so a console that showed
// every text call and no renders was not slightly incomplete, it was reporting
// the cheap half of the bill as the whole of it. The asset record already
// carried the cost; nothing joined it to the spend rollup.
//
// Priced from the same tables the asset record uses (IMAGE_COST_USD here,
// estimateVideoCostUsd at the video call site) so a row and its asset cannot
// disagree about what one generation cost.

/** Record one image generation. `costUsd` null for an unpriced model, never 0. */
export function recordImageUsage({ model, initiativeId = null, ok = true, errorKind = null }) {
  const entry = modelById(model);
  record(mkUsageRow({
    group: "image", fn: "callGenerateImage", model,
    provider: entry?.provider || "gemini", modality: "image",
    initiativeId, ok, errorKind,
    costUsd: ok ? imageCostUsd(model) : null,
    rate: entry?.price || null,
  }));
}

/**
 * Record one video render at SUBMIT, not at completion.
 *
 * A submitted render is billed whether or not anyone waits for it, so recording
 * on success would understate spend by exactly the renders that went wrong —
 * the same reasoning the asset record already follows in CreativeStudio.
 */
export function recordVideoUsage({ provider, costUsd, initiativeId = null, ok = true, errorKind = null }) {
  const entry = modelById(provider);
  record(mkUsageRow({
    group: "video", fn: "callGenerateVideo", model: provider,
    provider, modality: "video",
    initiativeId, ok, errorKind,
    costUsd: ok ? (typeof costUsd === "number" ? costUsd : null) : null,
    rate: entry?.price || null,
  }));
}

/**
 * Record one speech generation.
 *
 * `modality: "audio"` is a new value in a field that was already free-form, so
 * the Spend console picks it up with no change — rollupUsage groups by whatever
 * string it finds. That is the point of recording it here rather than leaving
 * auditions unmetered: voice is individually cheap and therefore easy to run
 * hundreds of times, which is exactly the shape of spend a ledger exists to make
 * visible. An unmetered cheap call is how a bill becomes a surprise.
 *
 * `characters` rides along because ElevenLabs bills per character, so it is the
 * unit an operator reconciles against — tokens are meaningless here and seconds
 * are not known until the audio comes back.
 */
/**
 * Record one scene generation, at SUBMIT, on the same reasoning as
 * recordVideoUsage: a submitted job is billed whether or not anyone waits.
 *
 * `modality: "video"` and not a new value, unlike voice's "audio". A Veo clip and
 * a HeyGen render are both video output billed per second — an operator asking
 * "what did video cost this month" means both, and splitting the modality would
 * make the honest answer require adding two rows in the console. What separates
 * them is the GROUP ("scene" vs "video"), which is the axis the routing console
 * already switches on and the axis a rollup can group by.
 */
export function recordSceneUsage({ model, costUsd, initiativeId = null, ok = true, errorKind = null }) {
  const entry = modelById(model);
  record(mkUsageRow({
    group: "scene", fn: "callGenerateScene", model,
    provider: entry?.provider || "gemini", modality: "video",
    initiativeId, ok, errorKind,
    costUsd: ok ? (typeof costUsd === "number" ? costUsd : null) : null,
    rate: entry?.price || null,
  }));
}

export function recordVoiceUsage({ model, costUsd, characters = null, initiativeId = null, ok = true, errorKind = null }) {
  const entry = modelById(model);
  record(mkUsageRow({
    group: "voice", fn: "callGenerateVoice", model,
    provider: entry?.provider || "elevenlabs", modality: "audio",
    initiativeId, ok, errorKind,
    costUsd: ok ? (typeof costUsd === "number" ? costUsd : null) : null,
    rate: entry?.price || null,
    // Reuses the input-token column rather than adding a column that only one
    // provider populates. Characters ARE this provider's billed input unit, and
    // a ledger with a per-provider column set stops being one table.
    inputTokens: characters,
  }));
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
  // Cache tokens are billed at different rates from ordinary input — a read at
  // roughly a tenth, a write at roughly 1.25x — so a ledger that folded them
  // into `inputTokens` would misprice every cached call in both directions.
  // Recorded separately and priced separately; absent on providers that do not
  // report them, which is every non-Anthropic adapter today.
  const cacheReadTokens  = data.usage?.cache_read_input_tokens     ?? null;
  const cacheWriteTokens = data.usage?.cache_creation_input_tokens ?? null;
  record(mkUsageRow({
    ...base,
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    costUsd: priceTextCall(entry?.price, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens),
    // The rate is frozen onto the row alongside the figure it produced, so a
    // later change to the catalogue does not silently restate history.
    rate: entry?.price || null,
  }));
  return data;
}

/**
 * The first TEXT block of a proxy response, or "".
 *
 * Deliberately searches for the block rather than reading `content[0]`, which is
 * what every call site used to do. That worked right up until adaptive thinking
 * was switched on: a response with thinking enabled can lead with a `thinking`
 * block, and `content[0].text` is then `undefined`. The failure was silent in the
 * worst way — the `|| "{}"` fallbacks downstream turned an empty string into an
 * empty object, so Quick Capture returned a blank initiative and Ask Library
 * returned a blank answer, both reported as success.
 *
 * callAgentTurn always filtered by type and was the one call site never affected.
 * Now they all do.
 */
export const firstText = (data) => {
  const block = (data?.content || []).find(b => b?.type === "text" && typeof b.text === "string");
  return block ? block.text.trim() : "";
};

/**
 * Read a prose response, flagging truncation rather than hiding it.
 *
 * Returns `{text, truncated}`. Unlike the JSON path below this does not throw on
 * a cut-off response — half a library answer is still worth reading, it just must
 * not be presented as a whole one. The caller decides how to say so.
 */
export function readProse(data) {
  return { text: firstText(data), truncated: data?.stop_reason === "max_tokens" };
}

/**
 * Read a structured (JSON) response into a value, or throw something the operator
 * can act on.
 *
 * Consolidates the `firstText(data) || "{}"` + `safeParseJSON` + `if (!parsed)
 * throw` preamble that was copy-pasted into eight call sites, and adds the check
 * none of them made: `stop_reason`.
 *
 * Truncation is the failure worth naming separately. A response cut off at
 * `max_tokens` is not malformed — it is a complete, correct, *incomplete* answer
 * that money was already spent on, and it is fixed by raising the ceiling rather
 * than by clicking the button again. Reporting it as "malformed, try again" sends
 * the operator into a retry loop that costs the same again and fails the same way.
 *
 * A refusal is the other one: `stop_reason: "refusal"` means the model declined
 * on safety grounds, which no amount of retrying changes.
 */
export function parseStructured(data, { expectArray = false, label = "The AI response" } = {}) {
  if (data?.stop_reason === "max_tokens") {
    throw new Error(
      `${label} was cut off before it finished — it hit the response length limit. ` +
      `Shorten the input, or raise this call's max_tokens.`
    );
  }
  if (data?.stop_reason === "refusal") {
    throw new Error(`${label} was declined by the model on safety grounds. Try rewording the input.`);
  }
  const raw = firstText(data);
  if (!raw) throw new Error(`${label} came back empty.`);

  const parsed = safeParseJSON(raw, expectArray);
  if (parsed === null) throw new Error(`${label} was not valid JSON.`);
  if (expectArray && !Array.isArray(parsed)) throw new Error(`${label} was expected to be a list.`);
  return parsed;
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
