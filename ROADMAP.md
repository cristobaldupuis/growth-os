# Roadmap: Growth OS

This roadmap outlines the evolution of **Growth OS** from a passive, client-side tracking application into an automated, **AI-native execution loop** tailored for Consulting as a Service (CaaS) and high-leverage growth operations.

## Phase 1: Foundational Sync & Local Testing (Current to Short-Term)
*Target: Establish deterministic guardrails and build the background execution infrastructure.*

- [ ] **Install and Configure Orchestration Layer**
  - Integrate `inngest` or `trigger.dev` into the Next.js stack via a dedicated API route handler (`/api/inngest`).
  - Set up local development environment using the Inngest Dev Server to test background event triggers locally.
- [ ] **Define Structured Output Schemas**
  - Create a robust `Zod` validation schema that models exactly what an execution card looks like in the current database schema (e.g., hooks, copy variants, target audience, KPIs).
- [ ] **Build First Isolated Background Function**
  - Implement a single, non-blocking asynchronous function: `growth/experiment.generate-variants`.
  - Configure the Vercel AI SDK (`generateObject` or `streamText`) to parse an amorphous client request (e.g., "Test ad angles for a protein snack") into 5 structured copy variants adhering to the Zod schema.

## Phase 2: Closed-Loop Tool Integration (Medium-Term)
*Target: Turn AI reflections into automated operational actions.*

- [ ] **Develop Third-Party Connectors (Tool Calling)**
  - Expose verified JavaScript functions to the LLM context so the background agent can read from or write to external marketing channels (e.g., Meta Ads API, Google Analytics API).
- [ ] **Implement State Management & Real-Time Sync**
  - Configure the background worker to continuously write its execution state directly into the Postgres/Supabase database.
  - Wire up frontend real-time subscriptions or optimized data polling so cards move dynamically across the kanban board as the agent updates them.
- [ ] **Build the Automated Audit Pipeline**
  - Implement a cron-style background task (`growth/account.weekly-audit`) that scans live account performance metrics, compares them against historical experiment logs, and auto-drafts a "Lessons Learned" summary markdown block inside the app.

## Phase 3: Productized Autonomous Scaling (Long-Term)
*Target: Scale multi-client management with near-zero manual overhead.*

- [ ] **Multi-Tenant Account Context Partitioning**
  - Separate database indexing so a single Growth OS internal instance can manage multiple client growth frameworks, ad accounts, and historical context stores securely.
- [ ] **Context & Knowledge Engine Realization**
  - Integrate a vector database layer (`pgvector` or Pinecone) to embed past winning experiment outcomes, allowing the system to use semantic search to reference historical wins before generating new variants.
- [ ] **Anomaly Detection & Proactive Alert Guardrails**
  - Architect an autonomous alerting worker that monitors sudden shifts in CPA or CTR, automatically pauses underperforming campaign variants, and pushes a deterministic notification to a client Slack channel or dashboard view.
