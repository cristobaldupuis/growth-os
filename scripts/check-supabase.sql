-- Paste into the Supabase SQL editor and run it. Read-only — a SELECT against
-- information_schema and storage.buckets, nothing is created or changed.
--
-- Reports every table and function 0003_runtime.sql through 0008_viewer_role.sql are
-- each supposed to create, plus the storage bucket 0002_assets.sql's live
-- statement creates. This is the SQL-editor twin of `npm run check:supabase`
-- (scripts/check-supabase.mjs) — same inventory, for when you'd rather look at
-- it inside Supabase than run it from a terminal with env vars set.

select
  expected.migration,
  expected.kind,
  expected.name,
  case when expected.present then '✅ present' else '❌ MISSING' end as status
from (
  select
    v.migration, v.kind, v.name,
    case v.kind
      when 'table' then exists (
        select 1 from information_schema.tables t
        where t.table_schema = 'public' and t.table_name = v.name
      )
      when 'function' then exists (
        select 1 from information_schema.routines r
        where r.routine_schema = 'public' and r.routine_name = v.name
      )
      when 'bucket' then exists (
        select 1 from storage.buckets b where b.id = v.name
      )
    end as present
  from (values
    ('0003_runtime.sql',    'table',    'app_config'),
    ('0003_runtime.sql',    'table',    'rate_limit_counters'),
    ('0003_runtime.sql',    'function', 'increment_rate_limit'),
    ('0004_debate_runs.sql','table',    'debate_runs'),
    ('0004_debate_runs.sql','function', 'claim_debate_step'),
    ('0004_debate_runs.sql','function', 'sweep_stalled_debates'),
    ('0005_workspace.sql',  'table',    'workspaces'),
    ('0005_workspace.sql',  'table',    'workspace_members'),
    ('0005_workspace.sql',  'table',    'workspace_docs'),
    ('0005_workspace.sql',  'table',    'performance_rows'),
    ('0005_workspace.sql',  'function', 'is_workspace_member'),
    ('0005_workspace.sql',  'function', 'bump_workspace_doc'),
    ('0006_mcp.sql',        'table',    'oauth_clients'),
    ('0006_mcp.sql',        'table',    'oauth_codes'),
    ('0006_mcp.sql',        'table',    'oauth_tokens'),
    ('0007_performance_aggregation.sql', 'function', 'performance_summary'),
    ('0008_viewer_role.sql', 'function', 'is_workspace_writer'),
    ('0008_viewer_role.sql', 'function', 'workspace_user_id_by_email'),
    ('0008_viewer_role.sql', 'function', 'workspace_member_list'),
    -- Bonus: the one live piece of 0002_assets.sql. Its tables are proposals
    -- and deliberately not checked here — see that file's header. 'creative-assets'
    -- is the default; if this deployment sets SUPABASE_ASSET_BUCKET to something
    -- else in Vercel, edit the name below to match (SQL here can't read that var).
    ('0002_assets.sql',     'bucket',   'creative-assets')
  ) as v(migration, kind, name)
) as expected
order by expected.migration, expected.kind desc, expected.name;
