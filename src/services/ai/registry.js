// The model registry — what models exist, what they can do, and which group of
// features each one is currently serving.
//
// ## Why this file exists
//
// models.js already consolidated eleven repeated model-ID literals into two
// named tiers, which fixed the drift problem. It did not fix the *decision*
// problem: which model a feature runs on was still a code literal, so answering
// "what would Gemini produce here" meant editing source, redeploying, and
// having no side-by-side comparison at the end of it.
//
// So model choice becomes data. This file is the data, and it is deliberately
// the only place that knows:
//
//   - which models are reachable at all (MODEL_CATALOGUE)
//   - what each one supports (`caps`)
//   - which features are switched together (FEATURE_GROUPS)
//   - what ships when nobody has chosen anything (DEFAULT_ROUTING)
//
// It is imported by both the browser and the serverless functions — the same
// arrangement api/video.js already uses to import VIDEO_TIERS from
// callGenerateVideo.js. That matters for one specific reason: api/proxy.js
// derives its model allowlist from MODEL_CATALOGUE, so a model the registry does
// not know about cannot be called even if a request asks for it. The allowlist
// stays a server-side control; this file just stops it being a second hand-kept
// copy of the same list.
//
// ## Groups are by job, not by feature
//
// The unit of choice is a group of features that need the same thing from a
// model, because that is the level at which one decision is defensible. Picking
// a model per feature would be twelve decisions nobody can hold in their head,
// and picking one model for everything ignores that ad copy and portfolio
// analysis fail in completely different ways.
//
// Each group declares what it REQUIRES rather than what it prefers, and
// modelsFor() filters the catalogue against that. This is the part that makes
// group-level switching safe instead of a footgun: the Signal AI debate calls
// portfolio tools mid-turn, so a model without tool use cannot be offered for
// that group at all — not warned about, not allowed and logged, simply absent
// from the picker and rejected by validateRouting.

/**
 * Every model this deployment can route to.
 *
 * `caps` is load-bearing, not documentation. buildRequest() in models.js reads
 * it to decide which parameters are legal to send, which is why an unknown model
 * throws there rather than guessing — see the regression note in models.test.js.
 * A new model is added here with its capabilities declared, or it does not work.
 *
 * `caps` keys:
 *   tools             — supports tool/function calling
 *   json              — reliably returns parseable JSON when asked for a schema
 *   adaptiveThinking  — accepts `thinking: {type:"adaptive"}` (4.6 generation and
 *                       later; sending it to an older model is a 400)
 *   effort            — accepts `output_config.effort`
 *   cacheMinTokens    — minimum cacheable prefix; below this a cache breakpoint
 *                       is silently ignored, so marking one buys nothing
 *   longContext       — comfortable reading a whole-portfolio prompt
 *
 * `unverified: true` marks a model ID that has not been confirmed against the
 * provider's own model list. Non-Anthropic IDs are seeded that way on purpose:
 * an ID guessed from a marketing name fails as a 404 at spend time, so the
 * console offers a Verify action that asks the provider instead. Nothing here
 * invents an ID and presents it as confirmed.
 */
export const MODEL_CATALOGUE = [
  // -- Anthropic text ---------------------------------------------------------
  {
    id: "claude-opus-5",
    provider: "anthropic",
    label: "Claude Opus 5",
    modality: "text",
    blurb: "Strongest reasoning. The reach model for a group whose output is the product.",
    caps: { tools: true, json: true, adaptiveThinking: true, effort: true, cacheMinTokens: 1024, longContext: true },
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    modality: "text",
    blurb: "The current default for anything that weighs evidence or holds a position.",
    caps: { tools: true, json: true, adaptiveThinking: true, effort: true, cacheMinTokens: 1024, longContext: true },
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    modality: "text",
    // The two false entries are the reason models.test.js exists — they were
    // sent unconditionally once and it failed only as a runtime 400.
    blurb: "Cheap and fast. Schema-shaped rewriting where the judgement is already made.",
    caps: { tools: true, json: true, adaptiveThinking: false, effort: false, cacheMinTokens: 4096, longContext: false },
  },

  // -- Google Gemini text -----------------------------------------------------
  //
  // ## These two ids are UNCONFIRMED and that is deliberate
  //
  // They are transcriptions of the model names the operator asked to evaluate, not
  // ids read off Google's model list. An id guessed from a marketing name fails as
  // a 404 the first time someone tries to generate something real, which is the
  // worst place to discover it — so both are flagged `unverified` and the console
  // puts a Verify button next to them that asks the provider directly. Clear the
  // flag once Verify says the provider lists them; correct the string here if it
  // does not. This is one line either way.
  //
  // `adaptiveThinking` and `effort` are false because those are Anthropic request
  // parameters — see the note at the top of api/_adapters.js for why the capability
  // table is what suppresses them rather than the adapter silently dropping them.
  // `cacheMinTokens: Infinity` keeps buildRequest from ever marking a cache
  // breakpoint these models would not understand.
  {
    id: "gemini-3.1-pro",
    provider: "gemini",
    label: "Gemini 3.1 Pro",
    modality: "text",
    unverified: true,
    blurb: "Google's reasoning tier. Long context; verify the id before relying on it.",
    caps: { tools: true, json: true, adaptiveThinking: false, effort: false, cacheMinTokens: Infinity, longContext: true },
  },
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    label: "Gemini 3.6 Flash",
    modality: "text",
    unverified: true,
    blurb: "Fast and cheap tier. A candidate for Capture & Framing; verify the id first.",
    caps: { tools: true, json: true, adaptiveThinking: false, effort: false, cacheMinTokens: Infinity, longContext: false },
  },

  // -- OpenAI text ------------------------------------------------------------
  //
  // Same caveat, more strongly: no OpenAI model id was specified, so this is a
  // placeholder carrying the adapter rather than a confirmed model. Run Verify to
  // see what the account actually offers and correct the id here. The adapter in
  // api/_adapters.js is complete and does not change when the id does.
  {
    id: "gpt-5.1",
    provider: "openai",
    label: "OpenAI GPT-5.1",
    modality: "text",
    unverified: true,
    blurb: "Placeholder id — run Verify to list what the account offers, then correct it here.",
    caps: { tools: true, json: true, adaptiveThinking: false, effort: false, cacheMinTokens: Infinity, longContext: true },
  },

  // -- Image ------------------------------------------------------------------
  // "Nano Banana" is the community name for Gemini 2.5 Flash Image. Both IDs are
  // confirmed — they are what api/image.js already calls.
  {
    id: "gemini-2.5-flash-image",
    provider: "gemini",
    label: "Nano Banana (Gemini 2.5 Flash Image)",
    modality: "image",
    blurb: "Fast and cheap, roughly four cents a frame. The default for concepting.",
    caps: {},
  },
  {
    id: "gemini-3-pro-image-preview",
    provider: "gemini",
    label: "Nano Banana Pro (Gemini 3 Pro Image)",
    modality: "image",
    blurb: "Slower and dearer. For a frame that will actually be shown to someone.",
    caps: {},
  },

  // -- Video ------------------------------------------------------------------
  // Video is picked by provider rather than model ID — see the tier reasoning in
  // callGenerateVideo.js. The ids here are the `provider` strings api/video.js's
  // adapter map keys on, so this stays one list rather than a parallel one.
  {
    id: "heygen",
    provider: "heygen",
    label: "HeyGen (Avatar III)",
    modality: "video",
    blurb: "~$0.017/sec. Cheapest viable talking head; fine for reading a hook back.",
    caps: {},
  },
  {
    id: "fabric",
    provider: "fabric",
    label: "VEED Fabric 1.0",
    modality: "video",
    blurb: "~$0.15/sec. Photoreal lip-sync, roughly nine times the price.",
    caps: {},
  },
  {
    id: "did",
    provider: "did",
    label: "D-ID",
    modality: "video",
    blurb: "~$0.035/sec. Above HeyGen without being visibly better; kept reachable, not a tier.",
    caps: {},
  },
];

/** Catalogue as a lookup. */
const BY_ID = MODEL_CATALOGUE.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

/** One catalogue entry, or undefined. */
export const modelById = (id) => BY_ID[id];

/**
 * The feature groups, and what each one needs from a model.
 *
 * `calls` is the honest list of what moves when this group's model changes. It
 * is rendered in the console for exactly that reason — a group-level switch is
 * only a reasonable thing to ask someone to do if they can see its blast radius.
 *
 * `requires` is checked against a model's `caps` by modelsFor/validateRouting.
 * Only list something here if the group genuinely breaks without it.
 */
export const FEATURE_GROUPS = {
  capture: {
    label: "Capture & Framing",
    modality: "text",
    optimiseFor: "JSON reliability, cost and latency. The operator supplies the thinking and reviews the output before it is accepted, so there is no judgement here to lose by running it cheaply.",
    requires: { json: true },
    calls: [
      { fn: "callQuickCapture",     surface: "Quick capture — paste an idea, get a structured initiative" },
      { fn: "callExpandHypothesis", surface: "Hypothesis builder (Initiatives form)" },
      { fn: "callSuggestICE",       surface: "ICE Assist (Initiatives form)" },
    ],
  },
  analysis: {
    label: "Portfolio Analysis",
    modality: "text",
    optimiseFor: "Long-context faithfulness and citation discipline. These calls read the whole portfolio or the whole learnings corpus and must find real patterns in it — a model that invents a learning ID here launders a fabrication into the backlog.",
    requires: { json: true, longContext: true },
    calls: [
      { fn: "callGenerateCandidates",   surface: "Next Plays — candidate generation (pass 1)" },
      { fn: "callExpandRecommendation", surface: "Next Plays — candidate expansion (pass 2)" },
      { fn: "callSynthesizeLearnings",  surface: "Library — synthesise across learnings" },
      { fn: "callAskLibrary",           surface: "Library — ask a question of the corpus" },
    ],
  },
  debate: {
    label: "Signal AI Debate",
    modality: "text",
    optimiseFor: "Persona adherence and willingness to disagree. The whole value is that the CFO genuinely pushes back on the CMO and the synthesis resolves that tension — a model that flattens the disagreement into agreement produces the exact failure the agent mandates exist to prevent.",
    // Tool use is not a preference here. callAgentTurn hands the model portfolio
    // tools and expects it to decide what to fetch mid-turn; without tool calling
    // the agent argues from whatever happened to be in the prompt.
    requires: { tools: true, longContext: true },
    calls: [
      { fn: "callAgentTurn",       surface: "One C-suite agent turn (uses portfolio tools)" },
      { fn: "callModerator",       surface: "Debate flow control — should this continue" },
      { fn: "callDebateSynthesis", surface: "Debate → trackable initiatives" },
    ],
  },
  creative: {
    label: "Creative Direction",
    modality: "text",
    optimiseFor: "Copy craft, brand voice and claim safety. This is taste rather than analysis, which is why it is its own group — the model you would pick for good ad copy is not necessarily the one you would pick for reading a portfolio.",
    requires: { json: true },
    calls: [
      { fn: "callCreativeBrief",    surface: "Creative brief from an initiative" },
      { fn: "callCreativeVariants", surface: "Ad variants from an approved brief" },
    ],
  },
  image: {
    label: "Image Generation",
    modality: "image",
    optimiseFor: "Frame quality per cent spent. Prompts are assembled from an approved brief, never free text — see buildImagePrompt.",
    requires: {},
    calls: [
      { fn: "callGenerateImage", surface: "Creative Studio — key frame from a brief variant" },
    ],
  },
  video: {
    label: "Video Generation",
    modality: "video",
    optimiseFor: "Lip-sync realism per second spent. Billed per second of output, so the script length is the price — see estimateVideoCostUsd.",
    requires: {},
    calls: [
      { fn: "callGenerateVideo", surface: "Creative Studio — talking-head render from a variant script" },
    ],
  },
};

export const GROUP_KEYS = Object.keys(FEATURE_GROUPS);

/**
 * What each group runs on when nobody has chosen anything.
 *
 * These reproduce the behaviour that shipped before routing existed, with two
 * deliberate exceptions. `callExpandRecommendation` and `callCreativeVariants`
 * ran on Haiku as individual calls; under group routing they inherit their
 * group's model and therefore move to Sonnet, which costs more. That is what
 * switching by group rather than by feature means, and both groups can be set
 * back to Haiku from the console. Recorded in DECISIONS.md rather than absorbed
 * quietly — a cost increase nobody chose is worse than one they did.
 */
export const DEFAULT_ROUTING = {
  capture:  "claude-haiku-4-5",
  analysis: "claude-sonnet-5",
  debate:   "claude-sonnet-5",
  creative: "claude-sonnet-5",
  image:    "gemini-2.5-flash-image",
  video:    "heygen",
};

/** True when `model` satisfies every capability `group` requires. */
function satisfies(model, group) {
  const required = group.requires || {};
  return Object.entries(required).every(([cap, want]) => !want || model.caps?.[cap] === true);
}

/**
 * Every model that could legitimately serve `groupKey`.
 *
 * This is what the console's picker is built from, so a model that cannot do the
 * job is absent rather than selectable-and-broken. Returns [] for an unknown
 * group rather than throwing — the caller is usually rendering a list.
 */
export function modelsFor(groupKey) {
  const group = FEATURE_GROUPS[groupKey];
  if (!group) return [];
  return MODEL_CATALOGUE.filter(m => m.modality === group.modality && satisfies(m, group));
}

/**
 * Validate a full or partial routing object. Returns an error string, or null
 * when every entry is acceptable.
 *
 * Called by api/admin.js before anything is persisted, so a routing that would
 * break a group cannot be stored — the app reads this back at boot and a bad
 * value there would fail at the next click rather than at save time. Also unit
 * tested, which is the other reason it returns a string rather than throwing:
 * the message is the thing worth asserting on.
 */
export function validateRouting(routing) {
  if (!routing || typeof routing !== "object" || Array.isArray(routing)) {
    return "Routing must be an object of group → model id.";
  }
  const entries = Object.entries(routing);
  if (entries.length === 0) return "Routing is empty.";

  for (const [groupKey, modelId] of entries) {
    const group = FEATURE_GROUPS[groupKey];
    if (!group) return `Unknown feature group "${groupKey}".`;
    if (typeof modelId !== "string" || !modelId) return `Group "${groupKey}" has no model id.`;

    const model = modelById(modelId);
    if (!model) return `Unknown model "${modelId}" for group "${groupKey}".`;
    if (model.modality !== group.modality) {
      return `"${model.label}" is a ${model.modality} model and cannot serve the ${group.label} group.`;
    }
    if (!satisfies(model, group)) {
      const missing = Object.entries(group.requires || {})
        .filter(([cap, want]) => want && model.caps?.[cap] !== true)
        .map(([cap]) => cap);
      return `"${model.label}" cannot serve ${group.label} — missing: ${missing.join(", ")}.`;
    }
  }
  return null;
}

/**
 * Merge a stored routing over the defaults, dropping anything invalid.
 *
 * Deliberately lenient in this direction, and strict in validateRouting. A
 * stored routing can go stale in a way a submitted one cannot: a model retired
 * from the catalogue in a later deploy leaves a dangling id in Redis, and the
 * right response to that is to serve the default for that one group rather than
 * to fail every AI call in the app. Invalid entries are reported so the caller
 * can surface them instead of swallowing the drift.
 */
export function resolveRouting(stored) {
  const resolved = { ...DEFAULT_ROUTING };
  const dropped = [];
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [groupKey, modelId] of Object.entries(stored)) {
      if (validateRouting({ [groupKey]: modelId }) === null) resolved[groupKey] = modelId;
      else dropped.push(groupKey);
    }
  }
  return { routing: resolved, dropped };
}

/** Text-modality model ids — the source of api/proxy.js's allowlist. */
export const TEXT_MODEL_IDS = MODEL_CATALOGUE.filter(m => m.modality === "text").map(m => m.id);
