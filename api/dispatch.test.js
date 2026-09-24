// The two endpoints that were folded into siblings to stay inside the Hobby
// plan's twelve Serverless Functions: Veo scenes behind api/video.js, and the
// model-routing read behind api/state.js (covered in admin.test.js, which
// drives it through the state handler). This file proves the scene dispatch —
// that `?kind=scene` reaches the scene handler, and that its absence does not.
//
// Run with: node --test api/dispatch.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGINS = "https://example.test";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GCP_SERVICE_ACCOUNT_JSON;

const videoHandler = (await import("./video.js")).default;
const { geminiNotConfiguredError } = await import("./_geminiAuth.js");

function mockRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
}

let ip = 0;
const req = (query, body) => ({
  method: "POST",
  query,
  headers: { origin: "https://example.test", "x-forwarded-for": `10.9.0.${++ip}` },
  body,
});

test("?kind=scene reaches the scene handler", async () => {
  const res = mockRes();
  await videoHandler(req({ kind: "scene" }, { action: "submit" }), res);
  // Only the scene path gates on Gemini configuration before validating.
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, geminiNotConfiguredError());
});

test("without ?kind=scene the video handler answers for itself", async () => {
  const res = mockRes();
  await videoHandler(req({}, { action: "nope" }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /action must be/);
});

test("?kind=voice reaches the voice handler", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const res = mockRes();
  await videoHandler(req({ kind: "voice" }, { action: "speak" }), res);
  // Only the voice path checks the ElevenLabs key; video would 400 on the action.
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "ELEVENLABS_API_KEY is not configured.");
});
