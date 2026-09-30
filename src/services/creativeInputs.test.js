// The new inputs to the creative prompts: customer voice, products and copy
// specs. Each is asserted on the property that makes it safe to put in front of
// a model — identifiers stripped, facts bounded, limits flagged not enforced.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubSnippet, splitVoc, selectVoc, formatVocBlock, citedSnippets, formatVoiceBlock, VOC_LIMIT, scrubVocField, withScrubbedVoc } from "./voc.js";
import { mkProduct, productForRound, formatProductBlock, priceLabel, MAX_PRODUCT_IMAGES } from "./products.js";
import { COPY_SPECS, copySpecFor, copyFlags, normalizeVariant, beatsOf, staticHeadline } from "./creativeCopy.js";
import { fitWithin, base64Bytes } from "./imageResize.js";

// -- Customer voice ------------------------------------------------------------

test("identifiers are stripped from a pasted review, and the stripping is counted", () => {
  const cases = [
    ["Best jar I've owned — Jane D.", "Best jar I've owned"],
    ["Keeps coffee fresh for weeks - Sarah K., Austin", "Keeps coffee fresh for weeks"],
    ["Email me at sam@example.com if you want a discount code", "Email me at [email removed] if you want a discount code"],
    ["Call 415-555-0199 and ask for the manager", "Call [number removed] and ask for the manager"],
    ["Found it via @coffeegeek on TikTok", "Found it via [handle removed] on TikTok"],
    ["Review by Mark: honestly the lid is the best part", "honestly the lid is the best part"],
    ["\"The lid seals every time.\"", "The lid seals every time."],
  ];
  for (const [raw, want] of cases) assert.equal(scrubSnippet(raw).text, want, raw);
  assert.equal(scrubSnippet("The lid seals every time").scrubbed, false);
  assert.equal(scrubSnippet("Great — Jane D.").scrubbed, true);
});

test("a capitalised word mid-sentence is not mistaken for a signature", () => {
  assert.equal(scrubSnippet("I switched from Stanley and never looked back").text, "I switched from Stanley and never looked back");
});

test("the stored field loses its identifiers and keeps everything else exactly as typed", () => {
  const pasted = "\"Half the bag goes stale by Wednesday.\" — Jane D.\n\nMy kids check the tin first,\nevery morning.\n\nEmail me at sam@example.com about bulk orders";
  const { text, removed } = scrubVocField(pasted);
  assert.equal(removed, 2);
  assert.equal(text, "Half the bag goes stale by Wednesday.\n\nMy kids check the tin first,\nevery morning.\n\nEmail me at [email removed] about bulk orders");
  assert.ok(!/Jane|sam@/.test(text));
  // Nothing to remove: byte-for-byte the same, quotes and line breaks included.
  const clean = "\"Soft on Friday.\"\nKids love it";
  assert.deepEqual(scrubVocField(clean), { text: clean, removed: 0 });
  assert.deepEqual(scrubVocField(undefined), { text: "", removed: 0 });
  // A second pass has nothing left to do, so the stored text is stable.
  assert.equal(scrubVocField(text).removed, 0);
});

test("a seven-digit local number is a number, and a year or a price is not", () => {
  assert.equal(scrubSnippet("Text 555-0100 for a refill").text, "Text [number removed] for a refill");
  assert.equal(scrubSnippet("Order 1234567 arrived dented").text, "Order [number removed] arrived dented");
  assert.equal(scrubSnippet("Buying since 2019, $24 a tin, 3 kids").scrubbed, false);
});

test("every save path scrubs every brand's customer voice, and leaves clean settings untouched", () => {
  const settings = { companyName: "X", brands: [
    { id: "a", name: "A", voc: "Call me on 415 555 0100 — Mark" },
    { id: "b", name: "B", voc: "Great tin" },
    { id: "c", name: "C" },
  ] };
  const out = withScrubbedVoc(settings);
  assert.notEqual(out, settings);
  assert.equal(out.brands[0].voc, "Call me on [number removed]");
  assert.equal(out.brands[1], settings.brands[1]);
  assert.equal(out.brands[2], settings.brands[2]);
  assert.equal(withScrubbedVoc(out), out);
  assert.equal(withScrubbedVoc({ companyName: "X" }).companyName, "X");
  assert.equal(withScrubbedVoc(null), null);
});

test("snippets split on blank lines when there are any, and get stable positional ids", () => {
  const blank = splitVoc("First review,\nwhich runs over two lines.\n\nSecond review is here.\n\nok");
  assert.deepEqual(blank.snippets.map(s => s.id), ["V1", "V2"]);
  assert.equal(blank.snippets[0].text, "First review, which runs over two lines.");
  assert.equal(blank.droppedCount, 1, "too short to be evidence");

  const lines = splitVoc("Seals perfectly every single time\nSeals perfectly every single time\nThe handle is too small for me");
  assert.deepEqual(lines.snippets.map(s => s.text), ["Seals perfectly every single time", "The handle is too small for me"]);
  assert.equal(lines.droppedCount, 1, "a duplicate is skipped");
  assert.deepEqual(splitVoc("").snippets, []);
});

test("snippets are ranked by overlap with the initiative, and the remainder is reported", () => {
  const snippets = Array.from({ length: VOC_LIMIT + 5 }, (_, i) => ({ id: "V" + (i + 1), text: "generic comment number " + i }));
  snippets.push({ id: "V99", text: "The airtight lid keeps my beans fresh" });
  const sel = selectVoc(snippets, { hypothesis: "An airtight lid message will lift CVR", productName: "Coffee canister" });
  assert.equal(sel.shown[0].id, "V99");
  assert.equal(sel.shown.length, VOC_LIMIT);
  assert.equal(sel.excluded, snippets.length - VOC_LIMIT);
  assert.match(formatVocBlock(sel), /Do not claim to have read the rest/);
  assert.match(formatVocBlock({ total: 0, shown: [] }), /no customer voice supplied/);
  assert.deepEqual(citedSnippets(snippets, ["V99", "V404"]).map(s => s.id), ["V99"], "an unknown id cites nothing");
});

test("the voice block says when there is no voice rather than inventing one", () => {
  assert.match(formatVoiceBlock(""), /not specified/);
  assert.match(formatVoiceBlock("Dry.\nAvoid: game-changer"), /BRAND VOICE[\s\S]*Avoid: game-changer/);
});

// -- Products ------------------------------------------------------------------

test("a product record is bounded and keeps at most two images", () => {
  const p = mkProduct({ name: "x".repeat(300), currency: "cad", images: [1, 2, 3], source: "page", extra: "dropped" }, new Date("2026-09-30T00:00:00Z"));
  assert.equal(p.name.length, 160);
  assert.equal(p.currency, "CAD");
  assert.equal(p.images.length, MAX_PRODUCT_IMAGES);
  assert.equal(p.source, "page");
  assert.equal(p.extra, undefined);
  assert.equal(mkProduct({ source: "anything" }).source, "manual");
});

test("a round uses the chosen product, the only product, or none — never a guess", () => {
  const a = { id: "a", name: "Canister" }, b = { id: "b", name: "Scoop" };
  assert.equal(productForRound({ products: [a, b] }, { productId: "b" }), b);
  assert.equal(productForRound({ products: [a] }, null), a, "a single-product brand needs no click");
  assert.equal(productForRound({ products: [a, b] }, null), null, "several products and no choice is no product");
  assert.equal(productForRound({ products: [a] }, { productId: "none" }), null, "an explicit 'none' wins over the single product");
  assert.equal(productForRound({ products: [a] }, { productId: "deleted" }), a);
});

test("the product block names what copy may claim, and says so when a price is missing", () => {
  const block = formatProductBlock({ name: "Canister", price: "34.00", currency: "USD", description: "Airtight.\nHolds 500g.", url: "https://s.example/p" });
  assert.match(block, /may be used in copy; nothing beyond them may be claimed/);
  assert.match(block, /Price: 34\.00 USD/);
  assert.match(block, /Airtight\. \/ Holds 500g\./);
  assert.match(formatProductBlock({ name: "Canister" }), /not stated — do not quote one/);
  assert.match(formatProductBlock(null), /PRODUCT: none selected/);
  assert.equal(priceLabel({ price: "12" }), "12");
});

// -- Copy ----------------------------------------------------------------------

test("every channel's copy spec names a field and a limit", () => {
  for (const [channel, spec] of Object.entries(COPY_SPECS)) {
    assert.ok(spec.length > 0, channel);
    spec.forEach(f => { assert.ok(f.key && f.label && f.limit > 0 && f.hint, `${channel}.${f.key}`); });
  }
  assert.equal(copySpecFor("unknown"), COPY_SPECS.meta);
});

test("over-length copy is flagged, never cut", () => {
  const copy = { primaryText: "x".repeat(130), headline: "Short", description: "y".repeat(31) };
  assert.deepEqual(copyFlags(copy, "meta").map(f => f.key), ["primaryText", "description"]);
  const v = normalizeVariant({ hook: "h", beats: [], copy }, "meta");
  assert.equal(v.copy.primaryText.length, 130, "the text is kept whole");
});

test("a variant is normalised: spoken lines become the script, alt hooks are deduplicated", () => {
  const v = normalizeVariant({
    hook: "Your beans go stale in a week",
    altHooks: ["your beans go stale in a week", "  ", "Stale by Friday?", "Stale by Friday?", "a", "b", "c", "d"],
    beats: [
      { time: "0-2s", visual: "Open bag of beans", voiceover: "", onScreen: "Stale by Friday?" },
      { time: "2-6s", visual: "Canister clicks shut", voiceover: "This one clicks shut.", onScreen: "" },
      { time: "", visual: "", voiceover: "", onScreen: "" },
    ],
    copy: { primaryText: "p", headline: "h" },
    naming: { angle: "Fresh" },
  }, "meta");
  assert.deepEqual(v.altHooks, ["Stale by Friday?", "a", "b", "c"], "the hook itself and repeats are not alternatives");
  assert.equal(v.beats.length, 2, "an empty beat is dropped");
  assert.deepEqual(v.script, ["This one clicks shut."], "stage directions are not read aloud");
  assert.deepEqual(v.copy, { primaryText: "p", headline: "h", description: "" });
  assert.equal(staticHeadline(v), "h");
});

test("a variant from before beats existed keeps its script and invents no copy", () => {
  const legacy = normalizeVariant({ hook: "Old hook", script: ["Line one", "Line two"], cta: "Shop" }, "meta");
  assert.deepEqual(legacy.script, ["Line one", "Line two"]);
  assert.deepEqual(legacy.copy, {});
  assert.deepEqual(beatsOf(legacy).map(b => b.voiceover), ["Line one", "Line two"]);
  assert.equal(staticHeadline(legacy), "Old hook", "no headline field, so the hook leads");
});

// -- Reference sizing ----------------------------------------------------------

test("references are sized to fit the long edge and left alone when already small", () => {
  assert.deepEqual(fitWithin(3000, 2000, 1024), { w: 1024, h: 683, scaled: true });
  assert.deepEqual(fitWithin(800, 1200, 1024), { w: 683, h: 1024, scaled: true });
  assert.deepEqual(fitWithin(640, 480, 1024), { w: 640, h: 480, scaled: false });
  assert.equal(base64Bytes("AAAA"), 3);
});
