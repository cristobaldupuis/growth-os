# Seed data — planted demo patterns

This is a reference for the demo. Each pattern below is something the AI features in Growth OS should surface from this data — useful to know what to click on during a client call.

## 1. SMS as a portfolio gap

**Where it lives:**
- NH-011 (SMS abandoned-cart, Success, $28k)
- NH-012 (SMS win-back, Jackpot, $34k)
- R1-002 (SMS browse-abandon, Success, $24k)
- R2-010 (SMS marketing program — Draft, not yet launched)

**What surfaces it:**
- Library → Synthesize learnings → **Gaps section** should call out R2 explicitly
- Signal AI debate → CGO will likely raise R2's lack of SMS as a missed retention lever
- The "Do Next" section should produce a concrete `Retailer 2 → SMS program → Why now` line

**Demo line:** "Watch — the library doesn't just list what worked. It names where one retailer is missing a play that's already proven at another."

---

## 2. Paid social creative fatigue (and how R2 avoided it)

**Where it lives:**
- NH-013 (UGC scale, Killed, -$12k, lost $90k in projected revenue)
- R1-004 (Lifestyle scale, Killed, -$8k, same root cause)
- R2-003 (Refreshed creative weekly, Success, +$52k — the inverse)

**What surfaces it:**
- Library → Patterns section should identify creative-ops as the constraint, not creative quality
- Signal AI → CFO will likely flag the $98k of failed paid spend; CMO/CGO will likely defend R2's approach as the unlock

**Demo line:** "Two brands burned on the same mistake. The third brand didn't, and the difference was operational, not creative. That's the kind of cross-brand learning that doesn't surface in a dashboard."

---

## 3. Calibration spread

**Where it lives across all initiatives:**
- Under-promises (actual > estimate): NH-011, NH-012, NH-014, R1-002, R1-003, R1-008, R2-003, R2-004, R2-007, R2-009
- Over-promises (actual << estimate): NH-013 (catastrophic), NH-015, NH-016, R1-004 (catastrophic), R1-006, R1-010 (catastrophic), R2-008
- Close calls: R1-005, R1-011, R2-007

**Calibration ratio across new completed items:** 0.69 (real-world style).

**What surfaces it:**
- Dashboard → Calibration score should land mid-range, with the chart showing both over- and under-shoots
- "View calibration history" → texture, not a single trend line

**Demo line:** "The calibration score isn't 100%, and that's the point. This view is what makes the team better at scoring next quarter's bets."

---

## 4. Blocked initiative with named dependency

**Where it lives:**
- R2-005 (Personalization engine — Blocked)
- Depends on R2-006 (R2 site replatform Phase 1 — Running)

**What surfaces it:**
- Signal AI → calling `get_blocked_initiatives` returns R2-005 with the dependency named
- The debate should connect the replatform timeline to the unblock window

**Demo line:** "The agents don't just see what's running — they see what's blocked, and what it's blocked on. They can reason about sequencing across initiatives."

---

## 5. The thoughtful failure (post-mortem demo)

**Where it lives:**
- NH-016 (Reviews above the fold — Failed cleanly)

**Why it matters:**
- Ran clean, hit significance, hypothesis was wrong
- Post-mortem is substantive — explains *why* and produces a new hypothesis (try below hero, above price)

**What surfaces it:**
- Library → Lessons section should reference this as a "what failed and the forward read"
- Detail view → readable post-mortem; the kind of entry that signals to a prospect what disciplined experimentation looks like

**Demo line:** "Every other experimentation tool pretends failure doesn't happen. The library is structured to *keep* the failures, because the post-mortem is the asset."

---

## 6. Cross-brand learning carry-over

**Where it lives:**
- R2-010 (SMS Draft) explicitly references the NH-011 / R1-002 learnings in its notes
- R1-009 (Subscribe-and-save Draft) links to NH-017 (Subscribe-and-save Blocked) — share infrastructure once unblocked

**What surfaces it:**
- Library → Do Next section should rank Drafts higher when there's prior evidence at sister brands
- Signal AI synthesis → should reference the linked learnings when proposing new initiatives

---

## What's missing on purpose

Some categories are deliberately thin so the library doesn't read as "we have a play for everything":

- **Brand** category — 2 initiatives, both failures (R1-010 live shopping, R2-008 TikTok). Reads as "we've tried, haven't cracked it." Honest demo asset.
- **Organic** category — 0 new initiatives. Visible gap in the portfolio. Signal AI will probably name it.

Both of these are demo features, not bugs.
