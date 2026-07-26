// Model selection, in one place.
//
// The model ID used to be a string literal repeated across eleven call sites, so
// changing generation meant eleven edits and any one of them could silently drift.
//
// ## Which tier does what
//
// The split is by *what the call has to do*, not by how important the feature
// feels. Two questions decide it:
//
//   - Does the call have to *reason* — weigh competing evidence, form a position,
//     resolve a disagreement, decide what matters? → SONNET.
//   - Or does it have to *restructure* text it has already been given, against a
//     schema, with the judgement already made? → HAIKU.
//
// The second class is most of the toolkit. Reformatting a rough sentence into
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
// to prevent. Signal AI stays on Sonnet, and so does anything that has to weigh
// evidence across the portfolio.
//
// ## Cost note
//
// Sonnet 5 is $3/$15 per MTok ($2/$10 promotional through 2026-08-31); Haiku 4.5
// is $1/$5. Sonnet 5 also uses a newer tokenizer that counts roughly 30% more
// tokens for the same text than Sonnet 4.6 did, so per-call cost is not directly
// comparable to the old figures — re-measure rather than assuming the previous
// per-debate estimate carries over.

export const MODELS = {
  /** Reasoning, judgement, multi-step synthesis, adversarial debate. */
  REASONING: "claude-sonnet-5",
  /** Schema-shaped transformation of text the user already supplied. */
  STRUCTURED: "claude-haiku-4-5",
};

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
  const body = {
    model,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: effort || EFFORT.LOW,
  };
  if (system) {
    body.system = cacheSystem
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
