import { PROXY_URL, AI_HEADERS, safeParseJSON, proxyError } from "./_shared.js";
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
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ ...buildRequest({model:modelFor("capture", modelOverride), maxTokens:400, system:sys, effort:EFFORT.LOW}),
      messages:[{role:"user", content:user}] }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "The AI service returned an error.");
  const raw   = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  return safeParseJSON(raw, false) || null;
}
