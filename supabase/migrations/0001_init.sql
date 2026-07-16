-- Growth OS — initial Supabase schema
--
-- Mirrors the state currently persisted via src/services/store.js under the
-- KEY_ITEMS / KEY_SETTINGS / KEY_DEBATES / KEY_METRICS / KEY_RECS localStorage
-- keys (see App.jsx load/save effects). This is a read layer for a demo
-- deployment — single tenant, no RLS/multi-client concerns (see
-- DECISIONS.md "Config-first per-client deployment": one Supabase project
-- per client, matching the existing one-Vercel-project-per-client model).
--
-- Not run yet — proposal only, per Phase 1.

-- ── brands ───────────────────────────────────────────────────────────────
-- Was: settings.brands[] (array of brand-brief objects embedded in the
-- settings blob). Pulled into its own table because initiatives.brand_id
-- and weekly_metrics.brand reference it — the one place in the shape where
-- a real foreign key adds value over a JSON blob.
create table brands (
  id            text primary key,        -- e.g. "default", "r1", "r2"
  name          text not null,
  code          text,                    -- initiative ID prefix, e.g. "NH"
  what_they_sell text not null default '',
  categories    text not null default '', -- free-text description, not the initiative CATEGORIES enum
  icp           text not null default '',
  why_they_win  text not null default '',
  relationship  text not null default '',
  constraint_note text not null default '', -- source field name was `constraint`, a reserved-ish word
  sort_order    int not null default 0   -- brands[0] is the "primary/default" brand; preserves array order
);

-- ── settings ─────────────────────────────────────────────────────────────
-- Was: the KEY_SETTINGS blob. Singleton table (one deployment = one client).
-- agents, health_metrics, data_sources, categories stay JSONB: they're
-- config lists no other table needs to join against, and their item shape
-- is defined and iterated in src/config.js / src/constants.js, not the DB.
create table settings (
  id                 int primary key default 1 check (id = 1), -- enforce singleton
  company_name       text not null default '',
  business_model     text not null default '',
  north_star_metric  text not null default '',
  north_star_current text not null default '',
  north_star_target  text not null default '',
  categories         jsonb not null default '[]',      -- string[]
  data_sources       jsonb not null default '[]',
  agents             jsonb not null default '[]',      -- [{id,label,icon,color,lens,blindspot}]
  health_metrics     jsonb not null default '[]',       -- [{key,label,enabled,isCalculated,calculationNote,manualValue,target,higherIsBetter}]
  theme              text not null default 'light' check (theme in ('light','dark')) -- was KEY_THEME
);

-- ── initiatives ──────────────────────────────────────────────────────────
-- Was: the KEY_ITEMS array (SEED in config.js). One row per initiative.
create table initiatives (
  id                 text primary key,        -- e.g. "e01" — kept as-is since linked_ids and UI code key off it
  init_id            text unique,             -- e.g. "NH-001" — human-facing ID, brand-code-prefixed
  title              text not null,
  init_type          text not null,           -- INIT_TYPES enum, kept text (client-configurable)
  hypothesis         text not null default '',
  observation        text not null default '',
  success_metric     text not null default '',
  category           text not null,           -- settings.categories enum, kept text (client-configurable)
  owner              text not null default '',
  primary_metric     text not null default '',
  kill_criteria      text not null default '',
  status             text not null,           -- STATUSES enum
  start_date         date,
  end_date           date,
  -- ICE is a fixed 3-key shape and is queried/computed on (iceScore()) —
  -- flattened to columns rather than left as jsonb.
  ice_impact         int,
  ice_certainty      int,
  ice_ease           int,
  revenue_impact     numeric not null default 0,
  spend_cost         numeric not null default 0,
  resource_cost      numeric not null default 0,
  linked_ids         text[] not null default '{}', -- loose references to other initiatives.id — not FK-enforced,
                                                     -- since seed/demo data can reference ids created later or pruned
  brand_id           text references brands(id),
  blocker            text not null default 'None',
  notes              text not null default '',
  measurement_metric text not null default '',
  measurement_scope  text not null default '',
  tracking_tag       text not null default '',
  -- Variable/optional nested objects — shape depends on outcome fields the
  -- team fills in at close, not fixed like ICE. Kept as jsonb.
  results            jsonb,           -- {actualOutcome, keyLearning, outcomeClassification, decisionMade, outcomeCertainty, actualRevenueImpact, actualSpendCost, actualResourceCost} | null
  prediction_snapshot jsonb,          -- {ice:{impact,certainty,ease}, revenueImpact, snapshotDate} | null, frozen at Draft->Running
  created_at         date not null default current_date,
  updated_at         timestamptz not null default now()
);
create index initiatives_brand_id_idx on initiatives(brand_id);
create index initiatives_status_idx on initiatives(status);

-- ── weekly_metrics ───────────────────────────────────────────────────────
-- Was: the KEY_METRICS array (SEED_WEEKLY_METRICS). metrics stays jsonb —
-- its key set varies by source (manual/meta/ga4/google_ads, see
-- METRIC_SOURCES in constants.js) and pivoting to columns would produce a
-- very sparse table for little query benefit in a read-only demo.
create table weekly_metrics (
  id          bigint generated always as identity primary key,
  date        date not null,
  brand       text not null references brands(id),
  source      text not null default 'manual', -- METRIC_SOURCES id: manual | meta | ga4 | google_ads
  metrics     jsonb not null default '{}',
  unique (date, brand, source)
);
create index weekly_metrics_date_idx on weekly_metrics(date);

-- ── debates ──────────────────────────────────────────────────────────────
-- Was: the KEY_DEBATES array (Signal AI debate history, capped at 20 in-app).
-- transcript/results kept as jsonb — both are AI-generated, display-only
-- blobs (chat turns; synthesized initiative ideas) with no relational use.
create table debates (
  id          text primary key,        -- e.g. "dbt-<timestamp>"
  date        timestamptz not null,
  context     text not null default '',
  transcript  jsonb not null default '[]', -- [{icon,label,text,toolsUsed?}, ...]
  results     jsonb not null default '[]', -- synthesized net-new initiative ideas
  turn_count  int not null default 0
);

-- ── recommendation_batches / recommendations ────────────────────────────
-- Was: the KEY_RECS array ("Next Plays", capped at 10 batches in-app).
-- Normalized into two tables (batch + one row per recommendation) rather
-- than a single jsonb array, since recommendation.status (pending /
-- dismissed / accepted) is something the read layer will plausibly want to
-- filter on directly.
create table recommendation_batches (
  id            text primary key,      -- e.g. "recbatch-<timestamp>"
  generated_at  timestamptz not null,
  week_of       date not null          -- Monday of the generation week
);

create table recommendations (
  id                    text primary key,   -- e.g. "rec-<timestamp>-<i>"
  batch_id              text not null references recommendation_batches(id) on delete cascade,
  title                 text not null,
  category              text not null default '',
  brand_target          text not null default 'Portfolio', -- free-text brand name, not an FK — may say "Portfolio"
  why_now               text not null default '',
  observation           text not null default '',
  hypothesis            text not null default '',
  success_metric        text not null default '',
  primary_metric        text not null default '',
  kill_criteria         text not null default '',
  init_type             text not null default 'A/B Test',
  ice_impact            int,
  ice_certainty         int,
  ice_ease              int,
  impact_rationale      text not null default '',
  certainty_rationale   text not null default '',
  reasoning_trace       text not null default '',
  source_learning_ids   text[] not null default '{}', -- loose references to initiatives.id (learnings), not FK-enforced
  status                text not null default 'pending', -- pending | dismissed | accepted
  accepted_as_init_id   text references initiatives(id)
);
create index recommendations_batch_id_idx on recommendations(batch_id);
