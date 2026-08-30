// -- The demo fixtures are still what the demo notes say they are --------------
//
// docs/seed-demo-patterns.md documents each planted defect and the figure it
// produces, and that document has already been silently invalidated once — when
// the brands were renamed, 17 of the 24 ids it cited stopped existing and
// nothing failed. The seed is a fixture with expected outputs, so it gets tests
// like any other fixture.
//
// These assert behaviour, not arithmetic: that a name with a dropped slot is
// refused rather than guessed at, that a hand claim attributes a name the parser
// cannot read, that a tag pointing at nothing is reported instead of counted.
// Spend totals are deliberately not pinned — re-authoring the narrative should
// not fail the build, but losing a failure mode should.

import { test } from "node:test";
import assert from "node:assert/strict";

import { SEED, SEED_AD_ACCOUNT, SEED_NAMING_CUSTOM, SEED_AGENDA, SAMPLE_ACCOUNT_NAMES } from "../config.demo.js";
import { DEFAULT_SETTINGS } from "../constants.js";
import { resolveSchema, assignedNameConflicts, adNamesOf } from "./naming.js";
import { annotateRow, attachInitiatives, rollupByInitiative } from "./performance.js";
import { agendaRollup, AGENDA_STATUSES } from "./learningAgenda.js";
import { auditAccount, extractNames } from "./accountAudit.js";

const settings = { ...DEFAULT_SETTINGS, namingCustom: SEED_NAMING_CUSTOM };
const schema   = resolveSchema(settings);
const rows     = SEED_AD_ACCOUNT.map(r => annotateRow(r, schema));
const attached = attachInitiatives(rows, SEED, schema);

const byAttribution = (kind) => attached.rows.filter(r => r.attribution === kind);
const errorsFor = (fragment) =>
  rows.filter(r => r.name.includes(fragment)).flatMap(r => r.parseErrors || []).join(" ");

test("the seed ships raw rows: no authored parse results", () => {
  // The whole contract. A seed asserting `parsed: true` could claim a name
  // parsed that the live parser refuses.
  SEED_AD_ACCOUNT.forEach(r => {
    assert.equal("parsed"      in r, false, `${r.name} ships a parse result`);
    assert.equal("values"      in r, false, `${r.name} ships parsed values`);
    assert.equal("parseErrors" in r, false, `${r.name} ships parse errors`);
  });
});

test("the account is populated, and most of it parses", () => {
  assert.ok(rows.length >= 40, "the seeded account should be big enough to pivot");
  const parsed = rows.filter(r => r.parsed).length;
  assert.ok(parsed / rows.length > 0.75, "most names should parse — the defects are the minority");
});

test("case 1: names carrying a tracking tag join to their initiative", () => {
  const viaTag = attached.rows.filter(r => r.attributionVia === "tag");
  assert.ok(viaTag.length > 20, "the tag slot should be carrying most of the attribution");
  const tags = new Set(viaTag.map(r => r.trackingTag));
  ["NH-013", "GC-004", "PS-003", "GC-006"].forEach(tag =>
    assert.ok(tags.has(tag), `${tag} should have spend joined by tag`));
});

test("case 2 and 3: a hand claim attributes names the parser cannot read", () => {
  const viaName = attached.rows.filter(r => r.attributionVia === "name");
  assert.ok(viaName.length > 0, "the claim bridge should be carrying spend");
  // The point of the second bridge: unparseable and attributed anyway.
  assert.ok(viaName.some(r => !r.parsed),
    "at least one claimed row should be a legacy name the parser refuses");
  // And the claim is on the campaign, so the ads inside it inherit it.
  assert.ok(viaName.some(r => r.assignedName === r.campaignName && r.assignedName !== r.name),
    "a claim on a campaign should attribute the ads underneath it");
});

test("case 4: a dropped slot is refused, not guessed at", () => {
  const errs = errorsFor("WarmNeutrals_Candles_Static_NH-018");
  assert.match(errs, /found 10/, "the short name should be reported by slot count");
  assert.match(errs, /NA/, "and should say that an absent value is written NA");
});

test("case 5: the delimiter inside a value breaks the name loudly", () => {
  const errs = errorsFor("Emma_Brune");
  assert.match(errs, /found 12/, "a delimiter inside a value should overshoot the slot count");
});

test("case 6: a value outside a controlled vocabulary is refused", () => {
  const errs = errorsFor("_Cozy_");
  assert.match(errs, /Cozy/, "the offending value should be named");
  assert.match(errs, /controlled list/, "and identified as a vocabulary failure");
  // Distinct from the count failures above: right shape, wrong word.
  assert.doesNotMatch(errs, /Expected 11 slots/);
});

test("case 7: a tag resolving to nothing is a broken link, not attributed spend", () => {
  const broken = byAttribution("unmatched");
  assert.equal(broken.length, 1);
  assert.equal(broken[0].trackingTag, "NH-099");
  assert.ok((broken[0].metrics.spend || 0) > 0, "the broken link should carry spend worth naming");
  assert.equal(SEED.some(i => i.trackingTag === "NH-099"), false,
    "NH-099 must stay absent from the portfolio or this case evaporates");
});

test("case 8: untagged business-as-usual spend joins to nothing, correctly", () => {
  const untagged = byAttribution("untagged");
  assert.ok(untagged.length > 0, "an account with no BAU spend is not a real account");
  untagged.forEach(r => assert.equal(r.initiativeId, null));
});

test("every unparsed row is still counted, and its spend named", () => {
  // Rule 5: a total that excludes spend must say so.
  const unparsed = byAttribution("unparsed");
  assert.ok(unparsed.length > 0);
  const unparsedSpend = unparsed.reduce((a, r) => a + (r.metrics.spend || 0), 0);
  assert.ok(unparsedSpend > 0, "unparsed spend should be non-zero and reportable");
  const total = attached.rows.reduce((a, r) => a + (r.metrics.spend || 0), 0);
  const split = Object.values(attached.spend).reduce((a, v) => a + v, 0);
  assert.equal(Math.round(split), Math.round(total), "the four-way split must account for every dollar");
});

test("two initiatives claim one name, and the collision is reported", () => {
  const clashes = assignedNameConflicts(SEED);
  assert.equal(clashes.length, 1, "exactly one planted conflict");
  const ids = clashes[0].initiatives.map(i => i.initId).sort();
  assert.deepEqual(ids, ["NH-005", "NH-009"]);
});

test("one claimed name is absent from the export, and stays absent", () => {
  const present = new Set(rows.flatMap(r => [r.name, r.campaignName, r.adsetName].filter(Boolean)));
  const missing = SEED.flatMap(i => adNamesOf(i).filter(a => !present.has(a.name)).map(a => [i.initId, a.name]));
  assert.equal(missing.length, 1, "exactly one planted claimed-but-absent name");
  assert.equal(missing[0][0], "NH-005");
});

test("the burn, the pilot and the discipline are all readable from spend alone", () => {
  // The demo's central contrast, asserted so a re-authored narrative cannot
  // quietly invert it. GC-004 and GC-006 ran in the same account in the same
  // weeks; the tool should be able to tell them apart without reading a
  // post-mortem.
  const roas = Object.fromEntries(
    rollupByInitiative(rows, SEED, schema).groups
      .filter(g => g.metrics.spend > 0)
      .map(g => [g.initiative.initId, g.metrics.revenue / g.metrics.spend]));
  assert.ok(roas["GC-006"] > roas["GC-004"], "the micro-creator pilot should beat the scale burn");
  assert.ok(roas["PS-003"] > roas["NH-013"], "the refresh discipline should beat the UGC scale push");
  assert.ok(roas["NH-013"] < 2.5 && roas["GC-004"] < 2.5, "both burns should read as burns");
});

test("every initiative carries an attribution socket", () => {
  SEED.forEach(i => assert.ok(i.trackingTag, `${i.initId} has no trackingTag`));
});

// -- The learning agenda -------------------------------------------------------

test("the agenda is populated, and spans the statuses it is meant to", () => {
  assert.ok(SEED_AGENDA.length >= 5, "an agenda with two questions is not a research programme");
  SEED_AGENDA.forEach(a => {
    assert.ok(AGENDA_STATUSES.includes(a.status), `${a.id} has status ${a.status}`);
    assert.ok(a.question && a.falsifyingResult,
      `${a.id} must name a question and what would falsify it — the whole point of the layer`);
  });
  const statuses = new Set(SEED_AGENDA.map(a => a.status));
  assert.ok(statuses.has("Answered"), "at least one question should have been answered");
  assert.ok(statuses.has("Open"),     "at least one should still be open");
  assert.ok(statuses.has("Parked"),   "a programme that never shelves a question is not a programme");
});

test("every laddered initiative points at a question that exists", () => {
  const ids = new Set(SEED_AGENDA.map(a => a.id));
  SEED.filter(i => i.agendaId).forEach(i =>
    assert.ok(ids.has(i.agendaId), `${i.initId} ladders up to missing agenda item ${i.agendaId}`));
});

test("a laddered initiative belongs to its question's brand", () => {
  const brandOf = Object.fromEntries(SEED_AGENDA.map(a => [a.id, a.brandId || "default"]));
  SEED.filter(i => i.agendaId).forEach(i =>
    assert.equal(i.brandId || "default", brandOf[i.agendaId],
      `${i.initId} ladders up to a question belonging to another brand`));
});

test("every question has evidence under it, and some of it has closed", () => {
  const rolled = agendaRollup(SEED_AGENDA, SEED);
  rolled.forEach(r => assert.ok(r.linkedCount > 0, `"${r.question.slice(0, 40)}…" has no experiments under it`));
  assert.ok(rolled.some(r => r.hasAnswer && r.status === "Open"),
    "at least one open question should carry a closed result, so the 'worth marking Answered' nudge is demonstrable");
  assert.ok(rolled.some(r => r.closedCount === 0),
    "at least one question should still be waiting on its first result");
});

test("most of the portfolio does not ladder up, and that is deliberate", () => {
  // A back-filled portfolio where every historical experiment traces neatly to a
  // pre-existing question is one somebody tidied after the fact.
  const laddered = SEED.filter(i => i.agendaId).length;
  assert.ok(laddered > 0 && laddered < SEED.length * 0.6,
    "the ladder should be partial — this is a portfolio with an agenda added to it, not one born under one");
});

// -- The sample account, for the audit tab ------------------------------------

test("the sample account is a different corpus from the seeded one", () => {
  const { names } = extractNames(SAMPLE_ACCOUNT_NAMES);
  assert.ok(names.length >= 50, "too small to produce a credible histogram");
  const seeded = new Set(SEED_AD_ACCOUNT.map(r => r.name));
  names.forEach(n => assert.equal(seeded.has(n), false,
    "the sample is an account as found; the seeded one is an account this tool built"));
});

test("the sample account uses a different delimiter, and the audit detects it", () => {
  const { names } = extractNames(SAMPLE_ACCOUNT_NAMES);
  const audit = auditAccount(names, DEFAULT_SETTINGS);
  assert.equal(audit.delimiter.using, "|");
  assert.equal(audit.delimiter.matchesSchema, false,
    "the delimiter mismatch is the first finding of the meeting");
});

test("the sample account parses at zero, and every name needs mapping by hand", () => {
  const { names } = extractNames(SAMPLE_ACCOUNT_NAMES);
  const audit = auditAccount(names, DEFAULT_SETTINGS);
  audit.fit.forEach(f => assert.equal(f.parsed, 0, `${f.channel}/${f.level} should not parse a pre-convention account`));
  assert.equal(audit.retrofit.share, 1, "the retrofit figure is what the implementation is quoted from");
});

test("the sample account has real structure in some slots and none in others", () => {
  const { names } = extractNames(SAMPLE_ACCOUNT_NAMES);
  const audit = auditAccount(names, DEFAULT_SETTINGS);
  const matched   = audit.slots.filter(s => s.suggestions.length > 0);
  const unmatched = audit.slots.filter(s => s.suggestions.length === 0);
  assert.ok(matched.length >= 2,   "an account with no discipline anywhere is not the common case");
  assert.ok(unmatched.length >= 2, "and one where every slot resolves would not need the meeting");
  // The audit reports coverage rather than asserting a dimension, which is what
  // lets a confident-looking match still be wrong. Slot 3 here reads as "Age"
  // because "Broad" happens to be in that vocabulary; it is an audience slot.
  // Keeping that in the sample is the point — the tool offers evidence and the
  // human decides, which is exactly what "refuses to propose a taxonomy" means.
  assert.ok(audit.slots.some(s => s.suggestions.some(g => g.coverage > 0.5 && g.coverage < 1)),
    "a partial match should exist, so the demo can show a suggestion that is wrong");
});

test("the sample account contains the junk a real account contains", () => {
  const { names } = extractNames(SAMPLE_ACCOUNT_NAMES);
  const audit = auditAccount(names, DEFAULT_SETTINGS);
  const shapes = audit.histogram.filter(h => h.count > 0).length;
  assert.ok(shapes >= 5, "several conventions layered over time is the finding, not one clean shape");
  assert.ok(names.some(n => /copy of/i.test(n)), "a duplicated campaign");
  assert.ok(names.some(n => /test/i.test(n)),    "a test nobody cleaned up");
  assert.ok(names.some(n => /final/i.test(n)),   "and a FINAL v2");
});
