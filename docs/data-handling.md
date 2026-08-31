# Data handling

What this workspace holds, where it lives, what leaves it, and what it refuses.

This document exists to be handed to a prospect. It is written to be checkable
against the source rather than believed — every claim below names the file that
enforces it.

Last reviewed: August 2026.

---

## The contract

**This workspace holds aggregates about ad entities. It does not hold people.**

A record may describe a campaign, an ad set, an ad, a brand-week, or an
experiment. It may carry spend, impressions, clicks, conversions, revenue,
dates, and the dimensions parsed out of an entity's name.

It may not carry an email address, a phone number, a person's name, a street
address, a customer or profile id, a device or advertising id, an IP address, or
a date of birth.

Enforced in [`src/services/dataSafety.js`](../src/services/dataSafety.js) and
tested in `dataSafety.test.js`, including a test that runs a real export
containing personal columns through the importer and asserts none of it reaches
a stored row.

**Age, gender, country, city, region and placement are allowed**, because in a
platform export those are audience cohorts on a breakdown row rather than facts
about an individual. That exception is an explicit allowlist, not a gap in the
rules.

### Why the line is drawn here and not somewhere else

Three things are true only because of it:

1. **A security review has a one-sentence answer.** "It never receives personal
   data" ends a conversation that "it receives personal data and protects it
   carefully" begins.
2. **Browser storage was a defensible home, and Postgres is a smaller step than
   it looks.** Browser storage on an operator's laptop is an entirely reasonable
   place for campaign spend aggregates and an indefensible one for a customer
   list. Since Phase 2.0 a signed-in workspace lives in Supabase Postgres under
   RLS instead — and the contract is what makes that a routine move rather than a
   DPA conversation, because what travels is still only aggregates.
3. **AI prompts carry nothing personal.** Every model call is built from
   initiatives, learnings, briefs and aggregate metrics. No prompt has personal
   data in it because no store has personal data in it, which keeps the AI
   features out of the DPA argument rather than inside it with mitigations.

### Regulated verticals

The same line is what would let this be sold into health, finance or any other
regulated sector without the compliance programme that handling personal data
there requires: the product stays above the line by refusing to hold anything
below it. A prospect whose marketing questions can be answered from campaign
aggregates is servable as-is, under a contract stating that regulated personal
data never enters the workspace. A prospect who needs individual-level data in
the tool is not a customer for this architecture, and the correct answer is to
say so rather than to widen the contract.

---

## Where the data lives

| What | Where | Notes |
|---|---|---|
| Initiatives, settings, learnings, weekly metrics, performance rows | Supabase Postgres when the workspace is signed in — documents per `gos_*` key, performance facts as rows, both scoped by RLS to workspace membership. `localStorage` otherwise, under the same keys | Signed in: encrypted at rest by the provider, reachable from any machine a member signs in from. Signed out: single device, unencrypted beyond OS disk encryption. The app states which of the two applies. |
| JSON backups | Wherever the operator saves the download | The only off-device copy today. |
| AI prompts and responses | Sent to the configured model provider through `api/proxy.js` | Not retained by this application. Retention is the provider's, under their terms. |
| Generated images | In memory, session only | Deliberately not persisted — see DECISIONS.md. |
| Nothing else | — | There is no application database, no analytics on portfolio content, no server-side copy of workspace data. |

The proxy is a transport. It forwards a request to a model provider and returns
the response; it does not read, log or store workspace content.

---

## What leaves the browser

Only two things:

1. **Model calls.** The debate, Next Plays, creative briefs, hypothesis
   expansion, the library search. Each sends the portfolio context that call
   needs — initiative titles, hypotheses, learnings, aggregate metrics, brand
   briefs. All of it is business content and none of it is personal data.
2. **What the operator exports.** CSV exports, JSON backups, the client readout.
   These are actions, not background behaviour.

Nothing is transmitted on a schedule. Nothing is transmitted on load.

---

## What the importers refuse

Both CSV importers read only the columns they recognise, and any column carrying
personal data is identified, dropped, and reported to the operator by name
before the import is confirmed.

The reported message says three things deliberately, in this order: it was not
imported, here is what it was, and **the export file on your disk still contains
it**. The product cannot delete a file in a downloads folder, and a message that
implies otherwise would be the comfortable version and the harmful one.

The same guard is the chokepoint for any future API connector
(`stripPersonalFields`), so a connector cannot introduce personal data by
constructing rows in a different shape.

---

## Backups and loss

Until Phase 2.0, a cleared browser profile loses the workspace. Two mitigations
are in place and neither is a substitute for the migration:

- A **write-failure banner**. When a durable write fails — a full quota, a
  private window — the app says so and offers a one-click backup, rather than
  silently falling through to memory and losing everything on reload.
- A **backup reminder**, at seven days in a live workspace and fourteen in a
  demonstration one. A workspace that has *never* been backed up is told
  immediately, which is the case the previous version of this check stayed
  silent for.

---

## Retention and deletion

There is no server-side retention because there is no server-side copy. To
delete a workspace, clear the browser's site data and delete the JSON backups.
That is the entire footprint.

When Phase 2.0 moves persistence to Postgres, this section acquires a retention
schedule, a deletion procedure with a stated timeline, and a subprocessor list.
It is written now so the change is a revision rather than a first draft under
deal pressure.

---

## Known limitations, stated rather than omitted

- **No access control INSIDE a workspace.** Membership is all-or-nothing: every
  member reads and writes everything in it. Row-level isolation is per workspace,
  not per person or per initiative.
- **Single device when signed out.** A workspace that has never been signed in to
  lives in one browser, and the app says so rather than implying otherwise.
- **Unencrypted at rest** beyond whatever the operating system provides.
- **Performance rows are capped at 5,000 in the browser store only**, oldest
  dropped on merge with the count reported. A signed-in workspace has no cap —
  that removal was the forcing condition for Phase 2.0.
- **A failed chunk during a performance replace leaves fewer rows than it found.**
  The delete has happened and part of the insert has not. It is reported rather
  than silent, and the full set is still in memory for that session; a
  transactional version needs a staging table and belongs with Phase 5.4.
- **Model providers are subprocessors** in every sense except the paperwork,
  which does not exist yet because no client contract has required it. The data
  they receive is business content, never personal data.
