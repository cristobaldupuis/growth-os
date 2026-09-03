import { test } from "node:test";
import assert from "node:assert/strict";
import {
  learningRef, edgesOf, buildSupersessionGraph, confidenceOf,
  openContradictions, supersededRefs, edgesFromSelection, selectionFromEdges,
  provenanceOf, isClosedLearning,
} from "./supersession.js";

// A closed initiative carrying a learning. `snapshot` decides provenance the
// same way buildLearningsIndex derives it — from the frozen prediction, never
// from a field anyone can set.
const closed = (initId, opts = {}) => ({
  id: "x-" + initId,
  initId,
  title: "Test " + initId,
  category: opts.category || "Retention",
  status: opts.status || "Completed",
  endDate: opts.endDate || "2026-06-01",
  predictionSnapshot: opts.backfilled ? undefined : { ice: {}, revenueImpact: 0, snapshotDate: "2026-05-01" },
  results: {
    keyLearning: opts.learning || ("learning from " + initId),
    outcomeClassification: opts.outcome || "Success",
    supersedes:  opts.supersedes  || [],
    contradicts: opts.contradicts || [],
    confirms:    opts.confirms    || [],
  },
});

const draft = (initId) => ({ id: "x-" + initId, initId, title: "Draft " + initId, status: "Draft", results: null });

// -- Identity and shape -------------------------------------------------------

test("learningRef prefers initId and falls back to id", () => {
  assert.equal(learningRef({ initId: "LF-001", id: "x-1" }), "LF-001");
  assert.equal(learningRef({ id: "x-1" }), "x-1");
  assert.equal(learningRef(null), null);
});

test("edgesOf normalises missing, duplicate and blank refs", () => {
  const e = edgesOf({ results: { supersedes: ["A", "A", " B ", "", null, 7] } });
  assert.deepEqual(e.supersedes, ["A", "B"]);
  assert.deepEqual(e.contradicts, []);
  assert.deepEqual(e.confirms, []);
});

test("edgesOf on an initiative with no results returns three empty lists", () => {
  assert.deepEqual(edgesOf({}), { supersedes: [], contradicts: [], confirms: [] });
  assert.deepEqual(edgesOf(null), { supersedes: [], contradicts: [], confirms: [] });
});

test("isClosedLearning requires closed status and a logged learning", () => {
  assert.equal(isClosedLearning(closed("A")), true);
  assert.equal(isClosedLearning(closed("A", { status: "Killed" })), true);
  assert.equal(isClosedLearning(draft("A")), false);
  assert.equal(isClosedLearning({ status: "Completed", results: { keyLearning: "" } }), false);
});

test("provenance is derived from the snapshot, not settable", () => {
  assert.equal(provenanceOf(closed("A")), "tracked");
  assert.equal(provenanceOf(closed("A", { backfilled: true })), "backfilled");
});

// -- Graph construction -------------------------------------------------------

test("graph inverts a supersedes edge into supersededBy", () => {
  const g = buildSupersessionGraph([closed("OLD"), closed("NEW", { supersedes: ["OLD"] })]);
  assert.deepEqual(g.get("NEW").supersedes, ["OLD"]);
  assert.deepEqual(g.get("OLD").supersededBy, ["NEW"]);
  // The reverse edge is derived, never stored on the record it describes.
  assert.equal(g.get("OLD").item.results.supersededBy, undefined);
});

test("graph drops an edge to a draft — a draft has no result to retract with", () => {
  const g = buildSupersessionGraph([draft("D"), closed("NEW", { supersedes: ["D"] })]);
  assert.deepEqual(g.get("NEW").supersedes, []);
  assert.equal(g.has("D"), false);
});

test("graph drops an unresolvable ref rather than throwing", () => {
  const g = buildSupersessionGraph([closed("NEW", { supersedes: ["GONE"], confirms: ["ALSO-GONE"] })]);
  assert.deepEqual(g.get("NEW").supersedes, []);
  assert.deepEqual(g.get("NEW").confirms, []);
  assert.equal(g.size, 1);
});

test("graph drops a self-edge", () => {
  const g = buildSupersessionGraph([closed("A", { supersedes: ["A"], contradicts: ["A"] })]);
  assert.deepEqual(g.get("A").supersedes, []);
  assert.deepEqual(g.get("A").supersededBy, []);
});

test("graph excludes open initiatives entirely", () => {
  const g = buildSupersessionGraph([closed("A"), draft("B"), { id: "c", initId: "C", status: "Running", results: null }]);
  assert.deepEqual([...g.keys()], ["A"]);
});

// -- Confidence, derived ------------------------------------------------------

test("a lone tracked learning is provisional", () => {
  const g = buildSupersessionGraph([closed("A")]);
  const c = confidenceOf("A", g);
  assert.equal(c.level, "provisional");
  assert.equal(c.support, 1);
  assert.equal(c.counter, 0);
});

test("backfilled evidence weighs half, so two remembered results stay provisional", () => {
  const items = [
    closed("A", { backfilled: true }),
    closed("B", { backfilled: true, confirms: ["A"] }),
  ];
  const g = buildSupersessionGraph(items);
  assert.equal(confidenceOf("A", g).support, 1);   // 0.5 + 0.5
  assert.equal(confidenceOf("A", g).level, "provisional");
});

test("one confirming tracked experiment reaches supported, in both directions", () => {
  const g = buildSupersessionGraph([closed("A"), closed("B", { confirms: ["A"] })]);
  assert.equal(confidenceOf("A", g).level, "supported");
  // Symmetric: the assertion is about the pair, not about who typed it.
  assert.equal(confidenceOf("B", g).level, "supported");
});

test("three tracked experiments in agreement reach established", () => {
  const g = buildSupersessionGraph([
    closed("A"), closed("B", { confirms: ["A"] }), closed("C", { confirms: ["A"] }),
  ]);
  assert.equal(confidenceOf("A", g).level, "established");
  assert.equal(confidenceOf("A", g).support, 3);
});

test("a live contradiction outranks any amount of support", () => {
  const g = buildSupersessionGraph([
    closed("A"),
    closed("B", { confirms: ["A"] }),
    closed("C", { confirms: ["A"] }),
    closed("D", { contradicts: ["A"] }),
  ]);
  const c = confidenceOf("A", g);
  assert.equal(c.level, "contested");
  assert.deepEqual(c.contradictors, ["D"]);
  // The support is still reported — contested is a verdict, not an erasure.
  assert.equal(c.support, 3);
  assert.equal(c.counter, 1);
});

test("supersession outranks contradiction", () => {
  const g = buildSupersessionGraph([
    closed("A"),
    closed("B", { contradicts: ["A"] }),
    closed("C", { supersedes: ["A"] }),
  ]);
  assert.equal(confidenceOf("A", g).level, "retracted");
  assert.deepEqual(confidenceOf("A", g).superseders, ["C"]);
});

test("retracted evidence props nothing up", () => {
  // B and C both confirm A, which would be `established` — but both were
  // themselves retracted, so A falls back to its own single result.
  const g = buildSupersessionGraph([
    closed("A"),
    closed("B", { confirms: ["A"] }),
    closed("C", { confirms: ["A"] }),
    closed("X", { supersedes: ["B", "C"] }),
  ]);
  const c = confidenceOf("A", g);
  assert.equal(c.support, 1);
  assert.equal(c.level, "provisional");
});

test("a retracted contradictor no longer contests", () => {
  const g = buildSupersessionGraph([
    closed("A"),
    closed("B", { contradicts: ["A"] }),
    closed("C", { supersedes: ["B"] }),
  ]);
  assert.equal(confidenceOf("A", g).level, "provisional");
  assert.deepEqual(confidenceOf("A", g).contradictors, []);
});

test("confidenceOf on an unknown ref is null, not a throw", () => {
  assert.equal(confidenceOf("NOPE", buildSupersessionGraph([closed("A")])), null);
});

test("mutual supersession retracts both — operator error stays visible", () => {
  const g = buildSupersessionGraph([
    closed("A", { supersedes: ["B"] }),
    closed("B", { supersedes: ["A"] }),
  ]);
  assert.equal(confidenceOf("A", g).level, "retracted");
  assert.equal(confidenceOf("B", g).level, "retracted");
});

// -- Withheld from the index --------------------------------------------------

test("supersededRefs names what was retracted and by what", () => {
  const m = supersededRefs([closed("OLD"), closed("NEW", { supersedes: ["OLD"] })]);
  assert.deepEqual([...m.keys()], ["OLD"]);
  assert.deepEqual(m.get("OLD"), ["NEW"]);
});

test("supersededRefs is empty when nothing retracts anything", () => {
  assert.equal(supersededRefs([closed("A"), closed("B", { confirms: ["A"] })]).size, 0);
});

// -- Contradictions surfaced --------------------------------------------------

test("openContradictions emits each disagreeing pair exactly once", () => {
  const out = openContradictions([closed("A"), closed("B", { contradicts: ["A"] })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].a.ref, "A");
  assert.equal(out[0].b.ref, "B");
});

test("openContradictions does not double-count a mutually declared pair", () => {
  const out = openContradictions([
    closed("A", { contradicts: ["B"] }),
    closed("B", { contradicts: ["A"] }),
  ]);
  assert.equal(out.length, 1);
});

test("a contradiction resolved by supersession is no longer open", () => {
  const out = openContradictions([
    closed("A"),
    closed("B", { contradicts: ["A"] }),
    closed("C", { supersedes: ["A"] }),
  ]);
  assert.deepEqual(out, []);
});

test("openContradictions carries what a reader needs to judge the pair", () => {
  const out = openContradictions([
    closed("A", { learning: "Discount-led creative wins on prospecting", backfilled: true }),
    closed("B", { contradicts: ["A"], learning: "Discount-led creative underperforms on prospecting" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].a.learning, "Discount-led creative wins on prospecting");
  assert.equal(out[0].a.provenance, "backfilled");
  assert.equal(out[0].b.provenance, "tracked");
  assert.equal(out[0].a.closedDate, "2026-06-01");
});

// -- Close-flow round trip ----------------------------------------------------

test("edgesFromSelection groups a selection into the three arrays", () => {
  const e = edgesFromSelection({ "A": "supersedes", "B": "contradicts", "C": "confirms" });
  assert.deepEqual(e, { supersedes: ["A"], contradicts: ["B"], confirms: ["C"] });
});

test("edgesFromSelection always writes all three keys, so clearing an edge sticks", () => {
  assert.deepEqual(edgesFromSelection({}), { supersedes: [], contradicts: [], confirms: [] });
  assert.deepEqual(edgesFromSelection(null), { supersedes: [], contradicts: [], confirms: [] });
});

test("edgesFromSelection ignores an unknown relation", () => {
  assert.deepEqual(edgesFromSelection({ A: "obliterates" }).supersedes, []);
});

test("selection round-trips through edges unchanged", () => {
  const sel = { A: "supersedes", B: "confirms" };
  const item = { results: edgesFromSelection(sel) };
  assert.deepEqual(selectionFromEdges(item), sel);
});
