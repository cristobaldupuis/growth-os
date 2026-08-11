// -- The kill-criteria gate -----------------------------------------------------
//
// `killCriteria` has existed on every initiative since the form did, as free
// text with no enforcement and nothing reading it back. ROADMAP 5.2, harvested
// from the Biosphere prototype: "Nothing leaves quarantine until its kill
// criteria are confirmed. Set before launch, not after." This is that rule made
// structural — a Draft cannot become Running until kill criteria are set — and
// the progress meter that gives a live Running initiative a sense of how close
// it is to its own decision point.
//
// ## Why the gate is on the TRANSITION, not a standing requirement
//
// The same asymmetry pre-registration already settled: an item that is already
// Running and predates this rule is not retroactively invalid, because that
// would make every one of a real client's existing campaigns unsaveable on
// their first edit. The gate only fires on Draft/none → Running, mirroring
// `withRunningSnapshot`'s own trigger condition in constants.js — both act at
// the same moment because they are both about what "committing to run this" is
// supposed to mean.

/** True when moving from `prevStatus` to `nextStatus` requires kill criteria
 *  that are not present. Any other transition, or no transition at all, passes. */
export function killGateBlocked(nextStatus, prevStatus, killCriteria) {
  return nextStatus === "Running" && prevStatus !== "Running" && !String(killCriteria || "").trim();
}

export const KILL_GATE_MESSAGE =
  "Kill criteria are required before an initiative can start running — name the condition that would stop it.";

// -- Distance to the kill line --------------------------------------------------
//
// Kill criteria are free text ("if CVR doesn't improve by 0.5pp after 2 weeks"),
// so there is no threshold here to evaluate against live numbers — that would
// need the criteria to be structured data, which they deliberately are not (see
// FormView's placeholder text: the value of the field is that an operator can
// write the actual, specific stop condition for THIS test, not fill in a
// template). What every Running initiative already carries, though, is a
// window — startDate and endDate — and that window is the thing kill criteria
// are implicitly measured against: most stop conditions are phrased as "after N
// weeks" or "by the time this ends." Elapsed-vs-planned is the honest proxy
// available without inventing a second, structured kill-criteria field the
// operator has to keep in sync with the one they actually wrote.

const DAY = 86400000;

/**
 * How far a Running initiative is into its own planned window.
 * Returns null when there isn't enough to compute from (no start, or no end).
 */
export function killLineProgress(item, now = new Date()) {
  if (!item || !item.startDate || !item.endDate) return null;
  const start = new Date(item.startDate + "T12:00:00");
  const end   = new Date(item.endDate   + "T12:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  const total   = end - start;
  const elapsed = now - start;
  const progress = Math.min(1, Math.max(0, elapsed / total));
  const daysRemaining = Math.ceil((end - now) / DAY);
  return { progress, daysRemaining, overdue: now > end };
}
