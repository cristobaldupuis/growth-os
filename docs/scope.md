# Marketers Lab — what it is, and what it is not

This document answers one question: **if every item on the roadmap ships, what
exactly has been built — and what has deliberately not been?**

It is written against the finished state, not today's state. Where a capability
already exists it is marked **[shipped]**; where it depends on unbuilt work it is
marked **[planned]** with the phase that carries it. A third category matters as
much as the other two: **[never]** — things that were considered, decided against,
and are not coming back. A roadmap that only lists additions describes an
appetite. The boundary is the product.

Companion documents: [README.md](../README.md) is the current feature surface,
[ROADMAP.md](../ROADMAP.md) is the dependency order, [DECISIONS.md](../DECISIONS.md)
is the reasoning with forcing conditions, [docs/commercial.md](./commercial.md) is
the business thesis stated as a falsifiable prediction, and
[docs/data-handling.md](./data-handling.md) is the data contract.

Last reviewed: August 2026.

---

## 1. The one sentence

> **An experiment ledger for ecommerce growth teams, in which the ad account's own
> campaign names are the join key.**

Every experiment should make the next one smarter. The mechanism that makes that
more than a slogan is that spend arrives already attached to the belief it was
testing, because the campaign name carries the link.

## 2. The spine

Everything in this product hangs off one chain. Nothing on the roadmap replaces
it; every phase either feeds it or reads from it.

```
observation → hypothesis → prediction (frozen at launch) → campaign → ad names
    → performance rows → prediction error → learning → next hypothesis
```

Above it sits one layer, added in Phase 5.1: the **learning agenda** — the
question the business needs answered, which experiments ladder up to. Below it
sits one layer, added in Phase 5.4: the **campaign fact model** — facts at
entity × day with the name parsed into typed dimensions.

```
Learning agenda (a question) → Experiments → Campaigns / ad entities → Facts
```

Four levels. If a future need cannot be expressed as one of them, that is the
signal to revisit the model rather than to add a fifth concept.

## 3. Where it sits

Between the data layer and the execution layer, and it displaces neither.

| Layer | Examples | Relationship |
|---|---|---|
| Data | Shopify, GA4, Triple Whale, Northbeam | Reads from. Does not replace attribution. |
| **Marketers Lab** | — | Holds the belief, the prediction, the join and the learning. |
| Execution | Meta, Google Ads, Klaviyo, creative tools | Reads from; writes only behind a proposal gate. |

---

## 4. What it is

Seven claims, each of which is either true today or true at roadmap completion.

### 4.1 A pre-registration instrument

An initiative cannot be saved without an observation, a hypothesis in structured
form, and a single named success metric **[shipped]**. It cannot move from Draft
to Running without kill criteria **[shipped, 5.2]**. At launch a
`predictionSnapshot` freezes revenue impact and ICE, which is what makes
calibration possible later — prediction error is computed against what was
believed *then*, not against what is remembered now **[shipped]**.

Records that predate a rule are flagged rather than retroactively blocked. That
asymmetry is deliberate and consistent: new discipline applies forward.

### 4.2 A taxonomy engine

The ad naming convention is **data, not code** — an ordered segment list with
controlled vocabularies stored in settings, resolved through one function that
every reader in the app goes through **[shipped]**.

Three properties are enforced rather than requested:

- an absent value is the literal `NA`, never a blank;
- the delimiter never appears inside a segment;
- a wrong segment count is **refused, not guessed** — the row is counted and
  reported as unparsed rather than silently mis-aligned.

A company can extend the shipped registry with its own dimensions and vocabulary
values, held as an overlay so the shipped registry keeps improving underneath a
workspace that extended it. A placed dimension is **appended, never inserted** —
appending makes older names loudly unparseable, inserting makes them parse
cleanly into wrong answers **[shipped]**.

At completion the editor also owns delimiter, placeholder, the shipped labels and
hints, and slot order — the last of which needs an answer for names already live
in an ad account, since a live campaign cannot be renamed without resetting its
learning phase **[planned, 1.6 remainder]**.

### 4.3 A bridge between an ad account and an experiment ledger

This is the differentiated part, and the only part of the product that no adjacent
tool attempts.

Two independent mechanisms, either sufficient **[shipped]**:

1. **The tag slot.** The convention's trailing `Initiative` segment carries an
   initiative's `trackingTag`. Works on names this tool built.
2. **The claim.** An initiative claims a campaign, ad set or ad name outright,
   matched on the exact string. Works on names that existed before this tool was
   in the room — which is most of them, and which cannot be renamed.

A claim outranks a tag when they disagree, because one is a person pointing at a
string and the other is a convention that could have been followed by accident.
Claims match finest-grain-first and inherit down a hierarchy.

An import splits three ways and names the third: attributed, untagged
business-as-usual, and **a tag that resolves to nothing** — a broken link, named
rather than counted. Claimed-but-absent names are reported the same way, because
a total that quietly excludes spend is worse than one that admits it.

### 4.4 A performance reader

CSV import is permanent and universal **[shipped]**. One entry point, shapes
routed by the file's own headers rather than by asking: the weekly-brand contract,
the campaign-level ad export, and the scoped breakdown paste-back that diagnostic
escalation asks for **[shipped]**. Platform header spellings are recognised as
they come; the reader is quote-aware.

Connectors ship one at a time behind one normalisation contract, ordered by value
over integration pain, and every one of them passes the same personal-data
chokepoint:

| Connector | Auth | Status |
|---|---|---|
| Klaviyo | private API key, server-held | **[planned, 2.1]** — campaign/flow *values* reports only |
| Shopify | custom app admin token, non-expiring | **[planned, 2.1]** — aggregate queries, never traverses `customer` |
| GA4 | service account | **[planned, 2.x]** — funnel actuals replace estimated drop-off |
| Meta / Google Ads | OAuth, refreshing | **[planned, 5.5]** — hard prerequisite for Supabase |

Klaviyo and Shopify deliberately come first *because they do not need a backend* —
a long-lived server-held secret is a Vercel environment variable. That reorders
the plan around the biggest single risk in it: everything has only ever run on
seeded data.

### 4.5 A reasoning surface grounded in that data

Not "AI features". The distinction the product enforces is that every model call
reasons from the workspace's own state.

- **Signal AI** — configurable C-Suite agents each running an agentic tool-calling
  loop over eight portfolio tools, with non-negotiable mandates that produce real
  disagreement, a dynamic moderator that hunts unresolved tension before allowing
  consensus, and a CSO synthesis that resolves the tension into three net-new
  initiatives with named dissent **[shipped]**.
- **Creative briefs** that reason from measured ROAS and CPA per angle, theme and
  format, flag groups below a spend floor as not-evidence, rank the learnings they
  were shown by a stated rule, and report the remainder they were not shown
  **[shipped]**.
- **Learning synthesis** across closed initiatives into Patterns, Gaps (proven at
  one retailer, missing at another), Lessons and Do Next **[shipped]**.
- **Diagnostic escalation** — when a closed initiative's outcome diverges from its
  frozen prediction past a threshold, the system ranks which *un-captured*
  dimension most plausibly explains the gap and asks for exactly that one export.
  The verdict is arithmetic, not a model call: concentration × underperformance
  names the band or states the mix was even **[shipped, 5.3]**.

At completion these run durably rather than in a browser tab: background
execution outside serverless timeouts, Zod contracts at every LLM boundary,
versioned prompts paired to those schemas, and a cron audit loop that
cross-references live metrics against active experiments **[planned, Phase 3 —
gated]**.

### 4.6 A creative loop, closed at both ends

Brief → variants → named assets → performance → back to the brief.

- Briefs are generated against an initiative only, never standalone, and must
  state `wouldFalsify`. A brief that cannot be wrong cannot teach anything
  **[shipped]**.
- Anything the brand brief does not support is routed to `claimsToVerify` rather
  than asserted **[shipped]**.
- The model returns segment *values*; `buildName` assembles the string. The model
  is never told the tracking tag and never asked to invent one **[shipped]**.
- Key frames are generated from the approved brief with two hard exclusions — no
  rendered text, and nothing from `claimsToVerify` **[shipped]**.
- Every frame and render leaves a **record**: initiative, brief version, prompt,
  model, cost, and the ad name it ships under — which extends the join from
  `name → initiative` to `asset → initiative` **[shipped]**.
- Briefs are versioned rather than overwritten, because a brief that can be
  overwritten cannot be checked against its own falsification claim **[shipped]**.

At completion the end state is **product video chosen from the learning library** —
angle, hook and proof selected because this brand's own tests supported them,
generated against a hypothesis, named with the tracking tag, and joined back to
its own performance **[planned, 5.7]**. It is last on purpose: built earlier it is
an asset generator, which is a commodity.

### 4.7 An execution surface with a gate

At completion the product can create campaigns, change budgets and pause ad sets
on Meta and Google Ads **[planned, 5.6]** — under one rule that does not bend:

> Every mutation is a **proposed change**, diffed against live state, approved by
> a human, then applied by a separate code path with different credentials that
> writes an audit record. **No auto-approval at any spend level.**

The proposer and the applier are different paths on purpose. A bad read is a wrong
chart; a bad write spends money.

---

## 5. What it is not

### 5.1 Not an attribution platform
Triple Whale and Northbeam answer *what happened*. This sits above them and asks
*what did we believe, and what did the result teach us*. It does not model
multi-touch paths, does not adjudicate channel credit, and should never be sold on
a ROAS-lift claim — that invites an attribution argument that has nothing to do
with the product.

### 5.2 Not product/engineering experimentation infrastructure
GrowthBook, Statsig and Eppo serve a different buyer with feature flags,
assignment and server-side exposure logging. This has no SDK, no flagging, no
randomisation engine. It reads a marketing test that ran in an ad account.

### 5.3 Not another experiment tracker
Experiment tracking, hypothesis templates, AI-suggested tests, ICE and a
searchable learnings library are table stakes — three funded products ship all of
it. Those are trackers a human updates. **The pitch is never the Library.** The
pitch is that the ledger reads the ad account.

### 5.4 Not a customer data store — and this is enforced, not promised
No email address, phone number, person's name, postal address, customer or profile
id, device or advertising id, IP address, or date of birth enters the workspace.
Age, gender, country, city, region and placement are permitted as *cohorts on a
breakdown row* under an explicit allowlist. Every importer identifies, drops and
reports offending columns; the same guard is the chokepoint every future connector
must pass **[shipped]**.

This is the reason a security review has a one-sentence answer, the reason browser
storage was ever defensible, and the reason no AI prompt in the product carries
personal data. A prospect who needs individual-level data in the tool is not a
customer for this architecture, and the correct answer is to say so rather than to
widen the contract.

### 5.5 Not a bulk demographics ingester **[never, by default]**
Age × gender is roughly a 21× row multiplier, it is where the DPA obligation
actually lives, and — worst — the schema's own `age`/`gender` slots record what
was *targeted* while a platform breakdown reports who was *reached*. Ingesting
both produces two columns with the same name and opposite meanings. The answer is
diagnostic escalation: one question, one window, one axis, landing in
`initiative_evidence` under its own retention posture rather than in the fact
table.

### 5.6 Not cross-customer benchmarking **[never — cut]**
Removed from the roadmap outright. A category benchmark drawn from a handful of
clients is a small sample presented with the authority of a large one, and the
first time it is wrong it is wrong in a client deck. It also inverts the sale:
the thing being bought is *your* organisation's accumulated evidence, not an
industry average — and building it requires asking every client for permission to
use their results, a conversation that costs more trust than the feature returns.

### 5.7 Not an autonomous ad manager
See 4.7. There is no spend threshold below which a write is applied without a
human. Nothing on the roadmap adds one.

### 5.8 Not a renamer of live ad accounts
A live Meta campaign cannot be renamed without resetting its learning phase.
"Rename your account and we will measure it" is a way of saying no. The retrofit
is a **mapping exercise** — the account audit plus hand-claimed names — and the
implementation fee is priced against that reality (20–40 hours, consistently
underestimated).

### 5.9 Not a self-serve SaaS at $299/month
At that price the product is a tool, tools get cancelled in budget reviews, and
the implementation work is unfunded — which means the taxonomy is never installed,
which means the differentiating feature never turns on. The low price is not a
cheaper version of this offer; it is a different offer that fails.

### 5.10 Not an agency product — for now
The multi-client maths is attractive and it is the obvious distribution
multiplier. It is deferred anyway: agencies buy on margin, not on insight, and
will converge the price toward $200–300/brand at every renewal. Selling to brands
first establishes what the thing is worth; selling to agencies first establishes
what it can be discounted to.

### 5.11 Not a venture case
Implementation is operator-delivered. The practice saturates at roughly 5–8
concurrent clients — call it $150k–$250k/year. That is a good consulting business
and a poor venture case, and the two ask for opposite decisions. This product
assumes the first. Anything justified only by the second is out of scope.

### 5.12 Not open source **[decided]**
The `LICENSE` is all-rights-reserved. Clients get a right to use a deployed
instance under their services agreement; nobody gets a licence to the source. MIT
on this repository was granting a free fork of the parser the entire commercial
thesis rests on.

---

## 6. Capabilities at roadmap completion, by layer

Read this as the inventory of the finished thing.

### Ledger and research programme
- Learning agenda items — a question with `holdConstant`, `varies`,
  `falsifyingResult` and sample/duration guidance; experiments ladder up via
  `agendaId`; a rollup joins each question to its evidence **[shipped]**
- Backward test design: an agenda question seeds an initiative's title, hypothesis
  and kill criteria **deterministically, not via a model** — there is by
  definition no evidence yet for a model to ground a derivation in **[shipped]**
- Enforced pre-registration; enforced kill-criteria gate at all three transition
  points; elapsed-vs-planned distance to the kill line **[shipped]**
- Franchise / Loonshot risk taxonomy, optional and unset by default, with
  unclassified items excluded from the denominator so the tile cannot read "safe"
  on data nobody classified **[shipped]**
- ICE scoring with AI-assisted Impact and Certainty and written rationales
  **[shipped]**
- Test validity: reading window from sample size and expected traffic; the result
  behind a counted click; a significance threshold corrected for the number of
  looks via Pocock's flat boundary, re-derived numerically in CI rather than
  quoted; a required incrementality/counterfactual statement before close
  **[shipped]** — fed by measured spend, conversions and revenue from the ad names
  rather than hand-entered counts **[planned, 1.6 remainder]**
- Calibration: prediction error against the frozen snapshot, on the card and in
  the library **[shipped]**

### Taxonomy and the bridge
- Schema-as-data with controlled vocabularies, per channel and per level; custom
  dimensions and vocabulary additions as an overlay; a full editor including
  delimiter, placeholder, labels, hints and slot order **[part shipped / part
  planned]**
- Build, parse, validate, identify; refusal on slot-count mismatch; dimension
  coverage so a partial rollup is distinguishable from an empty one **[shipped]**
- Two bridges (tag slot, hand claim) with `attributionVia` recorded; claims gain
  an optional platform `entityId` once an API integration can supply one, making
  the string the fallback rather than the key **[planned, 5.5]**
- Account audit on names alone — delimiter, slot histogram, per-slot vocabulary
  and likely dimension, parse rate by failure kind, and the list needing manual
  mapping. Runs in a first meeting, before a contract and before any spend data
  changes hands. It reports evidence and **refuses to propose a taxonomy**,
  because that judgement is the thing being paid for **[shipped]**
- Breakdown pivots on any dimension the names carry, with unparsed and
  not-in-template counts stated above the pivot; ratios recomputed from summed
  numerator and denominator, never averaged across rows **[shipped]**

### Facts and persistence
- Supabase Postgres with RLS and Auth; the `store` abstraction re-backed;
  per-user proxy authorisation on a session token from the same auth **[planned,
  2.0 — the read paths are real work, not an adapter swap]**
- Campaign fact model at campaign/adset/ad × day with parsed dimensions, so every
  "break performance down by X" is a `GROUP BY` **[planned, 5.4]**
- **`raw_name` and the schema version stamped on every fact row**, with a reparse
  job — the property that makes a taxonomy correction safe, lets a row that failed
  to parse today parse tomorrow, and is the precondition for retiring the
  `gender`/`talent` collision **[planned, 5.4]**
- `initiative_campaigns(initiative_id, platform, entity_type, entity_id, role)`
  with `role ∈ control | variant | holdout` — one table, two entry points: assign
  campaigns to an experiment, or promote campaigns into one **[planned, 5.4]**
- Import batches first-class: filename, imported_at, schema version, and the
  attributed / untagged / broken-link split as of import. That table is the audit
  trail for the product's core claim, and a client watching their own tagging
  discipline improve month over month is a renewal argument **[planned, 5.4]**

### Reasoning and models
- Six feature groups — capture, analysis, debate, creative, image, video — each
  pointed at a model from an operator console, each declaring a capability floor
  enforced in the picker *and* server-side **[shipped]**
- Providers wired: Anthropic (confirmed), Google Gemini via either AI Studio or
  Vertex service-account auth, OpenAI, and Thinking Machines' Inkling through
  Tinker, with an OpenRouter adapter kept warm so moving off a beta is a
  `provider` field rather than an integration **[shipped]**
- Every non-Anthropic catalogue id is flagged `unverified` with a Verify button
  that asks the provider for its own model list, because an id transcribed from a
  marketing name fails as a 404 at the worst moment **[shipped]**
- A test bench that runs a group's **real production prompt** against your own
  portfolio through up to four models at once **[shipped]**
- Per-call usage ledger priced at the point of use, rolled up by group, model,
  provider and call site, and projected into a per-workspace monthly cost model
  held against an editable price — unpriced calls reported as unknown rather than
  assumed free **[shipped]**

### Creative
- Grounded briefs with `wouldFalsify` and `claimsToVerify`; versioned; evidence
  from measured returns with the remainder counted **[shipped]**
- Named variants assembled in code; CSV export; brand style references
  **[shipped]**
- Key-frame image generation with hard exclusions; talking-head video in two
  priced tiers quoted against the actual script before generation **[shipped]**
- Asset provenance records; bytes to Supabase Storage when configured,
  session-only when not, with the studio saying which before you spend
  **[shipped]**
- Product video generated from library evidence **[planned, 5.7]**

### Operating surface
- Hash routing, per-view titles, addressable initiatives and settings sections;
  ⌘K palette; dialogs that close on Escape, trap focus and return it; labelled
  forms; unsaved-work guards; named destructive actions **[shipped]**
- Dashboard with north star, business health panel, attention nudge, contribution
  ramp; weekly standup mode; client readout view; weekly pulse **[shipped]**
- Demo vs live as **workspace state, not a build flag** — a live workspace cannot
  be reseeded at all, and gets a seven-day backup reminder **[shipped]**
- One money formatter and one date formatter with currency and locale as settings;
  one icon set; all 66 themed pairings held to WCAG AA in CI, plus a 1.4:1
  adjacency floor on the contribution ramp **[shipped]**
- Federated knowledge base over closed learnings via `pgvector` **[planned, Phase
  4 — and gated on a *measured* trigger: the corpus no longer fitting in a context
  window, not on the phase number coming up]**

---

## 7. The rules no roadmap item is allowed to break

These are the invariants. Every one of them is a decision with a cost that was
paid on purpose, and every one survives to the finished state.

1. **Refuse rather than guess.** A wrong-but-plausible parse is worse than an
   unparsed row, because the unparsed row is counted and reported while the
   mis-parsed one enters the analysis silently.
2. **Loud failure beats quiet corruption.** Appended slots over inserted ones;
   a vocabulary correction deferred until reparse-on-version makes it safe.
3. **The model never writes the name, and never invents a tracking tag.** It
   returns validated segment values; code assembles the string; the caller stamps
   the tag.
4. **The prediction is frozen at launch.** Calibration and diagnostic escalation
   both require an expectation recorded *before* the result. This is also why a
   human-updated tracker cannot generate the escalation sentence.
5. **A total that excludes spend must say so.** Unparsed rows, untagged spend,
   broken links, claimed-but-absent names, learnings not shown to a brief,
   unpriced AI calls — each is counted and named rather than dropped.
6. **No write without a human diff.** At any spend level.
7. **No people in the store.** Enforced at the importer and the row, tested with a
   real personal-data export.
8. **Nothing that cannot be falsified.** Briefs state what would prove them wrong;
   initiatives state kill criteria; the business thesis itself is written as an
   experiment with a kill criterion.
9. **New discipline applies forward.** Legacy records are flagged, never
   retroactively blocked.
10. **Arithmetic stays arithmetic.** Verdicts, audits, ICE thresholds and
    escalation ranking are computed, not prompted. Models are used where judgement
    is genuinely required — and the judgement being sold (what a good taxonomy
    looks like for a given catalogue) is deliberately not automated at all.

---

## 8. What is still not true when everything ships

Worth stating plainly, because a completed roadmap invites the assumption that the
remaining risk is gone.

- **The moat is the practice, not the code.** Prompts, taxonomy design and the
  operating cadence are visible in source. What is not copyable is the accumulated
  judgement about what a good taxonomy looks like for a given catalogue, and that
  is delivered by a person.
- **Capacity does not scale with the roadmap.** 5–8 concurrent clients is the
  ceiling of an operator-delivered implementation regardless of how much software
  exists. Phases 3 and 4 are gated at ten paying clients precisely because
  scaling work done before there is something to scale is the most expensive kind
  of progress available.
- **Concentration risk stays.** At 5–8 clients, one churn is 15% of revenue.
  Annual terms on the software, not monthly.
- **The commercial test is unrun.** Three paid invoices at $6,000 implementation +
  $1,500/month, and it is invalid until one real ad account has been through the
  real parser end to end — because on seeded data a "no" cannot be distinguished
  from a "not shown properly."
- **The paper does not exist.** An MSA, an order form and a DPA are a lawyer, not
  a sprint, and they are needed before the first invoice rather than after it.
  `docs/data-handling.md` is the cheap half of that answer.
- **The kill criterion for the whole thing is written down.** Twenty qualified
  conversations with no close, or a pattern of closes only after the
  implementation fee is cut below $3,000. Either result says the problem is real
  but not painful enough at this price — and the response is to reposition, not to
  build more.
