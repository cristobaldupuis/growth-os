import { PROXY_URL, AI_HEADERS, safeParseJSON } from "./_shared.js";

// Step 2: expand one selected candidate into a full recommendation. Run in
// parallel for the top 3 so a single failure doesn't sink the whole batch.
export async function callExpandRecommendation(candidate, portfolioCtx, learningsIndex, settings) {
  // Filter learnings to just the ones the candidate cited, so the expander
  // grounds its reasoning trace in real history rather than re-inventing context.
  const citedLearnings = (candidate.sourceLearningIds || [])
    .map(id => learningsIndex.find(l => l.id === id))
    .filter(Boolean);
  const citedBlock = citedLearnings.length === 0
    ? "  (this candidate did not cite specific past learnings)"
    : citedLearnings.map(l =>
        `  [${l.id}] (${l.outcome}|${l.retailer}|${l.category}|${l.durability}|${l.provenance}|closed ${l.closedDate||"unknown"}) ${l.title} — ${l.learning}`
      ).join("\n");

  const sys = [
    "You are expanding a growth experiment candidate into a fully-specified recommendation for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Return ONLY a JSON object with these keys exactly:",
    "observation (string — what specifically in the portfolio context or learnings prompted this — 1-2 sentences, cite numbers if present),",
    "hypothesis (string — format: We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason]),",
    "successMetric (string — the one metric that would prove or disprove this, plus a concrete threshold if you can defend one),",
    "primaryMetric (string — short label, e.g. 'CVR', 'ROAS', 'CAC'),",
    "killCriteria (string — concrete stop conditions),",
    "initType (one of: A/B Test, Campaign, Process, Research, Infrastructure),",
    "impact (int 1-10), impactRationale (string, one sentence),",
    "certainty (int 1-10), certaintyRationale (string, one sentence — explicitly reference cited learnings if any),",
    "When setting certainty, weight cited learnings by recency, durability, AND provenance: a stale tactical learning (closed >~12mo ago, tagged tactical) supports lower certainty than a recent or structural one, and a backfilled learning (outcome is a remembered estimate, no frozen prediction) supports lower certainty than a tracked one. If high certainty rests on an old tactical or a backfilled learning, say so in the rationale.",
    "reasoningTrace (string — 2-3 sentences explaining the full logic: why this, why now, what specific evidence supports it. Reference the cited learnings by what they showed, not by id.).",
    "Be specific. No hedging. No generic advice. If certainty is high, the cited learnings should justify it.",
  ].join(" ");

  const user = [
    "CANDIDATE:",
    "  Title: "+candidate.title,
    "  Category: "+candidate.category,
    "  Brand target: "+(candidate.brandTarget||"Portfolio"),
    "  Initial rationale: "+candidate.rationale,
    "",
    "CITED LEARNINGS:",
    citedBlock,
    "",
    "PORTFOLIO CONTEXT:",
    portfolioCtx,
  ].join("\n");

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, system:sys,
      messages:[{role:"user", content:user}] }),
  });
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const parsed = safeParseJSON(raw, false);
  if (!parsed) throw new Error("Next Plays: expansion returned malformed response for '"+candidate.title+"'.");
  return parsed;
}
