// api/_auth.js — who is calling, according to Supabase Auth.
//
// Underscore-prefixed so Vercel does not route it as a function; it is a module
// the real endpoints import.
//
// ## Why this exists now
//
// api/_session.js says it plainly: the admin console's HMAC cookie is an
// OPERATOR gate, "narrower than the per-user auth in the 'Proxy authentication'
// forcing condition — that one is still outstanding and this does not close it."
// This closes it. Phase 2.0 needs a session token for two jobs that are the same
// piece of work, which is why the roadmap refuses to let them be attempted
// separately:
//
//   1. api/state.js has to know whose workspace it is reading and writing.
//   2. api/proxy.js has to rate limit and attribute a metered call to a PERSON
//      rather than to a forwarded IP, which is shared, spoofable, and changes
//      when someone opens a laptop somewhere else.
//
// ## Why the token is checked against Supabase rather than verified locally
//
// A Supabase access token is a JWT and could be verified here with the project's
// JWT secret and no network hop. It is checked against `/auth/v1/user` instead,
// for one reason that outweighs the latency: local verification cannot see
// revocation. A signed-out session, a deleted user and a revoked refresh token
// all still carry a signature that validates until the token's own expiry. For a
// surface that reads and writes a client's entire workspace, "this signature was
// valid when it was issued" is the wrong question.
//
// The hop is paid once per burst, not once per call — see the cache below.
//
// ## What this module deliberately does not do
//
// It does not issue tokens, refresh them, or hold a password. Supabase Auth owns
// all of that, in the browser, where the refresh cycle already works. This module
// only answers "whose token is this, and is it still good".

import { authBase, restBase, secretKey, supabaseConfigured, authHeaders } from "./_supabase.js";

const TIMEOUT_MS = 4000;

// Token → { user, expiresAt }. Bounded and short.
//
// Safe to cache at all because the thing being cached is a claim that was
// authoritative moments ago about a credential that is itself time-bounded. The
// TTL is the window in which a revoked session still works, so it is deliberately
// far shorter than the token's own lifetime: sixty seconds turns a burst of
// twenty saves into one verification, and leaves revocation effectively immediate
// on any human timescale.
const TTL_MS = 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map();

function cacheGet(token) {
  const hit = cache.get(token);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) { cache.delete(token); return null; }
  return hit.user;
}

function cacheSet(token, user) {
  // Oldest-first eviction. Map preserves insertion order, so the first key is the
  // oldest. A bound matters here because the key is attacker-supplied: without
  // one, a stream of junk tokens is an unbounded allocation in a warm Lambda.
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(token, { user, expiresAt: Date.now() + TTL_MS });
}

/** The bearer token on a request, or null. */
export function bearerToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  // A JWT is three dot-separated segments. Checking the shape here means an
  // obviously malformed credential costs nothing rather than a network round
  // trip, and keeps junk out of the cache.
  return token && token.split(".").length === 3 ? token : null;
}

/**
 * The authenticated user for a request, or null.
 *
 * Null covers every failure identically — no token, malformed token, expired,
 * revoked, Supabase unreachable — because the caller's response to all of them is
 * the same 401 and distinguishing them in the reply would describe the auth
 * system to an unauthenticated caller. The console log distinguishes them for
 * whoever is debugging.
 */
export async function authenticate(req) {
  if (!supabaseConfigured()) return null;

  const token = bearerToken(req);
  if (!token) return null;

  const cached = cacheGet(token);
  if (cached) return cached;

  try {
    const res = await fetch(`${authBase()}/user`, {
      headers: { apikey: secretKey(), Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || !body.id) return null;
    const user = { id: body.id, email: body.email || null };
    cacheSet(token, user);
    return user;
  } catch (err) {
    console.error("auth: could not verify access token:", err);
    return null;
  }
}

/**
 * The workspaces this user belongs to, newest membership last.
 *
 * Read with the secret key rather than the caller's token on purpose: this is
 * the check that decides whether the caller may touch a workspace at all, and it
 * should not be executed with a credential the caller supplied. RLS would give
 * the same answer — see the policies in 0005_workspace.sql — but a control that
 * depends on the request being shaped correctly is weaker than one that does not.
 */
export async function membershipsFor(userId) {
  const res = await fetch(
    `${restBase()}/workspace_members?user_id=eq.${encodeURIComponent(userId)}` +
    `&select=workspace_id,role,workspaces(slug,name)&order=created_at.asc`,
    { headers: authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`membership lookup returned ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map(r => ({
    id: r.workspace_id,
    role: r.role,
    slug: r.workspaces?.slug || null,
    name: r.workspaces?.name || null,
  }));
}

/**
 * Resolve which workspace a request is for, refusing rather than guessing.
 *
 * Returns `{ workspace }` or `{ error, status }`. The ambiguous case — a user in
 * several workspaces who named none — is a 400 rather than a silent pick of the
 * first, because picking wrong writes one client's data into another client's
 * workspace. That is the single worst outcome available to this endpoint, and
 * "the caller probably meant the one they use most" is not a basis for it.
 */
export function resolveWorkspace(memberships, requested) {
  if (!memberships.length) {
    return { error: "This account is not a member of any workspace.", status: 403 };
  }
  if (requested) {
    const found = memberships.find(m => m.id === requested || m.slug === requested);
    if (!found) return { error: "Not a member of that workspace.", status: 403 };
    return { workspace: found };
  }
  if (memberships.length > 1) {
    return {
      error: "This account belongs to several workspaces; name which one.",
      status: 400,
      choices: memberships.map(m => ({ id: m.id, slug: m.slug, name: m.name })),
    };
  }
  return { workspace: memberships[0] };
}
