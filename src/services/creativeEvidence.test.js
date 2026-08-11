import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCreativeEvidence, formatEvidenceBlock, selectLearnings,
  THIN_SPEND_USD, THIN_ROWS, LEARNINGS_LIMIT,
} from "./creativeEvidence.js";
import { DEFAULT_NAMING_SCHEMA } from "./naming.js";

const S = DEFAULT_NAMING_SCHEMA;
const CTX = { channel: "meta", level: "ad" };

/** A row shaped the way parsePerformanceCSV emits them. */
const row = (name, metrics) => ({ name, metrics, ...CTX });

// Two angles, both real, with very different weight behind them.
const NAMES = {
  timeSaver: "Meta_Col_Emma_R3_F_Fitness_TimeSaver_Pastry_Chocolate_35s-Raw_NH-003",
  macroMath: "Meta_Col_Emma_R3_F_Fitness_MacroMath_Pastry_Chocolate_35s-Raw_NH-003",
  nostalgia: "Meta_Col_Emma_R3_F_Fitness_Nostalgia_Pastry_Chocolate_35s-Raw_NH-003",
};

test("evidence rolls up per creative dimension with recomputed ratios", () => {
  const rows = [
    row(NAMES.timeSaver, { spend: 6000, revenue: 12600, conversions: 300 }),
    row(NAMES.timeSaver, { spend: 6000, revenue: 12600, conversions: 300 }),
    row(NAMES.timeSaver, { spend: 2000, revenue: 4200,  conversions: 100 }),
    row(NAMES.macroMath, { spend: 5000, revenue: 4000,  conversions: 80 }),
    row(NAMES.macroMath, { spend: 5000, revenue: 4000,  conversions: 80 }),
    row(NAMES.macroMath, { spend: 2000, revenue: 1600,  conversions: 32 }),
  ];
  const ev = buildCreativeEvidence(rows, S);
  const angle = ev.dimensions.find(d => d.key === "angle");
  assert.ok(angle, "the angle dimension is the one a brief can act on");

  const ts = angle.groups.find(g => g.value === "TimeSaver");
  const mm = angle.groups.find(g => g.value === "MacroMath");
  // ROAS from summed numerator and denominator, never averaged across rows.
  assert.equal(ts.roas, 29400 / 14000);
  assert.equal(mm.roas, 9600 / 12000);
  assert.equal(ts.thin, false);
  assert.equal(mm.thin, false);
});

test("a group below the reporting floor is flagged, not deleted", () => {
  const rows = [
    row(NAMES.timeSaver, { spend: 14000, revenue: 29400, conversions: 700 }),
    row(NAMES.timeSaver, { spend: 14000, revenue: 29400, conversions: 700 }),
    row(NAMES.timeSaver, { spend: 14000, revenue: 29400, conversions: 700 }),
    // One row, trivial spend, spectacular ratio — exactly the shape that gets
    // cited as proof if it is handed over unmarked.
    row(NAMES.nostalgia, { spend: 180, revenue: 864, conversions: 12 }),
  ];
  const ev = buildCreativeEvidence(rows, S);
  const angle = ev.dimensions.find(d => d.key === "angle");
  const nostalgia = angle.groups.find(g => g.value === "Nostalgia");

  assert.ok(nostalgia, "a thin group is still reported — its absence would read as 'never tested'");
  assert.equal(nostalgia.thin, true);
  assert.ok(nostalgia.spend < THIN_SPEND_USD);
  assert.ok(formatEvidenceBlock(ev).includes("[THIN"));
});

test("many rows at trivial spend is still thin", () => {
  const rows = Array.from({ length: 10 }, () =>
    row(NAMES.nostalgia, { spend: 10, revenue: 60, conversions: 1 }));
  const ev = buildCreativeEvidence(rows, S);
  const g = ev.dimensions.find(d => d.key === "angle").groups[0];
  assert.ok(g.rows >= THIN_ROWS);
  assert.equal(g.thin, true, "row count alone does not clear the floor — spend has to as well");
});

test("no imported performance produces an honest block rather than silence", () => {
  const ev = buildCreativeEvidence([], S);
  assert.equal(ev.hasEvidence, false);
  const block = formatEvidenceBlock(ev);
  assert.match(block, /no performance data imported/i);
  assert.match(block, /evidenceGaps/);
});

test("rows that did not parse are counted in the block, not dropped from it", () => {
  const rows = [
    row(NAMES.timeSaver, { spend: 9000, revenue: 18000, conversions: 400 }),
    row(NAMES.timeSaver, { spend: 9000, revenue: 18000, conversions: 400 }),
    row(NAMES.timeSaver, { spend: 9000, revenue: 18000, conversions: 400 }),
    row("some_legacy_name_from_before_the_convention", { spend: 4000, revenue: 1000, conversions: 10 }),
  ];
  const ev = buildCreativeEvidence(rows, S);
  const angle = ev.dimensions.find(d => d.key === "angle");
  assert.equal(angle.unparsed, 1);
  assert.match(formatEvidenceBlock(ev), /did not parse/);
});

test("only creative-controllable dimensions are offered", () => {
  const rows = [row(NAMES.timeSaver, { spend: 9000, revenue: 18000, conversions: 400 })];
  const ev = buildCreativeEvidence(rows, S);
  const keys = ev.dimensions.map(d => d.key);
  // A brief cannot choose the channel or the handle, and offering them invites a
  // "recommendation" that is not a creative decision.
  assert.ok(!keys.includes("channel"));
  assert.ok(!keys.includes("handle"));
});

// -- Learnings selection ---------------------------------------------------------

const learning = (id, over = {}) => ({
  id, title: "t", learning: "l", outcome: "Success",
  category: "Conversion", brandId: "default", closedDate: "2026-01-01",
  actualRev: 1000, ...over,
});

test("nothing is excluded when the corpus fits", () => {
  const sel = selectLearnings([learning("e1"), learning("e2")], { brandId: "default", category: "Conversion" });
  assert.equal(sel.shown.length, 2);
  assert.equal(sel.excluded, 0);
  assert.equal(sel.total, 2);
});

test("the excluded remainder is counted rather than dropped silently", () => {
  // This is the bug: `learningsIndex.slice(0, 25)` on an unranked array, with
  // nothing anywhere saying the other 26 existed.
  const many = Array.from({ length: 51 }, (_, i) => learning("e" + i));
  const sel = selectLearnings(many, { brandId: "default", category: "Conversion" });
  assert.equal(sel.shown.length, LEARNINGS_LIMIT);
  assert.equal(sel.total, 51);
  assert.equal(sel.excluded, 51 - LEARNINGS_LIMIT);
  assert.ok(sel.rule.length > 0, "the rule is stated so a miss can be diagnosed");
});

test("the initiative's own brand and category rank first", () => {
  const all = [
    learning("other-brand",  { brandId: "r2", category: "Retention" }),
    learning("same-cat",     { brandId: "r2", category: "Conversion" }),
    learning("same-brand",   { brandId: "default", category: "Retention" }),
    learning("both",         { brandId: "default", category: "Conversion" }),
  ];
  const sel = selectLearnings(all, { brandId: "default", category: "Conversion" }, { limit: 4 });
  assert.deepEqual(sel.shown.map(l => l.id), ["both", "same-brand", "same-cat", "other-brand"]);
});

test("recency breaks ties within a rank", () => {
  const all = [
    learning("older", { closedDate: "2025-01-01" }),
    learning("newer", { closedDate: "2026-06-01" }),
  ];
  const sel = selectLearnings(all, { brandId: "default", category: "Conversion" });
  assert.deepEqual(sel.shown.map(l => l.id), ["newer", "older"]);
});

test("selection is deterministic — the same inputs give the same answer", () => {
  const all = Array.from({ length: 40 }, (_, i) =>
    learning("e" + i, { brandId: i % 2 ? "r2" : "default", closedDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
  const a = selectLearnings(all, { brandId: "default", category: "Conversion" });
  const b = selectLearnings(all, { brandId: "default", category: "Conversion" });
  assert.deepEqual(a.shown.map(l => l.id), b.shown.map(l => l.id));
});

test("selection does not mutate the caller's array", () => {
  const all = [learning("a", { closedDate: "2025-01-01" }), learning("b", { closedDate: "2026-01-01" })];
  const before = all.map(l => l.id);
  selectLearnings(all, { brandId: "default", category: "Conversion" });
  assert.deepEqual(all.map(l => l.id), before);
});

test("an empty corpus is handled without a special case at the call site", () => {
  const sel = selectLearnings([], { brandId: "default" });
  assert.equal(sel.total, 0);
  assert.equal(sel.shown.length, 0);
  assert.equal(sel.excluded, 0);
});
