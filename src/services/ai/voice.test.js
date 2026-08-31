// Voice auditions: request shape, bounds, and cost estimation.
//
// Like image.test.js, this asserts against the REAL validator exported from
// api/voice.js rather than a copy, so the client and the endpoint cannot drift
// apart silently.
//
// Run with: node --test src/services/ai/voice.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateVoiceBody, buildSpeechBody, trimVoices,
  ALLOWED_VOICE_MODELS, ALLOWED_OUTPUT_FORMATS, MAX_SCRIPT_CHARS,
} from "../../../api/voice.js";
import {
  callGenerateVoice, listVoices, estimateVoiceCostUsd,
  VOICE_MODELS, DEFAULT_VOICE_MODEL, CREDIT_USD, CREDITS_PER_CHAR,
} from "./callGenerateVoice.js";
import { estimateVideoCostUsd, buildVideoScript, VIDEO_TIERS } from "./callGenerateVideo.js";

// A real-shaped ElevenLabs voice id: 20 alphanumeric characters.
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const VARIANT = {
  hook: "You have four minutes.",
  script: ["So does the pastry.", "", "Ready when you are."],
  cta: "Shop now",
};

// -- The client and the endpoint agree ----------------------------------------

test("every model the client can select is allowed by the endpoint", () => {
  Object.values(VOICE_MODELS).forEach(m =>
    assert.ok(ALLOWED_VOICE_MODELS.has(m), `${m} is not in the endpoint allowlist`));
});

test("the default model is one the endpoint allows", () => {
  assert.ok(ALLOWED_VOICE_MODELS.has(DEFAULT_VOICE_MODEL));
});

test("every model the client prices is one the endpoint allows", () => {
  Object.keys(CREDITS_PER_CHAR).forEach(m =>
    assert.ok(ALLOWED_VOICE_MODELS.has(m), `${m} is priced but not callable`));
});

test("the client's request body passes the real validator", async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok:true, status:200, json: async () => ({ mimeType:"audio/mpeg", data:"abc", characters:9 }) };
  };
  try {
    await callGenerateVoice({ text: buildVideoScript(VARIANT), voiceId: VOICE_ID });
  } finally { globalThis.fetch = realFetch; }

  assert.ok(sent, "no request was made");
  assert.equal(sent.action, "speak");
  assert.equal(validateVoiceBody(sent), null, "the endpoint would reject the client's own request");
});

test("the voices request names the action the endpoint dispatches on", async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok:true, status:200, json: async () => ({ voices: [] }) };
  };
  try { await listVoices(); } finally { globalThis.fetch = realFetch; }
  assert.equal(sent.action, "voices");
});

// -- Bounds --------------------------------------------------------------------

test("an empty or missing script is rejected", () => {
  assert.match(validateVoiceBody({ voiceId:VOICE_ID, model:DEFAULT_VOICE_MODEL }), /text is required/);
  assert.match(validateVoiceBody({ voiceId:VOICE_ID, model:DEFAULT_VOICE_MODEL, text:"   " }), /text is required/);
});

// Billing is per character, so an uncapped script is an uncapped invoice.
test("an oversized script is rejected", () => {
  const body = { voiceId:VOICE_ID, model:DEFAULT_VOICE_MODEL, text:"x".repeat(MAX_SCRIPT_CHARS + 1) };
  assert.match(validateVoiceBody(body), /exceeds the \d+ character ceiling/);
});

test("an unknown model is rejected", () => {
  assert.match(
    validateVoiceBody({ voiceId:VOICE_ID, text:"hi", model:"eleven_english_v1" }),
    /is not an allowed speech model/,
  );
});

// The voice id lands in the request PATH, so anything that could reshape the URL
// has to fail here rather than at the provider.
test("a voice id that could reshape the upstream URL is rejected", () => {
  ["../../voices", "abc", "", "21m00Tcm4TlvDq8ikWAM/../x", "21m00Tcm4Tlv Dq8ikWAM"].forEach(id => {
    assert.match(
      validateVoiceBody({ voiceId:id, text:"hi", model:DEFAULT_VOICE_MODEL }),
      /voiceId must be an ElevenLabs voice id/,
      `${JSON.stringify(id)} was accepted`,
    );
  });
});

test("an unknown output format is rejected and a known one passes", () => {
  const base = { voiceId:VOICE_ID, text:"hi", model:DEFAULT_VOICE_MODEL };
  assert.match(validateVoiceBody({ ...base, outputFormat:"flac_96000" }), /is not an allowed output format/);
  ALLOWED_OUTPUT_FORMATS.forEach(f =>
    assert.equal(validateVoiceBody({ ...base, outputFormat:f }), null, `${f} was rejected`));
});

test("out-of-range voice settings are rejected before they reach the provider", () => {
  const base = { voiceId:VOICE_ID, text:"hi", model:DEFAULT_VOICE_MODEL };
  assert.match(validateVoiceBody({ ...base, voiceSettings:{ stability: 1.5 } }), /stability must be between 0 and 1/);
  assert.match(validateVoiceBody({ ...base, voiceSettings:{ style: -1 } }), /style must be between 0 and 1/);
  assert.match(validateVoiceBody({ ...base, voiceSettings:"loud" }), /voiceSettings must be an object/);
  assert.equal(validateVoiceBody({ ...base, voiceSettings:{ stability: 0.5, similarityBoost: 1 } }), null);
});

// -- Request mapping -----------------------------------------------------------

test("voice settings are mapped onto the provider's snake_case shape", () => {
  const body = buildSpeechBody({
    text:"hi", model:DEFAULT_VOICE_MODEL,
    voiceSettings:{ stability:0.4, similarityBoost:0.8, style:0.2 },
  });
  assert.equal(body.model_id, DEFAULT_VOICE_MODEL);
  assert.deepEqual(body.voice_settings, { stability:0.4, similarity_boost:0.8, style:0.2 });
});

test("no voice_settings key is sent when the caller set none", () => {
  const body = buildSpeechBody({ text:"hi", model:DEFAULT_VOICE_MODEL });
  assert.ok(!("voice_settings" in body), "an empty settings object overrides the voice's own defaults");
});

test("the voice library is trimmed to what a picker needs", () => {
  const out = trimVoices({ voices: [
    { voice_id:VOICE_ID, name:"Rachel", category:"premade", labels:{ accent:"american", gender:"female" },
      preview_url:"https://example.test/a.mp3", samples:[1,2,3], fine_tuning:{ state:"fine" } },
  ]});
  assert.deepEqual(out, [{
    voiceId:VOICE_ID, name:"Rachel", category:"premade",
    accent:"american", gender:"female", preview:"https://example.test/a.mp3",
  }]);
});

test("a malformed voice library yields an empty list rather than throwing", () => {
  assert.deepEqual(trimVoices(null), []);
  assert.deepEqual(trimVoices({ voices: "none" }), []);
});

// -- The audition says exactly what the render will say ------------------------
//
// This is the guard on the defect that shipped in this module's first draft: a
// second script builder that joined beats differently and spoke the CTA, so the
// audition previewed words the render would never say. There is now one builder.
// If anyone adds a voice-specific one, this fails.

test("the audition is generated from the render's own script builder", async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok:true, status:200, json: async () => ({ mimeType:"audio/mpeg", data:"abc", characters:1 }) };
  };
  try {
    await callGenerateVoice({ text: buildVideoScript(VARIANT), voiceId: VOICE_ID });
  } finally { globalThis.fetch = realFetch; }

  assert.equal(sent.text, buildVideoScript(VARIANT));
  // The specifics that diverged: the hook leads, beats are separated by the
  // ellipsis pause every provider renders as a beat of silence, and the CTA is
  // not spoken.
  assert.equal(sent.text, "You have four minutes. ... So does the pastry. ... Ready when you are.");
  assert.ok(!sent.text.includes(VARIANT.cta), "the render does not speak the CTA, so neither should the audition");
});

// -- Cost ----------------------------------------------------------------------

test("cost scales with character count", () => {
  const one = estimateVoiceCostUsd("x", VOICE_MODELS.QUALITY);
  const ten = estimateVoiceCostUsd("x".repeat(10), VOICE_MODELS.QUALITY);
  assert.ok(Math.abs(ten - one * 10) < 1e-12);
  assert.equal(one, CREDIT_USD);
});

test("the half-credit models cost half of the quality model", () => {
  const text = "x".repeat(1000);
  assert.ok(Math.abs(
    estimateVoiceCostUsd(text, VOICE_MODELS.FAST) - estimateVoiceCostUsd(text, VOICE_MODELS.QUALITY) / 2,
  ) < 1e-12);
});

// Null, never zero — zero silently understates a rollup, null is visibly missing.
test("an unpriced model yields null rather than zero", () => {
  assert.equal(estimateVoiceCostUsd("hello", "eleven_unknown_v9"), null);
});

// The whole argument for this endpoint is that auditioning a script is cheap
// next to rendering it. That comparison is only meaningful like-for-like — the
// same text through both estimators — because voice is priced per character and
// video per second, and a short script against the render floor flatters voice
// while a long one flatters video. Asserted against the real video estimator so
// that a pricing change on either side breaks this rather than quietly inverting
// the premise the endpoint was built on.
test("auditioning a script is materially cheaper than rendering the same script", () => {
  const script = Array(70).fill("word").join(" ");
  const audition = estimateVoiceCostUsd(script, DEFAULT_VOICE_MODEL);
  const standard = estimateVideoCostUsd(script, VIDEO_TIERS.STANDARD);
  const premium  = estimateVideoCostUsd(script, VIDEO_TIERS.PREMIUM);

  assert.ok(audition * 4 < standard,
    `audition $${audition.toFixed(4)} is not materially under standard render $${standard.toFixed(2)}`);
  assert.ok(audition * 20 < premium,
    `audition $${audition.toFixed(4)} is not materially under premium render $${premium.toFixed(2)}`);
});

// The cheap model exists for the "which of these six hooks" pass, so it has to be
// meaningfully cheaper than the one used to judge a final read.
test("the fast model is cheaper than the quality model on the same script", () => {
  const script = Array(70).fill("word").join(" ");
  assert.ok(estimateVoiceCostUsd(script, VOICE_MODELS.FAST)
          < estimateVoiceCostUsd(script, VOICE_MODELS.QUALITY));
});
