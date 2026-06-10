# Growth OS

A growth execution framework for multi-brand ecommerce portfolios. Replaces fragmented marketing spreadsheets with a structured operating engine — combining initiative lifecycle management, statistical rigour, AI-assisted prioritisation, and an autonomous C-Suite strategy debate in a single interface.

Growth OS sits between your data layer (Shopify, GA4, Triple Whale) and your execution layer (Meta, Klaviyo, native ad tools). It doesn't replace attribution or automation — it's the decision engine in the middle: enforcing scientific rigour on every experiment, synthesising learnings across brands, and surfacing what to test next before the team has to ask.

Built to demonstrate how a Director of Growth thinks about velocity, incrementality, and portfolio-level learning at scale.

**[→ Launch Live Application](https://growth-os-iota-seven.vercel.app/)**

---

## What's new

- **Brand briefs** — each retailer now carries a structured brief (ICP, categories, why they win, current constraint) that is injected into every AI call, making recommendations specific to your business rather than generic
- **Two-voice learning synthesis** — the library synthesises closed initiatives across four sections: Patterns, Gaps (proven at one retailer, missing at another), Lessons, and Do Next with direct `[Retailer] → [Action] → [Why now]` recommendations
- **Agent mandates** — C-Suite agents now have non-negotiable positions (CMO argues for investment, CFO challenges every spend assumption) creating genuine tension in the debate rather than coordinated agreement
- **CSO rationale** — each generated initiative now includes a "Why we proceed" card resolving the champion/dissent tension with a decision, not just a note
- **Onboarding flow** — first-run setup captures company, north star, and brand briefs before you see an empty canvas
- **Dashboard attention nudge** — surfaces running initiatives ending within 7 days or running longer than 30 days with no close
- **Signal AI pre-populated context** — opens with a live read of your portfolio so the first debate starts from something real
- **Toast notifications** — all native browser alerts replaced with in-app slide-up toasts
- **Restore backup modal** — destructive action now requires an in-app confirmation with full details of what will be overwritten
- **Client Readout View** — a dedicated read-only view that aggregates the week's state (scorecard, completed learnings, live variants, next drafts) for instant copy-paste to clients or stakeholders
- **Business Health Panel** — five configurable health metrics on the dashboard (New Customer CVR, Orders, Registrations, Blended CAC, Return Rate) with WoW delta and trend context injected into every AI call
- **Weekly standup mode** — guided weekly review modal that auto-surfaces stalled experiments and missing post-mortems, with a quick status log across all running initiatives

---

## Core features

### Multi-brand portfolio management
Cross-tenant architecture — filter the dashboard, pipeline, and learning library across multiple retailers in a single workspace. Auto-generated initiative IDs scoped per brand (e.g. `NH-001`, `R2-003`).

### Performance dashboard
Tracks revenue impacted by completed tests, active revenue at risk, and a running calibration score comparing estimated vs. actual revenue outcomes. One-click executive summary generator for stakeholder updates.

### Learning library
Every closed initiative becomes searchable institutional memory. The AI synthesis scans across all closed initiatives and produces:

- **Patterns** — recurring themes across retailers and initiative types
- **Gaps** — tactics proven at one retailer not yet run at another, named explicitly
- **Lessons** — what failed and why, with forward guidance
- **Do Next** — three highest-confidence actions grounded in the evidence

### Structured hypothesis enforcer
Every initiative requires three distinct fields: **Observation** (what prompted this), **Hypothesis** (We believe that X will result in Y for Z, because W), and **Success metric** (single measurable KPI).

### ICE scoring engine
Impact, Certainty, Ease on a 1–10 scale. AI-assisted scoring suggests Impact and Certainty with written rationales. Sort by highest ICE or highest revenue at risk.

### Test validity panel
Built into every running or completed initiative:
- **Sample size calculator** — enter baseline CVR, minimum detectable effect, and confidence level (90% or 95%); returns sessions needed per variant at 80% power
- **Statistical significance** — live z-statistic, confidence level, and observed uplift as you enter control/variant conversion and session counts
- **Incrementality / counterfactual** — required free-text field before a test can be marked Complete; defines what would have happened without the intervention
- **Calibration** — at close-out, prediction error (estimated vs actual revenue) is computed from the frozen prediction snapshot taken at launch, and displayed on the initiative card and in the learning library

### CSV import / export
Row-by-row preview before writing. Matched on `initId` for non-destructive updates. Handles date format normalisation, case-insensitive brand matching, and ICE clamping. Google Sheets template included.

### Weekly pulse
Log or import weekly metrics per brand and source (manual, Meta, GA4, Google Ads, Klaviyo). WoW delta calculated automatically. Feeds live metrics into every AI call.

---

## ✦ Signal AI — Autonomous C-Suite strategy debate

A multi-agent system where configurable C-Suite personas query your live portfolio data, debate what you're missing, and synthesise 3 net-new initiatives the team isn't currently running.

### How it works

Each agent runs an agentic tool-calling loop — it decides what data it needs before forming an opinion, chaining multiple calls before responding.

| Tool | What it returns |
|---|---|
| `get_portfolio_summary` | Running count, draft count, win rate, avg ICE, blocked count, north star gap |
| `get_running_initiatives` | All running initiatives with revenue at risk and blockers |
| `get_category_coverage` | Initiatives per category, revealing uncovered areas |
| `get_win_rate_by_category` | Historical win rate and avg actual revenue by category |
| `get_top_draft_opportunities` | Highest-ICE uninitiated drafts |
| `get_failure_patterns` | Closed failures with key learnings |
| `get_blocked_initiatives` | All blocked initiatives with dependency named |
| `get_revenue_gap_analysis` | Gap between north star current and target vs. running initiative coverage |

**Dynamic moderator** — after each turn, a Moderator reads the transcript and decides: continue, fire a targeted follow-up to resolve a specific tension, or call synthesis. Actively looks for unresolved disagreements between agents before allowing consensus.

**Agent mandates** — each agent has a non-negotiable position hardcoded into their system prompt. CMO argues for investment even against weak data. CFO challenges every spend assumption and asks for the downside. CGO anchors every argument to the north star gap.

**Synthesis** — a Chief Strategy Officer reads the full debate and data appendix, resolves tensions rather than noting them, and produces 3 structured initiatives each with: championed by, dissenting voice with their specific objection, and a CSO rationale for why to proceed despite the dissent.

**Output** — each initiative matches the full data structure and can be added to the backlog with one click.

### Configurable agents

Fully editable in Settings — icon, label, strategic lens, and known blindspot.

| Agent | Lens | Blindspot |
|---|---|---|
| CMO 📣 | Brand, acquisition, channel mix, creative | Underweights unit economics |
| CFO 📊 | Contribution margin, CAC payback, pricing | Underweights long-term LTV |
| CGO 🚀 | LTV, retention, subscription, referral loops | Underweights operational complexity |
| COO ⚙️ | Inventory, fulfilment, shelf-life, scalability | Underweights brand equity |

Custom configurations persist in settings — a retail deployment might use "Category Manager" and "Buyer Relations" instead.

### Approximate API cost
$0.25–0.35 per debate (claude-sonnet-4-6, ~40,000 tokens across 8 agent turns, moderator calls, and synthesis).

---

## AI toolkit

All AI features run through a server-side proxy — your API key is never exposed to the browser.

| Feature | What it does |
|---|---|
| Quick Capture | Converts a rough plain-language idea into a fully structured initiative |
| Hypothesis Expansion | Rewrites a draft hypothesis to the structured format; requires review before accepting |
| ICE Scoring Assist | Suggests Impact and Certainty scores with written rationales |
| Learning Synthesis | Scans all closed initiatives and produces Patterns, Gaps, Lessons, Do Next |
| Signal AI | Autonomous C-Suite debate — see above |

---

## Brand briefs

Each retailer carries a structured brief injected into every AI call:

- **What they sell** — category, price point, hero SKUs
- **Categories** — comma-separated product categories
- **ICP** — who buys, demographics, purchase behaviour
- **Why they win** — actual differentiator vs. alternatives
- **Relationship** — own brand, wholesale, marketplace
- **Current constraint** — what's holding this retailer back

This is what makes recommendations specific — instead of "test SMS cart recovery at Retailer 2," the agent reasons about their specific buyer's consideration window and adjusts the mechanic accordingly.

---

## Technology stack

| Layer | Detail |
|---|---|
| Runtime | React 18 / Vite |
| Hosting | Vercel (frontend + serverless API proxy) |
| Design | Sand/charcoal enterprise palette; serif body; monospace for all financial figures, dates, and tags; light and dark mode |
| State persistence | Environment-agnostic: `localStorage` (production), in-memory fallback for sandboxed environments |
| AI | Anthropic Claude API via server-side proxy — `claude-sonnet-4-6` for all features; agentic tool-calling loop for Signal AI (up to 4 tool iterations per agent turn); ~$0.25–0.35 per full debate |
| Data I/O | CSV import/export; JSON backup/restore; Google Sheets template |

---

## Architecture

### Structure

```
src/
  App.jsx              # Orchestration layer (~1,580 lines post-refactor)
  config.js            # Per-client deployment context — brands, agents, categories, seed data
  views/               # DashView, BacklogView, LearningsView, MetricsView, ContributionView, etc.
  components/          # Shared UI components
  services/            # store.js, ai.js, backup.js
  prompts/             # LLM prompt definitions
api/
  proxy.js             # Serverless Anthropic proxy — shared secret auth, per-IP rate limiting
```

### Key design decisions

**Config-first per-client deployment.** Client context lives in `config.js`, isolated from app logic. Each client gets a separate Vercel project with a single file swap — no auth layer, no shared database, no cross-client data risk. Multi-tenant architecture is a planned future phase, triggered when managing per-client deployments becomes the operational constraint.

**localStorage with a backend-agnostic store abstraction.** All state persists via `store.get` / `store.set`. The abstraction is backend-agnostic by design — migrating to Postgres is a layer swap when a real client constraint demands it, not a rewrite. The operational overhead of a backend is not justified before that trigger exists.

**Serverless proxy, no browser-side API key.** All Anthropic calls route through `api/proxy.js`, which validates a shared secret header, enforces per-IP rate limiting at 50 requests/hour, and locks CORS to the production domain.

**No router, no state management library.** Keeps the app portable and the full state shape visible in one place — a deliberate tradeoff that favours legibility and AI-assisted development over framework convention. Both are addable later without structural changes.

**Signal AI's moat is the integration, not the debate format.** The multi-agent debate is a recognisable pattern. What is not common is grounding the debate in a live experiment portfolio — agents reasoning from specific fatigue patterns, funnel gaps, and learning signals — and having the output land directly in the initiative backlog as ICE-scored, trackable items.

For the full rationale behind each decision, including forcing conditions for when they should be revisited, see [DECISIONS.md](./DECISIONS.md).

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phase breakdown.

- **Phase 1 (complete):** Modularisation, bug sweep, weekly standup mode
- **Phase 2:** Live data ingestion — Shopify adapter, GA4 funnel, normalisation contract
- **Phase 3:** Autonomous orchestration — background execution, Zod output validation, prompt versioning, continuous audit loop
- **Phase 4:** Multi-tenant platform — Supabase RLS, federated knowledge base (pgvector), cross-customer anonymised benchmarking

---

## Local development

Requires Node.js.

```bash
git clone https://github.com/cristobaldupuis/growth-os.git
cd growth-os
npm install
npm run dev
```

Open `http://localhost:5173/`. Click ⚙ Settings to configure your workspace, add your Anthropic API key, and fill in your brand briefs to activate context-aware AI recommendations.

Requires a `.env` file with:

```
ANTHROPIC_API_KEY=your_key
VITE_GOS_SECRET=your_secret
GOS_SECRET=your_secret        # Must match VITE_GOS_SECRET
```

The proxy validates `x-gos-secret` on every AI call. Without a matching secret, all AI features return 401.

---

## Author

Designed and built by [Cristobal Dupuis](https://cristobaldupuis.com).
