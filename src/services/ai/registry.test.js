// Tests for the model registry.
//
// The registry turned model choice from a code literal into data, and data has a
// failure mode a literal does not: it can be internally inconsistent in ways that
// lint and build cannot see. Three specific ways, all of which have to be caught
// here because each one only surfaces as a runtime failure otherwise:
//
//   1. A group's DEFAULT_ROUTING entry that the group's own `requires` rejects.
//      This would ship a deployment whose defaults are illegal — every call in that
//      group failing on a fresh install, with the console showing a model it would
//      not itself let you pick.
//   2. A catalogue model with no `caps`, which buildRequest reads to decide which
//      parameters are legal. That is the exact bug models.test.js was written for,
//      one level further out.
//   3. validateRouting accepting something it should not. It is the only thing
//      between a stored routing and the app's model IDs, so a hole here means an
//      unroutable ID reaching the proxy.
//
// Run with: node src/services/ai/registry.test.js
import assert from "node:assert/strict";
import {
  MODEL_CATALOGUE, FEATURE_GROUPS, GROUP_KEYS, DEFAULT_ROUTING,
  modelsFor, validateRouting, resolveRouting, modelById, TEXT_MODEL_IDS,
} from "./registry.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS " + name); passed++; }
  catch (err) { console.error("  FAIL " + name + "\n        " + err.message); failed++; }
}

// -- Internal consistency ------------------------------------------------------

test("every catalogue model has a caps object", () => {
  for (const m of MODEL_CATALOGUE) {
    assert.ok(m.caps && typeof m.caps === "object",
      `${m.id} has no caps — buildRequest reads this to decide which params are legal`);
  }
});

test("catalogue ids are unique", () => {
  const seen = new Set();
  for (const m of MODEL_CATALOGUE) {
    assert.ok(!seen.has(m.id), `duplicate catalogue entry for ${m.id}`);
    seen.add(m.id);
  }
});

test("every catalogue model declares a modality and provider", () => {
  for (const m of MODEL_CATALOGUE) {
    assert.ok(["text", "image", "video"].includes(m.modality), `${m.id} has an unusable modality`);
    assert.ok(m.provider, `${m.id} has no provider`);
  }
});

test("every group has a default, and every default is a real model", () => {
  for (const key of GROUP_KEYS) {
    const id = DEFAULT_ROUTING[key];
    assert.ok(id, `group "${key}" has no entry in DEFAULT_ROUTING`);
    assert.ok(modelById(id), `group "${key}" defaults to "${id}", which is not in the catalogue`);
  }
});

test("DEFAULT_ROUTING names no group that does not exist", () => {
  for (const key of Object.keys(DEFAULT_ROUTING)) {
    assert.ok(FEATURE_GROUPS[key], `DEFAULT_ROUTING has an entry for unknown group "${key}"`);
  }
});

// This is the one that matters most: the shipped defaults must satisfy the rules
// the console enforces. Otherwise a fresh deployment runs on a configuration the
// admin UI would refuse to let anyone select.
test("the shipped defaults are a routing the registry itself accepts", () => {
  assert.equal(validateRouting(DEFAULT_ROUTING), null);
});

test("every group can be served by at least one model", () => {
  for (const key of GROUP_KEYS) {
    assert.ok(modelsFor(key).length > 0,
      `no model in the catalogue satisfies group "${key}" — its picker would be empty`);
  }
});

test("every group's declared calls are non-empty and named", () => {
  // `calls` is what the console shows as a group's blast radius. An empty or
  // unlabelled list makes a group-level switch unreviewable.
  for (const key of GROUP_KEYS) {
    const { calls } = FEATURE_GROUPS[key];
    assert.ok(Array.isArray(calls) && calls.length > 0, `group "${key}" lists no call sites`);
    for (const c of calls) {
      assert.ok(c.fn && c.surface, `group "${key}" has a call entry missing fn or surface`);
    }
  }
});

// -- modelsFor -----------------------------------------------------------------

test("modelsFor filters by modality", () => {
  for (const m of modelsFor("capture")) assert.equal(m.modality, "text");
  for (const m of modelsFor("image"))   assert.equal(m.modality, "image");
  for (const m of modelsFor("video"))   assert.equal(m.modality, "video");
});

test("modelsFor excludes a model that cannot meet a group's requirements", () => {
  // Haiku is not long-context, and `analysis` reads the whole portfolio.
  const ids = modelsFor("analysis").map(m => m.id);
  assert.ok(!ids.includes("claude-haiku-4-5"),
    "Haiku should not be offered for Portfolio Analysis — it is not marked longContext");
  assert.ok(ids.includes("claude-sonnet-5"));
});

test("modelsFor returns nothing for an unknown group rather than throwing", () => {
  assert.deepEqual(modelsFor("not-a-group"), []);
});

// -- validateRouting -----------------------------------------------------------

test("a valid single-group routing is accepted", () => {
  assert.equal(validateRouting({ capture: "claude-opus-5" }), null);
});

test("an unknown group is rejected", () => {
  assert.match(validateRouting({ nope: "claude-opus-5" }), /Unknown feature group/);
});

test("an unknown model is rejected", () => {
  assert.match(validateRouting({ capture: "gpt-9-ultra" }), /Unknown model/);
});

test("a modality mismatch is rejected", () => {
  // The single most plausible console bug: an image model assigned to a text group.
  assert.match(validateRouting({ capture: "gemini-2.5-flash-image" }), /cannot serve/);
});

test("a model that cannot use tools is rejected for the debate group", () => {
  // Guards the group whose whole value depends on a capability. Constructed against
  // the live catalogue so it keeps testing the rule rather than a fixture: if every
  // text model gains tools, this asserts the rule still holds instead of silently
  // passing on a stale assumption.
  const toolless = MODEL_CATALOGUE.find(m => m.modality === "text" && m.caps.tools !== true);
  if (!toolless) {
    // Nothing to reject today — assert the rule is still declared, so removing
    // `tools` from the debate group's requires cannot pass unnoticed.
    assert.equal(FEATURE_GROUPS.debate.requires.tools, true,
      "the debate group must keep requiring tool use — callAgentTurn hands the model portfolio tools");
    return;
  }
  assert.match(validateRouting({ debate: toolless.id }), /cannot serve|missing/);
});

test("a non-object routing is rejected", () => {
  assert.match(validateRouting(null), /must be an object/);
  assert.match(validateRouting([]), /must be an object/);
  assert.match(validateRouting("claude-opus-5"), /must be an object/);
});

test("an empty routing is rejected", () => {
  assert.match(validateRouting({}), /empty/);
});

test("a missing model id is rejected", () => {
  assert.match(validateRouting({ capture: "" }), /no model id/);
  assert.match(validateRouting({ capture: null }), /no model id/);
});

// -- resolveRouting ------------------------------------------------------------

test("resolveRouting fills every group from the defaults", () => {
  const { routing } = resolveRouting(null);
  assert.deepEqual(routing, DEFAULT_ROUTING);
});

test("resolveRouting applies a valid stored override", () => {
  const { routing, dropped } = resolveRouting({ capture: "claude-opus-5" });
  assert.equal(routing.capture, "claude-opus-5");
  assert.equal(routing.analysis, DEFAULT_ROUTING.analysis, "untouched groups keep their default");
  assert.deepEqual(dropped, []);
});

test("resolveRouting drops a stale entry instead of failing the whole routing", () => {
  // The realistic staleness case: a model retired from the catalogue in a later
  // deploy leaves a dangling id in the store. One group falling back beats every
  // AI call in the app breaking.
  const { routing, dropped } = resolveRouting({ capture: "claude-retired-9", analysis: "claude-opus-5" });
  assert.equal(routing.capture, DEFAULT_ROUTING.capture);
  assert.equal(routing.analysis, "claude-opus-5");
  assert.deepEqual(dropped, ["capture"]);
});

test("resolveRouting drops an entry that violates a group's requirements", () => {
  const { routing, dropped } = resolveRouting({ debate: "gemini-2.5-flash-image" });
  assert.equal(routing.debate, DEFAULT_ROUTING.debate);
  assert.deepEqual(dropped, ["debate"]);
});

// -- The proxy allowlist -------------------------------------------------------

test("TEXT_MODEL_IDS is exactly the text models, and non-empty", () => {
  assert.ok(TEXT_MODEL_IDS.length > 0);
  assert.deepEqual(
    [...TEXT_MODEL_IDS].sort(),
    MODEL_CATALOGUE.filter(m => m.modality === "text").map(m => m.id).sort()
  );
});

test("no image or video model leaks into the text allowlist", () => {
  // api/proxy.js allowlists from this. A non-text id here would be accepted by the
  // Anthropic proxy and fail upstream in a much more confusing way.
  for (const id of TEXT_MODEL_IDS) {
    assert.equal(modelById(id).modality, "text", `${id} is in TEXT_MODEL_IDS but is not a text model`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
