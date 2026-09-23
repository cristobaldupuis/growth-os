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

-- ── Adding a viewer ──────────────────────────────────────────────────────
-- There is no invite UI yet. To seat someone read-only, once they have signed
-- up (so they exist in auth.users):
--
--   insert into workspace_members (workspace_id, user_id, role)
--   select w.id, u.id, 'viewer'
--   from workspaces w, auth.users u
--   where w.slug = 'your-workspace-slug' and u.email = 'client@example.com'
--   on conflict (workspace_id, user_id) do update set role = excluded.role;
