import { mondayOf } from "../constants.js";

// -- Cadence rail --------------------------------------------------------------
//
// A week-by-week strip showing what an initiative was doing over a shared
// window: idle, running, or the week it reached a decision. Colour carries the
// state, height carries its weight, and the three decision states (shipped,
// read, killed) additionally get a mark, because those are the weeks that
// actually mattered.
//
// ## Derived, not authored
//
// The design prototype this is modelled on carried a hand-written code string
// per row (`'rrrrrrRrrS....'`). That is right for a prototype and wrong here:
// Growth OS already knows the start date, the end date, the status and the
// outcome, so a rail that is typed out separately is a second source of truth
// that can disagree with the record it sits next to. Everything below is
// computed from fields the initiative already has.
//
// The corollary is that this only emits states the data can actually support.
// The prototype has a `paused` state; Growth OS does not track pauses, so no
// rail here will ever show one. Inventing it would make the strip look richer
// and mean nothing.
//
// ## One shared window
//
// Every rail in a list is computed against the same week range, which is what
// makes them comparable down the column — you can see that one test ran while
// another sat idle. A per-row window would render each strip full and destroy
// exactly that comparison.

export const WEEK_MS = 7 * 86400000;

/** States a week can be in. `idle` is the absence of activity, not a gap in data. */
export const CADENCE_STATES = {
  idle:    { label:"idle",    weight:0.18, mark:false },
  running: { label:"running", weight:0.62, mark:false },
  read:    { label:"read",    weight:0.86, mark:true  },
  shipped: { label:"shipped", weight:1.00, mark:true  },
  killed:  { label:"killed",  weight:0.86, mark:true  },
  overdue: { label:"overdue", weight:0.62, mark:false },
};

/**
 * The shared window: `weeks` Mondays ending on the current week.
 *
 * Anchored on today rather than on the data so the strip means "the recent
 * past" consistently, and so adding an initiative with an old end date cannot
 * silently shift every other row's timeline.
 */
export function cadenceWindow(weeks = 14, today = new Date()) {
  const end = mondayOf(today);
  const start = new Date(end.getTime() - (weeks - 1) * WEEK_MS);
  const list = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * WEEK_MS);
    list.push({ index:i, monday:d, iso:d.toISOString().slice(0, 10) });
  }
  return list;
}

// Which decision state a closed initiative resolved to.
//
// "Completed" is not the same as "shipped": a test can complete with a Failed or
// Inconclusive outcome, which is a read rather than a rollout, and collapsing
// the two would make the rail claim more than the record does.
function closingState(item) {
  if (item.status === "Killed") return "killed";
  if (item.status !== "Completed") return null;
  const outcome = item.results && item.results.outcomeClassification;
  return (outcome === "Jackpot" || outcome === "Success") ? "shipped" : "read";
}

const parse = (d) => {
  if (!d) return null;
  const parsed = new Date(d + "T12:00:00");
  return isNaN(parsed) ? null : parsed;
};

/**
 * Build the rail for one initiative over a window.
 *
 * Returns one entry per week: `{ index, iso, state, label }`.
 *
 * A Draft has no start date and is therefore idle across the board, which is
 * correct — it hasn't done anything yet, and a Draft that rendered activity
 * would be the rail lying about the portfolio's actual velocity.
 */
export function cadenceFor(item, window, today = new Date()) {
  const start = parse(item.startDate);
  const end   = parse(item.endDate);
  const close = closingState(item);
  const thisWeek = mondayOf(today).getTime();

  // The decision lands on the week containing the end date, or — for something
  // closed with no end date recorded — not at all, rather than being guessed
  // onto an arbitrary week.
  const closeWeek = (close && end) ? mondayOf(end).getTime() : null;

  return window.map(w => {
    const wk = w.monday.getTime();
    let state = "idle";

    if (start && wk >= mondayOf(start).getTime()) {
      const beforeEnd = !end || wk <= mondayOf(end).getTime();
      if (beforeEnd) state = "running";
      // Still marked Running after its end date: activity the operator has not
      // yet closed out. Distinct from `running` so Triage's overdue set and this
      // strip tell the same story.
      else if (item.status === "Running" && wk <= thisWeek) state = "overdue";
    }

    if (closeWeek != null && wk === closeWeek) state = close;
    return { index:w.index, iso:w.iso, state, label:CADENCE_STATES[state].label };
  });
}

/** A short human range for the window, e.g. "wk 19–32" style hover context. */
export function windowLabel(window) {
  if (!window || window.length === 0) return "";
  const fmt = (d) => d.toLocaleDateString("en-CA", { month:"short", day:"numeric" });
  return fmt(window[0].monday) + " – " + fmt(window[window.length - 1].monday);
}

/**
 * Roll a set of initiatives up into the numbers a group header shows.
 *
 * Deliberately reports realised and at-risk revenue separately rather than
 * summing them. They are different kinds of claim — one happened, one is a
 * forecast — and a single blended figure is the exact move that makes a
 * portfolio number impossible to defend in a client meeting.
 */
export function groupRollup(items) {
  const running   = items.filter(e => e.status === "Running");
  const closed    = items.filter(e => e.status === "Completed" || e.status === "Killed");
  const decided   = closed.filter(e => e.results && e.results.outcomeClassification);
  const wins      = decided.filter(e => ["Jackpot","Success"].includes(e.results.outcomeClassification));
  const realised  = closed.reduce((s, e) => s + ((e.results && typeof e.results.actualRevenueImpact === "number") ? e.results.actualRevenueImpact : 0), 0);
  const atRisk    = running.reduce((s, e) => s + Math.max(0, e.revenueImpact || 0), 0);

  return {
    total: items.length,
    running: running.length,
    closed: closed.length,
    realised,
    atRisk,
    // Below three decided experiments a win rate is noise dressed as a metric,
    // so it is withheld rather than shown at 100% off a single result.
    winRate: decided.length >= 3 ? Math.round((wins.length / decided.length) * 100) : null,
  };
}
