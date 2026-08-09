// Tests for api/_geminiAuth.js — the AI-Studio-vs-Vertex auth switch.
//
// The failure mode worth guarding here is not "the HTTP call fails" (that is
// the same upstream-error path every adapter already has), it is "the wrong
// mode gets picked silently" or "the JWT this app hands Google does not
// actually verify" — either one means a deployment believes it is spending
// Vertex-billed Cloud credits while it is actually still hitting AI Studio,
// or the reverse. Network calls (the token exchange, the actual generateContent
// request) are stubbed or avoided rather than hitting Google — same posture
// as admin.test.js stubbing Upstash.
//
// Run with: node --test api/geminiAuth.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  geminiAuthMode, geminiConfigured, geminiNotConfiguredError, geminiEndpoint, geminiAuthHeaders, _internal,
} from "./_geminiAuth.js";

const { parseServiceAccount, buildAssertion, resetTokenCache } = _internal;

const VERTEX_VARS = ["GEMINI_AUTH_MODE", "GCP_PROJECT_ID", "GCP_LOCATION", "GOOGLE_APPLICATION_CREDENTIALS", "GEMINI_API_KEY"];

/** Clear every var this module reads, run `fn`, then restore what was there before. */
async function withEnv(overrides, fn) {
  const saved = Object.fromEntries(VERTEX_VARS.map(k => [k, process.env[k]]));
  for (const k of VERTEX_VARS) delete process.env[k];
  Object.assign(process.env, overrides);
  try { await fn(); }
  finally {
    for (const k of VERTEX_VARS) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    resetTokenCache();
  }
}

function fromBase64Url(s) {
  return Buffer.from(s, "base64url");
}

// -- Mode detection --------------------------------------------------------

test("with nothing set, the mode is aistudio", () =>
  withEnv({}, () => {
    assert.equal(geminiAuthMode(), "aistudio");
    assert.equal(geminiConfigured(), false);
  }));

test("all three Vertex vars present switches the mode to vertex", () =>
  withEnv({ GCP_PROJECT_ID: "p", GCP_LOCATION: "us-central1", GOOGLE_APPLICATION_CREDENTIALS: "{}" }, () => {
    assert.equal(geminiAuthMode(), "vertex");
  }));

test("a partially-configured Vertex (missing one var) falls back to aistudio", () =>
  withEnv({ GCP_PROJECT_ID: "p", GCP_LOCATION: "us-central1" }, () => {
    // GOOGLE_APPLICATION_CREDENTIALS is missing — this must not half-activate Vertex.
    assert.equal(geminiAuthMode(), "aistudio");
  }));

test("GEMINI_AUTH_MODE=vertex forces Vertex even with no vars set, and configured() says so honestly", () =>
  withEnv({ GEMINI_AUTH_MODE: "vertex" }, () => {
    assert.equal(geminiAuthMode(), "vertex");
    // The override states an intent; it must not be silently ignored, but it also
    // must not report itself as usable when the credentials it needs aren't there.
    assert.equal(geminiConfigured(), false);
    assert.match(geminiNotConfiguredError(), /GEMINI_AUTH_MODE=vertex/);
  }));

test("GEMINI_AUTH_MODE=aistudio forces AI Studio even when all Vertex vars are present", () =>
  withEnv({
    GEMINI_AUTH_MODE: "aistudio",
    GCP_PROJECT_ID: "p", GCP_LOCATION: "us-central1", GOOGLE_APPLICATION_CREDENTIALS: "{}",
  }, () => {
    assert.equal(geminiAuthMode(), "aistudio");
  }));

test("an unrecognised GEMINI_AUTH_MODE value is ignored in favour of auto-detection", () =>
  withEnv({ GEMINI_AUTH_MODE: "banana", GEMINI_API_KEY: "k" }, () => {
    assert.equal(geminiAuthMode(), "aistudio");
    assert.equal(geminiConfigured(), true);
  }));

test("aistudio mode is configured exactly when GEMINI_API_KEY is set", () =>
  withEnv({ GEMINI_API_KEY: "k" }, () => {
    assert.equal(geminiConfigured(), true);
  }));

// -- Endpoint construction ---------------------------------------------------

test("the aistudio endpoint hits generativelanguage.googleapis.com", () =>
  withEnv({}, () => {
    assert.equal(
      geminiEndpoint("gemini-3.1-pro"),
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro:generateContent",
    );
  }));

test("the vertex endpoint embeds project, location and model", () =>
  withEnv({ GEMINI_AUTH_MODE: "vertex", GCP_PROJECT_ID: "my-proj", GCP_LOCATION: "us-central1" }, () => {
    assert.equal(
      geminiEndpoint("gemini-3.1-pro"),
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-3.1-pro:generateContent",
    );
  }));

// -- Service-account parsing --------------------------------------------------

test("parseServiceAccount accepts raw JSON", () => {
  const account = parseServiceAccount('{"client_email":"a@b.iam.gserviceaccount.com","private_key":"x"}');
  assert.equal(account.client_email, "a@b.iam.gserviceaccount.com");
});

test("parseServiceAccount accepts the same JSON base64-encoded", () => {
  const json = '{"client_email":"a@b.iam.gserviceaccount.com","private_key":"x"}';
  const account = parseServiceAccount(Buffer.from(json).toString("base64"));
  assert.equal(account.client_email, "a@b.iam.gserviceaccount.com");
});

test("parseServiceAccount returns null for garbage rather than throwing", () => {
  assert.equal(parseServiceAccount("not json and not base64-json either"), null);
});

test("a Vertex-mode request with an unparsable service account fails with a clear error, not a stack trace", () =>
  withEnv({ GEMINI_AUTH_MODE: "vertex", GCP_PROJECT_ID: "p", GCP_LOCATION: "us-central1", GOOGLE_APPLICATION_CREDENTIALS: "garbage" }, async () => {
    await assert.rejects(geminiAuthHeaders(), /service-account key/);
  }));

// -- The JWT assertion: build it, then verify it the way Google would --------
//
// generateKeyPairSync runs once for every test in this block rather than per
// test — RSA keygen is the slow part of this file and none of these tests
// need a distinct key.
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const ACCOUNT = { client_email: "test@example.iam.gserviceaccount.com", private_key: privateKey };
const NOW = 1_700_000_000;

test("the assertion's claims name the service account and Google's token endpoint", () => {
  const [headerB64, claimsB64] = buildAssertion(ACCOUNT, NOW).split(".");
  const header = JSON.parse(fromBase64Url(headerB64));
  const claims = JSON.parse(fromBase64Url(claimsB64));

  assert.equal(header.alg, "RS256");
  assert.equal(claims.iss, ACCOUNT.client_email);
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claims.scope, "https://www.googleapis.com/auth/cloud-platform");
  assert.equal(claims.iat, NOW);
  assert.equal(claims.exp, NOW + 3600, "a token Google will actually accept needs a bounded lifetime");
});

test("the assertion's signature verifies against the account's own public key", () => {
  // This is the assertion that actually matters: Google will reject anything
  // whose signature does not match, so a JWT that merely *looks* right is
  // worthless. Round-tripping through crypto.createVerify is the only way to
  // know the header/claims/signature triplet was assembled correctly.
  const assertion = buildAssertion(ACCOUNT, NOW);
  const [headerB64, claimsB64, sigB64] = assertion.split(".");
  const ok = createVerify("RSA-SHA256")
    .update(`${headerB64}.${claimsB64}`)
    .verify(publicKey, fromBase64Url(sigB64));
  assert.ok(ok, "the JWT signature must verify against the service account's public key");
});

test("a signature does not verify against a different key", () => {
  const { publicKey: otherPublicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const [headerB64, claimsB64, sigB64] = buildAssertion(ACCOUNT, NOW).split(".");
  const ok = createVerify("RSA-SHA256").update(`${headerB64}.${claimsB64}`).verify(otherPublicKey, fromBase64Url(sigB64));
  assert.equal(ok, false, "a mismatched key must not verify — otherwise this test proves nothing");
});

// -- geminiAuthHeaders: the two modes, and token reuse ------------------------

test("aistudio mode returns the x-goog-api-key header and touches no network", () =>
  withEnv({ GEMINI_API_KEY: "the-key" }, async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("aistudio mode must not make a network call to get its headers"); };
    try {
      const headers = await geminiAuthHeaders();
      assert.equal(headers["x-goog-api-key"], "the-key");
    } finally { globalThis.fetch = realFetch; }
  }));

test("vertex mode exchanges the assertion for a bearer token", () =>
  withEnv({
    GEMINI_AUTH_MODE: "vertex", GCP_PROJECT_ID: "p", GCP_LOCATION: "us-central1",
    GOOGLE_APPLICATION_CREDENTIALS: JSON.stringify(ACCOUNT),
  }, async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls++;
      assert.equal(url, "https://oauth2.googleapis.com/token");
      return { ok: true, json: async () => ({ access_token: "minted-token", expires_in: 3600 }) };
    };
    try {
      const headers = await geminiAuthHeaders();
      assert.equal(headers.Authorization, "Bearer minted-token");

      // A second call within the token's lifetime must reuse it rather than
      // minting again — every warm invocation doing its own token exchange
      // would mean an extra Google round trip (and quota draw) per request.
      await geminiAuthHeaders();
      assert.equal(calls, 1, "a still-valid token must be reused, not re-minted");
    } finally { globalThis.fetch = realFetch; }
  }));

test("a failed token exchange surfaces Google's error rather than throwing an opaque one", () =>
  withEnv({
    GEMINI_AUTH_MODE: "vertex", GCP_PROJECT_ID: "p", GCP_LOCATION: "us-central1",
    GOOGLE_APPLICATION_CREDENTIALS: JSON.stringify(ACCOUNT),
  }, async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "invalid_grant", error_description: "Invalid JWT." }) });
    try {
      await assert.rejects(geminiAuthHeaders(), /Invalid JWT/);
    } finally { globalThis.fetch = realFetch; }
  }));
