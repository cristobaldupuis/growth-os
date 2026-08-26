// Prompt caching and spend accounting.
//
// The bug these exist to prevent was not a crash — it was a belief. `cacheSystem:
// true` was set at six call sites and bought nothing at any of them, because a
// cache breakpoint below the model's minimum cacheable prefix is silently ignored
// and every system prompt in this app is under it. Meanwhile the content that
// actually repeats — the portfolio snapshot, the tools, the growing transcript —
// sat in `messages`, where no breakpoint was ever placed, and was re-billed in
// full 25 to 48 times per debate.
//
// Nothing failed. Nothing logged. The only way to notice was to read the
// multiplier and the minimum together, which is exactly what these do.

import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, EFFORT } from "./models.js";
import { modelById } from "./registry.js";
import {
  priceTextCall, mkUsageRow, rollupUsage,
  CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER,
} from "../usage.js";

const SONNET = "claude-sonnet-5";
const HAIKU  = "claude-haiku-4-5";
const GEMINI = "gemini-3.1-pro";

/** A system prompt long enough to clear `model`'s minimum cacheable prefix. */
const systemOver = (model) => "x".repeat((modelById(model).caps.cacheMinTokens + 200) * 4);
/** One comfortably under it. */
const systemUnder = (model) => "x".repeat((modelById(model).caps.cacheMinTokens - 200) * 4);

const isCacheBlock = (system) =>
  Array.isArray(system) && system[0]?.cache_control?.type === "ephemeral";

// -- The system breakpoint -----------------------------------------------------

test("a system prompt over the minimum gets a real cache breakpoint", () => {
  const body = buildRequest({ model: SONNET, system: systemOver(SONNET), maxTokens: 600, cacheSystem: true });
  assert.ok(isCacheBlock(body.system), "a long stable system prompt is the case caching exists for");
});

test("a system prompt under the minimum is left as a plain string", () => {
  // Marking one there is not harmful, it is just dishonest — the request asks for
  // something the provider will ignore. This is the state every call site was in.
  const body = buildRequest({ model: SONNET, system: systemUnder(SONNET), maxTokens: 600, cacheSystem: true });
  assert.equal(typeof body.system, "string");
});

test("the minimum is per model, not a constant", () => {
  // Haiku's floor is 4096 against Sonnet's 1024. A prompt that caches on one does
  // not cache on the other, and getting this wrong is silent in both directions.
  const system = systemOver(SONNET);
  assert.ok(isCacheBlock(buildRequest({ model: SONNET, system, maxTokens: 600, cacheSystem: true }).system));
  assert.equal(typeof buildRequest({ model: HAIKU, system, maxTokens: 600, cacheSystem: true }).system, "string");
});

// -- The message breakpoint ----------------------------------------------------
//
// This is the one that was missing entirely, and the one a multi-turn loop needs:
// each request's prefix is the previous request's whole body.

test("a long conversation gets a breakpoint on its last block", () => {
  const messages = [{ role: "user", content: "y".repeat(1024 * 4 + 800) }];
  const body = buildRequest({ model: SONNET, maxTokens: 600, messages, cacheMessages: true });
  const last = body.messages[body.messages.length - 1];
  assert.equal(last.content[last.content.length - 1].cache_control.type, "ephemeral");
});

test("a string content is promoted to a block so it can carry the breakpoint", () => {
  const messages = [{ role: "user", content: "y".repeat(1024 * 4 + 800) }];
  const body = buildRequest({ model: SONNET, maxTokens: 600, messages, cacheMessages: true });
  const last = body.messages[0];
  assert.ok(Array.isArray(last.content));
  assert.equal(last.content[0].type, "text");
  assert.ok(last.content[0].text.startsWith("y"), "the text itself must survive the promotion");
});

test("a short conversation is left alone", () => {
  const messages = [{ role: "user", content: "hello" }];
  const body = buildRequest({ model: SONNET, maxTokens: 600, messages, cacheMessages: true });
  assert.equal(body.messages[0].content, "hello", "no breakpoint where one cannot take effect");
});

test("the breakpoint lands on the last block, not the first", () => {
  // Caching is a prefix match: a breakpoint mid-message would cache less than the
  // conversation that precedes it, which is the whole point of placing one here.
  const long = "y".repeat(1024 * 4 + 800);
  const messages = [{ role: "user", content: [
    { type: "text", text: long },
    { type: "text", text: "and finally" },
  ]}];
  const body = buildRequest({ model: SONNET, maxTokens: 600, messages, cacheMessages: true });
  const blocks = body.messages[0].content;
  assert.equal(blocks[0].cache_control, undefined);
  assert.equal(blocks[1].cache_control.type, "ephemeral");
});

test("a tool_result block can carry the breakpoint", () => {
  // The debate's tool loop appends tool_result blocks and re-sends the whole
  // conversation each iteration, so this is the hot path, not an edge case.
  const messages = [
    { role: "user", content: "y".repeat(1024 * 4 + 800) },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
  ];
  const body = buildRequest({ model: SONNET, maxTokens: 600, messages, cacheMessages: true });
  const last = body.messages[1].content[0];
  assert.equal(last.type, "tool_result", "the block type must be preserved");
  assert.equal(last.cache_control.type, "ephemeral");
});

test("a model that cannot cache never gets a breakpoint", () => {
  // Every non-Anthropic entry carries cacheMinTokens: Infinity precisely so this
  // is decided by the capability table rather than by a silent strip in an adapter.
  const messages = [{ role: "user", content: "y".repeat(100000) }];
  const body = buildRequest({ model: GEMINI, maxTokens: 600, messages, cacheMessages: true });
  assert.equal(body.messages[0].content, messages[0].content);
  assert.equal(typeof buildRequest({ model: GEMINI, system: "x".repeat(100000), maxTokens: 600, cacheSystem: true }).system, "string");
});

test("the original messages array is not mutated", () => {
  const messages = [{ role: "user", content: "y".repeat(1024 * 4 + 800) }];
  const before = JSON.stringify(messages);
  buildRequest({ model: SONNET, maxTokens: 600, messages, cacheMessages: true });
  assert.equal(JSON.stringify(messages), before, "the caller may reuse its own history");
});

// -- Structured outputs coexist with effort ------------------------------------

test("format and effort share output_config rather than overwriting each other", () => {
  const format = { type: "json_schema", schema: { type: "object", properties: {}, additionalProperties: false } };
  const body = buildRequest({ model: SONNET, maxTokens: 600, effort: EFFORT.HIGH, format });
  assert.equal(body.output_config.effort, "high");
  assert.deepEqual(body.output_config.format, format);
});

test("a model without structured outputs never receives a format", () => {
  const format = { type: "json_schema", schema: { type: "object", properties: {}, additionalProperties: false } };
  const body = buildRequest({ model: GEMINI, maxTokens: 600, format });
  assert.ok(!body.output_config || body.output_config.format === undefined);
});

test("Haiku takes a format but still no effort", () => {
  // The two capabilities are independent and were previously conflated by living
  // in the same request field.
  const format = { type: "json_schema", schema: { type: "object", properties: {}, additionalProperties: false } };
  const body = buildRequest({ model: HAIKU, maxTokens: 600, effort: EFFORT.HIGH, format });
  assert.deepEqual(body.output_config, { format });
});

// -- Pricing cached tokens -----------------------------------------------------

test("cache reads are billed at a fraction of input, not at full input", () => {
  const price = { inUsdPerMTok: 2, outUsdPerMTok: 10 };
  const uncached = priceTextCall(price, 1e6, 0);
  const cached   = priceTextCall(price, 0, 0, 1e6, 0);
  assert.equal(uncached, 2);
  assert.equal(cached, 2 * CACHE_READ_MULTIPLIER);
  assert.ok(cached < uncached, "if these were equal, caching could never show a saving");
});

test("cache writes cost more than plain input", () => {
  const price = { inUsdPerMTok: 2, outUsdPerMTok: 10 };
  assert.equal(priceTextCall(price, 0, 0, 0, 1e6), 2 * CACHE_WRITE_MULTIPLIER);
});

test("a call with no cache activity prices exactly as it did before", () => {
  // The regression guard: the ledger's existing figures must not move.
  const price = { inUsdPerMTok: 3, outUsdPerMTok: 15 };
  assert.equal(priceTextCall(price, 1000, 500), (1000 / 1e6) * 3 + (500 / 1e6) * 15);
});

test("an unpriced model still yields null, not zero", () => {
  assert.equal(priceTextCall(null, 1000, 500, 1000, 0), null);
});

// -- The ledger reports whether caching is working -----------------------------

test("the rollup reports a cache hit rate", () => {
  // Without this the caching change could not be verified from inside the product,
  // which is how it went unnoticed for as long as it did.
  const rows = [
    mkUsageRow({ group: "debate", inputTokens: 200, cacheReadTokens: 1800, costUsd: 0.01 }),
    mkUsageRow({ group: "debate", inputTokens: 200, cacheReadTokens: 1800, costUsd: 0.01 }),
  ];
  assert.equal(rollupUsage(rows, "group").cacheHitRate, 0.9);
});

test("no cache activity reports null rather than a hit rate of zero", () => {
  // Zero reads as "caching is on and achieving nothing". Null reads as "nothing
  // here reports cache usage", which is the truth for every non-Anthropic model.
  const rows = [mkUsageRow({ group: "capture", inputTokens: 0, costUsd: 0 })];
  assert.equal(rollupUsage(rows, "group").cacheHitRate, null);
});

test("cache tokens are summed per rollup row", () => {
  const rows = [
    mkUsageRow({ group: "debate", inputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 50, costUsd: 0.01 }),
    mkUsageRow({ group: "debate", inputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 0,  costUsd: 0.01 }),
  ];
  const [row] = rollupUsage(rows, "group").rows;
  assert.equal(row.cacheReadTokens, 1800);
  assert.equal(row.cacheWriteTokens, 50);
});
