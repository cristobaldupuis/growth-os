import test from "node:test";
import assert from "node:assert/strict";
import { validatePut, supabaseConfigured, secretKey, ALLOWED_MIME, BUCKET } from "./asset.js";

/**
 * Run `fn` with the Supabase env vars set to exactly `vars`, then restore.
 *
 * Awaits the result before restoring. A plain try/finally around an async `fn`
 * restores during the callback's first await, so everything after that point
 * runs with the env already torn down — which shows up as a confusing
 * "unreachable" from `storageBase()` throwing on an undefined URL.
 */
async function withEnv(vars, fn) {
  const names = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY"];
  const saved = Object.fromEntries(names.map(n => [n, process.env[n]]));
  try {
    names.forEach(n => delete process.env[n]);
    Object.entries(vars).forEach(([k, v]) => { process.env[k] = v; });
    return await fn();
  } finally {
    names.forEach(n => {
      if (saved[n] == null) delete process.env[n];
      else process.env[n] = saved[n];
    });
  }
}

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

test("a half-configured deployment reads as unconfigured", async () => {
  // Degrades to session-only bytes rather than failing every write at spend time.
  await withEnv({}, () => assert.equal(supabaseConfigured(), false));
  await withEnv({ SUPABASE_URL: "https://example.supabase.co" }, () =>
    assert.equal(supabaseConfigured(), false));
  await withEnv({ SUPABASE_SECRET_KEY: "sb_secret_x" }, () =>
    assert.equal(supabaseConfigured(), false));
});

test("either name for the server-side key configures the endpoint", async () => {
  // SUPABASE_SECRET_KEY is Supabase's current naming for what used to be the
  // service_role key. A deployment carrying one name and code reading only the
  // other looks exactly like having no Supabase at all — which is the worst way
  // for a misconfiguration to present, because the fix looks already done.
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_x" }, () => {
    assert.equal(supabaseConfigured(), true);
    assert.equal(secretKey(), "sb_secret_x");
  });
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_KEY: "legacy-service-key" }, () => {
    assert.equal(supabaseConfigured(), true);
    assert.equal(secretKey(), "legacy-service-key");
  });
});

test("the current name wins when a deployment carries both", async () => {
  await withEnv({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_new",
    SUPABASE_SERVICE_KEY: "legacy-service-key",
  }, () => assert.equal(secretKey(), "sb_secret_new"));
});

test("no key at all yields an empty string rather than undefined", async () => {
  // authHeaders() concatenates this; undefined would send the literal
  // "Bearer undefined" and get a confusing 401 instead of never being called.
  await withEnv({}, () => assert.equal(secretKey(), ""));
});

test("the bucket name is configurable but has a default", () => {
  assert.ok(typeof BUCKET === "string" && BUCKET.length > 0);
});

test("a paused or unreachable project reports unavailable rather than configured", async (t) => {
  // The distinction this covers: env vars set and storage still unusable. Left
  // to a config-only check, the studio would tell an operator their frames are
  // being kept right up until they reload and find they were not.
  const { bucketReachable } = await import("./asset.js");

  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "k" }, async () => {
    const cases = [
      { status: 401, reason: "key_rejected" },
      { status: 403, reason: "key_rejected" },
      { status: 404, reason: "bucket_missing" },
      { status: 503, reason: "unreachable" },
    ];
    for (const { status, reason } of cases) {
      t.mock.method(globalThis, "fetch", async () => ({ ok: false, status }));
      const got = await bucketReachable();
      assert.equal(got.ok, false, `status ${status}`);
      assert.equal(got.reason, reason, `status ${status}`);
      t.mock.restoreAll();
    }

    // A refused connection — the shape a paused project actually takes.
    t.mock.method(globalThis, "fetch", async () => { throw new Error("ECONNREFUSED"); });
    assert.deepEqual(await bucketReachable(), { ok: false, reason: "unreachable" });
    t.mock.restoreAll();

    t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200 }));
    assert.deepEqual(await bucketReachable(), { ok: true });
    t.mock.restoreAll();
  });
});
