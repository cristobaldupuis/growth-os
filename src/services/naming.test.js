// Tests for the cross-channel nomenclature registry.
// Run with: node --test src/services/naming.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_NAMING_SCHEMA, NA, normKey,
  buildName, buildNameSet, parseName, identifyName, validateValue,
  trackingTagFromName, matchNamesToInitiatives, suggestTrackingTag,
  breakdownByDimension, resolveSchema, templateFor, listChannels, listLevels,
  initiativeDimension, levelCarriesInitiative,
} from "./naming.js";

const S = DEFAULT_NAMING_SCHEMA;
const METetc = { channel:"meta", level:"ad" };

// The convention already running in the operator's Meta account. This string is
// the compatibility contract: the cross-channel rewrite must not change it.
const GOLDEN = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA";
const GOLDEN_VALUES = {
  channel:"Meta", handle:"Col", asset:"EmmaBrune", campaign:"R3", gender:"F",
  theme:"Fitness", angle:"Gym", category:"Pastry", flavor:"Chocolate",
  format:"35s-Raw", initiative:"NA",
};

// -- Compatibility -------------------------------------------------------------

test("the live Meta ad-level template is unchanged by the rewrite", () => {
  const tpl = templateFor(S, "meta", "ad").map(d => d.key);
  assert.deepEqual(tpl, ["channel","handle","asset","campaign","gender","theme","angle","category","flavor","format","initiative"]);
  assert.equal(tpl.length, 11);
});

test("buildName still reproduces the production Meta ad name exactly", () => {
  const { name, errors } = buildName(GOLDEN_VALUES, S, METetc);
  assert.equal(name, GOLDEN);
  assert.deepEqual(errors, []);
});

test("every ad name in the operator's sheet still parses cleanly", () => {
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
    const { errors, ok } = parseName(r, S, METetc);
    assert.deepEqual(errors, [], `expected "${r}" to parse cleanly`);
    assert.equal(ok, true);
  });
});

test("a legacy flat schema is lifted into the registry shape", () => {
  const legacy = { namingSchema: {
    id:"legendary-meta-v2", delimiter:"_", placeholder:"NA",
    segments:[
      { key:"channel",    label:"Channel",    role:"channel",    vocab:["Meta"] },
      { key:"angle",      label:"Angle",      role:"angle",      vocab:null },
      { key:"initiative", label:"Initiative", role:"initiative", vocab:null },
    ],
  }};
  const sch = resolveSchema(legacy);
  assert.deepEqual(listChannels(sch).map(c => c.id), ["default"]);
  assert.equal(sch.initiativeDimension, "initiative");
  const { name } = buildName({ channel:"Meta", angle:"Gym", initiative:"NH-001" }, sch, { channel:"default", level:"ad" });
  assert.equal(name, "Meta_Gym_NH-001");
  assert.equal(trackingTagFromName(name, sch), "NH-001");
});

// -- Cross-channel -------------------------------------------------------------

test("every channel defines levels and every template resolves to real dimensions", () => {
  const known = new Set(S.dimensions.map(d => d.key));
  assert.ok(listChannels(S).length >= 5, "expected Meta, Google, YouTube, TikTok, Klaviyo");
  listChannels(S).forEach(ch => {
    assert.ok(ch.levels.length > 0, `${ch.id} has no levels`);
    ch.levels.forEach(lv => {
      assert.ok(lv.template.length > 0, `${ch.id}/${lv.key} has an empty template`);
      lv.template.forEach(k => assert.ok(known.has(k), `${ch.id}/${lv.key} references unknown dimension "${k}"`));
    });
  });
});

test("channels model their real entity hierarchies, which differ", () => {
  assert.deepEqual(listLevels(S, "meta").map(l => l.key),    ["campaign","adset","ad"]);
  assert.deepEqual(listLevels(S, "google").map(l => l.key),  ["campaign","adgroup","ad"]);
  assert.deepEqual(listLevels(S, "klaviyo").map(l => l.key), ["flow","message"]);
});

test("one dimension record projects into every level of a channel", () => {
  const record = {
    channel:"Meta", funnel:"Prospect", category:"Pastry", geo:"US", objective:"Purchase",
    age:"25-34", gender:"F", audience:"StressInterest", bidding:"Auto",
    handle:"Col", asset:"EmmaBrune", campaign:"R3", theme:"Fitness", angle:"Gym",
    flavor:"Chocolate", format:"35s-Raw", initiative:"NH-001",
  };
  const set = buildNameSet(record, S, "meta");
  assert.deepEqual(set.map(s => s.level), ["campaign","adset","ad"]);
  assert.equal(set[0].name, "Meta_Prospect_Pastry_US_Purchase");
  assert.equal(set[1].name, "US_25-34_F_StressInterest_Auto");
  assert.equal(set[2].name, "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NH-001");
  set.forEach(s => assert.deepEqual(s.errors, [], `${s.level} had errors`));
});

test("the same record projects differently per channel", () => {
  const record = {
    channel:"Google", funnel:"Prospect", category:"Pastry", geo:"US", objective:"Purchase",
    audience:"InMarketSnacks", placement:"Search", bidding:"Value",
    handle:"LF", asset:"ProductPack", campaign:"Evergreen", format:"Static",
    angle:"MacroMath", flavor:"Chocolate", offer:"Sub", initiative:"NH-002",
  };
  const set = buildNameSet(record, S, "google");
  assert.deepEqual(set.map(s => s.level), ["campaign","adgroup","ad"]);
  assert.equal(set[1].name, "InMarketSnacks_Search_Value");
  // Google's ad template carries `offer` where Meta's carries `gender`/`theme`.
  assert.ok(set[2].name.endsWith("_Sub_NH-002"));
});

test("the initiative dimension is present at the level that carries attribution", () => {
  assert.equal(initiativeDimension(S).key, "initiative");
  ["meta","google","youtube","tiktok"].forEach(ch => {
    assert.equal(levelCarriesInitiative(S, ch, "ad"), true, `${ch}/ad must carry the initiative slot`);
  });
  assert.equal(levelCarriesInitiative(S, "klaviyo", "message"), true);
  // Campaign-level names deliberately do not carry it — attribution happens at
  // the entity the creative actually is.
  assert.equal(levelCarriesInitiative(S, "meta", "campaign"), false);
});

// -- Parsing discipline --------------------------------------------------------

test("a name with an omitted slot is refused, not silently misaligned", () => {
  const short = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw"; // 10, not 11
  const { ok, errors, values } = parseName(short, S, METetc);
  assert.equal(ok, false);
  assert.deepEqual(values, {}, "must not return a guessed alignment");
  assert.match(errors[0], /Expected 11 slots for meta\/ad, found 10/);
});

test("trailing extra slots are reported and captured, not dropped", () => {
  const { extra, errors, values } = parseName(GOLDEN + "_OOPS", S, METetc);
  assert.deepEqual(extra, ["OOPS"]);
  assert.equal(values.channel, "Meta");
  assert.ok(errors.some(e => /found 12/.test(e)));
});

test("off-vocabulary values are flagged but still parsed", () => {
  const typo = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_SwetRolls_Chocolate_35s-Raw_NA";
  const { values, ok, errors } = parseName(typo, S, METetc);
  assert.equal(values.category, "SwetRolls", "value preserved for the operator to see");
  assert.equal(ok, false);
  assert.ok(errors.some(e => /Category "SwetRolls" is not in the controlled list/.test(e)));
});

test("spaces and delimiters inside a value are rejected", () => {
  const asset = S.dimensions.find(d => d.key === "asset");
  assert.match(validateValue(asset, "Emma Brune", "_"), /space or comma/);
  assert.match(validateValue(asset, "Emma_Brune", "_"), /contains the delimiter/);
  assert.match(validateValue(asset, "", "_"), /is empty/);
});

test("buildName fills missing keys with NA rather than throwing", () => {
  const { name } = buildName({ channel:"Meta", handle:"LF" }, S, METetc);
  assert.equal(name, "Meta_LF_NA_NA_NA_NA_NA_NA_NA_NA_NA");
  assert.equal(name.split("_").length, 11);
});

// -- Case insensitivity --------------------------------------------------------
//
// The Eli Health spec mandates lowercase because "mixed case creates phantom
// distinct values when pivoting". These prove the observation is handled without
// forcing the prescription.

test("vocabulary validation is case-insensitive", () => {
  const flavor = S.dimensions.find(d => d.key === "flavor");
  assert.equal(validateValue(flavor, "PinkSprinkle", "_"), null);
  assert.equal(validateValue(flavor, "pinksprinkle", "_"), null);
  assert.equal(validateValue(flavor, "PINKSPRINKLE", "_"), null);
});

test("case variants do not split a pivot into separate rows", () => {
  const mk = (theme) => `Meta_Col_A_R3_F_${theme}_Gym_Pastry_Chocolate_35s-Raw_NA`;
  const rows = [
    { name: mk("Fitness"), metrics:{ spend:100 } },
    { name: mk("fitness"), metrics:{ spend:50 } },
    { name: mk("FITNESS"), metrics:{ spend:25 } },
  ];
  const { groups } = breakdownByDimension(rows, "theme", S, METetc);
  assert.equal(groups.length, 1, "three casings must collapse to one bucket");
  assert.equal(groups[0].metrics.spend, 175);
});

test("NA is matched case-insensitively when deciding a slot is empty", () => {
  const lower = "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_na";
  assert.equal(trackingTagFromName(lower, S, METetc), null);
});

// -- The bridge ----------------------------------------------------------------

test("trackingTagFromName reads the initiative slot", () => {
  const n = "Meta_LF_ProductSingle_FreeSample_NA_Product_FreeProduct_Donuts_VanillaGlazed_Static_TryFree";
  assert.equal(trackingTagFromName(n, S, METetc), "TryFree");
});

test("an NA initiative slot yields no tag", () => {
  assert.equal(trackingTagFromName(GOLDEN, S, METetc), null);
});

test("an unparseable name yields no tag rather than a wrong one", () => {
  assert.equal(trackingTagFromName("Meta_LF_Broken", S, METetc), null);
});

test("matchNamesToInitiatives separates untagged from broken links", () => {
  const items = [
    { id:"e1", initId:"LF-001", trackingTag:"TryFree" },
    { id:"e2", initId:"LF-002", trackingTag:"NewLaunch" },
  ];
  const names = [
    "Meta_LF_ProductSingle_FreeSample_NA_Product_FreeProduct_Donuts_VanillaGlazed_Static_TryFree",
    "Meta_LF_ProductSingle_Evergreen_NA_Product_NewProduct_Donuts_Blueberry_Static-Boost_GhostTag",
    GOLDEN,
  ];
  const { matched, unmatched, untagged } = matchNamesToInitiatives(names, items, S, METetc);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].initiative.initId, "LF-001");
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].trackingTag, "GhostTag");
  assert.deepEqual(untagged, [GOLDEN]);
});

test("tracking tags match case-insensitively", () => {
  const items = [{ id:"e1", initId:"NH-001", trackingTag:"NH-001" }];
  const n = "Meta_LF_ProductSingle_Evergreen_NA_Product_NewProduct_Donuts_Blueberry_Static-Boost_nh-001";
  const { matched } = matchNamesToInitiatives([n], items, S, METetc);
  assert.equal(matched.length, 1);
});

test("suggestTrackingTag produces a value legal as a slot", () => {
  const tag = suggestTrackingTag({ initId:"NH-001", id:"e01" }, S);
  assert.equal(tag, "NH-001");
  assert.equal(validateValue(initiativeDimension(S), tag, S.delimiter), null);
});

test("suggestTrackingTag never emits the schema's own delimiter", () => {
  const dashed = { ...S, delimiter:"-" };
  const tag = suggestTrackingTag({ initId:"NH-001" }, dashed);
  assert.equal(tag, "NH001");
  assert.ok(!tag.includes("-"));
});

// -- Identification ------------------------------------------------------------

test("identifyName resolves a name whose level the caller does not know", () => {
  const { resolved, ambiguous } = identifyName(GOLDEN, S);
  assert.equal(ambiguous, false);
  assert.equal(resolved.channel, "meta");
  assert.equal(resolved.level, "ad");
});

test("identifyName reports ambiguity instead of picking one", () => {
  // Meta/campaign and Google/campaign share a 5-slot template, so a name valid
  // for both genuinely cannot be told apart from the string alone.
  const { candidates, ambiguous, resolved } = identifyName("Meta_Prospect_Pastry_US_Purchase", S);
  assert.ok(candidates.length > 1, "expected more than one channel to accept this");
  assert.equal(ambiguous, true);
  assert.equal(resolved, null, "an ambiguous name must not resolve to a guess");
});

test("a name matching no template resolves to nothing", () => {
  const { candidates, resolved } = identifyName("not-a-convention-name", S);
  assert.deepEqual(candidates, []);
  assert.equal(resolved, null);
});

// -- Breakdowns ----------------------------------------------------------------

test("breakdownByDimension sums metrics and counts what it could not use", () => {
  const rows = [
    { name:"Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA",           metrics:{ spend:100, conversions:10 } },
    { name:"Meta_Col_RyanRosenthal_R2_M_Fitness_Gym_Pastry_Strawberry_30s-Captions_NA", metrics:{ spend:50,  conversions:3  } },
    { name:"Meta_Col_KoalApuna_R1_M_Convenience_Convenience_Pastry_Blueberry_50s-MealStamps_NA", metrics:{ spend:25, conversions:1 } },
    { name:"totally-not-a-convention-name",                                              metrics:{ spend:999 } },
  ];
  const { groups, unparsed } = breakdownByDimension(rows, "theme", S, METetc);
  assert.equal(unparsed, 1, "the malformed row is counted, not silently dropped");
  const fitness = groups.find(g => normKey(g.value) === "fitness");
  assert.equal(fitness.rows, 2);
  assert.equal(fitness.metrics.spend, 150);
  assert.equal(fitness.metrics.conversions, 13);
  assert.equal(groups[0].value, "Fitness", "sorted by row count");
  assert.equal(groups.reduce((s, g) => s + g.metrics.spend, 0), 175, "unparsed spend must not leak in");
});

test("rows carrying their own channel/level are parsed against their own template", () => {
  const rows = [
    { channel:"meta",   level:"ad", name:"Meta_Col_A_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA",       metrics:{ spend:10 } },
    { channel:"google", level:"ad", name:"Google_LF_ProductPack_Evergreen_Static_MacroMath_Pastry_Chocolate_Sub_NA", metrics:{ spend:20 } },
  ];
  const { groups, unparsed } = breakdownByDimension(rows, "category", S);
  assert.equal(unparsed, 0);
  assert.equal(groups.length, 1, "both rows are Pastry despite different templates");
  assert.equal(groups[0].metrics.spend, 30);
});

test("a dimension absent from the row's template is counted separately", () => {
  // `gender` is in Meta's ad template but not Google's.
  const rows = [
    { channel:"google", level:"ad", name:"Google_LF_ProductPack_Evergreen_Static_MacroMath_Pastry_Chocolate_Sub_NA", metrics:{ spend:20 } },
  ];
  const { groups, notInTemplate, unparsed } = breakdownByDimension(rows, "gender", S);
  assert.equal(unparsed, 0, "the row parsed fine — it just lacks this dimension");
  assert.equal(notInTemplate, 1);
  assert.deepEqual(groups, []);
});

// -- Schema resolution ---------------------------------------------------------

test("resolveSchema falls back for settings that predate the feature", () => {
  assert.equal(resolveSchema(undefined), DEFAULT_NAMING_SCHEMA);
  assert.equal(resolveSchema({}), DEFAULT_NAMING_SCHEMA);
  assert.equal(resolveSchema({ namingSchema:{ segments:[] } }), DEFAULT_NAMING_SCHEMA);
});

test("NA is the exported placeholder the schema uses", () => {
  assert.equal(NA, "NA");
  assert.equal(S.placeholder, NA);
});
