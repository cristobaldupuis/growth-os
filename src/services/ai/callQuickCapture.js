import { PROXY_URL, AI_HEADERS, safeParseJSON } from "./_shared.js";

export async function callQuickCapture(description, settings, cats, initTypes) {
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
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:600, system:sys,
      messages:[{role:"user", content:"Rough idea: "+description}] }),
  });
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const parsed = safeParseJSON(raw, false);
  if (!parsed) throw new Error("Quick capture: couldn't parse AI response. Try again.");
  return parsed;
}
