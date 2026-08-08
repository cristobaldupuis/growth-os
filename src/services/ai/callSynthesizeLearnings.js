import { PROXY_URL, AI_HEADERS, proxyError } from "./_shared.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

export async function callSynthesizeLearnings(learnings, settings, modelOverride) {
  const lines = learnings.map((l,i)=>String(i+1)+". ["+l.outcome+"]["+l.category+"]["+l.retailer+"] "+l.learning).join("\n");
  const retailers = [...new Set(learnings.map(l=>l.retailer))].join(", ");
  const sys = [
    "You are synthesizing completed initiative learnings for "+settings.companyName+", a "+settings.businessModel+" business. Active retailers: "+retailers+".",
    "All initiatives are closed. Your job is to turn this evidence into a clear picture of what worked, what gaps exist, what not to repeat, and what to do next.",
    "Respond in exactly four sections:",
    "",
    "PATTERNS",
    "2-3 recurring themes across the closed initiatives. Look across retailers and initiative types — if a mechanic appears at multiple retailers or in multiple categories, call it out explicitly. Name the mechanism, not just the outcome.",
    "",
    "GAPS",
    "Where is a result proven at one retailer but not yet run at another? Format each gap as: [Tactic] is proven at [Retailer A] — not yet tested at [Retailer B/C]. Only include gaps with real evidence behind them.",
    "",
    "LESSONS",
    "1-2 things that failed and why, framed as forward guidance: what specifically to avoid next time and what to do instead. Write in past tense — these are closed initiatives.",
    "",
    "DO NEXT",
    "The 3 highest-confidence actions to run now, based strictly on the evidence in these learnings. Format each as: [Retailer] → [Specific action] → [Why the evidence supports this]. No hedging. Gaps from the GAPS section are automatic candidates.",
    "",
    "Keep bullets tight. No generic advice. Be specific about retailers, mechanics, and expected outcomes where the data supports it.",
  ].join(" ");
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ ...buildRequest({model:modelFor("analysis", modelOverride), maxTokens:1200, system:sys, effort:EFFORT.LOW}),
      messages:[{role:"user", content:"Learnings to synthesize:\n"+lines}] }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  return data.content && data.content[0] ? data.content[0].text.trim() : "";
}
