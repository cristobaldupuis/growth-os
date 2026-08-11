// Image generation: request shape and prompt construction.
//
// Like requests.test.js, this asserts against the REAL validator exported from
// api/image.js rather than a copy, so the client and the endpoint cannot drift
// apart silently.
//
// Run with: node --test src/services/ai/image.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateImageBody, buildGeminiBody, extractImage,
  ALLOWED_IMAGE_MODELS, ALLOWED_ASPECTS, MAX_PROMPT_CHARS,
  MAX_REFERENCE_IMAGES, ALLOWED_REFERENCE_MIME,
} from "../../../api/image.js";
import { buildImagePrompt, callGenerateImage, IMAGE_MODELS, IMAGE_ASPECTS } from "./callGenerateImage.js";

const BRIEF = {
  insight: "Buyers distrust before-and-after imagery because they have been burned.",
  promise: "See it used unedited.",
  proof: ["single unbroken take", "no post-production"],
  claimsToVerify: ["clinically proven", "30% faster results"],
  angles: [{ slug:"TimeSaver", label:"Time saver", theory:"They buy back minutes.", execution:"Handheld.", openingBeat:"Presenter checks the clock." }],
};
const VARIANT = {
  angleSlug:"TimeSaver", label:"Clock open", varies:"the hook",
  hook:"You have four minutes.", openingBeat:"Presenter glances at a wall clock, mid-kitchen.",
  script:["beat one","beat two"], cta:"Shop now",
};
const BRAND = { name:"Test Brand", whatTheySell:"Protein pastries, $20-40 AOV", icp:"Gym-goers 25-40" };

// -- The client and the endpoint agree ----------------------------------------

test("every model the client can select is allowed by the endpoint", () => {
  Object.values(IMAGE_MODELS).forEach(m =>
    assert.ok(ALLOWED_IMAGE_MODELS.has(m), `${m} is not in the endpoint allowlist`));
});

test("every aspect ratio the UI offers is allowed by the endpoint", () => {
  IMAGE_ASPECTS.forEach(a =>
    assert.ok(ALLOWED_ASPECTS.has(a.id), `${a.id} is not in the endpoint allowlist`));
});

test("the client's request body passes the real validator", async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok:true, status:200, json: async () => ({ mimeType:"image/png", data:"abc" }) };
  };
  try {
    await callGenerateImage({ prompt: buildImagePrompt(BRIEF, VARIANT, BRAND), aspectRatio:"4:5" });
  } finally { globalThis.fetch = realFetch; }

  assert.ok(sent, "no request was made");
  assert.equal(validateImageBody(sent), null, "the endpoint would reject the client's own request");
});

// -- Bounds --------------------------------------------------------------------

test("an unknown model is rejected", () => {
  assert.match(validateImageBody({ model:"dall-e-3", prompt:"x" }), /Unsupported image model/);
});

test("an empty or missing prompt is rejected", () => {
  const m = IMAGE_MODELS.FAST;
  assert.match(validateImageBody({ model:m }), /non-empty string/);
  assert.match(validateImageBody({ model:m, prompt:"   " }), /non-empty string/);
});

test("an oversized prompt is rejected", () => {
  const body = { model:IMAGE_MODELS.FAST, prompt:"x".repeat(MAX_PROMPT_CHARS + 1) };
  assert.match(validateImageBody(body), /exceeds the \d+ character cap/);
});

// Count is the only real cost control on an image endpoint — there is no token
// ceiling to lean on — so a request must not be able to ask for a batch.
test("a request cannot ask for more than one image", () => {
  assert.match(validateImageBody({ model:IMAGE_MODELS.FAST, prompt:"x", count:8 }), /Only one image per request/);
  assert.equal(validateImageBody({ model:IMAGE_MODELS.FAST, prompt:"x", count:1 }), null);
});

test("an unsupported aspect ratio is rejected", () => {
  assert.match(validateImageBody({ model:IMAGE_MODELS.FAST, prompt:"x", aspectRatio:"21:9" }), /Unsupported aspect ratio/);
});

// -- Upstream body -------------------------------------------------------------

test("the upstream body asks for both modalities", () => {
  // Gemini image models always return a text part alongside the image; asking
  // for IMAGE alone is rejected upstream.
  const body = buildGeminiBody({ prompt:"a frame", aspectRatio:"4:5" });
  assert.deepEqual(body.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
  assert.equal(body.generationConfig.candidateCount, 1);
  assert.equal(body.generationConfig.imageConfig.aspectRatio, "4:5");
  assert.equal(body.contents[0].parts[0].text, "a frame");
});

// -- Reference images ----------------------------------------------------------

const REF = { mimeType: "image/png", data: "aGVsbG8=" };

test("reference images are optional and absent by default", () => {
  const body = buildGeminiBody({ prompt: "a frame" });
  assert.equal(body.contents[0].parts.length, 1);
  assert.equal(body.contents[0].parts[0].text, "a frame");
});

test("reference parts precede the text so they read as context, not afterthought", () => {
  const body = buildGeminiBody({ prompt: "a frame", referenceImages: [REF, REF] });
  const parts = body.contents[0].parts;
  assert.equal(parts.length, 3);
  assert.equal(parts[0].inlineData.mimeType, "image/png");
  assert.equal(parts[1].inlineData.data, "aGVsbG8=");
  assert.equal(parts[2].text, "a frame", "the instruction comes last");
});

test("the reference count is capped, because each one is billed on every generation", () => {
  const many = Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, () => REF);
  assert.match(validateImageBody({ model: IMAGE_MODELS.FAST, prompt: "x", referenceImages: many }),
    /At most \d+ reference images/);
  const ok = Array.from({ length: MAX_REFERENCE_IMAGES }, () => REF);
  assert.equal(validateImageBody({ model: IMAGE_MODELS.FAST, prompt: "x", referenceImages: ok }), null);
});

test("a malformed reference is refused rather than skipped", () => {
  const m = IMAGE_MODELS.FAST;
  assert.match(validateImageBody({ model: m, prompt: "x", referenceImages: "nope" }), /must be an array/);
  assert.match(validateImageBody({ model: m, prompt: "x", referenceImages: [null] }), /must be an object/);
  assert.match(validateImageBody({ model: m, prompt: "x", referenceImages: [{ mimeType: "image/gif", data: "x" }] }), /Unsupported reference image type/);
  assert.match(validateImageBody({ model: m, prompt: "x", referenceImages: [{ mimeType: "image/png" }] }), /base64/);
  assert.ok(!ALLOWED_REFERENCE_MIME.has("image/gif"));
});

test("the prompt tells the model what to take from a reference and what not to", () => {
  // Left unsaid, leading images read as something to reproduce and the model
  // returns a near-copy of the reference rather than a new scene in its style.
  const withRefs = buildImagePrompt(BRIEF, VARIANT, BRAND, { referenceCount: 2 });
  assert.match(withRefs, /2 reference images are attached/);
  assert.match(withRefs, /Do NOT reproduce their composition/);

  const without = buildImagePrompt(BRIEF, VARIANT, BRAND);
  assert.ok(!/reference image/i.test(without), "no reference language when none are attached");
});

test("reference images do not weaken the no-text and unverified-claim constraints", () => {
  const p = buildImagePrompt(BRIEF, VARIANT, BRAND, { referenceCount: 1 });
  assert.match(p, /No text, words, letters/);
  BRIEF.claimsToVerify.forEach(claim => assert.ok(p.includes(claim), `unverified claim still excluded: ${claim}`));
});

test("the endpoint builds the upstream body itself, ignoring caller extras", () => {
  const body = buildGeminiBody({ prompt:"a frame", aspectRatio:"1:1", tools:[{ evil:true }], candidateCount:9 });
  assert.equal(body.tools, undefined, "caller-supplied tools must not reach the provider");
  assert.equal(body.generationConfig.candidateCount, 1, "caller cannot multiply the bill");
});

test("extractImage finds the inline image and tolerates a leading text part", () => {
  const img = extractImage({ candidates:[{ content:{ parts:[
    { text:"Here is your image." },
    { inlineData:{ mimeType:"image/png", data:"BASE64" } },
  ]}}]});
  assert.deepEqual(img, { mimeType:"image/png", data:"BASE64" });
});

test("extractImage returns null when the model returned no image", () => {
  assert.equal(extractImage({ candidates:[{ content:{ parts:[{ text:"refused" }] }, finishReason:"SAFETY" }] }), null);
  assert.equal(extractImage({}), null);
});

// -- The prompt ----------------------------------------------------------------
//
// The prompt is the product here. These assert the two constraints that stop a
// generated frame becoming an unreviewed claim.

test("the prompt is built from the brief, not from free text", () => {
  const p = buildImagePrompt(BRIEF, VARIANT, BRAND);
  assert.ok(p.includes(VARIANT.openingBeat), "the variant's opening beat is the scene");
  assert.ok(p.includes(BRIEF.promise));
  assert.ok(p.includes(BRIEF.insight));
  assert.ok(p.includes(BRAND.whatTheySell));
  assert.ok(p.includes("single unbroken take"), "brief proof points carry through");
});

test("the prompt forbids rendered text", () => {
  const p = buildImagePrompt(BRIEF, VARIANT, BRAND);
  assert.match(p, /No text, words, letters, numbers, logos/);
});

// The highest-risk failure of AI creative: laundering an open question into
// something that looks settled because it was drawn convincingly.
test("unverified claims are named and excluded rather than silently dropped", () => {
  const p = buildImagePrompt(BRIEF, VARIANT, BRAND);
  assert.match(p, /which are unverified/);
  BRIEF.claimsToVerify.forEach(c => assert.ok(p.includes(c), `"${c}" must be named as excluded`));
});

test("a brief with no unverified claims omits that constraint cleanly", () => {
  const p = buildImagePrompt({ ...BRIEF, claimsToVerify: [] }, VARIANT, BRAND);
  assert.ok(!p.includes("which are unverified"));
  assert.match(p, /No text, words/, "the other constraints still apply");
});

test("the prompt stays within the endpoint's character cap for a realistic brief", () => {
  const p = buildImagePrompt(BRIEF, VARIANT, BRAND);
  assert.ok(p.length <= MAX_PROMPT_CHARS, `prompt was ${p.length} chars`);
  assert.equal(validateImageBody({ model:IMAGE_MODELS.FAST, prompt:p, aspectRatio:"4:5", count:1 }), null);
});

test("a missing brand or sparse variant still yields a usable prompt", () => {
  const p = buildImagePrompt({ promise:"x" }, { label:"v" }, null);
  assert.ok(p.length > 0);
  assert.match(p, /the product in use/, "falls back rather than emitting an empty scene");
});
