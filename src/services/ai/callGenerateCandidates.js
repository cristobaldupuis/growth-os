import { PROXY_URL, AI_HEADERS, safeParseJSON } from "./_shared.js";

// -- Next Plays (Recommendation Engine) ---------------------------------------
// Two-step pattern: (1) cheap candidate generation across portfolio state and
// learnings, (2) per-candidate expansion with full hypothesis + ICE + reasoning.
// Single-step prompts produced shallow output because the model rationed tokens
// across too many tasks at once.

// Step 1: cheap pass. Generate 5-7 candidate ideas with one-line reasoning so
// the model casts a wide net before we spend tokens expanding.
export async function callGenerateCandidates(portfolioCtx, learningsIndex, settings, cats) {
  const learningsBlock = learningsIndex.length === 0
    ? "  (no completed initiatives yet — recommendations must rely on portfolio state and brand briefs only)"
    : learningsIndex.slice(0, 30).map(l =>
        `  [${l.id}] (${l.outcome}|${l.retailer}|${l.category}|${l.durability}|${l.provenance}|closed ${l.closedDate||"unknown"}) ${l.learning}`
      ).join("\n");

  const candTodayStr = new Date().toISOString().slice(0,10);
  const weightingPolicy = "EVIDENCE WEIGHTING: Each learning carries a closed date, a durability tag (structural | tactical), and a provenance tag (tracked | backfilled). Today is "+candTodayStr+". Weight evidence by recency AND durability AND provenance, not recency alone. Tactical learnings lose evidentiary weight as they age; a tactical result older than ~12 months reflects conditions that may have shifted, so it should not by itself veto a fresh idea. Structural learnings describe enduring truths and stay binding regardless of age. PROVENANCE: 'tracked' learnings ran through the system with a frozen launch prediction, so their prediction-vs-actual is real evidence; 'backfilled' learnings are imported history whose outcome is a remembered estimate, so treat them as directional only — they can inform and suggest, but should not by themselves justify high confidence. Down-weight backfilled provenance the same way you down-weight stale tactical results; never discard a learning purely for being backfilled — a reconstructed truth about seasonality or audience is still true, just note the lower confidence in your reasoning. As tracked learnings accumulate they naturally outweigh backfilled ones; lean on tracked evidence first when both point in the same direction, and surface the tension when they conflict.";

  const sys = [
    "You are a growth strategist generating next-experiment recommendations for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Your job: propose 5-7 high-quality candidate experiments grounded in (a) the current portfolio state, (b) the learnings library, and (c) any live metrics movements.",
    "Each candidate must be specific to this business — no generic playbook items. If a candidate is essentially a replay or close cousin of something already running or already in drafts, do NOT propose it.",
    "Prefer candidates that exploit gaps: tactics proven at one retailer but not yet tested at another, uncovered categories with revenue potential, or metrics moving the wrong way that no current initiative addresses.",
    weightingPolicy,
    "Return ONLY a JSON array of 5-7 objects. Each object must have these keys exactly:",
    "title (string, concise, specific), category (one of: "+cats.join(", ")+"),",
    "brandTarget (string — retailer name if the candidate is brand-specific, or 'Portfolio' if cross-brand),",
    "rationale (string, one sentence — why this, why now, anchored in what you saw in the context),",
    "sourceLearningIds (array of strings — item ids from the LEARNINGS block that informed this candidate; empty array if none).",
    "No markdown, no preamble, just the JSON array.",
  ].join(" ");

  const user = "PORTFOLIO CONTEXT:\n"+portfolioCtx+"\n\nLEARNINGS (id | outcome|retailer|category | one-line learning):\n"+learningsBlock;

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1600, system:sys,
      messages:[{role:"user", content:user}] }),
  });
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "[]";
  const parsed = safeParseJSON(raw, true);
  if (!Array.isArray(parsed)) throw new Error("Next Plays: candidate generation returned malformed response.");
  return parsed;
}
