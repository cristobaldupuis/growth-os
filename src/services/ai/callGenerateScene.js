// Scene generation — the moving key frame.
//
// Sits beside callGenerateImage, not callGenerateVideo. The still and the clip
// answer the same question ("what does this hypothesis look like"); the
// talking-head render answers a different one ("what does this script sound like
// coming from a person"). That is why the prompt here is assembled from the
// brief the same way buildImagePrompt assembles one, and why the cost is a
// property of the duration you ask for rather than of a script's length.

import { AI_HEADERS, proxyError, recordSceneUsage } from "./_shared.js";
import { modelFor } from "./models.js";
import { modelById } from "./registry.js";

export const SCENE_PROXY_URL = "/api/scene";

// Kept in step with api/scene.js, which refuses anything outside them. Veo
// renders landscape and portrait only, so the 4:5 and 1:1 the image path offers
// are deliberately absent — an operator picking a ratio the model will not honour
// should find that out in the picker, not in the output.
export const SCENE_ASPECTS = [
  { id: "9:16", label: "9:16 · story / reel" },
  { id: "16:9", label: "16:9 · landscape" },
];

export const SCENE_DURATIONS = [4, 6, 8];
export const DEFAULT_SCENE_DURATION = 8;

// Generation runs 60-180s, so the browser polls, exactly as it does for a
// talking-head render. Matched to that path's cadence rather than picked afresh:
// the operator experience of waiting is the same and two intervals would be two
// things to tune.
export const SCENE_POLL_INTERVAL_MS = 8_000;
export const SCENE_POLL_TIMEOUT_MS  = 5 * 60_000;

/**
 * What one clip costs, in USD. Null when the model carries no rate — null is
 * visibly missing in a rollup, zero silently understates it.
 *
 * Read from the catalogue rather than a table of its own, so the figure shown
 * before the click, the figure logged against the asset, and the figure the
 * spend console prices the row at are all the same number. The equivalent drift
 * on the video path is guarded by importing estimateVideoCostUsd into
 * api/video.js; here there is only one source to begin with.
 */
export function estimateSceneCostUsd(model, durationSeconds = DEFAULT_SCENE_DURATION) {
  const rate = modelById(model)?.price?.perSecondUsd;
  if (typeof rate !== "number") return null;
  return Math.round(durationSeconds * rate * 100) / 100;
}

/**
 * Compose the scene prompt from an approved brief and one of its variants.
 *
 * Deliberately not buildImagePrompt with a motion clause bolted on. That
 * function's opening line is "Single still image" and its direction is composed
 * for a frame that will be held; a clip needs a beat that resolves inside eight
 * seconds, and asking one prompt builder to serve both would make each worse in
 * the places they differ. What IS shared is the part that must never drift — the
 * two constraints below — and scene.test.js asserts them here independently
 * rather than trusting the resemblance.
 *
 *   1. No rendered text. Generative models mangle typography, and any words they
 *      invent become an unreviewed product claim on an asset that looks finished.
 *   2. Nothing from `claimsToVerify`. Those are precisely the statements the
 *      brief flagged as unsupported by the brand brief; putting one on screen
 *      launders an open question into something that looks settled.
 *
 * Note the third constraint lives in api/scene.js rather than here, because it
 * is not a prompt matter: `generateAudio` is forced off, so the model cannot
 * invent spoken dialogue nobody wrote or reviewed.
 */
export function buildScenePrompt(brief, variant, brand, opts = {}) {
  const seconds = opts.durationSeconds || DEFAULT_SCENE_DURATION;
  const lines = [
    `Photorealistic advertising scene for a direct-to-consumer brand. One continuous ${seconds}-second shot.`,
    "",
    "THE MOMENT — this is the opening beat of the ad, in motion:",
    "  " + (variant.openingBeat || variant.hook || "the product in use"),
    "",
    "WHAT THE VIEWER SHOULD FEEL: " + (brief.promise || "confidence in the product"),
    "GROUNDED IN: " + (brief.insight || "everyday use of the product"),
  ];

  if (brand?.whatTheySell) lines.push("PRODUCT CONTEXT: " + brand.whatTheySell);
  if (brand?.icp)          lines.push("WHO IT IS FOR: " + brand.icp);
  if ((brief.proof || []).length) lines.push("VISIBLE PROOF: " + brief.proof.join("; "));
  if (variant.varies)      lines.push("THIS VARIANT EMPHASISES: " + variant.varies);

  // The clause that makes this a clip rather than a slideshow. Left unsaid, these
  // models default to a drifting push-in on a static subject, which reads as
  // stock footage — the failure mode is not ugliness, it is genericness, and
  // generic motion is worse than a good still.
  lines.push(
    "",
    "CAMERA AND MOTION: one unbroken take, no cuts. The movement should come from the",
    "subject and the action rather than from a roaming camera. Hold the frame long",
    "enough to read.",
    "",
    "HARD CONSTRAINTS:",
    "  - No on-screen text, captions, logos, watermarks or lettering of any kind.",
    "  - No spoken dialogue and no voiceover.",
  );

  // The claims the brief could not support. Named explicitly rather than merely
  // omitted: a model given the surrounding context will otherwise reach for the
  // obvious visual metaphor, which is frequently the unsupported claim itself.
  const unverified = brief.claimsToVerify || [];
  if (unverified.length) {
    lines.push("  - Do not depict, imply or visually suggest any of: " + unverified.join("; ") + ".");
  }

  return lines.join("\n");
}

/**
 * Submit one scene. Resolves to `{operationName, model, estimatedCostUsd}` —
 * never to a finished clip. The caller polls pollSceneJob.
 *
 * Recorded at SUBMIT, not at completion, for the reason recordVideoUsage already
 * documents: a submitted generation is billed whether or not anyone waits for
 * it, so recording on success would understate spend by exactly the jobs that
 * went wrong.
 */
export async function callGenerateScene({
  prompt, model, aspectRatio = "9:16",
  durationSeconds = DEFAULT_SCENE_DURATION, resolution, initiativeId = null,
}) {
  // Left undefined, the model resolves through the `scene` group's routing rather
  // than a literal here, so repointing scene generation in the admin console
  // reaches this call without an edit.
  const resolved = modelFor("scene", model);
  const estimatedCostUsd = estimateSceneCostUsd(resolved, durationSeconds);

  let resp;
  try {
    resp = await fetch(SCENE_PROXY_URL, {
      method: "POST",
      headers: AI_HEADERS(),
      body: JSON.stringify({
        action: "submit", model: resolved, prompt, aspectRatio, durationSeconds,
        ...(resolution ? { resolution } : {}),
      }),
    });
  } catch (err) {
    recordSceneUsage({ model: resolved, costUsd: null, initiativeId, ok: false, errorKind: "network" });
    throw err;
  }

  if (!resp.ok) {
    recordSceneUsage({ model: resolved, costUsd: null, initiativeId, ok: false, errorKind: "http_" + resp.status });
    throw new Error(await proxyError(resp));
  }

  const data = await resp.json();
  if (!data?.operationName) {
    recordSceneUsage({ model: resolved, costUsd: null, initiativeId, ok: false, errorKind: "provider" });
    throw new Error("No job was returned.");
  }

  recordSceneUsage({ model: resolved, costUsd: estimatedCostUsd, initiativeId });
  return { operationName: data.operationName, model: resolved, estimatedCostUsd };
}

/**
 * Read a submitted job. Resolves to `{status}` where status is "running",
 * "failed" or "done"; a done result carries `mimeType` plus either base64 `data`
 * or a `gcsUri`.
 *
 * A failed render resolves rather than throws. The distinction matters to the
 * caller: the job died and the money is spent, which is not the same event as
 * the poll itself failing, and only the second is worth retrying.
 */
export async function pollSceneJob({ operationName, model }) {
  const resp = await fetch(SCENE_PROXY_URL, {
    method: "POST",
    headers: AI_HEADERS(),
    body: JSON.stringify({ action: "poll", model, operationName }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  return resp.json();
}
