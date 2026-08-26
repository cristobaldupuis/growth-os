import { postProxy } from "./_shared.js";
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

  // The portfolio snapshot lives in the SYSTEM prompt, not in the first user
  // message where it used to sit. Three things follow from that, and the third is
  // the reason:
  //
  //   1. It is identical on every turn of a debate, so it belongs with the other
  //      stable content rather than inside the conversation that grows.
  //   2. Every agent sees the same snapshot regardless of which turn they take,
  //      which is what the debate assumes — previously only the opening agent got
  //      it directly and the rest inherited it through the transcript.
  //   3. It is large. Caching is a prefix match with a 1,024-token minimum on
  //      Sonnet 5, and the persona text alone is ~250 tokens — under the floor, so
  //      `cacheSystem: true` here was silently buying nothing. The snapshot
  //      carries the prefix over the line, and a debate re-sends this system
  //      prompt 25-48 times. That is the difference between paying full input rate
  //      on the portfolio once per debate and once per call.
  //
  // Ordering matters: the per-agent persona goes AFTER the shared snapshot, so the
  // portion of the prefix that is identical across agents comes first and stays
  // cacheable across all of them.
  const sys = `PORTFOLIO SNAPSHOT — the live state of the business under discussion:
${portfolioCtx}

SITUATION CONTEXT:
${userContext||"None provided."}

---

You are the ${agent.label} (${agent.icon}) in a C-Suite strategy debate about what this company should be doing that it currently isn't.

Your strategic lens: ${agent.lens}.
Your known blindspot (acknowledge it if relevant): ${agent.blindspot}.
${agentMandate}

You have access to tools that query the live portfolio data. Use them before forming opinions — don't guess at data you can look up.
Be direct, commercially specific, and reference actual initiatives by name.
When you disagree with another executive, state exactly what they got wrong and why — don't soften it.
Your goal: surface HIGH-IMPACT net-new opportunities the team is NOT currently running, and defend your position under challenge.
Max 180 words per turn. No filler. Speak like a real boardroom executive who has a point of view and will fight for it.`;

  const firstUserMsg = `Open the debate. Use your tools to look deeper at anything in the portfolio that concerns you, then make your case for what's being overlooked.`;

  const messages = isFirstTurn
    ? [{ role:"user", content: firstUserMsg }]
    : [...messageHistory, { role:"user", content:`${agent.label}: It's your turn. Use tools if needed, then give your take — push back on what's been said or add what's being missed.` }];

  // Agentic loop — agent may call multiple tools before responding
  let currentMessages = messages;
  let iterations = 0;
  const MAX_TOOL_ITERS = 4;

  while (iterations <= MAX_TOOL_ITERS) {
    // The last permitted iteration withholds the tools entirely, which forces a
    // text answer because there is nothing left to call.
    //
    // This replaces a `throw new Error("Agent exceeded tool iteration limit")`,
    // and the throw was worse than it looks: it did not fail one turn, it failed
    // the whole debate from CopilotPanel's single try/catch, discarding every
    // turn before it. An agent that wants a fifth lookup has enough to speak
    // with — it has already made four — so the right answer is to ask it to
    // speak, not to abandon the session.
    const lastChance = iterations === MAX_TOOL_ITERS;

    // Inside the tool loop, so each iteration records its own row — a turn that
    // fetches twice before answering cost twice, and a console that showed one
    // row per turn would understate the debate by whatever the tool round-trips
    // came to.
    const data = await postProxy({
      group:"debate", fn:"callAgentTurn",
      body: {
        ...buildRequest({
          model:modelFor("debate", modelOverride), maxTokens:600,
          system:sys, effort:EFFORT.LOW,
          // Both breakpoints earn their place here and they cache different
          // things. The system one covers the portfolio snapshot, identical
          // across every turn of the debate. The message one covers the
          // conversation so far, which grows by one turn each time and is
          // otherwise re-billed in full on every call — including the tool
          // round-trips inside this very loop.
          cacheSystem:true, cacheMessages:true,
        }),
        ...(lastChance ? {} : { tools: portfolioTools.definitions }),
        messages: currentMessages,
      },
    });

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
      // Final text response. Already filters by block type, which is why this
      // call site was the only one adaptive thinking never broke — see the note
      // on firstText in _shared.js.
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
  // Unreachable: the final iteration sends no tools, so it cannot come back with
  // stop_reason "tool_use" and must fall into the branch above. Kept as a guard
  // rather than removed, because "unreachable" is a claim about the provider's
  // behaviour and this is what it costs to be wrong about one.
  return { text: "", toolsUsed: [] };
}
