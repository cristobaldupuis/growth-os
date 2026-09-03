import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLearningsIndex, withheldLearnings, buildPortfolioTools } from "./portfolio.js";

const brands = [{ id: "b1", name: "Acme" }];

const closed = (initId, opts = {}) => ({
  id: "x-" + initId,
  initId,
  title: "Test " + initId,
  brandId: "b1",
  category: opts.category || "Retention",
  initType: "A/B Test",
  status: opts.status || "Completed",
  endDate: "2026-06-01",
  predictionSnapshot: opts.backfilled ? undefined : { ice: {}, revenueImpact: 0, snapshotDate: "2026-05-01" },
  results: {
    keyLearning: opts.learning || ("learning from " + initId),
    outcomeClassification: opts.outcome || "Success",
    supersedes:  opts.supersedes  || [],
    contradicts: opts.contradicts || [],
    confirms:    opts.confirms    || [],
  },
});

// -- The index stops offering retracted beliefs -------------------------------

test("a superseded learning leaves the citation index", () => {
  const items = [closed("OLD"), closed("NEW", { supersedes: ["OLD"] })];
  const idx = buildLearningsIndex(items, brands);
  assert.deepEqual(idx.map(l => l.initId), ["NEW"]);
});

test("the superseded initiative stays on the record — only the index drops it", () => {
  const items = [closed("OLD"), closed("NEW", { supersedes: ["OLD"] })];
  buildLearningsIndex(items, brands);
  // The caller's array is untouched: retraction is a read-time verdict, not a
  // mutation. Losing the record would lose the calibration signal that the team
  // believed it.
  assert.equal(items.length, 2);
  assert.equal(items[0].results.keyLearning, "learning from OLD");
  assert.equal(items[0].status, "Completed");
});

test("withheldLearnings names what is missing and what retracted it", () => {
  const items = [closed("OLD"), closed("NEW", { supersedes: ["OLD"] })];
  const w = withheldLearnings(items, brands);
  assert.equal(w.length, 1);
  assert.equal(w[0].initId, "OLD");
  assert.deepEqual(w[0].supersededBy, ["NEW"]);
  assert.equal(w[0].retailer, "Acme");
});

test("a contested learning stays in the index, carrying its contradiction", () => {
  const items = [closed("A"), closed("B", { contradicts: ["A"] })];
  const idx = buildLearningsIndex(items, brands);
  assert.equal(idx.length, 2);
  const a = idx.find(l => l.initId === "A");
  assert.equal(a.confidence, "contested");
  assert.deepEqual(a.contradictedBy, ["B"]);
});

test("confidence rides along and is derived, not read off the record", () => {
  const items = [closed("A"), closed("B", { confirms: ["A"] })];
  const idx = buildLearningsIndex(items, brands);
  assert.equal(idx.find(l => l.initId === "A").confidence, "supported");
  // Nothing on the stored result says "supported".
  assert.equal(items[0].results.confidence, undefined);
});

test("an index with no edges at all still reports a confidence for every entry", () => {
  const idx = buildLearningsIndex([closed("A"), closed("B")], brands);
  assert.deepEqual(idx.map(l => l.confidence), ["provisional", "provisional"]);
  assert.equal(idx.every(l => l.contradictedBy === undefined), true);
});

test("index shape is otherwise unchanged — provenance still derived from the snapshot", () => {
  const idx = buildLearningsIndex([closed("A"), closed("B", { backfilled: true })], brands);
  assert.equal(idx.find(l => l.initId === "A").provenance, "tracked");
  assert.equal(idx.find(l => l.initId === "B").provenance, "backfilled");
});

// -- The other doors a retracted belief could walk through --------------------

test("get_failure_patterns marks a retracted learning instead of quoting it as current", () => {
  const items = [
    closed("OLD", { outcome: "Failed" }),
    closed("NEW", { outcome: "Failed", supersedes: ["OLD"] }),
  ];
  const tools = buildPortfolioTools(items, {}, brands, "all");
  const out = tools.execute("get_failure_patterns");
  const old = out.find(f => f.title === "Test OLD");
  // The attempt stays listed — "this was tried and it failed" is still true.
  assert.ok(old);
  assert.deepEqual(old.retracted_by, ["NEW"]);
  assert.match(old.note, /superseded/i);
  // The one that did the retracting carries no marking.
  assert.equal(out.find(f => f.title === "Test NEW").retracted_by, undefined);
});

test("retraction is computed portfolio-wide, not inside the active brand filter", () => {
  // The retracting experiment lives at another brand. Scoping the graph to the
  // active filter would make a belief's standing depend on a dropdown.
  const items = [
    { ...closed("OLD", { outcome: "Failed" }), brandId: "b1" },
    { ...closed("NEW", { outcome: "Failed", supersedes: ["OLD"] }), brandId: "b2" },
  ];
  const tools = buildPortfolioTools(items, {}, brands, "b1");
  const out = tools.execute("get_failure_patterns");
  assert.deepEqual(out.find(f => f.title === "Test OLD").retracted_by, ["NEW"]);
});

test("win rate is unaffected by retraction — the outcome record is not the belief", () => {
  const items = [
    closed("A", { outcome: "Success" }),
    closed("B", { outcome: "Success", supersedes: ["A"] }),
  ];
  const tools = buildPortfolioTools(items, {}, brands, "all");
  const rows = tools.execute("get_win_rate_by_category");
  // Both experiments ran and both won. Retracting the belief one of them
  // produced does not un-run the experiment.
  assert.equal(rows.find(r => r.category === "Retention").closed, 2);
  assert.equal(rows.find(r => r.category === "Retention").wins, 2);
});
