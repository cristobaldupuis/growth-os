// Bench probes — how the console exercises a feature group.
//
// ## The design constraint this file exists to satisfy
//
// A model picker with a free-text box next to it is a toy. It would tell you which
// model writes nicer prose about whatever you happened to type, which is not the
// question. The questions that matter here are things like: does this model hold
// the CFO persona against the CMO instead of agreeing, does it stop inventing
// learning IDs that aren't in the corpus, does it keep returning parseable JSON
// against the variants schema. None of those are visible unless the bench runs the
// *actual* production prompt, with the *actual* portfolio behind it.
//
// So every probe below calls the same exported `call*` function the app calls, with
// the same arguments, differing only in the trailing `modelOverride`. There is no
// second copy of any prompt in this file, and there deliberately cannot be one —
// if a prompt changes, the bench follows it automatically, because the bench is
// calling the thing that changed.
//
// ## Where the data comes from
//
// The console is a separate page on the same origin, which means it shares
// localStorage with the app. So `loadContext` reads the operator's real portfolio
// through the same `store` and the same keys App.jsx uses — real initiatives, real
// settings, real brand briefs, real weekly metrics. Comparing models on the actual
// portfolio is the entire point; comparing them on invented fixtures would measure
// something nobody cares about.
//
// Where a probe needs an input the portfolio cannot supply (a rough idea to
// capture, a question to ask the library) it takes free text with a workable
// default. Where it needs a whole object the portfolio may not have yet (an
// approved creative brief) there is a canned fallback, clearly marked.

import { store, KEY_ITEMS, KEY_SETTINGS, KEY_METRICS, KEY_CREATIVE } from "../services/store.js";
import { DEFAULT_SETTINGS, DEFAULT_AGENTS, applyBrandBriefDefaults } from "../constants.js";
import { buildPortfolioContext, buildLearningsIndex, buildPortfolioTools } from "../services/portfolio.js";
import { resolveSchema } from "../services/naming.js";

import { callQuickCapture } from "../services/ai/callQuickCapture.js";
import { callExpandHypothesis } from "../services/ai/callExpandHypothesis.js";
import { callSuggestICE } from "../services/ai/callSuggestICE.js";
import { callGenerateCandidates } from "../services/ai/callGenerateCandidates.js";
import { callExpandRecommendation } from "../services/ai/callExpandRecommendation.js";
import { callSynthesizeLearnings } from "../services/ai/callSynthesizeLearnings.js";
import { callAskLibrary } from "../services/ai/callAskLibrary.js";
import { callAgentTurn } from "../services/ai/callAgentTurn.js";
import { callModerator } from "../services/ai/callModerator.js";
import { callDebateSynthesis } from "../services/ai/callDebateSynthesis.js";
import { callCreativeBrief } from "../services/ai/callCreativeBrief.js";
import { callCreativeVariants } from "../services/ai/callCreativeVariants.js";
import { callGenerateImage, buildImagePrompt } from "../services/ai/callGenerateImage.js";

/**
 * Read the operator's live portfolio out of localStorage and derive everything the
 * probes need from it.
 *
 * Falls back to DEFAULT_SETTINGS on a cold browser so the bench is usable on a
 * fresh deployment; `isEmpty` lets the UI say the comparison is running against
 * nothing real rather than letting someone draw a conclusion from it.
 */
export async function loadContext() {
  const [ir, sr, mr, cr] = await Promise.all([
    store.get(KEY_ITEMS), store.get(KEY_SETTINGS), store.get(KEY_METRICS), store.get(KEY_CREATIVE),
  ]);
  const parse = (rec, fallback) => {
    if (!rec?.value) return fallback;
    try { return JSON.parse(rec.value); } catch { return fallback; }
  };

  const items = parse(ir, []);
  const settings = parse(sr, DEFAULT_SETTINGS);
  const weeklyMetrics = parse(mr, []);
  const creative = parse(cr, []);

  const brands = (settings.brands || DEFAULT_SETTINGS.brands || []).map(applyBrandBriefDefaults);
  const cats = settings.categories || DEFAULT_SETTINGS.categories;
  const agents = (settings.agents?.length ? settings.agents : DEFAULT_AGENTS);

  return {
    items, settings, brands, cats, agents, weeklyMetrics, creative,
    portfolioCtx:   buildPortfolioContext(items, settings, brands, "all", weeklyMetrics),
    learningsIndex: buildLearningsIndex(items, brands),
    tools:          buildPortfolioTools(items, settings, brands, "all"),
    schema:         resolveSchema(settings),
    isEmpty:        items.length === 0,
  };
}

// A closed initiative makes a better probe subject than a draft — several prompts
// read `results`, and one with none produces a thinner comparison.
const pickInitiative = (ctx, id) =>
  (id && ctx.items.find(i => i.id === id)) ||
  ctx.items.find(i => i.results?.keyLearning) ||
  ctx.items[0] ||
  null;

// Canned only where the portfolio genuinely may not hold one yet. Marked in the UI
// so nobody mistakes a fixture result for a result about their own brand.
const FALLBACK_BRIEF = {
  insight: "Buyers do not trust before-and-after imagery in this category.",
  promise: "See the product used, unedited, by someone who is not being paid to like it.",
  proof: ["single unbroken take", "no post-production", "named reviewer"],
  formatGuidance: "Vertical, 25-35s, captions burned in.",
  claimsToVerify: ["clinically proven", "results in 7 days"],
  angles: [
    { slug: "TimeSaver", label: "Time saver", theory: "They are buying back minutes.", execution: "Handheld, morning setting.", openingBeat: "Presenter checks the clock." },
    { slug: "MacroMath", label: "Macro math", theory: "They are buying the numbers.", execution: "On-screen macro overlay.", openingBeat: "Label held to camera." },
  ],
};

const FALLBACK_TRANSCRIPT = [
  { icon: "📣", label: "CMO", text: "We are underinvested in top of funnel and the CAC story is a symptom of that, not the cause. Every week we wait, the gap to target gets more expensive to close." },
  { icon: "📊", label: "CFO", text: "Show me payback inside the quarter or it does not happen. Who owns the number, and what does the downside look like if the creative does not land?" },
];

/**
 * The probes, by group.
 *
 * Each probe declares:
 *   id, label, blurb  — what it is and what it tells you
 *   inputs            — free-text fields the operator supplies, with defaults
 *   needs             — "items" when it cannot run against an empty portfolio
 *   run(ctx, i, m)    — invoke the real call with modelOverride `m`
 *
 * `run` returns whatever the production function returns. The bench renders it as
 * formatted JSON rather than trying to interpret it, because every group's shape is
 * different and the raw structure is what an operator judging a model actually
 * wants to see.
 */
export const PROBES = {
  capture: [
    {
      id: "quickCapture",
      label: "Quick Capture",
      blurb: "Does it turn a half-formed idea into a correctly-shaped initiative, with a hypothesis in the required form?",
      inputs: { description: "Checkout feels slow on mobile and I think the address step is where people give up" },
      run: (ctx, i, m) => callQuickCapture(i.description, ctx.settings, ctx.cats, ["A/B Test", "Campaign", "Feature", "Content"], m),
    },
    {
      id: "expandHypothesis",
      label: "Hypothesis Builder",
      blurb: "Does it produce \"We believe X will result in Y for Z, because W\" without inventing a mechanism nobody claimed?",
      inputs: { rough: "shorter checkout will convert better", title: "Collapse the address step" },
      run: (ctx, i, m) => callExpandHypothesis(i.rough, i.title, ctx.settings, "", m),
    },
    {
      id: "suggestICE",
      label: "ICE Assist",
      blurb: "Does it score impact and certainty defensibly, and does its rationale reference the actual initiative rather than generic reasoning?",
      needs: ["items"],
      run: (ctx, i, m) => callSuggestICE(pickInitiative(ctx, i.initiativeId), ctx.settings, "", m),
      usesInitiative: true,
    },
  ],

  analysis: [
    {
      id: "generateCandidates",
      label: "Next Plays — candidates",
      blurb: "The hardest test in this group: does it find non-obvious plays across the whole portfolio, and are its sourceLearningIds real?",
      needs: ["items"],
      run: (ctx, i, m) => callGenerateCandidates(ctx.portfolioCtx, ctx.learningsIndex, ctx.settings, ctx.cats, m),
    },
    {
      id: "askLibrary",
      label: "Ask the Library",
      blurb: "Does it answer from the corpus and cite it, or does it answer from general marketing knowledge?",
      needs: ["items"],
      inputs: { question: "What has actually worked for us on retention, and what did we learn from anything that failed?" },
      run: (ctx, i, m) => callAskLibrary(i.question, ctx.items, ctx.settings, m),
    },
    {
      id: "synthesizeLearnings",
      label: "Learning Synthesis",
      blurb: "Does it find a pattern across closed initiatives, or restate them one at a time?",
      needs: ["items"],
      run: (ctx, i, m) => callSynthesizeLearnings(ctx.items, ctx.settings, m),
    },
    {
      id: "expandRecommendation",
      label: "Next Plays — expansion",
      blurb: "Pass 2. Does it turn a one-line candidate into a full pre-registration with kill criteria that would actually kill it?",
      needs: ["items"],
      inputs: { title: "Test a post-purchase referral prompt at the order-confirmation step", category: "Retention" },
      run: (ctx, i, m) => callExpandRecommendation(
        { title: i.title, category: i.category, rationale: "Retention is the thinnest category in the portfolio and referral has no coverage." },
        ctx.portfolioCtx, ctx.learningsIndex, ctx.settings, m,
      ),
    },
  ],

  debate: [
    {
      id: "agentTurn",
      label: "Agent turn (with portfolio tools)",
      blurb: "The capability test. Does it call the portfolio tools to get its facts, and does it argue its mandate rather than hedging?",
      needs: ["items"],
      inputs: { context: "Black Friday is 8 weeks out and gross margin compressed 4pts this quarter." },
      // isFirstTurn true so the agent opens rather than responding to nothing.
      run: (ctx, i, m) => callAgentTurn(ctx.agents[0], ctx.portfolioCtx, i.context, [], ctx.tools, true, m),
    },
    {
      id: "moderator",
      label: "Moderator",
      blurb: "Flow control. Does it end the debate when the disagreement is resolved, or let it run on?",
      inputs: { context: "Black Friday is 8 weeks out and gross margin compressed 4pts this quarter." },
      run: (ctx, i, m) => callModerator(ctx.portfolioCtx, i.context, FALLBACK_TRANSCRIPT, ctx.agents, 2, 6, m),
    },
    {
      id: "debateSynthesis",
      label: "Debate synthesis",
      blurb: "Does it resolve the CMO/CFO tension into a decision, or average the two positions into something nobody argued for?",
      needs: ["items"],
      inputs: { context: "Black Friday is 8 weeks out and gross margin compressed 4pts this quarter." },
      run: (ctx, i, m) => callDebateSynthesis(ctx.portfolioCtx, i.context, FALLBACK_TRANSCRIPT, ctx.cats, ctx.settings, ctx.tools, m),
    },
  ],

  creative: [
    {
      id: "creativeBrief",
      label: "Creative brief",
      blurb: "Does it ground the brief in the brand brief and the hypothesis, and does it put unsupported claims in claimsToVerify rather than in the promise?",
      needs: ["items"],
      run: (ctx, i, m) => callCreativeBrief(
        pickInitiative(ctx, i.initiativeId), ctx.brands[0], ctx.learningsIndex, ctx.settings, ctx.schema, m,
      ),
      usesInitiative: true,
    },
    {
      id: "creativeVariants",
      label: "Ad variants",
      blurb: "Copy craft against a schema. Does it write hooks worth testing, and does it keep every claimsToVerify item out of the script?",
      needs: ["items"],
      run: (ctx, i, m) => {
        // Prefer a brief the operator has actually approved; fall back to the
        // canned one so this probe still runs on a portfolio with no creative yet.
        const stored = ctx.creative.find(r => r.brief?.angles?.length)?.brief;
        return callCreativeVariants(
          stored || FALLBACK_BRIEF, pickInitiative(ctx, i.initiativeId), ctx.brands[0], ctx.schema, { perAngle: 2 }, m,
        );
      },
      usesInitiative: true,
      note: "Uses your most recent approved brief when there is one, otherwise a canned brief.",
    },
  ],

  image: [
    {
      id: "generateImage",
      label: "Key frame",
      blurb: "Compares frame quality at roughly four cents per image per model. The prompt is assembled from a brief, exactly as Creative Studio does it.",
      needs: ["items"],
      run: async (ctx, i, m) => {
        const brief = ctx.creative.find(r => r.brief?.angles?.length)?.brief || FALLBACK_BRIEF;
        const variant = brief.angles[0];
        const prompt = buildImagePrompt(brief, variant, ctx.brands[0]);
        const img = await callGenerateImage({ prompt, aspectRatio: "4:5", model: m });
        // Hand back the prompt too — a frame is only judgeable against what was asked for.
        return { prompt, mimeType: img.mimeType, data: img.data };
      },
    },
  ],

  // Video is deliberately absent. Every provider renders asynchronously over
  // 60-170s, so a side-by-side would mean holding several minute-long polls open and
  // spending per second on each — and the comparison an operator actually needs
  // before a video render (what do these two tiers cost for this exact script) is
  // already shown in Creative Studio's tier picker, pre-spend, without generating
  // anything. Routing the video group still works; there is just no bench for it.
  video: [],
};

/** Probe by group and id. */
export const probeFor = (group, id) => (PROBES[group] || []).find(p => p.id === id) || (PROBES[group] || [])[0] || null;

/**
 * Run one probe against one model, timing it and catching failure.
 *
 * Never throws: a model failing IS a result, and one column erroring should not
 * take down the comparison. A thrown error is the most informative outcome the
 * bench can show for "this model cannot do this job" — a 400 for an unsupported
 * parameter, a schema the parser could not read — so it is captured and rendered
 * rather than swallowed.
 */
export async function runProbe({ probe, ctx, inputs, model }) {
  const startedAt = performance.now();
  try {
    const output = await probe.run(ctx, inputs, model);
    return { model, ok: true, ms: Math.round(performance.now() - startedAt), output };
  } catch (err) {
    return { model, ok: false, ms: Math.round(performance.now() - startedAt), error: err?.message || String(err) };
  }
}
