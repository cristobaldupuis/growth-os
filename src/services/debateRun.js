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
// ## Where a debate actually runs now
//
// On the server. api/debate.js advances a run one model call per invocation and
// chains itself along, so closing the tab does not touch it — the page was never
// driving the work. This module is the BROWSER's view of that: History stays
// local, because a finished transcript is the operator's own reading record and
// should not need the network to be legible.
//
// `serverRunId` is what distinguishes the two kinds of record this file has to
// handle. A run that has one is mirrored from the server and its `running` status
// is literally true. A run without one predates server-side execution and was
// driven by a browser that has since gone away — `reconcileOnLoad` re-labels
// those, because presenting them as live would leave a permanent spinner against
// something nothing is executing.
//
// The resumability machinery below is kept for exactly those older records, and
// for the case a synthesis fails with a transcript worth keeping. It is no longer
// the primary answer to a closed tab; it is the fallback for runs that predate the
// fix and for a retry that costs one call instead of twenty-five.

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
export function mkDebateRun({ context = "", agents = [], maxTurns = 0, serverRunId = null } = {}) {
  seq += 1;
  return {
    id: serverRunId || "dbt-" + Date.now() + "-" + seq,
    // The server-side run this mirrors, when there is one. Its presence is what
    // distinguishes a debate that is still executing somewhere from one that only
    // ever existed in a browser that has since been closed.
    serverRunId,
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
 * The distinction this draws is the whole reason server-side execution was worth
 * building. A run with a `serverRunId` that says `running` genuinely IS running —
 * on the server, where closing the tab did not touch it — so it is left alone and
 * the panel reattaches to it at mount.
 *
 * A run WITHOUT one was executed by a browser that has since gone away, and
 * nothing is driving it. Presenting that as live would leave a permanent spinner
 * in History, so it is re-labelled by what it actually has: turns but no results
 * is a saved transcript awaiting synthesis, nothing at all is a failure with a
 * reason that names the cause. Those are records from before this moved
 * server-side; new runs never reach that branch.
 */
export function reconcileOnLoad(runs) {
  return (runs || []).map(run => {
    if (run.status !== RUNNING) return run;
    if (run.serverRunId) return run;
    if ((run.transcript || []).length >= 2) return { ...run, status: AWAITING_SYNTHESIS };
    return {
      ...run,
      status: FAILED,
      error: run.error || "The page closed while this debate was still in its opening turn.",
    };
  });
}

/**
 * Mirror a server-side run into the local History shape.
 *
 * History stays in the browser store — it is the operator's own reading record,
 * and there is no reason a finished transcript should need the network to be
 * legible. This keeps the two representations in one shape so nothing downstream
 * has to know where a run executed.
 *
 * The server's `results` may arrive schema-wrapped (`{items: [...]}`) or bare,
 * depending on which model served the synthesis; the caller unwraps before
 * rendering, and both forms are stored as they came so nothing is lost.
 */
export function fromServerRun(run) {
  const status = run.status === "done" ? DONE
    : run.status === "failed" ? FAILED
    : RUNNING;
  return {
    id: run.id,
    serverRunId: run.id,
    date: run.created_at || new Date().toISOString(),
    context: run.context || "",
    agents: run.agents || [],
    maxTurns: run.max_turns || 0,
    transcript: run.transcript || [],
    turnCount: run.turn_index || (run.transcript || []).length,
    results: run.results || null,
    status,
    error: run.error || null,
    updatedAt: run.updated_at || new Date().toISOString(),
  };
}

/** One-line status for the History list. */
export function statusLabel(run) {
  switch (run?.status) {
    case DONE:               return `${run.results?.length || 0} initiatives`;
    case AWAITING_SYNTHESIS: return "Transcript saved · not yet synthesised";
    case RUNNING:            return run.serverRunId ? "Running on the server…" : "Running…";
    case FAILED:             return "Stopped early · transcript saved";
    // A record written before runs carried a status. Treated as complete when it
    // has results, because that is what it meant at the time.
    default:                 return run?.results?.length ? `${run.results.length} initiatives` : "Saved";
  }
}
