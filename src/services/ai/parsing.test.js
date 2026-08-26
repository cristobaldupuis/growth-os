// Response reading: thinking blocks, truncation, and the schema wrapper.
//
// Each of these covers a failure that was silent. The pattern is the same in all
// three: the app got something it did not expect, turned it into an empty or
// partial value, and reported success.

import test from "node:test";
import assert from "node:assert/strict";
import { firstText, readProse, parseStructured, safeParseJSON } from "./_shared.js";
import { unwrap, creativeVariantsFormat, CANDIDATES_FORMAT, MODERATOR_FORMAT } from "./schemas.js";

// -- firstText -----------------------------------------------------------------
//
// The bug: `content[0].text` worked until adaptive thinking was switched on, at
// which point a response could lead with a `thinking` block and every structured
// call site started reading `undefined`. The `|| "{}"` fallbacks downstream then
// turned that into an empty object, so Quick Capture returned a blank initiative
// and reported success.

test("firstText finds the text block behind a leading thinking block", () => {
  const data = { content: [
    { type: "thinking", thinking: "weighing the options" },
    { type: "text", text: '{"title":"Real answer"}' },
  ]};
  assert.equal(firstText(data), '{"title":"Real answer"}');
});

test("firstText still reads a plain single-block response", () => {
  assert.equal(firstText({ content: [{ type: "text", text: "  hello  " }] }), "hello");
});

test("firstText returns empty for a response with no text block at all", () => {
  assert.equal(firstText({ content: [{ type: "thinking", thinking: "..." }] }), "");
  assert.equal(firstText({ content: [] }), "");
  assert.equal(firstText({}), "");
});

test("firstText skips a leading tool_use block", () => {
  const data = { content: [
    { type: "tool_use", id: "t1", name: "get_win_rate", input: {} },
    { type: "text", text: "the answer" },
  ]};
  assert.equal(firstText(data), "the answer");
});

// -- Truncation ----------------------------------------------------------------
//
// A response cut off at max_tokens is not malformed — it is a correct, incomplete
// answer that was already paid for, and it is fixed by raising the ceiling rather
// than by clicking again. Reporting it as "malformed, try again" sent the operator
// into a retry loop that cost the same and failed the same way.

test("a truncated JSON response says it was cut off, not that it was malformed", () => {
  const data = { stop_reason: "max_tokens", content: [{ type: "text", text: '{"title":"half a' }] };
  assert.throws(() => parseStructured(data, { label: "Quick capture" }), /cut off|length limit/i);
});

test("the truncation message names the call so the operator knows what to raise", () => {
  const data = { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] };
  assert.throws(() => parseStructured(data, { label: "The creative brief" }), /creative brief/i);
});

test("a refusal is reported as a refusal, not as bad JSON", () => {
  const data = { stop_reason: "refusal", content: [] };
  assert.throws(() => parseStructured(data, {}), /declined/i);
});

test("readProse flags truncation without throwing", () => {
  // Half a library answer is still worth reading. It just must not be presented
  // as a complete review of the record, which is the one claim that call makes.
  const cut = readProse({ stop_reason: "max_tokens", content: [{ type: "text", text: "PATTERNS ..." }] });
  assert.equal(cut.truncated, true);
  assert.equal(cut.text, "PATTERNS ...");

  const whole = readProse({ stop_reason: "end_turn", content: [{ type: "text", text: "done" }] });
  assert.equal(whole.truncated, false);
});

// -- parseStructured -----------------------------------------------------------

test("parseStructured returns the parsed object on the happy path", () => {
  const data = { stop_reason: "end_turn", content: [{ type: "text", text: '{"impact":7}' }] };
  assert.deepEqual(parseStructured(data), { impact: 7 });
});

test("parseStructured still recovers JSON wrapped in markdown fences", () => {
  // The prompt-and-parse path is what non-Anthropic routings still depend on, so
  // the recovery behaviour has to survive the move to structured outputs.
  const data = { stop_reason: "end_turn", content: [{ type: "text", text: '```json\n{"a":1}\n```' }] };
  assert.deepEqual(parseStructured(data), { a: 1 });
});

test("an empty response is reported as empty rather than as invalid JSON", () => {
  assert.throws(() => parseStructured({ stop_reason: "end_turn", content: [] }), /empty/i);
});

test("unparseable content is reported as invalid JSON", () => {
  const data = { stop_reason: "end_turn", content: [{ type: "text", text: "I'm afraid I can't do that." }] };
  assert.throws(() => parseStructured(data), /not valid JSON/i);
});

// -- Schema wrapping -----------------------------------------------------------
//
// Structured outputs constrain a root OBJECT, so list-returning calls ask for
// {items: [...]}. A model without structured outputs returns the bare array the
// prompt asked for. The call site must not have to know which one it was routed to.

test("unwrap reads a schema-wrapped list", () => {
  assert.deepEqual(unwrap({ items: [{ title: "a" }, { title: "b" }] }), [{ title: "a" }, { title: "b" }]);
});

test("unwrap reads a bare array from a model without structured outputs", () => {
  assert.deepEqual(unwrap([{ title: "a" }]), [{ title: "a" }]);
});

test("unwrap returns a list for anything it cannot read, never null", () => {
  // Callers iterate the result immediately. Returning null here would move a
  // clear parse failure into an unrelated TypeError one frame later.
  assert.deepEqual(unwrap(null), []);
  assert.deepEqual(unwrap({ nope: 1 }), []);
});

test("list schemas are rooted on an object, as structured outputs require", () => {
  assert.equal(CANDIDATES_FORMAT.type, "json_schema");
  assert.equal(CANDIDATES_FORMAT.schema.type, "object");
  assert.equal(CANDIDATES_FORMAT.schema.properties.items.type, "array");
});

test("every schema forbids extra keys", () => {
  // A key nobody reads is a key somebody eventually reads by accident.
  assert.equal(CANDIDATES_FORMAT.schema.additionalProperties, false);
  assert.equal(CANDIDATES_FORMAT.schema.properties.items.items.additionalProperties, false);
  assert.equal(MODERATOR_FORMAT.schema.additionalProperties, false);
});

test("the candidate confidence field is constrained to the three values the ranker reads", () => {
  // App.jsx ranks on exactly these strings and scores anything else 0, so a model
  // answering "moderate" would sort to the bottom for no visible reason.
  const conf = CANDIDATES_FORMAT.schema.properties.items.items.properties.confidence;
  assert.deepEqual(conf.enum, ["low", "medium", "high"]);
});

test("the moderator may answer null for the agent it does not need to name", () => {
  const next = MODERATOR_FORMAT.schema.properties.next_agent;
  assert.deepEqual(next.type, ["string", "null"]);
});

test("the variants schema is built from the live naming dimensions", () => {
  // Segment slots are per-deployment, so this schema cannot be a constant.
  const fmt = creativeVariantsFormat(["channel", "angle", "format"]);
  const naming = fmt.schema.properties.items.items.properties.naming;
  assert.deepEqual(Object.keys(naming.properties), ["channel", "angle", "format"]);
  assert.deepEqual(naming.required, ["channel", "angle", "format"]);
  assert.equal(naming.additionalProperties, false);
});

// -- safeParseJSON is unchanged ------------------------------------------------

test("safeParseJSON keeps its bracket-extraction fallback", () => {
  assert.deepEqual(safeParseJSON('Here you go: {"a":1} hope that helps', false), { a: 1 });
  assert.deepEqual(safeParseJSON('prose [1,2] more', true), [1, 2]);
});
