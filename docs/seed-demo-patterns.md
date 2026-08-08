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
