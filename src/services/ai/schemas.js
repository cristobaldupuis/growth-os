// JSON schemas for the structured call sites.
//
// ## Why these exist
//
// Every JSON-returning call in this app used to work the same way: describe the
// shape in the system prompt, hope, then run the response through
// `safeParseJSON`, which strips markdown fences, hunts for the largest balanced
// bracket pair, and wraps a stray object in an array. That fallback chain is
// three separate recoveries from the same root cause — the model was asked for
// JSON in prose and answered in prose.
//
// `output_config.format` removes the cause. The provider constrains generation to
// the schema, so the response parses by construction. `safeParseJSON` stays as
// the path for models that do not support it (see `structuredOutputs` in
// registry.js — every non-Anthropic entry today), which is why the prompts still
// describe the shape as well. Belt and braces, deliberately: the prompt text is
// what a Gemini or OpenAI routing depends on, and deleting it would make the
// console's model picker a trap.
//
// ## Two rules these all follow
//
//   1. **Root is always an object.** Structured outputs constrain a root object,
//      not a root array, so the calls that want a list return `{items: [...]}`
//      and unwrap it at the call site. `unwrap()` below handles both shapes, so a
//      response from a non-schema model — which really does return a bare array —
//      is read correctly by the same code.
//
//   2. **`additionalProperties: false` everywhere.** Without it the model may add
//      keys, and a key nobody reads is a key somebody will eventually read by
//      accident. Being strict here is what makes the parsed object safe to spread.
//
// Field descriptions are omitted: the system prompts already carry the real
// instructions, at length, and duplicating them here would create two places to
// change one rule. The schema's job is shape, not guidance.

/** A required string field. */
const str = { type: "string" };
/** A required array-of-strings field. */
const strList = { type: "array", items: { type: "string" } };
/** An integer bounded to the ICE 1-10 range. */
const iceScore = { type: "integer", minimum: 1, maximum: 10 };

/** Wrap a schema as an `output_config.format` value. */
const format = (schema) => ({ type: "json_schema", schema });

/** An object schema with every listed key required and nothing else allowed. */
function obj(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/**
 * A list-returning schema, wrapped in an object because the root must be one.
 *
 * The key is always `items`, so `unwrap` has one thing to look for rather than a
 * per-call convention nobody can remember.
 */
function listOf(itemSchema) {
  return obj({ items: { type: "array", items: itemSchema } });
}

/**
 * Read a list response whether it came back wrapped or bare.
 *
 * A model with structured outputs returns `{items: [...]}` because that is what
 * the schema demanded. A model without them returns the bare `[...]` the prompt
 * asked for. Both are correct for their path, and the call site should not have
 * to know which model it was routed to — so this accepts either.
 */
export function unwrap(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.items)) return parsed.items;
  return [];
}

// -- Capture & Framing ---------------------------------------------------------

export const QUICK_CAPTURE_FORMAT = format(obj({
  title: str,
  hypothesis: str,
  category: str,
  initType: str,
  primaryMetric: str,
  killCriteria: str,
  notes: str,
}));

export const SUGGEST_ICE_FORMAT = format(obj({
  impact: iceScore,
  impact_rationale: str,
  certainty: iceScore,
  certainty_rationale: str,
}));

// -- Portfolio Analysis --------------------------------------------------------

export const CANDIDATES_FORMAT = format(listOf(obj({
  title: str,
  category: str,
  brandTarget: str,
  rationale: str,
  // Constrained rather than described, because App.jsx ranks on exactly these
  // three strings and silently scores anything else as 0 — a model answering
  // "moderate" instead of "medium" would sort to the bottom for no visible reason.
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  confidenceRationale: str,
  sourceLearningIds: strList,
})));

export const EXPAND_RECOMMENDATION_FORMAT = format(obj({
  observation: str,
  hypothesis: str,
  successMetric: str,
  primaryMetric: str,
  killCriteria: str,
  initType: str,
  impact: iceScore,
  impactRationale: str,
  certainty: iceScore,
  certaintyRationale: str,
  reasoningTrace: str,
}));

// -- Signal AI Debate ----------------------------------------------------------

export const MODERATOR_FORMAT = format(obj({
  decision: { type: "string", enum: ["continue", "followup", "synthesise"] },
  // Nullable rather than optional: `required` covers every key, and the
  // moderator genuinely has nothing to name when it decides to synthesise.
  next_agent: { type: ["string", "null"] },
  followup_prompt: { type: ["string", "null"] },
  reason: str,
}));

export const DEBATE_SYNTHESIS_FORMAT = format(listOf(obj({
  title: str,
  observation: str,
  hypothesis: str,
  successMetric: str,
  primaryMetric: str,
  killCriteria: str,
  category: str,
  initType: str,
  ice: obj({ impact: iceScore, certainty: iceScore, ease: iceScore }),
  revenueImpact: { type: "integer" },
  championedBy: str,
  dissentVoice: str,
  whyNotAlreadyRunning: str,
  csoRationale: str,
})));

// -- Creative Direction --------------------------------------------------------

export const CREATIVE_BRIEF_FORMAT = format(obj({
  insight: str,
  promise: str,
  proof: strList,
  angles: {
    type: "array",
    items: obj({
      slug: str,
      label: str,
      theory: str,
      execution: str,
      openingBeat: str,
    }),
  },
  formatGuidance: str,
  wouldFalsify: str,
  claimsToVerify: strList,
  evidenceCited: strList,
  evidenceGaps: str,
}));

/**
 * Variants carry a `naming` object whose keys are the schema's own dimension
 * slots, which vary per deployment — so this one is built at the call site from
 * the live naming schema rather than being a constant here. Everything else
 * about it is fixed.
 */
export function creativeVariantsFormat(segmentKeys) {
  const naming = {
    type: "object",
    properties: Object.fromEntries((segmentKeys || []).map(k => [k, str])),
    required: [...(segmentKeys || [])],
    additionalProperties: false,
  };
  return format(listOf(obj({
    angleSlug: str,
    label: str,
    varies: str,
    hook: str,
    script: strList,
    cta: str,
    rationale: str,
    naming,
  })));
}
