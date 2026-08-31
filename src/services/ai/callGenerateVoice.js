// Voice auditions — hear a script before buying a render.
//
// The unit of value here is not the audio file. It is that the script-and-voice
// decision stops costing a video render. Everything in this module is shaped by
// that: the audio is returned, played and discarded, nothing is persisted, and
// the cost is estimated BEFORE the call so the operator sees the price of the
// take next to the button that buys it.

import { AI_HEADERS, proxyError, recordVoiceUsage } from "./_shared.js";

export const VOICE_PROXY_URL = "/api/voice";

// Named aliases, the same convention IMAGE_MODELS follows, because the names
// carry the tradeoff and the raw ids do not.
export const VOICE_MODELS = {
  /** Best quality, full prosody. The one to judge a read on. */
  QUALITY: "eleven_multilingual_v2",
  /** Half the credits, near-instant. For scrubbing through many variants. */
  FAST:    "eleven_flash_v2_5",
  /** Middle ground; quality close to v2 at Flash's credit rate. */
  BALANCED:"eleven_turbo_v2_5",
};

export const DEFAULT_VOICE_MODEL = VOICE_MODELS.QUALITY;

// Deliberately NOT a routing group.
//
// The six groups in the admin console exist because those calls have a real
// choice to make between providers — a group can be pointed at Anthropic, Gemini
// or OpenAI and the call still works. Voice has one provider and three models
// that differ only in a cost/quality tradeoff the operator makes per take, like
// the video tier picker. Adding a seventh group would put a dropdown in the
// console whose every option is the same vendor, and would need catalogue
// entries the test bench would then try to call as text models.
//
// When there is a second speech provider worth routing to, this becomes a group.
// Until then the model is an argument, and the honest place for the choice is
// next to the play button.

// ElevenLabs bills in credits, not dollars, and the dollar value of a credit
// depends on the plan — so this table is a PLANNING estimate for the pre-spend
// display and the ledger row, in exactly the sense VIDEO_TIERS.costPerSecond is.
//
// Derived from the Creator plan's $22 / 100,000 credits, i.e. $0.00022 a credit:
//   multilingual_v2   1 credit  per character  ->  $0.22 per 1,000 chars
//   turbo / flash     0.5       per character  ->  $0.11 per 1,000 chars
//
// On a higher plan the per-credit rate falls and every figure here overstates.
// Change CREDIT_USD alone rather than the multipliers — the credit COST per
// character is a property of the model, the dollar value of a credit is a
// property of your contract, and keeping them separate is what stops a plan
// upgrade turning into three edits and a wrong number.
export const CREDIT_USD = 0.00022;

export const CREDITS_PER_CHAR = {
  eleven_multilingual_v2: 1,
  eleven_turbo_v2_5:      0.5,
  eleven_flash_v2_5:      0.5,
};

/**
 * Estimate what one take of `text` costs, in USD. Null for a model not in the
 * table — null is visibly missing in a rollup, zero silently understates it.
 *
 * Not rounded to the cent, unlike the video estimate: a take runs a fraction of
 * a cent and rounding to cents would display every audition as $0.00, which
 * reads as free rather than as cheap.
 */
export function estimateVoiceCostUsd(text, model = DEFAULT_VOICE_MODEL) {
  const perChar = CREDITS_PER_CHAR[model];
  if (typeof perChar !== "number") return null;
  return String(text || "").length * perChar * CREDIT_USD;
}

// There is deliberately no script-flattening function here.
//
// An earlier draft of this module had one, and it was wrong in the way that
// matters most: it joined beats with newlines and appended the CTA, while
// buildVideoScript in callGenerateVideo.js prepends the hook, joins with " ... "
// and never speaks the CTA. Both were defensible in isolation. Together they
// meant the audition said different words from the render it exists to predict —
// which does not make the feature slightly inaccurate, it makes it worthless,
// because the only question an audition answers is "what will the render sound
// like".
//
// So the audition uses buildVideoScript, the render's own builder, and callers
// pass its output as `text`. One script builder, one set of words. See
// voice.test.js, which asserts the two cannot diverge.

/**
 * Read the caller's ElevenLabs voice library. Resolves to an array of
 * `{voiceId, name, category, accent, gender, preview}`.
 *
 * Not cached here. The library changes when the operator adds or clones a voice,
 * and a stale picker that cannot see a voice they just made is a worse failure
 * than one extra request per session.
 */
export async function listVoices() {
  const resp = await fetch(VOICE_PROXY_URL, {
    method: "POST",
    headers: AI_HEADERS(),
    body: JSON.stringify({ action: "voices" }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  return Array.isArray(data?.voices) ? data.voices : [];
}

/**
 * Generate one take. Resolves to `{mimeType, data, model, voiceId, characters,
 * costUsd}` where `data` is base64.
 *
 * The caller is responsible for not persisting the result — see api/voice.js.
 * Returned raw so the browser can hand it straight to an <audio> element.
 */
export async function callGenerateVoice({
  text, voiceId, model = DEFAULT_VOICE_MODEL,
  outputFormat, voiceSettings, initiativeId = null,
}) {
  // Estimated before the request so a failure still records what the attempt
  // would have cost, and so the same number can be shown pre-spend.
  const costUsd = estimateVoiceCostUsd(text, model);

  // Every exit records a row, failures included — the same reasoning
  // callGenerateImage applies. A failed take costs nothing, but attempts with no
  // cost are how an operator notices the voice key is wrong.
  let resp;
  try {
    resp = await fetch(VOICE_PROXY_URL, {
      method: "POST",
      headers: AI_HEADERS(),
      body: JSON.stringify({
        action: "speak", text, voiceId, model,
        ...(outputFormat  ? { outputFormat }  : {}),
        ...(voiceSettings ? { voiceSettings } : {}),
      }),
    });
  } catch (err) {
    recordVoiceUsage({ model, costUsd: null, characters: String(text || "").length, initiativeId, ok: false, errorKind: "network" });
    throw err;
  }

  if (!resp.ok) {
    recordVoiceUsage({ model, costUsd: null, characters: String(text || "").length, initiativeId, ok: false, errorKind: "http_" + resp.status });
    throw new Error(await proxyError(resp));
  }

  const data = await resp.json();
  if (!data || !data.data) {
    recordVoiceUsage({ model, costUsd: null, characters: String(text || "").length, initiativeId, ok: false, errorKind: "provider" });
    throw new Error("No audio was returned.");
  }

  recordVoiceUsage({ model, costUsd, characters: data.characters ?? String(text || "").length, initiativeId });
  return { ...data, costUsd };
}
