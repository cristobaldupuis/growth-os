import { AI_HEADERS, proxyError } from "./_shared.js";

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
//   2. PROVIDER-SWAPPABLE. Unlike image generation, there is no single clear
//      quality/price leader here — HeyGen, D-ID and VEED Fabric trade off
//      speed, cost and realism differently, and that ranking is expected to
//      shift as the field moves. The provider is a parameter, not a constant,
//      so the operator can A/B a real script across providers before
//      committing spend to one, and swapping later is a config change, not a
//      rewrite. See DECISIONS.md — "creative production" forcing condition.
//
// What does NOT change from the image module: the prompt is still assembled
// from an approved brief (insight, promise, proof) and a variant's own script,
// still excludes anything in claimsToVerify, and the result is still never
// written to browser storage — video is a far bigger localStorage risk than a
// base64 PNG, so this constraint matters more here, not less. See api/video.js.

export const VIDEO_PROXY_URL = "/api/video";

// One entry per supported provider. `costPerSecond` is a planning estimate for
// the pre-spend cost display, not billed by this app — actual billing happens
// on the provider's own account. Re-check these when providers change pricing;
// treat them as approximate, not contractual.
export const VIDEO_PROVIDERS = {
  HEYGEN: { id: "heygen", label: "HeyGen (Avatar III)", costPerSecond: 0.10, minAvatarSlots: null },
  DID:    { id: "did",    label: "D-ID",                costPerSecond: 0.07, minAvatarSlots: null },
  FABRIC: { id: "fabric", label: "VEED Fabric 1.0",     costPerSecond: 0.15, minAvatarSlots: null },
};

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

/**
 * Submit a video render job. Resolves to `{jobId, provider, estimatedCostUsd}`
 * — never to a finished video. The caller polls pollVideoJob for status.
 *
 * estimatedCostUsd is computed from the submitted script's spoken length and
 * the provider's per-second rate — shown to the operator at submit time, not
 * a substitute for checking the provider's own billing.
 */
export async function callGenerateVideo({ script, cta, avatarId, voiceId, aspectRatio = "9:16", provider = VIDEO_PROVIDERS.HEYGEN.id }) {
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
