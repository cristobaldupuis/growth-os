// api/oauth.js — the MCP connector's whole OAuth server: RFC 8414/9728
// metadata, RFC 7591 dynamic client registration, the human sign-in step, and
// token issuance. One file dispatched by `?action=`, the same shape
// api/admin.js, api/video.js and api/debate.js already use — see
// scripts/check-functions.mjs: this deployment's plan caps it at twelve
// Serverless Functions, and five separate files here (register, authorize,
// token, and two well-known documents) would have used four of the remaining
// slots for five actions on one resource. api/mcp.js stays its own file
// because it is a genuinely different resource with a genuinely different
// request shape (JSON-RPC, not REST-ish) — folding it in here would be the
// "loosen whichever validator loses the argument" trade api/image.js's header
// warns against, not the same trade as these five.
//
// This file plus api/mcp.js bring the count to exactly twelve. DECISIONS.md
// records that headroom is gone — the next new endpoint needs either a fold
// into an existing action set or a plan upgrade, decided before it is needed
// rather than discovered in the pull request that adds it.
//
// ## Why this exists as a second auth system rather than reusing api/_auth.js
//
// api/_auth.js answers "whose Supabase session is this" for the browser app.
// This answers a different question: "which MCP client, registered by whom,
// holds a token we minted, scoped to which workspace." The two are related —
// the authorize action calls into api/_auth.js's token verification to find
// out who is signing in — but the tokens themselves are ours: opaque,
// independently revocable, and never the Supabase session itself. See the
// migration header in 0006_mcp.sql for the full reasoning.
//
// ## Why the password goes to Supabase directly from the browser, not here
//
// Exactly the discipline src/services/auth.js documents for the app itself:
// this server never sees the password. The login page's own script POSTs
// credentials straight to Supabase Auth with the publishable key, gets back a
// Supabase access token, and hands THAT to the authorize action — which is
// the same shape api/_auth.js already verifies for the browser app, reused
// here via `verifyToken`.
//
// ## Refresh rotation and reuse detection
//
// A refresh token is single-use: the token action atomically revokes it and
// mints a new access/refresh pair in the same `family_id` — the standard
// rotation shape, and the same one src/services/auth.js notes Supabase's own
// refresh grant already enforces. The reason to bother implementing it here
// too is what happens on REUSE: presenting a refresh token that was already
// consumed can only mean the token was copied — the legitimate client already
// rotated past it — so every token in that family is revoked, ending the
// session everywhere rather than trusting whichever branch asks first. This
// is the strongest signal available without a client secret to check, because
// these are public clients (see 0006_mcp.sql).

import { randomUUID } from "node:crypto";
import { verifyToken, membershipsFor, resolveWorkspace } from "./_auth.js";
import {
  pgFetch, originOf, newClientId, newAuthCode, newToken, hashToken, pkceVerify,
  isAcceptableRedirectUri, normalizeScope, scopeForRole, parseFormOrJson, bodyTooLarge,
  ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS, AUTH_CODE_TTL_MS,
} from "./_oauth.js";
import { guardRateLimit, clientIp } from "./_guard.js";
import { supabaseConfigured } from "./_supabase.js";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_REDIRECT_URIS = 5;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function fail(res, status, error, description) {
  res.status(status).json({ error, error_description: description });
}

// -- .well-known metadata -------------------------------------------------

function handleWellKnownAuthorizationServer(req, res) {
  const origin = originOf(req);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth?action=authorize`,
    token_endpoint: `${origin}/api/oauth?action=token`,
    registration_endpoint: `${origin}/api/oauth?action=register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write"],
  });
}

function handleWellKnownProtectedResource(req, res) {
  const origin = originOf(req);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write"],
  });
}

// -- Dynamic Client Registration (RFC 7591) -----------------------------------
//
// Open, with no initial access token: what is protected is not registration
// itself — a client_id is not a credential and grants nothing on its own —
// but the authorize action downstream, which still requires a real sign-in.
// The rate limit exists so row-creation cannot be used to fill the table, not
// because registering is a privileged act.

async function handleRegister(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { fail(res, 405, "invalid_request", "Method not allowed."); return; }

  if (await guardRateLimit(req, res, {
    key: `gos:mcp:register:${clientIp(req)}`,
    max: 20,
    limitMessage: "Too many client registrations from this address. Try again later.",
    label: "mcp-register",
  })) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!redirectUris.length || redirectUris.length > MAX_REDIRECT_URIS) {
    fail(res, 400, "invalid_redirect_uri", `Send between 1 and ${MAX_REDIRECT_URIS} redirect_uris.`);
    return;
  }
  const bad = redirectUris.find((u) => !isAcceptableRedirectUri(u));
  if (bad) {
    fail(res, 400, "invalid_redirect_uri", `"${bad}" must be an https:// URL or a loopback address (http://localhost or http://127.0.0.1).`);
    return;
  }

  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 200) : null;
  const clientId = newClientId();

  try {
    await pgFetch("/oauth_clients", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ client_id: clientId, client_name: clientName, redirect_uris: redirectUris }),
    });
  } catch (err) {
    console.error("oauth/register: could not store client:", err);
    fail(res, 503, "temporarily_unavailable", "Could not reach the workspace store.");
    return;
  }

  // Shape follows RFC 7591 §3.2.1. No client_secret field at all — a public
  // client, per the migration header — rather than one set to null, since an
  // absent field is unambiguous and a null one invites a client to ask why.
  res.status(201).json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "read write",
  });
}

// -- Authorize: the human-in-the-loop step ------------------------------------
//
// GET renders a small, dependency-free login page. POST completes the flow.
// Once client_id and redirect_uri are both confirmed, every LATER failure
// (wrong response_type, expired sign-in, no workspace) is reported by
// redirecting back to the client with an `error` parameter per RFC 6749
// §4.1.2.1 — the client asked to be told, and its own UI is a better place
// for "sign-in failed" than a page this server rendered. A malformed
// client_id or an unregistered redirect_uri means there is nowhere safe to
// send the browser, so those render a local error page instead.

async function findClient(clientId) {
  if (!clientId || typeof clientId !== "string") return null;
  const res = await pgFetch(`/oauth_clients?client_id=eq.${encodeURIComponent(clientId)}&select=client_id,client_name,redirect_uris`);
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function validateClientAndRedirect(clientId, redirectUri) {
  const client = await findClient(clientId);
  if (!client) return { error: "unknown_client", description: "This connector is not registered. Ask it to reconnect." };
  if (!client.redirect_uris.includes(redirectUri)) {
    return { error: "invalid_redirect_uri", description: "This redirect address was not registered by the connector." };
  }
  return { client };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

// Embedded as a JSON payload inside a <script> rather than as HTML attributes,
// so attacker-influenced query values (client_id, state, redirect_uri) never
// pass through an HTML-attribute parser. `<` is escaped inside the JSON text
// itself so a value containing a literal "</script>" cannot close the tag
// early — JSON.stringify alone does not do this.
const toScriptJson = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

const AUTHORIZE_PAGE_CSS = `
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    background:#161513; color:#e8e3da; padding:24px; box-sizing:border-box; }
  .card { width:100%; max-width:380px; background:#1f1d19; border:1px solid #34302a;
    border-radius:10px; padding:28px; }
  h1 { font-size:15px; margin:0 0 6px; font-weight:600; }
  p { font-size:13px; line-height:1.5; color:#b6afa2; margin:0 0 16px; }
  label { display:block; font-size:12px; margin:14px 0 4px; color:#b6afa2; }
  input, select { width:100%; box-sizing:border-box; padding:9px 10px; border-radius:6px;
    border:1px solid #3d382f; background:#141310; color:#e8e3da; font:inherit; font-size:13px; }
  button { width:100%; margin-top:18px; padding:10px; border-radius:6px; border:none;
    background:#caa24a; color:#161513; font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  .err { color:#e08a6b; font-size:12px; min-height:16px; margin-top:10px; }
  .scope { font-size:12px; color:#8f8778; margin-top:18px; border-top:1px solid #302c25; padding-top:14px; }
`;

function renderErrorPage(res, status, title, description) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(status).end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex, nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Marketers Lab · Connect</title>
<style>${AUTHORIZE_PAGE_CSS}</style></head><body><main class="card">
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>
</main></body></html>`);
}

function renderLoginPage(res, { clientName, clientId, redirectUri, codeChallenge, codeChallengeMethod, state, scope, resource }) {
  const payload = toScriptJson({ clientId, redirectUri, codeChallenge, codeChallengeMethod, state, scope, resource });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex, nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Marketers Lab · Connect</title>
<style>${AUTHORIZE_PAGE_CSS}</style></head><body><main class="card">
<h1>Connect ${escapeHtml(clientName || "an MCP client")}</h1>
<p>Sign in to grant it access to one workspace. Your password goes straight to Supabase and is never seen by this page.</p>
<form id="f">
  <div id="creds">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
  </div>
  <div id="wschoice" style="display:none">
    <label for="workspace">Workspace</label>
    <select id="workspace" name="workspace"></select>
  </div>
  <div class="scope">Requested access: <strong id="scopeLabel"></strong></div>
  <button id="submit" type="submit">Continue</button>
  <div class="err" id="err"></div>
</form>
<script>
(function () {
  var params = ${payload};
  document.getElementById("scopeLabel").textContent = (params.scope || "read") === "read" ? "read-only" : "read and write";
  var form = document.getElementById("f");
  var errEl = document.getElementById("err");
  var submitBtn = document.getElementById("submit");
  var wsChoice = document.getElementById("wschoice");
  var wsSelect = document.getElementById("workspace");
  var accessToken = null;

  function setErr(msg) { errEl.textContent = msg || ""; }
  function setBusy(busy) { submitBtn.disabled = busy; submitBtn.textContent = busy ? "Working…" : "Continue"; }

  async function authConfig() {
    var r = await fetch("/api/state?action=status");
    var body = await r.json();
    if (!body || !body.auth) throw new Error("This deployment has no sign-in configured.");
    return body.auth;
  }

  async function signIn(email, password) {
    var cfg = await authConfig();
    var r = await fetch(cfg.url + "/token?grant_type=password", {
      method: "POST",
      headers: { apikey: cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    });
    var body = await r.json().catch(function () { return {}; });
    if (!r.ok || !body.access_token) {
      throw new Error(body.error_description || body.msg || body.message || "Sign-in failed.");
    }
    return body.access_token;
  }

  async function complete(workspace) {
    var r = await fetch("/api/oauth?action=authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supabase_access_token: accessToken,
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        code_challenge: params.codeChallenge,
        code_challenge_method: params.codeChallengeMethod,
        state: params.state,
        scope: params.scope,
        resource: params.resource,
        workspace: workspace || undefined,
      }),
    });
    var body = await r.json().catch(function () { return {}; });
    if (body.needsWorkspace) {
      wsSelect.innerHTML = "";
      body.choices.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id; opt.textContent = c.name || c.slug || c.id;
        wsSelect.appendChild(opt);
      });
      wsChoice.style.display = "block";
      document.getElementById("creds").style.display = "none";
      setErr("This account is in more than one workspace — pick one.");
      return;
    }
    if (!r.ok || body.error) throw new Error(body.error_description || body.error || "Could not connect this client.");
    window.location.href = body.redirect;
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    setErr(""); setBusy(true);
    (async function () {
      try {
        if (wsChoice.style.display !== "none") {
          await complete(wsSelect.value);
          return;
        }
        accessToken = await signIn(
          document.getElementById("email").value,
          document.getElementById("password").value,
        );
        await complete(null);
      } catch (e) {
        setErr(e.message || "Something went wrong.");
      } finally {
        setBusy(false);
      }
    })();
  });
})();
</script>
</main></body></html>`);
}

function redirectWithError(res, redirectUri, state, error, description) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", String(state));
  res.setHeader("Location", url.toString());
  res.status(302).end();
}

async function handleAuthorize(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    fail(res, 405, "invalid_request", "Method not allowed.");
    return;
  }

  if (await guardRateLimit(req, res, {
    key: `gos:mcp:authorize:${clientIp(req)}`,
    max: 30,
    limitMessage: "Too many sign-in attempts from this address. Wait a minute and try again.",
    label: "mcp-authorize",
  })) return;

  if (req.method === "GET") {
    const q = req.query || {};
    const check = await validateClientAndRedirect(String(q.client_id || ""), String(q.redirect_uri || ""));
    if (check.error) { renderErrorPage(res, 400, "Can't connect this client", check.description); return; }

    if (q.response_type !== "code" || q.code_challenge_method !== "S256" || !q.code_challenge) {
      redirectWithError(res, q.redirect_uri, q.state, "invalid_request", "Expected an authorization-code request with S256 PKCE.");
      return;
    }

    renderLoginPage(res, {
      clientName: check.client.client_name,
      clientId: check.client.client_id,
      redirectUri: String(q.redirect_uri),
      codeChallenge: String(q.code_challenge),
      codeChallengeMethod: "S256",
      state: q.state ? String(q.state) : "",
      scope: normalizeScope(q.scope),
      resource: q.resource ? String(q.resource) : "",
    });
    return;
  }

  // POST — completes the flow.
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const check = await validateClientAndRedirect(String(body.client_id || ""), String(body.redirect_uri || ""));
  if (check.error) { fail(res, 400, check.error, check.description); return; }
  if (body.code_challenge_method !== "S256" || !body.code_challenge) {
    fail(res, 400, "invalid_request", "Expected S256 PKCE.");
    return;
  }

  const user = await verifyToken(String(body.supabase_access_token || ""));
  if (!user) {
    fail(res, 401, "access_denied", "Sign-in failed or your session expired. Try again.");
    return;
  }

  let workspace;
  try {
    const memberships = await membershipsFor(user.id);
    const resolved = resolveWorkspace(memberships, body.workspace || null);
    if (resolved.error) {
      if (resolved.choices) { res.status(200).json({ needsWorkspace: true, choices: resolved.choices }); return; }
      fail(res, 403, "access_denied", resolved.error);
      return;
    }
    workspace = resolved.workspace;
  } catch (err) {
    console.error("oauth/authorize: membership lookup failed:", err);
    fail(res, 503, "temporarily_unavailable", "Could not reach the workspace store.");
    return;
  }

  const code = newAuthCode();
  try {
    await pgFetch("/oauth_codes", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        code_hash: hashToken(code),
        client_id: check.client.client_id,
        redirect_uri: body.redirect_uri,
        code_challenge: body.code_challenge,
        code_challenge_method: "S256",
        user_id: user.id,
        workspace_id: workspace.id,
        scope: scopeForRole(normalizeScope(body.scope), workspace.role),
        expires_at: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
      }),
    });
  } catch (err) {
    console.error("oauth/authorize: could not store authorization code:", err);
    fail(res, 503, "temporarily_unavailable", "Could not reach the workspace store.");
    return;
  }

  const redirect = new URL(body.redirect_uri);
  redirect.searchParams.set("code", code);
  if (body.state) redirect.searchParams.set("state", String(body.state));
  res.status(200).json({ redirect: redirect.toString() });
}

// -- Token: authorization_code and refresh_token grants -----------------------

async function issuePair({ familyId, clientId, userId, workspaceId, scope }) {
  const now = Date.now();
  const access = newToken("access");
  const refresh = newToken("refresh");
  await pgFetch("/oauth_tokens", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        token_hash: hashToken(access), kind: "access", family_id: familyId,
        client_id: clientId, user_id: userId, workspace_id: workspaceId, scope,
        expires_at: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
      },
      {
        token_hash: hashToken(refresh), kind: "refresh", family_id: familyId,
        client_id: clientId, user_id: userId, workspace_id: workspaceId, scope,
        expires_at: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
      },
    ]),
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refresh,
    scope,
  };
}

async function handleAuthorizationCodeGrant(res, body) {
  const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier } = body;
  if (!code || !redirectUri || !clientId || !verifier) {
    fail(res, 400, "invalid_request", "code, redirect_uri, client_id and code_verifier are all required.");
    return;
  }

  let row;
  try {
    // Atomic single-use consume: a DELETE that matches nothing (already used,
    // never existed, or expired) returns an empty array, which is the one
    // check every one of those cases needs — the row is either usable exactly
    // once or it is gone.
    const delRes = await pgFetch(
      `/oauth_codes?code_hash=eq.${encodeURIComponent(hashToken(code))}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
    );
    const rows = await delRes.json();
    row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.error("oauth/token: could not consume authorization code:", err);
    fail(res, 503, "temporarily_unavailable", "Could not reach the workspace store.");
    return;
  }

  if (!row) { fail(res, 400, "invalid_grant", "This authorization code is invalid, expired, or already used."); return; }
  if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
    fail(res, 400, "invalid_grant", "client_id or redirect_uri does not match the one this code was issued to.");
    return;
  }
  if (row.code_challenge_method !== "S256" || !pkceVerify(verifier, row.code_challenge)) {
    fail(res, 400, "invalid_grant", "code_verifier does not match the original request.");
    return;
  }

  try {
    const pair = await issuePair({
      familyId: randomUUID(), clientId, userId: row.user_id, workspaceId: row.workspace_id, scope: row.scope,
    });
    res.status(200).json(pair);
  } catch (err) {
    console.error("oauth/token: could not issue token pair:", err);
    fail(res, 503, "temporarily_unavailable", "Could not reach the workspace store.");
  }
}

async function handleRefreshTokenGrant(res, body) {
  const { refresh_token: refreshToken, client_id: clientId } = body;
  if (!refreshToken) { fail(res, 400, "invalid_request", "refresh_token is required."); return; }

  const hash = hashToken(refreshToken);
  const nowIso = new Date().toISOString();

  let consumed;
  try {
    const patchRes = await pgFetch(
      `/oauth_tokens?token_hash=eq.${encodeURIComponent(hash)}&kind=eq.refresh&revoked_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revoked_at: nowIso }) },
    );
    const rows = await patchRes.json();
    consumed = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.error("oauth/token: could not rotate refresh token:", err);
    fail(res, 503, "temporarily_unavailable", "Could not reach the workspace store.");
    return;
  }

  if (!consumed) {
    // Not found, expired, or — the interesting case — already revoked, which
    // means this exact token was already rotated once and is being replayed.
    try {
      const lookupRes = await pgFetch(`/oauth_tokens?token_hash=eq.${encodeURIComponent(hash)}&kind=eq.refresh&select=family_id,revoked_at`);
      const rows = await lookupRes.json();
      const existing = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (existing && existing.revoked_at) {
        await pgFetch(
          `/oauth_tokens?family_id=eq.${encodeURIComponent(existing.family_id)}&revoked_at=is.null`,
          { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ revoked_at: nowIso }) },
        );
        fail(res, 400, "invalid_grant", "This refresh token was already used. The connection has been revoked for safety — reconnect the client.");
        return;
      }
    } catch (err) {
      console.error("oauth/token: reuse-detection lookup failed:", err);
    }
    fail(res, 400, "invalid_grant", "This refresh token is invalid or expired.");
    return;
  }

  if (clientId && consumed.client_id !== clientId) {
    fail(res, 400, "invalid_grant", "client_id does not match the one this token was issued to.");
    return;
  }

  try {
    const pair = await issuePair({
      familyId: consumed.family_id, clientId: consumed.client_id, userId: consumed.user_id,
      workspaceId: consumed.workspace_id, scope: consumed.scope,
    });
    res.status(200).json(pair);
  } catch (err) {
    console.error("oauth/token: could not issue rotated token pair:", err);
    fail(res, 503, "temporarily_unavailable", "Could not reach the workspace store.");
  }
}

async function handleToken(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { fail(res, 405, "invalid_request", "Method not allowed."); return; }

  if (await guardRateLimit(req, res, {
    key: `gos:mcp:token:${clientIp(req)}`,
    max: 60,
    limitMessage: "Too many token requests from this address. Wait a minute and try again.",
    label: "mcp-token",
  })) return;

  const body = parseFormOrJson(req);
  if (body.grant_type === "authorization_code") { await handleAuthorizationCodeGrant(res, body); return; }
  if (body.grant_type === "refresh_token") { await handleRefreshTokenGrant(res, body); return; }
  fail(res, 400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
}

// -- The dispatcher ----------------------------------------------------------

export default async function handler(req, res) {
  cors(res);
  if (!supabaseConfigured()) {
    fail(res, 503, "temporarily_unavailable", "This deployment has no durable state configured.");
    return;
  }
  if (bodyTooLarge(req, MAX_BODY_BYTES)) {
    fail(res, 413, "invalid_request", "Request body too large.");
    return;
  }

  const action = String(req.query?.action || "");
  if (action === "well-known-as") { handleWellKnownAuthorizationServer(req, res); return; }
  if (action === "well-known-resource") { handleWellKnownProtectedResource(req, res); return; }
  if (action === "register") { await handleRegister(req, res); return; }
  if (action === "authorize") { await handleAuthorize(req, res); return; }
  if (action === "token") { await handleToken(req, res); return; }
  fail(res, 400, "invalid_request", "Unknown action.");
}
