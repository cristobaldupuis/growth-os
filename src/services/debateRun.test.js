// The property under test throughout: a debate's transcript survives everything
// that can go wrong after it was paid for.
//
// The bug these exist to prevent is specific and it shipped. `runDebate` wrapped
// the whole loop in one try/catch and saved only after synthesis returned, so any
// failure discarded every completed turn — while the error message told the
// operator to recover the transcript from History, where it had never been
// written. These assert the reordering that makes that message true.

import test from "node:test";
import assert from "node:assert/strict";
import {
  mkDebateRun, withTurn, withResults, withFailure, awaitingSynthesis,
  isResumable, resumableRuns, upsertRun, reconcileOnLoad, statusLabel,
  RUNNING, AWAITING_SYNTHESIS, DONE, FAILED,
} from "./debateRun.js";

const AGENTS = [
  { id: "cmo", label: "CMO", icon: "📣", color: "#c00", lens: "brand", blindspot: "unit economics" },
  { id: "cfo", label: "CFO", icon: "📊", color: "#00c", lens: "margin", blindspot: "LTV" },
];
const turn = (label) => ({ agent: label.toLowerCase(), label, icon: "x", color: "#000", text: label + " speaks", toolsUsed: [] });

/** A run with `n` turns recorded, as the loop would leave it. */
function runWithTurns(n) {
  let run = mkDebateRun({ context: "ctx", agents: AGENTS, maxTurns: 8 });
  for (let i = 0; i < n; i++) run = withTurn(run, turn(i % 2 ? "CFO" : "CMO"));
  return run;
}

test("a run has an id before any call is made", () => {
  const run = mkDebateRun({ context: "ctx", agents: AGENTS, maxTurns: 8 });
  assert.ok(run.id, "a record with no id cannot be updated on the way to succeeding");
  assert.equal(run.status, RUNNING);
  assert.deepEqual(run.transcript, []);
  assert.equal(run.results, null);
});

test("the agent roster is frozen onto the run", () => {
  // Settings are editable. A transcript read back later is only interpretable
  // alongside the personas that produced it.
  const run = mkDebateRun({ context: "", agents: AGENTS, maxTurns: 8 });
  assert.deepEqual(run.agents.map(a => a.label), ["CMO", "CFO"]);
});

test("each turn is appended and counted", () => {
  const run = runWithTurns(3);
  assert.equal(run.transcript.length, 3);
  assert.equal(run.turnCount, 3);
});

test("a failure keeps every turn already completed", () => {
  // The whole point. Six turns were spoken and billed; the seventh 429s.
  const failed = withFailure(runWithTurns(6), new Error("Rate limit reached."));
  assert.equal(failed.status, FAILED);
  assert.equal(failed.transcript.length, 6, "a failure must not discard paid-for turns");
  assert.match(failed.error, /Rate limit/);
});

test("a failed run with a real transcript can be finished without re-debating", () => {
  assert.equal(isResumable(withFailure(runWithTurns(6), new Error("boom"))), true);
  assert.equal(isResumable(awaitingSynthesis(runWithTurns(4))), true);
});

test("a completed run is not offered for resumption", () => {
  const done = withResults(runWithTurns(4), [{ title: "One" }]);
  assert.equal(done.status, DONE);
  assert.equal(isResumable(done), false);
});

test("a one-turn run is not resumable", () => {
  // Synthesis resolves disagreement between executives. One turn is a monologue,
  // and spending a reasoning call to restate it is worse than not offering to.
  assert.equal(isResumable(withFailure(runWithTurns(1), new Error("boom"))), false);
  assert.equal(isResumable(withFailure(runWithTurns(0), new Error("boom"))), false);
});

test("resumableRuns filters a mixed list", () => {
  const runs = [
    withResults(runWithTurns(4), [{ title: "done" }]),
    withFailure(runWithTurns(5), new Error("stopped")),
    withFailure(runWithTurns(1), new Error("stopped immediately")),
  ];
  assert.equal(resumableRuns(runs).length, 1);
});

test("saving the same run repeatedly replaces it rather than duplicating it", () => {
  // The bug this prevents: a run now saves after every turn, and a prepend-only
  // handler would leave one debate scattered through History as a dozen partial
  // copies of itself.
  let saved = [];
  let run = mkDebateRun({ context: "ctx", agents: AGENTS, maxTurns: 8 });
  saved = upsertRun(saved, run);
  for (let i = 0; i < 5; i++) {
    run = withTurn(run, turn("CMO"));
    saved = upsertRun(saved, run);
  }
  assert.equal(saved.length, 1, "one debate must occupy one row");
  assert.equal(saved[0].transcript.length, 5, "the surviving row must be the newest");
});

test("upsert keeps other runs and honours the cap", () => {
  let saved = [];
  for (let i = 0; i < 25; i++) {
    saved = upsertRun(saved, withTurn(mkDebateRun({ context: "c" + i, agents: AGENTS }), turn("CMO")));
  }
  assert.equal(saved.length, 20);
  assert.equal(new Set(saved.map(r => r.id)).size, 20, "ids must stay distinct");
});

test("a run left mid-flight by a closed tab is re-labelled, not left spinning", () => {
  // Nothing is executing it any more, so presenting it as live would leave a
  // permanent spinner in History. What it actually is, is a saved transcript.
  const [reconciled] = reconcileOnLoad([runWithTurns(5)]);
  assert.equal(reconciled.status, AWAITING_SYNTHESIS);
  assert.equal(reconciled.transcript.length, 5);
  assert.equal(isResumable(reconciled), true);
});

test("a run that died in its opening turn is marked failed with a reason", () => {
  const [reconciled] = reconcileOnLoad([runWithTurns(1)]);
  assert.equal(reconciled.status, FAILED);
  assert.match(reconciled.error, /page closed/i);
});

test("reconcile leaves finished runs alone", () => {
  const done = withResults(runWithTurns(4), [{ title: "x" }]);
  assert.deepEqual(reconcileOnLoad([done]), [done]);
});

test("a debate record written before runs carried a status still reads correctly", () => {
  // Backwards compatibility with what is already in operators' browsers.
  const legacy = { id: "dbt-1", date: new Date().toISOString(), transcript: [turn("CMO")], results: [{ title: "a" }], turnCount: 1 };
  assert.equal(statusLabel(legacy), "1 initiatives");
  assert.equal(isResumable(legacy), false, "a legacy record with results is finished");
  assert.deepEqual(reconcileOnLoad([legacy]), [legacy]);
});
