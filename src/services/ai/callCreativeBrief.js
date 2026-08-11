import { postProxy, firstText, safeParseJSON } from "./_shared.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";
import { selectLearnings, formatEvidenceBlock } from "../creativeEvidence.js";

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

export async function callCreativeBrief(initiative, brand, learningsIndex, settings, schema, modelOverride, opts = {}) {
  // Ranked and capped by a stated rule rather than by array position, and the
  // remainder is counted so both the prompt and the operator can be told what
  // was left out. See services/creativeEvidence.js for why this is a rule and
  // not a retrieval step.
  const selection = selectLearnings(learningsIndex, initiative);
  const learningsBlock = selection.total === 0
    ? "  (no closed initiatives yet — the brief must rest on the brand brief and hypothesis alone, and should say so in `evidenceGaps`)"
    : selection.shown.map(l => {
        const rev = l.actualRev != null
          ? `actual ${l.actualRev >= 0 ? "+" : "-"}$${Math.abs(l.actualRev).toLocaleString()}`
          : "actual revenue not recorded";
        return `  [${l.id}] (${l.outcome}|${l.category}|${rev}|closed ${l.closedDate || "unknown"}) "${l.title}" — ${l.learning}`;
      }).join("\n");

  // Stated in the prompt, not just in the record. A model shown 25 of 51
  // learnings and told so can qualify its claim; one shown 25 of 51 and told
  // nothing will write as though it read the corpus.
  const selectionNote = selection.excluded > 0
    ? `\n  (${selection.shown.length} of ${selection.total} closed learnings shown, selected by ${selection.rule}. ` +
      `${selection.excluded} not shown — do not claim to have reviewed the full record.)`
    : "";

  // Measured returns per creative dimension, from imported ad names. Absent
  // until a performance CSV has been imported, which is the honest common case
  // early in an engagement.
  const evidenceBlock = formatEvidenceBlock(opts.evidence);

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
  const angleDim = (schema?.dimensions || []).find(d => d.key === "angle");
  const angleRule = angleDim
    ? `Each angle's \`slug\` must be a legal value for the "${angleDim.label}" slot of the ad naming convention: CamelCase, no spaces, no "${schema.delimiter}", under 20 characters (e.g. TimeSaver, MorningRoutine, MacroMath).`
    : "Each angle's `slug` must be CamelCase with no spaces, under 20 characters.";

  const sys = [
    "You are a creative director briefing paid social work for " + settings.companyName + ", a " + settings.businessModel + " business.",
    "North star: " + settings.northStarMetric + " (current: " + settings.northStarCurrent + ", target: " + settings.northStarTarget + ").",
    "",
    "You are briefing ONE initiative. The team already has the hypothesis. Your job is to turn it into creative direction that a creator or designer can shoot against, and to make the round falsifiable.",
    "",
    "RULES:",
    "  • Ground the brief in the brand brief, the closed learnings, and the MEASURED PERFORMANCE supplied. Cite specific learning ids in `evidenceCited` when a learning genuinely informs a choice. An empty array is the honest answer when nothing applies — do not manufacture citations.",
    "  • Measured performance outranks a written learning when they disagree. A learning is what somebody concluded; the performance table is what the ad account did. If you propose an angle the table shows losing, say so and justify it.",
    "  • A group marked [THIN] is below the reporting floor and is NOT evidence. Do not cite its ratio as a reason for anything. If a thin group is the only signal for a direction you like, the honest move is to name it in `evidenceGaps` as something worth testing properly, not to treat it as proven.",
    "  • Do not claim coverage you do not have. If the block says learnings were excluded, or that rows did not parse, your reasoning covers what you were shown and nothing more.",
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
    learningsBlock + selectionNote,
    "",
    "MEASURED PERFORMANCE — what this account's own ad names actually returned, by creative dimension:",
    evidenceBlock,
  ].join("\n");

  const data = await postProxy({
    group:"creative", fn:"callCreativeBrief",
    initiativeId: initiative?.id || null,
    body:{ ...buildRequest({ model:modelFor("creative", modelOverride), maxTokens:2600, system:sys, effort:EFFORT.HIGH, cacheSystem:true }),
      messages:[{ role:"user", content:user }] },
  });
  const raw = firstText(data) || "{}";
  const parsed = safeParseJSON(raw, false);
  if (!parsed || typeof parsed !== "object") throw new Error("Creative brief returned a malformed response.");

  // The selection is returned with the brief rather than recomputed later,
  // because it describes what THIS brief was allowed to see. Recomputing it
  // against a corpus that has since grown would describe a brief that never ran.
  return {
    ...parsed,
    evidenceConsidered: {
      learningsShown: selection.shown.length,
      learningsTotal: selection.total,
      learningsExcluded: selection.excluded,
      rule: selection.rule,
      performanceRows: opts.evidence?.rowCount || 0,
      performanceSpend: opts.evidence?.totalSpend || 0,
    },
  };
}
