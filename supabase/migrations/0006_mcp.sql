-- Marketers Lab — the MCP connector's own OAuth authorization server.
--
-- ## Run this one
--
-- Live, like 0003, 0004 and 0005. Idempotent; paste it into the Supabase SQL
-- editor and run it.
--
-- ## What this is for
--
-- api/mcp.js lets a person read and write their own workspace from an MCP
-- client (Claude Desktop, Claude Code, claude.ai, and — via an org-level
-- connector — Claude in Slack) instead of only the browser. MCP's remote-server
-- spec requires the resource to sit behind a real OAuth 2.1 authorization
-- server: dynamic client registration (RFC 7591), PKCE, an authorize step a
-- human completes in a browser, and a token endpoint. Supabase Auth issues
-- sessions for OUR app; it does not register third-party MCP clients or hand
-- them scoped, revocable tokens. So this is a thin AS shim in front of it —
-- three tables, no new PL/pgSQL beyond what PostgREST's filtered PATCH/DELETE
-- already gives atomically, the same trick api/state.js's `replace` path uses.
--
-- Reasoning in DECISIONS.md, "MCP connector: a second, narrower OAuth server."
--
-- ## Why opaque tokens we mint, not the caller's Supabase session forwarded
--
-- api/_auth.js already answers "whose token is this" for a browser session.
-- Handing that same session to an external MCP client would mean the client
-- holds a credential that can do everything the browser can, for as long as
-- Supabase's own refresh cycle keeps it alive, revocable only by signing the
-- PERSON out everywhere. An MCP client gets its own opaque token instead —
-- short-lived, independently revocable, scoped to one workspace and one
-- client — so revoking a leaked MCP connector token never touches the
-- person's browser session, and vice versa.

-- ── oauth_clients ────────────────────────────────────────────────────────
-- Dynamically registered MCP clients (RFC 7591). Public clients only — no
-- secret is issued or checked; PKCE is what proves possession of the
-- authorization code at the token step. That is the right shape for the
-- clients this connects (Claude Desktop, Claude Code, claude.ai) which cannot
-- keep a secret confidential the way a server-side confidential client could.
create table if not exists oauth_clients (
  client_id     text primary key,
  client_name   text,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

alter table oauth_clients enable row level security;

-- ── oauth_codes ──────────────────────────────────────────────────────────
-- One-time authorization codes, PKCE-bound. Consumed by a single DELETE …
-- RETURNING at the token endpoint — atomic, and the row is simply gone after,
-- which is what makes a code single-use without a separate "used" flag to
-- forget to check.
create table if not exists oauth_codes (
  code_hash             text primary key,
  client_id             text not null references oauth_clients (client_id) on delete cascade,
  redirect_uri          text not null,
  code_challenge        text not null,
  code_challenge_method text not null default 'S256',
  user_id               uuid not null references auth.users (id) on delete cascade,
  workspace_id          uuid not null references workspaces (id) on delete cascade,
  scope                 text not null default 'read write',
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now()
);

alter table oauth_codes enable row level security;

create index if not exists oauth_codes_expires_at_idx
  on oauth_codes (expires_at);

-- ── oauth_tokens ─────────────────────────────────────────────────────────
-- Access and refresh tokens this server issued, stored as a salted-free SHA-256
-- hash of the opaque secret rather than the secret itself — the same reason
-- api/_session.js hashes the admin password before comparing it. A leaked
-- database row is not a leaked bearer token.
--
-- `family_id` links one authorization_code grant and every refresh rotation
-- descended from it. A refresh token is single-use: consuming it revokes the
-- row and mints a new access/refresh pair in the SAME family. Presenting an
-- already-revoked refresh token is therefore a reuse signal — the strongest
-- one available without a client-side secret — and revokes every token in the
-- family, ending the session everywhere rather than trusting the newer branch.
create table if not exists oauth_tokens (
  token_hash   text primary key,
  kind         text not null check (kind in ('access', 'refresh')),
  family_id    uuid not null,
  client_id    text not null references oauth_clients (client_id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  scope        text not null default 'read write',
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

alter table oauth_tokens enable row level security;

create index if not exists oauth_tokens_family_idx
  on oauth_tokens (family_id);

-- Every access-token check on every MCP call filters on exactly these three
-- columns (see api/mcp.js) — an unindexed scan here would be the slowest part
-- of every tool call.
create index if not exists oauth_tokens_lookup_idx
  on oauth_tokens (token_hash, kind, revoked_at, expires_at);

-- ── Policies ─────────────────────────────────────────────────────────────
-- RLS enabled with NO policies on all three tables, matching app_config and
-- rate_limit_counters in 0003_runtime.sql exactly, and for the identical
-- reason: this is a server-owned control, not workspace data a signed-in
-- browser should ever read or write directly. Only api/oauth/*.js and
-- api/mcp.js reach these, with the secret key, which bypasses RLS. A client
-- registration a visitor's browser could write, or a token row it could read,
-- defeats the entire point of the tokens being opaque and server-minted.
