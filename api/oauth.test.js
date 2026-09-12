// Tests for api/_oauth.js — the pure logic behind the MCP connector's OAuth
// server: PKCE, redirect-URI and scope validation, token shape, and the body
// helpers. The network-calling halves (register/authorize/token handlers) are
// exercised the same way api/state.js's handlers are — not unit-tested here;
// see that file's header on why this codebase's suite stops at the pure
// functions and leaves the PostgREST calls themselves untested.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  pkceVerify, isAcceptableRedirectUri, normalizeScope, scopeHas,
  newClientId, newAuthCode, newToken, hashToken, rawBearerToken,
  bodyTooLarge, parseFormOrJson, originOf,
  ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS, AUTH_CODE_TTL_MS,
} from "./_oauth.js";

// -- PKCE -----------------------------------------------------------------

test("a matching verifier and S256 challenge verify", () => {
  const verifier = "a".repeat(64);
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  assert.equal(pkceVerify(verifier, challenge), true);
});

test("a wrong verifier is refused", () => {
  const challenge = createHash("sha256").update("correct", "ascii").digest("base64url");
  assert.equal(pkceVerify("wrong", challenge), false);
});

test("a challenge of a different length never reaches timingSafeEqual", () => {
  // timingSafeEqual throws on a length mismatch; this must not throw.
  assert.doesNotThrow(() => pkceVerify("verifier", "short"));
  assert.equal(pkceVerify("verifier", "short"), false);
});

test("empty or non-string inputs are refused, not thrown on", () => {
  assert.equal(pkceVerify("", "x"), false);
  assert.equal(pkceVerify("x", ""), false);
  assert.equal(pkceVerify(null, "x"), false);
  assert.equal(pkceVerify(undefined, undefined), false);
});

// -- redirect_uri -----------------------------------------------------------

test("an https redirect is accepted", () => {
  assert.equal(isAcceptableRedirectUri("https://claude.ai/api/mcp/callback"), true);
});

test("loopback http is accepted, for a locally-running client", () => {
  assert.equal(isAcceptableRedirectUri("http://localhost:33418/callback"), true);
  assert.equal(isAcceptableRedirectUri("http://127.0.0.1:33418/callback"), true);
});

test("a non-loopback http redirect is refused", () => {
  assert.equal(isAcceptableRedirectUri("http://example.com/callback"), false);
});

test("a malformed URI is refused rather than thrown on", () => {
  assert.equal(isAcceptableRedirectUri("not a url"), false);
  assert.equal(isAcceptableRedirectUri(""), false);
});

test("a custom-scheme redirect is refused", () => {
  assert.equal(isAcceptableRedirectUri("myapp://callback"), false);
});

// -- scope --------------------------------------------------------------------

test("an unrecognised scope request falls back to read-only", () => {
  assert.equal(normalizeScope(""), "read");
  assert.equal(normalizeScope("admin superuser"), "read");
  assert.equal(normalizeScope(undefined), "read");
});

test("known scopes pass through, unknown ones are dropped", () => {
  assert.equal(normalizeScope("read write"), "read write");
  assert.equal(normalizeScope("write admin"), "write");
});

test("scopeHas checks membership in the space-separated string", () => {
  assert.equal(scopeHas("read write", "write"), true);
  assert.equal(scopeHas("read", "write"), false);
  assert.equal(scopeHas("", "read"), false);
});

// -- token / code / client id shape -----------------------------------------

test("generated identifiers carry a recognisable, distinct prefix", () => {
  assert.match(newClientId(), /^mcp_client_/);
  assert.match(newAuthCode(), /^mcp_code_/);
  assert.match(newToken("access"), /^mcp_at_/);
  assert.match(newToken("refresh"), /^mcp_rt_/);
});

test("hashToken is deterministic and never returns the input", () => {
  const secret = "mcp_at_abc123";
  const h1 = hashToken(secret);
  const h2 = hashToken(secret);
  assert.equal(h1, h2);
  assert.notEqual(h1, secret);
  assert.equal(h1.length, 64); // sha256 hex
});

test("rawBearerToken accepts an opaque token a JWT-shape check would reject", () => {
  assert.equal(rawBearerToken({ headers: { authorization: "Bearer mcp_at_notAJwt" } }), "mcp_at_notAJwt");
  assert.equal(rawBearerToken({ headers: {} }), null);
  assert.equal(rawBearerToken({ headers: { authorization: "Basic x" } }), null);
});

test("token lifetimes are sane and refresh outlives access", () => {
  assert.ok(ACCESS_TOKEN_TTL_MS > 0);
  assert.ok(REFRESH_TOKEN_TTL_MS > ACCESS_TOKEN_TTL_MS);
  assert.ok(AUTH_CODE_TTL_MS > 0 && AUTH_CODE_TTL_MS <= 15 * 60 * 1000);
});

// -- body helpers -------------------------------------------------------------

test("bodyTooLarge trusts Content-Length first", () => {
  assert.equal(bodyTooLarge({ headers: { "content-length": "999999" } }, 100), true);
  assert.equal(bodyTooLarge({ headers: { "content-length": "10" } }, 100), false);
});

test("bodyTooLarge measures the parsed body when Content-Length is absent", () => {
  const big = { data: "x".repeat(200) };
  assert.equal(bodyTooLarge({ headers: {}, body: big }, 50), true);
  assert.equal(bodyTooLarge({ headers: {}, body: { a: 1 } }, 50), false);
});

test("parseFormOrJson passes through an already-parsed object", () => {
  assert.deepEqual(parseFormOrJson({ headers: {}, body: { a: 1 } }), { a: 1 });
});

test("parseFormOrJson reads url-encoded form bodies for the token endpoint", () => {
  const req = { headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=abc" };
  assert.deepEqual(parseFormOrJson(req), { grant_type: "refresh_token", refresh_token: "abc" });
});

test("parseFormOrJson reads a JSON string body", () => {
  const req = { headers: { "content-type": "application/json" }, body: '{"grant_type":"authorization_code"}' };
  assert.deepEqual(parseFormOrJson(req), { grant_type: "authorization_code" });
});

test("parseFormOrJson never throws on a missing or malformed body", () => {
  assert.deepEqual(parseFormOrJson({ headers: {} }), {});
  assert.deepEqual(parseFormOrJson({ headers: { "content-type": "application/json" }, body: "{not json" }), {});
});

// -- origin -------------------------------------------------------------------

test("originOf is built from the request's own host, not a hardcoded value", () => {
  assert.equal(originOf({ headers: { host: "growth-os-iota-seven.vercel.app" } }), "https://growth-os-iota-seven.vercel.app");
  assert.equal(originOf({ headers: { host: "preview-abc123.vercel.app" } }), "https://preview-abc123.vercel.app");
});
