// -- Test validity, and the cost of looking ------------------------------------
//
// The panel this module backs has had a sample-size calculator and a
// significance test since early on. Both were right, and together they were
// still capable of producing a wrong answer with a straight face, because
// neither of them knew how many times it had been asked.
//
// ## The problem
//
// An operator runs a creative test, opens the initiative on Tuesday, sees 91%,
// leaves it. Opens it Thursday, sees 94%, leaves it. Opens it the following
// Monday, sees 95.2%, and calls the winner. Every individual reading was
// computed correctly. The conclusion is still much weaker than "95% confident",
// because the decision rule was not "test once at the end" — it was "keep
// looking until it crosses", and that rule crosses 5% thresholds far more than
// 5% of the time on data that is pure noise.
//
// This is the single most common way a marketing A/B test produces a false
// winner, and it is invisible: nothing about the third reading looks different
// from a legitimate one. A product that sells decision quality and renders a
// confidence figure on demand, with no notion of how many times that figure has
// been consulted, is actively participating in the error.
//
// ## What this module does about it
//
// Three things, in order of how much they matter.
//
//   1. **A reading window.** Sample size and expected traffic give a date. Until
//      it arrives the result is not shown by default — the panel says how far
//      along the test is instead of what it currently says.
//   2. **A count.** Looking early is allowed, always, with one click. It is
//      recorded. Nobody is blocked from seeing their own data; they are stopped
//      from seeing it for free.
//   3. **A corrected threshold.** Given k looks, the z needed to hold the
//      overall false-positive rate at alpha is higher than 1.96, and by how much
//      is a solved problem (Pocock, 1977). The verdict uses the corrected
//      threshold and shows both, because "this would read as significant on a
//      single look, and it is not significant on your fourth" is the sentence
//      that teaches the discipline.
//
// Blocking would have been the stricter design and the wrong one. An operator
// who cannot see their own numbers exports the CSV and computes them in Sheets,
// where there is no counter at all — the discipline has to survive being
// optional, or it gets routed around.
//
// Extracted from DetailView.jsx, where the statistics lived inline. They are the
// most consequential arithmetic in the product and they were the only maths in
// it with no tests.

// -- Point estimates -----------------------------------------------------------

/**
 * Sessions needed per arm, two-sided test of proportions at 80% power.
 *
 * Unchanged from the inline original, including its two-value alpha. The choice
 * offered in the UI is 95% or 90%; a third value would need a normal quantile
 * function, and inventing one to support a level nobody selects is not a fix.
 */
export function calcSampleSize(baseRate, mde, alpha) {
  const z_alpha = alpha === 0.05 ? 1.96 : 1.645;
  const z_beta  = 0.8416;
  const p1 = baseRate / 100;
  const p2 = p1 * (1 + mde / 100);
  if (p2 <= 0 || p2 >= 1 || p1 <= 0 || p1 >= 1) return null;
  const n = ((z_alpha + z_beta) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / ((p2 - p1) ** 2);
  return Math.ceil(n);
}

/** Pooled two-proportion z. Zero conversions is data; zero sessions is not. */
export function calcZStat(convC, sessC, convV, sessV) {
  if (!sessC || !sessV) return null;
  const p1 = convC / sessC;
  const p2 = convV / sessV;
  const p  = (convC + convV) / (sessC + sessV);
  const se = Math.sqrt(p * (1 - p) * (1 / sessC + 1 / sessV));
  if (se === 0) return null;
  return (p2 - p1) / se;
}

/** Two-sided confidence from z. Abramowitz and Stegun, max error 7.5e-8. */
export function zToConfidence(z) {
  if (z === null || z === undefined) return null;
  const absZ = Math.abs(z);
  const t_ = 1 / (1 + 0.2316419 * absZ);
  const poly = t_ * (0.319381530 + t_ * (-0.356563782 + t_ * (1.781477937 + t_ * (-1.821255978 + t_ * 1.330274429))));
  const phi = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ) * poly;
  return Math.min(1, Math.max(0, phi * 2 - 1));
}

// -- Sequential thresholds -----------------------------------------------------
//
// Pocock's constant: the flat |z| boundary that holds the overall two-sided
// false-positive rate at alpha across K equally-spaced looks at accumulating
// data. K=1 is 1.96 by construction, which is the property that makes this safe
// to apply unconditionally — a test read once is corrected by nothing.
//
// These are not quoted from memory. They were solved numerically by propagating
// the density of the partial sum through the non-crossing region and bisecting
// on the boundary, and `testValidity.test.js` re-solves two of them on every CI
// run and asserts the table still matches. The K≤5 column agrees with Pocock
// (1977) to three decimals, which is the external check.
//
// A flat boundary rather than O'Brien-Fleming on purpose. O'Brien-Fleming is
// better when the number of looks is planned in advance and the early ones are
// meant to be near-impossible to cross. Here the looks are unplanned by
// definition — that is the behaviour being corrected — so a boundary that does
// not depend on which look this is out of how many is the honest one.
const POCOCK = {
  "0.05": [1.960, 2.179, 2.289, 2.361, 2.412, 2.453, 2.487, 2.513, 2.537, 2.557],
  "0.1":  [1.645, 1.874, 1.993, 2.067, 2.122, 2.163, 2.198, 2.224, 2.249, 2.270],
};

export const MAX_TABULATED_LOOKS = 10;

/**
 * The |z| this reading has to clear.
 *
 * Beyond ten looks the table stops and the last value is held. That is a real
 * understatement of the correction and it is the right failure direction to
 * choose: a test read eleven times is not going to be rescued by a more precise
 * boundary, and the honest output at that point is the count itself, which the
 * caller has. `beyondTable` says so rather than letting the number imply a
 * precision it does not have.
 */
export function sequentialThreshold(looks, alpha = 0.05) {
  const row = POCOCK[String(alpha)] || POCOCK["0.05"];
  const k = Math.max(1, Math.floor(looks || 1));
  return {
    threshold: row[Math.min(k, MAX_TABULATED_LOOKS) - 1],
    naive: row[0],
    looks: k,
    beyondTable: k > MAX_TABULATED_LOOKS,
  };
}

/**
 * Read the result, correctly, given how many times it has been read.
 *
 * Returns both verdicts. Reporting only the corrected one would be defensible
 * statistics and poor teaching: the gap between "significant on a single look"
 * and "not significant on your fourth" is the whole lesson, and it disappears if
 * only one of the two numbers is ever shown.
 */
export function evaluate({ convC, sessC, convV, sessV, looks = 1, alpha = 0.05 }) {
  const z = calcZStat(Number(convC), Number(sessC), Number(convV), Number(sessV));
  if (z === null) return null;
  const { threshold, naive, beyondTable } = sequentialThreshold(looks, alpha);
  return {
    z,
    confidence: zToConfidence(z),
    threshold, naive, looks: Math.max(1, Math.floor(looks || 1)), beyondTable,
    significant: Math.abs(z) >= threshold,
    naivelySignificant: Math.abs(z) >= naive,
    // The case worth naming: it would have been called a winner, and it is not
    // one at this number of looks.
    overturned: Math.abs(z) >= naive && Math.abs(z) < threshold,
  };
}

// -- The reading window --------------------------------------------------------

const DAY = 86400000;
const asDate = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
export const toISO = (d) => d.toISOString().slice(0, 10);

/**
 * When this test becomes readable, and how far along it is now.
 *
 * Two sources of truth, deliberately ranked. Observed sessions win when they
 * exist, because they are what the statistics actually consume; the date is a
 * forecast from expected traffic and is only in use until real counts arrive.
 * A test whose planned end date has passed on half the expected traffic is not
 * finished, and `underpowered` is the state that says so — the one a calendar
 * alone would get wrong, and the one that produces the most confident wrong
 * decisions in practice.
 */
export function readingWindow(tv, { now = new Date() } = {}) {
  const alpha = tv?.sigAlpha ?? 0.05;
  const perArm = calcSampleSize(tv?.baseRate ?? 0, tv?.mde ?? 0, alpha);
  const requiredTotal = perArm == null ? null : perArm * 2;

  const weekly = Number(tv?.weeklySessions) || 0;
  const start = asDate(tv?.startedAt);
  const observed = (Number(tv?.sessC) || 0) + (Number(tv?.sessV) || 0);
  const hasObserved = tv?.sessC !== "" && tv?.sessC != null && tv?.sessV !== "" && tv?.sessV != null;

  const weeksNeeded = requiredTotal && weekly > 0 ? requiredTotal / weekly : null;
  const readableAt = start && weeksNeeded != null
    ? new Date(start.getTime() + Math.ceil(weeksNeeded * 7) * DAY)
    : null;

  const progress = requiredTotal && hasObserved ? observed / requiredTotal : null;
  const datePassed = readableAt ? now >= readableAt : null;

  let phase;
  if (requiredTotal == null) phase = "unplanned";
  else if (progress != null) phase = progress >= 1 ? "readable" : (datePassed ? "underpowered" : "waiting");
  else if (readableAt == null) phase = "unplanned";
  else phase = datePassed ? "readable" : "waiting";

  return {
    perArm, requiredTotal, weekly, observed: hasObserved ? observed : null,
    weeksNeeded, readableAt, progress, phase,
    daysRemaining: readableAt ? Math.max(0, Math.ceil((readableAt - now) / DAY)) : null,
    // "unplanned" is not a failure state. It means the operator has not said how
    // much traffic the test gets, and the honest response is to show the result
    // with the window unknown rather than to withhold it on an assumption.
    gated: phase === "waiting" || phase === "underpowered",
  };
}

// -- The record of looking -----------------------------------------------------

export const readsOf = (tv) => Array.isArray(tv?.reads) ? tv.reads : [];

/**
 * Record one reading.
 *
 * A reading taken inside the window is recorded too. It is still a look, and the
 * count that corrects the threshold is the number of times the data was
 * consulted, not the number of times it was consulted early — a test read on six
 * consecutive Mondays after its window opened has the same multiplicity problem
 * as one read six times before.
 */
export function recordRead(tv, { at = new Date(), early = false, observed = null } = {}) {
  const reads = readsOf(tv);
  return {
    ...tv,
    reads: [...reads, { at: at.toISOString(), early: !!early, observed }],
  };
}

/**
 * One sentence for the operator, in the language of the decision they are about
 * to make rather than in the language of the correction.
 */
export function readingSummary(window, result) {
  if (window.phase === "unplanned") {
    return "No reading window: enter a baseline, an effect size and the sessions this test gets per week, and this panel will say when the result can be read.";
  }
  if (window.phase === "waiting") {
    const pct = window.progress != null ? ` (${Math.round(window.progress * 100)}% of the sample)` : "";
    return `Not readable yet${pct}. Planned to reach ${window.requiredTotal.toLocaleString()} sessions on ${toISO(window.readableAt)}, in ${window.daysRemaining} day${window.daysRemaining === 1 ? "" : "s"}.`;
  }
  if (window.phase === "underpowered") {
    return `Past its planned end date on ${Math.round((window.progress || 0) * 100)}% of the sample it needs. The test is running slower than the traffic estimate, not finishing early — reading it now is reading it short.`;
  }
  if (!result) return "Sample reached. Enter the counts to read the result.";
  if (result.overturned) {
    return `Reads as ${(result.confidence * 100).toFixed(1)}% on a single look, which is not the situation: this is look ${result.looks}. Holding the overall error rate at ${((1 - (result.naive === 1.96 ? 0.95 : 0.90)) * 100).toFixed(0)}% across ${result.looks} looks needs z ≥ ${result.threshold.toFixed(2)}, and z is ${Math.abs(result.z).toFixed(2)}. Not a winner.`;
  }
  if (result.significant) {
    return `Significant at look ${result.looks} (z ${Math.abs(result.z).toFixed(2)} ≥ ${result.threshold.toFixed(2)}, the threshold corrected for having looked ${result.looks} time${result.looks === 1 ? "" : "s"}).`;
  }
  return `Not significant (z ${Math.abs(result.z).toFixed(2)}, needs ${result.threshold.toFixed(2)} at ${result.looks} look${result.looks === 1 ? "" : "s"}).`;
}
