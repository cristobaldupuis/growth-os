import { postProxy, firstText } from "./_shared.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

// The opposite failure mode from the creative brief's, and it took the same fix.
// The brief silently truncated at 25; this call passed EVERY learning with no cap
// at all, so a portfolio that grows past a few hundred closed initiatives stops
// producing a synthesis and starts producing a context-length error. A cap that
// reports itself beats both.
//
// Higher than the brief's 25 because the whole point of this call is breadth —
// GAPS is defined by comparing retailers, and a sample too small to contain two
// retailers cannot find one. Most recent first, since a synthesis of what to do
// next is worth more built on this year's evidence than on the first year's.
export const SYNTHESIS_LIMIT = 120;

export async function callSynthesizeLearnings(learnings, settings, modelOverride) {
  const all = learnings || [];
  const ordered = [...all].sort((a, b) =>
    String(b.closedDate || "").localeCompare(String(a.closedDate || "")));
  const used = ordered.slice(0, SYNTHESIS_LIMIT);
  const excluded = all.length - used.length;

  const lines = used.map((l,i)=>String(i+1)+". ["+l.outcome+"]["+l.category+"]["+l.retailer+"] "+l.learning).join("\n")
    + (excluded > 0
        ? `\n\n(${used.length} of ${all.length} closed learnings shown, most recently closed first. `
          + `${excluded} older learnings are not in this synthesis — say so if you are asked for a complete picture.)`
        : "");
  const retailers = [...new Set(used.map(l=>l.retailer))].join(", ");
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
  const data = await postProxy({
    group:"analysis", fn:"callSynthesizeLearnings",
    body:{ ...buildRequest({model:modelFor("analysis", modelOverride), maxTokens:1200, system:sys, effort:EFFORT.LOW}),
      messages:[{role:"user", content:"Learnings to synthesize:\n"+lines}] },
  });
  return firstText(data);
}
