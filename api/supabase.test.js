// The server-side datastore, and the two behaviours that differ between its
// callers.
//
// The bug this replaces was not in either caller's logic — it was that the store
// they addressed had never been configured. Both were written against Upstash
// Redis, `UPSTASH_*` was never set on the deployment, and the code went on
// describing itself as durable: the rate limiter silently ran on a per-instance
// Map (which is not a limit), and every routing save silently failed.
//
// So the property worth testing hardest is not "does a read work". It is that
// each caller behaves correctly when the store is ABSENT or BROKEN, and that the
// two behave differently on purpose — routing fails soft to committed defaults,
// the limiter fails closed.

import test from "node:test";
import assert from "node:assert/strict";

const URL_VAR = "https://project.supabase.invalid";

function configure() {
  process.env.SUPABASE_URL = URL_VAR;
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
}
function unconfigure() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
}

unconfigure();
const { supabaseConfigured, secretKey, restBase, authHeaders } = await import("./_supabase.js");
const { readRouting, writeRouting, routingIsDurable } = await import("./_routing.js");

/** Run `fn` with fetch stubbed to `handler`. */
async function withFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

// -- Configuration detection ---------------------------------------------------

test("both env vars are required before anything reports itself durable", () => {
  unconfigure();
  assert.equal(supabaseConfigured(), false);
  assert.equal(routingIsDurable(), false);

  process.env.SUPABASE_URL = URL_VAR;
  assert.equal(supabaseConfigured(), false, "a URL with no key is not a configured store");

  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  assert.equal(supabaseConfigured(), true);
  assert.equal(routingIsDurable(), true);
  unconfigure();
});

test("the key is read under either name Supabase has used for it", () => {
  // A project that is genuinely set up, an env var that is genuinely present, and
  // a feature reporting itself unconfigured because the two names disagree is the
  // worst-looking version of this failure — it looks identical to having no
  // Supabase at all.
  unconfigure();
  process.env.SUPABASE_URL = URL_VAR;
  process.env.SUPABASE_SERVICE_KEY = "legacy_service_key";
  assert.equal(secretKey(), "legacy_service_key");
  assert.equal(supabaseConfigured(), true);

  process.env.SUPABASE_SECRET_KEY = "sb_secret_current";
  assert.equal(secretKey(), "sb_secret_current", "the current name wins when both are set");
  unconfigure();
});

test("a trailing slash on the URL does not produce a double slash", () => {
  unconfigure();
  process.env.SUPABASE_URL = URL_VAR + "/";
  process.env.SUPABASE_SECRET_KEY = "k";
  assert.equal(restBase(), URL_VAR + "/rest/v1");
  unconfigure();
});

test("the secret key is sent as both apikey and bearer, as PostgREST expects", () => {
  configure();
  const h = authHeaders();
  assert.equal(h.apikey, "sb_secret_test");
  assert.equal(h.Authorization, "Bearer sb_secret_test");
  unconfigure();
});

// -- Routing: fails SOFT -------------------------------------------------------

test("routing reads null when no store is configured, rather than throwing", async () => {
  unconfigure();
  assert.equal(await readRouting(), null);
});

test("an unreachable store degrades routing to the committed defaults", async () => {
  // Deliberately soft. DEFAULT_ROUTING is a configuration that shipped, so
  // serving it is a degradation rather than a failure — the alternative is every
  // AI call in the app going down because one config read failed.
  configure();
  const out = await withFetch(async () => { throw new Error("network down"); }, readRouting);
  assert.equal(out, null, "a read failure must look like 'nothing stored', not an exception");
  unconfigure();
});

test("a non-OK read also degrades rather than throwing", async () => {
  configure();
  const out = await withFetch(
    async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "" }),
    readRouting,
  );
  assert.equal(out, null);
  unconfigure();
});

test("a stored routing reads back as an object", async () => {
  // Postgres returns jsonb as an object. Redis returned the string it was handed,
  // which is why the old implementation parsed and this one does not.
  configure();
  const out = await withFetch(
    async () => ({ ok: true, json: async () => [{ value: { capture: "claude-haiku-4-5" } }] }),
    readRouting,
  );
  assert.deepEqual(out, { capture: "claude-haiku-4-5" });
  unconfigure();
});

test("an absent row reads as null, not as an empty object", async () => {
  configure();
  const out = await withFetch(async () => ({ ok: true, json: async () => [] }), readRouting);
  assert.equal(out, null);
  unconfigure();
});

// -- Routing writes: never quietly succeed ------------------------------------

test("a write with no store configured reports durable:false and names the fix", async () => {
  // Reporting a successful save that evaporates on the next request is exactly
  // the class of bug store.js was rewritten to stop doing in the browser.
  unconfigure();
  const res = await writeRouting({ capture: "claude-haiku-4-5" });
  assert.equal(res.ok, false);
  assert.equal(res.durable, false);
  assert.match(res.message, /SUPABASE_URL/);
  assert.match(res.message, /0003_runtime\.sql/, "the operator needs to be told the migration is the missing step");
});

test("a rejected write reports failure rather than success", async () => {
  configure();
  const res = await withFetch(
    async () => ({ ok: false, status: 404, text: async () => "relation app_config does not exist" }),
    () => writeRouting({ capture: "claude-haiku-4-5" }),
  );
  assert.equal(res.ok, false);
  assert.equal(res.durable, false);
  assert.match(res.message, /0003_runtime\.sql/, "a 404 here almost always means the migration was not applied");
  unconfigure();
});

test("a successful write reports durable:true and upserts", async () => {
  configure();
  let sent = null;
  const res = await withFetch(
    async (_url, opts) => { sent = opts; return { ok: true, status: 201, text: async () => "", json: async () => [] }; },
    () => writeRouting({ capture: "claude-haiku-4-5" }),
  );
  assert.equal(res.ok, true);
  assert.equal(res.durable, true);
  // Without merge-duplicates a second save of the same key is a primary-key
  // violation rather than an update, which would make routing writable exactly
  // once.
  assert.match(sent.headers.Prefer, /merge-duplicates/);
  unconfigure();
});
