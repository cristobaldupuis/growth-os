// Scene generation: the selector's separation, request shape, bounds, and the
// constraints that must not leak into a generated asset.
//
// Asserts against the REAL validator exported from api/scene.js rather than a
// copy, so the client and the endpoint cannot drift — same convention as
// image.test.js and voice.test.js.
//
// Run with: node --test src/services/ai/scene.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateSceneBody, validateScenePollBody, buildVeoBody, extractVideo,
  ALLOWED_SCENE_MODELS, ALLOWED_ASPECTS, ALLOWED_DURATIONS, MAX_PROMPT_CHARS,
} from "../../../api/scene.js";
import {
  callGenerateScene, pollSceneJob, buildScenePrompt, estimateSceneCostUsd,
  SCENE_ASPECTS, SCENE_DURATIONS, DEFAULT_SCENE_DURATION,
} from "./callGenerateScene.js";
import {
  modelsFor, validateRouting, DEFAULT_ROUTING, SCENE_MODEL_IDS, modelById,
} from "./registry.js";

const BRIEF = {
  insight: "Buyers distrust before-and-after imagery because they have been burned.",
  promise: "See it used unedited.",
  proof: ["single unbroken take", "no post-production"],
  claimsToVerify: ["clinically proven", "30% faster results"],
};
const VARIANT = {
  label: "Clock open", varies: "the hook",
  hook: "You have four minutes.",
  openingBeat: "Presenter glances at a wall clock, mid-kitchen.",
};
const BRAND = { name: "Test Brand", whatTheySell: "Protein pastries, $20-40 AOV", icp: "Gym-goers 25-40" };

const SCENE_MODEL = DEFAULT_ROUTING.scene;

// -- The selector separates two jobs that share a modality ---------------------
//
// This is the guard on the whole design. Both kinds of model are `modality:
// "video"`, so without the caps distinction the console would offer a lip-sync
// renderer for scene generation and a scene generator for a talking head, and
// each would fail at its first submit with an opaque provider error.

test("the scene group offers only scene generators", () => {
  const offered = modelsFor("scene");
  assert.ok(offered.length > 0, "the scene picker is empty");
  offered.forEach(m => assert.equal(m.caps?.sceneGen, true, `${m.id} cannot generate a scene`));
});

test("the video group offers only lip-sync renderers", () => {
  const offered = modelsFor("video");
  assert.ok(offered.length > 0, "the video picker is empty");
  offered.forEach(m => assert.equal(m.caps?.lipSync, true, `${m.id} cannot lip-sync a script`));
});

test("the two pickers do not overlap", () => {
  const scene = new Set(modelsFor("scene").map(m => m.id));
  modelsFor("video").forEach(m =>
    assert.ok(!scene.has(m.id), `${m.id} is offered for both scene and talking-head generation`));
});

test("routing a scene model to the video group is rejected, and vice versa", () => {
  assert.match(validateRouting({ video: SCENE_MODEL }), /cannot serve Video Generation — missing: lipSync/);
  assert.match(validateRouting({ scene: "heygen" }),    /cannot serve Scene Generation — missing: sceneGen/);
});

test("the shipped default routing is valid", () => {
  assert.equal(validateRouting(DEFAULT_ROUTING), null);
});

// -- The client and the endpoint agree ----------------------------------------

test("every scene model the console can select is callable by the endpoint", () => {
  assert.ok(SCENE_MODEL_IDS.length > 0);
  SCENE_MODEL_IDS.forEach(id =>
    assert.ok(ALLOWED_SCENE_MODELS.has(id), `${id} is selectable but not callable`));
});

test("every aspect and duration the UI offers is allowed by the endpoint", () => {
  SCENE_ASPECTS.forEach(a => assert.ok(ALLOWED_ASPECTS.has(a.id), `${a.id} is offered but refused`));
  SCENE_DURATIONS.forEach(d => assert.ok(ALLOWED_DURATIONS.has(d), `${d}s is offered but refused`));
  assert.ok(ALLOWED_DURATIONS.has(DEFAULT_SCENE_DURATION));
});

test("the client's request body passes the real validator", async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok:true, status:200, json: async () => ({ operationName:"projects/p/operations/1" }) };
  };
  try {
    await callGenerateScene({ prompt: buildScenePrompt(BRIEF, VARIANT, BRAND), aspectRatio:"9:16" });
  } finally { globalThis.fetch = realFetch; }

  assert.ok(sent, "no request was made");
  assert.equal(sent.action, "submit");
  assert.equal(validateSceneBody(sent), null, "the endpoint would reject the client's own request");
});

test("the poll request passes the real poll validator", async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok:true, status:200, json: async () => ({ status:"running" }) };
  };
  try {
    await pollSceneJob({ operationName:"projects/p/operations/1", model: SCENE_MODEL });
  } finally { globalThis.fetch = realFetch; }
  assert.equal(sent.action, "poll");
  assert.equal(validateScenePollBody(sent), null);
});

// -- Bounds --------------------------------------------------------------------

test("an unknown model is rejected", () => {
  assert.match(validateSceneBody({ model:"sora-2", prompt:"x" }), /Unsupported scene model/);
});

test("an empty or oversized prompt is rejected", () => {
  assert.match(validateSceneBody({ model:SCENE_MODEL }), /non-empty string/);
  assert.match(validateSceneBody({ model:SCENE_MODEL, prompt:"   " }), /non-empty string/);
  assert.match(validateSceneBody({ model:SCENE_MODEL, prompt:"x".repeat(MAX_PROMPT_CHARS + 1) }), /exceeds the \d+ character cap/);
});

test("an unsupported aspect or duration is rejected rather than reinterpreted upstream", () => {
  const base = { model:SCENE_MODEL, prompt:"x" };
  assert.match(validateSceneBody({ ...base, aspectRatio:"4:5" }), /Unsupported aspect ratio/);
  assert.match(validateSceneBody({ ...base, durationSeconds:30 }), /Unsupported duration/);
});

// Duration times rate IS the price, so the duration allowlist is the per-request
// spend ceiling. Count is the other half: a request must not become a batch.
test("a request cannot ask for more than one clip", () => {
  const base = { model:SCENE_MODEL, prompt:"x" };
  assert.match(validateSceneBody({ ...base, sampleCount:8 }), /Only one clip per request/);
  assert.equal(validateSceneBody({ ...base, sampleCount:1 }), null);
});

test("a poll without an operation id is rejected", () => {
  assert.match(validateScenePollBody({ model:SCENE_MODEL }), /operationName must be a non-empty string/);
});

// -- The provider body ---------------------------------------------------------

// Veo can generate its own dialogue. This app must not let it: nobody wrote those
// words and nobody reviewed them, and they arrive sounding authoritative. Forced
// off in the body rather than merely omitted from the prompt, because a prompt is
// a request and a parameter is a guarantee.
test("audio generation is forced off and cannot be turned on from the body", () => {
  const body = buildVeoBody({ prompt:"x", generateAudio:true, sampleCount:9 });
  assert.equal(body.parameters.generateAudio, false);
  assert.equal(body.parameters.sampleCount, 1);
});

test("the body carries the requested shape and duration", () => {
  const body = buildVeoBody({ prompt:"a kitchen", aspectRatio:"9:16", durationSeconds:6, resolution:"1080p" });
  assert.deepEqual(body.instances, [{ prompt:"a kitchen" }]);
  assert.equal(body.parameters.aspectRatio, "9:16");
  assert.equal(body.parameters.durationSeconds, 6);
  assert.equal(body.parameters.resolution, "1080p");
});

test("a finished operation yields inline bytes or a GCS URI, and an unfinished one yields null", () => {
  assert.deepEqual(
    extractVideo({ response:{ videos:[{ bytesBase64Encoded:"abc", mimeType:"video/mp4" }] } }),
    { mimeType:"video/mp4", data:"abc" });
  assert.deepEqual(
    extractVideo({ response:{ videos:[{ gcsUri:"gs://b/o.mp4" }] } }),
    { mimeType:"video/mp4", gcsUri:"gs://b/o.mp4" });
  assert.equal(extractVideo({}), null);
  assert.equal(extractVideo({ response:{ videos:[] } }), null);
});

// -- The prompt ----------------------------------------------------------------

test("no claim the brief flagged as unsupported reaches the scene prompt as direction", () => {
  const prompt = buildScenePrompt(BRIEF, VARIANT, BRAND);
  // Named once, in the negative constraint, and nowhere else.
  BRIEF.claimsToVerify.forEach(claim => {
    const occurrences = prompt.split(claim).length - 1;
    assert.equal(occurrences, 1, `"${claim}" appears ${occurrences} times; it must appear only as a prohibition`);
    assert.ok(prompt.includes("Do not depict, imply or visually suggest"),
      "the unverified claims are listed without being prohibited");
  });
});

test("the prompt forbids on-screen text and spoken dialogue", () => {
  const prompt = buildScenePrompt(BRIEF, VARIANT, BRAND);
  assert.match(prompt, /No on-screen text/);
  assert.match(prompt, /No spoken dialogue/);
});

test("the brief's own words are what the scene is built from", () => {
  const prompt = buildScenePrompt(BRIEF, VARIANT, BRAND);
  assert.ok(prompt.includes(VARIANT.openingBeat));
  assert.ok(prompt.includes(BRIEF.promise));
  assert.ok(prompt.includes(BRIEF.insight));
});

test("a brief with no unverified claims carries no prohibition list", () => {
  const prompt = buildScenePrompt({ ...BRIEF, claimsToVerify: [] }, VARIANT, BRAND);
  assert.ok(!prompt.includes("Do not depict"));
});

// -- Cost ----------------------------------------------------------------------

test("cost is read from the catalogue and scales with duration", () => {
  const rate = modelById(SCENE_MODEL).price.perSecondUsd;
  assert.equal(estimateSceneCostUsd(SCENE_MODEL, 8), Math.round(8 * rate * 100) / 100);
  assert.ok(estimateSceneCostUsd(SCENE_MODEL, 8) > estimateSceneCostUsd(SCENE_MODEL, 4));
});

test("an unpriced model yields null rather than zero", () => {
  assert.equal(estimateSceneCostUsd("not-a-model"), null);
});

// The duration allowlist is the per-request ceiling, so the worst case has to
// stay something a single-operator deployment can survive. If a dearer model or a
// longer duration is added, this is where that shows up.
test("the worst single submit stays bounded", () => {
  const worst = Math.max(...SCENE_MODEL_IDS.flatMap(id =>
    [...ALLOWED_DURATIONS].map(d => estimateSceneCostUsd(id, d) || 0)));
  assert.ok(worst <= 5, `a single scene submit can cost $${worst}`);
});
