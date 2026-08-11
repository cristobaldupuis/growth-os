import { postProxy, safeParseJSON } from "./_shared.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

// Moderator — decides what happens next after each agent turn
export async function callModerator(portfolioCtx, userContext, transcript, agents, turnCount, maxTurns, modelOverride) {

  const agentLabels = agents.map(a=>a.label).join(", ");
  const transcriptStr = transcript.map(m=>`${m.icon} ${m.label}: ${m.text}`).join("\n\n---\n\n");

  const sys = `You are the debate Moderator for a C-Suite strategy session.
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

  const data = await postProxy({
    group:"debate", fn:"callModerator",
    body: {
      ...buildRequest({model:modelFor("debate", modelOverride), maxTokens:300, system:sys, effort:EFFORT.LOW}),
      messages:[{role:"user", content:`Portfolio:\n${portfolioCtx}\n\nContext:\n${userContext||"none"}\n\nTranscript so far:\n${transcriptStr}\n\nDecide what happens next.`}],
    },
  });
  const raw = data.content?.[0]?.text?.trim()||"{}";
  const parsed = safeParseJSON(raw, false);
  // Moderator failure is non-fatal — fall back to "continue with next agent"
  return parsed || { decision: "continue", next_agent: null, followup_prompt: null, reason: "Moderator response unparseable; continuing." };
}
