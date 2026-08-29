# Seed data — planted demo patterns

A reference for the demo. Each pattern below is something the AI features in Growth OS should surface from the seed portfolio — useful to know what to click on during a client call.

Every ID here is checked against the live seed in `src/config.demo.js`, which is what `activeConfig.js` points at. If you repoint `activeConfig.js` at a different config, this document does not describe what you will see.

The three brands are **Northcove Home** (`NH`, home décor), **Grounds Control** (`GC`, specialty coffee) and **Peak Season** (`PS`, technical outdoor gear).

---

## 1. SMS as a portfolio gap

**Where it lives:**
- NH-011 (SMS abandoned-cart at 30 minutes — Success, est $22k → actual $28k)
- NH-012 (SMS win-back, lapsed 90-day — Jackpot, est $30k → actual $34k)
- GC-002 (SMS browse-abandon for PDP viewers — Success, est $18k → actual $24k)
- PS-010 (SMS marketing program launch — Draft, not yet started)

Two brands have SMS working and measured. The third has it sitting in a drawer.

**What surfaces it:**
- Library → Synthesize learnings → **Gaps** section should name Peak Season explicitly
- Signal AI debate → the CGO persona will likely raise Peak Season's missing retention lever
- "Do Next" should produce a concrete `Peak Season → SMS program → why now` line

**Demo line:** "Watch — the library doesn't just list what worked. It names where one brand is missing a play that's already proven at the other two."

---

## 2. Paid social creative fatigue (and the brand that avoided it)

**Where it lives:**
- NH-013 (UGC creative scale on Meta — Killed, est $90k → actual **-$12k**)
- GC-004 (home-barista lifestyle scale on Meta + TikTok — Killed, est $50k → actual **-$8k**)
- PS-003 (paid social with weekly season-synced creative refresh — Success, est $40k → actual **+$52k**)

Two brands burned $20k of real spend against $140k of forecast revenue, on the same root cause. The third ran the inverse hypothesis and beat its estimate.

The seed makes the connection explicit rather than leaving it to be inferred: GC-004 links to NH-013 and its notes read *"Same pattern as Northcove's NH-013 — creative fatigue without refresh pipeline."* PS-003 links to **both** and was, per its notes, *"designed in direct response to the Northcove and Grounds Control paid-social burns."*

**What surfaces it:**
- Library → Patterns should identify creative *operations* as the constraint, not creative quality
- Signal AI → the CFO persona will likely flag the forfeited spend; CMO/CGO will likely defend the refresh cadence as the unlock

**Demo line:** "Two brands burned on the same mistake. The third didn't, and the difference was operational, not creative. That's cross-brand learning a dashboard can't give you."

---

## 3. Calibration spread

Across the 23 closed initiatives that carry a measured actual:

- **Total estimated: $516k. Total actual: $432k. Calibration ratio: 84%.**
- **Win rate: 61% (14 of 23).**

**Under-promises** (actual beat estimate): NH-011, NH-012, NH-014, GC-002, GC-003, GC-008, GC-011, PS-001, PS-003, PS-004, PS-007, PS-009

**Over-promises** (actual well short): NH-013 (catastrophic), NH-015, NH-016 (catastrophic), GC-004 (catastrophic), GC-006, GC-010, PS-008

**Close calls:** GC-005 ($20k → $19k), NH-009 (a rejected scale, -$60k as predicted)

**What surfaces it:**
- Dashboard → the calibration score lands mid-range, with the chart showing both over- and under-shoots
- "View calibration history" → texture, not a single clean trend line

**Demo line:** "The calibration score isn't 100%, and that's the point. This view is what makes the team better at scoring next quarter's bets."

---

## 4. Blocked initiatives with named dependencies

Two, and they are blocked in different ways — worth showing both.

**PS-005** (activity-based personalisation engine — Blocked) links to **PS-006** (Peak Season site replatform Phase 1 — Running). Its notes name the dependency and the window: *"depends on Peak Season site replatform reaching Phase 1 milestone… earliest unblock: late July."* PS-006 links back, and carries $0 revenue impact by design — it is foundational work that unblocks personalisation, A/B infrastructure and content velocity downstream.

**NH-017** (subscribe & save for consumables — Blocked) is the harder case: it is blocked on an inventory system upgrade that **is not tracked in the portfolio at all**. Its notes say so plainly.

**What surfaces it:**
- Signal AI → `get_blocked_initiatives` returns both, with the dependency named
- The debate should connect the replatform timeline to the unblock window for PS-005, and should notice that NH-017's blocker has no owner anywhere in the system

**Demo line:** "The agents don't just see what's running — they see what's blocked, and what it's blocked on. One of these is waiting on something that isn't even on the board yet."

---

## 5. The thoughtful failure (post-mortem demo)

**Where it lives:** NH-016 (PDP reviews module above the fold — Failed, est $44k → actual -$12k)

Ran clean, hit significance, and the hypothesis was simply wrong. The post-mortem explains *why* and produces the next hypothesis rather than stopping at "it didn't work":

> The hypothesis was wrong. Reviews above the fold compete with hero imagery on home decor — buyers are visual-first, and pushing reviews up demotes the product photo that's doing the heavy lifting.

Decision: roll back, re-test with reviews below hero and above the price block.

**What surfaces it:**
- Library → Lessons should carry this as a "what failed and the forward read"
- Detail view → a readable post-mortem, the kind of entry that signals what disciplined experimentation looks like

**Demo line:** "Every other experimentation tool pretends failure doesn't happen. The library is structured to *keep* the failures, because the post-mortem is the asset."

---

## 6. Cross-brand learning carry-over

Three Drafts in the seed are explicitly grounded in another brand's closed work, so ranking them should be visibly evidence-led rather than arbitrary:

- **PS-010** (SMS Draft) links NH-011, NH-012 and GC-002. Its notes carry the specifics forward: the 2-hour delay window from GC-002, the tiered-incentive insight from NH-012.
- **GC-009** (replenishment subscription Draft) links NH-017, to share infrastructure once that unblocks — and notes that replenishment revenue is DTC-margin, worth roughly double the equivalent wholesale.
- **PS-002** (checkout simplification Draft) links PS-001, building on its own brand's proven technical-trust result.

**What surfaces it:**
- Library → Do Next should rank Drafts higher when prior evidence exists at a sister brand
- Signal AI synthesis → should cite the linked learnings when proposing new initiatives

---

## 7. The ad account, and the eight ways it is broken on purpose

Everything above this section is the experiment ledger — the half of the product
that GrowthLab, GrowthOrange and GrowthEX also ship. This section is the other
half, and it is the one to demo first.

`Performance` is populated on arrival. Nothing has to be imported to reach it,
and a visitor who opens the link unaccompanied lands on a parsed account rather
than on an empty state and an Import button.

**Where it lives:** `SEED_AD_ACCOUNT_AUTHORED` in `src/config.demo.js`, rebased
onto today's timeline by `buildSeed` and parsed at load by `annotateRow`.

### The rows are authored raw and parsed live

No seeded row carries `parsed`, `values` or `parseErrors`. Those come from the
schema resolved at load, so every figure below is computed by the same code path
a client's CSV takes. This matters more than it sounds: a seed that shipped its
own parse results could claim a name parsed when the live parser refuses it,
which is the one thing this demo cannot afford to get wrong. Change a vocabulary
in Settings → Taxonomy and the parse rate on this page moves.

### The headline figures

| | |
|---|---|
| Rows | 44 |
| Spend / revenue / ROAS | $150k · $445k · 2.97x |
| **Attributed** | 36 rows, $127k — joined to an initiative |
| **Untagged** | 4 rows, $15k — no tag in the name, normal BAU |
| **Broken links** | 1 row, $3k — carries a tag resolving to nothing |
| **Unparsed** | 3 rows, $6k — name fits no template |

Two counts of "unparsed" appear on this page and they are not the same number.
Seven names fail to parse; only three are unattributed. The other four are
pre-convention names attributed by hand claim — unparseable and attributed,
which is the entire reason two independent bridges exist.

### The eight planted cases

| # | Case | Where to look |
|---|---|---|
| 1 | Clean parse, joined by the tag slot | NH-013, GC-004, GC-006, PS-003 in *Measured performance by initiative* |
| 2 | Legacy names joined by hand claim | NH-005 and GC-003, labelled `claimed name` rather than `tracking tag` |
| 3 | A claim on a campaign inherits to its ads | NH-005 claims `2026_Q1_prospecting_v2`; the two ad rows under it attribute |
| 4 | Wrong segment count — refused, not guessed | *Needs a look*: "Expected 11 slots for meta/ad, found 10" |
| 5 | The delimiter inside a value | `Meta_Col_Emma_Brune_…` → 12 slots, and a cascade of wrong vocabulary errors behind it |
| 6 | A value outside a controlled vocabulary | Theme `Cozy`, right shape and still refused |
| 7 | A tag that resolves to nothing | `NH-099`, named as a broken link rather than counted as attributed |
| 8 | Untagged business-as-usual spend | Trailing `NA`, correctly joined to nothing |

Two more live on the initiative records rather than in the export: NH-005 and
NH-009 both claim the Q1 prospecting campaign (a conflict, resolved
first-wins and reported rather than arbitrated silently), and NH-005 claims a Q4
retargeting campaign absent from this window (reported as claimed-but-absent —
`3/4 found in this data`).

### What the account says that the ledger cannot

NH-013 and GC-004 are the two paid-social burns the library already describes in
post-mortem prose. Here they are in spend: NH-013 at 2.17x and GC-004 at 1.84x,
against PS-003 — the refresh-cadence discipline designed in response to both —
holding 3.27x over a longer window. GC-006, the micro-creator pilot, returns
4.43x on $8k in the same account and the same weeks as GC-004's burn. Break the
account down by `handle` and the difference between `Col` and `LF` is visible
before anybody reads a learning.

**Demo line:** "Every experiment tracker can tell you that test failed. This one
can tell you it failed at 1.84x while the pilot beside it ran at 4.43x, because
the ad names carried the link and nobody typed any of it in."

**Second demo line, for the defects:** "The fabricated data isn't here to flatter
the tool. It's designed to break it in eight ways, and what you're looking at is
the tool refusing to guess."

### Scope of the export

This is the paid-social and owned-channel slice, not the whole account: roughly
$150k against a portfolio spending far more per week in Weekly Pulse. That is
what a real export looks like when someone pulls the campaigns relevant to a
question, and it is why the two figures are not meant to reconcile.

---

## 8. The learning agenda — the layer above the ledger

`Agenda` opens on six questions rather than an empty state. This is the answer
to the sharpest fair objection a demo attracts — *"this is a nicely structured
list of things you were going to do anyway"* — so it is worth reaching before
the initiative register, not after.

**Where it lives:** `SEED_AGENDA_AUTHORED` in `src/config.demo.js`, with
`AGENDA_LADDER` in the same file mapping which experiments ladder up to which
question.

These are **authored, not generated**, and the distinction is load-bearing.
`seedInitiativeFromAgenda` is deterministic by design (see the reasoning in
`services/learningAgenda.js`): a question with no evidence behind it is precisely
where a model produces confident filler. Naming the question is the judgement
being sold, so the seed writes it the way an operator would.

| Status | Count | What it demonstrates |
|---|---|---|
| Answered | 2 | A question the portfolio actually closed out |
| Open | 3 | Two of which carry a closed result, raising the "worth marking Answered" nudge — the system notices, the human decides |
| Parked | 1 | A good question shelved on a real dependency, with the reason attached |

**15 of 38 initiatives ladder up. The rest deliberately do not.** A back-filled
portfolio where every historical experiment traces neatly to a pre-existing
question is one somebody tidied afterwards. NH-016 is the pointed example: it
tested the same PDP surface as the open Conversion question and is left
unlinked, because it ran before the question was framed.

**Demo line:** "Every one of these is a question with a stated falsifying result
and a sample guidance. The experiments underneath aren't a backlog — they're how
the question gets answered, and two of them cost about $80k of media to answer.
That's what makes 'did any of this teach us anything' a query rather than an
argument."

---

## 9. The sample account — the first meeting, on a prospect's data

`Performance → Account audit → Load a sample account` fills the box with 70 ad
names from a fictional prospect's account **as found**. This is a different
artefact from §7's seeded account: that one follows the convention because this
tool built it; this one is what is actually sitting in an Ads Manager before
anybody arrives. The audit exists to price the gap between them.

**Where it lives:** `SAMPLE_ACCOUNT_NAMES` in `src/config.demo.js`.

What it produces, and why each number is worth pausing on:

| Finding | Value | The point |
|---|---|---|
| Delimiter | `\|`, schema uses `_` | Not a setting to change — changing it invalidates every name already built |
| Dominant shape | 6 slots, 37% | And four other shapes at similar weight: several conventions layered over time |
| Parse rate | **0%** across all six templates | All 70 failing on slot count, none on vocabulary — the expensive end of the estimate |
| Retrofit | **70 names, 100%** | These cannot be renamed without resetting the learning phase, so each is a mapping decision |

The slot table is the part to slow down on. Two slots resolve cleanly (Geo 100%,
Format 100%), two resolve to nothing — and **slot 3 reads as "Age · 80.8%" and
that is wrong.** It matches because `Broad` happens to sit in the age
vocabulary; the slot is plainly an audience slot. That is not a bug to tune out
of the sample. It is the clearest possible demonstration of what "reports
evidence and refuses to propose a taxonomy" means in practice: the tool offers
coverage figures, and a person decides what the slot is. A tool confident enough
to auto-assign that slot would have been confidently wrong, silently, in a
client's first week.

**Demo line:** "Seventy names, none of them parse, all seventy need mapping by
hand. Two slots the tool is sure about, two it has nothing to say about, and one
it's 81% confident about and wrong. That last one is why the implementation is
priced the way it is."

---

## What's missing on purpose

Some categories are deliberately thin, so the library doesn't read as "we have a play for everything."

- **Organic** — declared in `CATEGORIES` and carrying **zero** initiatives. A visible hole in the portfolio, and Signal AI will usually name it. Note the tension worth pointing at: PS-008 wound down organic TikTok in favour of paid, so the gap is a decision the portfolio made, not an oversight.
- **Brand** — 3 initiatives, none of them a clean win: GC-010 (live cupping, Failed — production cost exceeded return), PS-008 (founder-led TikTok, Inconclusive — the one hit was an unscripted failure clip, implying format matters more than founder presence), NH-010 (homepage hero redesign, still a Draft). Reads as "we've tried, we haven't cracked it."
- **Data / Analytics** — 1 initiative (PS-006, the replatform), and it carries $0 revenue impact. Useful for showing that not every initiative is scored on revenue.

These are demo features, not gaps to fill.

---

## Keeping this document honest

Every ID, figure and ratio above is derived from `src/config.demo.js`. Editing the seed can invalidate this file silently — which is exactly what happened once already, when the brands were renamed from Retailer 1 / Retailer 2 to Grounds Control / Peak Season and 17 of the 24 IDs cited here stopped existing.

If you change the seed, re-derive rather than patch. The counts above come straight from `SEED`: closed-with-actuals for the calibration ratio, `linkedIds` for the carry-over chains, and a category tally for the thin-on-purpose section.
