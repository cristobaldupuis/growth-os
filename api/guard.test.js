// Tests for the shared transport guard.
//
// This module is now the single thing standing between three metered provider
// APIs and the open internet, so the properties below are the ones that
// actually bound spend: who gets through, how big a body is accepted, when a
// 429 fires, and — the one most easily broken by a refactor — that an
// unavailable limiter fails CLOSED rather than open.
//
// ALLOWED_ORIGINS is read at module load, so it is set before the import.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGINS = "https://allowed.example,https://second.example";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { guardEntry, guardRateLimit, clientIp, HOUR_MS } = await import("./_guard.js");

/** Minimal req/res doubles recording what the handler did. */
function mkReq({ method = "POST", origin, referer, length = 10, ip = "1.2.3.4" } = {}) {
  const headers = { "content-length": String(length), "x-forwarded-for": ip };
  if (origin) headers.origin = origin;
  if (referer) headers.referer = referer;
  return { method, headers, body: {} };
}
function mkRes() {
  const r = { statusCode: null, body: undefined, headers: {}, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}
const ENTRY = { maxBodyBytes: 1000 };

// -- guardEntry ---------------------------------------------------------------

test("a POST from an allowed origin passes through", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ origin: "https://allowed.example" }), res, ENTRY), false);
  assert.equal(res.statusCode, null);
});

test("an allowed origin is echoed back with Vary, so caches do not cross-serve", () => {
  const res = mkRes();
  guardEntry(mkReq({ origin: "https://allowed.example" }), res, ENTRY);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://allowed.example");
  assert.equal(res.headers["Vary"], "Origin");
});

test("an unlisted origin is refused and never echoed", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ origin: "https://evil.example" }), res, ENTRY), true);
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
});

test("no origin and no referer is refused — it fails closed, not open", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq(), res, ENTRY), true);
  assert.equal(res.statusCode, 403);
});

test("a referer prefix stands in when the browser omits Origin", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ referer: "https://second.example/app" }), res, ENTRY), false);
});

test("a referer on a hostname that merely STARTS WITH an allowed origin does not pass", () => {
  // The bug: `referer.startsWith(allowedOrigin)` is true for
  // `https://allowed.example.evil.test/`, because the allowed origin genuinely is
  // a prefix of that string. Anyone able to register a hostname with ours on the
  // front would have satisfied the check. Matching at a path boundary means the
  // authority component has to match exactly.
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ referer: "https://allowed.example.evil.test/app" }), res, ENTRY), true);
  assert.equal(res.statusCode, 403);
});

test("a referer that is exactly the allowed origin, with no path, passes", () => {
  assert.equal(guardEntry(mkReq({ referer: "https://allowed.example" }), mkRes(), ENTRY), false);
});

test("a body with no Content-Length is measured rather than trusted", () => {
  // A chunked request omits the header entirely, so the cheap check abstains and
  // the parsed body is what gets weighed.
  const req = mkReq({ origin: "https://allowed.example", length: 0 });
  req.headers["content-length"] = "";
  req.body = { blob: "x".repeat(2000) };
  const res = mkRes();
  assert.equal(guardEntry(req, res, ENTRY), true);
  assert.equal(res.statusCode, 413);
});

test("a small body with no Content-Length still passes", () => {
  const req = mkReq({ origin: "https://allowed.example", length: 0 });
  req.headers["content-length"] = "";
  req.body = { ok: true };
  assert.equal(guardEntry(req, mkRes(), ENTRY), false);
});

test("an unserialisable body abstains rather than being refused on size", () => {
  // This is a size guard, not a well-formedness one — the endpoint validators
  // judge the body on their own terms.
  const req = mkReq({ origin: "https://allowed.example", length: 0 });
  req.headers["content-length"] = "";
  const cyclic = { a: 1 }; cyclic.self = cyclic;
  req.body = cyclic;
  assert.equal(guardEntry(req, mkRes(), ENTRY), false);
});

test("a referer that merely contains an allowed origin does not pass", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ referer: "https://evil.example/?q=https://allowed.example" }), res, ENTRY), true);
  assert.equal(res.statusCode, 403);
});

test("OPTIONS is answered 200 and stops the handler", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ method: "OPTIONS" }), res, ENTRY), true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.ended, true);
});

test("a non-POST method is refused", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ method: "GET", origin: "https://allowed.example" }), res, ENTRY), true);
  assert.equal(res.statusCode, 405);
});

test("a body over the ceiling is refused before any upstream call", () => {
  const res = mkRes();
  assert.equal(guardEntry(mkReq({ origin: "https://allowed.example", length: 1001 }), res, ENTRY), true);
  assert.equal(res.statusCode, 413);
});

test("the body ceiling is per-caller, so the tight endpoints stay tight", () => {
  const req = mkReq({ origin: "https://allowed.example", length: 20 * 1024 });
  assert.equal(guardEntry(req, mkRes(), { maxBodyBytes: 512 * 1024 }), false, "text proxy accepts it");
  assert.equal(guardEntry(req, mkRes(), { maxBodyBytes: 16 * 1024 }), true, "video proxy does not");
});

// -- clientIp -----------------------------------------------------------------

test("the first forwarded hop is the rate-limit identity", () => {
  assert.equal(clientIp({ headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }), "9.9.9.9");
});

test("a missing forwarded header still yields a bucket rather than throwing", () => {
  assert.equal(clientIp({ headers: {} }), "unknown");
});

// -- guardRateLimit (in-memory path) -----------------------------------------

const RL = (key, max) => ({ key, max, limitMessage: "slow down", label: "Test" });

test("requests under the ceiling pass", async () => {
  const key = "test:under";
  for (let i = 0; i < 3; i++) {
    assert.equal(await guardRateLimit(mkReq(), mkRes(), RL(key, 3)), false);
  }
});

test("the request past the ceiling gets the caller's own 429 message", async () => {
  const key = "test:over";
  for (let i = 0; i < 2; i++) await guardRateLimit(mkReq(), mkRes(), RL(key, 2));
  const res = mkRes();
  assert.equal(await guardRateLimit(mkReq(), res, RL(key, 2)), true);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "slow down");
});

test("separate keys are separate budgets — image spend cannot exhaust text", async () => {
  await guardRateLimit(mkReq(), mkRes(), RL("gos:img:x", 1));
  const spent = mkRes();
  assert.equal(await guardRateLimit(mkReq(), spent, RL("gos:img:x", 1)), true, "image bucket is spent");
  const text = mkRes();
  assert.equal(await guardRateLimit(mkReq(), text, RL("gos:rl:x", 1)), false, "text bucket is untouched");
});

// -- guardRateLimit (durable path, and the failure mode that matters) ---------

test("an unavailable rate-limit backend fails CLOSED with a 503", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network down"); };
  try {
    const res = mkRes();
    assert.equal(await guardRateLimit(mkReq(), res, RL("test:closed", 100)), true);
    assert.equal(res.statusCode, 503, "must not fall through to the upstream provider");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("a non-OK response from the backend also fails closed", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const res = mkRes();
    assert.equal(await guardRateLimit(mkReq(), res, RL("test:closed2", 100)), true);
    assert.equal(res.statusCode, 503);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("an unreadable count fails closed rather than being coerced to zero", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ result: "not-a-number" }] });
  try {
    const res = mkRes();
    assert.equal(await guardRateLimit(mkReq(), res, RL("test:closed3", 100)), true);
    assert.equal(res.statusCode, 503);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("the durable count decides the limit when the backend is healthy", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  const realFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ result: ++count }] });
  try {
    assert.equal(await guardRateLimit(mkReq(), mkRes(), RL("test:durable", 2)), false, "1st");
    assert.equal(await guardRateLimit(mkReq(), mkRes(), RL("test:durable", 2)), false, "2nd");
    const res = mkRes();
    assert.equal(await guardRateLimit(mkReq(), res, RL("test:durable", 2)), true, "3rd is over");
    assert.equal(res.statusCode, 429);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("the default window is an hour, matching what every endpoint assumed", () => {
  assert.equal(HOUR_MS, 60 * 60 * 1000);
});
