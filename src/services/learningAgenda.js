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
