import { PROXY_URL, AI_HEADERS, safeParseJSON, proxyError } from "./_shared.js";
import { MODELS, EFFORT, buildRequest } from "./models.js";

// -- Creative brief ------------------------------------------------------------
//
// The first half of the creative loop (Ideate -> Brief -> Create -> Launch ->
// Analyze). Takes an initiative that already carries a hypothesis and turns it
// into a brief a creator or designer can actually shoot against.
//
// This runs on the REASONING tier, which is a deliberate departure from the rule
// that "the operator supplies the judgement, the model reshapes it". The other
// structured calls reformat text the operator already wrote. This one has to
// decide which of the portfolio's closed learnings actually bear on this
// hypothesis and which are superficially similar but irrelevant — that is
// evidence-weighing, and it is the whole reason the brief is worth more than a
// blank template. Run it on the cheap tier and it produces a generic brief that
// cites nothing, which is exactly the output the operator can already write.
//
// The brief is deliberately structured around what would FALSIFY the creative
// idea, not just what to make. A brief that can't be wrong can't teach you
// anything, and the point of running creative through an experiment ledger is
// that each round of assets settles a question.

export async function callCreativeBrief(initiative, brand, learningsIndex, settings, schema) {
  const learningsBlock = (learningsIndex || []).length === 0
    ? "  (no closed initiatives yet — the brief must rest on the brand brief and hypothesis alone, and should say so in `evidenceGaps`)"
    : learningsIndex.slice(0, 25).map(l => {
        const rev = l.actualRev != null
          ? `actual ${l.actualRev >= 0 ? "+" : "-"}$${Math.abs(l.actualRev).toLocaleString()}`
          : "actual revenue not recorded";
        return `  [${l.id}] (${l.outcome}|${l.category}|${rev}|closed ${l.closedDate || "unknown"}) "${l.title}" — ${l.learning}`;
      }).join("\n");

  const brandBlock = brand ? [
    "BRAND: " + (brand.name || "unnamed"),
    "  What they sell: " + (brand.whatTheySell || "not specified"),
    "  Categories: "    + (brand.categories   || "not specified"),
    "  ICP: "           + (brand.icp          || "not specified"),
    "  Why they win: "  + (brand.whyTheyWin   || "not specified"),
    "  Constraint: "    + (brand.constraint   || "not specified"),
  ].join("\n") : "BRAND: not specified";

  // The angle segment is the schema's designated experimentation field, so the
  // brief's testable angles have to be expressible there. Naming its vocabulary
  // rule in the prompt is what keeps the generated angles usable as segments
  // rather than sentences that have to be rewritten by hand.
  const angleSeg = (schema?.segments || []).find(s => s.role === "angle");
  const angleRule = angleSeg
    ? `Each angle's \`slug\` must be a legal value for the "${angleSeg.label}" segment of the ad naming convention: CamelCase, no spaces, no "${schema.delimiter}", under 20 characters (e.g. TimeSaver, MorningRoutine, MacroMath).`
    : "Each angle's `slug` must be CamelCase with no spaces, under 20 characters.";

  const sys = [
    "You are a creative director briefing paid social work for " + settings.companyName + ", a " + settings.businessModel + " business.",
    "North star: " + settings.northStarMetric + " (current: " + settings.northStarCurrent + ", target: " + settings.northStarTarget + ").",
    "",
    "You are briefing ONE initiative. The team already has the hypothesis. Your job is to turn it into creative direction that a creator or designer can shoot against, and to make the round falsifiable.",
    "",
    "RULES:",
    "  • Ground the brief in the brand brief and the closed learnings supplied. Cite specific learning ids in `evidenceCited` when a learning genuinely informs a choice. An empty array is the honest answer when nothing applies — do not manufacture citations.",
    "  • The `insight` must be a claim about the buyer, not about the product. 'Buyers of this category distrust before-and-after imagery because they have been burned' is an insight. 'Our product is high quality' is not.",
    "  • `angles` are the competing creative bets this round will settle between. They must be genuinely different theories of why someone buys, not three phrasings of one idea.",
    "  • `wouldFalsify` states what result would tell the team this creative direction is wrong. If you cannot name one, the brief is not testable and you should say so there.",
    "  • Be concrete about execution. 'UGC video' is not direction. 'Handheld, single unbroken take, presenter eats on camera within the first three seconds, no on-screen text before second 4' is.",
    "  • Do not invent product claims, ingredients, certifications, prices or results that are not in the brand brief. If a claim would strengthen the creative but is not supported, put it in `claimsToVerify` instead of asserting it.",
    "",
    angleRule,
    "",
    "Return ONLY a JSON object with these keys exactly:",
    "  insight (string, 1-2 sentences — the buyer truth this round is built on),",
    "  promise (string, one sentence — what the ad promises the viewer),",
    "  proof (array of strings — the specific things on screen that make the promise believable; only what the brand brief supports),",
    "  angles (array of 3-4 objects, each: {slug (string, CamelCase segment-legal), label (string, human-readable), theory (string, one sentence — why someone buys under this angle), execution (string, 2-3 sentences of concrete shooting/design direction), openingBeat (string — literally what happens in the first 3 seconds)}),",
    "  formatGuidance (string, 1-2 sentences — length, aspect, captions, and why),",
    "  wouldFalsify (string — the result that would prove this direction wrong),",
    "  claimsToVerify (array of strings — anything the creative wants to say that the brand brief does not support; empty array if none),",
    "  evidenceCited (array of strings — learning ids that informed this brief; empty array if none),",
    "  evidenceGaps (string — what you would want to know that the portfolio cannot currently tell you).",
    "No markdown, no preamble, just the JSON object.",
  ].join("\n");

  const user = [
    "INITIATIVE",
    "  Title: "          + (initiative.title || "untitled"),
    "  Type: "           + (initiative.initType || "not specified"),
    "  Category: "       + (initiative.category || "not specified"),
    "  Observation: "    + (initiative.observation || "not recorded"),
    "  Hypothesis: "     + (initiative.hypothesis || "not recorded"),
    "  Success metric: " + (initiative.successMetric || initiative.primaryMetric || "not recorded"),
    "  Kill criteria: "  + (initiative.killCriteria || "not set"),
    "",
    brandBlock,
    "",
    "CLOSED LEARNINGS (id | outcome|category|actual revenue|closed date | title — learning):",
    learningsBlock,
  ].join("\n");

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ ...buildRequest({ model:MODELS.REASONING, maxTokens:2600, system:sys, effort:EFFORT.HIGH, cacheSystem:true }),
      messages:[{ role:"user", content:user }] }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "The AI service returned an error.");
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const parsed = safeParseJSON(raw, false);
  if (!parsed || typeof parsed !== "object") throw new Error("Creative brief returned a malformed response.");
  return parsed;
}
