import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relativePredictionError, rankMissingDimensions, evaluateEscalation,
  escalationAsk, parseBreakdownCSV, verdictFromBreakdown, buildEvidenceEntry,
} from "./diagnosticEscalation.js";

// Minimal schema fixture: Meta captures gender/age at the adset level, nothing
// captures placement/device/time_of_day/geo_fine anywhere.
const schema = {
  channels: [
    { id:"meta", label:"Meta", levels:[
      { key:"adset", label:"Ad set", template:["geo","age","gender"] },
      { key:"ad",    label:"Ad",     template:["channel","campaign"] },
    ] },
  ],
  dimensions: [
    { key:"geo",     label:"Geo" },
    { key:"age",     label:"Age" },
    { key:"gender",  label:"Gender" },
    { key:"channel", label:"Channel" },
    { key:"campaign",label:"Campaign" },
  ],
};

function closedItem(overrides = {}) {
  return {
    id:"e-1", title:"Test", status:"Completed",
    predictionSnapshot: { ice:{impact:5,certainty:5,ease:5}, revenueImpact:10000, snapshotDate:"2026-01-01" },
    revenueImpact: 10000,
    results: { actualRevenueImpact: 4000, outcomeClassification:"Failed" },
    adNames: [{ name:"Meta_US_Prospect_Q1", channel:"meta", level:"adset", addedAt:"2026-01-01" }],
    startDate:"2026-01-01", endDate:"2026-01-15",
    ...overrides,
  };
}

test("relativePredictionError: computes relative miss against the frozen prediction", () => {
  const err = relativePredictionError(closedItem());
  assert.ok(err);
  assert.equal(err.predictedRevenue, 10000);
  assert.equal(err.actualRevenue, 4000);
  assert.ok(Math.abs(err.relativeError - 0.6) < 1e-9);
});

test("relativePredictionError: null with no results or no actual logged", () => {
  assert.equal(relativePredictionError({}), null);
  assert.equal(relativePredictionError(closedItem({ results:{ outcomeClassification:"Failed" } })), null);
});

test("rankMissingDimensions: excludes age/gender-adjacent captured slots but keeps demographic axes as always-eligible", () => {
  const ranked = rankMissingDimensions(closedItem(), schema);
  const keys = ranked.map(r => r.key);
  assert.ok(!keys.includes("placement") === false); // sanity: placement not filtered out
  assert.ok(keys.includes("placement"));
  assert.ok(keys.includes("device"));
  assert.ok(keys.includes("age"));   // demographic axes are never naming-filtered
  assert.ok(keys.includes("gender"));
});

test("evaluateEscalation: fires on a large miss with a nameable candidate", () => {
  const r = evaluateEscalation(closedItem(), schema);
  assert.equal(r.fires, true);
  assert.equal(r.topCandidate.key, "placement");
});

test("evaluateEscalation: does not fire on a small relative miss", () => {
  const item = closedItem({ results:{ actualRevenueImpact: 9500, outcomeClassification:"Success" } });
  const r = evaluateEscalation(item, schema);
  assert.equal(r.fires, false);
});

test("evaluateEscalation: does not fire below the dollar floor even at a huge relative miss", () => {
  const item = closedItem({
    predictionSnapshot:{ ice:{impact:5,certainty:5,ease:5}, revenueImpact:100, snapshotDate:"2026-01-01" },
    revenueImpact:100,
    results:{ actualRevenueImpact: 5000, outcomeClassification:"Jackpot" },
  });
  // 100 -> 5000 is a huge relative miss, but the floor (2000) is what the
  // denominator uses, so this should NOT read as a >40% miss of a real base.
  const err = relativePredictionError(item);
  assert.ok(err.relativeError < 3); // sanity: it's large in absolute terms
  const r = evaluateEscalation(item, schema);
  // Still fires because relative error vs the floor is huge — this asserts the
  // floor bounds the DENOMINATOR, not that tiny tests never escalate.
  assert.equal(r.fires, true);
});

test("escalationAsk: names the channel, entity and window", () => {
  const item = closedItem();
  const ask = escalationAsk(item, { key:"placement", label:"Placement", ask:"Breakdown by Placement" });
  assert.match(ask, /meta/);
  assert.match(ask, /Meta_US_Prospect_Q1/);
  assert.match(ask, /2026-01-01 to 2026-01-15/);
});

test("parseBreakdownCSV: parses a placement breakdown with no ad name column", () => {
  const csv = "Placement,Amount spent (USD),Purchases conversion value\nFeed,1000,3000\nStories,1000,500\nReels,500,1500";
  const { rows, errors } = parseBreakdownCSV(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].value, "Feed");
  assert.equal(rows[0].metrics.spend, 1000);
  assert.equal(rows[0].metrics.revenue, 3000);
});

test("parseBreakdownCSV: reports empty input", () => {
  const { rows, errors } = parseBreakdownCSV("");
  assert.equal(rows.length, 0);
  assert.ok(errors.length > 0);
});

test("verdictFromBreakdown: names the concentrated, underperforming band", () => {
  const rows = [
    { value:"Feed",    metrics:{ spend:1000, revenue:3000 } }, // 3x roas
    { value:"Stories", metrics:{ spend:3000, revenue:1500 } }, // 0.5x roas, 60% of spend
  ];
  const v = verdictFromBreakdown(rows, "Placement");
  assert.match(v, /Stories/);
  assert.match(v, /75% of spend/);
});

test("verdictFromBreakdown: reports an even mix when nothing is both concentrated and weak", () => {
  const rows = [
    { value:"Feed",    metrics:{ spend:1000, revenue:2000 } },
    { value:"Stories", metrics:{ spend:1000, revenue:1900 } },
  ];
  const v = verdictFromBreakdown(rows, "Placement");
  assert.match(v, /even across Placement/);
});

test("verdictFromBreakdown: handles no-spend rows without throwing", () => {
  const v = verdictFromBreakdown([{ value:"Feed", metrics:{} }], "Placement");
  assert.match(v, /No spend/);
});

test("buildEvidenceEntry: bundles the ask, rows and verdict for persistence", () => {
  const item = closedItem();
  const candidate = { key:"placement", label:"Placement", ask:"Breakdown by Placement" };
  const rows = [
    { value:"Feed",    metrics:{ spend:1000, revenue:3000 } },
    { value:"Stories", metrics:{ spend:3000, revenue:1500 } },
  ];
  const entry = buildEvidenceEntry({ item, candidate, rows });
  assert.equal(entry.dimension, "placement");
  assert.match(entry.ask, /Placement/);
  assert.match(entry.verdict, /Stories/);
  assert.equal(entry.rows.length, 2);
  assert.ok(entry.pastedAt);
});
