import test from "node:test";
import assert from "node:assert/strict";
import {
  mkUsageRow, appendUsage, rollupUsage, priceTextCall, usageForInitiative,
  USAGE_ROW_LIMIT,
} from "./usage.js";
import { modelById } from "./ai/registry.js";

const SONNET = { inUsdPerMTok: 3, outUsdPerMTok: 15 };

test("a text call is priced from its own token counts", () => {
  // 1M in at $3 plus 1M out at $15.
  assert.equal(priceTextCall(SONNET, 1e6, 1e6), 18);
  assert.equal(priceTextCall(SONNET, 1000, 500), (1000 / 1e6) * 3 + (500 / 1e6) * 15);
});

test("a model with no published rate yields null, never zero", () => {
  assert.equal(priceTextCall(null, 1000, 500), null);
  assert.equal(priceTextCall({}, 1000, 500), null);
  assert.equal(priceTextCall({ inUsdPerMTok: 3 }, 1000, 500), null);
});

test("the shipped Anthropic models carry a price and the unverified ids do not", () => {
  // The catalogue's own rule: an id transcribed from a marketing name is a guess,
  // and a rate attached to it would be a guess on top of a guess.
  assert.ok(modelById("claude-sonnet-5").price.inUsdPerMTok > 0);
  assert.ok(modelById("claude-haiku-4-5").price.outUsdPerMTok > 0);
  assert.equal(modelById("gemini-3.1-pro").price, null);
  assert.equal(modelById("gpt-5.6-sol").price, null);
});

test("the ledger is capped so a browser store cannot be filled by logging", () => {
  let rows = [];
  for (let i = 0; i < USAGE_ROW_LIMIT + 25; i++) {
    rows = appendUsage(rows, mkUsageRow({ group: "capture", fn: "f", model: "m" }));
  }
  assert.equal(rows.length, USAGE_ROW_LIMIT);
});

test("newest rows are kept and oldest fall off", () => {
  const first = mkUsageRow({ group: "a", fn: "first" });
  let rows = appendUsage([], first, 2);
  rows = appendUsage(rows, mkUsageRow({ group: "b", fn: "second" }), 2);
  rows = appendUsage(rows, mkUsageRow({ group: "c", fn: "third" }), 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fn, "third");
  assert.ok(!rows.some(r => r.fn === "first"));
});

test("a rollup separates unpriced calls from free ones", () => {
  const rows = [
    mkUsageRow({ group: "creative", model: "claude-sonnet-5", costUsd: 0.12 }),
    mkUsageRow({ group: "creative", model: "gemini-3.1-pro", costUsd: null }),
  ];
  const roll = rollupUsage(rows, "group");
  assert.equal(roll.totalUsd, 0.12);
  assert.equal(roll.unpriced, 1);
  assert.equal(roll.totalCalls, 2);
  assert.equal(roll.rows[0].unpriced, 1);
});

test("a failed call is recorded and counted separately from spend", () => {
  const rows = [
    mkUsageRow({ group: "debate", costUsd: 0.4, ok: true }),
    mkUsageRow({ group: "debate", costUsd: null, ok: false, errorKind: "http_429" }),
  ];
  const roll = rollupUsage(rows, "group");
  assert.equal(roll.failed, 1);
  assert.equal(roll.totalUsd, 0.4);
  assert.equal(roll.rows[0].failed, 1);
});

test("the same ledger rolls up along any axis", () => {
  const rows = [
    mkUsageRow({ group: "creative", fn: "callCreativeBrief", model: "claude-sonnet-5", provider: "anthropic", costUsd: 0.30 }),
    mkUsageRow({ group: "creative", fn: "callCreativeVariants", model: "claude-sonnet-5", provider: "anthropic", costUsd: 0.10 }),
    mkUsageRow({ group: "capture",  fn: "callQuickCapture", model: "claude-haiku-4-5", provider: "anthropic", costUsd: 0.01 }),
  ];
  const byGroup = rollupUsage(rows, "group");
  assert.equal(byGroup.rows.length, 2);
  assert.equal(byGroup.rows[0].key, "creative");
  assert.equal(Math.round(byGroup.rows[0].usd * 100) / 100, 0.40);

  // Same total, different cut: budgeting versus debugging.
  const byFn = rollupUsage(rows, "fn");
  assert.equal(byFn.rows.length, 3);
  assert.equal(byFn.rows[0].key, "callCreativeBrief");
  assert.equal(Math.round(byFn.totalUsd * 100) / 100, 0.41);
});

test("rows are sorted by spend, not by call count", () => {
  const rows = [
    mkUsageRow({ group: "cheap-but-frequent", costUsd: 0.001 }),
    mkUsageRow({ group: "cheap-but-frequent", costUsd: 0.001 }),
    mkUsageRow({ group: "cheap-but-frequent", costUsd: 0.001 }),
    mkUsageRow({ group: "dear-and-rare", costUsd: 4 }),
  ];
  assert.equal(rollupUsage(rows, "group").rows[0].key, "dear-and-rare");
});

test("a window excludes rows outside it", () => {
  const old = mkUsageRow({ group: "a", costUsd: 9 });
  old.ts = "2000-01-01T00:00:00.000Z";
  const recent = mkUsageRow({ group: "a", costUsd: 1 });
  const roll = rollupUsage([old, recent], "group", { since: "2020-01-01T00:00:00.000Z" });
  assert.equal(roll.totalUsd, 1);
  assert.equal(roll.totalCalls, 1);
});

test("a row with no group is labelled rather than dropped", () => {
  const roll = rollupUsage([mkUsageRow({ group: "", costUsd: 0.5 })], "group");
  assert.equal(roll.rows[0].key, "(unattributed)");
  assert.equal(roll.totalUsd, 0.5);
});

test("spend attributes to the initiative that caused it, across modalities", () => {
  const rows = [
    mkUsageRow({ initiativeId: "e01", modality: "text",  costUsd: 0.30 }),
    mkUsageRow({ initiativeId: "e01", modality: "image", costUsd: 0.04 }),
    mkUsageRow({ initiativeId: "e02", modality: "text",  costUsd: 9.00 }),
  ];
  const mine = usageForInitiative(rows, "e01");
  assert.equal(Math.round(mine.usd * 100) / 100, 0.34);
  assert.equal(mine.calls, 2);
  assert.equal(mine.byModality.image, 0.04);
});

test("the rate that produced a figure is frozen onto the row", () => {
  // A later catalogue change must not silently restate history.
  const row = mkUsageRow({ model: "claude-sonnet-5", costUsd: 0.18, rate: SONNET });
  assert.deepEqual(row.rate, SONNET);
  assert.equal(row.costBasis, "estimate");
});
