# Growth OS — Roadmap

> This roadmap outlines the evolution of Growth OS from a modular AI-assisted dashboard into an autonomous execution loop, prediction ledger, and federated knowledge base. Each phase is a deliberate architectural step, not a feature wishlist.

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

- **Toast scope fix:** Route `showToast` correctly into `ContributionView` and `DashView` — currently called out of scope, causing ReferenceErrors.
- **AI error surfacing:** Standardise error handling on form-side AI calls to surface proxy failures (rate limits, timeouts) as toasts instead of failing silently.
- **State persistence:** Include `KEY_RECS` (Next Plays recommendations) in JSON backup/restore payloads — currently omitted.
- **Recommendation state integrity:** Move `acceptRecommendation` status transitions strictly into `handleSave` to prevent orphaned accepted states when a user dismisses the form mid-flow.
- **Dark mode persistence:** Verify `KEY_THEME` round-trips correctly through the `store` abstraction on page reload.
- **Revenue clarity:** Rename dashboard "Revenue Impacted" KPI to "Projected Impact" and source the metric from `actualRevenueImpact` where available, falling back to `revenueImpact` — separates estimates from actuals.

### Weekly standup mode

The core workflow loop is missing a weekly ritual entry point. Build a lightweight guided flow: auto-surfaced initiatives needing attention (overdue, no update in 7+ days, completed tests without post-mortems), a structured status log prompt across running experiments, and a "This week's focus" confirmation step. Implemented as a modal triggered from the Dashboard triage card — not a new view. Closes the gap between one-time setup and ongoing weekly use.

### Client-facing summary view

A dedicated read-only React view that aggregates the current week's state: Scorecard, completed learnings, live variants, and next drafts. Structured for copy-paste into a client-facing report. Keeps the operational and reporting layers separate in the data model.

---

## Phase 2 — The Data Moat

**Target:** Replace manual CSV data entry with live API connections to ground the Prediction Ledger in authoritative numbers.

### Normalisation contract

Extend `normalizeInitiativeRecord` to accept client-specific RegEx configurations and explicit platform ID mappings. This allows the system to attribute messy, legacy ad campaigns without touching live performance data — the API adapters in subsequent steps all share this contract.

### Shopify integration

Build a serverless function adapter pulling real order and revenue data from a Shopify store (Development Store for initial validation). Route the data feed through `normalizeInitiativeRecord` so API-sourced and CSV-sourced data share identical internal state. Signal AI and Next Plays reason from whichever source is available without branching logic.

### GA4 funnel integration

Connect the GA4 Data API to auto-populate funnel context. The recommendation engine currently targets estimated drop-off points; GA4 replaces those with actuals. The FunnelCoverageMap gap detection becomes genuinely diagnostic rather than illustrative.

### Proxy hardening

Transition `api/proxy.js` from shared-secret demo mode to authenticated per-client routes before live client API tokens are processed. The existing shared-secret and rate-limiting infrastructure is a valid scaffold; this step adds per-client credential isolation.

---

## Phase 3 — Autonomous Orchestration

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

## Phase 4 — Productised Scaling

**Target:** Transition from a config-swapped per-client deployment to a multi-tenant platform with a federated knowledge base.

### Multi-tenant architecture

Separate database indexing and client contexts so a single instance manages multiple brands securely. The natural implementation path: Supabase with Row-Level Security (RLS), where the existing `store` abstraction is re-backed by Postgres rather than `localStorage`. The config-first design means brand context stays in the data layer, not the codebase — no per-client forks to maintain.

### Federated knowledge base (RAG)

Automatically sanitise closed initiatives — stripping identifying brand data — and convert the core strategic learnings (hypothesis, result, mechanism, transferability) into vector embeddings via `pgvector`. The Ask the Library feature upgrades from in-session retrieval to a cross-portfolio semantic search, surfacing mechanisms that proved out in one brand's context when constructing hypotheses for another.

### Cross-customer anonymised benchmarking

Aggregate de-identified outcome data across clients to produce category-level benchmarks (e.g. median ICE accuracy by experiment type, win rate by funnel stage, average time-to-result by category). Feed these benchmarks into the candidate generation pass of Next Plays and into the Signal debate context. This is the feature that creates compounding value with each additional client — each new data point improves recommendations for the entire network.

> Implementation note: this phase requires explicit contract language around data usage and anonymisation before any cross-client data flows are introduced.
