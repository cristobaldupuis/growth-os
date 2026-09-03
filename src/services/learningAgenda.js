// -- The learning agenda layer (ROADMAP 5.1) ------------------------------------
//
// Today the hierarchy is flat: initiatives. This is the layer above them —
// Learning Agenda → Experiments → Campaigns/ad entities → Metrics — that turns
// a backlog into a research programme. An agenda item is a question the
// business needs answered; initiatives ladder up to it by setting `agendaId`.
//
// ## Backward test design, without a new AI call
//
// ROADMAP 5.1 asks for deriving "what to hold constant, what to vary, the
// sample size, the duration, and the result that would falsify it" from a
// named question. The other AI-assisted flows in this app (Expand, ICE Assist)
// ground themselves in real portfolio evidence — win rates, cited past
// learnings, actual revenue — and an agenda question has none of that yet; it
// is by definition the thing nothing has been run against. An LLM asked to
// invent hold-constant/vary/sample-size for a question with no evidence behind
// it would be producing exactly the confident-sounding filler the rest of this
// product's AI discipline exists to refuse (see callExpandRecommendation's "ICE
// DISCIPLINE" comment). So this is deterministic: the operator's own
// hold-constant/varies/falsifying-result fields on the agenda item are carried
// forward verbatim into the seeded initiative, in the same backward order the
// roadmap describes — name the question, then state what would falsify it,
// then the experiment is built to test exactly that.
//
// Store shape: one flat array under KEY_AGENDA, same as `items`. Small and
// operator-authored, unlike the campaign-scale collections that needed a cap.

import { openContradictions } from "./supersession.js";

export const AGENDA_STATUSES = ["Open","Answered","Parked"];

export const mkAgendaItem = (brandId, cats) => ({
  id: "la-"+Date.now(),
  question: "",
  category: (cats && cats[0]) || "",
  brandId: brandId && brandId!=="all" ? brandId : "default",
  status: "Open",
  holdConstant: "",
  varies: "",
  falsifyingResult: "",
  sampleGuidance: "",
  notes: "",
  createdAt: new Date().toISOString().slice(0,10),
});

/**
 * For each agenda item, the initiatives that ladder up to it and a rollup of
 * where they stand. `hasAnswer` is true once at least one linked initiative has
 * closed with a logged learning — the signal that a question sitting in "Open"
 * might actually be ready to move to "Answered", which stays a human decision
 * (see the status select in AgendaView) rather than something flipped for them.
 */
export function agendaRollup(agenda, items) {
  return (agenda||[]).map(a => {
    const linked = (items||[]).filter(e => e.agendaId === a.id);
    const closed = linked.filter(e => e.status==="Completed" || e.status==="Killed");
    const answered = closed.filter(e => e.results && e.results.keyLearning);
    return {
      ...a,
      linked,
      linkedCount: linked.length,
      runningCount: linked.filter(e=>e.status==="Running").length,
      draftCount: linked.filter(e=>e.status==="Draft").length,
      closedCount: closed.length,
      hasAnswer: answered.length > 0,
      latestLearning: answered.length
        ? answered.slice().sort((x,y)=>(y.endDate||y.createdAt||"").localeCompare(x.endDate||x.createdAt||""))[0].results.keyLearning
        : null,
    };
  });
}

/**
 * Open contradictions, shaped as agenda questions waiting to be adopted
 * (ROADMAP 5.8).
 *
 * Two live learnings that disagree is a finding. It is also, specifically, the
 * highest-value thing a learning agenda question can be pointed at: the
 * business already paid to run both experiments, the disagreement is already in
 * the record, and nobody has to guess whether the question matters — it is the
 * one place the portfolio is provably confused about itself.
 *
 * Derived on every render rather than stored. A contradiction that gets
 * resolved — someone decides which result superseded which — should stop being
 * a question by itself, and a persisted copy would need reconciling against the
 * graph forever. `alreadyAsked` marks the ones an operator has already adopted
 * so the prompt disappears from the list instead of nagging.
 *
 * The proposed question deliberately names both results rather than picking a
 * side. Which one is right is the experiment; asserting it here would be the
 * same confident-filler failure the rest of this layer refuses.
 */
export function contradictionQuestions(items, agenda) {
  const asked = new Set((agenda||[]).map(a => a.fromContradiction).filter(Boolean));
  return openContradictions(items).map(c => ({
    key: c.key,
    a: c.a,
    b: c.b,
    alreadyAsked: asked.has(c.key),
    // Category only when both sides agree on one — a contradiction that spans
    // two categories has no obvious home and guessing gives it a wrong one.
    category: c.a.category && c.a.category === c.b.category ? c.a.category : "",
    question: `Which holds: "${c.a.learning}" or "${c.b.learning}"?`,
    holdConstant: "",
    varies: "",
    falsifyingResult: "",
  }));
}

/**
 * Adopt a contradiction as a real agenda item. Carries `fromContradiction` so
 * the prompt that produced it can retire, and pre-fills the question with both
 * sides named. Everything a person still owns — what to hold constant, what to
 * vary, what would falsify it — stays empty on purpose.
 */
export function agendaItemFromContradiction(contradiction, brandId, cats) {
  const base = mkAgendaItem(brandId, cats);
  return {
    ...base,
    question: contradiction.question,
    category: contradiction.category || base.category,
    fromContradiction: contradiction.key,
    notes: [
      `Contradiction between two closed results.`,
      `[${contradiction.a.ref}] ${contradiction.a.title} (${contradiction.a.provenance}): "${contradiction.a.learning}"`,
      `[${contradiction.b.ref}] ${contradiction.b.title} (${contradiction.b.provenance}): "${contradiction.b.learning}"`,
    ].join("\n"),
  };
}

/**
 * Seed a new Draft initiative from an agenda item's own structured fields —
 * the backward-design step. Returns a partial object to be spread over
 * `mkDefault(...)`'s output, never a full initiative: callers still own id
 * generation, brand defaults, and everything this item has no opinion on.
 */
export function seedInitiativeFromAgenda(agendaItem) {
  if (!agendaItem) return {};
  const varies = agendaItem.varies || "[the variable this experiment varies]";
  const constant = agendaItem.holdConstant
    ? " while holding " + agendaItem.holdConstant + " constant"
    : "";
  return {
    title: agendaItem.question ? agendaItem.question.slice(0,120) : "",
    agendaId: agendaItem.id,
    category: agendaItem.category || "",
    brandId: agendaItem.brandId || "default",
    hypothesis: agendaItem.question
      ? "We believe that " + varies + constant + " will answer: " + agendaItem.question
      : "",
    killCriteria: agendaItem.falsifyingResult || "",
    duration: agendaItem.sampleGuidance || "",
  };
}
