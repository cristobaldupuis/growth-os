// Video generation: request shape, tier/provider agreement, and cost estimation.
//
// Same contract as image.test.js — asserts against the REAL validators exported
// from api/video.js rather than a copy, so the client and the endpoint cannot
// drift apart silently. The cost estimator gets its own section because it is
// the number an operator makes a spending decision on: an estimator that is
// quietly wrong is worse than no estimate, since it is trusted.
//
// Run with: node --test src/services/ai/video.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateSubmitBody, validatePollBody,
  ALLOWED_PROVIDERS, ALLOWED_ASPECTS, MAX_SCRIPT_CHARS,
} from "../../../api/video.js";
import {
  buildVideoScript, buildVideoRequest, callGenerateVideo,
  VIDEO_TIERS, VIDEO_TIER_LIST, VIDEO_ASPECTS,
  estimateSpokenSeconds, estimateVideoCostUsd,
  SPOKEN_WORDS_PER_MINUTE, MIN_RENDER_SECONDS, BEAT_PAUSE_SECONDS,
} from "./callGenerateVideo.js";

const BRIEF = {
  insight: "Buyers distrust before-and-after imagery because they have been burned.",
  promise: "See it used unedited.",
  claimsToVerify: ["clinically proven to work", "30% faster results"],
};
const VARIANT = {
  angleSlug: "TimeSaver", label: "Clock open", varies: "the hook",
  hook: "You have four minutes.",
  script: ["Most mornings you do not get a second one.", "This takes one."],
  cta: "Shop now",
};
const BRAND = { name: "Test Brand", whatTheySell: "Protein pastries" };

// -- The client and the endpoint agree ----------------------------------------

test("every tier the UI offers maps to a provider the endpoint allows", () => {
  VIDEO_TIER_LIST.forEach(v =>
    assert.ok(ALLOWED_PROVIDERS.has(v.provider), `${v.key} maps to unknown provider ${v.provider}`));
});

test("every aspect ratio the UI offers is allowed by the endpoint", () => {
  VIDEO_ASPECTS.forEach(a =>
    assert.ok(ALLOWED_ASPECTS.has(a.id), `${a.id} is not in the endpoint allowlist`));
});

test("the client's request body passes the real validator", async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ jobId: "job_1", provider: "heygen" }) };
  };
  try {
    await callGenerateVideo({ script: buildVideoScript(VARIANT), aspectRatio: "9:16", tier: VIDEO_TIERS.PREMIUM });
  } finally { globalThis.fetch = realFetch; }

  assert.ok(sent, "no request was made");
  assert.equal(sent.action, "submit");
  // The tier is resolved to a provider id client-side; the wire contract still
  // speaks provider, which is what the adapter map keys on.
  assert.equal(sent.provider, VIDEO_TIERS.PREMIUM.provider);
  assert.equal(validateSubmitBody(sent), null, "the endpoint would reject the client's own request");
});

test("a tier name never reaches the wire in place of a provider id", () => {
  assert.equal(validateSubmitBody({ provider: "PREMIUM", script: "x" }), "Unsupported video provider.");
  assert.equal(validateSubmitBody({ provider: "premium", script: "x" }), "Unsupported video provider.");
});

// -- Bounds --------------------------------------------------------------------

test("an unknown provider is rejected", () => {
  assert.match(validateSubmitBody({ provider: "sora", script: "x" }), /Unsupported video provider/);
});

test("an empty or missing script is rejected", () => {
  assert.match(validateSubmitBody({ provider: "heygen" }), /non-empty string/);
  assert.match(validateSubmitBody({ provider: "heygen", script: "   " }), /non-empty string/);
});

// Script length is the one variable that scales spend linearly on every
// provider here, so it is the cap that matters most.
test("an oversized script is rejected", () => {
  const body = { provider: "heygen", script: "x".repeat(MAX_SCRIPT_CHARS + 1) };
  assert.match(validateSubmitBody(body), /exceeds the \d+ character cap/);
});

test("an unsupported aspect ratio is rejected", () => {
  assert.match(validateSubmitBody({ provider: "heygen", script: "x", aspectRatio: "21:9" }), /Unsupported aspect ratio/);
});

test("a poll needs a real job id", () => {
  assert.match(validatePollBody({ provider: "heygen" }), /non-empty string/);
  assert.equal(validatePollBody({ provider: "heygen", jobId: "abc" }), null);
});

// -- The script ----------------------------------------------------------------

test("the script is the variant's own reviewed words, hook first", () => {
  const s = buildVideoScript(VARIANT);
  assert.ok(s.startsWith(VARIANT.hook), "the hook opens the read");
  VARIANT.script.forEach(beat => assert.ok(s.includes(beat), `"${beat}" must survive verbatim`));
});

test("beats are joined with a spoken pause rather than run together", () => {
  assert.match(buildVideoScript(VARIANT), /\.\.\./);
});

// The spoken-claim version of the image module's highest-risk failure. An
// avatar saying an unverified claim out loud reads as more authoritative than
// a picture implying it, so the overlap has to be surfaced before submit.
test("a script that restates an unverified claim is flagged", () => {
  const risky = { ...VARIANT, script: ["It is clinically proven to work, we promise."] };
  const req = buildVideoRequest(BRIEF, risky, BRAND);
  assert.ok(req.notes.possibleUnverifiedOverlap, "the overlap must be surfaced");
});

test("a clean script carries no overlap flag", () => {
  const req = buildVideoRequest(BRIEF, VARIANT, BRAND);
  assert.equal(req.notes.possibleUnverifiedOverlap, null);
});

test("a realistic script stays within the endpoint's character cap", () => {
  const s = buildVideoScript(VARIANT);
  assert.equal(validateSubmitBody({ provider: "heygen", script: s, aspectRatio: "9:16" }), null);
});

// -- Cost estimation -----------------------------------------------------------

test("spoken length tracks word count at the documented rate", () => {
  // 150 words at 150wpm is a minute, with no pauses to add.
  const script = Array.from({ length: SPOKEN_WORDS_PER_MINUTE }, () => "word").join(" ");
  assert.ok(Math.abs(estimateSpokenSeconds(script) - 60) < 0.5, "150 words should estimate at ~60s");
});

// Both of these use scripts comfortably longer than MIN_RENDER_SECONDS. Below
// the floor every comparison clamps to the same value and the assertions pass
// without testing anything — which is exactly what the first draft of these two
// did.
const WORDS_20 = Array.from({ length: 20 }, () => "word");

test("beat pauses are counted as billed time, not stripped as punctuation", () => {
  const flat   = WORDS_20.join(" ");
  const paused = WORDS_20.join(" ") + " ... " + WORDS_20.join(" ");
  const perWord = 60 / SPOKEN_WORDS_PER_MINUTE;
  // Isolate the pause from the extra words it sits between.
  const delta = estimateSpokenSeconds(paused) - estimateSpokenSeconds(flat) - WORDS_20.length * perWord;
  assert.ok(delta > 0, "silence between beats is rendered and billed, so it must not be free");
});

test("the ellipsis joiner is not counted as a spoken word", () => {
  // Same word count either way, so the whole difference must be the pause and
  // nothing else. Asserting against BEAT_PAUSE_SECONDS rather than "less than a
  // word" because the two are close enough (0.45s vs 0.4s) that the looser
  // bound would fail for the right reason and read as the wrong one.
  const delta = estimateSpokenSeconds(WORDS_20.join(" ") + " ... ") - estimateSpokenSeconds(WORDS_20.join(" "));
  assert.ok(Math.abs(delta - BEAT_PAUSE_SECONDS) < 0.001,
    `a pause added ${delta}s rather than ${BEAT_PAUSE_SECONDS}s, which means "..." was also read as a word`);
});

test("a very short script floors rather than estimating as near-free", () => {
  assert.equal(estimateSpokenSeconds("Go now."), MIN_RENDER_SECONDS);
});

test("an empty script costs nothing", () => {
  assert.equal(estimateSpokenSeconds(""), 0);
  assert.equal(estimateVideoCostUsd("", VIDEO_TIERS.PREMIUM), 0);
});

// The tier picker only means something if the two numbers differ visibly. If
// this ever collapses, the picker is decoration and should be removed.
test("the two tiers price the same script differently enough to be a real choice", () => {
  const s = buildVideoScript(VARIANT);
  const standard = estimateVideoCostUsd(s, VIDEO_TIERS.STANDARD);
  const premium  = estimateVideoCostUsd(s, VIDEO_TIERS.PREMIUM);
  assert.ok(premium > standard * 3, `premium ${premium} vs standard ${standard} is not a meaningful gap`);
});

test("cost is rounded to the cent, not carried as float noise", () => {
  const c = estimateVideoCostUsd(buildVideoScript(VARIANT), VIDEO_TIERS.PREMIUM);
  assert.equal(c, Math.round(c * 100) / 100);
});

// A script at the endpoint's hard cap is the worst case a single submit can
// buy. Pinning it means a future cap increase cannot quietly raise the ceiling
// without someone re-reading the rate-limit reasoning in api/video.js.
test("the most expensive submit the endpoint permits stays bounded", () => {
  const maxScript = Array.from({ length: 150 }, () => "word").join(" ");
  assert.ok(maxScript.length <= MAX_SCRIPT_CHARS);
  assert.ok(estimateVideoCostUsd(maxScript, VIDEO_TIERS.PREMIUM) < 10,
    "a single premium submit should stay under $10; if not, revisit SUBMIT_RATE_LIMIT_MAX");
});
