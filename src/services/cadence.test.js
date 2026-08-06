// Tests for the derived cadence rail.
// Run with: node --test src/services/cadence.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import { cadenceWindow, cadenceFor, windowLabel, groupRollup, WEEK_MS } from "./cadence.js";

// A fixed "today" so the window is deterministic. 2026-08-05 is a Wednesday, so
// the current week's Monday is 2026-08-03.
const TODAY = new Date("2026-08-05T12:00:00");
const W = cadenceWindow(14, TODAY);
const iso = (d) => d.toISOString().slice(0, 10);
const stateAt = (rail, isoDate) => rail.find(w => w.iso === isoDate)?.state;

test("the window is N consecutive Mondays ending on the current week", () => {
  assert.equal(W.length, 14);
  assert.equal(W[13].iso, "2026-08-03", "last bar is this week's Monday");
  assert.equal(W[0].iso, iso(new Date(W[13].monday.getTime() - 13 * WEEK_MS)));
  W.forEach(w => assert.equal(w.monday.getDay(), 1, w.iso + " is not a Monday"));
});

test("a Draft is idle across the whole window", () => {
  const rail = cadenceFor({ status:"Draft" }, W, TODAY);
  assert.equal(rail.length, 14);
  assert.ok(rail.every(w => w.state === "idle"), "a Draft has not done anything yet");
});

test("a running initiative is running from its start week to the present", () => {
  const rail = cadenceFor({ status:"Running", startDate:"2026-07-06" }, W, TODAY);
  assert.equal(stateAt(rail, "2026-06-29"), "idle", "the week before start is idle");
  assert.equal(stateAt(rail, "2026-07-06"), "running");
  assert.equal(stateAt(rail, "2026-08-03"), "running", "still running this week");
});

test("a completed success ships on its end week and is idle after", () => {
  const rail = cadenceFor({
    status:"Completed", startDate:"2026-06-15", endDate:"2026-07-13",
    results:{ outcomeClassification:"Success" },
  }, W, TODAY);
  assert.equal(stateAt(rail, "2026-06-15"), "running");
  assert.equal(stateAt(rail, "2026-07-13"), "shipped");
  assert.equal(stateAt(rail, "2026-07-20"), "idle", "nothing happens after it closes");
});

// "Completed" is not "shipped". A test can complete with a Failed or
// Inconclusive outcome, and collapsing the two would have the rail claim more
// than the record does.
test("a completed failure reads rather than ships", () => {
  const mk = (outcome) => cadenceFor({
    status:"Completed", startDate:"2026-06-15", endDate:"2026-07-13",
    results:{ outcomeClassification: outcome },
  }, W, TODAY);
  assert.equal(stateAt(mk("Jackpot"), "2026-07-13"), "shipped");
  assert.equal(stateAt(mk("Success"), "2026-07-13"), "shipped");
  assert.equal(stateAt(mk("Failed"), "2026-07-13"), "read");
  assert.equal(stateAt(mk("Inconclusive"), "2026-07-13"), "read");
});

test("a killed initiative marks its end week as killed", () => {
  const rail = cadenceFor({ status:"Killed", startDate:"2026-06-15", endDate:"2026-07-06" }, W, TODAY);
  assert.equal(stateAt(rail, "2026-06-29"), "running");
  assert.equal(stateAt(rail, "2026-07-06"), "killed");
  assert.equal(stateAt(rail, "2026-07-13"), "idle");
});

// The one state that exists to agree with Triage: still marked Running after
// its end date is unclosed activity, not ordinary running.
test("a running initiative past its end date reads as overdue", () => {
  const rail = cadenceFor({ status:"Running", startDate:"2026-06-15", endDate:"2026-07-06" }, W, TODAY);
  assert.equal(stateAt(rail, "2026-07-06"), "running", "the end week itself is still running");
  assert.equal(stateAt(rail, "2026-07-13"), "overdue");
  assert.equal(stateAt(rail, "2026-08-03"), "overdue", "up to and including this week");
});

test("overdue never extends past the current week into the future", () => {
  const rail = cadenceFor({ status:"Running", startDate:"2026-06-15", endDate:"2026-06-22" }, W, TODAY);
  assert.ok(rail.every(w => w.iso <= "2026-08-03" || w.state === "idle"));
});

test("a closed initiative with no end date records no decision week", () => {
  const rail = cadenceFor({
    status:"Completed", startDate:"2026-06-15",
    results:{ outcomeClassification:"Success" },
  }, W, TODAY);
  assert.ok(!rail.some(w => w.state === "shipped"),
    "the mark must not be guessed onto an arbitrary week");
});

test("activity entirely outside the window renders empty rather than clamped", () => {
  const rail = cadenceFor({
    status:"Completed", startDate:"2025-01-06", endDate:"2025-02-03",
    results:{ outcomeClassification:"Success" },
  }, W, TODAY);
  assert.ok(rail.every(w => w.state === "idle"));
});

test("every rail is the same length so rows stay comparable", () => {
  const items = [
    { status:"Draft" },
    { status:"Running", startDate:"2026-07-06" },
    { status:"Killed", startDate:"2026-06-01", endDate:"2026-06-29" },
  ];
  items.forEach(i => assert.equal(cadenceFor(i, W, TODAY).length, W.length));
});

test("windowLabel names both ends of the range", () => {
  const label = windowLabel(W);
  assert.match(label, /–/);
  assert.ok(label.includes("Aug"), "should end in the current month");
});

// -- Rollups -------------------------------------------------------------------

test("groupRollup keeps realised and at-risk revenue separate", () => {
  const items = [
    { status:"Running", revenueImpact:50000 },
    { status:"Running", revenueImpact:30000 },
    { status:"Completed", revenueImpact:20000, results:{ outcomeClassification:"Success", actualRevenueImpact:25000 } },
  ];
  const r = groupRollup(items);
  assert.equal(r.total, 3);
  assert.equal(r.running, 2);
  assert.equal(r.atRisk, 80000, "forecast only");
  assert.equal(r.realised, 25000, "actuals only");
  assert.notEqual(r.atRisk + r.realised, r.atRisk, "the two must never be blended into one figure");
});

test("negative revenue estimates do not reduce at-risk below zero", () => {
  const r = groupRollup([{ status:"Running", revenueImpact:-5000 }, { status:"Running", revenueImpact:10000 }]);
  assert.equal(r.atRisk, 10000);
});

// A win rate off one or two results is noise dressed as a metric.
test("win rate is withheld below three decided experiments", () => {
  const win = (o) => ({ status:"Completed", results:{ outcomeClassification:o } });
  assert.equal(groupRollup([win("Success")]).winRate, null);
  assert.equal(groupRollup([win("Success"), win("Failed")]).winRate, null);
  assert.equal(groupRollup([win("Success"), win("Failed"), win("Success")]).winRate, 67);
});

test("closed initiatives with no recorded outcome are excluded from win rate", () => {
  const r = groupRollup([
    { status:"Completed", results:{ outcomeClassification:"Success" } },
    { status:"Completed", results:{ outcomeClassification:"Success" } },
    { status:"Completed" },
  ]);
  assert.equal(r.closed, 3);
  assert.equal(r.winRate, null, "only two were actually decided");
});
