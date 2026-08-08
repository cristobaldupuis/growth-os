// Tests for the request builder.
//
// These exist because of a bug that shipped in the model-tiering change and
// would not have been caught by anything else in the pipeline: `buildRequest`
// unconditionally attached `thinking: {type:"adaptive"}` and
// `output_config.effort` to every request, including the Haiku 4.5 tier, which
// supports neither. It lints clean, builds clean, and type-checks clean — it
// fails only as a 400 from the API, at runtime, on four user-facing features
// (Quick Capture, Hypothesis Expansion, ICE Assist, recommendation expansion).
//
// The general shape of the risk: model capability is a property of a remote
// service, so the only local defence is to write the constraint down and assert
// against it. That is what this file is.
//
// Run with: node src/services/ai/models.test.js
import assert from "node:assert/strict";
import { MODELS, EFFORT, buildRequest, capabilitiesFor, modelFor, applyRouting, currentRouting } from "./models.js";
import { DEFAULT_ROUTING } from "./registry.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS " + name); passed++; }
  catch (err) { console.error("  FAIL " + name + "\n        " + err.message); failed++; }
}

// -- The regression this file was written for ---------------------------------

test("structured tier omits adaptive thinking (unsupported on Haiku 4.5)", () => {
  const body = buildRequest({ model: MODELS.STRUCTURED, maxTokens: 300, system: "s", effort: EFFORT.LOW });
  assert.equal(body.thinking, undefined,
    "sending `thinking` to Haiku 4.5 is a 400 — adaptive thinking is 4.6+");
});

test("structured tier omits output_config.effort (errors on Haiku 4.5)", () => {
  const body = buildRequest({ model: MODELS.STRUCTURED, maxTokens: 300, system: "s", effort: EFFORT.HIGH });
  assert.equal(body.output_config, undefined,
    "`effort` is rejected by Haiku 4.5 even when explicitly requested");
});

test("reasoning tier keeps adaptive thinking and effort", () => {
  const body = buildRequest({ model: MODELS.REASONING, maxTokens: 600, system: "s", effort: EFFORT.HIGH });
  assert.deepEqual(body.thinking, { type: "adaptive" });
  assert.deepEqual(body.output_config, { effort: "high" });
});

test("reasoning tier defaults to low effort when none is given", () => {
  const body = buildRequest({ model: MODELS.REASONING, maxTokens: 600, system: "s" });
  assert.deepEqual(body.output_config, { effort: "low" });
});

// -- Guard against adding a model without declaring what it supports ----------

test("an unknown model fails loudly rather than guessing a shape", () => {
  assert.throws(() => buildRequest({ model: "claude-something-new", maxTokens: 100 }),
    /No capability entry/);
});

test("every tier in MODELS has a capability entry", () => {
  for (const [tier, id] of Object.entries(MODELS)) {
    assert.doesNotThrow(() => capabilitiesFor(id), `${tier} (${id}) has no capability entry`);
  }
});

// -- Prompt caching ------------------------------------------------------------

test("cache breakpoint is applied when the prefix clears the model minimum", () => {
  const system = "x".repeat(1024 * 4 + 100);   // ~1024 tokens, over Sonnet 5's minimum
  const body = buildRequest({ model: MODELS.REASONING, maxTokens: 600, system, cacheSystem: true });
  assert.ok(Array.isArray(body.system), "system should be block form when caching");
  assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" });
});

test("cache breakpoint is skipped when the prefix is below the minimum", () => {
  // A short prompt cannot be cached; marking it would claim a saving that the
  // API silently declines to give.
  const body = buildRequest({ model: MODELS.REASONING, maxTokens: 600, system: "short", cacheSystem: true });
  assert.equal(typeof body.system, "string",
    "an uncacheable prefix should stay a plain string rather than a fake breakpoint");
});

test("caching is never requested when cacheSystem is not set", () => {
  const system = "x".repeat(1024 * 8);
  const body = buildRequest({ model: MODELS.REASONING, maxTokens: 600, system, cacheSystem: false });
  assert.equal(typeof body.system, "string");
});

// -- Request shape the proxy validates ----------------------------------------

test("body satisfies the proxy's validation contract", () => {
  // api/proxy.js rejects anything outside these bounds, so a mismatch between the
  // builder and the proxy would break every AI call in production while passing
  // every local check.
  const MAX_TOKENS_CEILING = 4000;
  for (const model of Object.values(MODELS)) {
    const body = buildRequest({
      model, maxTokens: 3500, system: "s", messages: [{ role: "user", content: "hi" }],
    });
    assert.ok(Number.isInteger(body.max_tokens) && body.max_tokens > 0, "max_tokens must be a positive integer");
    assert.ok(body.max_tokens <= MAX_TOKENS_CEILING, `max_tokens must stay under the proxy ceiling for ${model}`);
    assert.ok(Array.isArray(body.messages) && body.messages.length > 0, "messages must be a non-empty array");
    assert.equal(body.stream, undefined, "the proxy rejects streaming requests");
  }
});

test("messages and tools are omitted rather than set undefined when not supplied", () => {
  // Call sites spread the result and then supply their own `messages`; an
  // explicit `messages: undefined` key would survive JSON.stringify as absent
  // but makes the intermediate object misleading to read.
  const body = buildRequest({ model: MODELS.REASONING, maxTokens: 100, system: "s" });
  assert.ok(!("messages" in body));
  assert.ok(!("tools" in body));
});

test("tools pass through when supplied", () => {
  const tools = [{ name: "get_portfolio_summary" }];
  const body = buildRequest({ model: MODELS.REASONING, maxTokens: 100, system: "s", tools });
  assert.deepEqual(body.tools, tools);
});

// -- Routing resolution --------------------------------------------------------
//
// These run last on purpose: applyRouting mutates module state, so anything
// asserting on default behaviour has to come before it.

test("modelFor serves the committed defaults before any routing arrives", () => {
  // The property App.jsx's fire-and-forget boot fetch depends on. If this returned
  // undefined, an AI call that beat the fetch would send `model: undefined`.
  for (const [group, expected] of Object.entries(DEFAULT_ROUTING)) {
    assert.equal(modelFor(group), expected);
  }
});

test("modelFor prefers an explicit override over the routing", () => {
  assert.equal(modelFor("capture", "claude-opus-5"), "claude-opus-5");
});

test("modelFor ignores an empty-string override rather than sending it", () => {
  // "" is what an unfilled form field arrives as; it must not become the model id.
  assert.equal(modelFor("capture", ""), DEFAULT_ROUTING.capture);
});

test("modelFor throws on a non-string override", () => {
  // Guards the stale-extra-argument case — see the note on modelFor.
  assert.throws(() => modelFor("capture", { id: "x" }), /must be a model id string/);
  assert.throws(() => modelFor("capture", ["claude-opus-5"]), /must be a model id string/);
});

test("applyRouting installs a valid assignment and reports nothing dropped", () => {
  const dropped = applyRouting({ capture: "claude-opus-5" });
  assert.deepEqual(dropped, []);
  assert.equal(modelFor("capture"), "claude-opus-5");
  assert.equal(modelFor("analysis"), DEFAULT_ROUTING.analysis, "other groups keep their default");
});

test("applyRouting reports and discards an unusable assignment", () => {
  const dropped = applyRouting({ debate: "gemini-2.5-flash-image" });
  assert.deepEqual(dropped, ["debate"]);
  assert.equal(modelFor("debate"), DEFAULT_ROUTING.debate);
});

test("applyRouting(null) restores every group to its default", () => {
  applyRouting(null);
  assert.deepEqual(currentRouting(), DEFAULT_ROUTING);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
