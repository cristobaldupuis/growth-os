// -- Debate runs, and why they are saved before they finish -----------------------
//
// A Signal AI debate is the most expensive thing this app does. Eight agent turns,
// each of which may make up to four tool round-trips, plus a moderator call between
// turns and a synthesis at the end: 25 to 48 proxy calls on a reasoning model,
// several minutes wall-clock.
//
// All of it used to be discarded by any failure. `runDebate` wrapped the whole loop
// in one try/catch and only called `onSaveDebate` after synthesis returned, so a
// rate limit on turn seven, a dropped connection, a malformed synthesis — or simply
// closing the panel — threw away every turn that had already been paid for. The
// error message even advised opening the debate in History to keep the transcript,
// which was impossible: the throw happened before the only line that saved anything.
//
// So a run is now a record that exists from the first turn, and every turn updates
// it. The transcript is the asset; the synthesis is a step that can be retried
// against it. That reordering is the whole of this module.
//
// ## What "survives leaving the page" does and does not mean
//
// Two different things, and only one of them is achievable in a browser-only app:
//
//   NAVIGATING AWAY, CLOSING THE PANEL, SWITCHING VIEWS — fully supported. The run
//   loop is a plain async function holding a reference to the save callback, so it
//   keeps going and keeps writing after the panel unmounts. Reopen History and the
//   turns are there, still arriving.
//
//   CLOSING THE TAB OR RELOADING — the loop dies with the page. Everything already
//   written is kept and the run is left marked `running` with its turns intact, so
//   it can be finished from History rather than started again. It cannot silently
//   continue: there is no server-side execution engine, and a browser tab is not a
//   job runner. Making a debate genuinely continue unattended means running the loop
//   somewhere that outlives the page — the background-execution work in ROADMAP
//   Phase 3 — and this module is the state model that work would drive.
//
// `status` is what tells those two apart in the UI, and it is the reason a run
// carries one at all.

/** A run that is still executing turns. Reopened from storage, it means the page
 *  went away mid-debate — the transcript is good, the loop is not coming back. */
export const RUNNING = "running";
/** Turns are done and the synthesis has not been produced (or failed). Resumable:
 *  synthesis reads the transcript and nothing else, so it can be retried alone. */
export const AWAITING_SYNTHESIS = "awaiting_synthesis";
/** Complete — transcript and initiatives both present. */
export const DONE = "done";
/** A turn failed. The transcript up to that point is still real evidence. */
export const FAILED = "failed";

/** Statuses that can be finished from History without re-running the debate. */
const RESUMABLE = new Set([RUNNING, AWAITING_SYNTHESIS, FAILED]);

/**
 * True when this run can be taken further.
 *
 * Needs at least two turns: synthesis resolves disagreement between executives,
 * and one turn is a monologue with nothing to resolve. Offering to synthesise a
 * single opening statement would spend a reasoning call to restate it.
 */
export function isResumable(run) {
  if (!run || !RESUMABLE.has(run.status)) return false;
  return (run.transcript || []).length >= 2;
}

/** Runs worth showing a "finish this" affordance against, newest first. */
export const resumableRuns = (runs) => (runs || []).filter(isResumable);

let seq = 0;
/**
 * Open a run record.
 *
 * Minted with an id up front — before a single call has been made — because the id
 * is what every later update addresses. A record that only gets an identity once it
 * succeeds cannot be updated on the way there, which was precisely the old problem.
 */
export function mkDebateRun({ context = "", agents = [], maxTurns = 0 } = {}) {
  seq += 1;
  return {
    id: "dbt-" + Date.now() + "-" + seq,
    date: new Date().toISOString(),
    context,
    // Which personas were in the room. Settings are editable, so a transcript read
    // back in six months is only interpretable alongside the roster that produced
    // it — the same reasoning as freezing a prediction at launch.
    agents: agents.map(a => ({ id: a.id, label: a.label, icon: a.icon, color: a.color })),
    maxTurns,
    transcript: [],
    turnCount: 0,
    results: null,
    status: RUNNING,
    error: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Every update stamps `updatedAt`, which is what History sorts a live run by. */
const touch = (run, patch) => ({ ...run, ...patch, updatedAt: new Date().toISOString() });

/** Append one completed agent turn. */
export function withTurn(run, turn) {
  const transcript = [...(run.transcript || []), turn];
  return touch(run, { transcript, turnCount: transcript.length, status: RUNNING, error: null });
}

/** Turns are finished; synthesis has not run yet. */
export const awaitingSynthesis = (run) => touch(run, { status: AWAITING_SYNTHESIS });

/** Synthesis produced initiatives. */
export const withResults = (run, results) =>
  touch(run, { results, status: DONE, error: null });

/**
 * A step failed. The message is kept on the record rather than only in a toast,
 * because the toast is gone by the time anyone opens History and the question
 * "why did this one stop" is exactly what they came to ask.
 */
export const withFailure = (run, error) =>
  touch(run, { status: FAILED, error: String(error?.message || error || "Unknown error") });

/**
 * Insert or replace a run in the saved list, newest first, capped.
 *
 * Upsert rather than prepend, because a run is now saved many times over its life
 * and a prepend-only save would leave one debate scattered across the list as a
 * dozen partial copies of itself.
 */
export function upsertRun(runs, run, limit = 20) {
  const rest = (runs || []).filter(r => r.id !== run.id);
  return [run, ...rest]
    .sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)))
    .slice(0, limit);
}

/**
 * Bring a run loaded from storage into a truthful state.
 *
 * A run written as `running` whose page then went away is not running any more —
 * nothing is executing it — so presenting it as live would leave a permanent
 * spinner in History. Called once at load, it re-labels those by what they
 * actually have: turns but no results is awaiting synthesis, nothing at all is a
 * failure with a reason that names the cause.
 */
export function reconcileOnLoad(runs) {
  return (runs || []).map(run => {
    if (run.status !== RUNNING) return run;
    if ((run.transcript || []).length >= 2) return { ...run, status: AWAITING_SYNTHESIS };
    return {
      ...run,
      status: FAILED,
      error: run.error || "The page closed while this debate was still in its opening turn.",
    };
  });
}

/** One-line status for the History list. */
export function statusLabel(run) {
  switch (run?.status) {
    case DONE:               return `${run.results?.length || 0} initiatives`;
    case AWAITING_SYNTHESIS: return "Transcript saved · not yet synthesised";
    case RUNNING:            return "Running…";
    case FAILED:             return "Stopped early · transcript saved";
    // A record written before runs carried a status. Treated as complete when it
    // has results, because that is what it meant at the time.
    default:                 return run?.results?.length ? `${run.results.length} initiatives` : "Saved";
  }
}
