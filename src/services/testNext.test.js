import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDoNext, libraryBatch, mergeIdeas, nextPlaysBatches, countBySource, addBatch, matchBrand } from "./testNext.js";

const SYNTHESIS = `PATTERNS
- Creator-led video beats studio at consideration.

GAPS
- Bundles are proven at Northcove — not yet tested at Brewline.

LESSONS
- Scaling UGC without a refresh pipeline fatigues in 10 days.

DO NEXT
1. [Brewline] → [Test a starter bundle on the PDP] → [Proven at Northcove, +18% AOV]
2. **Northcove → Refresh UGC weekly → The fatigue lesson is specific**
- A line with no arrows at all
`;

test("the library's DO NEXT lines become ideas, and a line off-format is kept whole", () => {
  const ideas = parseDoNext(SYNTHESIS);
  assert.deepEqual(ideas, [
    { retailer: "Brewline", title: "Test a starter bundle on the PDP", why: "Proven at Northcove, +18% AOV" },
    { retailer: "Northcove", title: "Refresh UGC weekly", why: "The fatigue lesson is specific" },
    { retailer: "", title: "A line with no arrows at all", why: "" },
  ]);
  assert.deepEqual(parseDoNext("PATTERNS\n- nothing to do"), []);
  assert.deepEqual(parseDoNext("DO NEXT\n- one\nNEW SECTION\n- not this"), [{ retailer: "", title: "one", why: "" }]);
});

test("a synthesis becomes a library batch in the recs store's shape", () => {
  const batch = libraryBatch(SYNTHESIS, new Date("2026-09-30T10:00:00Z"));
  assert.equal(batch.source, "library");
  assert.equal(batch.recommendations.length, 3);
  assert.deepEqual(batch.recommendations[0], {
    id: batch.id + "-0", title: "Test a starter bundle on the PDP", rationale: "Proven at Northcove, +18% AOV",
    brandTarget: "Brewline", status: "pending", source: "library",
  });
  assert.equal(libraryBatch("nothing here"), null);
});

const recs = [
  { id: "lib-2", source: "library", generatedAt: "2026-09-29T00:00:00Z", recommendations: [
    { id: "a", title: "Test a starter bundle on the PDP", rationale: "library says", status: "pending" },
  ] },
  { id: "np-2", generatedAt: "2026-09-28T00:00:00Z", recommendations: [
    { id: "p1", title: "Test a starter bundle on the PDP!", rationale: "plays say", status: "pending", ice: { impact: 7, certainty: 6, ease: 5 } },
    { id: "p2", title: "Already dismissed", status: "dismissed" },
    { id: "p3", title: "Already drafted", status: "accepted" },
    { id: "p4", title: "Loyalty tier test", status: "pending" },
  ] },
  { id: "np-1", generatedAt: "2026-09-21T00:00:00Z", recommendations: [
    { id: "old", title: "A superseded slate's idea", status: "pending" },
  ] },
];
const debates = [
  { id: "d1", date: "2026-09-30T00:00:00Z", dismissedIdeas: [1], results: [
    { title: "Loyalty tier test", csoRationale: "debate says" },
    { title: "Dismissed debate idea" },
    { title: "Price anchoring on bundles", hypothesis: "h" },
  ] },
];
const items = [{ title: "Price anchoring on bundles" }];

test("ideas merge across sources, newest first, crediting convergence", () => {
  const ideas = mergeIdeas({ recs, debates, items });
  assert.deepEqual(ideas.map(i => [i.source, i.title, i.alsoFrom]), [
    ["debate", "Loyalty tier test", ["next-plays"]],
    ["library", "Test a starter bundle on the PDP", ["next-plays"]],
  ]);
  assert.equal(ideas[0].why, "debate says");
  assert.deepEqual(ideas[1].ref, { batchId: "lib-2", recId: "a" });
});

test("drafted, dismissed, superseded and already-running ideas are not offered again", () => {
  const titles = mergeIdeas({ recs, debates, items }).map(i => i.title);
  for (const gone of ["Already dismissed", "Already drafted", "A superseded slate's idea", "Dismissed debate idea", "Price anchoring on bundles"]) {
    assert.ok(!titles.includes(gone), gone);
  }
});

test("the Next Plays slate logic still sees only Next Plays batches", () => {
  assert.deepEqual(nextPlaysBatches(recs).map(b => b.id), ["np-2", "np-1"]);
  assert.deepEqual(countBySource(mergeIdeas({ recs, debates, items })), { "next-plays": 0, debate: 1, library: 1 });
  assert.deepEqual(mergeIdeas({}), []);
});

test("a cut-off synthesis loses its half-written last idea, not the note appended to it", () => {
  const cut = "DO NEXT\n1. [Brewline] → [Bundle test] → [Proven at Northcove]\n2. [Northcove] → [Refresh UGC] → [Fatigue le"
    + "\n\n---\n(This synthesis was cut off at the response length limit — the sections above it are complete, anything after is missing.)";
  assert.deepEqual(parseDoNext(cut).map(i => i.title), ["Bundle test", "Refresh UGC"]);
  assert.deepEqual(libraryBatch(cut).recommendations.map(r => r.title), ["Bundle test"]);
  assert.deepEqual(parseDoNext("DO NEXT\n- one\n- ***\n- two").map(i => i.title), ["one", "two"]);
});

test("the store keeps ten slates and three syntheses, and one kind never evicts the other", () => {
  let recs = [];
  for (let i = 0; i < 12; i++) recs = addBatch(recs, { id: "np-" + i });
  for (let i = 0; i < 5; i++) recs = addBatch(recs, { id: "lib-" + i, source: "library" });
  assert.equal(nextPlaysBatches(recs).length, 10);
  assert.deepEqual(recs.filter(b => b.source === "library").map(b => b.id), ["lib-4", "lib-3", "lib-2"]);
  assert.equal(nextPlaysBatches(recs)[0].id, "np-11");
  assert.equal(addBatch(undefined, { id: "x" }).length, 1);
});

test("an idea's retailer finds its brand by exact name or an unambiguous short form", () => {
  const brands = [{ id: 1, name: "Northcove Home" }, { id: 2, name: "Grounds Control" }, { id: 3, name: "Peak" }, { id: 4, name: "Peak Season" }];
  assert.equal(matchBrand(brands, "northcove home")?.id, 1);
  assert.equal(matchBrand(brands, "Northcove")?.id, 1);
  assert.equal(matchBrand(brands, "Peak")?.id, 3);
  assert.equal(matchBrand(brands, "Peak Season Co")?.id, 4);
  assert.equal(matchBrand(brands, "Portfolio"), null);
  assert.equal(matchBrand(brands, ""), null);
  assert.equal(matchBrand([{ id: 1, name: "Ace One" }, { id: 2, name: "Ace Two" }], "Ace"), null);
});
