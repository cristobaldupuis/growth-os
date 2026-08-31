# Marketers Lab — commercial thesis

The purpose of this document is to make the business assumptions falsifiable, in
the same way the product asks its users to make marketing assumptions falsifiable.
Every number below is a prediction. Each one has a way of being wrong.

Last reviewed: August 2026.

---

## The one-line claim

> Every experiment should make the next one smarter.

What the product actually does that nothing else does: it joins an ad account's
own campaign names to the experiments that produced them, so performance rows
arrive already attached to the hypothesis they were testing.

---

## What is actually differentiated, and what is not

This matters more than any other section here, because it is where the honest
answer diverges from the flattering one.

**Not differentiated — table stakes.** Experiment tracking, hypothesis templates,
AI-generated experiment ideas, ICE prioritisation, post-mortems, and a searchable
learning library. Three funded products ship all of it:

| Product | Position |
|---|---|
| [GrowthLab](https://growth-experiments.com/) | AI experiment management, ICE + ROTI, Kanban, searchable learnings library |
| [GrowthOrange](https://growthorange.com/) | Experiment + learning velocity, compounding knowledge base, agency view |
| [GrowthEX](https://www.growthex.ai/) | AI-native growth marketing, GREX agent, aimed at startup GTM |

Any pitch built on "we remember what you learned" is a pitch against three
incumbents who say the same sentence. Do not build the sale on the Library.

**Differentiated — the bridge.** The campaign nomenclature engine and what hangs
off it: an ordered segment schema with controlled vocabularies stored as data
(`settings.namingSchema`), a parser that refuses to guess on a segment-count
mismatch, a trailing `Initiative` segment carrying the tracking tag, and
`matchNamesToInitiatives` splitting a platform export three ways — attributed,
untagged BAU spend, and a tag that resolves to nothing. See `src/services/naming.js`
and `src/services/performance.js`.

None of the three competitors touch the ad account. They are experiment trackers
that a human updates. This one reads a Meta export and tells you which of your
experiments the spend belonged to. That is ecommerce-specific, unglamorous, and
the part that is hard to copy — because getting it wrong silently produces wrong
attribution rather than an error, which is a lesson a competitor has to learn the
expensive way.

**The adjacent tools are not competitors.** Triple Whale and Northbeam answer
"what happened." GrowthBook, Statsig and Eppo are product/engineering
experimentation infrastructure. Neither set is being displaced, and the pitch
should not claim otherwise — "we sit above your analytics, not instead of it" is
both true and easier to sell.

**The real substitute is Airtable or Notion plus a spreadsheet.** That is what the
prospect is using today, it is nearly free, and it already models the entities.
What it cannot do is parse 4,000 ad names into typed dimensions and join them to
experiments. Every demo should get to that moment quickly, because that is the
moment the substitute stops being adequate.

---

## ICP

**$5M–$50M ecommerce brand**, with:

- $100k+ monthly paid media spend
- 2–10 people touching growth
- an existing creative testing cadence
- an in-house paid media lead or a retained agency
- enough experiment volume that nobody remembers last quarter's results

**Explicitly not:** sub-$5M brands (no experiment volume, no budget), enterprise
(procurement cycle longer than the runway), product/engineering experimentation
teams (GrowthBook's buyer, not this one), and agencies **for now**.

**On agencies.** The multi-client maths is genuinely attractive and it is the
obvious distribution multiplier. It is deferred anyway, for one reason: agencies
buy on margin, not on insight. An agency will want per-client pricing that
converges toward $200–300/brand, and will treat the tool as a cost line to
compress at every renewal. Selling to brands first establishes what the thing is
worth; selling to agencies first establishes what it can be discounted to.
Revisit after the brand price is proven.

---

## Offer and pricing

**Implementation: $6,000–$7,500. Software: $1,500/month.**

The implementation fee is not a formality and should not be discounted to win the
first deal. It covers the work that makes everything else function:

1. Taxonomy design against the client's actual channels and product catalogue
2. Audit of the existing ad account — what is nameable, what is not
3. Historical experiment import and back-fill of the learning library
4. Brand briefs, north star, health metrics
5. Campaign→initiative mapping for live spend
6. Weekly operating cadence installed with the team

Item 2 is where the hours go and it is consistently underestimated. A live ad
account has years of inconsistent names, and **the ones already running cannot be
renamed without resetting their learning phase** — so the retrofit is a mapping
exercise, not a rename. Budget 20–40 hours. Pricing this at $3,000 prices the work
below cost and sets an anchor that is very hard to raise later.

**Risk reversal, offered deliberately:** if at the end of 30 days the client does
not have a working taxonomy, an imported history, and a prioritised experiment
roadmap with kill criteria, the implementation fee is refunded. This is safe to
offer because all three are deliverables under the operator's control, and it
converts the buyer's real objection — "will this actually get set up, or become
another tool we abandoned" — into the seller's risk. Do not extend the guarantee
to outcomes; results depend on the client running the tests.

**Why not $299/month.** At that price the product is a tool, tools get cancelled
in budget reviews, and the implementation work is unfunded — which means it does
not happen, which means the taxonomy is never installed, which means the
differentiating feature never turns on. The low price is not a cheaper version of
this offer; it is a different offer that fails.

**The ROI framing to use in the room.** At $250k/month spend, killing two bad
tests a month earlier, avoiding one repeated failure a quarter, and finding one
winning angle faster is worth multiples of $18k/year. Sell decision quality, not
a ROAS lift claim — a ROAS claim is unprovable and invites an attribution
argument that has nothing to do with the product.

---

## The falsification test

**Three paying clients at $6,000 implementation + $1,500/month before the next
major build.** Not three pilots, three demos, or three letters of intent. Three
invoices paid.

Written as a prediction, in the product's own format:

> **Observation.** The experiment ledger, the calibration loop and the
> campaign↔experiment bridge are built and tested, and no client's real ad
> account has been through them.
>
> **Hypothesis.** We believe that installing a campaign taxonomy and an experiment
> ledger will be valuable enough to $5M–$50M ecommerce brands that three will pay
> $6,000 up front and $1,500/month, because the alternative is spreadsheet
> archaeology their team already complains about.
>
> **Success metric.** Three paid invoices.
>
> **Kill criteria.** Twenty qualified conversations with no close, or a pattern of
> closes only after the implementation fee is cut below $3,000. Either result says
> the problem is real but not painful enough at this price, and the response is to
> reposition — not to build more.

**What would make this test invalid:** running it on seeded data. The build flag
is no longer the tell — `config.js` ships `DEMO_MODE = false`, and since Phase 1.8
live-versus-demo is `settings.workspaceMode`, a property of the workspace rather
than of the bundle. The thing that has not changed is the one that matters: **no
real ad account has been through the naming parser.** Until one has been ingested
end to end, a demo shows the idea rather than the product, and a "no" cannot be
distinguished from a "not shown properly." ROADMAP 1.8 carries this as its
outstanding item; it is a prerequisite for the falsification test, not part of it.

---

## Honest constraints

**Capacity.** Implementation is operator-delivered. At 20–40 hours per client plus
ongoing weekly cadence, the practice saturates somewhere around 5–8 concurrent
clients — roughly $150k–$250k/year. That is a good consulting business and a poor
venture case, and the two ask for opposite decisions. This document assumes the
first. Anything justified only by the second — network effects, benchmarking,
autonomous execution — is out of scope until the first is working.

**The moat is the practice, not the code.** The repository is public and
DECISIONS.md already records the reasoning for accepting that. The prompts, the
taxonomy design judgement and the operating cadence are visible in source. What is
not copyable is the accumulated judgement about what a good taxonomy looks like for
a given catalogue, which is delivered by a person.

**Concentration.** At 5–8 clients, one churn is 15% of revenue. Price and
contract accordingly — annual terms on the software, not monthly.
