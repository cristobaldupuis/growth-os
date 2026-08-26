-- Marketers Lab — runtime state the SERVER owns
--
-- ## Run this one
--
-- Unlike 0001_init.sql and 0002_assets.sql, which are proposals kept next to the
-- code so the shapes do not drift, this migration is live. Two server-side
-- controls depend on it and both are degraded until it is applied:
--
--   MODEL ROUTING  — which model serves which feature group. Decided by one
--   operator in the admin console and applied to every visitor's session, so it
--   cannot live in the browser store the rest of the app uses. Without somewhere
--   durable to put it, the console reports `durable:false` and every save fails
--   rather than appearing to work.
--
--   RATE LIMITING  — the ceiling in front of a metered API. Without durable
--   storage the limiter falls back to a module-level Map, which on Vercel is
--   per warm Lambda instance: it resets on every cold start and is enforced
--   independently per concurrent instance. "250 per hour" silently becomes "250
--   per instance per warm period", which is not a limit.
--
-- ## Why Supabase rather than the Redis this used to assume
--
-- Both controls were written against Upstash Redis, chosen when it was the only
-- durable store the deployment had. It never got set up, while Supabase did —
-- api/asset.js has been writing generated frames to a bucket since Phase 5.
-- Two managed datastores for a single-operator app is one more account, one more
-- bill and one more failure mode than the work needs, and neither of these jobs
-- is Redis-shaped: routing is a single row read once per page load, and the
-- limiter is a counter that Postgres increments atomically in one statement.
--
-- ## Security
--
-- RLS is enabled on both tables with NO policies, which denies every request
-- that carries the anon/publishable key. Only the server-side secret key, which
-- bypasses RLS and never leaves api/, can read or write here. That is deliberate
-- and load-bearing: a rate-limit counter a browser could reset is not a rate
-- limit, and a routing row a visitor could write would let them repoint every
-- feature group in the app at the most expensive model in the catalogue.

-- ── app_config ───────────────────────────────────────────────────────────
-- Server-owned key/value configuration. One row today (`routing`); a key/value
-- shape rather than a `routing` table because the next server-owned setting
-- should be a row, not a migration.
create table if not exists app_config (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;

-- ── rate_limit_counters ──────────────────────────────────────────────────
-- One row per (bucket key, time window). The window is encoded INTO the key by
-- the caller — `gos:rl:<ip>:<window index>` — which is what the Redis
-- implementation did and is worth keeping: a new window is a new key, so there
-- is no reset logic to get wrong and no read-modify-write race to lose.
--
-- `expires_at` is therefore not the limiter's mechanism, only its cleanup.
create table if not exists rate_limit_counters (
  key        text primary key,
  count      int         not null default 0,
  expires_at timestamptz not null
);

alter table rate_limit_counters enable row level security;

create index if not exists rate_limit_counters_expires_at_idx
  on rate_limit_counters (expires_at);

-- ── increment_rate_limit ─────────────────────────────────────────────────
-- Atomically increment a bucket and return its new count.
--
-- This has to be one statement. The obvious two-step — SELECT the count, then
-- UPDATE it — loses increments under exactly the concurrency a rate limiter
-- exists to bound: two Lambdas reading 249 simultaneously both write 250, and
-- the ceiling is quietly one call higher than it says. `INSERT … ON CONFLICT DO
-- UPDATE … RETURNING` is atomic within a single row, so the returned count is
-- always this caller's own position in the sequence.
--
-- SECURITY DEFINER so the function can write a table whose RLS denies everyone;
-- `search_path` is pinned because a SECURITY DEFINER function that resolves
-- unqualified names through a caller-controlled search_path is the standard way
-- this pattern is abused.
create or replace function increment_rate_limit(p_key text, p_window_seconds int)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  -- Opportunistic cleanup. Cheap against the index and bounded: at one row per
  -- IP per window this table stays in the tens of rows for a single-operator
  -- deployment. If it ever stops being cheap, move it to pg_cron and delete
  -- this statement — nothing about the limiter depends on it.
  delete from rate_limit_counters where expires_at < now();

  insert into rate_limit_counters (key, count, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = rate_limit_counters.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- The function is reachable only by the roles granted here. `anon` is
-- deliberately absent: the browser never calls this, api/ does, with the secret
-- key.
revoke all on function increment_rate_limit(text, int) from public;
grant execute on function increment_rate_limit(text, int) to service_role;
