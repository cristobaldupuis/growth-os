// api/_geminiAuth.js — resolves Gemini auth to AI Studio or Vertex AI.
//
// ## Why there are two
//
// Same models, two Google products, two billing pools:
//
//   AI Studio (Gemini Developer API)   generativelanguage.googleapis.com
//     A static key in a header. Bills against the key's own AI Studio balance.
//     As of March 2026 Google Cloud Billing credits — including the free
//     trial — are explicitly excluded from this pool.
//
//   Vertex AI                          {location}-aiplatform.googleapis.com
//     A short-lived OAuth2 Bearer token minted from a service-account key.
//     Bills against the GCP project's Cloud Billing account, so promotional
//     and free-trial credits sitting there actually apply.
//
// ## Why this is additive rather than a replacement
//
// Every other provider in this app (Anthropic, OpenAI, OpenRouter, HeyGen,
// VEED, D-ID) authenticates with one static key in one header — there is no
// OAuth2 machinery anywhere else in the codebase. Vertex activates only once
// all three of GCP_PROJECT_ID, GCP_LOCATION and GOOGLE_APPLICATION_CREDENTIALS
// are present, so a deployment running on a plain GEMINI_API_KEY keeps working
// exactly as before. GEMINI_AUTH_MODE overrides the auto-detect when you want
// to force a side explicitly — e.g. testing Vertex without deleting a working
// AI Studio key, or rolling back without touching credentials.
//
// See DECISIONS.md ("Gemini auth: additive Vertex path, not a replacement").

import { createSign } from "node:crypto";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
// Google access tokens are typically valid ~3600s. Refreshing this early
// keeps a slow request from starting mid-flight with a token that expires
// before the upstream call completes.
const REFRESH_SKEW_MS = 60_000;

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * GOOGLE_APPLICATION_CREDENTIALS holds the service-account key JSON directly,
 * or that JSON base64-encoded. Vercel env vars are single-line and a raw key
 * file's `private_key` field embeds literal newlines, so base64 is the
 * practical way to paste one in; plain JSON is accepted too since nothing
 * stops it from working. Returns null rather than throwing — the caller turns
 * that into one clear config-error message instead of a raw parse exception.
 */
function parseServiceAccount(raw) {
  if (!raw) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  return tryParse(raw) || tryParse(Buffer.from(raw, "base64").toString("utf8"));
}

function vertexVarsPresent() {
  return !!(process.env.GCP_PROJECT_ID && process.env.GCP_LOCATION && process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

/** "vertex" | "aistudio". GEMINI_AUTH_MODE forces a side; otherwise auto-detected from which vars are set. */
export function geminiAuthMode() {
  const forced = process.env.GEMINI_AUTH_MODE?.toLowerCase();
  if (forced === "vertex" || forced === "aistudio") return forced;
  return vertexVarsPresent() ? "vertex" : "aistudio";
}

export function geminiConfigured() {
  return geminiAuthMode() === "vertex" ? vertexVarsPresent() : !!process.env.GEMINI_API_KEY;
}

/** One clear sentence for the "not configured" 500s in proxy.js and image.js. */
export function geminiNotConfiguredError() {
  return geminiAuthMode() === "vertex"
    ? "GEMINI_AUTH_MODE=vertex is set, but GCP_PROJECT_ID, GCP_LOCATION and GOOGLE_APPLICATION_CREDENTIALS are not all present."
    : "Gemini is not configured. Set GEMINI_API_KEY, or GCP_PROJECT_ID + GCP_LOCATION + GOOGLE_APPLICATION_CREDENTIALS for Vertex.";
}

/** The upstream generateContent URL for the active mode. Both shapes end in `models/{id}:generateContent`. */
export function geminiEndpoint(model) {
  if (geminiAuthMode() === "vertex") {
    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION;
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  }
  return `${GEMINI_API}/${model}:generateContent`;
}

/**
 * Build the RS256 JWT assertion a service account exchanges for an access
 * token (the standard Google "OAuth 2.0 for Server to Server Applications"
 * flow — https://developers.google.com/identity/protocols/oauth2/service-account).
 * Pure and takes `nowSeconds` explicitly so it is testable without mocking
 * the clock or the network.
 */
export function buildAssertion(account, nowSeconds) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: VERTEX_SCOPE,
    aud: TOKEN_URI,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  return `${signingInput}.${signVertexJwt(signingInput, account.private_key)}`;
}

// Node's built-in crypto covers RS256 signing — no need for google-auth-library
// just to mint one token type, and it keeps this file dependency-free like
// every other adapter in api/_adapters.js.
function signVertexJwt(signingInput, privateKeyPem) {
  return base64url(createSign("RSA-SHA256").update(signingInput).sign(privateKeyPem));
}

async function exchangeAssertion(assertion) {
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error_description || json?.error || "Vertex token exchange failed.");
  return json;
}

async function mintVertexAccessToken() {
  const account = parseServiceAccount(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!account?.client_email || !account?.private_key) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS does not hold a valid service-account key (needs client_email and private_key).");
  }
  const assertion = buildAssertion(account, Math.floor(Date.now() / 1000));
  const { access_token: accessToken, expires_in: expiresIn } = await exchangeAssertion(assertion);
  return { accessToken, expiresAtMs: Date.now() + expiresIn * 1000 - REFRESH_SKEW_MS };
}

// Module-level, so a warm Lambda instance reuses one token across invocations
// instead of minting a fresh one (and paying a Google round trip) on every
// request. Same "per warm instance" tradeoff the rate limiter's in-memory
// fallback already makes — see api/proxy.js.
let cachedToken = null;

async function getVertexAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs) return cachedToken.accessToken;
  cachedToken = await mintVertexAccessToken();
  return cachedToken.accessToken;
}

/** Auth headers for the active mode. Async because Vertex may need to mint or refresh a token. */
export async function geminiAuthHeaders() {
  if (geminiAuthMode() === "vertex") {
    return { "Content-Type": "application/json", Authorization: `Bearer ${await getVertexAccessToken()}` };
  }
  return { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY };
}

// Exported for the unit tests, which build a throwaway keypair and round-trip
// a real signature rather than going near Google's token endpoint.
export const _internal = { base64url, parseServiceAccount, vertexVarsPresent, buildAssertion, resetTokenCache: () => { cachedToken = null; } };
