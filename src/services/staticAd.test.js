// The static-ad layout is arithmetic, so it is tested as arithmetic: a measuring
// stub stands in for canvas text metrics (every character 0.55em wide), and the
// assertions are about where things land relative to the safe zones.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATIC_FORMATS, staticFormat, wrapText, fitHeadline, layoutStaticAd, coverRect, textOn, contrastRatio,
  renderStaticAd, HEADLINE_MAX_LINES,
} from "./staticAd.js";
import { buildCreatorBriefHtml, buildVariantCSV, esc } from "./creatorBrief.js";

const measureAt = (text, px) => String(text).length * px * 0.55;

test("words wrap greedily and a lone long word keeps its own line", () => {
  assert.deepEqual(wrapText("one two three four", 7 * 10, s => s.length * 10), ["one two", "three", "four"]);
  assert.deepEqual(wrapText("supercalifragilistic word", 50, s => s.length * 10), ["supercalifragilistic", "word"]);
  assert.deepEqual(wrapText("   ", 100, s => s.length), []);
});

test("a headline shrinks until it fits three lines, and says when it could not", () => {
  const fits = fitHeadline("Dinner, minus the maths", 900, measureAt, { start: 80, min: 45 });
  assert.equal(fits.truncated, false);
  assert.ok(fits.lines.length <= HEADLINE_MAX_LINES);
  assert.equal(fits.size, 80, "a short line keeps the largest size");

  const long = "word ".repeat(80).trim();
  const cut = fitHeadline(long, 900, measureAt, { start: 80, min: 45 });
  assert.equal(cut.truncated, true);
  assert.equal(cut.lines.length, HEADLINE_MAX_LINES);
  assert.match(cut.lines[2], /…$/);
  assert.ok(cut.lines.every(l => measureAt(l, cut.size) <= 900));
});

test("text and logo stay inside each format's safe zones", () => {
  for (const f of STATIC_FORMATS) {
    const L = layoutStaticAd(f, { headline: "Your beans go stale in a week. This keeps them for a month.", cta: "Shop now", hasLogo: true }, measureAt);
    const safeTop = f.h * f.safeTop, safeBottom = f.h * (1 - f.safeBottom);
    assert.ok(L.logo.y >= safeTop, `${f.id}: logo below the top safe zone`);
    assert.ok(L.cta.y + L.cta.h <= safeBottom, `${f.id}: CTA above the bottom safe zone`);
    assert.ok(L.headline.top >= L.logo.y + L.logo.maxH, `${f.id}: headline clears the logo`);
    assert.ok(L.headline.top + L.headline.lines.length * L.headline.lineH <= L.cta.y, `${f.id}: headline sits above the CTA`);
    assert.ok(L.scrimTop <= L.headline.top, `${f.id}: the scrim starts above the words`);
  }
  const noCta = layoutStaticAd(staticFormat("4:5"), { headline: "Short", cta: "", hasLogo: false }, measureAt);
  assert.equal(noCta.cta, null);
  assert.equal(noCta.logo, null);
  assert.equal(noCta.topScrimBottom, 0);
  assert.equal(staticFormat("nope").id, "4:5");
});

test("the frame is cropped to cover, centred", () => {
  assert.deepEqual(coverRect(2000, 1000, 1000, 1000), { sx: 500, sy: 0, sw: 1000, sh: 1000 });
  assert.deepEqual(coverRect(1000, 2000, 1000, 1000), { sx: 0, sy: 500, sw: 1000, sh: 1000 });
});

test("the CTA text colour is whichever reads better on the accent", () => {
  assert.equal(textOn("#111111"), "#ffffff");
  assert.equal(textOn("#f5d90a"), "#111111");
  assert.ok(contrastRatio("#ffffff", "#000000") > 20);
});

test("the renderer draws the frame, both scrims, the headline lines and the button", () => {
  const calls = [];
  const gradient = () => ({ addColorStop: () => {} });
  const ctx = new Proxy({}, {
    get: (_, k) => (k === "createLinearGradient" ? gradient : (...args) => calls.push([k, ...args])),
    set: () => true,
  });
  const L = layoutStaticAd(staticFormat("9:16"), { headline: "Stale by Friday", cta: "Shop", hasLogo: true }, measureAt);
  renderStaticAd(ctx, L, { image: {}, imageW: 1024, imageH: 1024, logo: {}, logoW: 400, logoH: 100, accent: "#123456" });
  const names = calls.map(c => c[0]);
  assert.equal(names.filter(n => n === "drawImage").length, 2, "frame and logo");
  assert.equal(calls.filter(c => c[0] === "fillText").length, L.headline.lines.length + 1, "each headline line and the CTA");
  assert.ok(names.includes("fill"), "the button is filled");
});

// -- Creator brief -------------------------------------------------------------

const BRIEF = { insight: "They distrust <script>", promise: "Fresh for a month", proof: ["click-shut lid"], formatGuidance: "9:16, 15s", claimsToVerify: ["keeps beans fresh for a year"] };
const VARIANT = {
  label: "Lid click", angleSlug: "Fresh", varies: "hook", hook: "Your beans go stale in a week",
  altHooks: ["Stale by Friday?"], cta: "Shop now", rationale: "Specific", vocCited: ["V2"],
  beats: [{ time: "0-2s", visual: "Open bag", voiceover: "", onScreen: "Stale by Friday?" }],
  copy: { primaryText: "Beans \"stay\" fresh", headline: "Fresh for a month", description: "" },
};

test("the creator brief carries the frozen name, the don'ts, and escapes everything", () => {
  const html = buildCreatorBriefHtml({
    initiative: { title: "Freshness angle", initId: "NC-004" }, brief: BRIEF,
    set: { version: 2, briefVersion: 3 }, channel: "meta",
    rows: [{ variant: VARIANT, adName: "Meta_Col_Fresh_NC004", levelNames: { campaign: "Meta_TOF_Home", ad: "Meta_Col_Fresh_NC004" } }],
    brand: { name: "Northcove", voice: "Dry." }, product: { name: "Canister", price: "34", currency: "USD", url: "https://s.example/p" },
    vocSnippets: [{ id: "V2", text: "Stays fresh for weeks" }],
    generatedAt: new Date("2026-09-30T00:00:00Z"),
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Deliver under exactly this ad name[\s\S]*Meta_Col_Fresh_NC004/);
  assert.match(html, /campaign: <code>Meta_TOF_Home<\/code>/);
  assert.match(html, /keeps beans fresh for a year/, "unverified claims are named as don'ts");
  assert.match(html, /Stays fresh for weeks/, "the customer words the variant borrowed");
  assert.ok(!html.includes("<script>"), "model text is escaped");
  assert.match(html, /They distrust &lt;script&gt;/);
  assert.match(html, /brief v3, set v2/);
  assert.equal(esc("<a href=\"x\">'"), "&lt;a href=&quot;x&quot;&gt;&#39;");
});

test("the CSV carries every field, quoting what needs it", () => {
  const csv = buildVariantCSV({
    rows: [{ variant: VARIANT, values: { angle: "Fresh", channel: "Meta" }, levelNames: { ad: "Meta_Col_Fresh_NC004" } }],
    adTemplate: [{ key: "channel" }, { key: "angle" }], levels: [{ key: "ad" }], channel: "meta",
  });
  const [head, line] = csv.split("\n");
  assert.equal(head, "label,angleSlug,varies,hook,altHooks,primaryText,headline,description,cta,beats,rationale,vocCited,channel,angle,adName");
  assert.match(line, /"Beans ""stay"" fresh"/);
  assert.match(line, /0-2s — Open bag — TEXT: Stale by Friday\?/);
  assert.match(line, /Meta_Col_Fresh_NC004$/);
});
