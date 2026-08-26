import { postProxy, parseStructured } from "./_shared.js";
import { QUICK_CAPTURE_FORMAT } from "./schemas.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

export async function callQuickCapture(description, settings, cats, initTypes, modelOverride) {
  const sys = [
    "You help growth teams structure initiative ideas for "+settings.companyName+", a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Given a rough description, extract and structure an initiative.",
    "Return ONLY valid JSON with these keys:",
    "title (string, concise), hypothesis (string, format: We believe that X will result in Y for Z, because W),",
    "category (one of: "+cats.join(", ")+"),",
    "initType (one of: "+initTypes.join(", ")+"),",
    "primaryMetric (string), killCriteria (string), notes (string, optional context).",
    "No markdown, no explanation, just the JSON object.",
  ].join(" ");
  const data = await postProxy({
    group:"capture", fn:"callQuickCapture",
    body:{ ...buildRequest({model:modelFor("capture", modelOverride), maxTokens:600, system:sys, effort:EFFORT.LOW, format:QUICK_CAPTURE_FORMAT}),
      messages:[{role:"user", content:"Rough idea: "+description}] },
  });
  return parseStructured(data, { label: "Quick capture" });
}
