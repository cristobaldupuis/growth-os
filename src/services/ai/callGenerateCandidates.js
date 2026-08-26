import { postProxy, parseStructured } from "./_shared.js";
import { CANDIDATES_FORMAT, unwrap } from "./schemas.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

// -- Next Plays (Recommendation Engine) ---------------------------------------
// Two-step pattern: (1) cheap candidate generation across portfolio state and
// learnings, (2) per-candidate expansion with full hypothesis + ICE + reasoning.
// Single-step prompts produced shallow output because the model rationed tokens
// across too many tasks at once.

// Step 1: cheap pass. Generate 5-7 candidate ideas, each grounded in a specific
// signal from the portfolio context, so the model casts a wide net before we
// spend tokens expanding. The candidate's rationale must point at a real signal
// (a named running initiative, a failed test, a proven-but-missing tactic, a
// coverage gap, a win-rate number) — not a general ecommerce best practice.
export async function callGenerateCandidates(portfolioCtx, learningsIndex, settings, cats, modelOverride) {
  const learningsBlock = learningsIndex.length === 0
    ? "  (no completed initiatives yet — recommendations must rely on portfolio state and brand briefs only)"
    : learningsIndex.slice(0, 30).map(l => {
        const rev = l.actualRev != null ? `actual ${l.actualRev >= 0 ? "+" : "-"}$${Math.abs(l.actualRev).toLocaleString()}` : "actual revenue not recorded";
        return `  [${l.id}] (${l.outcome}|${l.retailer}|${l.category}|${l.durability}|${l.provenance}|${rev}|closed ${l.closedDate||"unknown"}) "${l.title}" — ${l.learning}`;
      }).join("\n");

  const candTodayStr = new Date().toISOString().slice(0,10);
  const weightingPolicy = "EVIDENCE WEIGHTING: Each learning carries an outcome, an actual revenue figure (where recorded), a closed date, a durability tag (structural | tactical), and a provenance tag (tracked | backfilled). Today is "+candTodayStr+". Weight evidence by recency AND durability AND provenance, not recency alone. Tactical learnings lose evidentiary weight as they age; a tactical result older than ~12 months reflects conditions that may have shifted, so it should not by itself veto a fresh idea. Structural learnings describe enduring truths and stay binding regardless of age. PROVENANCE: 'tracked' learnings ran through the system with a frozen launch prediction, so their prediction-vs-actual is real evidence; 'backfilled' learnings are imported history whose outcome is a remembered estimate, so treat them as directional only — they can inform and suggest, but should not by themselves justify high confidence. Down-weight backfilled provenance the same way you down-weight stale tactical results; never discard a learning purely for being backfilled — a reconstructed truth about seasonality or audience is still true, just note the lower confidence in your reasoning. As tracked learnings accumulate they naturally outweigh backfilled ones; lean on tracked evidence first when both point in the same direction, and surface the tension when they conflict.";

  const sys = [
    "You are a growth strategist generating next-experiment recommendations for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "",
    "Your job: propose 5-7 high-quality candidate experiments that a sharp growth team would NOT already have on their list — each one earned by a specific fact in the context below, not by general playbook knowledge.",
    "",
    "GROUND EVERY CANDIDATE IN A SPECIFIC SIGNAL. The portfolio context is structured into labelled sections — RUNNING INITIATIVES, COMPLETED (LAST 90 DAYS), WIN RATE BY CATEGORY, FUNNEL/CATEGORY COVERAGE GAPS, CROSS-BRAND GAPS, BRAND BRIEFS, NORTH STAR GAP, and LIVE METRICS. Mine these. A good candidate comes from one of these moves:",
    "  • CROSS-BRAND TRANSFER: a tactic that WON at one brand (named, with its actual revenue) and is absent at another brand whose brief makes it applicable. Name both brands and the proven result.",
    "  • COVERAGE GAP: a funnel/category stage with no running initiative for a specific brand, where the brand brief or live metrics show that gap is costing money.",
    "  • FAILURE-INFORMED RETRY: a test that FAILED for a now-understood reason, where the learning points to a corrected version worth running. Reference the failure and what changed.",
    "  • METRIC DIVERGENCE: a live metric moving the wrong way that no running initiative addresses.",
    "  • PROVEN MECHANIC, NEW SURFACE: a structural learning that holds, applied to a surface where it hasn't been tried.",
    "",
    "Do NOT propose generic ecommerce ideas ('test free shipping threshold', 'try SMS cart recovery', 'add reviews to PDP') unless you can tie them to a specific, named portfolio signal — and if a candidate is essentially a replay or close cousin of something already running or already in drafts, do NOT propose it.",
    weightingPolicy,
    "",
    "Return ONLY a JSON array of 5-7 objects, ordered best-first. Each object must have these keys exactly:",
    "  title (string, concise, specific — names the surface/brand/mechanic, not a category label),",
    "  category (one of: "+cats.join(", ")+"),",
    "  brandTarget (string — the retailer name if brand-specific, or 'Portfolio' if it genuinely spans brands),",
    "  rationale (string, 2-3 sentences — must cite at least one SPECIFIC signal: a named running/completed initiative, a brand, a win-rate number, a coverage gap, or a metric. State why this, and why NOW. No general best practices.),",
    "  confidence (string — exactly one of: low, medium, high — your honest read of how strongly the evidence supports this candidate),",
    "  confidenceRationale (string, one sentence — what evidence sets the confidence at that level; if it rests on thin or backfilled data, say so),",
    "  sourceLearningIds (array of strings — item ids from the LEARNINGS block that informed this candidate; empty array if none).",
    "No markdown, no preamble, just the JSON array. If a response schema is enforced, return the list under an 'items' key; otherwise return the bare array.",
  ].join("\n");

  const user = "PORTFOLIO CONTEXT:\n"+portfolioCtx+"\n\nLEARNINGS (id | outcome|retailer|category|durability|provenance|actual revenue | title — one-line learning):\n"+learningsBlock;

  const data = await postProxy({
    group:"analysis", fn:"callGenerateCandidates",
    body:{ ...buildRequest({model:modelFor("analysis", modelOverride), maxTokens:2200, system:sys, effort:EFFORT.HIGH, cacheSystem:true, format:CANDIDATES_FORMAT}),
      messages:[{role:"user", content:user}] },
  });
  return unwrap(parseStructured(data, { label: "Next Plays candidate generation" }));
}
