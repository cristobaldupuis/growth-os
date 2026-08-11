import { postProxy, firstText } from "./_shared.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

export async function callExpandHypothesis(rough, title, settings, dataCtx, modelOverride) {
  const sys = [
    "You help growth teams write structured initiative hypotheses for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Write a single hypothesis: We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason].",
    "One sentence. No markdown. Use the title to inform the change. Be specific about mechanism. Return only the hypothesis.",
    dataCtx ? "Data context: "+dataCtx : "",
  ].join(" ");
  const data = await postProxy({
    group:"capture", fn:"callExpandHypothesis",
    body:{ ...buildRequest({model:modelFor("capture", modelOverride), maxTokens:300, system:sys, effort:EFFORT.LOW}),
      messages:[{role:"user", content:"Title: "+(title||"none")+". Rough idea: "+rough}] },
  });
  return firstText(data);
}
