import { PROXY_URL, AI_HEADERS, proxyError } from "./_shared.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

// Single agent turn with tool use — agentic: agent decides what data to fetch
export async function callAgentTurn(agent, portfolioCtx, userContext, messageHistory, portfolioTools, isFirstTurn, modelOverride) {

  const mandates = {
    "CMO":  "Your mandate: argue for investment in growth and acquisition even when the data is early or mixed. You believe underinvestment is a bigger risk than overspend. Push back hard on anyone who says 'wait for more data' or 'protect margin first'.",
    "CFO":  "Your mandate: protect margin and challenge every spend assumption. You do not accept revenue projections at face value. Ask who is accountable for the number, what the downside looks like, and whether the same capital has a better home elsewhere.",
    "CGO":  "Your mandate: the north star gap is your only scorecard. Every proposal must be evaluated on whether it closes that gap within the horizon. You will kill debates about tactics that don't move the number, and accelerate anything that does.",
    "CRO":  "Your mandate: pipeline and retention are the only levers that matter. You are sceptical of brand and awareness plays. You want to know the conversion path from any proposed initiative before you'll support it.",
    "CPO":  "Your mandate: product and experience are the moat. You push back on quick-win tactics that erode the customer experience or create technical debt. You champion initiatives that compound over time, not one-off lifts.",
    "COO":  "Your mandate: every initiative is a demand on finite operational capacity. You veto anything where the dependency chain is longer than the team's current bandwidth, and you demand that blockers be resolved as a condition of approval — not after. You are not the person who says it's hard. You are the person who says exactly what it costs to make it happen and what has to stop so it can.",
  };
  const agentMandate = mandates[agent.label] || "Your mandate: represent your strategic lens forcefully and push back on anything that conflicts with it.";

  const sys = `You are the ${agent.label} (${agent.icon}) in a C-Suite strategy debate about what this company should be doing that it currently isn't.

Your strategic lens: ${agent.lens}.
Your known blindspot (acknowledge it if relevant): ${agent.blindspot}.
${agentMandate}

You have access to tools that query the live portfolio data. Use them before forming opinions — don't guess at data you can look up.
Be direct, commercially specific, and reference actual initiatives by name.
When you disagree with another executive, state exactly what they got wrong and why — don't soften it.
Your goal: surface HIGH-IMPACT net-new opportunities the team is NOT currently running, and defend your position under challenge.
Max 180 words per turn. No filler. Speak like a real boardroom executive who has a point of view and will fight for it.`;

  const firstUserMsg = `Portfolio snapshot:\n${portfolioCtx}\n\nSituation context:\n${userContext||"None provided."}\n\nOpen the debate. Use your tools to look deeper at anything in the portfolio that concerns you, then make your case for what's being overlooked.`;

  const messages = isFirstTurn
    ? [{ role:"user", content: firstUserMsg }]
    : [...messageHistory, { role:"user", content:`${agent.label}: It's your turn. Use tools if needed, then give your take — push back on what's been said or add what's being missed.` }];

  // Agentic loop — agent may call multiple tools before responding
  let currentMessages = messages;
  let iterations = 0;
  const MAX_TOOL_ITERS = 4;

  while (iterations < MAX_TOOL_ITERS) {
    const resp = await fetch(PROXY_URL, {
      method:"POST", headers:AI_HEADERS(),
      body: JSON.stringify({
        ...buildRequest({model:modelFor("debate", modelOverride), maxTokens:600, system:sys, effort:EFFORT.LOW, cacheSystem:true}),
      tools: portfolioTools.definitions,
        messages: currentMessages,
      }),
    });
    if (!resp.ok) throw new Error(await proxyError(resp));
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const stopReason = data.stop_reason;
    const content = data.content || [];

    if (stopReason === "tool_use") {
      // Execute all tool calls
      const toolResults = content
        .filter(b => b.type === "tool_use")
        .map(b => ({
          type:"tool_result",
          tool_use_id: b.id,
          content: JSON.stringify(portfolioTools.execute(b.name)),
        }));

      // Add assistant turn + tool results to history
      currentMessages = [
        ...currentMessages,
        { role:"assistant", content },
        { role:"user", content: toolResults },
      ];
      iterations++;
    } else {
      // Final text response
      const text = content.filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      // Return text + the tool calls made (for transparency in UI)
      const _toolsUsed = content.filter(b=>b.type==="tool_use").map(b=>b.name);
      // Also gather tool calls from the loop
      const allToolsUsed = currentMessages
        .flatMap(m => Array.isArray(m.content) ? m.content : [])
        .filter(b => b.type==="tool_use")
        .map(b=>b.name);
      return { text, toolsUsed:[...new Set(allToolsUsed)] };
    }
  }
  throw new Error("Agent exceeded tool iteration limit");
}
