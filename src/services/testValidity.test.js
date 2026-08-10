// Tests for the statistics, including a re-derivation of the sequential
// boundaries the module ships as a table.
// Run with: node --test src/services/testValidity.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calcSampleSize, calcZStat, zToConfidence, sequentialThreshold, evaluate,
  readingWindow, recordRead, readsOf, readingSummary, MAX_TABULATED_LOOKS,
} from "./testValidity.js";

// -- Point estimates -----------------------------------------------------------

test("sample size moves the right way with baseline and effect size", () => {
  const a = calcSampleSize(2, 10, 0.05);
  assert.ok(a > 0);
  // A smaller effect is harder to detect; a looser alpha is easier.
  assert.ok(calcSampleSize(2, 5, 0.05) > a);
  assert.ok(calcSampleSize(2, 10, 0.10) < a);
});

test("sample size refuses impossible inputs rather than returning a number", () => {
  assert.equal(calcSampleSize(0, 10, 0.05), null);
  assert.equal(calcSampleSize(50, 200, 0.05), null, "a 150% lift off 50% exceeds 100%");
});

test("z is null on missing sessions and defined on zero conversions", () => {
  assert.equal(calcZStat(10, 0, 10, 100), null);
  assert.ok(calcZStat(0, 1000, 10, 1000) !== null, "zero conversions is data");
});

test("confidence is bounded and monotone in z", () => {
  assert.ok(zToConfidence(0) < 0.01);
  assert.ok(zToConfidence(1.96) > 0.949 && zToConfidence(1.96) < 0.951);
  assert.equal(zToConfidence(40), 1);
  assert.equal(zToConfidence(null), null);
});

// -- The boundary table is re-derived, not trusted ------------------------------
//
// The module ships Pocock constants as a table. A table is only as good as the
// thing that produced it, so the thing that produced it lives here and runs.
// Propagates the density of the partial sum S_k through the non-crossing region
// |S_k| < c·√k and bisects on c until the crossing probability equals alpha.

const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

function crossingProb(c, K, N = 420) {
  const hi = c * Math.sqrt(K) + 1, step = (2 * hi) / N;
  const grid = Array.from({ length: N + 1 }, (_, i) => -hi + i * step);
  const w = (j) => (j === 0 || j === N ? 0.5 : 1);
  let f = grid.map(x => (Math.abs(x) < c ? phi(x) : 0));
  for (let k = 2; k <= K; k++) {
    const bound = c * Math.sqrt(k);
    const prev = f;
    f = grid.map((x) => {
      if (Math.abs(x) >= bound) return 0;
      let s = 0;
      for (let j = 0; j <= N; j++) s += w(j) * prev[j] * phi(x - grid[j]);
      return s * step;
    });
  }
  return 1 - f.reduce((s, v, j) => s + w(j) * v, 0) * step;
}

function solvePocock(K, alpha) {
  let lo = 1.5, hi = 4.0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (crossingProb(mid, K) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

test("one look is the ordinary threshold, by construction", () => {
  assert.equal(sequentialThreshold(1, 0.05).threshold, 1.960);
  assert.equal(sequentialThreshold(1, 0.10).threshold, 1.645);
  assert.ok(Math.abs(solvePocock(1, 0.05) - 1.96) < 0.01);
});

test("the shipped boundary for two and three looks matches a fresh solve", () => {
  assert.ok(Math.abs(solvePocock(2, 0.05) - sequentialThreshold(2, 0.05).threshold) < 0.01);
  assert.ok(Math.abs(solvePocock(3, 0.05) - sequentialThreshold(3, 0.05).threshold) < 0.01);
  // Published values, Pocock (1977): the external check on the solver itself.
  assert.ok(Math.abs(sequentialThreshold(2, 0.05).threshold - 2.178) < 0.005);
  assert.ok(Math.abs(sequentialThreshold(5, 0.05).threshold - 2.413) < 0.005);
});

test("the threshold rises with looks and is held past the table", () => {
  const t = (k) => sequentialThreshold(k, 0.05).threshold;
  for (let k = 2; k <= MAX_TABULATED_LOOKS; k++) assert.ok(t(k) > t(k - 1), `look ${k}`);
  assert.equal(t(25), t(MAX_TABULATED_LOOKS));
  assert.equal(sequentialThreshold(25, 0.05).beyondTable, true);
  assert.equal(sequentialThreshold(3, 0.05).beyondTable, false);
});

test("a missing or nonsense look count is treated as one look", () => {
  assert.equal(sequentialThreshold(0, 0.05).threshold, 1.960);
  assert.equal(sequentialThreshold(undefined, 0.05).threshold, 1.960);
});

// -- The verdict ---------------------------------------------------------------

// 2.00% against 2.42% on 10,000 sessions a side: z ≈ 2.02, which sits in the gap
// between the single-look threshold and the fourth-look one. That gap is where
// every false winner this module exists to catch actually lives.
const CASE = { convC: 200, sessC: 10000, convV: 242, sessV: 10000 };

test("the same data is a winner on one look and not on four", () => {
  const once = evaluate({ ...CASE, looks: 1 });
  const fourth = evaluate({ ...CASE, looks: 4 });
  assert.equal(once.significant, true);
  assert.equal(fourth.significant, false);
  assert.equal(fourth.overturned, true, "this is the case the panel exists to name");
  assert.equal(fourth.naivelySignificant, true);
  assert.equal(once.z, fourth.z, "the data did not change; the decision rule did");
});

test("a strong result survives being looked at repeatedly", () => {
  const r = evaluate({ convC: 200, sessC: 10000, convV: 400, sessV: 10000, looks: 8 });
  assert.equal(r.significant, true);
  assert.equal(r.overturned, false);
});

test("no counts, no verdict", () => {
  assert.equal(evaluate({ convC: "", sessC: "", convV: "", sessV: "", looks: 2 }), null);
});

// -- The window ----------------------------------------------------------------

const NOW = new Date("2026-08-10T00:00:00Z");
const PLAN = { baseRate: 2, mde: 10, sigAlpha: 0.05, weeklySessions: 20000, startedAt: "2026-08-01" };

test("with no plan, the window is unknown and nothing is gated", () => {
  const w = readingWindow({ baseRate: 0, mde: 0 }, { now: NOW });
  assert.equal(w.phase, "unplanned");
  assert.equal(w.gated, false);
  assert.match(readingSummary(w, null), /No reading window/);
});

test("a planned test is not readable before its date", () => {
  const w = readingWindow(PLAN, { now: NOW });
  assert.equal(w.phase, "waiting");
  assert.equal(w.gated, true);
  assert.ok(w.daysRemaining > 0);
  assert.ok(w.readableAt > NOW);
  assert.match(readingSummary(w, null), /Not readable yet/);
});

test("observed sessions beat the calendar in both directions", () => {
  const required = readingWindow(PLAN, { now: NOW }).requiredTotal;
  // Arrived early: the date has not passed but the sample is in.
  const early = readingWindow({ ...PLAN, sessC: required, sessV: required }, { now: NOW });
  assert.equal(early.phase, "readable");
  assert.equal(early.gated, false);
  // Arrived late: the date has passed on half the traffic.
  const late = readingWindow(
    { ...PLAN, sessC: required / 4, sessV: required / 4 },
    { now: new Date("2027-01-01T00:00:00Z") });
  assert.equal(late.phase, "underpowered");
  assert.equal(late.gated, true);
  assert.match(readingSummary(late, null), /reading it short/);
});

test("the date carries the window when no counts have been entered", () => {
  const w = readingWindow(PLAN, { now: new Date("2027-01-01T00:00:00Z") });
  assert.equal(w.phase, "readable");
  assert.equal(w.progress, null);
});

test("a start date with no traffic estimate cannot produce a window", () => {
  const w = readingWindow({ ...PLAN, weeklySessions: 0 }, { now: NOW });
  assert.equal(w.readableAt, null);
  assert.equal(w.phase, "unplanned");
});

// -- The record ----------------------------------------------------------------

test("reads accumulate and carry whether they were early", () => {
  let tv = { baseRate: 2 };
  assert.deepEqual(readsOf(tv), []);
  tv = recordRead(tv, { at: new Date("2026-08-05T00:00:00Z"), early: true, observed: 4000 });
  tv = recordRead(tv, { at: new Date("2026-08-12T00:00:00Z"), early: false, observed: 9000 });
  assert.equal(readsOf(tv).length, 2);
  assert.equal(readsOf(tv)[0].early, true);
  assert.equal(readsOf(tv)[1].observed, 9000);
  assert.equal(tv.baseRate, 2, "recording a read does not disturb the plan");
});

test("a workspace saved before reads existed reads as zero, not as a crash", () => {
  assert.deepEqual(readsOf(undefined), []);
  assert.deepEqual(readsOf({ reads: "nonsense" }), []);
});

test("the overturned summary names both numbers", () => {
  const s = readingSummary(
    readingWindow({ ...PLAN, sessC: 500000, sessV: 500000 }, { now: NOW }),
    evaluate({ ...CASE, looks: 4 }));
  assert.match(s, /single look/);
  assert.match(s, /Not a winner/);
});
