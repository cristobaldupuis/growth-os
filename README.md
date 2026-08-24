# Marketers Lab

*(Repository name `growth-os` is the internal project name. See DECISIONS.md.)*

**Every experiment should make the next one smarter.**

Marketers Lab is an experiment ledger for ecommerce growth teams. It records what
you believed before a test ran, what you predicted, what the ad account actually
did, and what the organisation now knows — and it joins those together
automatically, because the campaign names carry the link.

```
observation → hypothesis → prediction (frozen at launch) → campaign → ad names
    → performance rows → prediction error → learning → next hypothesis
```

The part that is not a project-management tool is the join. An initiative's
`trackingTag` is a segment in the ad naming convention, so a Meta export parses
back into the experiment that produced it. Spend arrives already attached to the
belief it was testing, and a platform export splits three ways: attributed,
untagged business-as-usual, and a tag that resolves to nothing — a broken link,
named rather than counted.

It sits between your data layer (Shopify, GA4, Triple Whale) and your execution
layer (Meta, Klaviyo, native ad tools). It doesn't replace attribution or
automation, and doesn't touch your ad account's budgets: it reads what happened
and remembers what it meant.

**[→ Launch Live Application](https://growth-os-iota-seven.vercel.app/)**

---

## How this differs from the experiment trackers

Experiment tracking, hypothesis templates, AI-suggested tests, ICE prioritisation
and a searchable learnings library are table stakes. [GrowthLab](https://growth-experiments.com/),
[GrowthOrange](https://growthorange.com/) and [GrowthEX](https://www.growthex.ai/)
all ship them, and any pitch resting on "we remember what you learned" is a pitch
against three products saying the same sentence.

The difference is that those are trackers a human updates. This one reads the ad
account. The campaign nomenclature engine (`src/services/naming.js`) turns names
into typed dimensions, refuses to guess when a segment count doesn't match, and
`matchNamesToInitiatives` joins the rows to experiments — so "which of our
campaigns actually taught us anything" is a query rather than an afternoon of
spreadsheet archaeology.

Different category entirely, and not competitors: Triple Whale and Northbeam
answer *what happened*; GrowthBook, Statsig and Eppo are product-engineering
experimentation infrastructure. Marketers Lab sits above the first and does not
attempt the second.

The honest substitute is Airtable or Notion plus a spreadsheet — which models the
same entities for nearly nothing, right up to the point where 4,000 ad names have
to become dimensions.

Commercial thesis, ICP and pricing: [docs/commercial.md](./docs/commercial.md).
What this is and is not, written against the finished roadmap rather than
today's state: [docs/scope.md](./docs/scope.md).

---

## What's new

- **Generated creative has an identity** — every frame and render now leaves a
  persisted record carrying the initiative, the brief version, the prompt, the
  model, what it cost, and the ad name it ships under. Assets used to live in
  component state keyed by variant index and were thrown away on reload, so the
  loop closed at name→initiative and never at asset→initiative. The bytes go to
  Supabase Storage when it is configured and stay session-only when it is not —
  the record persists either way, and the studio says which before you spend
- **The brief reads the ad account, not just the library** — measured ROAS and
  CPA per angle, theme and format are fed into every creative brief, with groups
  below a spend floor flagged as not-evidence rather than quietly dropped. The
  learnings that inform a brief are ranked by a stated rule and the excluded
  remainder is counted in the prompt, so a brief shown 25 of 51 says so
- **Briefs are versioned** — regenerating no longer destroys the previous
  brief's `wouldFalsify`, which is the field that makes a creative round settle
  a question
- **Brand style references** — up to three reference images per brand, attached
  to every generated frame so a round of creative shares one visual language.
  The model is told to match their lighting and grade and explicitly not to
  reproduce their composition
- **AI spend console** — `/admin → Spend` breaks cost down by feature group,
  model, provider and call site over a chosen window. Token counts were always
  in the proxy response and were being discarded; they are now priced at the
  point of use against published list rates, with unpriced calls counted
  separately rather than silently read as free
- **Account audit** — paste a prospect's ad names and get the delimiter, the
  slot histogram, each slot's vocabulary, the parse rate by failure kind, and the
  count of names that need mapping by hand. The first hour of an implementation,
  on their data, in a first meeting
- **A workspace knows whether its data is real** — demo stays seeded and
  resettable; a live workspace cannot be reseeded at all and is reminded to back
  up weekly. Every importer drops and names any column carrying personal data.
  The contract, and where everything lives, is in
  [docs/data-handling.md](./docs/data-handling.md)
- **Tests are read once, not until they agree with you** — a reading window from
  sample size and traffic, the result behind a counted click, and a significance
  threshold corrected for the number of looks
- **Addressable, searchable, keyboard-reachable** — every view and initiative has
  a URL, so Back works and a link to `NH-003` can be pasted into Slack. ⌘K opens
  a palette over initiative titles, ids, hypotheses and learnings. Every dialog
  closes on Escape, traps focus, and gives it back
- **Pre-registration is enforced** — observation, hypothesis and success metric
  carried an asterisk and were not actually required. New initiatives cannot be
  saved without them, with inline reasons; records predating the fields are
  flagged rather than blocked. Leaving the editor with unsaved edits now asks
- **One icon set, no emoji in the chrome** — ~40 `currentColor` stroke icons on a
  16px grid, so the interface looks the same on macOS and Windows and follows
  the theme. Agent avatars are a named icon rather than a character typed into a
  text box
- **Currency and locale are settings** — one money formatter and one date
  formatter, replacing four that disagreed on what `$2,400,000` looks like and
  hardcoded a dollar sign
- **Creative Studio** — brief and produce creative against an initiative, so every asset is born attached to a hypothesis. Briefs are grounded in the brand brief and closed learnings and must state what result would falsify the direction; anything the brand brief doesn't support is routed to `claimsToVerify` rather than asserted. Variants come back as validated naming segments, and ad names are assembled in code
- **Campaign nomenclature engine** — the ad naming convention lives in settings as an ordered segment list with controlled vocabularies. `src/services/naming.js` builds, parses and validates against it, and its trailing `Initiative` segment carries an initiative's `trackingTag` — which is how a performance row finds its way back to the experiment that produced it
- **Admin model console** — an operator-only surface at `/admin` (separate bundle, password-gated) that points each of six feature groups at a model, across Anthropic, Gemini, OpenAI and open weights. Groups declare a capability floor both the picker and the server enforce, so the debate group cannot be pointed at a model without tool calling. Includes a test bench that runs a group's real prompt against your own portfolio through up to four models at once
- **Model tiering** — model choice is grouped by what the call has to do well, not set per feature: reasoning groups (debate, portfolio analysis, creative direction) default to `claude-sonnet-5`; capture and framing defaults to `claude-haiku-4-5`. Adaptive thinking throughout, prompt caching on the flows that reuse a system prefix
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
Cross-tenant architecture — filter the dashboard, pipeline, and learning library across multiple retailers in a single workspace. Auto-generated initiative IDs scoped per brand (e.g. `NH-001`, `PS-003`).

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
- **Reading window** — baseline CVR, minimum detectable effect, confidence level and the sessions the test gets per week give sessions needed per variant at 80% power *and the date the result becomes readable*. A test past its planned end date on half the expected traffic is named as underpowered rather than shown as finished
- **The result is behind a click, and the click is counted** — because a confidence figure consulted every second day and reported as though it were consulted once is the most common way an ad test produces a false winner. Reading early is always allowed and always recorded
- **A threshold corrected for how often you looked** — z ≥ 1.96 on a single reading, 2.36 on a fourth. When a result would have been called a winner on one look and is not one on four, the panel says exactly that. Pocock's sequential boundaries, re-derived numerically in CI rather than quoted
- **Statistical significance** — z-statistic, confidence level, and observed uplift from control/variant conversion and session counts
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

### Account audit

`Performance → Account audit` takes a names-only export — one per line, or a CSV
with a name column — and reports what an account's existing naming actually
contains before any of this is installed: the delimiter in use, the slot-count
histogram, what lives in each slot and which dimension its values match, the
parse rate against the current schema split by failure kind, and the list of
names that will have to be mapped by hand because a live campaign cannot be
renamed without resetting its learning phase.

It runs on names alone. No metrics, no dates, no join — which is what lets it be
used on a prospect's own account in a first meeting, before a contract and before
any spend data changes hands. It reports evidence and refuses to propose a
taxonomy: inferring that slot 4 is usually a theme is arithmetic, and deciding
which dimensions a catalogue needs is the judgement being paid for.

### Creative Studio

Select a Draft or Running initiative and the studio produces a creative brief grounded in that brand's brief and the portfolio's closed learnings, then turns each angle into shootable, named variants.

- **Briefs must be falsifiable.** Every brief states what result would prove the direction wrong. One that can't be wrong can't teach anything.
- **Unsupported claims are quarantined.** Anything the creative wants to say that the brand brief doesn't support goes into `claimsToVerify` for the operator to clear, rather than being asserted in a script.
- **Names are assembled, not typed.** The model returns segment values; `buildName` validates them against the schema. The initiative segment is stamped from the initiative's own tracking tag — the model is never told it and never asked to invent one.
- **Key frames.** Each variant can generate its opening beat as an image (Gemini image models, "Nano Banana"). The prompt is composed from the approved brief — insight, promise, proof, the variant's opening beat — and is inspectable before you spend. Two exclusions are hard-coded: no rendered text, and nothing from the brief's `claimsToVerify`, so a generated frame can't launder an unverified claim into something that looks settled.
- **Output is portable.** Copy the ad names, export the full variant set as CSV, or download a frame. Generated images are held for the session only and are never written to browser storage — a base64 PNG would exhaust the quota and take the portfolio with it.

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

### Which model runs what

Model choice is a routing decision rather than a code literal. Features are grouped
by what the call has to do well, and each group is pointed at one model from the
admin console at `/admin`:

| Group | Covers | Optimised for |
|---|---|---|
| Capture & Framing | Quick Capture, Hypothesis Expansion, ICE Assist | JSON reliability, cost, latency — the operator supplies the judgement and reviews the output |
| Portfolio Analysis | Next Plays (both passes), Learning Synthesis, Ask the Library | Long-context faithfulness; must not invent learning IDs |
| Signal AI Debate | Agent turns, Moderator, Debate synthesis | Persona adherence and willingness to disagree. **Requires tool use** |
| Creative Direction | Creative Brief, Ad Variants | Copy craft, brand voice, claim safety |
| Image Generation | Creative Studio key frames | Frame quality per cent spent |
| Video Generation | Talking-head renders | Default provider only — the per-render tier stays an operator choice in Creative Studio |

Each group declares a capability floor that both the picker and the server enforce,
so the debate group cannot be pointed at a model without tool calling, and a
whole-portfolio prompt cannot be pointed at a short-context model. Providers wired
today: Anthropic (Opus 5, Sonnet 5, Haiku 4.5), Google Gemini (3.1 Pro, 3.6 Flash,
3.5 Flash Lite), OpenAI (GPT-5.6 Sol, Terra and Luna), and Thinking Machines
(Inkling, open weights, served first-party through Tinker).

Only the Anthropic ids are confirmed — the app calls them. Every other id is
flagged `unverified` in the catalogue and carries a **Verify** button that asks the
provider for its own model list, because an id transcribed from a marketing name
fails as a 404 at the exact moment someone is trying to generate something real.
Verify before you route a group, not after.

The console also carries a **test bench** — it runs a group's real production
prompt, against your own portfolio, through up to four models at once, so an
assignment is made from output rather than reputation. See `src/admin/probes.js`.

---

## Brand briefs

Each retailer carries a structured brief injected into every AI call:

- **What they sell** — category, price point, hero SKUs
- **Categories** — comma-separated product categories
- **ICP** — who buys, demographics, purchase behaviour
- **Why they win** — actual differentiator vs. alternatives
- **Relationship** — own brand, wholesale, marketplace
- **Current constraint** — what's holding this retailer back

This is what makes recommendations specific — instead of "test SMS cart recovery at Peak Season," the agent reasons about their specific buyer's consideration window and adjusts the mechanic accordingly.

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
  config.js            # Generic deployment context — brands, briefs, agents, categories, seed data
  config.[client].js   # Per-client copy of config.js (e.g. config.demo.js)
  constants.js         # Theme tokens, status/outcome palettes, ICE scoring, formatters
  views/               # DashView, TriageView, LearningLibrary, DetailView, ClientReadoutView, CreativeStudio, CopilotPanel
  components/          # Shared UI atoms
  services/
    store.js           # Backend-agnostic persistence with explicit write-failure reporting
    items.js           # Save-time bookkeeping — stamps updatedAt only on what changed
    portfolio.js       # Portfolio context + tool definitions passed to the agents
    naming.js          # Campaign nomenclature — build/parse/validate, and the initiative bridge
    performance.js     # Campaign-level export ingestion, parsed back through the naming schema
    csv.js             # Import/export and record normalisation
    csvLine.js         # The one quote-aware CSV line splitter, shared by every importer
    seedRebase.js      # Shifts each config's authored demo timeline onto today, derives weekly figures
    cadence.js         # Rolling activity windows for the initiative rails
    ai/
      registry.js      # Which models exist, what each supports, which feature group each serves
      models.js        # Request building, routing resolution, effort, prompt-cache policy
      call*.js         # One file per AI feature
  admin/               # The model console — a SEPARATE Vite entry, never bundled into the app
    AdminApp.jsx       # Login, routing cards, shell
    BenchPanel.jsx     # Side-by-side model comparison
    probes.js          # How each group is exercised — calls the real prompts, no copies
    theme.js           # Its own visual language, deliberately not the product's
api/
  proxy.js             # Serverless text proxy — origin allowlist, request-shape bounds, durable rate limiting
  _adapters.js         # Per-provider request/response translation, normalised to the Anthropic shape
  image.js             # Gemini image generation, bounded on count rather than tokens
  video.js             # Talking-head avatar render — submit/poll, bounded on script length
  admin.js             # Model console backend — session, routing read/write, provider model lists
  routing.js           # Public read of group → model, fetched by the app at boot
  _session.js          # HMAC-signed admin session cookie
  _routing.js          # Routing persistence (Upstash), soft on read, explicit on write
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

# Optional. Enables image generation in the Creative Studio (Gemini image
# models, "Nano Banana") and lets the console route text groups to Gemini.
# Without it (and without the Vertex vars below) the app runs normally and
# Gemini features return a clear "not configured" error rather than failing
# obscurely.
GEMINI_API_KEY=your_key

# Optional alternative to GEMINI_API_KEY above: routes every Gemini call
# (text and image) through Vertex AI instead of the Gemini Developer API.
# Same models, different Google product, different billing pool — the
# Developer API (generativelanguage.googleapis.com, the plain API key above)
# bills against AI Studio's own balance, and as of March 2026 Google Cloud
# Billing credits (including the free trial) are explicitly excluded from it.
# Vertex ({location}-aiplatform.googleapis.com) bills against the GCP
# project's Cloud Billing account, so credits sitting there apply. All three
# vars below are required together; set all three and Vertex is used
# automatically. Set none and GEMINI_API_KEY above is used exactly as before
# — this is additive, not a replacement.
GCP_PROJECT_ID=your_gcp_project_id
GCP_LOCATION=us-central1
# The service-account key JSON from GCP (IAM & Admin -> Service Accounts ->
# Keys -> a key with the "Vertex AI User" role). Vercel env vars are
# single-line and the key's `private_key` field has embedded newlines, so
# paste it base64-encoded:
#   base64 -i service-account-key.json | tr -d '\n'
# A raw (unencoded) JSON string is also accepted, for platforms that tolerate
# multi-line env values.
#
# The underlying API also needs to be enabled on the project once. The
# console product it lives under has been renamed more than once (Vertex AI,
# now "Gemini Enterprise Agent Platform"), so searching the API Library by
# product name is a moving target — its technical service id has not moved:
#   gcloud services enable aiplatform.googleapis.com --project=your_gcp_project_id
# or open console.cloud.google.com/apis/library/aiplatform.googleapis.com directly.
GOOGLE_APPLICATION_CREDENTIALS=your_base64_or_raw_service_account_json

# Optional override. Forces "vertex" or "aistudio" regardless of which of the
# above are set — e.g. to try Vertex without deleting a working
# GEMINI_API_KEY, or to roll back instantly without touching credentials.
# Unset, the mode auto-detects: Vertex once all three GCP_*/GOOGLE_* vars
# above are present, AI Studio otherwise.
GEMINI_AUTH_MODE=vertex

# Optional. Enables talking-head video generation in the Creative Studio. Each
# tier needs only its own key — the standard tier works without the premium
# one, and vice versa. Without either, video generation returns a clear "not
# configured" error rather than failing obscurely.
#
# Standard tier. A HeyGen API key, from Settings -> API in the HeyGen dashboard.
HEYGEN_API_KEY=your_key

# Premium tier. VEED Fabric 1.0 is served through fal.ai's inference queue
# rather than a VEED-hosted endpoint, so this holds a fal.ai key (fal.ai/dashboard/keys),
# sent as `Authorization: Key ...`. Named for the model rather than the host
# because the model is what you are choosing.
VEED_API_KEY=your_key

# Optional, and not offered as a tier in the UI — D-ID currently prices above
# HeyGen without being better. The adapter is kept so re-promoting it is a
# one-line change. NOTE: this must be the ALREADY base64-encoded `email:key`
# pair, not the raw key copied from D-ID Studio — the header is sent as
# `Basic $DID_API_KEY` verbatim. Encoding it twice is the usual cause of a 401.
#   printf '%s' 'you@example.com:your_key' | base64
DID_API_KEY=your_base64_encoded_pair

# --- Admin model console (/admin) ---------------------------------------------
#
# Both are required for the console to be reachable. If ADMIN_PASSWORD is unset
# the console is disabled rather than open — an admin surface that defaults to no
# password because someone forgot to configure one is worse than no admin surface.
# The app itself is unaffected either way and runs on the committed defaults.
#
# ADMIN_SESSION_SECRET signs the session cookie. Any long random string; changing
# it invalidates every existing session, which is also how you revoke one.
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_PASSWORD=a_long_random_password
ADMIN_SESSION_SECRET=a_long_random_string

# Optional. Lets the console route a feature group to OpenAI. Without it, OpenAI
# models appear in the picker but calls return a clear "not configured" error.
# Gemini text reuses whichever Gemini auth is active above (GEMINI_API_KEY or Vertex).
OPENAI_API_KEY=your_key

# Optional. Lets the console route a feature group to Inkling, Thinking Machines'
# open-weights model. From tinker.thinkingmachines.ai -> API Keys. Same behaviour
# without it: the model is selectable and returns a clear "not configured" error
# rather than failing obscurely.
#
# Tinker's inference endpoint speaks the Anthropic Messages API, so this is the
# one non-Anthropic provider that needs no request translation. Note it is a beta
# that Thinking Machines scope to low internal traffic — fine for an operator
# console, not for serving clients directly.
TINKER_API_KEY=your_key

# Optional, and nothing routes here today. Inkling's weights are also served by
# OpenRouter, Together, Fireworks and Baseten; the adapter is kept wired so that
# moving off Tinker's beta — if its throughput ever binds — is the `provider`
# field on one catalogue entry rather than a new integration.
OPENROUTER_API_KEY=your_key

# Optional. Comma-separated origins the proxy will accept. Defaults to the
# canonical deployment, so a missing value fails closed rather than opening up.
ALLOWED_ORIGINS=https://your-deployment.vercel.app

# Optional but strongly recommended in production. Without these the proxy
# falls back to an in-memory rate limiter, which on serverless is per-instance
# and resets on cold start — i.e. effectively no limit at all.
#
# These also store the admin console's model routing. Without them the console
# still runs and the bench still works, but a routing change cannot be saved —
# the console says so rather than appearing to save.
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Note there is deliberately no client-side secret. Anything prefixed `VITE_` is
compiled into the browser bundle and is not a secret.

**One caveat for local development:** `npm run dev` serves the Vite bundle but not
the `api/` functions, so `/admin` will load and then fail to reach `/api/admin`.
Use `vercel dev` when working on the console or anything else under `api/`.

---

## Author

Designed and built by [Cristobal Dupuis](https://cristobaldupuis.com).
