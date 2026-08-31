// End-to-end test for the admin endpoint and the public routing read.
//
// The unit tests around this cover the pieces: _session.js proves the cookie is
// sound, registry.test.js proves validateRouting rejects what it should. Neither
// proves the handler *wires them together* — that login actually sets the cookie
// the session module would accept, that getConfig is genuinely unreachable without
// one, that an invalid routing is refused before it reaches the store. Those are
// exactly the mistakes that pass every unit test and leave the console either
// broken or open.
//
// It drives the real default-exported handlers with mock req/res rather than
// standing up a server, so it runs in the same `node --test` pass as everything
// else and needs no ports, no Vercel CLI and no network.
//
// Note what this run proves about the un-configured case: with no Upstash env vars
// set, writes must FAIL rather than appear to succeed. That is asserted below, and
// it is the behaviour a deployment missing those vars actually gets.
//
// Run with: node --test api/admin.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.ADMIN_SESSION_SECRET = "test-signing-secret";
process.env.ALLOWED_ORIGINS = "https://example.test";
// Deliberately no Supabase — this exercises the no-routing-store path.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

const adminHandler = (await import("./admin.js")).default;
const routingHandler = (await import("./routing.js")).default;
const { DEFAULT_ROUTING } = await import("../src/services/ai/registry.js");

/** Minimal res double capturing status, body and headers. */
function mockRes() {
  const res = {
    statusCode: null, body: null, headers: {}, ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
  return res;
}

const ORIGIN = "https://example.test";

// Each request gets its own client IP, so each lands in its own rate-limit bucket.
// Without this every call in the file shares one bucket against a ceiling of 40 —
// which passes today and would start failing as an unrelated 429 the moment someone
// adds a few more tests. A shared limiter is not what any test here is about.
let ipCounter = 0;

/** POST to the admin handler, optionally carrying a session cookie. */
async function post(body, cookie) {
  const req = {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${++ipCounter % 250}`,
      ...(cookie ? { cookie } : {}),
    },
    body,
  };
  const res = mockRes();
  await adminHandler(req, res);
  return res;
}

/** The Set-Cookie value from a successful login, in `name=value` form. */
async function signIn() {
  const res = await post({ action: "login", password: "test-admin-password" });
  assert.equal(res.statusCode, 200, "login should succeed with the right password");
  const setCookie = res.headers["set-cookie"];
  assert.ok(setCookie, "login must issue a cookie");
  return setCookie.split(";")[0];
}

// -- Transport guard -----------------------------------------------------------

test("a request from an unlisted origin is refused", async () => {
  const req = { method: "POST", headers: { origin: "https://evil.test" }, body: { action: "login", password: "test-admin-password" } };
  const res = mockRes();
  await adminHandler(req, res);
  assert.equal(res.statusCode, 403);
});

test("a GET is refused on the admin endpoint", async () => {
  const req = { method: "GET", headers: { origin: ORIGIN }, body: {} };
  const res = mockRes();
  await adminHandler(req, res);
  assert.equal(res.statusCode, 405);
});

test("a preflight is answered without touching any action", async () => {
  const req = { method: "OPTIONS", headers: { origin: ORIGIN }, body: {} };
  const res = mockRes();
  await adminHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.ended);
});

// -- Login ---------------------------------------------------------------------

test("login with the wrong password is refused and issues no cookie", async () => {
  const res = await post({ action: "login", password: "nope" });
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["set-cookie"], undefined, "a failed login must not set a session");
});

test("login failures do not distinguish a wrong password from anything else", async () => {
  // One message for every failure mode, so the response cannot be used to probe
  // whether the console is configured.
  const wrong = await post({ action: "login", password: "nope" });
  const empty = await post({ action: "login", password: "" });
  assert.equal(wrong.body.error, empty.body.error);
});

test("login with the right password issues a session cookie", async () => {
  const cookie = await signIn();
  assert.match(cookie, /^gos_admin=/);
});

// -- The gate ------------------------------------------------------------------

test("getConfig is refused without a session", async () => {
  const res = await post({ action: "getConfig" });
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Not signed in/);
});

test("setRouting is refused without a session", async () => {
  // The one that matters most: an unauthenticated caller must not be able to
  // repoint a feature group.
  const res = await post({ action: "setRouting", routing: { capture: "claude-opus-5" } });
  assert.equal(res.statusCode, 401);
});

test("a forged cookie does not open the gate", async () => {
  const res = await post({ action: "getConfig" }, `gos_admin=${Date.now() + 60000}.${"0".repeat(64)}`);
  assert.equal(res.statusCode, 401);
});

test("an unknown action is rejected once signed in", async () => {
  const res = await post({ action: "wat" }, await signIn());
  assert.equal(res.statusCode, 400);
});

// -- getConfig -----------------------------------------------------------------

test("getConfig returns the catalogue, groups, defaults and resolved routing", async () => {
  const res = await post({ action: "getConfig" }, await signIn());
  assert.equal(res.statusCode, 200);
  const b = res.body;
  assert.ok(Array.isArray(b.catalogue) && b.catalogue.length > 0);
  assert.ok(b.groups && Object.keys(b.groups).length === Object.keys(DEFAULT_ROUTING).length);
  assert.deepEqual(b.defaults, DEFAULT_ROUTING);
  // With no store configured, everything resolves to the committed defaults.
  assert.deepEqual(b.routing, DEFAULT_ROUTING);
  assert.deepEqual(b.assigned, []);
  assert.equal(b.durable, false, "no Supabase means routing is not durable, and this must say so");
});

test("getConfig reports every group's capability requirements", async () => {
  // The console builds its picker from these; a missing `requires` would silently
  // offer a tool-less model for the debate.
  const res = await post({ action: "getConfig" }, await signIn());
  assert.equal(res.body.groups.debate.requires.tools, true);
});

// -- setRouting ----------------------------------------------------------------

test("an invalid routing is rejected before the store is touched", async () => {
  const cookie = await signIn();
  // An image model for a text group — the most plausible console bug.
  const res = await post({ action: "setRouting", routing: { capture: "gemini-2.5-flash-image" } }, cookie);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /cannot serve/);
});

test("a model that cannot meet a group's floor is rejected", async () => {
  const res = await post({ action: "setRouting", routing: { debate: "claude-haiku-4-5" } }, await signIn());
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /missing|cannot serve/);
});

test("an unknown group is rejected", async () => {
  const res = await post({ action: "setRouting", routing: { nonsense: "claude-opus-5" } }, await signIn());
  assert.equal(res.statusCode, 400);
});

test("a valid routing with no store configured fails loudly rather than silently", async () => {
  // The property that keeps this console honest. A 200 here would tell the operator
  // their change is live when it went nowhere — the same class of bug store.js was
  // rewritten to stop doing in the browser.
  const res = await post({ action: "setRouting", routing: { capture: "claude-opus-5" } }, await signIn());
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.durable, false);
  assert.match(res.body.error, /not saved/i);
});

// -- listModels / verifyModel --------------------------------------------------

test("listModels reports a missing provider key rather than calling out", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const res = await post({ action: "listModels", provider: "openai" }, await signIn());
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /OPENAI_API_KEY/);
  } finally { if (saved) process.env.OPENAI_API_KEY = saved; }
});

test("listModels refuses a provider with no list endpoint", async () => {
  const res = await post({ action: "listModels", provider: "anthropic" }, await signIn());
  assert.equal(res.statusCode, 400);
});

test("listModels for gemini reports GEMINI_API_KEY missing when nothing is configured", async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const res = await post({ action: "listModels", provider: "gemini" }, await signIn());
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /GEMINI_API_KEY/);
  } finally { if (saved) process.env.GEMINI_API_KEY = saved; }
});

test("listModels for gemini in Vertex mode is configured (not 'GEMINI_API_KEY missing') and actually attempts Vertex", async () => {
  // Gemini IS configured here — just via Vertex, which used to have no list
  // endpoint wired at all. It must not claim the provider has no credentials
  // just because the one env var it used to check is unset, and it must now
  // genuinely try Vertex's publisher-models list rather than return a canned
  // "not wired up" message. The service-account JSON below is well-formed but
  // missing client_email/private_key, so minting a token fails deterministically
  // before any real network call — that's what turns up as a 502 here.
  const saved = {
    key: process.env.GEMINI_API_KEY,
    project: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_LOCATION,
    creds: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  };
  delete process.env.GEMINI_API_KEY;
  process.env.GCP_PROJECT_ID = "test-project";
  process.env.GCP_LOCATION = "us-central1";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "{}";
  try {
    const res = await post({ action: "listModels", provider: "gemini" }, await signIn());
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /Could not reach the provider/);
  } finally {
    for (const [k, v] of Object.entries({
      GEMINI_API_KEY: saved.key, GCP_PROJECT_ID: saved.project, GCP_LOCATION: saved.location, GOOGLE_APPLICATION_CREDENTIALS: saved.creds,
    })) { if (v) process.env[k] = v; else delete process.env[k]; }
  }
});

test("verifyModel refuses a model that is not in the catalogue", async () => {
  const res = await post({ action: "verifyModel", model: "gpt-imaginary" }, await signIn());
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /not in the catalogue/);
});

test("verifyModel reports an Anthropic model as unverifiable rather than verified", async () => {
  // No list endpoint is wired for Anthropic. Saying "verifiable: false" is honest;
  // returning present:true would be a claim this endpoint cannot support.
  const res = await post({ action: "verifyModel", model: "claude-sonnet-5" }, await signIn());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.verifiable, false);
});

// -- logout --------------------------------------------------------------------

test("logout clears the cookie and the cleared cookie does not authenticate", async () => {
  const res = await post({ action: "logout" }, await signIn());
  assert.equal(res.statusCode, 200);
  const cleared = res.headers["set-cookie"];
  assert.match(cleared, /Max-Age=0/);
  const after = await post({ action: "getConfig" }, cleared.split(";")[0]);
  assert.equal(after.statusCode, 401);
});

// -- The public routing read ---------------------------------------------------

test("routing answers GET without a session", async () => {
  // The app fetches this at boot and holds no session. If it required one, every
  // deployment would silently run on defaults forever.
  const req = { method: "GET", headers: { referer: `${ORIGIN}/` } };
  const res = mockRes();
  await routingHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.routing, DEFAULT_ROUTING);
});

test("routing exposes only group to model, nothing else the admin endpoint knows", async () => {
  const req = { method: "GET", headers: { referer: `${ORIGIN}/` } };
  const res = mockRes();
  await routingHandler(req, res);
  assert.deepEqual(Object.keys(res.body), ["routing"]);
  assert.ok(!res.body.catalogue && !res.body.durable && !res.body.groups);
});

test("routing refuses a POST", async () => {
  const req = { method: "POST", headers: { origin: ORIGIN }, body: {} };
  const res = mockRes();
  await routingHandler(req, res);
  assert.equal(res.statusCode, 405);
});

test("routing refuses an unlisted origin", async () => {
  const req = { method: "GET", headers: { referer: "https://evil.test/" } };
  const res = mockRes();
  await routingHandler(req, res);
  assert.equal(res.statusCode, 403);
});

// -- The durable path ----------------------------------------------------------
//
// Everything above runs with no routing store, which is the un-configured case and
// worth asserting on its own. This section stubs the Upstash REST endpoint to cover
// the configured one: that a save round-trips, that a partial save does not blank
// the other groups, and that what was stored actually reaches the app through
// /api/routing. Without this the happy path is untested.

/** Stand up a fake PostgREST and run `fn` against it. Returns the stored config. */
async function withStore(fn) {
  const realFetch = globalThis.fetch;
  const kv = {};
  process.env.SUPABASE_URL = "https://project.supabase.invalid";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

  // This has to cover more than the config table. Once Supabase is set, _guard.js's
  // rate limiter starts using the same backend and calls the increment_rate_limit
  // RPC on every request — and the limiter fails closed, so a stub that answered
  // only the config routes would 503 every call before it reached the action under
  // test. That is not hypothetical; it is what happened when this stub spoke only
  // GET/SET.
  const counters = {};
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith("https://project.supabase.invalid")) {
      throw new Error(`unexpected outbound call to ${u} — the test should not reach a real provider`);
    }

    // Atomic counter, via the RPC the real limiter calls.
    if (u.includes("/rpc/increment_rate_limit")) {
      const { p_key } = JSON.parse(opts.body);
      counters[p_key] = (counters[p_key] || 0) + 1;
      return { ok: true, json: async () => counters[p_key] };
    }

    // app_config upsert.
    if (u.includes("/app_config") && opts.method === "POST") {
      const row = JSON.parse(opts.body);
      kv[row.key] = row.value;
      return { ok: true, status: 201, json: async () => [], text: async () => "" };
    }

    // app_config read — `?key=eq.<key>&select=value`.
    if (u.includes("/app_config")) {
      const key = decodeURIComponent((u.match(/key=eq\.([^&]+)/) || [])[1] || "");
      const rows = key in kv ? [{ value: kv[key] }] : [];
      return { ok: true, json: async () => rows };
    }

    throw new Error(`unexpected Supabase route ${u}`);
  };

  try { await fn(kv); }
  finally {
    globalThis.fetch = realFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
}

test("with a store configured, a save persists and reads back", async () => {
  await withStore(async () => {
    const cookie = await signIn();

    const save = await post({ action: "setRouting", routing: { capture: "claude-opus-5" } }, cookie);
    assert.equal(save.statusCode, 200);
    assert.equal(save.body.durable, true);
    assert.equal(save.body.routing.capture, "claude-opus-5");

    const cfg = await post({ action: "getConfig" }, cookie);
    assert.equal(cfg.body.durable, true);
    assert.equal(cfg.body.routing.capture, "claude-opus-5");
    assert.deepEqual(cfg.body.assigned, ["capture"], "an explicit assignment is distinguishable from a default");
  });
});

test("saving one group does not blank the others", async () => {
  // setRouting merges over what is stored. Replacing instead of merging would mean
  // saving one card silently reset every other group to its default.
  await withStore(async () => {
    const cookie = await signIn();
    await post({ action: "setRouting", routing: { capture: "claude-opus-5" } }, cookie);
    await post({ action: "setRouting", routing: { creative: "claude-haiku-4-5" } }, cookie);

    const cfg = await post({ action: "getConfig" }, cookie);
    assert.equal(cfg.body.routing.capture, "claude-opus-5", "the earlier assignment must survive");
    assert.equal(cfg.body.routing.creative, "claude-haiku-4-5");
    assert.deepEqual(cfg.body.assigned.sort(), ["capture", "creative"]);
  });
});

test("a stored assignment reaches the app through the public routing read", async () => {
  // The end of the chain: console save -> store -> /api/routing -> applyRouting.
  // If this link were broken the console would look like it worked and change nothing.
  await withStore(async () => {
    await post({ action: "setRouting", routing: { analysis: "claude-opus-5" } }, await signIn());

    const req = { method: "GET", headers: { referer: `${ORIGIN}/` } };
    const res = mockRes();
    await routingHandler(req, res);
    assert.equal(res.body.routing.analysis, "claude-opus-5");
    assert.equal(res.body.routing.capture, DEFAULT_ROUTING.capture, "unassigned groups still default");
  });
});

test("resetRouting clears every assignment back to the defaults", async () => {
  await withStore(async () => {
    const cookie = await signIn();
    await post({ action: "setRouting", routing: { capture: "claude-opus-5" } }, cookie);

    const reset = await post({ action: "resetRouting" }, cookie);
    assert.equal(reset.statusCode, 200);
    assert.deepEqual(reset.body.routing, DEFAULT_ROUTING);

    const cfg = await post({ action: "getConfig" }, cookie);
    assert.deepEqual(cfg.body.routing, DEFAULT_ROUTING);
    assert.deepEqual(cfg.body.assigned, []);
  });
});

test("a routing stored for a model no longer in the catalogue degrades to the default", async () => {
  // The staleness case a later deploy creates: an id retired from the catalogue
  // leaves a dangling value in the store. One group falling back beats every AI call
  // in the app failing, and the console is told which groups were dropped.
  await withStore(async (kv) => {
    const cookie = await signIn();
    // Seeded as a jsonb value under the config key, which is what the store
    // actually holds — Postgres gives the object back as an object, where Redis
    // handed back the string it was given.
    kv["routing"] = { capture: "claude-retired-9", analysis: "claude-opus-5" };

    const cfg = await post({ action: "getConfig" }, cookie);
    assert.equal(cfg.body.routing.capture, DEFAULT_ROUTING.capture);
    assert.equal(cfg.body.routing.analysis, "claude-opus-5");
    assert.deepEqual(cfg.body.dropped, ["capture"], "the console must be able to report the drift");
  });
});
