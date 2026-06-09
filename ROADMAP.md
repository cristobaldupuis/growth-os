# Roadmap: Growth OS

This roadmap outlines the evolution of **Growth OS** from a manual tracking dashboard into an automated, **AI-native execution loop** and prediction ledger. The system is designed to support Consulting as a Service (CaaS) by making elite growth processes inevitable, trackable, and self-scoring.

## Phase 1: Stabilization & Bug Sweep (Current)
*Target: Secure the newly modularized architecture and eliminate silent failure modes.*

- [ ] **Fix Toast Scope:** Route `showToast` correctly to `ContributionView` and `DashView` to prevent clipboard crashes.
- [ ] **Surface AI Errors:** Standardize error handling on form-side AI calls to throw and toast on proxy failures (e.g., rate limits) instead of failing silently.
- [ ] **State Persistence:** Include `recs` (Next Plays) in JSON backup/restore payloads. 
- [ ] **Data Integrity:** Move `acceptRecommendation` status transitions strictly into `handleSave` to prevent orphaned accepted states.
- [ ] **UI Polish:** Persist dark mode (`KEY_THEME`) across sessions and rename the dashboard's "Revenue Impacted" to "Projected Impact" to clearly separate estimates from actuals.

## Phase 2: The Data Moat (Short-Term)
*Target: Replace manual CSV data entry with live API connections to validate the Prediction Ledger with ground-truth numbers.*

- [ ] **Shopify Dev Store Integration:** Build a serverless function adapter to pull real order/revenue data from a Shopify Development Store.
- [ ] **API Ingestion Routing:** Route the Shopify data feed through the newly established `normalizeInitiativeRecord` contract, ensuring API data and CSV data share identical internal state.
- [ ] **GA4 Funnel Integration:** Connect Google Analytics 4 Data API to auto-populate the funnel context, ensuring the recommendation engine targets actual drop-off points rather than guesses.
- [ ] **Proxy Security Hardening:** Transition `api/proxy.js` away from shared-secret demo mode to secure, authenticated routes before live client tokens are processed.

## Phase 3: Autonomous Orchestration (Medium-Term)
*Target: Automate the AI loops to scale multi-client management with near-zero manual overhead.*

- [ ] **Background Execution Engine:** Install `inngest` or `trigger.dev` to handle durable, long-running AI tasks without Vercel serverless timeouts.
- [ ] **Zod Schema Enforcement:** Wrap all LLM outputs in strict Zod validation to guarantee AI-generated hooks and hypotheses perfectly match the database schema.
- [ ] **Continuous Audit Loop:** Architect a background cron worker that cross-references live Shopify/Meta metrics against active experiments, automatically flagging anomalies and drafting weekly executive summaries.

## Phase 4: Productized Scaling (Long-Term)
*Target: Transition from a private consulting OS to a multi-tenant platform.*

- [ ] **Multi-Tenant Architecture:** Separate database indexing and client contexts so a single instance can securely manage multiple brands.
- [ ] **Cross-Customer Anonymized Benchmarking:** (Pending contract/legal updates) Aggregate de-identified outcome data to inform the Ask-Library and candidate generation tools with broader market trends.
