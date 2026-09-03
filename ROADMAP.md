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
  Up to three brand style references are attached per generation so a round of
  creative shares one visual language.

- [x] **Generated assets have provenance.** `src/services/assets.js` records an
  id, the initiative, the brief and variant version, the prompt, the model, the
  cost, and **the ad name the asset ships under** — which is what extends the
  nomenclature join from `name → initiative` to `asset → initiative`. Bytes go
  through `src/services/assetStore.js` to Supabase Storage when configured and
  stay session-only when not; the record persists in both cases. This was
  originally scoped inside 5.7 and was pulled forward, because every day
  without it is provenance that cannot be reconstructed later — see DECISIONS.md.

- [x] **The brief reasons from measured returns.** `src/services/creativeEvidence.js`
  feeds per-dimension ROAS and CPA from imported ad names into every creative
  brief, marks groups below a spend floor as not-evidence, and replaces the
  unranked `slice(0, 25)` on closed learnings with a stated selection rule that
  reports its own remainder. Briefs are versioned rather than overwritten.

- [x] **AI spend is recorded.** `src/services/usage.js` writes one priced row per
  call — the token counts were always in the proxy response and were being
  discarded — and `/admin → Spend` rolls them up by feature group, model,
  provider and call site. Per-browser and estimate-only by design; see
  DECISIONS.md for what that scope costs and what would change it.

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
- [x] **Performance rows survive the browser** — closed by 2.0, not by 5.4.
  This was written as read-path-ahead-of-its-storage, waiting on the campaign
  fact model. The workspace migration overtook it:
  `supabase/migrations/0005_workspace.sql` gives `performance_rows` its own
  table, uncapped, keyed on the same `perfRowKey` the in-memory merge dedupes
  with, so `ON CONFLICT` and `mergePerformanceRows` mean the same thing;
  `api/state.js` reads and upserts it and `services/remoteState.js` routes rows
  there. The 5,000-row cap still governs the `localStorage` path, which is now
  the demo and offline case rather than the only case. 5.4 is still where the
  metrics worth indexing get promoted out of JSONB — that is a different
  problem from having somewhere to put them.

### Phase 1.7 — Interface audit remediation (August 2026)

A third audit pass, this one on UI, UX and usability rather than correctness —
the question was not "does it work" but "does it read as finished next to the
software this buyer already has open". Twenty-six findings; the report and its
measurements are in [docs/ui-audit-2026-08.md](./docs/ui-audit-2026-08.md).

- [x] **Finish the rename.** The shell still said `GROWTH OS` in the top-left of
  every screen, the client readout export was headed `GROWTH OS SUMMARY`, and
  CSV exports were `GrowthOS_export_*.csv`. Exports now carry the workspace's
  own name, as the JSON backup already did.
- [x] **Remove the last of the starter template.** The favicon was another
  product's purple lightning bolt and `public/icons.svg` was an unreferenced
  Bluesky/Discord/GitHub sprite — the same Vite residue as the 1126px
  `index.css` removed in 1.5.
- [x] **Add routing.** `nav` was React state, so Back left the app, nothing was
  linkable, a refresh lost your place, and every pageview Analytics recorded was
  `/`. Hash routing over `nav` and `selId`, with per-view document titles.
- [x] **Add global search.** ⌘K over initiative titles, ids, hypotheses and
  learnings, plus nav destinations and the four common actions. There were no
  keyboard shortcuts of any kind before it.
- [x] **Make the layers dialogs.** Eleven modals, two drawers and the tour, none
  of which closed on Escape, trapped focus, or returned it. `useDialog` does all
  four and `Modal` routes every modal through it.
- [x] **Label the forms.** `FR` rendered a `<label>` with no `htmlFor` and the
  input as a sibling, so no field in the product was associated with its label.
- [x] **Enforce pre-registration.** The three fields marked required were not.
  Enforced on new initiatives with inline reasons; flagged rather than blocked
  on the 38 seeded records that predate the fields.
- [x] **Guard unsaved work.** The editor could be abandoned in one click with no
  warning and Settings discarded nine sections of edits on a backdrop click.
- [x] **Name the destructive action.** Deleting an initiative was a native
  `confirm()` that did not say what it was deleting, with no undo.
- [x] **Replace emoji with an icon set.** ~40 `currentColor` stroke icons on a
  16px grid. Agent avatars were a character typed into a text box; template
  icons were dead `ti-*` class names from a webfont removed months ago.
- [x] **Give the dashboard a hierarchy.** The range picker sat seventh down the
  page, above the ten panels it governs and below the five it does not. Ten
  near-equal tiles became four plus a disclosure.
- [x] **One formatter for money and dates**, with currency and locale as
  settings. Four disagreeing copies rendered `$2.4M` three different ways.
- [x] **Hold `textMuted` to AA.** It was waived to AA-Large on a "decorative"
  claim the code never honoured, and measured 4.05:1.
- [x] **Cap the token vocabulary.** 13 border radii, 24 font sizes and ~60
  button padding pairs; `RADIUS`/`FS`/`SP` scales and sized button variants.
- [x] **Fix the theme flash and the link preview.** A dark-mode user got a white
  frame on every load; a shared link unfurled as a bare URL.
- [x] **Responsive escape hatch.** One media query governed the whole app, so 18
  fixed `1fr 1fr` grids never collapsed and the tour spotlit off-screen
  rectangles.

**Closed in a follow-up pass (August 2026):**

- [x] **Settings is a page.** Nine sections in a 560px modal became a page with
  a section rail, each section addressable — `#/settings/naming` is a link
  somebody can send. The campaign nomenclature editor moved in with it, out of
  Performance → Taxonomy, which is what the README always claimed. Performance
  keeps a Convention tab as a signpost, because that is where you are standing
  when you find the convention is wrong.
- [x] **The seeded portfolio is backfilled.** All thirty-eight initiatives in
  both configs now carry an observation and a success metric. The demo was the
  largest counter-example to the discipline the product sells.
- [x] **The contribution panel says what it means.** Its three segments encode a
  certainty ramp and were drawn in `gold`, `warn` and grey — the first two being
  1.07:1 apart in light mode, i.e. the same colour. Measured is teal (which is
  what teal already means everywhere else in the app), forecast is gold, and
  `check-contrast` now enforces a 1.4:1 floor between adjacent segments so the
  ramp survives greyscale and colour blindness.
- [x] **A fifth currency formatter, and the symbol it exposed.** ContributionView
  still had a local `fmt`/`fmtBig`; and `resolveSymbol` used Intl's default
  currency display, so USD under `en-CA` rendered "US$704.8k" one panel away from
  "$273k". `narrowSymbol`, and one formatter.
- [x] **Buttons answer the pointer.** They were the most-clicked elements in the
  product and the only interactive surface with no hover state.

---

### Phase 1.8 — Ready for a real account (August 2026)

A fourth pass, and the first one aimed at the sale rather than at the software.
The question was not "does it work" or "does it read as finished" but "what
stands between this and the first paid implementation". Four answers, all
shipped, plus two that are decisions rather than code.

- [x] **The account audit is a surface, not an afternoon.**
  `Performance → Account audit` takes a names-only export — one per line, or a
  CSV with a name column — and returns the delimiter the account is actually
  using, the slot-count histogram, what lives in each slot with its likely
  dimension, the parse rate against the current schema broken out by failure
  kind, and the list of names that will have to be mapped by hand. commercial.md
  budgets 20–40 hours for this and warns it is consistently underestimated; the
  parts of it that are arithmetic are now arithmetic. It runs on names alone,
  which is what lets it be used on a prospect's account in a first meeting,
  before a contract and before any spend data has changed hands. The judgement —
  which of those slots should become controlled dimensions — is deliberately not
  automated. `src/services/accountAudit.js`.
- [x] **Live workspaces are a mode, not a build flag.** `DEMO_MODE` answers
  "should a cold visitor get a tour"; `settings.workspaceMode` answers "is the
  data in this browser real". Conflating them is how a client workspace ends up
  one click from Reset Demo, which is now unreachable rather than confirmable in
  a live workspace. The demo stays exactly as it is, seeded and resettable.
- [x] **The aggregates-only contract is enforced and stated.** Every importer
  identifies, drops and reports any column carrying personal data, and the same
  guard is the chokepoint a future connector has to pass. Both CSV importers
  already happened to read only recognised columns — this turns an accident of
  how they were written into a property with a test and a document a prospect
  can be handed. `src/services/dataSafety.js`, `docs/data-handling.md`.
- [x] **The peeking guard.** The Test Validity panel had a correct sample-size
  calculator and a correct significance test, and no idea how many times it had
  been asked — which is the single most common way an ad test produces a false
  winner. A reading window derived from sample size and expected weekly traffic,
  the result behind a click that is counted, and a threshold corrected for the
  number of looks. Reading early is always allowed and always recorded; blocking
  it would move the decision into a spreadsheet where nothing is counted at all.
  The Pocock boundaries are solved numerically in the test rather than quoted.
  `src/services/testValidity.js`.
- [x] **The licence.** MIT on a private repository still granted anyone who saw
  it a free fork of the parser the whole commercial thesis rests on. Now
  proprietary, with a use right for clients rather than a source licence.
- [x] **Backup reminders fire for the workspace that has never had one**, at
  seven days in live and fourteen in demo. The old check read the timestamp and
  did nothing when there wasn't one.

#### Next in this slice

- [ ] **Walk a real install end to end.** Every config in the repo has run on
  seeded data. commercial.md is right that a "no" on the demo config cannot be
  distinguished from a "not shown properly" — and the same is true of the first
  real install, where it costs more. A live workspace loaded from an actual
  account, start to finish, is a prerequisite for the falsification test rather
  than part of it.
- [x] **A cost model per client-month.** `/admin → Cost model` rolls the
  existing per-call usage ledger into a monthly projection per feature group —
  observed calls/week × observed $/call, held against an editable monthly
  price. A group with no priced calls in the window is reported as unknown
  rather than assumed free. Scenario calls/week is operator-editable so a
  heavier pace than the one logged (daily debates, routine video) can be
  modelled before it happens rather than discovered in the invoice.
  `src/services/costModel.js`.
- [ ] **Commercial paper.** An MSA, an order form and a DPA do not exist.
  `docs/data-handling.md` is the security-posture half of that answer and the
  cheapest half; the rest is a lawyer, not a sprint, and it is needed before the
  first invoice rather than after it.

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

**Shipped (August 2026).**

- [x] **The schema.** `supabase/migrations/0005_workspace.sql` — `workspaces`,
  `workspace_members` (keyed on `auth.users`), `workspace_docs` and
  `performance_rows`, with RLS policies written against a membership predicate.
  Meant to be run, unlike 0001/0002.
- [x] **Two shapes, split by what grows.** Operator-authored state is a JSONB
  document per store key; performance facts are a real table with **no cap**,
  which is the whole point. Facts are stored and the parse is derived, so a
  schema correction can never leave stale-but-plausible dimensions behind — the
  property 5.4 names as its reparse precondition, arriving early.
- [x] **What was deliberately not done.** The normalisation drafted in
  `0001_init.sql`. Every read path in `src/services/` is a synchronous pure
  function over an in-memory array; normalising now does not move storage, it
  turns a synchronous codebase into an async one and rewrites most of the suite
  in the same change that first points the app at a network. 5.4 gets a table
  with real history in it instead of an empty one.
- [x] **Stale writes refused.** `workspace_docs.revision` plus
  `bump_workspace_doc`; a write whose revision moved is a 409, not a clobber.
  Auth makes a workspace multi-user for the first time and last-write-wins
  silently discards a colleague's work.
- [x] **`api/state.js` and `api/_auth.js`.** Per-user authorised; tokens checked
  against `/auth/v1/user` rather than verified locally, because local
  verification cannot see revocation.
- [x] **The boot decision.** `services/workspaceBoot.js` runs before a single
  `store.get`. Remote when configured **and** signed in — never keyed on
  `workspaceMode`, which lives inside the settings that come out of the store
  being chosen. A failed remote load falls back to the browser copy with a named
  reason rather than refusing to start.
- [x] **Per-user proxy authorisation**, below, closed in the same change.

**Not done, and recorded rather than assumed:** there is no sign-in wall. Whether
a deployment should refuse to render without a session is a per-deployment
decision — the demo and a client instance want opposite answers — and it is a
different change from moving where state lives.

Postgres for the relational queries the dashboard already runs (win rate by
category, cross-brand gaps, contribution), RLS for tenant isolation, and Supabase
Auth for the session token the proxy needs. Schema draft is in
`supabase/migrations/0001_init.sql`.

Be honest about the cost: `store.js` stores one JSON blob per key, and that model does not survive contact with a relational schema. The read paths are real work, not an adapter swap.

**Sequencing consequence:** the campaign fact model (Phase 5.4) and the read
connectors (5.5) both list Supabase as a hard prerequisite. With 2.0 pulled
forward, those stop being late-phase items gated on infrastructure that keeps
receding and become the next real work after it.

### Normalisation contract

Extend `normalizeInitiativeRecord` to accept client-specific RegEx configurations and explicit platform ID mappings. This allows the system to attribute messy, legacy ad campaigns without touching live performance data — the API adapters in subsequent steps all share this contract.

**Sequencing note:** connectors ship one at a time behind this contract, ordered by value over integration pain — Shopify, then GA4, then Meta/Google Ads only on explicit request. CSV import is permanent regardless: it is the only path that works for an unsupported platform or a client whose IT won't grant API access. Reasoning in DECISIONS.md.

### 2.1 — Klaviyo and Shopify do not need Supabase, and that changes the order

Phase 5.5 states the forcing condition for the backend plainly: *OAuth refresh
tokens cannot live in a browser.* That is true of Meta and Google Ads, whose
access is a user-authorised grant that expires and has to be refreshed against
stored credentials.

It is not true of these two. Klaviyo authenticates a server-side integration with
a **private API key** scoped to one account, and Shopify with a **custom app
admin access token** that does not expire. Both are long-lived secrets held by
the server, which is a Vercel environment variable in the existing one-project-
per-client deployment model — the same place the model provider keys already
live. No token store, no refresh cycle, no Supabase.

**So a real-data test can run before Phase 2.0**, which matters more than it
sounds: the biggest single risk in the plan is that everything has only ever
been exercised on seeded data.

Both must use the aggregate endpoints, and this is a hard constraint rather than
a preference — most of both APIs is profile-level and would breach the contract
in `docs/data-handling.md` on the first call:

- **Klaviyo** — the campaign and flow *values reports* return per-campaign and
  per-flow aggregates (recipients, opens, clicks, conversions, revenue) with no
  profile data in them, and `metric-aggregates` gives the time series. The
  profiles and events endpoints are off limits. The payoff is that Klaviyo
  campaign and flow **names** parse through the existing convention — the schema
  already carries a `klaviyo` channel with `flow` and `message` levels — so email
  lands in the same breakdown and the same attribution split as paid social,
  with no new read path.
- **Shopify** — aggregated queries rather than order-level ones. An `orders`
  query is one field selection away from carrying an email address and a
  shipping address, so the adapter selects explicitly and never traverses
  `customer`. Shopify's aggregate reporting surface returns tables with no
  personal data in them at all, which is the right shape for the weekly-metrics
  contract this product already has.

Every row from either goes through `stripPersonalFields` before it reaches the
store — not because the endpoints above should return anything personal, but
because "should not" is not an enforcement mechanism and a connector is written
once and edited for years.

**First live workspace: Yardsy**, which has both integrations available. Worth
being precise about what that proves and what it does not. It closes the
"invalid test" hole in commercial.md — a real account through the real parser —
and it is the honest place to find out what breaks. It does not count toward the
three paid invoices, because the relationship already exists and nobody is
writing a $6,000 implementation cheque. Those are two different tests and
passing the first does not advance the second.

### Shopify integration

Build a serverless function adapter pulling real order and revenue data from a Shopify store (Development Store for initial validation). Route the data feed through `normalizeInitiativeRecord` so API-sourced and CSV-sourced data share identical internal state. Signal AI and Next Plays reason from whichever source is available without branching logic.

### GA4 funnel integration

Connect the GA4 Data API to auto-populate funnel context. The recommendation engine currently targets estimated drop-off points; GA4 replaces those with actuals. The FunnelCoverageMap gap detection becomes genuinely diagnostic rather than illustrative.

### Proxy hardening — per-user auth

The shared-secret model is gone (Phase 1.5); what remains is real per-user accountability. The proxy currently authorises on origin and caps cost by request shape, which is adequate for single-tenant demo and early client work but attributes nothing to a person.

This step verifies a session token issued by the same auth that gates the app and rate limits per user rather than per IP. **It is the same piece of work as the Supabase migration above (2.0)** — the token has to come from somewhere — and should not be attempted separately.

**Shipped (August 2026).** `rateLimitIdentity` in `api/_guard.js` keys the bucket
on the caller's Supabase user id when a session is present and on the forwarded
IP when it is not, across all five metered call sites (text, image, video, debate
start, debate poll). The IP was wrong in both directions at once: a client's team
behind one office NAT shared a single ceiling, while the same person on a phone
got a fresh bucket every time the network changed their address.

A bearer token that does not verify is **refused rather than silently downgraded**
to the IP bucket — an expired session would otherwise look like an anonymous
visitor, spend money, and land in the wrong bucket, and anyone could shed a full
user bucket by mangling their own token. An anonymous caller sends no header and
is treated exactly as before, which is what leaves the demo working.

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

**5.1, 5.2, 5.3 and 5.8 are the next app-layer work after 2.0** — all four are pure additions to
the existing data model with no backend dependency, and together they are what
turns a backlog into a research programme. 5.8 is the one that lets that programme
change its mind. They are also the three items a buyer can
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

**Shipped (August 2026):**

- [x] **The agenda layer.** `services/learningAgenda.js` and `views/AgendaView.jsx`
  — a question, `holdConstant`, `varies`, `falsifyingResult` and sample/duration
  guidance, at `#/agenda` ("Thesis" in the rail). Initiatives ladder up via
  `agendaId`, settable from the form or from "Start experiment" on the agenda
  card. `agendaRollup` joins each question to its linked initiatives and
  surfaces the latest closed learning against it.
- [x] **Backward test design, deterministic rather than AI-derived.**
  `seedInitiativeFromAgenda` carries the question's own fields forward into a
  new initiative's title, hypothesis and kill criteria. Not an LLM call: an
  agenda question is by definition the thing nothing has been run against yet,
  so there is no evidence for a model to ground a derivation in — the same
  discipline that keeps `callExpandRecommendation`'s ICE rationale honest about
  thin data would have nothing to cite here. Reasoning in DECISIONS.md.

### 5.2 — Pre-registration and kill criteria as an enforced gate

Harvested from the Biosphere design prototype, which got this right:

> Nothing leaves quarantine until its kill criteria are confirmed. Set before
> launch, not after.

`killCriteria` exists on every initiative today as free text with no gate and no
tracking. This makes it structural: a Draft cannot move to Running until kill
criteria are set, and a Running initiative shows live distance to its kill line.
Also from that prototype and worth adopting: a **Franchise / Loonshot** risk
taxonomy, so a portfolio can be read for whether it is taking any real swings.

**Shipped (August 2026):**

- [x] **The gate.** `services/killGate.js`'s `killGateBlocked` fires on any
  Draft/none → Running transition with empty kill criteria, enforced at all
  three places that transition happens: the form's own save, Triage's
  "Activate now", and Detail's status pills. A legacy Running item that
  predates the rule is not retroactively blocked — the same asymmetry
  pre-registration already established, for the same reason.
- [x] **Distance to the kill line.** A proxy, not a live evaluation of the
  criteria themselves — those stay free text on purpose (see FormView), so
  there is no threshold to check against. What every Running initiative does
  carry is a start/end window, and elapsed-vs-planned is what's shown next to
  the kill criteria on Detail. Reasoning in DECISIONS.md.
- [x] **Franchise / Loonshot.** `RISK_TYPES` in constants.js, optional and
  unset by default rather than defaulting to the safer answer. The Dashboard's
  secondary-tiles disclosure reads the Loonshot share of classified *active*
  (Draft+Running) initiatives, excluding unclassified ones from the
  denominator so the tile can't be read as "safe" on data nobody actually
  classified.

### 5.3 — Diagnostic escalation: the system names the dimension it is missing

The naming convention captures around two dozen dimensions. The ad platforms can
break down on a dozen more — realised placement as against targeted, device,
time of day, geo below the `geo` slot, and the demographic split that Phase 1.6's
export decision deliberately leaves out (DECISIONS.md). When a result is
unexplained, the missing dimension is usually one of those.

This closes that gap without ingesting any of it in bulk. When a closed
initiative's actual outcome diverges from the prediction frozen at launch, the
system ranks which un-captured dimension most plausibly accounts for the gap and
asks for exactly that one: *pull Meta → Ads → Breakdown by Age for campaign X,
3–17 Nov, paste it here.* Scoped to one initiative, one window, one axis —
tens of rows, not the 21× row multiplier a standing demographic feed would carry.

**Why this is not a feature a competitor can copy.** It needs a frozen
expectation to detect the anomaly against. `predictionSnapshot` holds revenue
impact and ICE as of launch, and `portfolio.js` already separates `tracked` from
`backfilled` so the deltas that matter are distinguishable from the ones that are
artefacts of backfill. A tracker whose results are typed in by a human has no
frozen prediction and no ad-account rows, so it cannot generate the sentence.

**Four constraints that decide whether it works, not decorations on it:**

1. **Fire rarely.** Gate on prediction error past a threshold *and* a nameable
   candidate explanation. Three times a quarter and right beats weekly and
   ignored — an escalation that becomes routine is a notification, and
   notifications get muted.
2. **The paste-back is a third CSV shape.** A breakdown export replaces the name
   axis with the breakdown axis, so rows key on (entity, breakdown value) and may
   carry no ad name at all. `detectCsvShape` needs a third branch; the weekly and
   campaign shapes do not stretch to cover it.
3. **It does not enter the fact table.** This is evidence attached to one
   initiative's post-mortem — scoped to a question, a window and an axis. Modelled
   as `initiative_evidence`, which also keeps demographic data under a stricter
   retention and consent posture than the main store, containing the DPA surface
   rather than spreading it.
4. **It must return a verdict, not a table.** "The 45-54 band took 60% of spend
   and converted at half the rate — that is the gap" or "mix was stable, look
   elsewhere." If pasting yields a pivot table, the product has charged an
   operator manual work and handed back homework.

**The compounding property, which is the actual argument for building it.** Every
time it fires and the answer is yes, that is evidence the client should be
*naming* that dimension from now on. Three tests confounded by placement produces
"add `placement` to your ad template." The diagnostic feeds back into taxonomy
design, and the taxonomy improving under supervision is the thing a retainer is
actually paying for.

App-layer work on the existing data model. No backend dependency, no connector —
which makes it unusually cheap for how hard it is to copy.

**Shipped (August 2026):**

- [x] **The gate and the ranking.** `services/diagnosticEscalation.js` fires on
  relative prediction error past 40% of the frozen prediction (floored at
  $2,000, so a miss on a trivial test can't trip it) *and* a nameable
  candidate. Candidates are ranked by what the initiative's own claimed
  channels' naming templates do NOT already capture — placement, device, time
  of day and finer geo are filtered this way; age and gender are always
  candidates regardless of naming capture, because a gender slot on an ad name
  is a targeting label, not a performance breakdown by who converted.
- [x] **The paste-back.** `parseBreakdownCSV` is a sibling parser scoped to
  this one flow rather than a literal third branch of `detectCsvShape` — the
  operator was already told which axis they pulled, so there is no shape to
  detect, only a breakdown-value column (whichever isn't a recognised metric)
  to read.
- [x] **The verdict.** `verdictFromBreakdown` is arithmetic, not an AI call:
  concentration (spend share) × underperformance (rate vs. the mix's own
  average) names the band that explains the gap, or states the mix was even.
- [x] **Scoped evidence.** Recorded evidence lives on `item.evidence`, an array
  on the initiative itself — never merged into `perfRows`. Surfaced via
  `DiagnosticEscalationPanel` on closed initiatives, which stops offering the
  ask once an entry for that dimension exists.

### 5.4 — Campaign fact model *(requires Supabase)*

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

**Store the raw name, and treat parsed dimensions as derived.** Every fact row
keeps `raw_name` and the schema version in force at import alongside its typed
dimensions, and a reparse job rewrites the derived columns when the schema
changes. This is what makes `performance.js`'s refusal to guess pay off: a row
that fails to parse today parses tomorrow once the taxonomy is corrected. Persist
only the parsed dimensions and the first schema correction silently orphans every
historical row with no path back — and it is also the precondition for retiring
the `gender`/`talent` collision recorded in DECISIONS.md, which cannot be fixed
in place because a vocabulary change turns previously-valid names unparseable.

**Import batches are first-class:** filename, imported_at, schema version, and
the attributed / untagged / broken-link split as of import. That table is the
audit trail for the product's core claim, and a client watching their own tagging
discipline improve month over month is a renewal argument rather than plumbing.

### 5.5 — Read connectors: Meta and Google Ads *(requires Supabase)*

Ships behind the existing normalisation contract, one at a time, per the
ingestion decision. Note this reorders the original sequencing: Meta and Google
were last because their marginal value over a two-minute weekly CSV was low.
Under Marketers Lab they carry the campaign fact model, so the value is no longer
marginal. Shopify and GA4 keep their original priority for the metrics they
uniquely own.

**Hard prerequisite:** OAuth refresh tokens cannot live in a browser. This is the
forcing condition for Supabase, arriving whether or not a client ever asks where
their data is stored.

### 5.6 — Campaign execution behind a proposal gate *(requires 5.5)*

Create, budget, pause. Every mutation is a proposed change, diffed against live
state, human-approved, then applied by a separate path that writes an audit
record. No auto-approval at any spend level. Full reasoning in DECISIONS.md — this
is the one part of the scope where getting it wrong costs money rather than
credibility.

### 5.7 — Creative production, including video from evidence

Extends the Creative Studio from direction to assets: brief → variant set →
generated or templated creative → tagged with the initiative → matched back
through the naming convention when performance lands. Closes the loop that
5.1–5.6 opens.

**Product video generated from the learning library is the intended end state,**
and it is deliberately last. The interesting version is not "generate a video" —
it is a video whose angle, hook and proof are chosen because the library says
those are the claims this brand's own tests have supported, generated against a
hypothesis, named with the initiative's tracking tag, and joined back to its own
performance when the rows land. Every one of those clauses depends on 5.1 through
5.5 working on real data. Built earlier, it is an asset generator, which is a
commodity, and it is the fastest way to be mistaken for one.

**What ships today is not this.** `api/video.js` renders talking-head avatars
(HeyGen, VEED Fabric via fal.ai). Useful, and worth keeping wired since it costs
nothing to leave in place — but a spokesperson render is a different product from
product video, and the roadmap should not let the presence of the first imply
progress on the second.

**What was pulled out of this item and shipped early.** Asset provenance — the
record carrying the initiative, brief version, prompt, model, cost and ad name —
now lands in Phase 1.6 rather than waiting here. The reasoning is in DECISIONS.md
and is worth restating: this item's interesting version needs a corpus of
asset→performance pairs to reason from, and a corpus only exists if collection
started earlier. Sequenced as originally written, 5.7 would have arrived with
nothing to learn from. What remains here is the generation itself, and it still
depends on 5.1–5.5 working on real data.

### 5.8 — Supersession: a learning that can be retracted

App-layer work on the existing data model. No backend dependency, so it belongs
with 5.1–5.3 rather than behind Supabase.

**The gap.** A closed initiative's learning is `results.keyLearning`, a string.
The record around it is better than a note — `provenance` separates a tracked
result from a backfilled one and is derived from the prediction snapshot rather
than typed, `durability` separates structural from tactical, and prediction error
is computed against the frozen snapshot. What the model has no way to express is
**one experiment contradicting another**. There is no supersession edge, no
counter-evidence, and no way for a result to retract a belief rather than sit
beside it.

**Why that is not cosmetic.** `buildLearningsIndex` feeds the creative brief
generator, Signal AI's portfolio tools and learning synthesis. All three rank and
cite what they are shown. So a belief that stopped being true in March keeps being
cited in June — with an experiment id attached, which makes it *more* persuasive
than an unsourced claim, not less. The confidence a reader takes from "three
experiments support this" is computed only from the experiments that supported it;
the one that broke it, if it ran, is a separate row saying something else. A
knowledge base that can only accumulate is not neutral about being wrong. It is
confidently wrong, at increasing volume, in a brief that a person then spends
money against.

This is also the honest answer to the pitch. "Stop relearning the same lessons"
is a claim about a system that knows when a lesson expired, and the current model
cannot represent that.

**What was built** — `src/services/supersession.js`, September 2026.

- [x] **A supersession edge between closed initiatives** — `supersedes` and
  `contradicts`, set from the close flow, where the person writing the learning
  is the one who knows it conflicts with an earlier one. Two departures from
  this spec, both deliberate. **Only the forward edge is stored:**
  `supersededBy` is derived by inverting `supersedes` rather than written to
  both records, because two rows that disagree about whether one retracts the
  other is a worse state than either answer. **A third edge, `confirms`,**
  because the next item needs a supporter and nothing here could mark one — see
  below. Edges are keyed on `initId`, not the internal `id`, so they survive the
  CSV round-trip that regenerates ids in a fresh workspace.
- [x] **Confidence derived, never typed.** `confidenceOf` reads the graph and
  the provenance weights (`tracked` 1.0, `backfilled` 0.5, so two remembered
  results do not outvote one measured one) and returns a level, not a
  percentage: `retracted`, `contested`, `established`, `supported`,
  `provisional`. Two rules carry the argument. **`contested` outranks any amount
  of support** — averaging a contradiction away is precisely the
  confidently-wrong failure, so a disputed belief reads disputed however many
  results agree with it. **Retracted evidence props nothing up** — a superseded
  supporter is skipped when summing, so a belief cannot stay `established` on
  the strength of two results that were themselves retracted last quarter.

  This is where `confirms` had to exist. The spec asked for confidence computed
  from "the supporting and contradicting closed initiatives" and named no edge
  that could mark a supporter. The alternative was inferring support from
  category and outcome, which asserts that two Successes in Retention are about
  the same belief; they routinely are not, and a confidence number built on that
  inference is the hand-set field this item exists to remove, laundered through
  arithmetic. `confirms` is the same act as `contradicts` pointed the agreeing
  way, and stays inside the line drawn below: it is a relation only a person
  knows, not a description a person re-types.
- [x] **Superseded learnings leave the index rather than the record.**
  `buildLearningsIndex` drops them; the initiative and its result are untouched,
  and `withheldLearnings` names what is missing and what retracted it, because a
  retraction nobody can see is a second way to be silently wrong. Three other
  doors a dead belief could still walk through are closed with it: the Learning
  Library's "Ask the library" corpus and its synthesis payload, and — because
  they are prose a model cites from — `get_failure_patterns` and the 90-day
  block in `buildPortfolioContext`, where the initiative stays listed and its
  learning is marked retracted rather than quoted as current. "This was tried
  and it failed" is still true; only the belief is dead. Win rates and every
  other piece of arithmetic read the record, not the index, and are unaffected —
  retracting a belief does not un-run the experiment.
- [x] **A contradiction is surfaced, not silently absorbed.**
  `contradictionQuestions` turns every open pair into a candidate agenda
  question, shown at the top of the Learning agenda with both results quoted and
  a one-click adopt. The proposed question names both sides rather than picking
  one — which is right is the experiment, and asserting it here would be the
  confident filler this layer refuses. Derived every render, so a contradiction
  resolved by a later supersession stops appearing on its own.

The line below held: no hand-entered conditions, mechanism, freshness or
applicability were added, and confidence is computed on read rather than stored.

**What not to build, and this is the part worth writing down.** The obvious
version of this item is a structured learning record with hand-entered fields for
conditions, mechanism, freshness and applicability. Do not. The conditions under
which a result held — channel, audience, format, placement — are **already on the
parsed name**, which is the entire point of the taxonomy engine; deriving them
from the join is free and stays true, while asking a marketer to re-type them
produces a second set of conditions that disagrees with the first and goes stale
the same way the free text did. Freshness is a date arithmetic problem, not a
field. The only things that genuinely need a person are the edges above, because
only a person knows that two results are about the same belief.

### Naming and identity — resolved

Previously an open question here. The product is **Marketers Lab**; `Growth OS`
is retired as a public name and kept as the repository name. The sand-gold
editorial identity stays, and the Biosphere prototype's invented vocabulary
(Observatory, Quarantine, Vivarium, Microscope) is not adopted. Full reasoning,
including why the fallback for a trademark conflict is a new name rather than a
reversion, is in DECISIONS.md.
