# Growth OS

Growth OS is an experiment tracking and growth execution framework built for multi-brand ecommerce portfolios. It replaces fragmented marketing spreadsheets with a structured, system-driven operating engine — combining initiative lifecycle management, statistical rigor, AI-assisted prioritization, and an autonomous C-Suite strategy debate in a single interface.

Built to demonstrate how a Director of Growth thinks about velocity, incrementality, and portfolio-level learning at scale.

---

## 🔗 Live Environments

**Launch Live Application:** https://cristobaldupuis.github.io/growth-os/

**Open Interactive Code Sandbox:** StackBlitz

---

## 🏛 Core Features

### Multi-Brand Portfolio Management
- **Cross-tenant architecture** — filter the dashboard, pipeline, and learning library across multiple brands or retailers within a single workspace
- **Knowledge cross-pollination** — the Learning Library surfaces insights from one brand and makes them replicable by other teams in the portfolio with one click
- **Auto-generated initiative IDs** (e.g. NH-001, R2-003) scoped per brand

### Performance Dashboard
- **Capital risk and calibration engine** — tracks revenue impacted by completed tests alongside active revenue at risk, and computes a running accuracy score comparing estimated vs. actual revenue outcomes
- **Executive update generator** — one-click synthesis of active pipeline metrics, velocity, and calibration accuracy into a formatted stakeholder update
- **Velocity tracking** — sparkline charts and categorical breakdowns across Paid Media, Conversion, Retention, Merchandising, and more
- **Financial hierarchy UI** — dollar amounts and financial metrics are rendered in monospaced type at a larger scale than supporting text, so executives can scan revenue impact at a glance without reading

### Weekly Triage — "This Week's Focus"
The Triage view opens with an opinionated priority card that runs silently on load and surfaces only what actually needs attention:

- **Urgency signal** — the single highest-revenue-at-risk initiative that is overdue or ending within 3 days
- **Blocker signal** — the initiative that has been blocked the longest, with the blocking dependency named
- **Draft opportunity** — the highest-ICE uninitiated idea that's been sitting idle (only surfaces if ICE ≥ 40, to avoid noise)
- **All-clear state** — when nothing is urgent, the card says so explicitly; the absence of urgency is also information
- Each signal is a direct link into the initiative detail view

### Structured Hypothesis Enforcer
Every initiative is required to document its thinking in three distinct fields rather than a freeform description:

- **Observation** — what data or behaviour prompted this initiative?
- **Hypothesis** — structured as: *We believe that [X] will result in [Y] for [Z], because [W]*
- **Success metric** — a single measurable KPI that defines a win

Backwards compatible — initiatives created before this system display their legacy `description` field gracefully with a "legacy entry" label.

### Resource Blocker Tagging
- **Blocker dropdown** on every initiative: None, Waiting on Engineering, Waiting on Creative, Waiting on Merch/Inventory, Waiting on Legal, Waiting on Finance, Waiting on Leadership
- **Visible warning badge** — blocked initiatives display a high-contrast amber `⚠️ BLOCKED: [dependency]` pill on the list card, detail view header, and triage view
- **Full-width warning strip** in the detail view draws exec attention to operational friction immediately

### ICE Scoring Engine
- **Three-axis scoring** — Impact, Certainty, Ease on a 1–10 scale; composite score rendered as a single number (0–100)
- **Sort by Highest ICE Score or Highest Revenue at Risk** — toggle at the top of the initiative list
- **AI-assisted scoring** — suggest Impact and Certainty scores with written rationales based on the initiative context

### Test Validity Panel
Built directly into every Running, Completed, or Killed initiative:

- **Sample size calculator** — given a baseline conversion rate and minimum detectable effect, calculates sessions needed per variant at 90% or 95% confidence using a two-proportion z-test with 80% power
- **Statistical significance indicator** — takes live control vs. variant conversion data and shows confidence level, z-statistic, and observed uplift; warns explicitly against calling winners early
- **Incrementality flag** — required field before marking a test Completed; forces documentation of the counterfactual so revenue claims are defensible

### CSV Import / Export
- **Export CSV** — exports the current filtered initiative view including all fields, for editing in Google Sheets or Excel
- **Import CSV** — uploads a CSV and previews a row-by-row breakdown (new vs. update, warnings) before writing anything; matched on `initId` so updates are precise and non-destructive
- **Google Sheets template** — [open the import template](https://docs.google.com/spreadsheets/d/1Oar4THeAKIGvvBzKUmqwfWersaUdLqqoq-FW_jBvS1E/edit) with three sheets: Template (clean input), Instructions (column reference and importer rules), and Example (five filled rows across all statuses)
- Import handles date format normalisation (ISO, M/D/YYYY, MM/DD/YYYY), case-insensitive brand name matching, and ICE score clamping

---

## ✦ Signal AI — Autonomous C-Suite Strategy Debate

Signal AI is a genuinely agentic feature: a multi-agent system where configurable C-Suite personas query your live portfolio data, debate what you're missing, and synthesise 3 net-new initiatives the team isn't currently running.

### How it works

**Tool use (agentic).** Each agent has access to 8 read-only tools that query live portfolio data mid-reasoning — not a pre-built snapshot:

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

Each agent runs an agentic loop — it can chain multiple tool calls before responding, deciding what data it needs before forming an opinion.

**Dynamic Moderator.** After each turn, a Moderator agent reads the transcript and decides: continue to the next agent, fire a targeted follow-up question at a specific agent to resolve a tension, or call synthesis early when the debate has converged. Capped at 8 turns.

**Synthesis.** A Chief Strategy Officer persona reads the full debate plus a data appendix (win rates, failures, coverage) and produces 3 structured initiatives, each with: champion agent, dissenting voice and their specific objection, and an honest one-liner on why this gap exists in the portfolio.

**Output format.** Each generated initiative matches the full initiative data structure — observation, hypothesis, success metric, ICE scores, kill criteria, category, type, and estimated revenue — and can be injected directly into the Growth Backlog with one click.

**Debate history.** Every completed debate is saved (up to 20) and accessible in the "Past Debates" tab, with the full transcript and quick-add buttons for each initiative.

### Configurable agents

The C-Suite composition is fully editable in ⚙ Settings — icon, label, strategic lens, and known blindspot. Default agents:

| Agent | Lens | Blindspot |
|---|---|---|
| CMO 📣 | Brand, acquisition, channel mix, creative | Underweights unit economics |
| CFO 📊 | Contribution margin, CAC payback, pricing | Underweights long-term LTV compounding |
| CGO 🚀 | LTV, retention, subscription, referral loops | Underweights operational complexity |
| COO ⚙️ | Inventory, fulfilment, shelf-life, scalability | Underweights brand equity trade-offs |

Custom agent configurations persist in settings — a CSC deployment might use "Category Manager" and "Buyer Relations" instead of CFO and CGO.

### Situation context

A free-text input at the top of the panel injects real-time context into every agent's system prompt before the debate begins. Examples:

> "Black Friday is 8 weeks out and we're over-indexed on single-serve SKUs"
> "Gross margin compressed 4pts this quarter"
> "A key competitor just launched a subscription tier"

---

## 🤖 AI Optimization Toolkit (BYOK)

Built with a Bring-Your-Own-Key architecture — API key is stored in local browser memory only, never transmitted to any third party. Requires an Anthropic API key from [console.anthropic.com](https://console.anthropic.com).

| Feature | What it does |
|---|---|
| **Quick Capture** | Converts a rough plain-language idea into a fully structured initiative form |
| **Hypothesis Expansion** | Takes a rough hypothesis (60+ chars) and rewrites it to the structured format with AI; requires user review before accepting |
| **ICE Scoring Assist** | Evaluates initiative context and suggests Impact and Certainty scores with written rationales |
| **Learning Synthesis** | Scans all closed initiatives in the filtered view and generates cross-retailer patterns, failure modes, and replication signals |
| **✦ Signal AI** | Autonomous C-Suite debate — see above |

Approximate API cost per Signal AI debate: **$0.25–0.35** (claude-sonnet-4, ~40,000 tokens across 8 agent turns, 6 moderator calls, 1 synthesis).

---

## 🛠 Technology Stack

| Layer | Detail |
|---|---|
| Runtime | React 18 / Vite |
| Design | Sand/charcoal enterprise palette; `system-ui` sans-serif body; `ui-monospace` for all financial figures, dates, and tags; shadow-based card depth; light and dark mode |
| State persistence | Environment-agnostic: `window.storage` (Claude artifacts), `localStorage` (browser/production), in-memory fallback |
| AI | Anthropic Claude API via BYOK — `claude-sonnet-4-20250514` with tool use for agentic features |
| Data I/O | CSV import/export with `data:` URI generation; Google Sheets template |

---

## 🚀 Local Development

Requires Node.js.

```bash
# Clone the repository
git clone https://github.com/cristobaldupuis/growth-os.git

# Navigate into the directory
cd growth-os

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open http://localhost:5173/ in your browser. Click the ⚙ icon to configure your workspace and add your Anthropic API key to enable AI features.

---

## 👤 Author

Designed and built by Cristobal Dupuis.

Portfolio: [cristobaldupuis.com](https://cristobaldupuis.com)
