import { AI_HEADERS, proxyError } from "./_shared.js";
import { modelFor } from "./models.js";

// -- Video generation (talking-head avatar) ------------------------------------
//
// The video sibling of callGenerateImage.js. Same job — turn an approved brief
// and one of its variants into a spendable generation prompt, inspectable
// before it costs money — with two structural differences forced by the medium:
//
//   1. ASYNC. Every avatar provider (HeyGen, D-ID, Fabric) renders as a
//      background job: submit, get a job id, poll until done. There is no
//      synchronous request/response the way Gemini image generation has.
//      callGenerateVideo therefore returns a job handle, and the caller polls
//      pollVideoJob until it resolves — it does not block until a video exists.
//
//   2. PRICED BY THE SECOND, ACROSS PROVIDERS. An image is one fixed unit of
//      spend; a video's cost is set by how long the script takes to say, and
//      the per-second rate differs by roughly 9x between the cheapest usable
//      provider and the best-looking one. So the tier is a parameter — see
//      VIDEO_TIERS — and the estimated cost of both tiers is computed before
//      submit rather than discovered on the provider's invoice. Swapping the
//      provider behind a tier stays a config change, not a rewrite.
//      See DECISIONS.md — "creative production" forcing condition.
//
// What does NOT change from the image module: the prompt is still assembled
// from an approved brief (insight, promise, proof) and a variant's own script,
// still excludes anything in claimsToVerify, and the result is still never
// written to browser storage — video is a far bigger localStorage risk than a
// base64 PNG, so this constraint matters more here, not less. See api/video.js.

export const VIDEO_PROXY_URL = "/api/video";

// Two tiers, not three providers — the same shape as IMAGE_MODELS.FAST/.PRO.
//
// The earlier draft of this module exposed HeyGen / D-ID / VEED as the primary
// selector, on the theory that the operator would want to A/B providers. That
// was the wrong unit of choice. What an operator actually decides at the moment
// of spend is "is this clip worth nine times the money", not "do I prefer
// D-ID's lip-sync model". Naming the tiers after the decision keeps the picker
// answerable; the provider stays underneath as `provider`, which is still what
// goes over the wire and still what api/video.js's adapter map keys on.
//
// `costPerSecond` is a planning estimate for the pre-spend display, not billed
// by this app — real billing happens on the provider's own account. Re-check
// these when providers change pricing; treat them as approximate.
//
// Rates verified August 2026:
//   HeyGen Avatar III digital twin  ~$0.0167/sec (~$1/min) via the API credit rate
//   VEED Fabric 1.0 720p             $0.15/sec on fal.ai (480p is $0.08)
export const VIDEO_TIERS = {
  /** Cheapest viable talking-head render. The default for testing a script. */
  STANDARD: {
    id: "standard",
    provider: "heygen",
    label: "Standard · HeyGen",
    costPerSecond: 0.017,
    blurb: "Stock or cloned avatar, script read straight. Fine for reading a hook back before anyone shoots.",
  },
  /** Best current lip-sync realism, and roughly nine times the price. */
  PREMIUM: {
    id: "premium",
    provider: "fabric",
    label: "Premium · VEED Fabric 1.0",
    costPerSecond: 0.15,
    blurb: "Photoreal lip-sync from a still. For a clip that will actually be shown to someone.",
  },
};

// D-ID stays implemented in api/video.js but is deliberately not a tier. At
// current pricing it lands around $0.035/sec — above HeyGen without being
// visibly better — so surfacing it would add a third option that no operator
// has a reason to pick. It remains in the adapter map so re-promoting it is a
// one-line change here if that pricing relationship inverts again.
export const VIDEO_TIER_LIST = Object.entries(VIDEO_TIERS).map(([key, tier]) => ({ key, ...tier }));

/**
 * The tier that renders on `provider`, or null. Mirrors `tierForProvider` in
 * api/video.js — D-ID is reachable but is not a named tier, so this can miss.
 */
export const tierForProvider = (provider) =>
  Object.values(VIDEO_TIERS).find(t => t.provider === provider) || null;

// Note the tier asymmetry: HeyGen renders to the dimensions it is given, but
// Fabric animates a still and inherits that image's aspect, so on PREMIUM this
// is a request the provider may not honour. Kept in the shared list rather than
// hidden per-tier because the operator is choosing a placement either way, and
// a placement that the render does not match is worth seeing.
export const VIDEO_ASPECTS = [
  { id: "9:16", label: "9:16 · story / reel" },
  { id: "4:5",  label: "4:5 · feed" },
  { id: "1:1",  label: "1:1 · square" },
  { id: "16:9", label: "16:9 · landscape" },
];

// A variant's script is a beat list (3-5 short lines), not a single paragraph.
// Avatar providers take one continuous line of dialogue, so the beats are
// joined with natural pauses. This is exported separately from the call, same
// reasoning as buildImagePrompt: it is what should be shown to the operator
// before they spend real per-second money on a render.
export function buildVideoScript(variant) {
  const beats = Array.isArray(variant.script) ? variant.script : [];
  const hook = (variant.hook || "").trim();
  const lines = hook ? [hook, ...beats] : beats;
  return lines.map(l => l.trim()).filter(Boolean).join(" ... ");
}

/**
 * Compose the full video generation request. Returns `{script, notes}` rather
 * than a provider-specific body — api/video.js does the provider translation,
 * the same split naming.js keeps between dimension values and an assembled
 * name. This function's only job is deciding WHAT gets said and flagging what
 * must not be, not how any one provider's API wants it shaped.
 *
 * Two constraints carried over from buildImagePrompt, non-negotiable for the
 * same reasons:
 *   1. Nothing from claimsToVerify reaches the script. An avatar saying an
 *      unverified claim out loud is a worse laundering of it than a static
 *      image implying it visually — spoken claims read as more authoritative,
 *      not less.
 *   2. The script is exactly the variant's own reviewed words. This function
 *      does not rewrite, embellish or "improve" delivery — that would mean
 *      generating spend against text nobody approved.
 */
export function buildVideoRequest(brief, variant, brand) {
  const script = buildVideoScript(variant);
  const claims = brief?.claimsToVerify || [];
  const flagged = claims.filter(c =>
    claims.length && script.toLowerCase().includes(String(c).toLowerCase().slice(0, 24))
  );
  return {
    script,
    cta: variant.cta || "",
    aspectRatio: null, // set by caller from UI selection
    notes: {
      brand: brand?.name || null,
      angleSlug: variant.angleSlug || null,
      varies: variant.varies || null,
      // Surfaced, not enforced here — the operator reviews before submit. The
      // hard enforcement is that this function never pulls claimsToVerify
      // text INTO the script; this flag only catches the case where the
      // model's own script happened to restate one anyway.
      possibleUnverifiedOverlap: flagged.length > 0 ? flagged : null,
    },
  };
}

// -- Cost estimation -----------------------------------------------------------
//
// Every provider here bills per second of *output* video, and the output length
// is set by how long the script takes to say. So the script is the price, and
// the price is knowable before submitting — which is the only reason a tier
// picker is worth having. A picker that showed two names without two numbers
// would be asking the operator to choose blind.
//
// 150 wpm is the middle of the range for scripted single-presenter delivery
// (conversational speech runs 120-160; ad reads sit at the faster end but the
// pauses below claw that back). It is deliberately a round mid-range number
// rather than a false-precision one: this estimate exists to tell $0.30 apart
// from $3.00, not to predict the invoice to the cent.
export const SPOKEN_WORDS_PER_MINUTE = 150;

// buildVideoScript joins beats with " ... ". Those are not spoken but they are
// performed — every provider's TTS renders an ellipsis as a beat of silence,
// and silence is billed the same as speech. Counting them matters more than it
// looks: a 5-beat script carries ~2s of pause, which at the premium rate is 30
// cents of pure hesitation.
export const BEAT_PAUSE_SECONDS = 0.45;

// No provider returns a clip shorter than a couple of seconds — there is head
// and tail padding around the speech, and it is real output time. Without a
// floor, a three-word hook estimates at 1.2s and reads as free when it is not.
export const MIN_RENDER_SECONDS = 3;

/**
 * Estimate how long a script will take to say, in seconds.
 *
 * Takes the assembled script string (what buildVideoScript returns and what is
 * actually submitted), not the variant, so the estimate is measured against the
 * exact text being bought rather than a reconstruction of it.
 */
export function estimateSpokenSeconds(script) {
  const text = String(script || "").trim();
  if (!text) return 0;
  const pauses = (text.match(/\.\.\./g) || []).length;
  const words = text.replace(/\.\.\./g, " ").split(/\s+/).filter(Boolean).length;
  const spoken = (words / SPOKEN_WORDS_PER_MINUTE) * 60;
  return Math.max(MIN_RENDER_SECONDS, spoken + pauses * BEAT_PAUSE_SECONDS);
}

/**
 * Estimate what one render of `script` costs at `tier`, in whole US cents.
 *
 * Rounded to the cent because that is the resolution the decision is made at,
 * and because carrying float noise into a UI label invites someone to read it
 * as a quote. It is not a quote — see the note on costPerSecond above.
 */
export function estimateVideoCostUsd(script, tier = VIDEO_TIERS.STANDARD) {
  const seconds = estimateSpokenSeconds(script);
  return Math.round(seconds * tier.costPerSecond * 100) / 100;
}

/**
 * Submit a video render job. Resolves to `{jobId, provider, estimatedCostUsd}`
 * — never to a finished video. The caller polls pollVideoJob for status.
 *
 * `tier` is a VIDEO_TIERS entry, not a provider id. The provider id is derived
 * here so that exactly one place in the client knows the mapping, and so the
 * wire contract with api/video.js stays what it already was.
 *
 * ## How this interacts with the `video` routing group
 *
 * Video is the one group where the product deliberately puts the choice in front
 * of the operator at the moment of spend — the tier picker in CreativeStudio asks
 * "is this clip worth nine times the money", which is a per-render judgement, not
 * a deployment setting. So an explicit `tier` always wins, and the routing group
 * only decides the default for a caller that does not pick one (the admin test
 * bench, and any future caller that has no operator in the loop). Worth being
 * clear about rather than presenting the console's video knob as more authoritative
 * than it is.
 *
 * estimatedCostUsd comes back from the proxy, which computes it with this same
 * module's estimator — one formula, so the number the operator was shown before
 * clicking cannot drift from the number recorded against the submitted job.
 */
export async function callGenerateVideo({ script, cta, avatarId, voiceId, aspectRatio = "9:16", tier }) {
  // No tier from the caller: fall back to whatever the `video` group is routed to,
  // then to STANDARD if that provider has no named tier (D-ID).
  const provider = tier ? tier.provider : modelFor("video");
  const resp = await fetch(VIDEO_PROXY_URL, {
    method: "POST",
    headers: AI_HEADERS(),
    body: JSON.stringify({ action: "submit", provider, script, cta, avatarId, voiceId, aspectRatio }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  if (!data || !data.jobId) throw new Error("No job was returned.");
  return data;
}

/**
 * Poll one job once. Resolves to one of:
 *   { status: "processing" }
 *   { status: "done", url, durationSeconds }   — url is a short-lived provider
 *                                                 link; see api/video.js for
 *                                                 why this app never re-hosts it
 *   { status: "failed", error }
 *
 * Deliberately a single poll, not a built-in loop with a timer — the caller
 * (CreativeStudio) owns the polling cadence and needs to reflect "still
 * rendering" in the UI between calls rather than block on a promise that could
 * run for minutes. See VIDEO_POLL_INTERVAL_MS below for the suggested cadence.
 */
export async function pollVideoJob({ jobId, provider }) {
  const resp = await fetch(VIDEO_PROXY_URL, {
    method: "POST",
    headers: AI_HEADERS(),
    body: JSON.stringify({ action: "poll", provider, jobId }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  return resp.json();
}

// Generation runs 60-170s across tested providers (see DECISIONS.md). Polling
// faster than this just burns proxy rate-limit budget without new information;
// polling much slower makes the UI feel stalled.
export const VIDEO_POLL_INTERVAL_MS = 8000;
export const VIDEO_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — beyond this, surface a "still processing" state rather than erroring, since a slow render is not a failed one.
