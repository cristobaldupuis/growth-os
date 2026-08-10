// Tests for the pre-implementation account audit.
// Run with: node --test src/services/accountAudit.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractNames, distinctNames, slotHistogram, inferDelimiter,
  profileSlots, schemaFit, auditAccount, auditToCSV,
} from "./accountAudit.js";
import { DEFAULT_NAMING_SCHEMA } from "./naming.js";

const S = { namingSchema: DEFAULT_NAMING_SCHEMA };

// The operator's live Meta convention, which is what a well-run account looks
// like: eleven slots, underscore-delimited, every value in a controlled list.
const GOOD = [
  "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA",
  "Meta_Col_EmmaBrune_R3_M_Fitness_Gym_Pastry_Strawberry_35s-Raw_NA",
  "Meta_WL_StudioSet_R4_F_Fitness_Home_Pastry_Chocolate_Video_NA",
];

// What an account that has never had a convention looks like.
const MESSY = [
  "Summer Sale - final",
  "TEST campaign 2 (copy)",
  "retargeting_broad",
  "BF2025|prospecting|video",
];

// -- Extraction ----------------------------------------------------------------

test("a bare list treats the first line as data, not a header", () => {
  const { names, source } = extractNames(GOOD.join("\n"));
  assert.equal(source, "list");
  assert.equal(names.length, 3);
  assert.equal(names[0], GOOD[0]);
});

test("a CSV export is read from its finest-grained name column", () => {
  const csv = [
    "Campaign name,Ad name,Amount spent",
    `R3_Prospecting,${GOOD[0]},100`,
    `R3_Prospecting,${GOOD[1]},90`,
  ].join("\n");
  const { names, source, column, level } = extractNames(csv);
  assert.equal(source, "csv");
  assert.equal(level, "ad");
  assert.equal(column, "Ad name");
  assert.deepEqual(names, [GOOD[0], GOOD[1]]);
});

test("a personal column in the pasted export is reported at the point of paste", () => {
  const csv = ["Ad name,Email", `${GOOD[0]},a@b.co`].join("\n");
  const { scan } = extractNames(csv);
  assert.equal(scan.clean, false);
  assert.deepEqual(scan.kinds, ["email"]);
});

test("empty input is not an error", () => {
  const { names, source } = extractNames("   \n\n");
  assert.deepEqual(names, []);
  assert.equal(source, "empty");
});

// -- Corpus --------------------------------------------------------------------

test("duplicates are counted, not dropped silently", () => {
  const d = distinctNames([GOOD[0], GOOD[0], GOOD[1], "  " + GOOD[0] + "  "]);
  assert.equal(d.length, 2);
  assert.equal(d[0].count, 3);
});

// -- Delimiter -----------------------------------------------------------------

test("the delimiter is inferred from consistency, not from frequency", () => {
  const d = inferDelimiter(GOOD, "_");
  assert.equal(d.chosen, "_");
  assert.equal(d.unstructured, false);
  // A hyphen appears inside "35s-Raw" in most of these names, so it splits them
  // just as consistently as the underscore does — into two slots. Consistency
  // alone cannot separate the two; the information the split carries can.
  const hyphen = d.candidates.find(c => c.delimiter === "-");
  const underscore = d.candidates.find(c => c.delimiter === "_");
  assert.ok(underscore.dominantSlots > hyphen.dominantSlots);
});

test("an account with no convention is called unstructured rather than given a winner", () => {
  const d = inferDelimiter(["Summer Sale final", "TEST campaign", "another one"], "_");
  assert.equal(d.unstructured, true);
  assert.equal(d.chosen, "_", "falls back to the schema's own delimiter");
});

test("a tie goes to the schema's delimiter, because changing it invalidates every built name", () => {
  const names = ["a_b", "c|d"];
  assert.equal(inferDelimiter(names, "_").chosen, "_");
  assert.equal(inferDelimiter(names, "|").chosen, "|");
});

// -- Shape ---------------------------------------------------------------------

test("the slot histogram is the diagnostic, and it is ordered by weight", () => {
  const h = slotHistogram(["a_b_c", "d_e_f", "g_h", "i_j_k_l"], "_");
  assert.equal(h[0].slots, 3);
  assert.equal(h[0].count, 2);
  assert.equal(h.length, 3);
  assert.ok(Math.abs(h.reduce((s, r) => s + r.share, 0) - 1) < 1e-9);
});

// -- Slot profiling ------------------------------------------------------------

test("slots are profiled only across names of the dominant shape", () => {
  // The 3-slot name must not contribute to position 0 of the 11-slot profile.
  const slots = profileSlots([...GOOD, "one_two_three"], "_", 11, DEFAULT_NAMING_SCHEMA);
  assert.equal(slots.length, 11);
  assert.equal(slots[0].distinct, 1);
  assert.equal(slots[0].top[0].value, "Meta");
  assert.equal(slots[0].top[0].count, 3);
});

test("a slot is matched to the dimension whose vocabulary covers it", () => {
  const slots = profileSlots(GOOD, "_", 11, DEFAULT_NAMING_SCHEMA);
  assert.equal(slots[0].suggestions[0].key, "channel");
  assert.equal(slots[0].suggestions[0].coverage, 1);
});

test("a high-cardinality slot is named as free text rather than forced into a vocabulary", () => {
  const names = Array.from({ length: 40 }, (_, i) => `Meta_Col_Asset${i}_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA`);
  const slots = profileSlots(names, "_", 11, DEFAULT_NAMING_SCHEMA);
  assert.equal(slots[2].freeText, true);
  assert.equal(slots[0].freeText, false);
});

// -- Schema fit ----------------------------------------------------------------

test("a compliant account parses at 100% against the template it was named for", () => {
  const fit = schemaFit(GOOD, DEFAULT_NAMING_SCHEMA);
  const meta = fit.find(f => f.channel === "meta" && f.level === "ad");
  assert.equal(meta.parsed, 3);
  assert.equal(meta.rate, 1);
});

test("failures are classified by the work they imply, not counted together", () => {
  const names = [
    GOOD[0],                                                                        // parses
    "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate",                          // wrong slot count
    "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA_extra",         // wrong slot count
    "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Peppermint_35s-Raw_NA",              // unknown value
    "Meta_Col_Emma Brune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA",              // space inside a value
  ];
  const meta = schemaFit(names, DEFAULT_NAMING_SCHEMA).find(f => f.channel === "meta" && f.level === "ad");
  assert.equal(meta.parsed, 1);
  assert.equal(meta.failures.slots, 2);
  assert.equal(meta.failures.vocab, 1);
  assert.equal(meta.failures.illegal, 1);
  // The unknown value is reported as an addition to make, since that is a
  // one-call fix rather than a rename.
  const flavor = meta.missingVocab.find(m => m.key === "flavor");
  assert.deepEqual(flavor.values, ["Peppermint"]);
});

test("the placeholder is never treated as a vocabulary miss", () => {
  const meta = schemaFit(["Meta_Col_EmmaBrune_R3_NA_NA_NA_NA_NA_NA_NA"], DEFAULT_NAMING_SCHEMA)
    .find(f => f.channel === "meta" && f.level === "ad");
  assert.equal(meta.parsed, 1);
});

// -- The whole audit -----------------------------------------------------------

test("a good account audits as cheap to implement", () => {
  const a = auditAccount([...GOOD, GOOD[0]], S);
  assert.equal(a.corpus.rows, 4);
  assert.equal(a.corpus.distinct, 3);
  assert.equal(a.corpus.repeated, 1);
  assert.equal(a.delimiter.using, "_");
  assert.equal(a.delimiter.matchesSchema, true);
  assert.equal(a.dominant.slots, 11);
  assert.equal(a.retrofit.count, 0);
});

test("a messy account audits as expensive, and says so in names rather than hours", () => {
  const a = auditAccount(MESSY, S);
  assert.equal(a.retrofit.count, MESSY.length);
  assert.equal(a.retrofit.share, 1);
  // No hours figure is produced anywhere: how fast one name is mapped is the
  // operator's knowledge, not this module's assumption.
  assert.equal(JSON.stringify(a).includes("hours"), false);
});

test("the retrofit list is the names, because a count cannot be worked from", () => {
  const a = auditAccount([GOOD[0], "Summer Sale - final"], S);
  assert.equal(a.retrofit.count, 1);
  assert.deepEqual(a.retrofit.sample, ["Summer Sale - final"]);
});

test("an empty account does not throw", () => {
  const a = auditAccount([], S);
  assert.equal(a.corpus.rows, 0);
  assert.equal(a.retrofit.count, 0);
  assert.equal(a.slots.length, 0);
});

test("the audit exports as a file, with the findings a quote is built from", () => {
  const csv = auditToCSV(auditAccount([...GOOD, "Summer Sale - final"], S));
  assert.match(csv, /^section,key,value,detail/);
  assert.match(csv, /retrofit,names to map by hand,1/);
  assert.match(csv, /Summer Sale - final/);
  assert.match(csv, /11 slots/);
});

test("a value containing a comma survives the export intact", () => {
  const csv = auditToCSV(auditAccount(["Meta_Col_Asset_R3,x_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA"], S));
  assert.match(csv, /"R3,x"/);
});
