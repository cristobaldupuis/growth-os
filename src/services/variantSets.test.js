// Variant sets are append-only and freeze when their names ship. These are the
// properties the "ad name carries the link" claim now rests on, so each one is
// asserted directly — including the join from a shipped name back to its words.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setsOf, currentSet, isShipped, withNewSet, withNaming, withVariantChange, withCritique, withShipped,
  shippedAdIndex, topAdsByReturn, formatWinnersBlock,
} from "./variantSets.js";

const apply = (record, patch) => (patch ? { ...record, ...patch } : record);
const V = (hook, naming = { angle: "Fresh" }) => ({ hook, naming, angleSlug: "Fresh", copy: { headline: hook + " headline" }, beats: [{ time: "0-2s", visual: "jar", voiceover: hook, onScreen: "" }] });

test("a new set is appended, never a replacement, and becomes current", () => {
  let r = { initiativeId: "i1", briefVersion: 2, variantsVersion: 0 };
  r = apply(r, withNewSet(r, { variants: [V("a")], channel: "meta", perAngle: 1 }, new Date("2026-09-01")));
  r = apply(r, withNewSet(r, { variants: [V("b")], channel: "tiktok", perAngle: 1 }, new Date("2026-09-02")));
  assert.equal(r.variantSets.length, 2);
  assert.equal(r.variantsVersion, 2);
  assert.equal(currentSet(r).channel, "tiktok");
  assert.equal(r.variants[0].hook, "b", "the record still mirrors the current set for older readers");
  assert.equal(r.variantSets[0].variants[0].hook, "a", "the earlier set is untouched");
});

test("a record from before sets existed has one implied set, and it is current", () => {
  const legacy = { initiativeId: "i1", briefVersion: 1, variants: [V("old")] };
  assert.equal(setsOf(legacy).length, 1);
  assert.equal(currentSet(legacy).variants[0].hook, "old");
  const next = apply(legacy, withNewSet(legacy, { variants: [V("new")], channel: "meta" }));
  assert.equal(next.variantSets.length, 2, "the legacy set is kept when the first real one is added");
  assert.equal(currentSet(next).variants[0].hook, "new");
});

test("naming edits and suggestions persist on an open set and are refused on a shipped one", () => {
  let r = { initiativeId: "i1", briefVersion: 1, variantsVersion: 0 };
  r = apply(r, withNewSet(r, { variants: [V("a"), V("b")], channel: "meta" }));
  r = apply(r, withNaming(r, 1, "theme", "Morning"));
  assert.equal(currentSet(r).variants[1].naming.theme, "Morning");
  assert.equal(r.variants[1].naming.theme, "Morning");

  r = apply(r, withShipped(r, { 0: { ad: "Meta_a_NA", levels: { ad: "Meta_a_NA" } }, 1: { ad: "Meta_b_NA", levels: { ad: "Meta_b_NA" } } }, "csv", new Date("2026-09-03")));
  assert.ok(isShipped(currentSet(r)));
  assert.equal(withNaming(r, 1, "theme", "Evening"), null, "a shipped set's names cannot change");
  assert.equal(withVariantChange(r, 0, v => ({ ...v, hook: "rewritten" })), null, "nor its words");
});

test("the first ship wins: later ships record how, never rewrite what", () => {
  let r = { initiativeId: "i1", briefVersion: 1, variantsVersion: 0 };
  r = apply(r, withNewSet(r, { variants: [V("a")], channel: "meta" }));
  r = apply(r, withShipped(r, { 0: { ad: "FIRST" } }, "names", new Date("2026-09-03")));
  r = apply(r, withShipped(r, { 0: { ad: "SECOND" } }, "static", new Date("2026-09-09")));
  const s = currentSet(r);
  assert.equal(s.names[0].ad, "FIRST");
  assert.equal(s.shippedAt, new Date("2026-09-03").toISOString());
  assert.deepEqual(s.shippedVia, ["names", "static"]);
});

test("a review attaches to the current set only", () => {
  let r = { initiativeId: "i1", briefVersion: 1, variantsVersion: 0 };
  r = apply(r, withNewSet(r, { variants: [V("a")], channel: "meta" }));
  r = apply(r, withCritique(r, { byIdx: { 0: { score: 7 } } }));
  assert.equal(currentSet(r).critique.byIdx[0].score, 7);
  assert.equal(withCritique({ initiativeId: "x" }, {}), null);
});

// -- From a shipped name to what it earned -----------------------------------------

function shippedRecord(initiativeId, hooks) {
  let r = { initiativeId, briefVersion: 1, variantsVersion: 0 };
  r = apply(r, withNewSet(r, { variants: hooks.map(h => V(h)), channel: "meta" }));
  const names = Object.fromEntries(hooks.map((h, i) => [i, { ad: `Meta_${h}_TAG`, levels: { ad: `Meta_${h}_TAG` } }]));
  return apply(r, withShipped(r, names, "csv"));
}

const row = (name, spend, revenue, conversions = 1) => ({ name, metrics: { spend, revenue, conversions, roas: 99 } });

test("only shipped sets are indexed, keyed on the name as the ad account spells it", () => {
  const shipped = shippedRecord("i1", ["alpha", "beta"]);
  let open = { initiativeId: "i2", briefVersion: 1, variantsVersion: 0 };
  open = apply(open, withNewSet(open, { variants: [V("gamma")], channel: "meta" }));
  const index = shippedAdIndex([shipped, open]);
  assert.equal(index.size, 2);
  assert.equal(index.get("meta_alpha_tag").variant.hook, "alpha", "case-insensitive, like every other name join");
});

test("ads are summed across days, ranked by recomputed ROAS, and thin ones are never ranked", () => {
  const index = shippedAdIndex([shippedRecord("i1", ["alpha", "beta", "gamma", "delta", "thin"])]);
  const rows = [
    row("Meta_alpha_TAG", 400, 1600), row("Meta_alpha_TAG", 400, 1600),   // 4.0x on $800
    row("Meta_beta_TAG", 1000, 2000),                                     // 2.0x
    row("Meta_gamma_TAG", 1000, 500),                                     // 0.5x
    row("Meta_delta_TAG", 1000, 3000),                                    // 3.0x
    row("Meta_thin_TAG", 40, 400),                                        // 10x on $40 — luck
    row("Meta_unrelated_TAG", 5000, 50000),
  ];
  const out = topAdsByReturn(rows, index, { limit: 2 });
  assert.deepEqual(out.winners.map(a => a.variant.hook), ["alpha", "delta"]);
  assert.equal(out.winners[0].metrics.spend, 800);
  assert.equal(out.winners[0].roas, 4, "a ratio column on the rows is ignored and recomputed from sums");
  assert.deepEqual(out.losers.map(a => a.variant.hook), ["gamma", "beta"]);
  assert.equal(out.thin, 1);
  assert.equal(out.shipped, 5);

  const block = formatWinnersBlock(out);
  assert.match(block, /WON:[\s\S]*Meta_alpha_TAG — 4\.00x ROAS on \$800/);
  assert.match(block, /hook: "alpha"/);
  assert.match(block, /LOST:/);
  assert.match(block, /1 more shipped ad below the evidence floor/);
});

test("results are scoped to the initiative's brand", () => {
  const index = shippedAdIndex([shippedRecord("i1", ["alpha"]), shippedRecord("i2", ["beta"])]);
  const rows = [row("Meta_alpha_TAG", 1000, 3000), row("Meta_beta_TAG", 1000, 4000)];
  const initiativesById = new Map([["i1", { brandId: "north" }], ["i2", { brandId: "south" }]]);
  const out = topAdsByReturn(rows, index, { initiativesById, brandId: "north" });
  assert.deepEqual(out.winners.map(a => a.variant.hook), ["alpha"]);
});

test("the winners block says what is missing rather than implying evidence", () => {
  assert.match(formatWinnersBlock(null), /no ads shipped from this studio yet/);
  assert.match(formatWinnersBlock({ winners: [], losers: [], judged: 2, thin: 2, shipped: 3 }), /none yet above the \$500 evidence floor/);
});
