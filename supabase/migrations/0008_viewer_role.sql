-- 0008_viewer_role.sql — a read-only seat on a workspace.
--
-- ## Why
--
-- Until now a workspace had two roles, owner and member, and nothing branched
-- on either: both could write everything. An agency product needs a third — the
-- client's own team, looking at their portfolio without being able to change
-- it. `viewer` is that role.
--
-- ## Where it is enforced
--
-- Three places, deliberately overlapping:
--   1. api/state.js refuses every write action for a viewer (403).
--   2. The MCP connector never grants a viewer `write` scope, and re-checks the
--      role on every tool call (api/oauth.js, api/_mcpTools.js).
--   3. The RLS write policies below, so that even a request that reached
--      PostgREST with a viewer's own JWT could not write.
-- The API layer uses the secret key and so bypasses RLS; (3) is the backstop
-- for any future path that does not, not the primary control.
--
-- Idempotent: safe to paste into the SQL editor more than once.

-- ── Allow the role ───────────────────────────────────────────────────────
-- 0005 declared the check inline, so Postgres named it
-- workspace_members_role_check.
alter table workspace_members drop constraint if exists workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check
  check (role in ('owner', 'member', 'viewer'));

-- ── is_workspace_writer ──────────────────────────────────────────────────
-- is_workspace_member's twin for writes. SECURITY DEFINER and a pinned
-- search_path for the same reasons given in 0005.
create or replace function is_workspace_writer(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace and user_id = auth.uid()
      and role in ('owner', 'member')
  );
$$;

revoke all on function is_workspace_writer(uuid) from public;
grant execute on function is_workspace_writer(uuid) to authenticated, service_role;

-- ── Write policies: members and owners only ──────────────────────────────
-- The select policies from 0005 are untouched, so a viewer still reads.
drop policy if exists workspace_docs_write on workspace_docs;
create policy workspace_docs_write on workspace_docs
  for all to authenticated
  using (is_workspace_writer(workspace_id))
  with check (is_workspace_writer(workspace_id));

drop policy if exists performance_rows_write on performance_rows;
create policy performance_rows_write on performance_rows
  for all to authenticated
  using (is_workspace_writer(workspace_id))
  with check (is_workspace_writer(workspace_id));

-- ── Member management helpers ────────────────────────────────────────────
-- Used by api/state.js's member actions (the Workspace panel's Members list).
-- Both read auth.users, which PostgREST does not expose, so they are SECURITY
-- DEFINER — and granted to service_role only, because an email lookup callable
-- with a user's JWT would let anyone enumerate who has an account. The owner
-- check lives in api/state.js, before either is called.
--
-- The app deliberately does not CREATE accounts (see WorkspacePanel.jsx): these
-- only find people who already signed up and list the ones already seated.

create or replace function workspace_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function workspace_user_id_by_email(text) from public;
grant execute on function workspace_user_id_by_email(text) to service_role;

create or replace function workspace_member_list(p_workspace uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace
  order by m.created_at;
$$;

revoke all on function workspace_member_list(uuid) from public;
grant execute on function workspace_member_list(uuid) to service_role;

-- ── Adding a viewer by hand ──────────────────────────────────────────────
-- The Workspace panel's Members list does this for an owner. The SQL, for when
-- there is no owner session to do it from, once they have signed up (so they
-- exist in auth.users):
--
--   insert into workspace_members (workspace_id, user_id, role)
--   select w.id, u.id, 'viewer'
--   from workspaces w, auth.users u
--   where w.slug = 'your-workspace-slug' and u.email = 'client@example.com'
--   on conflict (workspace_id, user_id) do update set role = excluded.role;
