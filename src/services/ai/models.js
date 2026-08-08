// Request building and model resolution.
//
// The model ID used to be a string literal repeated across eleven call sites, so
// changing generation meant eleven edits and any one of them could silently drift.
// Consolidating those into two named tiers fixed the drift. It did not make the
// choice changeable without a deploy, which is what registry.js and the admin
// console now add — so the tier constants below have become *defaults* rather
// than the last word, and this file's job is narrower: given a resolved model,
// build a request that model will actually accept.
//
// ## Where the choice lives now
//
// registry.js owns which models exist, what they support, and which group of
// features each one serves. `modelFor(group)` below reads the active routing that
// api/routing.js hands the app at boot, falling back to DEFAULT_ROUTING when
// nothing has been chosen. Call sites name their *group*, not their model.
//
// ## Which group gets what, by default
//
// The split is by *what the call has to do*, not by how important the feature
// feels. Two questions decide it:
//
//   - Does the call have to *reason* — weigh competing evidence, form a position,
//     resolve a disagreement, decide what matters? → a reasoning model.
//   - Or does it have to *restructure* text it has already been given, against a
//     schema, with the judgement already made? → a cheap one.
//
// Capture & Framing is the second class. Reformatting a rough sentence into
// "We believe that X will result in Y for Z, because W" is a transformation, not
// an analysis; the operator supplies the thinking and reviews the output before
// it is accepted. Those calls run on Haiku at roughly a fifth of Sonnet's input
// cost with no quality that a user would notice, because there is no judgement in
// them to lose.
//
// The debate is the opposite. Its entire value is that a CFO persona pushes back
// on a CMO persona and a synthesis step resolves the tension into a defensible
// initiative. Run that on a cheaper tier and the disagreement flattens into
// agreement, which is precisely the failure mode the mandates in config.js exist
// to prevent. Signal AI stays on a reasoning model, and so does anything that has
// to weigh evidence across the portfolio.
//
// ## Cost note
//
// Sonnet 5 is $3/$15 per MTok ($2/$10 promotional through 2026-08-31); Haiku 4.5
// is $1/$5. Sonnet 5 also uses a newer tokenizer that counts roughly 30% more
// tokens for the same text than Sonnet 4.6 did, so per-call cost is not directly
// comparable to the old figures — re-measure rather than assuming the previous
// per-debate estimate carries over.

import { modelById, DEFAULT_ROUTING, resolveRouting } from "./registry.js";

// Kept as named aliases because they read better than a bare ID string, and
// because a handful of tests reference them. They are the *default* for their
// group, not a routing decision — anything that actually dispatches a call
// should ask modelFor().
export const MODELS = {
  /** Reasoning, judgement, multi-step synthesis, adversarial debate. */
  REASONING: "claude-sonnet-5",
  /** Schema-shaped transformation of text the user already supplied. */
  STRUCTURED: "claude-haiku-4-5",
};

// -- Active routing ------------------------------------------------------------
//
// Module-level rather than threaded through arguments because every AI call site
// is a plain async function far from React state, and the alternative is passing
// a routing object through twelve signatures that have no other use for it.
//
// It starts as the defaults and is replaced once by App.jsx at boot. Deliberately
// not awaited anywhere: every AI call in this app is click-initiated, so the
// fetch has long resolved by the time one fires, and a call that somehow beats it
// gets the committed default rather than an error.
let activeRouting = { ...DEFAULT_ROUTING };

/**
 * Install the routing read from /api/routing. Invalid or retired entries fall
 * back to their default — see resolveRouting for why this direction is lenient.
 * Returns the group keys that were dropped, so the caller can log the drift.
 */
export function applyRouting(stored) {
  const { routing, dropped } = resolveRouting(stored);
  activeRouting = routing;
  return dropped;
}

/** The full active routing, for display. */
export const currentRouting = () => ({ ...activeRouting });

/**
 * The model id serving `group`.
 *
 * `override` wins when supplied, which is the whole mechanism behind the admin
 * console's test bench: it calls the real production function with a different
 * model rather than reimplementing the prompt, so what the bench compares is what
 * the app would actually have sent.
 *
 * The override arrives as each call site's last positional parameter, which makes
 * one specific mistake possible: a caller passing an extra argument a function
 * does not declare would have it silently land here and become the model ID. That
 * is not a hypothetical — requests.test.js was passing a brands array as a fourth
 * argument to a three-parameter function. So a non-string override throws rather
 * than being coerced or quietly ignored: it is always a programming error, and the
 * failure mode if it slips through is an unroutable model ID reaching the proxy.
 */
export function modelFor(group, override) {
  if (override !== undefined && override !== null) {
    if (typeof override !== "string") {
      throw new TypeError(
        `modelFor("${group}") received a ${typeof override} override. ` +
        `The override must be a model id string — check for an extra argument at the call site.`
      );
    }
    if (override) return override;
  }
  return activeRouting[group] || DEFAULT_ROUTING[group];
}

// Not every model accepts every parameter, and sending an unsupported one is a
// 400 rather than something the API quietly ignores. The two that matter here:
//
//   - Adaptive thinking (`thinking: {type: "adaptive"}`) arrived with the 4.6
//     generation. Haiku 4.5 predates it and only understands the older fixed
//     budget form, which is not what we want on a cheap transformation call.
//   - `output_config.effort` errors outright on Haiku 4.5.
//
// So which model a group runs on is not purely a cost decision — it changes the
// legal request shape, and the two have to be decided together. The `caps` table
// is what keeps that coupling explicit instead of implicit in whoever last edited
// buildRequest, and it is why routing a group to a new model means adding a
// catalogue entry rather than just typing an ID.
//
// `output_config` itself is still fine on Haiku (structured outputs are
// supported); it is specifically the `effort` key that is not, so the field is
// omitted entirely rather than sent empty.
//
// That table now lives in registry.js as each model's `caps`, so that "what this
// model supports" sits next to "this model exists" rather than in a second list
// that has to be kept in step with it.

/** Exposed for the unit tests, which assert we never emit an unsupported param. */
export function capabilitiesFor(model) {
  const entry = modelById(model);
  if (!entry) throw new Error(`No capability entry for model "${model}". Add one to MODEL_CATALOGUE before using it.`);
  return entry.caps;
}

// Adaptive thinking lets the model decide how much to reason per request rather
// than paying for a fixed budget on every call. `effort` then sets the ceiling.
//
// `high` is reserved for the two calls where the output is the product: the
// debate synthesis (which has to resolve genuine disagreement into a decision)
// and candidate generation (which has to find non-obvious plays across the whole
// portfolio). Everything else runs `low` — enough for a well-specified
// transformation, and materially cheaper and faster than the default.
export const EFFORT = {
  HIGH: { effort: "high" },
  LOW: { effort: "low" },
};

/**
 * Build a Messages API request body.
 *
 * `cacheSystem` marks the system prompt as a cache breakpoint. Worth setting
 * wherever the same system prompt is sent repeatedly within a few minutes — the
 * debate loop sends one per agent turn, and Next Plays expands three candidates
 * in parallel off an identical prefix. Cache reads bill at roughly a tenth of
 * input rate, so on those two flows it is a real saving rather than a rounding
 * error. It is a no-op below the model's minimum cacheable prefix, so setting it
 * on a short prompt costs nothing but gains nothing either.
 */
export function buildRequest({ model, system, messages, maxTokens, effort, tools, cacheSystem }) {
  const caps = capabilitiesFor(model);
  const body = {
    model,
    max_tokens: maxTokens,
  };
  // Both of these are gated on the model, not on the caller's intent. A tier that
  // can't think adaptively also shouldn't be asked to — these calls are
  // transformations with the judgement already made, so no thinking is the
  // correct behaviour there rather than a compromise.
  if (caps.adaptiveThinking) body.thinking = { type: "adaptive" };
  if (caps.effort) body.output_config = effort || EFFORT.LOW;

  if (system) {
    // Below the model's minimum cacheable prefix a breakpoint is silently
    // ignored, so marking one costs nothing but also buys nothing. Only mark it
    // where it can actually take effect — this keeps the request honest about
    // what it is asking for. The estimate is deliberately crude (~4 chars per
    // token); it only has to be right about the order of magnitude.
    const roughTokens = system.length / 4;
    body.system = (cacheSystem && roughTokens >= caps.cacheMinTokens)
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;
  }
  // `messages` and `tools` are optional here so a call site can spread the result
  // and supply them itself, which keeps the per-call message construction
  // readable next to the prompt it belongs to.
  if (messages) body.messages = messages;
  if (tools) body.tools = tools;
  return body;
}
