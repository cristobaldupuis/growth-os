// -- Per-workspace monthly cost projection -----------------------------------
//
// commercial.md prices the offer at $1,500/month software and never prices a
// workspace's actual draw on it. usage.js already has everything needed to
// answer that — a priced ledger row per call, groupable by feature group —
// nothing rolled it forward into a monthly figure to hold against the price.
//
// ## Why this is built from the ledger, not from invented assumptions
//
// The rest of this app's AI discipline refuses to produce a confident number
// from no evidence (see DECISIONS.md on `seedInitiativeFromAgenda`). A cost
// model that hardcodes "debates cost about $0.30" would be exactly that kind
// of filler, and would go stale the moment a group's routing changes. Instead
// this reads the same ledger SpendPanel reads: observed calls/week and
// observed $/call, per group, over a trailing window. A group with no priced
// calls in the window has no rate and is reported as unknown, not assumed to
// be free or assumed to cost the average of the others.
//
// The operator-editable "scenario" (calls/week per group) is what turns an
// observed rate into a projection for a *different* workspace or a heavier
// pace than the one that happened to be logged — e.g. "what does this cost if
// the client runs Signal AI daily instead of twice a week."

const WEEKS_PER_MONTH = 52 / 12;

/** ISO age of the oldest row still inside the window, in weeks (>= 1 to avoid
 *  dividing by a window narrower than a single observation). */
function windowWeeks(sinceISO, nowMs = Date.now()) {
  if (!sinceISO) return null; // "all time" has no fixed denominator — caller must supply weeks
  const ms = nowMs - new Date(sinceISO).getTime();
  return Math.max(ms / (7 * 86400000), 1 / 7);
}

/**
 * Roll the ledger into one row per feature group: observed pace and observed
 * per-call price, over the window ending now.
 *
 * `weeks` overrides the window computed from `since` — needed when `since` is
 * null (an "all time" ledger has no natural week count) or when the caller
 * wants to project a different pace than the one observed.
 */
export function observedGroupRates(rows, groupKeys, { since = null, weeks = null } = {}) {
  const w = weeks ?? windowWeeks(since) ?? 4; // default: treat an all-time ledger as a 4-week sample
  const inWindow = (r) => !since || String(r.ts) >= since;

  return Object.fromEntries(groupKeys.map((key) => {
    const mine = (rows || []).filter((r) => r.group === key && inWindow(r));
    const priced = mine.filter((r) => typeof r.costUsd === "number");
    const usd = priced.reduce((s, r) => s + r.costUsd, 0);
    const avgCostPerCall = priced.length > 0 ? usd / priced.length : null;
    return [key, {
      callsObserved: mine.length,
      pricedObserved: priced.length,
      callsPerWeek: mine.length / w,
      avgCostPerCall,
    }];
  }));
}

/**
 * Project a monthly cost per group from a scenario (calls/week) and a rate
 * (avg $/call). Either function of `rates` — observed or hand-entered — works,
 * since both shapes are `{ [group]: { avgCostPerCall } }`.
 *
 * A group whose rate is unknown (no priced calls observed yet) contributes to
 * `unknownGroups` rather than to `totalUsd` — silently reading it as zero
 * would understate the projection in the direction that flatters the
 * operator, which is the exact failure usage.js's own comments warn against.
 */
export function projectMonthlyCost(callsPerWeekByGroup, rates) {
  const perGroup = {};
  let totalUsd = 0;
  const unknownGroups = [];

  for (const [group, callsPerWeek] of Object.entries(callsPerWeekByGroup || {})) {
    const rate = rates?.[group]?.avgCostPerCall;
    const monthlyCalls = (callsPerWeek || 0) * WEEKS_PER_MONTH;
    if (typeof rate !== "number") {
      perGroup[group] = { monthlyCalls, avgCostPerCall: null, projectedUsd: null };
      if (callsPerWeek > 0) unknownGroups.push(group);
      continue;
    }
    const projectedUsd = monthlyCalls * rate;
    perGroup[group] = { monthlyCalls, avgCostPerCall: rate, projectedUsd };
    totalUsd += projectedUsd;
  }

  return { perGroup, totalUsd, unknownGroups };
}

/** Margin against a monthly price. Negative `usd` means the projection exceeds the price. */
export function marginAgainst(priceUsd, projectedUsd) {
  const usd = priceUsd - projectedUsd;
  const pct = priceUsd > 0 ? (usd / priceUsd) * 100 : null;
  return { usd, pct };
}
