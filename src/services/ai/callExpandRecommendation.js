import { PROXY_URL, AI_HEADERS, safeParseJSON, proxyError } from "./_shared.js";
import { MODELS, EFFORT, buildRequest } from "./models.js";

// Step 2: expand one selected candidate into a full recommendation. Run in
// parallel for the top 3 so a single failure doesn't sink the whole batch.
// The ICE scores here must be GROUNDED, not vibes: Impact references comparable
// past initiatives and their actual revenue where available; Certainty references
// the category win rate and the cited learnings. Where the data to support a
// score does not exist, the rationale must say so rather than defaulting to a
// safe mid-range number.
export async function callExpandRecommendation(candidate, portfolioCtx, learningsIndex, settings) {
  // Filter learnings to just the ones the candidate cited, so the expander
  // grounds its reasoning trace in real history rather than re-inventing context.
  const citedLearnings = (candidate.sourceLearningIds || [])
    .map(id => learningsIndex.find(l => l.id === id))
    .filter(Boolean);
  const citedBlock = citedLearnings.length === 0
    ? "  (this candidate did not cite specific past learnings — Impact and Certainty must say so explicitly rather than implying evidence that isn't here)"
    : citedLearnings.map(l => {
        const rev = l.actualRev != null ? `actual ${l.actualRev >= 0 ? "+" : "-"}$${Math.abs(l.actualRev).toLocaleString()}` : "actual revenue not recorded";
        return `  [${l.id}] (${l.outcome}|${l.retailer}|${l.category}|${l.durability}|${l.provenance}|${rev}|closed ${l.closedDate||"unknown"}) ${l.title} — ${l.learning}`;
      }).join("\n");

  const sys = [
    "You are expanding a growth experiment candidate into a fully-specified recommendation for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "",
    "Use the PORTFOLIO CONTEXT (which includes WIN RATE BY CATEGORY and the brand/coverage signals) and the CITED LEARNINGS (which carry the actual revenue each past initiative produced) to ground every number you give. Do not invent evidence.",
    "",
    "Return ONLY a JSON object with these keys exactly:",
    "  observation (string — what specifically in the portfolio context or learnings prompted this — 1-2 sentences, cite numbers if present),",
    "  hypothesis (string — format: We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason]),",
    "  successMetric (string — the one metric that would prove or disprove this, plus a concrete threshold if you can defend one),",
    "  primaryMetric (string — short label, e.g. 'CVR', 'ROAS', 'CAC'),",
    "  killCriteria (string — concrete stop conditions),",
    "  initType (one of: A/B Test, Campaign, Process, Research, Infrastructure),",
    "  impact (int 1-10),",
    "  impactRationale (string — must reference a COMPARABLE past initiative and its actual revenue outcome where the cited learnings provide one (e.g. 'NH-016 free-ship threshold returned +$72k actual at this brand'). If no comparable revenue data exists, say so plainly and base the score on the revenue-at-risk / brand-brief signal instead — do NOT pretend to evidence you don't have.),",
    "  certainty (int 1-10),",
    "  certaintyRationale (string — must reference the category WIN RATE from the context and/or the cited learnings. State the win rate if available (e.g. 'Retention win rate 80% over 5 closed'). If the category has thin history, or certainty rests on a stale tactical or backfilled learning, say so and lower the score accordingly.),",
    "",
    "ICE DISCIPLINE: do not default to 5-7 when you lack evidence. If the data is thin, a low score with an honest rationale is more useful than a confident mid-range guess. When setting certainty, weight cited learnings by recency, durability, AND provenance: a stale tactical learning (closed >~12mo ago, tagged tactical) supports lower certainty than a recent or structural one, and a backfilled learning (a remembered estimate, no frozen prediction) supports lower certainty than a tracked one.",
    "",
    "  reasoningTrace (string — 2-3 sentences explaining the full logic: why this, why now, what specific evidence supports it. Reference the cited learnings by what they showed, not by id.).",
    "",
    "Be specific. No hedging language, but no false confidence either. If certainty is high, the cited learnings and win rate must justify it.",
  ].join("\n");

  const user = [
    "CANDIDATE:",
    "  Title: "+candidate.title,
    "  Category: "+candidate.category,
    "  Brand target: "+(candidate.brandTarget||"Portfolio"),
    "  Confidence (from candidate pass): "+(candidate.confidence||"unknown")+(candidate.confidenceRationale?" — "+candidate.confidenceRationale:""),
    "  Initial rationale: "+candidate.rationale,
    "",
    "CITED LEARNINGS (with actual revenue outcomes):",
    citedBlock,
    "",
    "PORTFOLIO CONTEXT:",
    portfolioCtx,
  ].join("\n");

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ ...buildRequest({model:MODELS.STRUCTURED, maxTokens:1200, system:sys, effort:EFFORT.LOW, cacheSystem:true}),
      messages:[{role:"user", content:user}] }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const parsed = safeParseJSON(raw, false);
  if (!parsed) throw new Error("Next Plays: expansion returned malformed response for '"+candidate.title+"'.");
  return parsed;
}
