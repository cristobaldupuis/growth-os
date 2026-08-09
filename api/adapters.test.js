// Tests for the provider adapters.
//
// The adapters exist to keep one promise: a call site built against the Anthropic
// Messages shape gets the same shape back no matter which provider answered. Every
// test here is a way that promise could quietly break.
//
// The debate tool loop is the sharp edge and most of this file is about it. That
// loop reads `stop_reason === "tool_use"`, executes the named tools, and feeds
// `tool_result` blocks back in. If an adapter returns "end_turn" where it meant
// "call a tool", the agent silently stops arguing from data and starts arguing from
// whatever was already in the prompt — which looks like a quality regression, not a
// bug, and would be blamed on the model.
//
// Gemini gets extra attention because it answers tool calls by function NAME with
// no call id, while the shape the app speaks carries `tool_use_id`. The round trip
// through toolNamesById is the only thing keeping those aligned.
//
// Run with: node --test api/adapters.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { adapters, _internal } from "./_adapters.js";

const { geminiRequest, geminiResponse, openaiRequest, openaiResponse, systemText } = _internal;

// A request in exactly the shape buildRequest produces for the debate group.
const TOOLS = [
  { name: "get_portfolio_summary", description: "Portfolio stats.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "get_blocked_initiatives", description: "What is blocked.", input_schema: { type: "object", properties: {}, required: [] } },
];

const BASE = {
  model: "gemini-3.1-pro",
  max_tokens: 600,
  system: "You are the CFO.",
  messages: [{ role: "user", content: "Open the debate." }],
  tools: TOOLS,
};

// -- systemText ----------------------------------------------------------------

test("systemText flattens both the string and the cache-block form", () => {
  assert.equal(systemText("plain"), "plain");
  assert.equal(systemText([{ type: "text", text: "block", cache_control: { type: "ephemeral" } }]), "block");
  assert.equal(systemText(undefined), "");
});

// -- Gemini: request -----------------------------------------------------------

test("gemini: system prompt becomes systemInstruction, not a message", () => {
  const r = geminiRequest(BASE);
  assert.equal(r.systemInstruction.parts[0].text, "You are the CFO.");
  assert.ok(!r.contents.some(cn => cn.parts.some(p => p.text === "You are the CFO.")),
    "the system prompt must not also appear as a turn");
});

test("gemini: the assistant role is renamed to model", () => {
  const r = geminiRequest({ ...BASE, messages: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ] });
  assert.deepEqual(r.contents.map(cn => cn.role), ["user", "model"]);
});

test("gemini: max_tokens moves into generationConfig", () => {
  assert.equal(geminiRequest(BASE).generationConfig.maxOutputTokens, 600);
});

test("gemini: no-argument tools are declared without a parameters object", () => {
  // Gemini rejects `parameters` with an empty properties map, and every portfolio
  // tool takes no arguments — so this is the normal path, not an edge case.
  const decls = geminiRequest(BASE).tools[0].functionDeclarations;
  assert.equal(decls.length, 2);
  assert.equal(decls[0].name, "get_portfolio_summary");
  assert.ok(!("parameters" in decls[0]), "an empty schema must be omitted entirely");
});

test("gemini: a tool that does take arguments keeps its schema", () => {
  const schema = { type: "object", properties: { since: { type: "string" } }, required: ["since"] };
  const r = geminiRequest({ ...BASE, tools: [{ name: "get_since", description: "d", input_schema: schema }] });
  assert.deepEqual(r.tools[0].functionDeclarations[0].parameters, schema);
});

test("gemini: an empty message contributes no turn", () => {
  const r = geminiRequest({ ...BASE, messages: [{ role: "user", content: [] }, { role: "user", content: "real" }] });
  assert.equal(r.contents.length, 1);
});

// -- Gemini: response ----------------------------------------------------------

test("gemini: a text answer normalises to an Anthropic text block", () => {
  const out = geminiResponse({
    candidates: [{ content: { parts: [{ text: "Payback first." }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
  });
  assert.deepEqual(out.content, [{ type: "text", text: "Payback first." }]);
  assert.equal(out.stop_reason, "end_turn");
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 20 });
});

test("gemini: a functionCall becomes a tool_use block and flips stop_reason", () => {
  // The single most important assertion in this file — callAgentTurn branches on
  // exactly this value to decide whether to run the tool loop.
  const out = geminiResponse({
    candidates: [{ content: { parts: [{ functionCall: { name: "get_portfolio_summary", args: {} } }] }, finishReason: "STOP" }],
  });
  assert.equal(out.stop_reason, "tool_use");
  assert.equal(out.content[0].type, "tool_use");
  assert.equal(out.content[0].name, "get_portfolio_summary");
  assert.ok(out.content[0].id, "a tool_use block needs an id for the result to reference");
});

test("gemini: hitting the token ceiling is reported as max_tokens", () => {
  const out = geminiResponse({ candidates: [{ content: { parts: [{ text: "cut off" }] }, finishReason: "MAX_TOKENS" }] });
  assert.equal(out.stop_reason, "max_tokens");
});

test("gemini: an empty candidate does not throw", () => {
  const out = geminiResponse({});
  assert.deepEqual(out.content, []);
  assert.equal(out.stop_reason, "end_turn");
});

// -- Gemini: the full tool round trip ------------------------------------------

test("gemini: a tool result is matched back to its function by name", () => {
  // The whole reason toolNamesById exists. Gemini answers by name and has no
  // concept of the tool_use_id the app's message history carries, so the adapter
  // has to resolve one to the other or the model receives a result labelled for a
  // function it never called.
  const called = geminiResponse({
    candidates: [{ content: { parts: [{ functionCall: { name: "get_blocked_initiatives", args: {} } }] }, finishReason: "STOP" }],
  });
  const toolUseId = called.content[0].id;

  // Exactly what callAgentTurn appends before the next request.
  const next = geminiRequest({
    ...BASE,
    messages: [
      { role: "user", content: "Open the debate." },
      { role: "assistant", content: called.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content: JSON.stringify({ blocked: 3 }) }] },
    ],
  });

  const responsePart = next.contents.at(-1).parts[0].functionResponse;
  assert.equal(responsePart.name, "get_blocked_initiatives",
    "the result must carry the name of the function that was actually called");
  assert.deepEqual(responsePart.response, { blocked: 3 }, "Gemini requires an object, not a JSON string");
});

test("gemini: a non-JSON tool result is still wrapped in an object", () => {
  const next = geminiRequest({
    ...BASE,
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_portfolio_summary", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "not json" }] },
    ],
  });
  assert.deepEqual(next.contents.at(-1).parts[0].functionResponse.response, { result: "not json" });
});

test("gemini: an unresolvable tool_use_id degrades rather than throwing", () => {
  const next = geminiRequest({
    ...BASE,
    messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "orphan", content: "{}" }] }],
  });
  assert.equal(next.contents[0].parts[0].functionResponse.name, "unknown_tool");
});

// -- OpenAI: request -----------------------------------------------------------

test("openai: the system prompt becomes a leading system message", () => {
  const r = openaiRequest(BASE);
  assert.equal(r.messages[0].role, "system");
  assert.equal(r.messages[0].content, "You are the CFO.");
});

test("openai: max_tokens is sent as max_completion_tokens", () => {
  const r = openaiRequest(BASE);
  assert.equal(r.max_completion_tokens, 600);
  assert.equal(r.max_tokens, undefined, "the deprecated field must not also be sent");
});

test("openai: tools are wrapped in the function envelope", () => {
  const r = openaiRequest(BASE);
  assert.equal(r.tools[0].type, "function");
  assert.equal(r.tools[0].function.name, "get_portfolio_summary");
  assert.deepEqual(r.tools[0].function.parameters, TOOLS[0].input_schema);
});

test("openai: a tool_use block becomes an assistant message with tool_calls", () => {
  const r = openaiRequest({
    ...BASE,
    messages: [{ role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "get_portfolio_summary", input: {} }] }],
  });
  const msg = r.messages.at(-1);
  assert.equal(msg.role, "assistant");
  assert.equal(msg.tool_calls[0].id, "call_1");
  assert.equal(msg.tool_calls[0].function.name, "get_portfolio_summary");
  assert.equal(typeof msg.tool_calls[0].function.arguments, "string", "arguments must be a JSON string");
});

test("openai: a tool_result becomes its own tool-role message, not a user turn", () => {
  const r = openaiRequest({
    ...BASE,
    messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: '{"blocked":3}' }] }],
  });
  const msg = r.messages.at(-1);
  assert.equal(msg.role, "tool");
  assert.equal(msg.tool_call_id, "call_1");
  assert.equal(msg.content, '{"blocked":3}');
});

test("openai: two tool results in one turn become two messages", () => {
  const r = openaiRequest({
    ...BASE,
    messages: [{ role: "user", content: [
      { type: "tool_result", tool_use_id: "a", content: "{}" },
      { type: "tool_result", tool_use_id: "b", content: "{}" },
    ] }],
  });
  const toolMsgs = r.messages.filter(m => m.role === "tool");
  assert.equal(toolMsgs.length, 2);
  assert.deepEqual(toolMsgs.map(m => m.tool_call_id), ["a", "b"]);
});

// -- OpenAI: response ----------------------------------------------------------

test("openai: a text answer normalises to an Anthropic text block", () => {
  const out = openaiResponse({
    choices: [{ message: { content: "Payback first." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  });
  assert.deepEqual(out.content, [{ type: "text", text: "Payback first." }]);
  assert.equal(out.stop_reason, "end_turn");
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 20 });
});

test("openai: tool_calls flip stop_reason to tool_use", () => {
  const out = openaiResponse({
    choices: [{
      message: { content: null, tool_calls: [{ id: "call_1", function: { name: "get_portfolio_summary", arguments: "{}" } }] },
      finish_reason: "tool_calls",
    }],
  });
  assert.equal(out.stop_reason, "tool_use");
  assert.deepEqual(out.content, [{ type: "tool_use", id: "call_1", name: "get_portfolio_summary", input: {} }]);
});

test("openai: malformed tool arguments do not fail the turn", () => {
  const out = openaiResponse({
    choices: [{ message: { tool_calls: [{ id: "c", function: { name: "n", arguments: "{not json" } }] }, finish_reason: "tool_calls" }],
  });
  assert.deepEqual(out.content[0].input, {});
});

test("openai: a length cutoff is reported as max_tokens", () => {
  const out = openaiResponse({ choices: [{ message: { content: "cut" }, finish_reason: "length" }] });
  assert.equal(out.stop_reason, "max_tokens");
});

// -- The map itself ------------------------------------------------------------

test("the anthropic adapter is a pass-through in both directions", () => {
  // The path that already worked must stay byte-identical, or this refactor is a
  // regression on the only provider currently in production.
  const body = { ...BASE, model: "claude-sonnet-5" };
  assert.equal(adapters.anthropic.toRequest(body), body);
  const resp = { content: [{ type: "text", text: "x" }], stop_reason: "end_turn" };
  assert.equal(adapters.anthropic.fromResponse(resp), resp);
});

test("every adapter declares a key var, an endpoint and both directions", () => {
  for (const [name, a] of Object.entries(adapters)) {
    assert.ok(a.keyVar, `${name} has no keyVar`);
    assert.equal(typeof a.endpoint, "function", `${name} has no endpoint`);
    assert.equal(typeof a.headers, "function", `${name} has no headers`);
    assert.equal(typeof a.toRequest, "function", `${name} cannot build a request`);
    assert.equal(typeof a.fromResponse, "function", `${name} cannot read a response`);
    assert.equal(typeof a.errorOf, "function", `${name} cannot surface an error`);
  }
});

test("every text model in the catalogue has an adapter", async () => {
  // The gap that would otherwise only appear as a 500 on a model the console was
  // perfectly happy to let someone select.
  const { MODEL_CATALOGUE } = await import("../src/services/ai/registry.js");
  for (const m of MODEL_CATALOGUE.filter(x => x.modality === "text")) {
    assert.ok(adapters[m.provider], `${m.id} names provider "${m.provider}", which has no adapter`);
  }
});

test("the gemini endpoint embeds the model id", () => {
  assert.match(adapters.gemini.endpoint("gemini-3.1-pro"), /models\/gemini-3\.1-pro:generateContent$/);
});

// -- OpenRouter ----------------------------------------------------------------
//
// The OpenAI-compatible hosts differ from OpenAI itself in exactly one way that
// costs money. `max_completion_tokens` is OpenAI's current spelling for the output
// ceiling; a compatibility layer that only knows the older `max_tokens` does not
// reject the unknown field, it accepts the request with no ceiling at all. The
// failure is a bill, not an error, so it is worth a test rather than a comment.

test("the openrouter request carries an output ceiling under both spellings", () => {
  const req = adapters.openrouter.toRequest({ ...BASE, model: "thinkingmachines/inkling" });
  assert.equal(req.max_tokens, BASE.max_tokens,
    "a host that only knows max_tokens must still see a ceiling");
  assert.equal(req.max_completion_tokens, BASE.max_tokens,
    "and one that only knows max_completion_tokens must see the same number");
});

test("the openrouter request is otherwise the OpenAI translation", () => {
  // Reuse, not a second implementation — if these diverge, the tool-loop tests
  // above stop covering the OpenRouter path and nothing says so.
  const body = { ...BASE, model: "thinkingmachines/inkling" };
  const openrouter = adapters.openrouter.toRequest(body);
  const openai = adapters.openai.toRequest(body);
  const { max_tokens: _ceiling, ...rest } = openrouter;
  assert.deepEqual(rest, openai);
});

test("the openrouter response reads the OpenAI tool-call shape", () => {
  // The debate loop branches on this value. A host answering in the OpenAI shape
  // must still produce "tool_use", or the agent argues from the prompt instead of
  // from the portfolio and it reads as a model regression.
  const out = adapters.openrouter.fromResponse({
    choices: [{
      finish_reason: "tool_calls",
      message: {
        content: null,
        tool_calls: [{ id: "call_1", function: { name: "get_portfolio_summary", arguments: "{}" } }],
      },
    }],
  });
  assert.equal(out.stop_reason, "tool_use");
  assert.equal(out.content[0].type, "tool_use");
  assert.equal(out.content[0].name, "get_portfolio_summary");
});

// -- Tinker --------------------------------------------------------------------
//
// The pass-through adapter. Its correctness claim is unusual: not "the
// translation is right" but "there is no translation", which is exactly the kind
// of property that decays silently when someone later adds a helpful tweak. The
// debate loop is the reason it matters — a tool_use block that survives untouched
// cannot be mistranslated.

test("the tinker adapter passes the request through untouched", () => {
  const body = { ...BASE, model: "thinkingmachines/Inkling" };
  const out = adapters.tinker.toRequest(body);
  assert.deepEqual(out, body, "tinker speaks Anthropic Messages — nothing should be rewritten");
  assert.equal(out, body, "and there is no reason to copy it either");
});

test("the tinker adapter passes the response through untouched", () => {
  // Including tool_use blocks, which every other adapter has to reconstruct.
  const json = {
    content: [{ type: "tool_use", id: "toolu_1", name: "get_portfolio_summary", input: {} }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 2 },
  };
  assert.deepEqual(adapters.tinker.fromResponse(json), json);
  assert.equal(adapters.tinker.fromResponse(json).stop_reason, "tool_use",
    "the value the debate loop branches on must arrive unmodified");
});

test("the tinker adapter authenticates the Anthropic way, not with a bearer token", () => {
  // The endpoint is documented as accepting the Anthropic SDK's native header.
  // Sending Authorization instead would 401, and the symptom (no models work on
  // this provider) points nowhere near the cause.
  const h = adapters.tinker.headers("sk-test");
  assert.equal(h["x-api-key"], "sk-test");
  assert.equal(h["anthropic-version"], "2023-06-01");
  assert.ok(!h.Authorization, "a bearer token is the wrong scheme here");
});

test("the tinker endpoint carries the full Anthropic messages path", () => {
  // Tinker documents a base URL and the client appends the standard path. Getting
  // this wrong is a 404 on every call to the provider.
  assert.match(adapters.tinker.endpoint(), /^https:\/\/tinker\.thinkingmachines\.dev\/.*\/v1\/messages$/);
});
