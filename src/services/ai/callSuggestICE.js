import { postProxy, parseStructured } from "./_shared.js";
import { SUGGEST_ICE_FORMAT } from "./schemas.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

export async function callSuggestICE(form, settings, dataCtx, modelOverride) {

  const sys = [
    "You help growth teams score initiatives using ICE for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Score only Impact (1-10) and Certainty (1-10). Ease is excluded.",
    "Impact: how significantly could this move the north star? 1=negligible, 10=game-changing.",
    "Certainty: how confident should the team be the hypothesis is directionally right? 1=gut feel, 10=strong evidence.",
    "Return ONLY a JSON object with keys: impact (int 1-10), impact_rationale (string), certainty (int 1-10), certainty_rationale (string). No markdown.",
    dataCtx ? "Data context: "+dataCtx : "",
  ].join(" ");
  const user = [
    "Title: "+(form.title||"none"),
    "Type: "+(form.initType||"none"),
    "Category: "+(form.category||"none"),
    "Hypothesis: "+(form.hypothesis||"none"),
    "Primary metric: "+(form.primaryMetric||"none"),
    "Kill criteria: "+(form.killCriteria||"none"),
    "Revenue estimate: $"+(form.revenueImpact||0),
  ].join(". ");
  const data = await postProxy({
    group:"capture", fn:"callSuggestICE",
    body:{ ...buildRequest({model:modelFor("capture", modelOverride), maxTokens:400, system:sys, effort:EFFORT.LOW, format:SUGGEST_ICE_FORMAT}),
      messages:[{role:"user", content:user}] },
  });
  // Returns null rather than throwing: ICE Assist is an optional aid beside a
  // form the operator can fill in themselves, so a failure here should leave the
  // form alone rather than interrupt it.
  try { return parseStructured(data, { label: "ICE Assist" }); }
  catch (err) { console.warn("ICE Assist:", err.message); return null; }
}
