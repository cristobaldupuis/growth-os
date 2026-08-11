import { postProxy, firstText } from "./_shared.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";

// Natural-language query over the learnings library. The query IS the hypothesis:
// "have we tried creative angles for subscription retention?" returns whether the
// team explored it, what happened, and the verdict — pulling from learnings, not titles.
// Relevance is semantic-first; recency is weighed only WITHIN a relevance tier, so a
// 4-year-old BFCM learning still beats a recent non-seasonal one for a BFCM question.
export async function callAskLibrary(question, corpus, settings, modelOverride) {
  const todayStr = new Date().toISOString().slice(0,10);
  const lines = corpus.map(l => {
    let s = "["+l.initId+"] ("+l.outcome+"|"+l.retailer+"|"+l.category+"|"+l.durability+(l.provenance?"|"+l.provenance:"")+"|closed "+(l.closedDate||"unknown")+")";
    s += "\n    learning: "+l.learning;
    if (l.decision)   s += "\n    decision: "+l.decision;
    if (l.hypothesis) s += "\n    hypothesis: "+l.hypothesis;
    return s;
  }).join("\n\n");
  const sys = [
    "You are the institutional memory of "+settings.companyName+", a "+settings.businessModel+" business. Today is "+todayStr+".",
    "Someone is asking whether the team has already explored something. Answer from the closed-initiative record below — not generic best practice.",
    "RELEVANCE FIRST: find initiatives semantically relevant to the question, including near-misses and adjacent attempts. Match on meaning, not keywords.",
    "RECENCY SECOND: weigh recency only WITHIN a relevance tier. A highly relevant older learning outranks a marginally relevant recent one. For seasonal questions, a same-context learning from years ago beats recent off-context work.",
    "DURABILITY: structural learnings stay reliable with age; tactical learnings older than ~12 months may reflect shifted conditions — surface but flag the caveat.",
    "PROVENANCE: a 'backfilled' learning's outcome is a remembered estimate, not a tracked result — surface it but flag the lower confidence; a 'tracked' learning is firmer evidence.",
    "Answer in three parts: VERDICT, WHAT WE FOUND, READ. Cite ids in [BRACKETS] exactly as given. Be honest about gaps. No generic advice.",
  ].join(" ");
  const data = await postProxy({
    group:"analysis", fn:"callAskLibrary",
    body:{ ...buildRequest({model:modelFor("analysis", modelOverride), maxTokens:1100, system:sys, effort:EFFORT.LOW}),
      messages:[{role:"user", content:"QUESTION: "+question+"\n\nCLOSED-INITIATIVE RECORD:\n"+lines}] },
  });
  return firstText(data);
}
