import { AI_HEADERS, proxyError } from "./_shared.js";
import { modelFor } from "./models.js";

export const IMAGE_PROXY_URL = "/api/image";

// Named aliases, kept because CreativeStudio reads IMAGE_MODELS.FAST directly and
// the names carry the cost distinction better than the raw IDs do. They are the
// two ends of the range rather than the routing decision — what actually ships is
// whatever the `image` group is pointed at, which defaults to FAST.
export const IMAGE_MODELS = {
  /** "Nano Banana" — fast, cheap, the default for concepting. */
  FAST: "gemini-2.5-flash-image",
  /** "Nano Banana Pro" — slower and dearer; for a frame that will be shown. */
  PRO:  "gemini-3-pro-image-preview",
};

// Aspect ratios that match how the asset will actually run, rather than every
// ratio the API accepts. A 16:9 key frame for a Reels variant is a wasted
// generation, so the list is scoped to placements this app briefs for.
export const IMAGE_ASPECTS = [
  { id:"4:5",  label:"4:5 · feed" },
  { id:"9:16", label:"9:16 · story / reel" },
  { id:"1:1",  label:"1:1 · square" },
  { id:"16:9", label:"16:9 · landscape" },
];

/**
 * Compose the image prompt from an approved brief and one of its variants.
 *
 * This is the part that earns its keep. A free-text box into an image model is
 * a toy; the value here is that the prompt is assembled from work already
 * reviewed — the brief's insight, promise and proof, the variant's opening
 * beat, and the brand's own positioning — so the frame is an execution of a
 * hypothesis rather than a nice picture.
 *
 * Two constraints are non-negotiable and are stated to the model directly:
 *
 *   1. No rendered text. Image models mangle typography, and worse, any words
 *      they invent become an unreviewed product claim on an asset that looks
 *      finished. Copy belongs in the ad tool where it can be checked.
 *   2. Nothing from `claimsToVerify`. Those are precisely the statements the
 *      brief flagged as unsupported by the brand brief; rendering one as a
 *      visual would launder an open question into something that looks settled.
 *
 * Exported separately from the call so it can be shown to the operator before
 * they spend money on it, and asserted in tests without a network round trip.
 */
export function buildImagePrompt(brief, variant, brand, opts = {}) {
  const refCount = opts.referenceCount || 0;
  const lines = [
    "Photorealistic advertising key frame for a direct-to-consumer brand. Single still image.",
    "",
    "SCENE — this is the opening moment of the ad, shot as one frame:",
    "  " + (variant.openingBeat || variant.hook || "the product in use"),
    "",
    "WHAT THE VIEWER SHOULD FEEL: " + (brief.promise || "confidence in the product"),
    "GROUNDED IN: " + (brief.insight || "everyday use of the product"),
  ];

  if (brand?.whatTheySell) lines.push("PRODUCT CONTEXT: " + brand.whatTheySell);
  if (brand?.icp)          lines.push("WHO IT IS FOR: " + brand.icp);
  if ((brief.proof || []).length) lines.push("VISIBLE PROOF: " + brief.proof.join("; "));
  if (variant.varies)      lines.push("THIS VARIANT EMPHASISES: " + variant.varies);

  // When references are attached, the prompt must say what to take from them.
  // Left unsaid, the model treats leading images as things to reproduce and
  // returns a near-copy of the reference rather than a new scene in its style —
  // which is worse than no reference at all, because it looks deliberate.
  if (refCount > 0) {
    lines.push(
      "",
      `STYLE REFERENCE: ${refCount} reference image${refCount === 1 ? " is" : "s are"} attached above. ` +
      "Match their lighting, colour grade, framing and overall visual language so this frame reads as part of the same campaign. " +
      "Do NOT reproduce their composition or subject matter — this is a new scene in the same house style."
    );
  }

  lines.push(
    "",
    refCount > 0
      ? "STYLE: follow the attached references. Where they are silent, default to naturalistic lighting, a believable real-world setting, shallow depth of field, no studio sterility and no stock-photo posing."
      : "STYLE: naturalistic lighting, believable domestic or real-world setting, shallow depth of field, no studio sterility, no stock-photo posing.",
    "",
    "HARD CONSTRAINTS:",
    "  • No text, words, letters, numbers, logos, watermarks or packaging copy anywhere in the image.",
    "  • No user-interface elements, no phone screens showing content, no infographic overlays.",
    "  • Do not depict results, before/after states, or any health, performance or outcome claim."
  );

  if ((brief.claimsToVerify || []).length) {
    lines.push("  • Do not visually imply any of the following, which are unverified: " + brief.claimsToVerify.join("; ") + ".");
  }

  return lines.join("\n");
}

/**
 * Generate one image. Resolves to `{ mimeType, data }` where `data` is base64.
 *
 * The caller is responsible for not persisting the result — see the note in
 * api/image.js and DECISIONS.md. This function deliberately returns the raw
 * payload rather than writing it anywhere.
 */
export async function callGenerateImage({ prompt, aspectRatio = "4:5", model, referenceImages }) {
  // `model` left undefined resolves through the `image` group's routing rather
  // than defaulting to a literal here, so repointing image generation in the admin
  // console reaches this call without an edit. An explicit `model` still wins —
  // CreativeStudio passes IMAGE_MODELS.FAST for the concepting path, and the test
  // bench passes whichever model it is comparing.
  const resolved = modelFor("image", model);
  const resp = await fetch(IMAGE_PROXY_URL, {
    method: "POST",
    headers: AI_HEADERS(),
    body: JSON.stringify({
      model: resolved, prompt, aspectRatio, count: 1,
      ...(referenceImages?.length ? { referenceImages } : {}),
    }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  if (!data || !data.data) throw new Error("No image was returned.");
  return { ...data, model: resolved };
}
