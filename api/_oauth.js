// api/_oauth.js — shared plumbing for the MCP connector's OAuth server.
//
// Underscore-prefixed so Vercel does not route it as a function; it is a
// module api/oauth.js and api/mcp.js import.
//
// ## Why this exists as a second auth system rather than reusing api/_auth.js
//
// api/_auth.js answers "whose Supabase session is this" for the browser app.
// This answers a different question: "which MCP client, registered by whom,
// holds a token we minted, scoped to which workspace." The two are related —
// api/oauth.js's authorize action calls into api/_auth.js's token
// verification to find out who is signing in — but the tokens themselves are
// ours: opaque, independently revocable, and never the Supabase session
// itself. See the migration header in 0006_mcp.sql for the full reasoning.
//
// ## node:crypto only
//
// Same reason as api/_geminiAuth.js and api/_session.js: this project's
// runtime dependencies are react and react-dom. PKCE is a SHA-256 and a
// base64url encode; a token is random bytes; neither needs a library.

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { restBase, authHeaders } from "./_supabase.js";

const TIMEOUT_MS = 8000;

// -- Token lifetimes -------------------------------------------------------

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;           // 1 hour
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;                // 5 minutes, one-shot

// -- Random identifiers and secrets -----------------------------------------

const b64url = (buf) => buf.toString("base64url");

/** A new client_id. Not a secret — this is a public identifier (RFC 7591). */
export const newClientId = () => `mcp_client_${b64url(randomBytes(16))}`;

/** A new one-time authorization code. */
export const newAuthCode = () => `mcp_code_${b64url(randomBytes(32))}`;

/** A new opaque bearer token. `kind` is embedded in the prefix for readability
 * in logs and so a caller can reject the wrong kind before hashing. */
export const newToken = (kind) => `mcp_${kind === "refresh" ? "rt" : "at"}_${b64url(randomBytes(32))}`;

/** SHA-256 hex digest — what is actually stored, never the raw secret. */
export const hashToken = (secret) => createHash("sha256").update(String(secret), "utf8").digest("hex");

// -- PKCE (RFC 7636), S256 only ---------------------------------------------
//
// "plain" is accepted by the spec but defeats the point — it is the code
// challenge and the verifier being the same string, which protects against
// nothing an attacker who can see the authorize request couldn't already do.
// The MCP authorization spec requires S256; refusing "plain" here means the
// client always gets an unambiguous rejection rather than a connector that
// silently downgrades its own security.

/** True when `verifier` hashes to `challenge` under S256. Constant-time. */
export function pkceVerify(verifier, challenge) {
  if (typeof verifier !== "string" || typeof challenge !== "string" || !verifier || !challenge) return false;
  const computed = b64url(createHash("sha256").update(verifier, "ascii").digest());
  // Both are base64url and therefore fixed alphabet, but lengths can still
  // differ for a malformed challenge — guard before timingSafeEqual, which
  // throws on a length mismatch rather than returning false.
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

// -- Redirect URI validation --------------------------------------------------
//
// OAuth 2.1's native-app guidance: a redirect URI is either a public HTTPS
// endpoint (claude.ai's own callback) or a loopback address a locally-running
// client is listening on (Claude Desktop, Claude Code, the MCP Inspector).
// Anything else — a bare http:// non-loopback host, a custom scheme with no
// further check — is refused at REGISTRATION time, which is cheaper and safer
// than trying to catch it later at every authorize call.
export function isAcceptableRedirectUri(uri) {
  let u;
  try { u = new URL(String(uri)); } catch { return false; }
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1")) return true;
  return false;
}

// -- Scope -------------------------------------------------------------------
//
// Two scopes, space-separated per RFC 6749: `read` and `write`. A client that
// asks for neither gets `read` — read-only is the safe default for a
// connector whose exact behaviour the person granting it has not seen yet.
const KNOWN_SCOPES = ["read", "write"];

export function normalizeScope(requested) {
  const asked = String(requested || "").trim().split(/\s+/).filter(Boolean);
  const granted = asked.filter((s) => KNOWN_SCOPES.includes(s));
  return granted.length ? granted.join(" ") : "read";
}

export const scopeHas = (scope, needed) => String(scope || "").split(/\s+/).includes(needed);

/** This deployment's own origin, from the request rather than a hardcoded
 * value — so the metadata documents below are correct on a preview deployment
 * or a custom domain without an environment variable to keep in sync. Vercel
 * terminates TLS in front of every deployment (production and preview alike),
 * so https is not a guess. */
export const originOf = (req) => `https://${req.headers.host}`;

// -- PostgREST -----------------------------------------------------------------
//
// A second copy of api/state.js's pgFetch rather than a shared export from
// _supabase.js. Both do the same fetch-with-timeout-and-error-shaping, and
// factoring it out would mean editing a stable, already-tested file's
// internals for a feature that does not touch it — not worth the coupling for
// one function this small.
export async function pgFetch(path, init = {}) {
  const res = await fetch(`${restBase()}${path}`, {
    ...init,
    headers: { ...authHeaders(), "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`postgrest ${path.split("?")[0]} returned ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
  return res;
}

// -- MCP access-token verification ------------------------------------------

const TOKEN_CACHE_TTL_MS = 60 * 1000;
const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map();

function tokenCacheGet(hash) {
  const hit = tokenCache.get(hash);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) { tokenCache.delete(hash); return null; }
  return hit.value;
}

function tokenCacheSet(hash, value) {
  if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(hash, { value, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
}

/** The raw bearer token on a request, unvalidated in shape — unlike
 * api/_auth.js's `bearerToken`, which requires a JWT's three dot-separated
 * segments. Ours are opaque `mcp_at_…` strings, not JWTs. */
export function rawBearerToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * The MCP access-token context for a request — `{ userId, workspaceId, scope,
 * clientId, role }` — or null when the token is missing, malformed, unknown,
 * expired, revoked, or belongs to a workspace the user is no longer a member
 * of.
 *
 * The membership recheck on every call (not just at token-mint time) is the
 * same discipline api/_auth.js's header commits to for browser sessions:
 * removing someone from a workspace has to actually cut off a token minted
 * while they were still a member, not just stop new ones being issued.
 * Cached for 60s for the same reason and with the same tradeoff — a revoked
 * token stays honoured for at most that long, in exchange for not paying two
 * round trips on every tool call in a fast back-to-back sequence.
 */
export async function verifyAccessToken(req) {
  const token = rawBearerToken(req);
  if (!token || !token.startsWith("mcp_at_")) return null;
  const hash = hashToken(token);
  const cached = tokenCacheGet(hash);
  if (cached) return cached;

  try {
    const res = await pgFetch(
      `/oauth_tokens?token_hash=eq.${encodeURIComponent(hash)}&kind=eq.access&revoked_at=is.null` +
      `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id,workspace_id,scope,client_id`,
    );
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;

    const memberRes = await pgFetch(
      `/workspace_members?workspace_id=eq.${encodeURIComponent(row.workspace_id)}&user_id=eq.${encodeURIComponent(row.user_id)}&select=role`,
    );
    const members = await memberRes.json();
    if (!Array.isArray(members) || !members.length) return null;

    const context = {
      userId: row.user_id, workspaceId: row.workspace_id, scope: row.scope,
      clientId: row.client_id, role: members[0].role,
    };
    tokenCacheSet(hash, context);
    return context;
  } catch (err) {
    console.error("oauth: could not verify MCP access token:", err);
    return null;
  }
}

/**
 * True when the request is over `maxBytes`, checked against Content-Length
 * first (cheap, and what an honest client sends) and the parsed body's actual
 * size otherwise — the same two-step api/_guard.js's `guardEntry` uses. Kept
 * here rather than imported from there because `guardEntry` also enforces the
 * browser-app origin allowlist, which none of these endpoints want: they are
 * called by MCP client infrastructure (Claude Desktop, Claude Code, claude.ai,
 * an org's Slack connector), not by this app's own bundle.
 */
export function bodyTooLarge(req, maxBytes) {
  const contentLength = Number(req.headers?.["content-length"] || 0);
  if (contentLength > maxBytes) return true;
  if (contentLength) return false;
  const body = req.body;
  if (body === undefined) return false;
  try {
    const size = typeof body === "string" ? Buffer.byteLength(body, "utf8") : Buffer.byteLength(JSON.stringify(body) || "", "utf8");
    return size > maxBytes;
  } catch { return false; }
}

/** Read the JSON body of a request already parsed by the Vercel runtime, or
 * parse it ourselves when it arrived as a raw string (some MCP clients send
 * `application/x-www-form-urlencoded` for the token endpoint per RFC 6749). */
export function parseFormOrJson(req) {
  const body = req.body;
  if (body && typeof body === "object") return body;
  if (typeof body !== "string" || !body) return {};
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("application/json")) {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(body));
}
