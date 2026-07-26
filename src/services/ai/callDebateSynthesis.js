import { PROXY_URL, AI_HEADERS, safeParseJSON, proxyError } from "./_shared.js";
import { MODELS, EFFORT, buildRequest } from "./models.js";
import { INIT_TYPES } from "../../constants.js";

// Final synthesis — reads full debate + tool outputs, returns 3 structured initiatives
export async function callDebateSynthesis(portfolioCtx, userContext, transcript, cats, settings, portfolioTools) {

  // Give synthesis access to full data too
  const winRate   = portfolioTools.execute("get_win_rate_by_category");
  const failures  = portfolioTools.execute("get_failure_patterns");
  const coverage  = portfolioTools.execute("get_category_coverage");
  const dataAppendix = `\nDATA APPENDIX:\nWin rates by category: ${JSON.stringify(winRate)}\nFailures: ${JSON.stringify(failures)}\nCoverage: ${JSON.stringify(coverage)}`;

  const transcriptStr = transcript.map(m=>`${m.icon} ${m.label}:\n${m.text}`).join("\n\n---\n\n");

  const sys = `You are a Chief Strategy Officer synthesizing a C-Suite debate into net-new growth initiatives.

Your job is not to summarise the debate — it is to resolve it. Where executives disagreed, you must take a position and explain why you're proceeding despite the objection. Where they agreed, scrutinise whether consensus was earned or just convenient.

Rules:
- NET NEW only — not already in the active or draft pipeline.
- Each initiative must be grounded in specific data from the portfolio tools, not just debate rhetoric.
- The championedBy and dissentVoice fields are not decorative — they are the executive summary. A CGO reading this card should immediately understand who is accountable, who is skeptical, and why you're proceeding anyway.
- Rank by expected impact on the north star metric, highest first.
- Be brutally specific. Dollar estimates must be grounded in actual portfolio win rates and revenue figures from the data.

Return ONLY a valid JSON array of exactly 3 objects. No markdown, no preamble:
{
  "title": "concise specific title (max 12 words)",
  "observation": "2-3 sentences grounded in the portfolio data and debate that justify this — cite specific numbers where available",
  "hypothesis": "We believe that [specific change] will result in [measurable outcome] for [context], because [evidence from debate/data].",
  "successMetric": "single measurable KPI that defines a win",
  "primaryMetric": "short label",
  "killCriteria": "specific stop/pivot condition with a number",
  "category": "one of: ${cats.join(", ")}",
  "initType": "one of: ${INIT_TYPES.join(", ")}",
  "ice": { "impact": <1-10>, "certainty": <1-10>, "ease": <1-10> },
  "revenueImpact": <integer dollar estimate grounded in portfolio data>,
  "championedBy": "<agent label> — <specifically what data or argument drove them to push for this>",
  "dissentVoice": "<agent label> — <their specific objection and the number or risk they cited>",
  "whyNotAlreadyRunning": "honest one-sentence on why this gap exists — be specific, not generic",
  "csoRationale": "one sentence: why you're proceeding despite the dissent — this is your call as CSO"
}`;

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body: JSON.stringify({
      ...buildRequest({model:MODELS.REASONING, maxTokens:3500, system:sys, effort:EFFORT.HIGH}),
      messages:[{role:"user", content:
        `Portfolio:\n${portfolioCtx}${dataAppendix}\n\nContext:\n${userContext||"None."}\n\nDebate:\n${transcriptStr}\n\nSynthesize the 3 highest-impact net-new initiatives.`
      }],
    }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  const raw = data.content?.[0]?.text?.trim()||"[]";
  const parsed = safeParseJSON(raw, true);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("The debate produced ideas but the final synthesis came back malformed. Open this debate in History to keep the transcript, then re-run.");
  }
  return parsed;
}
