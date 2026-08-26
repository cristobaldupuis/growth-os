// The debate's prompts, separated from the act of sending them.
//
// ## Why this split exists
//
// The debate now runs on the server (see api/debate.js), and the admin console's
// test bench still runs it from the browser. Both need exactly the same prompts —
// a bench that compared models against a reconstruction of the production prompt
// would be measuring something nobody ships.
//
// The three call modules used to hold prompt construction and HTTP in one
// function. `postProxy` is a browser thing: it posts to a relative URL and records
// into a browser-held ledger. So the prompts move here, as pure functions of their
// inputs, and both callers build identical bodies from them. The call modules keep
// their signatures and read from this; the server imports the same functions.
//
// Nothing here touches the network, React, or storage, which is what lets the same
// file be imported by a serverless function and a Vite bundle.

import { EFFORT, buildRequest, modelFor } from "./models.js";
import { MODERATOR_FORMAT, DEBATE_SYNTHESIS_FORMAT } from "./schemas.js";
import { INIT_TYPES } from "../../constants.js";

/** Per-persona marching orders. The whole value of the debate is that these
 *  genuinely conflict — see the note on the `debate` group in registry.js. */
export const MANDATES = {
  "CMO":  "Your mandate: argue for investment in growth and acquisition even when the data is early or mixed. You believe underinvestment is a bigger risk than overspend. Push back hard on anyone who says 'wait for more data' or 'protect margin first'.",
  "CFO":  "Your mandate: protect margin and challenge every spend assumption. You do not accept revenue projections at face value. Ask who is accountable for the number, what the downside looks like, and whether the same capital has a better home elsewhere.",
  "CGO":  "Your mandate: the north star gap is your only scorecard. Every proposal must be evaluated on whether it closes that gap within the horizon. You will kill debates about tactics that don't move the number, and accelerate anything that does.",
  "CRO":  "Your mandate: pipeline and retention are the only levers that matter. You are sceptical of brand and awareness plays. You want to know the conversion path from any proposed initiative before you'll support it.",
  "CPO":  "Your mandate: product and experience are the moat. You push back on quick-win tactics that erode the customer experience or create technical debt. You champion initiatives that compound over time, not one-off lifts.",
  "COO":  "Your mandate: every initiative is a demand on finite operational capacity. You veto anything where the dependency chain is longer than the team's current bandwidth, and you demand that blockers be resolved as a condition of approval — not after. You are not the person who says it's hard. You are the person who says exactly what it costs to make it happen and what has to stop so it can.",
};

export const mandateFor = (label) =>
  MANDATES[label] || "Your mandate: represent your strategic lens forcefully and push back on anything that conflicts with it.";

/**
 * One agent's system prompt.
 *
 * The portfolio snapshot leads, then the persona. That order is load-bearing for
 * two reasons: it is identical across every agent and every turn, so it forms a
 * cacheable prefix the whole debate shares; and putting the persona first would
 * break that prefix at the first agent change. See the caching note in models.js.
 */
export function agentSystem(agent, portfolioCtx, userContext) {
  return `PORTFOLIO SNAPSHOT — the live state of the business under discussion:
${portfolioCtx}

SITUATION CONTEXT:
${userContext || "None provided."}

---

You are the ${agent.label} (${agent.icon}) in a C-Suite strategy debate about what this company should be doing that it currently isn't.

Your strategic lens: ${agent.lens}.
Your known blindspot (acknowledge it if relevant): ${agent.blindspot}.
${mandateFor(agent.label)}

You have access to tools that query the live portfolio data. Use them before forming opinions — don't guess at data you can look up.
Be direct, commercially specific, and reference actual initiatives by name.
When you disagree with another executive, state exactly what they got wrong and why — don't soften it.
Your goal: surface HIGH-IMPACT net-new opportunities the team is NOT currently running, and defend your position under challenge.
Max 180 words per turn. No filler. Speak like a real boardroom executive who has a point of view and will fight for it.`;
}

/** The user message that opens a turn. */
export const agentOpeningMessage = (isFirstTurn, agentLabel) =>
  isFirstTurn
    ? "Open the debate. Use your tools to look deeper at anything in the portfolio that concerns you, then make your case for what's being overlooked."
    : `${agentLabel}: It's your turn. Use tools if needed, then give your take — push back on what's been said or add what's being missed.`;

/**
 * The request body for one agent-turn model call.
 *
 * `withTools` is false on the final permitted tool iteration, which is how the
 * loop is terminated: an agent with no tools left to call has to answer. It
 * replaces a throw that used to fail the entire debate from inside one turn.
 */
export function agentTurnRequest({ agent, portfolioCtx, userContext, messages, tools, withTools = true, model }) {
  return {
    ...buildRequest({
      model: model || modelFor("debate"),
      maxTokens: 600,
      system: agentSystem(agent, portfolioCtx, userContext),
      effort: EFFORT.LOW,
      // Both breakpoints earn their place and cache different things: the system
      // one covers the portfolio snapshot, identical across the whole debate; the
      // message one covers the conversation so far, which otherwise gets re-billed
      // in full on every call including each tool round-trip.
      cacheSystem: true,
      cacheMessages: true,
    }),
    ...(withTools && tools ? { tools } : {}),
    messages,
  };
}

/** The moderator's system prompt — flow control between turns. */
export function moderatorSystem(agents, turnCount, maxTurns) {
  const agentLabels = agents.map(a => a.label).join(", ");
  return `You are the debate Moderator for a C-Suite strategy session.
Your job: read the current debate and decide what happens next.
Agents available: ${agentLabels}.
Current turn: ${turnCount}. Maximum turns: ${maxTurns}.

Return ONLY a JSON object (no markdown) with this structure:
{
  "decision": "continue" | "followup" | "synthesise",
  "next_agent": "<agent label — required if decision is continue or followup>",
  "followup_prompt": "<specific question to put to next_agent — required if decision is followup, null otherwise>",
  "reason": "<one sentence on why you made this decision>"
}

Rules:
- "continue": normal next turn, rotate to an agent who hasn't spoken recently or who has a mandate-driven reason to weigh in
- "followup": USE THIS when two agents have taken opposing positions — force the challenged agent to respond directly. The followup_prompt must name the specific claim being contested, e.g. "The CFO said your revenue projection is unsupported — respond to that specific objection." Use followup aggressively in turns 2-5 to generate real tension before synthesizing.
- "synthesise": the debate has surfaced genuine opposing positions, key tensions have been directly contested, and you have enough signal to produce differentiated initiatives. Do not synthesize if agents have only agreed with each other.
- Force "synthesise" if turnCount >= ${maxTurns - 1}

Priority: favour "followup" over "continue" whenever there is an unresolved disagreement in the transcript. Consensus too early produces generic output.`;
}

/** Transcript rendered for a prompt that reads it rather than continues it. */
export const renderTranscript = (transcript, sep = "\n\n---\n\n") =>
  (transcript || []).map(m => `${m.icon} ${m.label}: ${m.text}`).join(sep);

export function moderatorRequest({ portfolioCtx, userContext, transcript, agents, turnCount, maxTurns, model }) {
  return {
    ...buildRequest({
      model: model || modelFor("debate"),
      maxTokens: 300,
      system: moderatorSystem(agents, turnCount, maxTurns),
      effort: EFFORT.LOW,
      format: MODERATOR_FORMAT,
    }),
    messages: [{
      role: "user",
      content: `Portfolio:\n${portfolioCtx}\n\nContext:\n${userContext || "none"}\n\nTranscript so far:\n${renderTranscript(transcript)}\n\nDecide what happens next.`,
    }],
  };
}

/** The CSO synthesis system prompt — resolve the debate into initiatives. */
export function synthesisSystem(cats) {
  return `You are a Chief Strategy Officer synthesizing a C-Suite debate into net-new growth initiatives.

Your job is not to summarise the debate — it is to resolve it. Where executives disagreed, you must take a position and explain why you're proceeding despite the objection. Where they agreed, scrutinise whether consensus was earned or just convenient.

Rules:
- NET NEW only — not already in the active or draft pipeline.
- Each initiative must be grounded in specific data from the portfolio tools, not just debate rhetoric.
- The championedBy and dissentVoice fields are not decorative — they are the executive summary. A CGO reading this card should immediately understand who is accountable, who is skeptical, and why you're proceeding anyway.
- Rank by expected impact on the north star metric, highest first.
- Be brutally specific. Dollar estimates must be grounded in actual portfolio win rates and revenue figures from the data.

Return ONLY a valid JSON array of exactly 3 objects. No markdown, no preamble. If a response schema is enforced, return the list under an 'items' key; otherwise return the bare array.
{
  "title": "concise specific title (max 12 words)",
  "observation": "2-3 sentences grounded in the portfolio data and debate that justify this — cite specific numbers where available",
  "hypothesis": "We believe that [specific change] will result in [measurable outcome] for [context], because [evidence from debate/data].",
  "successMetric": "single measurable KPI that defines a win",
  "primaryMetric": "short label",
  "killCriteria": "specific stop/pivot condition with a number",
  "category": "one of: ${cats.join(", ")}",
  "initType": "one of: ${INIT_TYPES.join(", ")}",
  "ice": { "impact": <1-10>, "certainty": <1-10>, "ease": <1-10> },
  "revenueImpact": <integer dollar estimate grounded in portfolio data>,
  "championedBy": "<agent label> — <specifically what data or argument drove them to push for this>",
  "dissentVoice": "<agent label> — <their specific objection and the number or risk they cited>",
  "whyNotAlreadyRunning": "honest one-sentence on why this gap exists — be specific, not generic",
  "csoRationale": "one sentence: why you're proceeding despite the dissent — this is your call as CSO"
}`;
}

/** The data appendix the synthesis reads alongside the transcript. */
export function synthesisAppendix(portfolioTools) {
  return `\nDATA APPENDIX:\nWin rates by category: ${JSON.stringify(portfolioTools.execute("get_win_rate_by_category"))}` +
    `\nFailures: ${JSON.stringify(portfolioTools.execute("get_failure_patterns"))}` +
    `\nCoverage: ${JSON.stringify(portfolioTools.execute("get_category_coverage"))}`;
}

export function synthesisRequest({ portfolioCtx, userContext, transcript, cats, portfolioTools, model }) {
  const transcriptStr = (transcript || []).map(m => `${m.icon} ${m.label}:\n${m.text}`).join("\n\n---\n\n");
  return {
    ...buildRequest({
      model: model || modelFor("debate"),
      maxTokens: 3500,
      system: synthesisSystem(cats),
      effort: EFFORT.HIGH,
      format: DEBATE_SYNTHESIS_FORMAT,
    }),
    messages: [{
      role: "user",
      content: `Portfolio:\n${portfolioCtx}${synthesisAppendix(portfolioTools)}\n\nContext:\n${userContext || "None."}\n\nDebate:\n${transcriptStr}\n\nSynthesize the 3 highest-impact net-new initiatives.`,
    }],
  };
}

/** Every tool_use block in a response, as the executor needs them. */
export const toolCallsIn = (content) => (content || []).filter(b => b.type === "tool_use");

/** The assistant text of a finished turn. Filters by block type, so a leading
 *  thinking block cannot swallow the answer — see firstText in _shared.js. */
export const turnText = (content) =>
  (content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
