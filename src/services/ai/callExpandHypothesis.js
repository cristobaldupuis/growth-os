import { PROXY_URL, AI_HEADERS, proxyError } from "./_shared.js";
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
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ ...buildRequest({model:modelFor("capture", modelOverride), maxTokens:300, system:sys, effort:EFFORT.LOW}),
      messages:[{role:"user", content:"Title: "+(title||"none")+". Rough idea: "+rough}] }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "The AI service returned an error.");
  return data.content && data.content[0] ? data.content[0].text.trim() : "";
}
