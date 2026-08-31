-- Marketers Lab — workspace state. ROADMAP Phase 2.0.
--
-- ## Run this one
--
-- Like 0003 and 0004, and unlike 0001/0002, this migration is live. It is
-- idempotent; paste it into the Supabase SQL editor and run it.
--
-- ## The problem this exists to fix
--
-- Performance rows are capped at 5,000 in `localStorage` and the OLDEST are
-- dropped on merge (`PERF_ROW_LIMIT` in src/services/performance.js). The
-- campaign↔experiment bridge is the part of this product no competitor has, it
-- is the part that ingests the most rows, and it has therefore been silently
-- discarding the history the whole thesis rests on. "Every experiment should
-- make the next one smarter" is not a claim a store that forgets can support.
--
-- ## Why documents for most of it, and rows for one thing
--
-- The obvious migration is the one drafted in 0001_init.sql: initiatives,
-- brands, weekly_metrics and recommendations as real tables. That is the right
-- END state and it is deliberately NOT what this migration does, for a reason
-- worth writing down.
--
-- Every read path in src/services/ — portfolio.js, performance.js, items.js,
-- learningAgenda.js — is a synchronous pure function over an in-memory array,
-- and 569 tests are written against that shape. Normalising now does not move
-- storage; it turns a synchronous codebase into an async one and rewrites most
-- of the suite, in the same change that first points the app at a network it has
-- never depended on. That is two risky changes wearing one name.
--
-- So the split here is by what actually grows:
--
--   workspace_docs     — one JSONB row per store key. Operator-authored state:
--                        initiatives, settings, agenda, debates, recommendations,
--                        creative, asset records, the usage ledger. Bounded by
--                        how much a person types. Read whole, written whole,
--                        exactly as `store.get`/`store.set` already do.
--
--   performance_rows   — a real table, because this is the one that grows without
--                        a person doing anything, and it is the one being dropped
--                        today. A month of ad-level Meta data is tens of thousands
--                        of rows; that is not a document.
--
-- Phase 5.4 then adds typed dimension columns and GROUP BY reads ON TOP of a
-- table that already holds real history, rather than starting from an empty one.
-- That is a better position than this migration would reach by normalising
-- everything now and having nothing in it.
--
-- ## Facts are stored; the parse is derived
--
-- performance_rows stores what the platform reported — the entity name, the
-- level, the date, the metrics — and NOT the parse (`parsed`, `values`,
-- `parseErrors`). Those are a pure function of the name and the naming schema,
-- and the schema changes: a dimension gets appended, a vocabulary value is added,
-- a delimiter is corrected. A stored parse would be a cached answer to a question
-- whose inputs moved, and stale-but-plausible dimensions are precisely the
-- failure `parseName` refuses to produce at import time.
--
-- Deriving it on read costs one pass through `annotateRow` at load and can never
-- be stale. This is also exactly the property ROADMAP 5.4 names as the
-- precondition for its reparse job — arriving early, and for free.

-- ── workspaces ───────────────────────────────────────────────────────────
create table if not exists workspaces (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table workspaces enable row level security;

-- ── workspace_members ────────────────────────────────────────────────────
-- The join between a Supabase Auth user and a workspace. Membership is the ONLY
-- thing that grants access; there is no public workspace and no default.
--
-- A tenant column from the first migration, per DECISIONS.md ("schema decisions
-- made multi-tenant-safe from the first migration so productising is a policy
-- change rather than a rewrite"). The deployment model is still one project per
-- client; this is what makes that a deployment choice rather than a schema
-- assumption.
create table if not exists workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table workspace_members enable row level security;

create index if not exists workspace_members_user_idx
  on workspace_members (user_id);

-- ── is_workspace_member ──────────────────────────────────────────────────
-- The predicate every policy below is written against.
--
-- SECURITY DEFINER so that a policy on workspace_members can consult
-- workspace_members without recursing through its own RLS — the standard
-- Postgres footgun with membership-based policies, which otherwise fails at
-- runtime with "infinite recursion detected in policy". search_path is pinned
-- for the usual SECURITY DEFINER reason.
create or replace function is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace and user_id = auth.uid()
  );
$$;

revoke all on function is_workspace_member(uuid) from public;
grant execute on function is_workspace_member(uuid) to authenticated, service_role;

-- ── workspace_docs ───────────────────────────────────────────────────────
-- One row per (workspace, store key). `key` is the same string store.js already
-- uses — `gos_items_v4`, `gos_settings_v2` — so the versioning discipline that
-- key already carries keeps working and a shape change stays a new key.
--
-- `revision` is the reason this is not last-write-wins. Auth makes a workspace
-- multi-user for the first time, and a whole-document write from two browsers
-- silently discards one person's work — the failure store.js already refuses to
-- commit for quota errors ("a save that did not happen must never be reported as
-- one"). The writer sends the revision it read; `bump_workspace_doc` refuses the
-- write if it moved. Refuse, don't guess: the same rule the name parser follows.
create table if not exists workspace_docs (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  key          text not null,
  value        jsonb not null,
  revision     bigint not null default 1,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  primary key (workspace_id, key)
);

alter table workspace_docs enable row level security;

-- ── performance_rows ─────────────────────────────────────────────────────
-- Campaign-level facts, one row per ad entity per day.
--
-- `row_key` mirrors `perfRowKey` in src/services/performance.js exactly
-- (date|channel|level|normalised name). Keeping the identity IDENTICAL in both
-- places is what makes the merge semantics the same whether a merge happens in
-- JS over an array or here in ON CONFLICT: re-importing an overlapping export
-- replaces those rows rather than duplicating them, which is the behaviour the
-- importer has always had and the property its tests assert.
--
-- No cap. That is the entire point of this migration.
create table if not exists performance_rows (
  workspace_id  uuid not null references workspaces (id) on delete cascade,
  row_key       text not null,
  name          text not null,
  level         text not null,
  channel       text,
  date          date,
  campaign_name text not null default '',
  adset_name    text not null default '',
  -- spend / impressions / clicks / conversions / revenue, whichever the export
  -- carried. JSONB rather than columns because the metric set genuinely varies by
  -- platform and 5.4 is where the ones worth indexing get promoted.
  metrics       jsonb not null default '{}'::jsonb,
  imported_at   timestamptz not null default now(),
  primary key (workspace_id, row_key)
);

alter table performance_rows enable row level security;

-- Ordering is always newest-first within a workspace (see mergePerformanceRows),
-- and 5.4's rollups filter by date range. One index serves both.
create index if not exists performance_rows_workspace_date_idx
  on performance_rows (workspace_id, date desc);

-- ── Policies ─────────────────────────────────────────────────────────────
--
-- api/state.js reaches this schema with the SECRET key, which bypasses RLS, and
-- enforces membership itself before every read and write. So why policies at all?
--
-- Because "the server checks" is one bug away from not being true, and because
-- the publishable key is in the browser bundle by design. With these policies a
-- browser holding a valid session can read exactly its own workspaces and
-- nothing else — which makes a direct-from-browser read path a future option
-- rather than a future migration, and makes a mistake in api/state.js a bug
-- instead of a breach.
--
-- Dropped and recreated so re-running this file converges rather than erroring;
-- `create policy` has no `if not exists`.

drop policy if exists workspaces_select on workspaces;
create policy workspaces_select on workspaces
  for select to authenticated
  using (is_workspace_member(id));

drop policy if exists workspace_members_select on workspace_members;
create policy workspace_members_select on workspace_members
  for select to authenticated
  using (is_workspace_member(workspace_id));

drop policy if exists workspace_docs_select on workspace_docs;
create policy workspace_docs_select on workspace_docs
  for select to authenticated
  using (is_workspace_member(workspace_id));

drop policy if exists workspace_docs_write on workspace_docs;
create policy workspace_docs_write on workspace_docs
  for all to authenticated
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

drop policy if exists performance_rows_select on performance_rows;
create policy performance_rows_select on performance_rows
  for select to authenticated
  using (is_workspace_member(workspace_id));

drop policy if exists performance_rows_write on performance_rows;
create policy performance_rows_write on performance_rows
  for all to authenticated
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- ── bump_workspace_doc ───────────────────────────────────────────────────
-- Write one document, but only if nobody else wrote it first.
--
-- Returns the new revision on success and NULL when the caller's revision is
-- stale, so the endpoint can answer 409 and the app can reload rather than
-- clobber. `p_revision = 0` means "create if absent", used for the first write of
-- a key and for the initial upload from a browser that has never synced.
--
-- One statement for the same reason increment_rate_limit is: a read-then-write
-- from two Lambdas loses exactly the race this check exists to catch.
create or replace function bump_workspace_doc(
  p_workspace uuid,
  p_key       text,
  p_value     jsonb,
  p_revision  bigint,
  p_user      uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision bigint;
begin
  insert into workspace_docs (workspace_id, key, value, revision, updated_at, updated_by)
  values (p_workspace, p_key, p_value, 1, now(), p_user)
  on conflict (workspace_id, key) do update
    set value      = excluded.value,
        revision   = workspace_docs.revision + 1,
        updated_at = now(),
        updated_by = p_user
    -- The guard. `p_revision = 0` is the caller saying "I am creating this";
    -- anything else must match what is stored or the update matches no row and
    -- RETURNING yields nothing.
    where p_revision = 0 or workspace_docs.revision = p_revision
  returning revision into v_revision;

  return v_revision;  -- NULL when the where clause rejected the update
end;
$$;

revoke all on function bump_workspace_doc(uuid, text, jsonb, bigint, uuid) from public;
grant execute on function bump_workspace_doc(uuid, text, jsonb, bigint, uuid) to service_role;
