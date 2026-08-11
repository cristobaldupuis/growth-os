import test from "node:test";
import assert from "node:assert/strict";
import { validatePut, supabaseConfigured, ALLOWED_MIME, BUCKET } from "./asset.js";

const good = { key: "asset-1754900000000-ab12cd", mimeType: "image/png", data: "aGVsbG8=" };

test("a well-formed upload is accepted", () => {
  assert.equal(validatePut(good), null);
});

test("a key containing a path separator is refused, not sanitised", () => {
  // Quietly rewriting it would turn an attempt to write outside the bucket
  // prefix into a silent success.
  for (const key of ["../escape", "nested/key", "a\\b", "/absolute"]) {
    assert.match(validatePut({ ...good, key }), /Invalid asset key/, key);
  }
});

test("a key must start with an alphanumeric and stay within length", () => {
  assert.match(validatePut({ ...good, key: "-leading-dash" }), /Invalid asset key/);
  assert.match(validatePut({ ...good, key: "" }), /Invalid asset key/);
  assert.match(validatePut({ ...good, key: "a".repeat(200) }), /Invalid asset key/);
  assert.equal(validatePut({ ...good, key: "a" }), null);
});

test("this endpoint stores stills only — a video body is refused", () => {
  // Re-hosting a 5-50MB render would make this app a video CDN with its own
  // egress bill and retention policy. See api/video.js for the same reasoning.
  assert.match(validatePut({ ...good, mimeType: "video/mp4" }), /media type/);
  assert.ok(!ALLOWED_MIME.has("video/mp4"));
  assert.ok(ALLOWED_MIME.has("image/png"));
});

test("a body with no base64 data is refused", () => {
  assert.match(validatePut({ ...good, data: "" }), /base64/);
  assert.match(validatePut({ ...good, data: undefined }), /base64/);
  assert.match(validatePut({ ...good, data: 12345 }), /base64/);
});

test("a non-object body is refused before anything is read off it", () => {
  assert.match(validatePut(null), /JSON object/);
  assert.match(validatePut("not a body"), /JSON object/);
});

test("configuration is detected from both env vars, not one", () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    assert.equal(supabaseConfigured(), false);

    // A half-configured deployment reads as unconfigured, so it degrades to
    // session-only bytes rather than failing every write at spend time.
    process.env.SUPABASE_URL = "https://example.supabase.co";
    assert.equal(supabaseConfigured(), false);

    process.env.SUPABASE_SERVICE_KEY = "service-key";
    assert.equal(supabaseConfigured(), true);
  } finally {
    if (url == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = url;
    if (key == null) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = key;
  }
});

test("the bucket name is configurable but has a default", () => {
  assert.ok(typeof BUCKET === "string" && BUCKET.length > 0);
});
