# Marketers Lab — Roadmap

> This roadmap covers the evolution from a modular AI-assisted dashboard into an
> experiment ledger whose campaign data, results and learnings are joined by one
> taxonomy. Each phase is a deliberate architectural step, not a feature wishlist.
>
> **Read the phase numbers as dependency order, not as a plan.** Phases 3 and 4 are
> gated on ten paying clients and should not be started before then; cross-customer
> benchmarking has been cut outright. What is actually next is Phase 2.0 (Supabase),
> then the campaign fact model and read connectors that depend on it. The
> commercial thesis these are sequenced against is in
> [docs/commercial.md](./docs/commercial.md).

---

## Architecture Principles

These decisions were made deliberately and constrain the roadmap.

- **Config-first multi-tenancy:** Client context (brands, categories, agents, templates, seed data) lives in `config.js`, isolated from app logic. Per-client deployment is a single file swap plus a Vercel project — no backend required at this stage.
- **localStorage-first persistence:** All state lives in `localStorage` under versioned keys (`gos_items_v4`, etc.) with a memory fallback for sandboxed environments. The abstraction (`store.get` / `store.set`) is backend-agnostic; migrating to Postgres is a layer swap, not a rewrite.
- **Serverless proxy:** All Anthropic API calls route through `api/proxy.js` on Vercel — shared secret auth, per-IP rate limiting, CORS locked to the production domain. API key never reaches the browser.
- **Modular React, no framework:** App logic is split across `src/views/`, `src/components/`, `src/services/`, and `src/prompts/` with `App.jsx` as the thin orchestration layer (~1,580 lines post-refactor). No router, no state management library — intentional for portability and AI-assisted development.
- **Signal AI as the core loop:** The multi-agent C-Suite debate (CFO, CMO, COO, Contrarian) is the primary reasoning engine. It reasons from live portfolio state — not static reports — and produces ICE-scored, trackable output. This integration is the defensible layer, not the debate format itself.

---

## Phase 1 — Stabilisation & Core Loop Completion

**Target:** Secure the modularised architecture, eliminate silent failure modes, and close the weekly workflow loop.

### Bug sweep

- [x] **Fix Toast Scope:** Route `showToast` correctly into `ContributionView` and `DashView` — currently called out of scope, causing ReferenceErrors.
- [x] **Surface AI Errors:** Standardise error handling on form-side AI calls to surface proxy failures (rate limits, timeouts) as toasts instead of failing silently.
- [x] **State Persistence:** Include `KEY_RECS` (Next Plays recommendations) in JSON backup/restore payloads — currently omitted.
- [x] **Data Integrity:** Move `acceptRecommendation` status transitions strictly into `handleSave` to prevent orphaned accepted states when a user dismisses the form mid-flow.
- [x] **Dark mode persistence:** Verify `KEY_THEME` round-trips correctly through the `store` abstraction on page reload.
- [x] **Revenue clarity:** Rename dashboard "Revenue Impacted" KPI to "Projected Impact" and source the metric from `actualRevenueImpact` where available, falling back to `revenueImpact` — separates estimates from actuals.

### UI Polish (dark mode)

[x] Verify dark mode colors and theme persistence across all components

### Client Readout View

[x] A dedicated read-only React view that aggregates the current week's state: Scorecard, completed learnings, live variants, and next drafts. Structured for copy-paste into a client-facing report. Keeps the operational and reporting layers separate in the data model.

### Business Health Panel

[x] just shipped — lightweight guided flow: auto-surfaced initiatives needing attention (overdue, no update in 7+ days, completed tests without post-mortems), a structured status log prompt across running experiments, and a "This week's focus" confirmation step. Implemented as a modal triggered from the Dashboard triage card — not a new view. Closes the gap between one-time setup and ongoing weekly use.

- [x] **Business Health Panel:** Operator-defined portfolio-level guardrail metrics (default: New Customer CVR, Orders, Registrations, Blended CAC, Return Rate) surfaced as a standing dashboard panel with WoW delta and optional targets. Reads from existing weekly pulse data — no new data connections required. Closes the gap between experiment activity and unintended portfolio-level effects.

### Next Plays maturation

- [x] **Weekly cadence anchoring:** Stamp `weekOf` (YYYY-MM-DD, Monday of the generation week) onto each batch at save time. Makes the recommendation history week-addressable — a second generation in the same calendar week doesn't displace the prior-week reference point for diffing.
- [x] **Batch diffing:** Collapsed "Changes from last week" section on the Next Plays card — surfaces entered, dropped, and re-ranked plays between the current week's batch and the immediately preceding prior-week batch. Pure render-time computation; no persisted state. Match key is `title` (rec IDs are time-stamped and not stable across independently generated batches).

*Phase 1 complete — June 2026.*

### Phase 1.5 — Audit remediation (July 2026)

A pre-sale audit surfaced four blocking issues and a set of credibility gaps. All are closed; the reasoning behind each is in DECISIONS.md.

- [x] **Remove the browser-held proxy credential.** `VITE_GOS_SECRET` was inlined into the production bundle by Vite, so the "secret" guarding the Anthropic proxy was readable from devtools. Replaced with an origin allowlist plus request-shape bounds (model allowlist, `max_tokens` ceiling, body size, system-prompt cap) and durable cross-instance rate limiting that fails closed.
- [x] **Stop silent data loss.** `store.set` swallowed quota errors and fell through to memory, so saves appeared to succeed and vanished on reload. Write outcomes are now reported and raise a persistent banner with a one-click backup.
- [x] **Fix a latent crash.** `useState` was called after an early return in `NextPlaysModal` — a rules-of-hooks violation that would throw whenever a recommendation stopped resolving while its modal was open.
- [x] **Fix the metrics that were wrong.** The "portfolio covers N% of gap" tile divided an absolute dollar figure by a per-period one *and* double-counted already-realised revenue; it now shows both sides as dollars without dividing them. Weekly Pulse rendered `▼NaN%` for any brand with no logged week. ICE colour thresholds painted 82% of all reachable scores alarm-red, including 8/8/8 — recalibrated to the metric's actual distribution.
- [x] **Fix light-mode contrast.** Gold text measured 2.42:1 on white (AA needs 4.5:1) while the same token measured 10.12:1 in dark mode — the palette had been tuned in dark only. Split into an ink token and a fill token, and added `scripts/check-contrast.mjs` to CI so all 66 themed pairings are checked on every push.
- [x] **Recolour dark mode.** Warm brown surfaces made the gold accent read as mud; surfaces moved to cool charcoal. See DECISIONS.md for why the accent itself was kept.
- [x] **Remove the 1126px layout cap.** `src/index.css` was Vite starter boilerplate from an unrelated project: a purple palette, an 18px root size, and `#root { width: 1126px; border-inline: 1px solid }`, which boxed the dashboard on every monitor. Also removed an unused Tabler icon webfont loaded from a CDN.
- [x] **Fix mobile.** The nav row pushed the document 30px wider than a 390px viewport; the tab strip now scrolls and no width overflows.
- [x] **Make the demo self-refreshing.** Seed dates rebase onto the current week at load, so the app no longer opens on "Last logged 68d ago ⚠️". Spend, ROAS, CVR, registrations and return rate are derived from the authored series so the Weekly Pulse and Business Health panels are fully populated, and CAC was calibrated to a believable ROAS band.
- [x] **Model tiering.** One `MODELS` constant replaces eleven hardcoded model IDs; reasoning and transformation calls now run on different tiers with adaptive thinking and prompt caching.
- [x] **Engineering hygiene.** Lint errors 63 → 0 (including two duplicate object keys that silently discarded a style), `npm test` wired to the existing test file, `npm run verify` added, and a GitHub Actions workflow running lint, tests, contrast and build on every push.

---

## Phase 1.6 — Creative loop and campaign nomenclature (August 2026)

The first slice of the Marketers Lab expansion, chosen because it is the only part
of that scope with no backend dependency — it ships against `localStorage` today
and does not wait on Supabase.

- [x] **Naming convention as data.** `settings.namingSchema` holds an ordered
  segment list with controlled vocabularies; `src/services/naming.js` builds,
  parses and validates against it. Ships with the operator's live Meta convention
  (`Channel_Handle_Asset_Campaign_Gender_Theme_Angle_Category_Flavor_Format_Initiative`)
  as the default. Parsing refuses to guess on a segment-count mismatch and
  reports unparsed rows in every breakdown rather than dropping them.
- [x] **The initiative bridge.** The convention's trailing `Initiative` segment
  carries an initiative's `trackingTag`, which is the attribution socket that has
  been on every initiative record since the CSV work. `matchNamesToInitiatives`
  separates untagged spend (normal) from a tag that resolves to nothing (a broken
  link worth surfacing).
- [x] **Creative Studio.** Brief → variants against a selected Draft or Running
  initiative. Briefs are grounded in the brand brief and closed learnings, and
  carry `wouldFalsify` and `claimsToVerify`. Variants come back as validated
  naming segments and are assembled into ad names in code, then exported as CSV
  or copied for paste into the ad platform.

- [x] **Key-frame generation.** Gemini image models ("Nano Banana") behind
  `api/image.js`, prompted from the approved brief rather than a free-text box.
  Session-only by design — see DECISIONS.md for why persisting them needs blob
  storage rather than a bigger JSON blob.

- [x] **Performance import keyed on ad name.** The metrics importer now accepts a
  campaign-level export as well as the weekly-brand shape, routed by
  `detectCsvShape` from the file's own headers rather than by asking first. Each
  row's entity name is parsed through `naming.js` against the channel and the
  level the header implies, and rows are joined to initiatives with
  `matchNamesToInitiatives`. Platform export headers ("Amount spent (USD)",
  "Purchases conversion value", "Impr.") are recognised as they come, and the
  reader is quote-aware — a campaign name containing a comma used to be able to
  shift every metric column left.
- [x] **Breakdown view.** `Performance → Breakdown` pivots spend, conversions,
  revenue, ROAS and CPA by any dimension the imported names carry, with unparsed
  and not-in-template counts stated above the pivot rather than hidden. Ratios
  are recomputed from each group's summed numerator and denominator, never
  averaged across rows.
- [x] **Attribution surface.** `Performance → Attribution` keeps the three-way
  split the bridge was designed around — attributed, untagged (normal BAU
  spend), and a tag that resolves to nothing (a broken link) — and names the
  broken ones, since a count is not actionable and the string is.
- [x] **The convention has a page.** `Performance → Convention` renders the
  active schema: every channel, every level, every slot in order, with hints and
  controlled vocabularies. The schema was editable data with no surface at all —
  the only way to see it was to produce variants in the Creative Studio and read
  the slot editors, so "where is the naming convention" had no answer.
- [x] **The taxonomy takes a company's own variables.** `Performance → Taxonomy`
  now writes as well as reads. An operator can add a dimension the shipped
  registry does not have — controlled or free text, placed into whichever
  (channel, level) templates they choose, or placed nowhere yet — and can add a
  value to a shipped controlled list when a campaign brings something the list
  has never had to describe. Additions live in `settings.namingCustom` as an
  overlay merged at `resolveSchema` time rather than as an edit to the schema
  blob, so the shipped registry keeps improving underneath a workspace that
  extended it. Every reader resolves the schema through that one function, so a
  variable added here appears in the builder, the parser, the breakdown pivots
  and the creative slot prompts without any of them knowing custom variables
  exist. A placed variable is appended to the end of its template and never
  inserted into the middle of one — appending makes an older name fail the
  slot-count check, which is loud and counted, where inserting would shift every
  value after the insertion point one dimension left and parse cleanly into
  wrong answers.

### Next in this slice

- [ ] **The rest of the schema editor.** Custom variables are editable in the
  app; the delimiter, the placeholder, the slot *order* inside a template and
  the shipped dimensions' own labels and hints are not. Reordering is the one
  that is not simply the next checkbox — it needs an answer for the names
  already live in the ad account, which cannot be renamed without resetting
  their learning phase.
- [ ] **Feed measured figures into Test Validity.** The rollup now knows each
  initiative's real spend, conversions and revenue from its ad names. The Test
  Validity panel still takes hand-entered control/variant counts.
- [ ] **Performance rows do not survive the browser.** Capped at 5,000 rows in
  `localStorage`, oldest dropped on merge with the count reported. This is the
  read path proven against real exports, deliberately ahead of its storage —
  Phase 5.3 is where it gets a home that fits.

---

## Phase 2 — The Data Moat

**Target:** Replace manual CSV data entry with live API connections to ground the Prediction Ledger in authoritative numbers.

### 2.0 — Persistence: Supabase. First, and before anything else here

This moved to the front of the phase. The old trigger was a soft one — "the first
client who needs a second user, a second device, or who asks where their data is
stored" — and it was written when the thing outgrowing the browser was going to be
someone else's objection. It isn't. It is already the product's own differentiating
feature: **performance rows are capped at 5,000 in `localStorage` and the oldest are
dropped on merge** (Phase 1.6, "Performance rows do not survive the browser"). The
campaign↔experiment bridge is the part of this product no competitor has, it is the
part that ingests the most rows, and it is silently discarding history today. A
learning system that forgets is not a demo problem to defer; it is the claim
failing.

So the trigger is met, by the codebase rather than by a client. Build it.

Postgres for the relational queries the dashboard already runs (win rate by
category, cross-brand gaps, contribution), RLS for tenant isolation, and Supabase
Auth for the session token the proxy needs. Schema draft is in
`supabase/migrations/0001_init.sql`.

Be honest about the cost: `store.js` stores one JSON blob per key, and that model does not survive contact with a relational schema. The read paths are real work, not an adapter swap.

**Sequencing consequence:** the campaign fact model (Phase 5.3) and the read
connectors (5.4) both list Supabase as a hard prerequisite. With 2.0 pulled
forward, those stop being late-phase items gated on infrastructure that keeps
receding and become the next real work after it.

### Normalisation contract

Extend `normalizeInitiativeRecord` to accept client-specific RegEx configurations and explicit platform ID mappings. This allows the system to attribute messy, legacy ad campaigns without touching live performance data — the API adapters in subsequent steps all share this contract.

**Sequencing note:** connectors ship one at a time behind this contract, ordered by value over integration pain — Shopify, then GA4, then Meta/Google Ads only on explicit request. CSV import is permanent regardless: it is the only path that works for an unsupported platform or a client whose IT won't grant API access. Reasoning in DECISIONS.md.

### Shopify integration

Build a serverless function adapter pulling real order and revenue data from a Shopify store (Development Store for initial validation). Route the data feed through `normalizeInitiativeRecord` so API-sourced and CSV-sourced data share identical internal state. Signal AI and Next Plays reason from whichever source is available without branching logic.

### GA4 funnel integration

Connect the GA4 Data API to auto-populate funnel context. The recommendation engine currently targets estimated drop-off points; GA4 replaces those with actuals. The FunnelCoverageMap gap detection becomes genuinely diagnostic rather than illustrative.

### Proxy hardening — per-user auth

The shared-secret model is gone (Phase 1.5); what remains is real per-user accountability. The proxy currently authorises on origin and caps cost by request shape, which is adequate for single-tenant demo and early client work but attributes nothing to a person.

This step verifies a session token issued by the same auth that gates the app and rate limits per user rather than per IP. **It is the same piece of work as the Supabase migration above (2.0)** — the token has to come from somewhere — and should not be attempted separately.

- [ ] **Health Metric Anomaly Flagging:** When a designated health metric moves beyond a configurable threshold in a week where experiments are active, surface a passive contextual flag in the Business Health Panel. Requires live data connections to be meaningful at scale.

---

## Phases 3 and 4 are gated on customers, not on readiness

**Neither phase starts before 10 paying clients.** They are recorded here because
the thinking is done and re-deriving it later would be waste, not because they are
next. Both are scaling work, and scaling work done before there is something to
scale is the most expensive kind of progress available: it takes months, it is
genuinely interesting, and it moves nothing.

The specific failure this gate exists to prevent: background execution, prompt
versioning, Zod contracts, RLS multi-tenancy and a federated knowledge base are all
defensible engineering. Each one can be justified on its own merits on any given
week. Together they are two quarters spent making a product easier to operate at a
scale it has never been asked to reach, while the question of whether anyone will
pay for it stays unanswered.

Read the gate as literal. Ten paying clients, then reopen this section.

---

## Phase 3 — Autonomous Orchestration *(gated: 10 paying clients)*

**Target:** Automate the AI loops to support multi-client management without proportional manual overhead.

### Background execution engine

Install `inngest` or `trigger.dev` to handle durable, long-running AI tasks outside Vercel serverless timeouts. The Signal debate and Next Plays pipeline are the primary candidates — both can exceed 10-second cold-path limits under load. Background execution also enables scheduled runs (weekly pulse triggers, overnight audit sweeps) without user-initiated calls.

### LLM output validation (Zod)

Wrap all LLM-generated structured outputs in strict Zod schemas. Currently, AI responses are parsed defensively but not validated against a contract — schema drift between prompt changes and downstream consumers is a latent failure mode. Zod enforcement guarantees that generated hypotheses, ICE scores, and debate outputs match the data model at the boundary.

### Prompt versioning

As Zod validation makes output contracts explicit, prompt drift becomes the new failure mode. Version prompts alongside their Zod schemas so a prompt change that breaks the contract is detectable before it reaches production. Lightweight implementation: prompts as named exports in `src/prompts/` with version tags and a corresponding schema file.

### Continuous audit loop

Background cron worker that cross-references live Shopify/Meta metrics against active experiments, automatically flags anomalies (significant delta between predicted and actual trajectory), and drafts weekly executive summaries for each client context. The audit output feeds back into the Signal debate as structured context rather than manually assembled narrative.

---

## Phase 4 — Productised Scaling *(gated: 10 paying clients)*

**Target:** Transition from a config-swapped per-client deployment to a multi-tenant platform with a federated knowledge base.

### Multi-tenant architecture

Separate database indexing and client contexts so a single instance manages multiple brands securely. The natural implementation path: Supabase with Row-Level Security (RLS), where the existing `store` abstraction is re-backed by Postgres rather than `localStorage`. The config-first design means brand context stays in the data layer, not the codebase — no per-client forks to maintain.

### Federated knowledge base (RAG)

Automatically sanitise closed initiatives — stripping identifying brand data — and convert the core strategic learnings (hypothesis, result, mechanism, transferability) into vector embeddings via `pgvector`. The Ask the Library feature upgrades from in-session retrieval to a cross-portfolio semantic search, surfacing mechanisms that proved out in one brand's context when constructing hypotheses for another.

**Separate trigger, and it is not the client count.** Retrieval earns its
complexity when the corpus stops fitting in a context window. Ask the Library
sends closed learnings in-session today and that is the correct design for a
portfolio of tens. Build this when a real workspace's closed learnings exceed what
a single call can carry, measured rather than assumed — not because the phase
number came up.

### Cross-customer anonymised benchmarking — cut

**Removed from the roadmap.** It was described here as "the feature that creates
compounding value with each additional client," which is the network-effects story
a platform tells about itself at 500 customers. At the count this product is
planning for, the arithmetic does not work: a category benchmark drawn from a
handful of clients is a small sample presented with the authority of a large one,
and the first time it is wrong it is wrong in a client deck.

It also inverts the sale. The pitch is *your* organisation's accumulated evidence,
weighted by how strongly your own tests support it. Aggregating across customers
replaces the thing being bought with an industry average, and requires asking every
client for permission to use their results — a conversation that costs more trust
than the feature returns.

The compounding asset is one workspace's own experiment history, and that already
exists. Revisit only if the client count reaches a scale where a category cohort is
genuinely large, and only with the contract language written first.

---

## Phase 5 — From decision engine to execution loop

*(This scope was previously titled "Marketers Lab". That is now the product's
name rather than a phase of it — see DECISIONS.md.)*

The expansion from a decision engine into an experimentation platform that also
executes. Sequenced by dependency, not by appeal: everything below Phase 5.1
needs a backend, and pretending otherwise is how this stalls.

**5.1 and 5.2 are the next app-layer work after 2.0** — both are pure additions to
the existing data model with no backend dependency, and together they are what
turns a backlog into a research programme. They are also the two items a buyer can
see in a demo without a single connector being wired.

Positioning is **practice-first, product-shaped** — built for the operator's own
consulting work, with schema decisions made multi-tenant-safe from the first
migration so productising is a policy change rather than a rewrite. See
DECISIONS.md.

### 5.1 — The learning agenda layer

Today the hierarchy is flat: initiatives. The layer above them is what turns a
backlog into a research programme.

**Learning Agenda → Experiments → Campaigns/ad entities → Metrics**

A learning agenda item is a question the business needs answered ("does creator
authority beat product demonstration for cold traffic?"). Experiments ladder up
to it. This unlocks backward test design — name the learning, and derive what to
hold constant, what to vary, the sample size, the duration, and the result that
would falsify it — and it makes "which of our campaigns actually taught us
anything" answerable for the first time.

App-layer work on the existing data model. No backend dependency.

### 5.2 — Pre-registration and kill criteria as an enforced gate

Harvested from the Biosphere design prototype, which got this right:

> Nothing leaves quarantine until its kill criteria are confirmed. Set before
> launch, not after.

`killCriteria` exists on every initiative today as free text with no gate and no
tracking. This makes it structural: a Draft cannot move to Running until kill
criteria are set, and a Running initiative shows live distance to its kill line.
Also from that prototype and worth adopting: a **Franchise / Loonshot** risk
taxonomy, so a portfolio can be read for whether it is taking any real swings.

### 5.3 — Campaign fact model *(requires Supabase)*

The weekly-metrics contract is one row per week per brand per source. Campaign
analysis needs facts at campaign/adset/ad × day, with nomenclature segments
parsed into typed dimensions, so that every "break performance down by X" is a
`GROUP BY` rather than a bespoke view.

The link table is what makes campaign↔experiment work in both directions with
one shape:

```
initiative_campaigns(initiative_id, platform, entity_type, entity_id, role)
role ∈ control | variant | holdout
```

Assign campaigns to an experiment, or promote a set of campaigns into one —
same table, two entry points.

**Prerequisite:** Supabase (Phase 2). The JSON-blob-per-key model does not
survive a relational fact table; this is the read-path work DECISIONS.md warns
is real rather than an adapter swap.

### 5.4 — Read connectors: Meta and Google Ads *(requires Supabase)*

Ships behind the existing normalisation contract, one at a time, per the
ingestion decision. Note this reorders the original sequencing: Meta and Google
were last because their marginal value over a two-minute weekly CSV was low.
Under Marketers Lab they carry the campaign fact model, so the value is no longer
marginal. Shopify and GA4 keep their original priority for the metrics they
uniquely own.

**Hard prerequisite:** OAuth refresh tokens cannot live in a browser. This is the
forcing condition for Supabase, arriving whether or not a client ever asks where
their data is stored.

### 5.5 — Campaign execution behind a proposal gate *(requires 5.4)*

Create, budget, pause. Every mutation is a proposed change, diffed against live
state, human-approved, then applied by a separate path that writes an audit
record. No auto-approval at any spend level. Full reasoning in DECISIONS.md — this
is the one part of the scope where getting it wrong costs money rather than
credibility.

### 5.6 — Creative production, including video from evidence

Extends the Creative Studio from direction to assets: brief → variant set →
generated or templated creative → tagged with the initiative → matched back
through the naming convention when performance lands. Closes the loop that
5.1–5.5 opens.

**Product video generated from the learning library is the intended end state,**
and it is deliberately last. The interesting version is not "generate a video" —
it is a video whose angle, hook and proof are chosen because the library says
those are the claims this brand's own tests have supported, generated against a
hypothesis, named with the initiative's tracking tag, and joined back to its own
performance when the rows land. Every one of those clauses depends on 5.1 through
5.4 working on real data. Built earlier, it is an asset generator, which is a
commodity, and it is the fastest way to be mistaken for one.

**What ships today is not this.** `api/video.js` renders talking-head avatars
(HeyGen, VEED Fabric via fal.ai). Useful, and worth keeping wired since it costs
nothing to leave in place — but a spokesperson render is a different product from
product video, and the roadmap should not let the presence of the first imply
progress on the second.

### Naming and identity — resolved

Previously an open question here. The product is **Marketers Lab**; `Growth OS`
is retired as a public name and kept as the repository name. The sand-gold
editorial identity stays, and the Biosphere prototype's invented vocabulary
(Observatory, Quarantine, Vivarium, Microscope) is not adopted. Full reasoning,
including why the fallback for a trademark conflict is a new name rather than a
reversion, is in DECISIONS.md.
