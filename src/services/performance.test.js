// Tests for campaign-level performance ingestion.
// Run with: node --test src/services/performance.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_NAMING_SCHEMA, breakdownByDimension } from "./naming.js";
import {
  normHeader, splitCSVLine, toNumber, toISODate, detectCsvShape,
  parsePerformanceCSV, annotateRow, mergePerformanceRows, perfRowKey,
  attachInitiatives, rollupByInitiative, availableDimensions, defaultDimension, deriveRatios,
  ADDITIVE_METRICS, PERF_ROW_LIMIT,
} from "./performance.js";

const S = DEFAULT_NAMING_SCHEMA;

// Two real-shaped Meta ad names against the live template. NH-002 is a tracked
// experiment; the first carries the placeholder, which is normal.
const AD_BAU  = "Meta_LF_ProductPack_Evergreen_F_Taste_Closeup_Pastry_Chocolate_Static_NA";
const AD_TEST = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Strawberry_35s-Raw_NH-002";

const ITEMS = [
  { id: "i1", initId: "NH-002", title: "Creator authority vs product demo", trackingTag: "NH-002" },
  { id: "i2", initId: "NH-003", title: "Untagged one", trackingTag: "" },
];

// -- Header normalisation ------------------------------------------------------

test("platform header noise normalises away", () => {
  assert.equal(normHeader("Amount spent (USD)"), "amount_spent");
  assert.equal(normHeader("CPM (cost per 1,000 impressions)"), "cpm");
  assert.equal(normHeader("Conv. value"), "conv_value");
  assert.equal(normHeader("Impr."), "impr");
  assert.equal(normHeader('"Ad name"'), "ad_name");
});

test("quoted commas do not shift columns", () => {
  // The failure this guards: a naive split(",") turns this into four fields and
  // every metric lands one column to the left.
  assert.deepEqual(
    splitCSVLine('Meta_LF_A_B_C,"Spring, summer",12.50'),
    ["Meta_LF_A_B_C", "Spring, summer", "12.50"]
  );
});

test("currency, thousands separators and percents parse to plain numbers", () => {
  assert.equal(toNumber("$1,234.50"), 1234.5);
  assert.equal(toNumber("2.31%"), 2.31);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber("—"), null);
});

test("dates normalise to ISO and an absent date stays absent", () => {
  assert.equal(toISODate("2026-07-27"), "2026-07-27");
  assert.equal(toISODate("7/27/2026"), "2026-07-27");
  assert.equal(toISODate(""), "");        // lifetime rollup, not today's date
  assert.equal(toISODate("not a date"), "");
});

// -- Shape detection -----------------------------------------------------------

test("a weekly-brand export is not mistaken for a campaign export", () => {
  const d = detectCsvShape(["date", "brand", "source", "revenue", "spend"]);
  assert.equal(d.shape, "weekly");
});

test("an entity-name column is what makes a file campaign-level", () => {
  const d = detectCsvShape(["Reporting starts", "Campaign name", "Ad set name", "Ad name", "Amount spent (USD)"]);
  assert.equal(d.shape, "performance");
  assert.deepEqual(d.levels.sort(), ["ad", "adset", "campaign"]);
});

test("an account column aliasing to brand does not misclassify a Meta export", () => {
  // "Account name" reads like the weekly contract's brand column; having a name
  // to parse is the test, not the absence of a brand-ish header.
  assert.equal(detectCsvShape(["Account name", "Ad name", "Amount spent"]).shape, "performance");
});

// -- Parsing -------------------------------------------------------------------

const META_CSV = [
  'Reporting starts,Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Link clicks,Purchases,Purchases conversion value',
  `2026-07-27,Meta_Prospect_Pastry_US_Purchase,"US, 25-34",${AD_BAU},"1,200.00",84000,1260,42,"5,040.00"`,
  `2026-07-27,Meta_Prospect_Pastry_US_Purchase,"US, 25-34",${AD_TEST},800.00,52000,910,31,"4,030.00"`,
  `2026-07-28,Meta_Prospect_Pastry_US_Purchase,"US, 25-34",${AD_TEST},400.00,26000,455,15,"1,950.00"`,
].join("\n");

test("a Meta ad-level export parses into rows at the ad level", () => {
  const { rows, errors, identityLevel } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  assert.equal(identityLevel, "ad");           // finest grain present wins
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
  assert.equal(rows.every(r => r.parsed), true);
  assert.equal(rows[0].metrics.spend, 1200);
  assert.equal(rows[0].metrics.revenue, 5040);
  assert.equal(rows[0].metrics.conversions, 42);
  assert.equal(rows[0].values.flavor, "Chocolate");
  assert.equal(rows[0].date, "2026-07-27");
});

test("a name that does not fit the template is kept and counted, never dropped", () => {
  const csv = [
    "Ad name,Amount spent",
    `${AD_TEST},100`,
    "Meta_LF_TooFewSlots,250",
  ].join("\n");
  const { rows, stats } = parsePerformanceCSV(csv, S, { channel: "meta" });
  assert.equal(rows.length, 2);                 // the bad row survives
  assert.equal(stats.unparsed, 1);
  assert.equal(stats.unparsedSpend, 250);       // and its spend is visible
  assert.equal(rows[1].parsed, false);
  assert.ok(rows[1].parseErrors[0].includes("11 slots"));
});

test("a file with no name column is refused rather than half-imported", () => {
  const { rows, errors } = parsePerformanceCSV("date,brand,revenue\n2026-07-27,Cortisol,100", S, { channel: "meta" });
  assert.equal(rows.length, 0);
  assert.ok(errors[0].includes("campaign-level export"));
});

test("auto-detect resolves a name it can, and refuses one it cannot", () => {
  const ok = annotateRow({ name: AD_TEST, level: "ad", channel: null, metrics: {} }, S);
  assert.equal(ok.parsed, true);
  assert.equal(ok.channel, "meta");

  const bad = annotateRow({ name: "Nope_Nope", level: "ad", channel: null, metrics: {} }, S);
  assert.equal(bad.parsed, false);
  assert.ok(bad.parseErrors[0].length > 0);
});

test("choosing the wrong channel reports it instead of forcing an alignment", () => {
  // The Google ad template has 10 slots; the Meta name has 11.
  const { rows } = parsePerformanceCSV(`Ad name,Amount spent\n${AD_TEST},100`, S, { channel: "google" });
  assert.equal(rows[0].parsed, false);
  assert.equal(rows[0].values.flavor, undefined);
});

// -- Merging -------------------------------------------------------------------

test("re-importing the same export replaces rather than double-counts", () => {
  const { rows } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  const first  = mergePerformanceRows([], rows);
  const second = mergePerformanceRows(first.rows, rows);
  assert.equal(first.rows.length, 3);
  assert.equal(second.rows.length, 3);
  assert.equal(second.replaced, 3);
});

test("the row key separates the same ad on two different days", () => {
  const a = { date: "2026-07-27", channel: "meta", level: "ad", name: AD_TEST };
  const b = { ...a, date: "2026-07-28" };
  assert.notEqual(perfRowKey(a), perfRowKey(b));
  // …and collapses a case difference, matching how the schema compares elsewhere.
  assert.equal(perfRowKey(a), perfRowKey({ ...a, name: AD_TEST.toLowerCase() }));
});

test("the row cap drops the oldest and says how many", () => {
  const many = Array.from({ length: PERF_ROW_LIMIT + 10 }, (_, i) => ({
    date: "2020-01-" + String((i % 28) + 1).padStart(2, "0"),
    channel: "meta", level: "ad", name: "n" + i, metrics: {},
  }));
  const { rows, dropped } = mergePerformanceRows([], many);
  assert.equal(rows.length, PERF_ROW_LIMIT);
  assert.equal(dropped, 10);
});

// -- The initiative bridge -----------------------------------------------------

test("untagged spend and a broken tag are counted separately", () => {
  const { rows } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  const { counts, spend } = attachInitiatives(rows, ITEMS, S);
  assert.equal(counts.matched, 2);      // two days of the tagged ad
  assert.equal(counts.untagged, 1);     // the NA-slot business-as-usual ad
  assert.equal(spend.matched, 1200);
  assert.equal(spend.untagged, 1200);
});

test("a tag pointing at nothing is a broken link, not untagged spend", () => {
  const orphan = AD_TEST.replace("NH-002", "NH-999");
  const { rows } = parsePerformanceCSV(`Ad name,Amount spent\n${orphan},500`, S, { channel: "meta" });
  const { counts, rows: attached } = attachInitiatives(rows, ITEMS, S);
  assert.equal(counts.unmatched, 1);
  assert.equal(attached[0].trackingTag, "NH-999");
  assert.equal(attached[0].initiativeId, null);
});

test("tag matching ignores case, so nh-002 still finds NH-002", () => {
  const lower = AD_TEST.replace("NH-002", "nh-002");
  const { rows } = parsePerformanceCSV(`Ad name,Amount spent\n${lower},500`, S, { channel: "meta" });
  const { counts } = attachInitiatives(rows, ITEMS, S);
  assert.equal(counts.matched, 1);
});

test("an initiative rollup sums days and recomputes ratios from the totals", () => {
  const { rows } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  const { groups } = rollupByInitiative(rows, ITEMS, S);
  assert.equal(groups.length, 1);
  const g = groups[0];
  assert.equal(g.initiative.initId, "NH-002");
  assert.equal(g.metrics.spend, 1200);         // 800 + 400
  assert.equal(g.metrics.revenue, 5980);       // 4030 + 1950
  assert.equal(g.metrics.conversions, 46);
  assert.equal(g.firstDate, "2026-07-27");
  assert.equal(g.lastDate, "2026-07-28");
  // ROAS from summed totals (5980/1200), not the mean of the two daily ROASes.
  assert.equal(Math.round(g.ratios.roas * 1000) / 1000, 4.983);
});

test("ratios are null rather than Infinity when the denominator is zero", () => {
  const r = deriveRatios({ spend: 0, revenue: 100, conversions: 0, clicks: 0, impressions: 0 });
  assert.equal(r.roas, null);
  assert.equal(r.cpa, null);
  assert.equal(r.ctr, null);
});

test("no ratio metric is treated as additive", () => {
  ["roas", "cpa", "cpc", "cpm", "ctr"].forEach(k => assert.equal(ADDITIVE_METRICS.includes(k), false));
});

// -- Breakdown -----------------------------------------------------------------

test("imported rows pivot through breakdownByDimension unchanged", () => {
  // The point of the row shape: it is already what the shipped, tested
  // breakdown function expects — {name, metrics, channel, level}.
  const { rows } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  const { groups, unparsed } = breakdownByDimension(rows, "flavor", S);
  assert.equal(unparsed, 0);
  const byValue = Object.fromEntries(groups.map(g => [g.value, g.metrics.spend]));
  assert.equal(byValue.Chocolate, 1200);
  assert.equal(byValue.Strawberry, 1200);
});

test("the dimension picker offers only dimensions the imported rows carry", () => {
  const { rows } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  // Returned in registry order rather than template order, so the picker reads
  // the same way whichever channel the file came from.
  const keys = availableDimensions(rows, S).map(d => d.key);
  assert.deepEqual(
    [...keys].sort(),
    ["angle", "asset", "campaign", "category", "channel", "flavor", "format", "gender", "handle", "initiative", "theme"]
  );
  assert.equal(keys.includes("geo"), false);   // ad-level template has no geo slot
});

test("a breakdown opens on a dimension that splits the data, not on channel", () => {
  // Every row in a single-platform export shares one channel, so registry order
  // would open the view on a one-bar pivot showing nothing.
  const { rows } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  const d = defaultDimension(rows, S);
  assert.notEqual(d.key, "channel");
  assert.notEqual(d.key, S.initiativeDimension);
  assert.ok(["asset", "handle", "campaign", "theme", "angle", "flavor", "format"].includes(d.key));
});

test("a set with nothing to split falls back rather than returning null", () => {
  const one = parsePerformanceCSV(`Ad name,Amount spent\n${AD_TEST},100`, S, { channel: "meta" }).rows;
  assert.ok(defaultDimension(one, S));
  assert.equal(defaultDimension([], S), null);
});

// -- Attribution by claimed name -----------------------------------------------
//
// The second bridge: spend that was named in Ads Manager long before this
// convention existed, and cannot be renamed without resetting the campaign's
// learning phase. These names parse against nothing, and must still measure.

const LEGACY_CSV = [
  "Campaign name,Ad set name,Ad name,Amount spent,Purchases",
  '"Spring Sale - Prospecting","LAL 3% Buyers","Video A 30s",900,18',
  '"Spring Sale - Prospecting","LAL 3% Buyers","Static B",600,9',
  '"Winter Clearance","Retarget 30d","Carousel C",300,4',
].join("\n");

test("a claimed campaign attributes every ad row underneath it", () => {
  const items = [{ id:"i9", initId:"NH-010", title:"Spring creative refresh", adNames:[{ name:"Spring Sale - Prospecting" }] }];
  const { rows } = parsePerformanceCSV(LEGACY_CSV, S, { channel: "meta" });
  const { counts, spend } = attachInitiatives(rows, items, S);
  assert.equal(counts.matched, 2, "both ads inside the claimed campaign");
  assert.equal(counts.unparsed, 1, "the Winter row is claimed by nobody and fits no template");
  assert.equal(spend.matched, 1500);
});

test("attribution by claimed name works on names that parse against nothing", () => {
  const items = [{ id:"i9", adNames:["Video A 30s"] }];
  const { rows } = parsePerformanceCSV(LEGACY_CSV, S, { channel: "meta" });
  const attached = attachInitiatives(rows, items, S).rows;
  const hit = attached.find(r => r.name === "Video A 30s");
  assert.equal(hit.parsed, false, "the string is not convention-shaped, and never will be");
  assert.equal(hit.attribution, "matched");
  assert.equal(hit.attributionVia, "name");
  assert.equal(hit.initiativeId, "i9");
});

test("a claimed ad wins over the campaign it sits inside", () => {
  const items = [
    { id:"campaignOwner", adNames:["Spring Sale - Prospecting"] },
    { id:"adOwner",       adNames:["Static B"] },
  ];
  const { rows } = parsePerformanceCSV(LEGACY_CSV, S, { channel: "meta" });
  const attached = attachInitiatives(rows, items, S).rows;
  assert.equal(attached.find(r => r.name === "Static B").initiativeId, "adOwner");
  assert.equal(attached.find(r => r.name === "Video A 30s").initiativeId, "campaignOwner");
});

test("a claim beats the tag slot when the two disagree", () => {
  // AD_TEST's own name says NH-002. A different initiative has claimed the
  // string outright, and a person pointing at a specific name outranks a
  // convention that could have been followed by accident.
  const items = [
    ...ITEMS,
    { id:"i7", initId:"NH-007", title:"Claimed it explicitly", adNames:[AD_TEST] },
  ];
  const { rows } = parsePerformanceCSV(`Ad name,Amount spent\n${AD_TEST},500`, S, { channel: "meta" });
  const attached = attachInitiatives(rows, items, S).rows;
  assert.equal(attached[0].initiativeId, "i7");
  assert.equal(attached[0].attributionVia, "name");
});

test("with nothing claimed, the tag path is byte-for-byte what it always was", () => {
  const { rows } = parsePerformanceCSV(META_CSV, S, { channel: "meta" });
  const withEmpty = attachInitiatives(rows, ITEMS.map(i => ({ ...i, adNames: [] })), S);
  const without   = attachInitiatives(rows, ITEMS, S);
  assert.deepEqual(withEmpty.counts, without.counts);
  assert.deepEqual(withEmpty.rows.map(r => r.initiativeId), without.rows.map(r => r.initiativeId));
  assert.ok(without.rows.filter(r => r.attribution === "matched").every(r => r.attributionVia === "tag"));
});

test("a rollup records which bridge carried it", () => {
  const items = [{ id:"i9", initId:"NH-010", title:"Spring creative refresh", adNames:["Spring Sale - Prospecting"] }];
  const { rows } = parsePerformanceCSV(LEGACY_CSV, S, { channel: "meta" });
  const { groups } = rollupByInitiative(rows, items, S);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].via, ["name"]);
  assert.equal(groups[0].metrics.spend, 1500);
  assert.equal(groups[0].metrics.conversions, 27);
});
