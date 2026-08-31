// api/debate.js — the debate runs here now, not in the browser.
//
// ## The problem this solves
//
// A Signal AI debate is 25-48 reasoning-model calls over several minutes. It used
// to run entirely in the page, which meant the loop WAS the page: closing the tab
// killed it mid-argument. Saving every turn made that non-destructive — nothing
// bought was lost, and an unfinished debate could be synthesised later in one call
// — but "you can pick it up afterwards" is not the same promise as "it kept
// going", and the second is the one worth making.
//
// ## The shape, and why it is not one long-running function
//
// A debate takes minutes; a serverless function gets tens of seconds. Holding one
// open for the whole run is not available at any plan tier worth designing
// against, so the run is a STATE MACHINE and each invocation advances it by
// exactly one model call:
//
//     start  → row in debate_runs, dispatch the first step, return the id
//     step   → claim the run, make ONE model call, write the row, dispatch the next
//     status → read the row (this is all the browser does after start)
//     sweep  → restart runs whose chain broke
//
// One model call per invocation, not one agent turn: a turn can make up to five
// (four tool round-trips then an answer), and five sequential model calls is
// exactly the kind of thing that fits comfortably in a local test and times out in
// production. A single call is bounded by the model's own latency, which is the
// only bound available.
//
// ## Why there is a sweeper
//
// Each step dispatches the next, which is a chain, and chains break: a cold start
// that fails, a deploy landing mid-run, a platform hiccup. When one does, the run
// sits at `running` with nothing driving it — the exact failure mode this endpoint
// exists to remove, reintroduced by its own mechanism. `sweep` finds runs whose
// lease has lapsed and kicks them again. The client calls it when it polls, so an
// operator who reopens the app repairs their own stalled runs by looking at them.
//
// ## Authorisation
//
// `start`, `status` and `sweep` are browser-facing and guarded like every other
// endpoint here: origin allowlist, rate limit, body ceiling.
//
// `step` is not browser-facing and is guarded differently, because a server-to-
// server call has no Origin to check. It carries an HMAC of the run id, keyed by
// the Supabase secret — a value that already must be present for any of this to
// work and that never leaves the server. Requiring it means `step` cannot be
// driven from outside: a caller who could invoke it freely could make this
// deployment spend a reasoning model's budget in a loop.

import { createHmac, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { guardEntry, guardRateLimit, rateLimitIdentity } from "./_guard.js";
import { supabaseConfigured, restBase, authHeaders, rpc } from "./_supabase.js";
import { callText } from "./_textCall.js";
import { buildPortfolioContext, buildPortfolioTools } from "../src/services/portfolio.js";
import {
  agentTurnRequest, agentOpeningMessage, moderatorRequest, synthesisRequest, turnText, toolCallsIn,
} from "../src/services/ai/debatePrompts.js";
import { safeParseJSON } from "../src/services/ai/_shared.js";
import { unwrap } from "../src/services/ai/schemas.js";

// The portfolio snapshot travels with `start`, so this is larger than the other
// endpoints' ceilings — but still bounded, because it is the one field a caller
// controls the size of.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Low. Starting a debate is a deliberate act that costs real money, and `status`
// has its own generous bucket below because polling is free.
const START_RATE_LIMIT_MAX = 12;
const POLL_RATE_LIMIT_MAX = 600;

const MAX_TOOL_ITERS = 4;
// Long enough that a slow model call cannot look like a dead step, short enough
// that a genuinely dead one is picked up while the operator is still watching.
const LEASE_SECONDS = 120;

const TABLE = () => `${restBase()}/debate_runs`;

// -- Worker authorisation -------------------------------------------------------

const workerKey = () =>
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";

/** Sign a run id for the self-dispatch. */
const signRun = (id) => createHmac("sha256", workerKey()).update(String(id)).digest("hex");

const digest = (s) => createHash("sha256").update(String(s), "utf8").digest();

/** Constant-time check, with both sides hashed so a length mismatch cannot throw
 *  — the same discipline as the admin session check in _session.js. */
function workerTokenValid(id, token) {
  if (!workerKey() || typeof token !== "string" || !token) return false;
  return timingSafeEqual(digest(token), digest(signRun(id)));
}

/**
 * This deployment's own base URL, for the self-dispatch.
 *
 * `PUBLIC_BASE_URL` wins when set, because VERCEL_URL is the immutable deployment
 * hostname rather than the alias an operator uses, and either works for a
 * server-to-server call.
 */
function selfBase() {
  if (process.env.PUBLIC_BASE_URL) return String(process.env.PUBLIC_BASE_URL).replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Hand off to the next step without waiting for it.
 *
 * The await is on the DISPATCH, not the work: `Promise.race` against a short
 * timer guarantees the request reached the wire before this invocation returns,
 * while never blocking on the next step's own model call. Awaiting the whole
 * thing would nest every step inside its parent and blow the execution limit on
 * the first debate; not awaiting at all risks the platform freezing this function
 * before the socket opens.
 *
 * Failure here is survivable rather than fatal: the lease lapses and the sweeper
 * picks the run up. That is the whole reason the sweeper exists.
 */
async function dispatchStep(runId) {
  const req = fetch(`${selfBase()}/api/debate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "step", runId, token: signRun(runId) }),
  }).catch((err) => { console.error("debate step dispatch failed", runId, err?.message); });

  await Promise.race([req, new Promise((r) => setTimeout(r, 500))]);
}

// -- Row access -----------------------------------------------------------------

async function insertRun(row) {
  const res = await fetch(TABLE(), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`could not create the debate run${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
}

async function patchRun(id, patch) {
  const res = await fetch(`${TABLE()}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`could not update the debate run (${res.status})`);
}

async function readRun(id, select = "*") {
  const res = await fetch(
    `${TABLE()}?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(select)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`could not read the debate run (${res.status})`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// -- The state machine ----------------------------------------------------------
//
// Each function below performs ONE model call and returns the patch that moves the
// run forward. None of them loops, and none of them holds state between
// invocations — a step starts with nothing but the row it just read, which is what
// makes the work independent of the process that began it.

/** Rebuild the derived context a step needs from the frozen snapshot. */
function contextFor(run) {
  const s = run.snapshot || {};
  const items = s.items || [];
  const settings = s.settings || {};
  const brands = s.brands || [];
  const activeBrand = s.activeBrand || "all";
  return {
    portfolioCtx: buildPortfolioContext(items, settings, brands, activeBrand, s.weeklyMetrics || []),
    portfolioTools: buildPortfolioTools(items, settings, brands, activeBrand),
    cats: s.cats || [],
  };
}

/** One model call inside an agent's turn: either a tool round-trip or the answer. */
async function stepAgentTurn(run) {
  const { portfolioCtx, portfolioTools } = contextFor(run);
  const agent = run.current_agent || (run.agents || [])[0];
  const isFirstTurn = (run.transcript || []).length === 0;

  // Messages for THIS turn: the shared history, plus the turn's opening prompt,
  // plus whatever the tool loop has accumulated so far.
  const messages = (run.tool_messages || []).length
    ? run.tool_messages
    : [...(run.history || []), { role: "user", content: agentOpeningMessage(isFirstTurn, agent.label) }];

  // The final permitted iteration withholds the tools, which forces an answer
  // because there is nothing left to call. This replaces a throw that used to
  // fail the entire debate from inside a single turn.
  const lastChance = (run.tool_iters || 0) >= MAX_TOOL_ITERS;

  const data = await callText(agentTurnRequest({
    agent, portfolioCtx, userContext: run.context,
    messages, tools: portfolioTools.definitions, withTools: !lastChance,
  }));

  if (data.stop_reason === "tool_use") {
    const results = toolCallsIn(data.content).map(b => ({
      type: "tool_result",
      tool_use_id: b.id,
      content: JSON.stringify(portfolioTools.execute(b.name)),
    }));
    return {
      phase: "agent_turn",
      tool_messages: [...messages, { role: "assistant", content: data.content }, { role: "user", content: results }],
      tool_iters: (run.tool_iters || 0) + 1,
      note: `${agent.label} is looking up portfolio data`,
    };
  }

  // The turn is finished. Record it and clear the per-turn scratch state.
  const text = turnText(data.content);
  const toolsUsed = [...new Set(
    messages.flatMap(m => (Array.isArray(m.content) ? m.content : []))
      .filter(b => b.type === "tool_use").map(b => b.name),
  )];

  const transcript = [...(run.transcript || []), {
    agent: agent.id, icon: agent.icon, label: agent.label, color: agent.color, text, toolsUsed,
  }];
  const history = [
    ...(run.history || []),
    { role: "user", content: agentOpeningMessage(isFirstTurn, agent.label) },
    { role: "assistant", content: `${agent.icon} ${agent.label}: ${text}` },
  ];
  const turnIndex = (run.turn_index || 0) + 1;

  // Below two turns there is no disagreement to moderate, so the first rotation
  // is unconditional — matching what the browser loop did.
  const nextPhase = turnIndex >= run.max_turns - 1 ? "synthesis"
    : turnIndex >= 2 ? "moderator" : "agent_turn";

  return {
    phase: nextPhase,
    transcript, history, turn_index: turnIndex,
    tool_messages: [], tool_iters: 0,
    current_agent: nextPhase === "agent_turn"
      ? (run.agents || [])[turnIndex % (run.agents || []).length]
      : run.current_agent,
    note: `${agent.label} finished speaking`,
  };
}

/** Decide who speaks next, or that the debate is ready to resolve. */
async function stepModerator(run) {
  const { portfolioCtx } = contextFor(run);
  const agents = run.agents || [];

  let decision;
  try {
    const data = await callText(moderatorRequest({
      portfolioCtx, userContext: run.context, transcript: run.transcript,
      agents, turnCount: run.turn_index, maxTurns: run.max_turns,
    }));
    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    decision = safeParseJSON(text, false);
  } catch (err) {
    // Non-fatal by design: the moderator only decides who speaks next, so a
    // debate that loses it degrades to plain rotation rather than stopping.
    console.warn("moderator step failed, rotating instead:", err?.message);
  }
  if (!decision) decision = { decision: "continue", next_agent: null, reason: "Moderator unavailable; continuing." };

  if (decision.decision === "synthesise" || run.turn_index >= run.max_turns - 1) {
    return { phase: "synthesis", note: decision.reason || "Ready to synthesise" };
  }

  const found = agents.find(a => a.label === decision.next_agent);
  const history = [...(run.history || [])];
  if (decision.decision === "followup" && found && decision.followup_prompt) {
    history.push({ role: "user", content: `Moderator to ${decision.next_agent}: ${decision.followup_prompt}` });
    history.push({ role: "assistant", content: "Understood." });
  }

  return {
    phase: "agent_turn",
    history,
    current_agent: found || agents[run.turn_index % agents.length],
    note: decision.reason || "",
  };
}

/** Resolve the debate into initiatives. The terminal step. */
async function stepSynthesis(run) {
  const { portfolioCtx, portfolioTools, cats } = contextFor(run);
  const data = await callText(synthesisRequest({
    portfolioCtx, userContext: run.context, transcript: run.transcript, cats, portfolioTools,
  }));

  if (data.stop_reason === "max_tokens") {
    throw new Error("The synthesis was cut off at the response length limit. The transcript is saved — try synthesising again.");
  }
  const text = (data.content || []).find(b => b.type === "text")?.text || "";
  const results = unwrap(safeParseJSON(text, false) ?? safeParseJSON(text, true));
  if (!results.length) throw new Error("The synthesis came back empty. The transcript is saved — try again.");

  return { status: "done", phase: "synthesis", results, lease_until: null, note: "Complete" };
}

const STEPS = { agent_turn: stepAgentTurn, moderator: stepModerator, synthesis: stepSynthesis };

// -- Handler --------------------------------------------------------------------

export default async function handler(req, res) {
  const action = req.body?.action;

  // `step` is the worker path and is authorised on its signature rather than on
  // origin, so it deliberately skips guardEntry — a server-to-server call has no
  // Origin header to check against an allowlist.
  if (action === "step") return handleStep(req, res);

  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;

  if (!supabaseConfigured()) {
    return res.status(503).json({
      error: "Server-side debates need durable storage. Set SUPABASE_URL and SUPABASE_SECRET_KEY, and apply "
           + "supabase/migrations/0003_runtime.sql and 0004_debate_runs.sql.",
    });
  }

  if (action === "start")  return handleStart(req, res);
  if (action === "status") return handleStatus(req, res);
  if (action === "sweep")  return handleSweep(req, res);
  return res.status(400).json({ error: 'action must be "start", "status" or "sweep".' });
}

async function handleStart(req, res) {
  const who = await rateLimitIdentity(req);
  if (who.error) { res.status(401).json({ error: who.error }); return; }
  if (await guardRateLimit(req, res, {
    key: `gos:debate:start:${who.id}`,
    max: START_RATE_LIMIT_MAX,
    // No longer "from this address" when a session named a person — see
    // rateLimitIdentity on why the address was wrong in both directions.
    limitMessage: "Too many debates started. Wait a while and try again.",
    label: "Debate",
  })) return;

  const { snapshot, context = "", agents, maxTurns = 8 } = req.body || {};
  if (!snapshot || typeof snapshot !== "object") return res.status(400).json({ error: "A portfolio snapshot is required." });
  if (!Array.isArray(agents) || agents.length === 0) return res.status(400).json({ error: "At least one agent is required." });
  if (!Number.isInteger(maxTurns) || maxTurns < 2 || maxTurns > 12) return res.status(400).json({ error: "maxTurns must be between 2 and 12." });

  const id = "dbt-" + randomUUID();
  try {
    await insertRun({
      id, status: "running", phase: "agent_turn",
      context: String(context).slice(0, 4000),
      snapshot, agents, max_turns: maxTurns,
      current_agent: agents[0],
    });
  } catch (err) {
    console.error("debate start failed:", err);
    return res.status(502).json({ error: "Could not start the debate. Check that 0004_debate_runs.sql has been applied." });
  }

  await dispatchStep(id);
  return res.status(200).json({ runId: id });
}

async function handleStep(req, res) {
  const { runId, token } = req.body || {};
  if (!runId || !workerTokenValid(runId, token)) return res.status(403).json({ error: "Forbidden" });
  if (!supabaseConfigured()) return res.status(503).json({ error: "No datastore configured." });

  // Claim it. Zero rows back is a normal outcome — somebody else holds the lease,
  // or the run already finished — and the correct response is to do nothing at
  // all rather than to advance it a second time.
  let run;
  try {
    const claimed = await rpc("claim_debate_step", { p_id: runId, p_lease_seconds: LEASE_SECONDS });
    run = Array.isArray(claimed) ? claimed[0] : claimed;
  } catch (err) {
    console.error("debate claim failed:", runId, err?.message);
    return res.status(200).json({ ok: false, reason: "claim_failed" });
  }
  if (!run) return res.status(200).json({ ok: false, reason: "not_claimable" });

  const stepFn = STEPS[run.phase];
  if (!stepFn) {
    await patchRun(runId, { status: "failed", error: `Unknown phase "${run.phase}".`, lease_until: null });
    return res.status(200).json({ ok: false });
  }

  let patch;
  try {
    patch = await stepFn(run);
  } catch (err) {
    console.error("debate step failed:", runId, run.phase, err?.message);
    // The transcript stays. A debate that dies on turn seven is still six turns of
    // evidence, and the browser can synthesise from it — the same guarantee the
    // client-side version gained, preserved here.
    await patchRun(runId, {
      status: "failed",
      error: String(err?.message || err).slice(0, 500),
      lease_until: null,
    });
    return res.status(200).json({ ok: false });
  }

  try {
    // Releasing the lease is part of the same write that advances the run, so
    // there is no window where a step has finished but the run still looks held.
    await patchRun(runId, { lease_until: null, ...patch });
  } catch (err) {
    console.error("debate write failed:", runId, err?.message);
    return res.status(200).json({ ok: false });
  }

  if ((patch.status || run.status) === "running") await dispatchStep(runId);
  return res.status(200).json({ ok: true });
}

async function handleStatus(req, res) {
  const who = await rateLimitIdentity(req);
  if (who.error) { res.status(401).json({ error: who.error }); return; }
  if (await guardRateLimit(req, res, {
    key: `gos:debate:poll:${who.id}`,
    max: POLL_RATE_LIMIT_MAX,
    limitMessage: "Too many status checks. Wait a moment.",
    label: "Debate poll",
  })) return;

  const runId = req.body?.runId;
  if (typeof runId !== "string" || !runId) return res.status(400).json({ error: "runId is required." });

  try {
    // Deliberately not `*`: the snapshot is the whole portfolio and the browser
    // already has it. Sending it back on every poll would make a two-second
    // interval expensive for no reason.
    const run = await readRun(runId, "id,status,phase,transcript,turn_index,max_turns,results,error,note,updated_at,current_agent");
    if (!run) return res.status(404).json({ error: "No such debate." });
    return res.status(200).json({ run });
  } catch (err) {
    console.error("debate status failed:", err?.message);
    return res.status(502).json({ error: "Could not read the debate." });
  }
}

/**
 * Restart runs whose chain broke.
 *
 * Called by the client while it polls, which means an operator who reopens the app
 * repairs their own stalled runs simply by looking at them — no cron, no plan
 * dependency, and the repair happens exactly when somebody cares about the result.
 */
async function handleSweep(req, res) {
  try {
    const ids = await rpc("sweep_stalled_debates", { p_limit: 5 });
    const list = Array.isArray(ids) ? ids.map(r => (typeof r === "string" ? r : r?.id ?? r)) : [];
    for (const id of list) await dispatchStep(id);
    return res.status(200).json({ restarted: list.length });
  } catch (err) {
    console.error("debate sweep failed:", err?.message);
    // A failed sweep is not worth surfacing: the next poll tries again, and the
    // run it would have restarted is no worse off than before.
    return res.status(200).json({ restarted: 0 });
  }
}
