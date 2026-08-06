// Tests for the campaign nomenclature parser/builder.
// Run with: node --test src/services/naming.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_NAMING_SCHEMA, NA,
  buildName, parseName, validateSegment,
  trackingTagFromName, matchNamesToInitiatives,
  suggestTrackingTag, breakdownBySegment, resolveSchema, initiativeSegment,
} from "./naming.js";

const S = DEFAULT_NAMING_SCHEMA;

// A real row lifted from the operator's spec sheet, used as the golden case.
const GOLDEN = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA";
const GOLDEN_VALUES = {
  channel:"Meta", handle:"Col", asset:"EmmaBrune", campaign:"R3", gender:"F",
  theme:"Fitness", angle:"Gym", category:"Pastry", flavor:"Chocolate",
  format:"35s-Raw", initiative:"NA",
};

test("schema has 11 segments in the documented order", () => {
  assert.equal(S.segments.length, 11);
  assert.deepEqual(
    S.segments.map(s => s.key),
    ["channel","handle","asset","campaign","gender","theme","angle","category","flavor","format","initiative"]
  );
  assert.equal(S.delimiter, "_");
});

test("buildName reproduces the golden row exactly", () => {
  const { name, errors } = buildName(GOLDEN_VALUES, S);
  assert.equal(name, GOLDEN);
  assert.deepEqual(errors, []);
});

test("parseName round-trips the golden row", () => {
  const { values, errors, ok } = parseName(GOLDEN, S);
  assert.deepEqual(values, GOLDEN_VALUES);
  assert.deepEqual(errors, []);
  assert.equal(ok, true);
});

test("every ad name in the operator's sheet parses cleanly", () => {
  // A sample spanning creator ads, product ads and the tagged rows at the end.
  const rows = [
    "Meta_Col_DanielleHarms_R3_F_Fitness_Gym_SweetRolls_Cinnamon_30s-Captions_NA",
    "Meta_Col_CarlosHarris_R3_M_Fitness_Fitness_Chips_BBQ_25s-Raw_NA",
    "Meta_LF_Catalog_Generic_NA_Product_NA_All_NA_Enhanced_NA",
    "Meta_LF_ProductPack_Donuts_NA_Product_ProductLaunch_Donuts_PinkSprinkle_Carousel_NA",
    "Meta_LF_ProductSingle_FreeSample_NA_Product_FreeProduct_Donuts_VanillaGlazed_Static_TryFree",
    "Meta_LF_ProductSingle_Evergreen_NA_Product_NewProduct_Donuts_Blueberry_Static-Boost_NewLaunch",
    "Meta_Col_GrantLarsen_R4_M_Protein_NA_Donuts_Varied_NA_NA",
  ];
  rows.forEach(r => {
    const { errors, ok } = parseName(r, S);
    assert.deepEqual(errors, [], `expected "${r}" to parse cleanly`);
    assert.equal(ok, true);
  });
});

// The whole point of the NA rule. A blank segment doesn't fail loudly — it
// shifts everything after it — so this is the case the parser must refuse.
test("a name with an omitted segment is refused, not silently misaligned", () => {
  const short = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw"; // 10, not 11
  const { ok, errors, values } = parseName(short, S);
  assert.equal(ok, false);
  assert.deepEqual(values, {}, "must not return a guessed alignment");
  assert.match(errors[0], /Expected 11 segments, found 10/);
});

test("trailing extra segments are reported and captured, not dropped", () => {
  const { extra, errors, values } = parseName(GOLDEN + "_OOPS", S);
  assert.deepEqual(extra, ["OOPS"]);
  assert.equal(values.channel, "Meta", "the first 11 still parse");
  assert.ok(errors.some(e => /found 12/.test(e)));
});

test("off-vocabulary values are flagged but still parsed", () => {
  const typo = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_SwetRolls_Chocolate_35s-Raw_NA";
  const { values, errors, ok } = parseName(typo, S);
  assert.equal(values.category, "SwetRolls", "value is preserved for the operator to see");
  assert.equal(ok, false);
  assert.ok(errors.some(e => /Category "SwetRolls" is not in the controlled list/.test(e)));
});

test("free-text segments accept anything legal", () => {
  const angle = S.segments.find(s => s.key === "angle");
  assert.equal(angle.vocab, null);
  assert.equal(validateSegment(angle, "BrandNewHook", "_"), null);
});

test("spaces and delimiters inside a segment are rejected", () => {
  const asset = S.segments.find(s => s.key === "asset");
  assert.match(validateSegment(asset, "Emma Brune", "_"), /space or comma/);
  assert.match(validateSegment(asset, "Emma_Brune", "_"), /contains the delimiter/);
  assert.match(validateSegment(asset, "", "_"), /is empty/);
});

test("buildName fills missing keys with NA rather than throwing", () => {
  const { name } = buildName({ channel:"Meta", handle:"LF" }, S);
  assert.equal(name, "Meta_LF_NA_NA_NA_NA_NA_NA_NA_NA_NA");
  assert.equal(name.split("_").length, 11);
});

// -- The Growth OS bridge ------------------------------------------------------

test("trackingTagFromName reads the initiative segment", () => {
  assert.equal(trackingTagFromName("Meta_LF_ProductSingle_FreeSample_NA_Product_FreeProduct_Donuts_VanillaGlazed_Static_TryFree", S), "TryFree");
});

test("an NA initiative segment yields no tag", () => {
  assert.equal(trackingTagFromName(GOLDEN, S), null);
});

test("an unparseable name yields no tag rather than a wrong one", () => {
  assert.equal(trackingTagFromName("Meta_LF_Broken", S), null);
});

test("matchNamesToInitiatives separates untagged from broken links", () => {
  const items = [
    { id:"e1", initId:"LF-001", trackingTag:"TryFree",   title:"Free sample offer" },
    { id:"e2", initId:"LF-002", trackingTag:"NewLaunch", title:"Blueberry launch" },
  ];
  const names = [
    "Meta_LF_ProductSingle_FreeSample_NA_Product_FreeProduct_Donuts_VanillaGlazed_Static_TryFree",
    "Meta_LF_ProductSingle_Evergreen_NA_Product_NewProduct_Donuts_Blueberry_Static-Boost_GhostTag",
    GOLDEN,
  ];
  const { matched, unmatched, untagged } = matchNamesToInitiatives(names, items, S);

  assert.equal(matched.length, 1);
  assert.equal(matched[0].initiative.initId, "LF-001");
  // A tag that resolves to nothing is a broken link worth surfacing...
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].trackingTag, "GhostTag");
  // ...whereas NA is just business-as-usual spend and must not be reported as one.
  assert.deepEqual(untagged, [GOLDEN]);
});

test("suggestTrackingTag produces a value legal as a segment", () => {
  const tag = suggestTrackingTag({ initId:"NH-001", id:"e01" }, S);
  assert.equal(tag, "NH-001");
  assert.equal(validateSegment(initiativeSegment(S), tag, S.delimiter), null);
});

test("suggestTrackingTag strips the delimiter so it cannot corrupt a name", () => {
  assert.equal(suggestTrackingTag({ initId:"NH_001" }, S), "NH-001");
});

// -- Breakdowns ----------------------------------------------------------------

test("breakdownBySegment sums metrics per value and counts unparsed rows", () => {
  const rows = [
    { name:"Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA",           metrics:{ spend:100, conversions:10 } },
    { name:"Meta_Col_RyanRosenthal_R2_M_Fitness_Gym_Pastry_Strawberry_30s-Captions_NA", metrics:{ spend:50,  conversions:3  } },
    { name:"Meta_Col_KoalApuna_R1_M_Convenience_Convenience_Pastry_Blueberry_50s-MealStamps_NA", metrics:{ spend:25, conversions:1 } },
    { name:"totally-not-a-convention-name",                                              metrics:{ spend:999 } },
  ];
  const { groups, unparsed } = breakdownBySegment(rows, "theme", S);

  assert.equal(unparsed, 1, "the malformed row is counted, not silently dropped");
  const fitness = groups.find(g => g.value === "Fitness");
  assert.equal(fitness.rows, 2);
  assert.equal(fitness.metrics.spend, 150);
  assert.equal(fitness.metrics.conversions, 13);
  // Sorted by row count, so the biggest bucket leads.
  assert.equal(groups[0].value, "Fitness");
  // The 999 spend from the unparsed row must not appear anywhere.
  assert.equal(groups.reduce((s, g) => s + g.metrics.spend, 0), 175);
});

// -- Schema resolution ---------------------------------------------------------

test("resolveSchema falls back for settings that predate the feature", () => {
  assert.equal(resolveSchema(undefined), DEFAULT_NAMING_SCHEMA);
  assert.equal(resolveSchema({}), DEFAULT_NAMING_SCHEMA);
  assert.equal(resolveSchema({ namingSchema:{ segments:[] } }), DEFAULT_NAMING_SCHEMA);
});

test("a custom schema drives build and parse without code changes", () => {
  const custom = {
    delimiter:"-", placeholder:"none",
    segments:[
      { key:"platform", label:"Platform", role:"channel",    vocab:["Meta","TikTok"] },
      { key:"test",     label:"Test",     role:"initiative", vocab:null },
    ],
  };
  const { name } = buildName({ platform:"TikTok", test:"EXP9" }, custom);
  assert.equal(name, "TikTok-EXP9");
  assert.equal(trackingTagFromName(name, custom), "EXP9");
  assert.equal(buildName({ platform:"Meta" }, custom).name, "Meta-none");
});

// Regression: the substitute character has to be chosen against the schema. A
// hardcoded "-" is a no-op when the delimiter is itself "-", which would emit a
// tag containing the delimiter and corrupt every name built from it.
test("suggestTrackingTag never emits the schema's own delimiter", () => {
  const dashDelimited = {
    delimiter:"-", placeholder:"none",
    segments:[{ key:"test", label:"Test", role:"initiative", vocab:null }],
  };
  const tag = suggestTrackingTag({ initId:"NH-001" }, dashDelimited);
  assert.equal(tag, "NH001");
  assert.ok(!tag.includes("-"));
  assert.equal(validateSegment(initiativeSegment(dashDelimited), tag, "-"), null);
});

test("NA is the exported placeholder the schema uses", () => {
  assert.equal(NA, "NA");
  assert.equal(S.placeholder, NA);
});
