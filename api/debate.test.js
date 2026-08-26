// Server-side debate execution.
//
// The property this whole endpoint exists to deliver is that a debate is
// independent of the page that started it. That is not directly testable here —
// it is a claim about where the loop runs — but it decomposes into things that
// are, and each of them is a way the design could be quietly wrong:
//
//   - A step must advance the run by exactly ONE model call. If a step ever loops,
//     it will pass locally and time out in production on the first real debate.
//   - A step must carry no state between invocations. Everything the next step
//     needs has to be in the patch it writes, or the run cannot survive the
//     process that made it.
//   - Exactly one caller may hold a run. The chain and the sweeper can both reach
//     for the same run, and two steppers would fork the debate — two invocations
//     appending to one history, both paying for it.
//   - `step` must not be callable from outside. It spends a reasoning model's
//     budget in a loop; an unauthenticated one is a way to bill this deployment.

import test from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGINS = "https://allowed.example";
process.env.SUPABASE_URL = "https://project.supabase.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
process.env.ANTHROPIC_API_KEY = "sk-test";

const handler = (await import("./debate.js")).default;

function mkReq(body, { origin = "https://allowed.example" } = {}) {
  return {
    method: "POST",
    headers: { origin, "content-length": String(JSON.stringify(body).length), "x-forwarded-for": "1.2.3.4" },
    body,
  };
}
function mkRes() {
  const r = { statusCode: null, body: undefined, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

const SNAPSHOT = {
  items: [{ id: "e1", initId: "TB-001", title: "A test", category: "Conversion", status: "Running", ice: { impact: 7, certainty: 6, ease: 5 } }],
  settings: { companyName: "Test Co", businessModel: "DTC", northStarMetric: "Revenue", northStarCurrent: "$1M", northStarTarget: "$2M", categories: ["Conversion"] },
  brands: [{ id: "default", name: "Test Brand" }],
  activeBrand: "all",
  weeklyMetrics: [],
  cats: ["Conversion"],
};
const AGENTS = [
  { id: "cmo", label: "CMO", icon: "M", color: "#c00", lens: "brand", blindspot: "unit economics" },
  { id: "cfo", label: "CFO", icon: "F", color: "#00c", lens: "margin", blindspot: "LTV" },
];

/**
 * A fake Supabase + provider.
 *
 * `modelReplies` is a queue: each entry answers one upstream model call, which is
 * how the "one call per step" property is measured — the count of drained entries
 * is the count of model calls a step made.
 */
function stubWorld({ rows = {}, modelReplies = [] } = {}) {
  const state = { rows, dispatched: [], modelCalls: 0, sentBodies: [], counters: {} };
  const real = globalThis.fetch;

  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : {};

    // Self-dispatch of the next step. Recorded, never followed — otherwise one
    // test would run an entire debate.
    if (u.includes("/api/debate")) { state.dispatched.push(body.runId); return { ok: true, json: async () => ({ ok: true }) }; }

    // The rate limiter shares this datastore, and it fails CLOSED — a stub that
    // did not answer it would 503 every browser-facing call before it reached the
    // action under test. Same trap the admin-console stub documents.
    if (u.includes("/rpc/increment_rate_limit")) {
      state.counters[body.p_key] = (state.counters[body.p_key] || 0) + 1;
      return { ok: true, json: async () => state.counters[body.p_key] };
    }
    if (u.includes("/rpc/claim_debate_step")) {
      const row = state.rows[body.p_id];
      if (!row || row.status !== "running" || row.leased) return { ok: true, json: async () => [] };
      row.leased = true;
      return { ok: true, json: async () => [row] };
    }
    if (u.includes("/rpc/sweep_stalled_debates")) {
      return { ok: true, json: async () => Object.values(state.rows).filter(r => r.status === "running" && !r.leased).map(r => r.id) };
    }
    if (u.includes("/debate_runs")) {
      if (opts.method === "POST") { state.rows[body.id] = { ...body, leased: false }; return { ok: true, status: 201, json: async () => [], text: async () => "" }; }
      if (opts.method === "PATCH") {
        const id = decodeURIComponent((u.match(/id=eq\.([^&]+)/) || [])[1] || "");
        state.rows[id] = { ...state.rows[id], ...body, leased: false };
        return { ok: true, json: async () => [], text: async () => "" };
      }
      const id = decodeURIComponent((u.match(/id=eq\.([^&]+)/) || [])[1] || "");
      return { ok: true, json: async () => (state.rows[id] ? [state.rows[id]] : []) };
    }

    // The provider.
    if (u.includes("anthropic.com")) {
      state.modelCalls += 1;
      state.sentBodies.push(body);
      const reply = modelReplies.shift();
      if (!reply) throw new Error("a step made more model calls than the test allowed");
      return { ok: true, json: async () => reply };
    }
    throw new Error(`unexpected call to ${u}`);
  };

  state.restore = () => { globalThis.fetch = real; };
  return state;
}

const textReply = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: {} });
const toolReply = (name) => ({
  content: [{ type: "tool_use", id: "t1", name, input: {} }],
  stop_reason: "tool_use", usage: {},
});

/** Run one step against a stubbed world, returning the world. */
async function step(world, runId) {
  const { createHmac } = await import("node:crypto");
  const token = createHmac("sha256", process.env.SUPABASE_SECRET_KEY).update(runId).digest("hex");
  const res = mkRes();
  await handler({ method: "POST", headers: {}, body: { action: "step", runId, token } }, res);
  return res;
}

// -- Authorisation -------------------------------------------------------------

test("step refuses a request with no worker token", async () => {
  const res = mkRes();
  await handler({ method: "POST", headers: {}, body: { action: "step", runId: "dbt-1" } }, res);
  assert.equal(res.statusCode, 403, "an unauthenticated step is a way to bill this deployment in a loop");
});

test("step refuses a forged token", async () => {
  const res = mkRes();
  await handler({ method: "POST", headers: {}, body: { action: "step", runId: "dbt-1", token: "deadbeef" } }, res);
  assert.equal(res.statusCode, 403);
});

test("start refuses a request from an unlisted origin", async () => {
  const res = mkRes();
  await handler(mkReq({ action: "start", snapshot: SNAPSHOT, agents: AGENTS }, { origin: "https://evil.example" }), res);
  assert.equal(res.statusCode, 403);
});

// -- start ---------------------------------------------------------------------

test("start creates a run, dispatches the first step, and returns the id", async () => {
  const w = stubWorld();
  try {
    const res = mkRes();
    await handler(mkReq({ action: "start", snapshot: SNAPSHOT, agents: AGENTS, context: "BFCM soon", maxTurns: 4 }), res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.runId, "the client needs an id it can poll before anything has run");

    const row = w.rows[res.body.runId];
    assert.equal(row.status, "running");
    assert.equal(row.phase, "agent_turn");
    // The snapshot has to be stored: the server cannot reach the operator's
    // browser storage on any later step.
    assert.deepEqual(row.snapshot.items, SNAPSHOT.items);
    assert.deepEqual(w.dispatched, [res.body.runId], "nothing would ever run without the first hand-off");
  } finally { w.restore(); }
});

test("start rejects a request with no snapshot", async () => {
  const w = stubWorld();
  try {
    const res = mkRes();
    await handler(mkReq({ action: "start", agents: AGENTS }), res);
    assert.equal(res.statusCode, 400);
  } finally { w.restore(); }
});

test("start bounds maxTurns", async () => {
  const w = stubWorld();
  try {
    for (const maxTurns of [1, 99]) {
      const res = mkRes();
      await handler(mkReq({ action: "start", snapshot: SNAPSHOT, agents: AGENTS, maxTurns }), res);
      assert.equal(res.statusCode, 400, `maxTurns ${maxTurns} should be refused`);
    }
  } finally { w.restore(); }
});

// -- One call per step ---------------------------------------------------------

test("a step that gets an answer makes exactly ONE model call", async () => {
  // The property that decides whether this works in production at all. A step
  // that looped would pass a local test and time out on the first real debate.
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "agent_turn", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [], history: [], tool_messages: [], tool_iters: 0, turn_index: 0, current_agent: AGENTS[0], context: "" } },
    modelReplies: [textReply("The CMO speaks.")],
  });
  try {
    await step(w, "r1");
    assert.equal(w.modelCalls, 1);
    assert.equal(w.rows.r1.transcript.length, 1);
    assert.equal(w.rows.r1.transcript[0].text, "The CMO speaks.");
    assert.equal(w.rows.r1.turn_index, 1);
    assert.deepEqual(w.dispatched, ["r1"], "the run must hand off to keep going");
  } finally { w.restore(); }
});

test("a tool call is one step too, and the partial turn persists to the next", async () => {
  // A turn can take several model calls. Each is its own invocation, so the
  // half-finished conversation has to be written to the row — there is no
  // in-process state to hold it.
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "agent_turn", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [], history: [], tool_messages: [], tool_iters: 0, turn_index: 0, current_agent: AGENTS[0], context: "" } },
    modelReplies: [toolReply("get_portfolio_summary")],
  });
  try {
    await step(w, "r1");
    assert.equal(w.modelCalls, 1, "the step must stop after the tool call, not continue into the answer");
    assert.equal(w.rows.r1.phase, "agent_turn");
    assert.equal(w.rows.r1.tool_iters, 1);
    assert.equal(w.rows.r1.transcript.length, 0, "an unfinished turn is not a transcript entry");
    assert.ok(w.rows.r1.tool_messages.length >= 3, "the tool exchange has to survive to the next invocation");
  } finally { w.restore(); }
});

test("the last tool iteration withholds the tools, forcing an answer", async () => {
  // This replaces a throw that used to fail the whole debate from inside one turn.
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "agent_turn", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [], history: [], tool_messages: [{ role: "user", content: "go" }], tool_iters: 4, turn_index: 0, current_agent: AGENTS[0], context: "" } },
    modelReplies: [textReply("Fine, here is my view.")],
  });
  try {
    await step(w, "r1");
    assert.equal(w.sentBodies[0].tools, undefined, "an agent with no tools left has to speak");
    assert.equal(w.rows.r1.transcript.length, 1);
  } finally { w.restore(); }
});

// -- Phase transitions ---------------------------------------------------------

test("the first two turns rotate without consulting the moderator", async () => {
  // Below two turns there is no disagreement to moderate, so paying for a
  // moderator call would buy nothing.
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "agent_turn", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 6, transcript: [], history: [], tool_messages: [], tool_iters: 0, turn_index: 0, current_agent: AGENTS[0], context: "" } },
    modelReplies: [textReply("Opening.")],
  });
  try {
    await step(w, "r1");
    assert.equal(w.rows.r1.phase, "agent_turn");
    assert.equal(w.rows.r1.current_agent.label, "CFO", "the rotation has to move on");
  } finally { w.restore(); }
});

test("the run goes to synthesis as the turn ceiling approaches", async () => {
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "agent_turn", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [{ label: "CMO", text: "a" }, { label: "CFO", text: "b" }], history: [], tool_messages: [], tool_iters: 0, turn_index: 2, current_agent: AGENTS[0], context: "" } },
    modelReplies: [textReply("Third turn.")],
  });
  try {
    await step(w, "r1");
    assert.equal(w.rows.r1.phase, "synthesis", "turn_index 3 of max 4 must resolve rather than rotate again");
  } finally { w.restore(); }
});

test("synthesis finishes the run and stores the initiatives", async () => {
  const results = { items: [{ title: "One" }, { title: "Two" }, { title: "Three" }] };
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "synthesis", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [{ icon: "M", label: "CMO", text: "a" }, { icon: "F", label: "CFO", text: "b" }], history: [], tool_messages: [], tool_iters: 0, turn_index: 3, current_agent: AGENTS[0], context: "" } },
    modelReplies: [textReply(JSON.stringify(results))],
  });
  try {
    await step(w, "r1");
    assert.equal(w.rows.r1.status, "done");
    // Unwrapped at the boundary, so what is stored is the list itself regardless
    // of whether the model answered schema-wrapped or bare.
    assert.equal(w.rows.r1.results.length, 3);
    assert.deepEqual(w.dispatched, [], "a finished run must not hand off again");
  } finally { w.restore(); }
});

// -- Failure keeps the transcript ----------------------------------------------

test("a failed step marks the run failed and keeps every turn already bought", async () => {
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "synthesis", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [{ icon: "M", label: "CMO", text: "a" }, { icon: "F", label: "CFO", text: "b" }], history: [], tool_messages: [], tool_iters: 0, turn_index: 3, current_agent: AGENTS[0], context: "" } },
    modelReplies: [textReply("not json at all")],
  });
  try {
    await step(w, "r1");
    assert.equal(w.rows.r1.status, "failed");
    assert.equal(w.rows.r1.transcript.length, 2, "a debate that dies at synthesis is still two turns of evidence");
    assert.ok(w.rows.r1.error);
  } finally { w.restore(); }
});

// -- The lease -----------------------------------------------------------------

test("a run already held by someone else is left alone", async () => {
  // Two steppers would fork the debate: two invocations appending to one history,
  // each unaware of the other, both paying for it.
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "running", phase: "agent_turn", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [], history: [], tool_messages: [], tool_iters: 0, turn_index: 0, current_agent: AGENTS[0], context: "", leased: true } },
    modelReplies: [],
  });
  try {
    const res = await step(w, "r1");
    assert.equal(res.body.reason, "not_claimable");
    assert.equal(w.modelCalls, 0, "a run somebody holds must cost nothing to try");
  } finally { w.restore(); }
});

test("a finished run cannot be stepped again", async () => {
  const w = stubWorld({
    rows: { "r1": { id: "r1", status: "done", phase: "synthesis", snapshot: SNAPSHOT, agents: AGENTS, max_turns: 4, transcript: [], history: [], results: [] } },
    modelReplies: [],
  });
  try {
    await step(w, "r1");
    assert.equal(w.modelCalls, 0);
  } finally { w.restore(); }
});

// -- status and sweep ----------------------------------------------------------

test("status never asks the datastore for the snapshot", async () => {
  // The browser already has the portfolio. Selecting it back on a two-second poll
  // would make watching a debate more expensive than running one.
  let selectedColumns = "";
  const w = stubWorld({ rows: { "r1": { id: "r1", status: "running", phase: "agent_turn", transcript: [], snapshot: SNAPSHOT } } });
  const stubbed = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const m = String(url).match(/select=([^&]+)/);
    if (m) selectedColumns = decodeURIComponent(m[1]);
    return stubbed(url, opts);
  };
  try {
    const res = mkRes();
    await handler(mkReq({ action: "status", runId: "r1" }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.run.id, "r1");
    assert.ok(selectedColumns, "status must name its columns rather than selecting *");
    assert.ok(!selectedColumns.includes("snapshot"), `snapshot must not be polled back: ${selectedColumns}`);
    assert.ok(selectedColumns.includes("transcript"), "the transcript is the thing being watched");
  } finally { w.restore(); }
});

test("status 404s for a run that does not exist", async () => {
  const w = stubWorld();
  try {
    const res = mkRes();
    await handler(mkReq({ action: "status", runId: "nope" }), res);
    assert.equal(res.statusCode, 404);
  } finally { w.restore(); }
});

test("sweep re-dispatches runs whose chain broke", async () => {
  // Chains break — a cold start that fails, a deploy landing mid-run. Without
  // this the run sits at `running` with nothing driving it, which is the exact
  // failure this endpoint exists to remove.
  const w = stubWorld({
    rows: {
      "stalled": { id: "stalled", status: "running", leased: false },
      "held":    { id: "held",    status: "running", leased: true },
      "done":    { id: "done",    status: "done",    leased: false },
    },
  });
  try {
    const res = mkRes();
    await handler(mkReq({ action: "sweep" }), res);
    assert.deepEqual(w.dispatched, ["stalled"], "only the run nothing is driving should be kicked");
  } finally { w.restore(); }
});

test("an unknown action is refused", async () => {
  const w = stubWorld();
  try {
    const res = mkRes();
    await handler(mkReq({ action: "nonsense" }), res);
    assert.equal(res.statusCode, 400);
  } finally { w.restore(); }
});
