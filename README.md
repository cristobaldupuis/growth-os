# Growth OS

Growth OS is an experiment tracking and growth execution framework built for multi-brand ecommerce portfolios. It replaces fragmented marketing spreadsheets with a structured, system-driven operating engine — combining initiative lifecycle management, statistical rigor, and AI-assisted prioritization in a single interface.

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

### Performance Dashboard
- **Capital risk and calibration engine** — tracks revenue impacted by completed tests alongside active revenue at risk, and computes a running accuracy score comparing estimated vs. actual revenue outcomes
- **Executive update generator** — one-click synthesis of active pipeline metrics, velocity, and calibration accuracy into a formatted stakeholder update
- **Velocity tracking** — sparkline charts and categorical breakdowns across Paid Media, Conversion, Retention, Merchandising, and more

### Test Validity Panel
Built directly into every Running, Completed, or Killed initiative — addresses the most common gap in growth team experiment discipline:

- **Sample size calculator** — given a baseline conversion rate and minimum detectable effect, calculates sessions needed per variant at 90% or 95% confidence using a two-proportion z-test with 80% power
- **Statistical significance indicator** — takes live control vs. variant conversion data and shows confidence level, z-statistic, and observed uplift; warns explicitly against calling winners early
- **Incrementality flag** — required field before marking a test Completed; forces documentation of the counterfactual ("what would have happened without this change?") so revenue claims are defensible

### CSV Import / Export
- **Export CSV** — exports the current filtered initiative view as a CSV, including all fields, for editing in Google Sheets or Excel
- **Import CSV** — uploads a CSV and previews a row-by-row breakdown (new vs. update, warnings) before writing anything; matched on `initId` so updates are precise and non-destructive
- **Google Sheets template** — [open the import template](https://docs.google.com/spreadsheets/d/1Oar4THeAKIGvvBzKUmqwfWersaUdLqqoq-FW_jBvS1E/edit) with three sheets: Template (clean input), Instructions (column reference and importer rules), and Example (five filled rows across all statuses)
- Import handles date format normalisation (ISO, M/D/YYYY, MM/DD/YYYY), case-insensitive brand name matching, and ICE score clamping

### AI Optimization Toolkit (BYOK)
Built with a Bring-Your-Own-Key architecture — API key is stored in local browser memory only, never transmitted to any third party.

- **Quick Capture** — converts a rough plain-language idea into a structured initiative form via Claude
- **Hypothesis Expansion** — takes a rough hypothesis (60+ characters) and rewrites it to the structured `We believe that [X] will result in [Y] for [Z], because [W]` format
- **ICE Scoring Assist** — evaluates the initiative context and suggests Impact and Certainty scores with written rationales
- **Learning Synthesis** — scans all closed initiatives in the filtered view and generates cross-retailer patterns, failure modes, and replication signals

### Experiment Lifecycle Tracking
- **Auto-generated initiative IDs** (e.g. NH-001, R2-003) scoped per brand
- **Linked initiatives** — map downstream dependencies and multi-cell test sequences
- **Kill criteria** — required field enforcing defined exit conditions before a test runs
- **ICE scoring** — Impact, Certainty, Ease with a composite score used for pipeline prioritization
- **Full results logging** — actual outcome, key learning, outcome classification (Jackpot / Success / Failed / Inconclusive), decision made, and actual vs. estimated revenue and cost

---

## 🛠 Technology Stack

| Layer | Detail |
|---|---|
| Runtime | React 18 / Vite |
| Design | Custom high-contrast minimalist serif UI; light and dark mode |
| State persistence | Environment-agnostic: `window.storage` (Claude artifacts), `localStorage` (browser/production), in-memory fallback |
| AI | Anthropic Claude API via BYOK — `claude-sonnet-4-20250514` |
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
