import test from "node:test";
import assert from "node:assert/strict";
import { mkUsageRow } from "./usage.js";
import { observedGroupRates, projectMonthlyCost, marginAgainst } from "./costModel.js";

test("a group with no rows observes zero pace and an unknown rate", () => {
  const rates = observedGroupRates([], ["debate"], { since: null, weeks: 4 });
  assert.equal(rates.debate.callsPerWeek, 0);
  assert.equal(rates.debate.avgCostPerCall, null);
});

test("observed pace and rate come from priced rows only, over the given weeks", () => {
  const rows = [
    mkUsageRow({ group: "debate", costUsd: 0.30 }),
    mkUsageRow({ group: "debate", costUsd: 0.50 }),
    mkUsageRow({ group: "debate", costUsd: null }), // unpriced — counted toward pace, not rate
  ];
  const rates = observedGroupRates(rows, ["debate"], { since: null, weeks: 2 });
  assert.equal(rates.debate.callsObserved, 3);
  assert.equal(rates.debate.pricedObserved, 2);
  assert.equal(rates.debate.callsPerWeek, 1.5);
  assert.equal(rates.debate.avgCostPerCall, 0.40);
});

test("a window (since) excludes rows outside it from both pace and rate", () => {
  const inWindow = mkUsageRow({ group: "capture", costUsd: 0.02 });
  const outOfWindow = mkUsageRow({ group: "capture", costUsd: 9 });
  outOfWindow.ts = "2000-01-01T00:00:00.000Z";
  const rates = observedGroupRates([inWindow, outOfWindow], ["capture"], { since: "2020-01-01T00:00:00.000Z", weeks: 1 });
  assert.equal(rates.capture.callsObserved, 1);
  assert.equal(rates.capture.avgCostPerCall, 0.02);
});

test("projection multiplies a scenario pace by an observed rate, monthly", () => {
  const rates = { debate: { avgCostPerCall: 0.40 } };
  const proj = projectMonthlyCost({ debate: 7 }, rates); // 7 calls/week
  const expectedMonthlyCalls = 7 * (52 / 12);
  assert.equal(proj.perGroup.debate.monthlyCalls, expectedMonthlyCalls);
  assert.equal(proj.perGroup.debate.projectedUsd, expectedMonthlyCalls * 0.40);
  assert.equal(Math.round(proj.totalUsd * 100) / 100, Math.round(expectedMonthlyCalls * 0.40 * 100) / 100);
  assert.deepEqual(proj.unknownGroups, []);
});

test("a group with an unknown rate is excluded from the total, not treated as free", () => {
  const rates = { debate: { avgCostPerCall: 0.40 }, image: { avgCostPerCall: null } };
  const proj = projectMonthlyCost({ debate: 7, image: 3 }, rates);
  assert.equal(proj.perGroup.image.projectedUsd, null);
  assert.deepEqual(proj.unknownGroups, ["image"]);
  // Total only reflects the priced group.
  assert.equal(Math.round(proj.totalUsd), Math.round(7 * (52 / 12) * 0.40));
});

test("a scenario of zero calls/week for an unpriced group is not flagged unknown", () => {
  // Nothing is actually being spent there, so there is nothing to warn about.
  const rates = { video: { avgCostPerCall: null } };
  const proj = projectMonthlyCost({ video: 0 }, rates);
  assert.deepEqual(proj.unknownGroups, []);
  assert.equal(proj.perGroup.video.projectedUsd, null);
});

test("margin is price minus projection, both directions", () => {
  assert.deepEqual(marginAgainst(1500, 400), { usd: 1100, pct: (1100 / 1500) * 100 });
  const over = marginAgainst(1500, 2000);
  assert.equal(over.usd, -500);
  assert.ok(over.pct < 0);
});
