# Growth OS

A growth execution framework for multi-brand ecommerce portfolios. Replaces fragmented marketing spreadsheets with a structured operating engine — combining initiative lifecycle management, statistical rigour, AI-assisted prioritisation, and an autonomous C-Suite strategy debate in a single interface.

Growth OS sits between your data layer (Shopify, GA4, Triple Whale) and your execution layer (Meta, Klaviyo, native ad tools). It doesn't replace attribution or automation — it's the decision engine in the middle: enforcing scientific rigour on every experiment, synthesising learnings across brands, and surfacing what to test next before the team has to ask.

Built to demonstrate how a Director of Growth thinks about velocity, incrementality, and portfolio-level learning at scale.

**[→ Launch Live Application](https://growth-os-iota-seven.vercel.app/)**

---

## What's new

- **Creative Studio** — brief and produce creative against an initiative, so every asset is born attached to a hypothesis. Briefs are grounded in the brand brief and closed learnings and must state what result would falsify the direction; anything the brand brief doesn't support is routed to `claimsToVerify` rather than asserted. Variants come back as validated naming segments, and ad names are assembled in code
- **Campaign nomenclature engine** — the ad naming convention lives in settings as an ordered segment list with controlled vocabularies. `src/services/naming.js` builds, parses and validates against it, and its trailing `Initiative` segment carries an initiative's `trackingTag` — which is how a performance row finds its way back to the experiment that produced it
- **Model tiering** — reasoning calls (debate, synthesis, candidate generation) run on `claude-sonnet-5`; schema-shaped transformations (quick capture, hypothesis expansion, ICE assist) run on `claude-haiku-4-5`. Adaptive thinking throughout, prompt caching on the flows that reuse a system prefix
- **Accessible palette, enforced** — light-mode gold now passes WCAG AA (it previously measured 2.42:1 on white, applied to the dashboard's largest figures); dark surfaces moved from warm brown to cool charcoal so the accent reads as gold rather than mud. `npm run check:contrast` fails CI on regression
- **No browser-held API credential** — the proxy authorises on origin and bounds cost by request shape instead of a `VITE_`-prefixed secret that shipped inside the bundle
- **Storage failures are visible** — a full browser store used to produce saves that silently vanished on reload; it now raises a persistent banner with a one-click backup
- **Self-refreshing demo data** — the seeded portfolio rebases onto the current week at load, so the app never opens on a staleness warning
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

### Campaign nomenclature

The naming convention is data, not code — an ordered list of segments with controlled vocabularies, stored in settings so vocabularies change without a deploy. The shipped default is a live Meta convention:

```
Channel_Handle_Asset_Campaign_Gender_Theme_Angle_Category_Flavor_Format_Initiative
Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA
```

Three properties make it safe to parse positionally, and all three are enforced:

- **Segments are never omitted.** An absent value is the literal `NA`. A blank would shift every following segment and mis-attribute the row — a failure that produces wrong data rather than an error.
- **The delimiter never appears inside a segment.** Multi-word values are CamelCase.
- **A wrong segment count is refused, not guessed.** Any alignment would be a coin flip, and a mis-parsed row enters the analysis silently while an unparsed one gets counted and reported.

The trailing `Initiative` segment is the bridge: it carries an initiative's `trackingTag`, so `matchNamesToInitiatives` can join performance rows back to experiments — and can separate untagged business-as-usual spend from a tag that resolves to nothing.

### Creative Studio

Select a Draft or Running initiative and the studio produces a creative brief grounded in that brand's brief and the portfolio's closed learnings, then turns each angle into shootable, named variants.

- **Briefs must be falsifiable.** Every brief states what result would prove the direction wrong. One that can't be wrong can't teach anything.
- **Unsupported claims are quarantined.** Anything the creative wants to say that the brand brief doesn't support goes into `claimsToVerify` for the operator to clear, rather than being asserted in a script.
- **Names are assembled, not typed.** The model returns segment values; `buildName` validates them against the schema. The initiative segment is stamped from the initiative's own tracking tag — the model is never told it and never asked to invent one.
- **Output is portable.** Copy the ad names, or export the full variant set as CSV.

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
Roughly 40,000 tokens across 8 agent turns, moderator calls and synthesis, on `claude-sonnet-5` with prompt caching on the repeated system prefix. Sonnet 5 uses a newer tokenizer that counts about 30% more tokens for the same text than Sonnet 4.6 did, so measure against your own portfolio rather than carrying over a previous per-debate figure.

---

## AI toolkit

All AI features run through a server-side proxy — your API key is never exposed to the browser.

| Feature | What it does |
|---|---|
| Creative Brief | Turns an initiative's hypothesis into shootable creative direction, grounded in brand brief and closed learnings |
| Creative Variants | Turns brief angles into named, scripted ad variants carrying the initiative's tracking tag |
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
| Design | Sand/gold light theme, cool-charcoal dark theme; serif for prose, monospace for figures, dates and tags. All 66 themed colour pairings are checked against WCAG AA in CI |
| State persistence | Environment-agnostic: `localStorage` (production), in-memory fallback for sandboxed environments. Write failures surface a persistent banner rather than failing silently |
| AI | Anthropic Claude API via server-side proxy. Two tiers: `claude-sonnet-5` for reasoning (debate, synthesis, candidate generation), `claude-haiku-4-5` for schema-shaped transformation (quick capture, hypothesis expansion, ICE assist). Adaptive thinking throughout; prompt caching on the repeated-prefix flows |
| Data I/O | CSV import/export; JSON backup/restore; Google Sheets template |

---

## Architecture

### Structure

```
src/
  App.jsx              # Orchestration layer
  activeConfig.js      # Re-export barrel — the one line that switches which config.*.js is live
  config.js            # Generic deployment context — brands, agents, categories, seed data
  config.[client].js   # Per-client copy of config.js (e.g. config.csc.js)
  constants.js         # Theme tokens, status/outcome palettes, ICE scoring, formatters
  views/               # DashView, TriageView, LearningLibrary, DetailView, ClientReadoutView, CreativeStudio, CopilotPanel
  components/          # Shared UI atoms
  services/
    store.js           # Backend-agnostic persistence with explicit write-failure reporting
    portfolio.js       # Portfolio context + tool definitions passed to the agents
    naming.js          # Campaign nomenclature — build/parse/validate, and the initiative bridge
    csv.js             # Import/export and record normalisation
    ai/
      models.js        # Model tier selection, effort, prompt-cache policy
      call*.js         # One file per AI feature
api/
  proxy.js             # Serverless Anthropic proxy — origin allowlist, request-shape bounds, durable rate limiting
scripts/
  check-contrast.mjs   # Fails the build if any themed pairing drops below WCAG AA
```

### Key design decisions

**Config-first per-client deployment.** Client context lives in a `config.[client].js` file, isolated from app logic. App logic never imports a config file directly — every app-logic file imports from `src/activeConfig.js`, a one-line re-export barrel (`export * from "./config.[client].js"`). Switching clients, or standing up a new one, is a single-line edit to that barrel — no auth layer, no shared database, no cross-client data risk. Multi-tenant architecture is a planned future phase, triggered when managing per-client deployments becomes the operational constraint.

**localStorage with a backend-agnostic store abstraction.** All state persists via `store.get` / `store.set`. The abstraction is backend-agnostic by design — migrating to Postgres is a layer swap when a real client constraint demands it, not a rewrite. The operational overhead of a backend is not justified before that trigger exists.

**Serverless proxy, no browser-side credential of any kind.** All Anthropic calls route through `api/proxy.js`. It authorises on Origin/Referer against an allowlist, and bounds cost per request with a model allowlist, a `max_tokens` ceiling, a body-size limit and a system-prompt cap. Rate limiting is durable across instances via Upstash Redis and fails closed if the limiter is unreachable. An earlier version shipped a `VITE_`-prefixed shared secret, which Vite inlines into the browser bundle — see DECISIONS.md.

**No router, no state management library.** Keeps the app portable and the full state shape visible in one place — a deliberate tradeoff that favours legibility and AI-assisted development over framework convention. Both are addable later without structural changes.

**Signal AI's moat is the integration, not the debate format.** The multi-agent debate is a recognisable pattern. What is not common is grounding the debate in a live experiment portfolio — agents reasoning from specific fatigue patterns, funnel gaps, and learning signals — and having the output land directly in the initiative backlog as ICE-scored, trackable items.

For the full rationale behind each decision, including forcing conditions for when they should be revisited, see [DECISIONS.md](./DECISIONS.md).

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phase breakdown.

- **Phase 1 (complete):** Modularisation, bug sweep, weekly standup mode
- **Phase 1.6 (complete):** Campaign nomenclature engine, Creative Studio, the initiative↔ad-name bridge
- **Phase 2:** Live data ingestion — Shopify adapter, GA4 funnel, normalisation contract
- **Phase 3:** Autonomous orchestration — background execution, Zod output validation, prompt versioning, continuous audit loop
- **Phase 4:** Multi-tenant platform — Supabase RLS, federated knowledge base (pgvector), cross-customer anonymised benchmarking
- **Phase 5 — Marketers Lab:** learning agenda layer, kill-criteria gate, campaign fact model, Meta/Google connectors, campaign execution behind a proposal gate, creative production

---

## Local development

Requires Node.js.

```bash
git clone https://github.com/cristobaldupuis/growth-os.git
cd growth-os
npm install
npm run dev
```

Before pushing, run the same checks CI runs:

```bash
npm run verify     # lint + tests + WCAG AA contrast + build
```

Open `http://localhost:5173/`. Click ⚙ Settings to configure your workspace, add your Anthropic API key, and fill in your brand briefs to activate context-aware AI recommendations.

Requires a `.env` file with:

```
ANTHROPIC_API_KEY=your_key

# Optional. Comma-separated origins the proxy will accept. Defaults to the
# canonical deployment, so a missing value fails closed rather than opening up.
ALLOWED_ORIGINS=https://your-deployment.vercel.app

# Optional but strongly recommended in production. Without these the proxy
# falls back to an in-memory rate limiter, which on serverless is per-instance
# and resets on cold start — i.e. effectively no limit at all.
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Note there is deliberately no client-side secret. Anything prefixed `VITE_` is
compiled into the browser bundle and is not a secret.

---

## Author

Designed and built by [Cristobal Dupuis](https://cristobaldupuis.com).
