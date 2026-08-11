-- Marketers Lab — generated-asset provenance and AI spend
--
-- Mirrors the state persisted via src/services/store.js under the KEY_ASSETS and
-- KEY_USAGE localStorage keys. Like 0001_init.sql this is **not run yet** — it is
-- the proposed shape, kept next to the code that produces it so the two do not
-- drift while the browser store is still the live home.
--
-- The one part of this file that IS live today is the storage bucket at the
-- bottom: api/asset.js writes to it as soon as SUPABASE_URL and
-- SUPABASE_SERVICE_KEY are set, with no table required. That split is
-- deliberate — durable BYTES are useful immediately and need no schema, while
-- the records they belong to can stay in the browser store until the rest of
-- Phase 5 moves with them.

-- ── creative_assets ──────────────────────────────────────────────────────
-- Was: nothing. Generated frames lived in React state keyed by variant index
-- and were deliberately discarded on reload, so an asset had no id, no durable
-- link to the brief that produced it, and no way back from a performance row.
--
-- The load-bearing column is `ad_name`. The naming convention already joins a
-- performance row to an initiative; this is what extends that join to the
-- creative itself, so "which frame returned 2.4x" becomes a query rather than
-- an unanswerable question.
create table creative_assets (
  id                text primary key,        -- e.g. "as-1754900000000-3"
  kind              text not null check (kind in ('image','video')),

  initiative_id     text not null references initiatives(id) on delete cascade,
  -- Frozen copies rather than joins. An initiative can be renamed or moved to a
  -- different brand; the asset has to keep saying what it was made for at the
  -- time it was made, for the same reason the prediction snapshot exists.
  init_id           text,
  brand_id          text references brands(id),

  -- Round identity. Versioned rather than index-keyed, which is what lets an
  -- old round stay in the ledger without ever surfacing under a variant it does
  -- not belong to — see services/assets.js `variantKey`.
  brief_version     int not null default 0,
  variants_version  int not null default 0,
  variant_idx       int not null default 0,
  variant_key       text not null,
  variant_label     text not null default '',
  angle_slug        text not null default '',

  -- The join key. Empty string when the variant's naming did not validate,
  -- which is stored rather than omitted: an asset with no legal ad name is
  -- exactly the one that will never be attributable, and that should be
  -- queryable rather than absent.
  ad_name           text not null default '',
  channel           text not null default '',

  -- Provenance. `prompt` and `model` are verbatim, not a reference to whatever
  -- the prompt builder produces today — the builder will change and the record
  -- has to keep meaning what it meant.
  model             text not null default '',
  prompt            text not null default '',
  aspect            text not null default '',
  mime_type         text not null default '',

  cost_usd          numeric(10,4),           -- null, never 0, when unpriced
  cost_basis        text not null default 'estimate' check (cost_basis in ('estimate','measured')),

  -- Where the bytes are. `bytes_durable false` means the record outlived them,
  -- which is a normal state and not an error: the picture is the regenerable
  -- half, the provenance is not.
  storage_key       text,
  bytes_durable     boolean not null default false,

  -- Video only. `provider_url` is a short-lived signed link that is deliberately
  -- never re-hosted (see api/video.js) — it is recorded so the render can be
  -- collected before it lapses, and expected to be dead afterwards.
  provider          text,
  job_id            text,
  duration_seconds  numeric(8,2),
  provider_url      text,

  created_at        timestamptz not null default now()
);

create index creative_assets_initiative_idx on creative_assets (initiative_id, created_at desc);
create index creative_assets_round_idx      on creative_assets (initiative_id, brief_version, variants_version);
-- The join that makes this table worth having: performance rows arrive keyed on
-- the ad name, and this is how they find the creative that produced them.
create index creative_assets_ad_name_idx    on creative_assets (ad_name) where ad_name <> '';

-- ── ai_usage ─────────────────────────────────────────────────────────────
-- Was: nothing. Every proxy response has always carried its own token counts —
-- Anthropic returns `usage` natively, api/_adapters.js normalises Gemini's and
-- OpenAI's into the same shape — and they were discarded, so the admin console
-- could say which model served which feature group and nothing could say what
-- that choice cost.
--
-- `rate` is stored alongside the computed cost on purpose. A ledger holding
-- only tokens has to be re-priced against whatever the catalogue says today,
-- which silently restates history every time a provider changes a number.
create table ai_usage (
  id             text primary key,
  ts             timestamptz not null default now(),

  feature_group  text not null default '',    -- FEATURE_GROUPS key: what an operator routes
  fn             text not null default '',    -- call site: what actually spent the money
  model          text not null default '',
  provider       text not null default '',
  modality       text not null default 'text' check (modality in ('text','image','video')),

  input_tokens   int,
  output_tokens  int,

  cost_usd       numeric(12,6),               -- null when the model has no published rate
  rate           jsonb,                       -- the rate that produced cost_usd, frozen
  cost_basis     text not null default 'estimate' check (cost_basis in ('estimate','measured')),

  -- Present so spend can be attributed to the experiment that caused it, which
  -- is what makes production cost usable as a line in the calibration
  -- denominator rather than flat platform overhead.
  initiative_id  text references initiatives(id) on delete set null,

  ok             boolean not null default true,
  error_kind     text
);

create index ai_usage_ts_idx           on ai_usage (ts desc);
create index ai_usage_group_idx        on ai_usage (feature_group, ts desc);
create index ai_usage_initiative_idx   on ai_usage (initiative_id) where initiative_id is not null;

-- ── storage bucket ───────────────────────────────────────────────────────
-- This part is live. api/asset.js writes here the moment SUPABASE_URL and
-- SUPABASE_SERVICE_KEY are set; the tables above are not required for it.
--
-- Private, with no RLS policy for the anon role — deliberately. Uploads and
-- signed reads both go through api/asset.js using the service key, because a
-- browser-held anon key with insert rights is the `VITE_GOS_SECRET` mistake
-- this codebase already made once (see services/ai/_shared.js): a credential
-- that ships inside the bundle is not a credential, and without per-user auth
-- there is no RLS policy that makes an insert-capable anon key safe.
insert into storage.buckets (id, name, public)
values ('creative-assets', 'creative-assets', false)
on conflict (id) do nothing;
