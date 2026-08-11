import {
  COMPANY_NAME, BUSINESS_MODEL,
  NORTH_STAR_METRIC, NORTH_STAR_CURRENT, NORTH_STAR_TARGET,
  BRANDS as CONFIG_BRANDS,
  BRAND_BRIEFS,
  CATEGORIES,
  AGENTS as CONFIG_AGENTS,
} from "./activeConfig.js";
import { DEFAULT_NAMING_SCHEMA, emptyCustomVariables } from "./services/naming.js";
import { splitCSVLine } from "./services/csvLine.js";

export const DEFAULT_AGENTS = CONFIG_AGENTS;

// Brand briefs now live in the config that owns the brands they describe (see
// BRAND_BRIEFS in config.*.js). They were defined here, which meant this shared
// module carried descriptions of one specific deployment's brands, and standing
// up a new client took an edit to app code on top of writing a config.

// Merge brief defaults into a brand object if fields are missing
export function applyBrandBriefDefaults(brand) {
  const key = (brand.name||"").toLowerCase().trim();
  const defaults = (BRAND_BRIEFS || {})[key];
  if (!defaults) return brand;
  return {
    ...brand,
    whatTheySell:  brand.whatTheySell  || defaults.whatTheySell  || "",
    categories:    brand.categories    || defaults.categories    || "",
    icp:           brand.icp           || defaults.icp           || "",
    whyTheyWin:    brand.whyTheyWin    || defaults.whyTheyWin    || "",
    relationship:  brand.relationship  || defaults.relationship  || "",
    constraint:    brand.constraint    || defaults.constraint    || "",
  };
}

// The campaign naming convention is settings data, not code, so an operator can
// edit vocabularies without a deploy and a future multi-tenant deployment stores
// one per tenant rather than one per build. Settings saved before this existed
// have no `namingSchema` key; `resolveSchema` falls back to the shipped default
// rather than requiring a migration — the same optional-with-fallback shape the
// per-brand North Star uses, for the same reason.
//
// `namingCustom` is the operator's own layer on top of that schema — variables
// this deployment needed and the shipped registry does not have. It is a
// separate key rather than an edit to `namingSchema` so the two can evolve
// independently: improvements to the shipped vocabulary still reach a workspace
// that added a `client` dimension a year ago.
export const DEFAULT_SETTINGS = {
  namingSchema:     DEFAULT_NAMING_SCHEMA,
  namingCustom:     emptyCustomVariables(),
  companyName:      COMPANY_NAME,
  businessModel:    BUSINESS_MODEL,
  northStarMetric:  NORTH_STAR_METRIC,
  northStarCurrent: NORTH_STAR_CURRENT,
  northStarTarget:  NORTH_STAR_TARGET,
  // Money and dates. Optional-with-fallback like `namingSchema` above: a
  // workspace saved before these existed has neither key and resolves to the
  // shipped default, so nothing needs migrating.
  currency:         "USD",
  locale:           "en-CA",
  // Demo or live. Left undefined here rather than pinned to a value, so
  // `resolveWorkspaceMode` falls back to the config's DEMO_MODE until an
  // operator states it — see services/dataSafety.js for why the two are
  // separate questions.
  workspaceMode:    undefined,
  categories:       CATEGORIES,
  dataSources:      [],
  brands:           (CONFIG_BRANDS||[]).map(applyBrandBriefDefaults),
  agents:           DEFAULT_AGENTS,
  healthMetrics: [
    { key:"new_customer_cvr",  label:"New Customer CVR (%)",          enabled:true, isCalculated:false, calculationNote:"",                                                                                                                                     manualValue:null, target:null, higherIsBetter:true  },
    { key:"orders",            label:"Orders",                         enabled:true, isCalculated:true,  calculationNote:"Auto-calculated from weekly pulse: sum of conversions across all sources for the latest week",                                        manualValue:null, target:null, higherIsBetter:true  },
    { key:"registrations",     label:"Registrations / New Accounts",   enabled:true, isCalculated:true,  calculationNote:"Auto-calculated from weekly pulse: sum of registrations across all sources for the latest week. Falls back to manual if not logged.",   manualValue:null, target:null, higherIsBetter:true  },
    { key:"blended_cac",       label:"Blended CAC ($)",                enabled:true, isCalculated:true,  calculationNote:"Auto-calculated from weekly pulse: total spend ÷ total conversions across all sources for the latest week. Falls back to manual if spend data is absent.", manualValue:null, target:null, higherIsBetter:false },
    { key:"return_rate",       label:"Return Rate (%)",                enabled:true, isCalculated:true,  calculationNote:"Auto-calculated from weekly pulse: return rate across sources for the latest week, weighted by order volume. Falls back to manual if not logged.", manualValue:null, target:null, higherIsBetter:false },
  ],
};

export const STATUSES  = ["Draft","Running","Completed","Killed"];
// Section order for the grouped Initiatives view (All-statuses / multi-select),
// distinct from STATUSES (which orders the filter chips themselves).
export const STATUS_GROUP_ORDER = ["Running","Draft","Completed","Killed"];
export const OUTCOMES  = ["Jackpot","Success","Failed","Inconclusive"];
export const INIT_TYPES = ["A/B Test","Campaign","Process","Research","Infrastructure"];
// Franchise / Loonshot — Bahcall's split between a bet that extends what
// already works and one that risks being wrong to find out what doesn't.
// Optional and unset by default (see mkDefault): forcing a call on every one
// of a real client's existing initiatives at once would be a second
// pre-registration-style migration, and unlike observation/hypothesis/
// successMetric this field has no downstream consumer that breaks on "unset" —
// it only feeds a portfolio-level read of how many real swings are in flight.
export const RISK_TYPES = ["Franchise","Loonshot"];
export const BLOCKERS  = ["None","Waiting on Engineering","Waiting on Creative","Waiting on Merch/Inventory","Waiting on Legal","Waiting on Finance","Waiting on Leadership"];

// Weekly metrics — source definitions and their fields
export const METRIC_SOURCES = [
  { id:"manual",      label:"Manual",       icon:"pencil",
    fields:[
      {key:"revenue",     label:"Revenue ($)",          type:"number", hint:"Total revenue this period"},
      {key:"spend",       label:"Ad Spend ($)",          type:"number", hint:"Total paid media spend"},
      {key:"cac",         label:"CAC ($)",               type:"number", hint:"Cost to acquire one customer"},
      {key:"roas",        label:"ROAS",                  type:"number", hint:"Return on ad spend (e.g. 3.2)"},
      {key:"cvr",         label:"CVR (%)",               type:"number", hint:"Conversion rate (e.g. 2.4 for 2.4%)"},
      {key:"aov",         label:"AOV ($)",               type:"number", hint:"Average order value"},
      {key:"traffic",     label:"Sessions / Traffic",    type:"number", hint:"Total sessions or visits"},
      {key:"conversions",   label:"Total Conversions",          type:"number", hint:"Total orders / goal completions"},
      {key:"return_rate",   label:"Return Rate (%)",             type:"number", hint:"Returns / total orders × 100"},
      {key:"registrations", label:"Registrations / New Accounts", type:"number", hint:"New account sign-ups this week"},
      {key:"notes",         label:"Notes",                       type:"text",   hint:"Any context for this week"},
    ]
  },
  { id:"meta",        label:"Meta Ads",     icon:"megaphone",
    fields:[
      {key:"spend",       label:"Spend ($)",             type:"number", hint:"Total Meta spend"},
      {key:"revenue",     label:"Revenue ($)",           type:"number", hint:"Attributed revenue"},
      {key:"roas",        label:"ROAS",                  type:"number", hint:"Return on ad spend"},
      {key:"cac",         label:"CAC ($)",               type:"number", hint:"Cost per acquisition"},
      {key:"impressions", label:"Impressions",           type:"number", hint:"Total impressions"},
      {key:"clicks",      label:"Clicks",                type:"number", hint:"Total link clicks"},
      {key:"cpm",         label:"CPM ($)",               type:"number", hint:"Cost per 1000 impressions"},
      {key:"ctr",         label:"CTR (%)",               type:"number", hint:"Click-through rate"},
      {key:"conversions", label:"Conversions",           type:"number", hint:"Meta-attributed conversions"},
      {key:"notes",       label:"Notes",                 type:"text",   hint:"Campaign context"},
    ]
  },
  { id:"ga4",         label:"Google Analytics (GA4)", icon:"chart",
    fields:[
      {key:"sessions",    label:"Sessions",              type:"number", hint:"Total sessions"},
      {key:"traffic",     label:"Users",                 type:"number", hint:"Total users"},
      {key:"cvr",         label:"CVR (%)",               type:"number", hint:"Session conversion rate"},
      {key:"revenue",     label:"Revenue ($)",           type:"number", hint:"Ecommerce revenue"},
      {key:"conversions", label:"Transactions",          type:"number", hint:"Total transactions"},
      {key:"aov",         label:"AOV ($)",               type:"number", hint:"Average order value"},
      {key:"bounce",      label:"Bounce / Eng. Rate (%)",type:"number", hint:"Bounce or engagement rate"},
      {key:"notes",       label:"Notes",                 type:"text",   hint:"Any anomalies or context"},
    ]
  },
  { id:"google_ads",  label:"Google Ads",   icon:"target",
    fields:[
      {key:"spend",       label:"Spend ($)",             type:"number", hint:"Total Google Ads spend"},
      {key:"revenue",     label:"Conv. Value ($)",       type:"number", hint:"Total conversion value"},
      {key:"roas",        label:"ROAS",                  type:"number", hint:"Conv. value / cost"},
      {key:"clicks",      label:"Clicks",                type:"number", hint:"Total clicks"},
      {key:"impressions", label:"Impressions",           type:"number", hint:"Total impressions"},
      {key:"cpc",         label:"Avg CPC ($)",           type:"number", hint:"Average cost per click"},
      {key:"ctr",         label:"CTR (%)",               type:"number", hint:"Click-through rate"},
      {key:"conversions", label:"Conversions",           type:"number", hint:"Total goal completions"},
      {key:"notes",       label:"Notes",                 type:"text",   hint:"Campaign context"},
    ]
  },
];

// CSV column aliases — maps common export headers to our canonical field keys
export const METRIC_CSV_ALIASES = {
  // date
  "date":"date","week":"date","week_start":"date","period":"date","report_date":"date",
  // brand
  "brand":"brand","retailer":"brand","account":"brand","property":"brand",
  // source
  "source":"source","platform":"source","channel":"source",
  // revenue
  "revenue":"revenue","total_revenue":"revenue","purchase_revenue":"revenue",
  "transaction_revenue":"revenue","conv._value":"revenue","conversion_value":"revenue",
  // spend
  "spend":"spend","cost":"spend","ad_spend":"spend","amount_spent":"spend","total_spend":"spend",
  // cac
  "cac":"cac","cost_per_acquisition":"cac","cost_per_purchase":"cac","cpa":"cac",
  // roas
  "roas":"roas","return_on_ad_spend":"roas","purchase_roas":"roas",
  // cvr
  "cvr":"cvr","conversion_rate":"cvr","conv._rate":"cvr","session_conversion_rate":"cvr",
  // aov
  "aov":"aov","average_order_value":"aov","avg_order_value":"aov",
  // traffic
  "traffic":"traffic","sessions":"sessions","users":"traffic","visitors":"traffic",
  "total_users":"traffic",
  // conversions
  "conversions":"conversions","transactions":"conversions","purchases":"conversions",
  "conv.":"conversions",
  // impressions
  "impressions":"impressions",
  // clicks
  "clicks":"clicks","link_clicks":"clicks",
  // cpm
  "cpm":"cpm","cost_per_1000_impressions":"cpm",
  // ctr
  "ctr":"ctr","click-through_rate":"ctr","click_through_rate":"ctr",
  // cpc
  "cpc":"cpc","avg._cpc":"cpc","avg_cpc":"cpc","average_cpc":"cpc",
  // bounce
  "bounce":"bounce","bounce_rate":"bounce","engagement_rate":"bounce",
  // return_rate
  "return_rate":"return_rate","returns_rate":"return_rate",
  // registrations
  "registrations":"registrations","new_accounts":"registrations","sign_ups":"registrations","signups":"registrations",
  // notes
  "notes":"notes","note":"notes","comment":"notes","comments":"notes",
};

// -- Non-colour tokens ---------------------------------------------------------
//
// The palette was the only part of the design system that existed as tokens, and
// the audit measured what the absence of the rest had cost: thirteen distinct
// border radii (1 through 20), twenty-four font sizes including six half-steps,
// and around sixty different button padding pairs across a hundred and seventy
// buttons. Nothing quite lined up, the same button was four sizes on four
// screens, and one view could hold four corner radii.
//
// These scales cap the vocabulary. They are merged into the theme object below
// so every component already receives them — `t.r.md`, `t.fs.body` — without a
// second import at four hundred call sites.
//
// The scales are deliberately short. A scale with a value for every situation is
// the same as no scale, which is what the codebase already had.
export const RADIUS = {
  xs:   4,    // chips, badges, inline tags
  sm:   6,    // inputs inside a card, small controls
  md:   9,    // buttons, inputs, segmented controls
  lg:   12,   // cards, panels, modals
  pill: 999,  // tracks, capsules, avatars
};

// Type scale. Numerals and micro-labels sit at the bottom, prose in the middle,
// figures at the top. The half-steps are gone: 12.5 and 13 were never a
// deliberate distinction, they were two people picking a number.
export const FS = {
  micro:   10,   // uppercase mono labels, badge text
  small:   11,   // metadata strips, table cells, hints
  body:    12.5, // default UI text and control labels
  medium:  14,   // card titles, list item leads
  large:   17,   // view titles, section heads
  figure:  22,   // stat tile values, panel figures
  display: 28,   // hero figures
};

// Spacing. A 4px base, because every existing value in the app rounds to it.
export const SP = { xs:4, sm:6, md:10, lg:14, xl:20, xxl:28 };

export const FONT_SANS  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, sans-serif";
export const FONT_MONO  = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
// Reading face: headings, titles, and copy read as sentences. Numerals never
// use it, and neither does chrome — a label bolted to a control, a table row or
// a stat tile is sans, however explanatory it sounds. That boundary is the whole
// discipline: three faces each doing one job reads as one system, and the same
// three alternating inside a single card reads as three. The nav rail was the
// worst offender and now carries no serif at all — it is chrome end to end, with
// no sentence anywhere in it.
// Weights are capped at 500 (default) / 600 (emphasis). Loaded in index.html.
export const FONT_SERIF = "'Lora', ui-serif, Georgia, 'Times New Roman', serif";

// -- Theme tokens --------------------------------------------------------------
// Two rules govern this palette, and both exist because the first version broke
// them:
//
// 1. `gold` is an INK value — it is what you set `color:` to. In light mode that
//    means it has to survive a contrast check against white, so it is a deep
//    ochre, not the bright brassy gold. `goldFill` is the separate bright value
//    used ONLY as a background behind `goldText`. Setting `color:t.goldFill` on
//    a light surface is a bug; that was the old `gold` and it measured 2.4:1.
//
// 2. Dark surfaces are cool neutrals, not warm browns. Gold sitting on a warm
//    brown surface reads as mud because the accent and the surface share a hue;
//    on a cool charcoal the same gold separates and reads as metal. The old dark
//    surfaces had R-B of +4 and +11 (brown); these are -7 and -9.
//
// Every pairing below is checked against WCAG AA (4.5:1) — see `npm run
// check:contrast`, which fails the build if a pairing regresses.
//
// 3. `textMuted` is content, not decoration, and is held to AA like everything
//    else. It used to be waived to AA Large (3:1) on the stated grounds that it
//    was "micro-label only", and the code never honoured that: it is the app's
//    most-used ink — the label colour for every form field, every table header,
//    half the table cells in Weekly Pulse — at 9–11px in a hundred and ninety
//    places, where AA Large does not apply at all. The light value measured
//    4.05:1 on `bg`. It is now #6A675F (4.70:1) and the gate checks it at 4.5.
//    `textFaint` is the genuinely decorative tier, and the waiver moved to it,
//    where it names the thing it actually applies to.
export const TL = {
  bg:"#EDEAE3", surface:"#FFFFFF", surfaceAlt:"#F7F5EF",
  border:"#E0DCD2", borderSoft:"#EDEAE3",
  text:"#1A1815", textSub:"#57554E", textMuted:"#6A675F", textFaint:"#807D75",
  gold:"#856310", goldFill:"#C9A227", goldSoft:"#D8B94E", goldText:"#1A1815",
  goldBg:"#FBF6E7", goldBorder:"#E3D08F",
  teal:"#0F7A5A", tealBg:"#E2F2EC", red:"#B23A20", redBg:"#FBEAE5",
  // The contribution ramp — see ContributionView. Measured is teal because that
  // is what teal already means in this app (an initiative card shows its actual
  // in teal, the Initiatives group header renders "realised" in teal); forecast
  // is gold. Named as one set rather than reused from the ink tokens so the bar
  // can be tuned for adjacency without dragging a text colour with it.
  rampMeasured:"#0F7A5A", rampInflight:"#C9A227", rampPipeline:"#E2C77E", rampTrack:"#F2EFE7",
  warn:"#8A5A0B", warnBg:"#FDF4E3", warnBorder:"#E0C176",
  headerBg:"#FFFFFF", inputBg:"#FFFFFF", inputBorder:"#D8D4CA",
  // Specular highlight for the hover charge sweep. Not a palette colour — it is
  // a lighting effect over whatever accent the bar is already painted in, which
  // is why it is an alpha white rather than a hue and why check-contrast has
  // nothing to say about it.
  spark:"rgba(255,255,255,0.62)",
  shadow:"0 1px 2px rgba(40,38,30,0.04), 0 4px 14px rgba(40,38,30,0.06)",
  shadowHi:"0 2px 6px rgba(40,38,30,0.06), 0 12px 30px rgba(40,38,30,0.10)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SERIF,
  r:RADIUS, fs:FS, sp:SP,
};
export const TD = {
  bg:"#0E0F12", surface:"#16181D", surfaceAlt:"#1D2026",
  border:"#2C303A", borderSoft:"#232730",
  text:"#F2F3F5", textSub:"#A8ADB8", textMuted:"#868C99", textFaint:"#6E747F",
  gold:"#E8C765", goldFill:"#E8C765", goldSoft:"#F0D68C", goldText:"#0E0F12",
  goldBg:"#221E14", goldBorder:"#5C4E28",
  teal:"#43C79A", tealBg:"#10241E", red:"#E8836B", redBg:"#2A1512",
  // Dark cannot simply mirror light here. Teal and gold separate by hue but
  // barely by lightness (#43C79A against #E8C765 is 1.30:1), and hue alone is
  // not a separation a deuteranopic reader can use — the two most important
  // segments of the bar would touch and merge. The measured tone is deepened
  // until the ramp steps in lightness as well as hue.
  rampMeasured:"#2E9E78", rampInflight:"#E8C765", rampPipeline:"#6B5A2E", rampTrack:"#22252C",
  warn:"#E0B155", warnBg:"#241D10", warnBorder:"#5A4820",
  headerBg:"#0E0F12", inputBg:"#16181D", inputBorder:"#2C303A",
  spark:"rgba(255,255,255,0.34)",
  shadow:"0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)",
  shadowHi:"0 2px 8px rgba(0,0,0,0.5), 0 14px 36px rgba(0,0,0,0.5)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SERIF,
  r:RADIUS, fs:FS, sp:SP,
};

// Status / outcome badges. The dark variants use cool-neutral tint bases to sit
// on the new charcoal surfaces — the previous olive/brown tints read as dirt
// against anything that isn't itself brown.
export const SL = { Draft:{bg:"#F1F0EC",border:"#C4C0B4",text:"#5C5A4E"}, Running:{bg:"#E6F5EC",border:"#7ACB9C",text:"#136B41"}, Completed:{bg:"#EDEFFB",border:"#8C8CD8",text:"#35359A"}, Killed:{bg:"#FBEDEB",border:"#DE8C7C",text:"#9B3320"} };
export const SD = { Draft:{bg:"#22252C",border:"#3B404B",text:"#A3A9B5"}, Running:{bg:"#102520",border:"#276B4E",text:"#54CE93"}, Completed:{bg:"#191B33",border:"#3E3E8C",text:"#9091EC"}, Killed:{bg:"#2A1512",border:"#6E2E22",text:"#E8836B"} };
export const OL = { Jackpot:{bg:"#E6F5EC",border:"#7ACB9C",text:"#136B41"}, Success:{bg:"#E5F4EF",border:"#79C9AE",text:"#125F4C"}, Failed:{bg:"#FBEDEB",border:"#DE8C7C",text:"#9B3320"}, Inconclusive:{bg:"#FDF4E3",border:"#E0C176",text:"#8A5A0B"} };
export const OD = { Jackpot:{bg:"#102520",border:"#277048",text:"#5AD48C"}, Success:{bg:"#102421",border:"#276352",text:"#48CBA0"}, Failed:{bg:"#2A1512",border:"#6E2E22",text:"#E8836B"}, Inconclusive:{bg:"#241D10",border:"#5A4820",text:"#E0B155"} };

// Type badge colours — fixed hue per initiative type, tuned so each clears AA
// against its own theme's alt surface (see scripts/check-contrast.mjs).
export const TYPE_L = { "A/B Test":"#20698D", Campaign:"#9A4526", Process:"#4444AC", Research:"#653C8B", Infrastructure:"#1C784A" };
export const TYPE_D = { "A/B Test":"#5FB4E0", Campaign:"#DC7C5C", Process:"#8E8EEA", Research:"#B27FD8", Infrastructure:"#4ACF8C" };

export const CAT_L = ["#b07818","#187860","#4848b0","#b03838","#a04828","#2878a0","#6a4090","#208050"];
export const CAT_D = ["#d4a83a","#3acca0","#8080e0","#e08080","#d07050","#50a8d8","#a870d0","#40c880"];
export const catColor = (cat, cats, dk) => (dk ? CAT_D : CAT_L)[cats.indexOf(cat) % 8] || "#888";

export const BRAND_COLORS_L = ["#b07818","#187860","#4848b0","#b03838","#a04828","#2878a0"];
export const BRAND_COLORS_D = ["#d4a83a","#3acca0","#8080e0","#e08080","#d07050","#50a8d8"];
export const brandColor = (brandId, brands, dk) => {
  const idx = brands.findIndex(b=>b.id===brandId);
  return (dk?BRAND_COLORS_D:BRAND_COLORS_L)[idx%6]||"#888";
};
export const brandName = (brandId, brands) => {
  if(!brandId||brandId==="default") return brands[0]&&brands[0].name||"Default";
  return (brands.find(b=>b.id===brandId)||{name:brandId}).name;
};
export const iceScore = (i, c, e) => (!i && !c && !e) ? null : Math.round(((i||0)*(c||0)*(e||0)/1000)*100);

// ICE is a product of three 1-10 inputs, so its distribution is heavily bottom
// weighted: across all 1000 possible combinations the median is 11 and the 85th
// percentile is 34. The old thresholds (60 / 30) were written as if the score
// were uniform over 0-100, which painted 82% of all reachable scores alarm-red —
// including 8/8/8. Everything looked like it was failing, so the colour carried
// no information.
//
// These cut points are the 85th and 50th percentile of the actual distribution,
// so the bands mean "top sixth of the backlog / middle / bottom half". Red is
// deliberately not used: a low ICE is a deprioritised idea, not an error. Red is
// reserved for blockers and failed outcomes, where it still means something.
export const ICE_STRONG = 34;
export const ICE_MODERATE = 11;
export const iceColor = (s, t) =>
  s === null ? t.textMuted : s >= ICE_STRONG ? t.gold : s >= ICE_MODERATE ? t.textSub : t.textMuted;

// -- Money and dates -----------------------------------------------------------
//
// There were four currency formatters and they disagreed. `$2,400,000` rendered
// as "$2.4M" on the dashboard, "$2400k" in Triage (which had its own local copy
// with no millions branch), "$2400k" again in the funnel map (a third copy, with
// a decimal place the others did not have), and "$2,400,000" in the AI context.
// Triage also had its own `fmtDate` that dropped the year, so one initiative
// showed "Aug 12" there and "Aug 12, 2026" everywhere else.
//
// The dollar sign and the en-CA locale were also hardcoded in all four, in a
// product whose core artifact is a revenue claim a client forwards to their
// board. A UK brand read its own numbers in dollars.
//
// So: one formatter, and the currency and locale are settings. They are applied
// once at load through `setNumberFormat` rather than threaded through the ~140
// call sites as arguments — the same shape `applyRouting` uses for model
// assignments, and for the same reason: it is deployment configuration that
// every call site would otherwise have to carry.
let NUM_FMT = { currency: "USD", locale: "en-CA" };
let CUR_SYMBOL = "$";

// `narrowSymbol` is not optional. The default `symbol` display disambiguates a
// currency against the locale's own — so USD under `en-CA` or `en-GB` formats as
// "US$", and the dashboard shipped reading "US$704.8k in play" next to a panel
// still saying "$273k". Technically correct, and wrong for this product: the
// workspace has one currency, every figure on screen is in it, and the reader
// does not need it disambiguated from the currency they did not choose.
// `narrowSymbol` gives "$", "£", "€" — which is what a figure in a dashboard
// should say.
function resolveSymbol(locale, currency) {
  for (const currencyDisplay of ["narrowSymbol", "symbol"]) {
    try {
      const parts = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay, maximumFractionDigits: 0 })
        .formatToParts(0);
      const found = parts.find(p => p.type === "currency")?.value;
      if (found) return found;
    } catch {
      // `narrowSymbol` is unsupported on older engines, which throw rather than
      // ignoring it — fall through to the wide form, then to a dollar sign. An
      // invalid currency code from a hand-edited settings blob lands here too,
      // and must degrade rather than throw inside a render.
    }
  }
  return "$";
}

/** Apply the workspace's currency and locale. Called once, when settings load. */
export function setNumberFormat({ currency, locale } = {}) {
  NUM_FMT = {
    currency: currency || NUM_FMT.currency,
    locale:   locale   || NUM_FMT.locale,
  };
  CUR_SYMBOL = resolveSymbol(NUM_FMT.locale, NUM_FMT.currency);
  return NUM_FMT;
}

export const currencySymbol = () => CUR_SYMBOL;

/** Compact money: "£1.4M", "€320k", "$480". Zero reads as an em dash. */
export const fmtCur = (n) => {
  if (!n || n === 0) return "—";
  const abs = Math.abs(n);
  const s = abs >= 1000000 ? CUR_SYMBOL+(abs/1000000).toFixed(1)+"M"
          : abs >= 1000    ? CUR_SYMBOL+Math.round(abs/1000)+"k"
          :                  CUR_SYMBOL+Math.round(abs);
  return n < 0 ? "-"+s : s;
};

/** Money at one decimal in the thousands band, for dense breakdown rows. */
export const fmtCurFine = (n) => {
  if (!n || n === 0) return CUR_SYMBOL+"0";
  const abs = Math.abs(n);
  const s = abs >= 1000000 ? CUR_SYMBOL+(abs/1000000).toFixed(1)+"M"
          : abs >= 1000    ? CUR_SYMBOL+(Math.round(abs/100)/10)+"k"
          :                  CUR_SYMBOL+Math.round(abs).toLocaleString(NUM_FMT.locale);
  return n < 0 ? "-"+s : s;
};

/** Full money, grouped: "£2,400,000". For prose and exported text. */
export const fmtCurFull = (n) =>
  CUR_SYMBOL + Math.round(Math.abs(n || 0)).toLocaleString(NUM_FMT.locale) ;

// Parse a north star display string (e.g. "$1.4M/mo", "$320k", "42000") into a
// raw number. Returns null if unparseable.
export function parseNorthStarValue(str) {
  if (!str) return null;
  const s = String(str).replace(/[$,\s]/g, "").toLowerCase();
  const m = s.match(/^([\d.]+)(m|k)?(?:\/.*)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  if (m[2] === "m") return num * 1_000_000;
  if (m[2] === "k") return num * 1_000;
  return num;
}

// Sum of logged revenue across a brand's (or, for "all", every brand's) most
// recent 4 logged weeks — a trailing-month proxy read from the same rows
// Weekly Pulse displays, so it can never drift the way a hand-maintained
// figure could.
function deriveTrailingRevenue(weeklyMetrics, brandId) {
  const scoped = (weeklyMetrics || []).filter(m => brandId === "all" || m.brand === brandId);
  const byDate = {};
  scoped.forEach(m => { byDate[m.date] = (byDate[m.date] || 0) + (m.metrics?.revenue || 0); });
  const dates = Object.keys(byDate).sort().reverse().slice(0, 4);
  return dates.length > 0 ? dates.reduce((s, d) => s + byDate[d], 0) : null;
}

// North star {metric, current, target} for the active scope — a brand id, or
// "all"/falsy for the portfolio roll-up.
//
// `current` is always derived from logged weekly revenue when any exists for
// the scope, in preference to a hand-maintained figure that can silently drift
// from what Weekly Pulse actually shows. `metric` and `target` are goals, not
// measurements — nothing in the weekly data can derive them — so they read
// from the brand's own config when set and fall back to the portfolio-level
// setting otherwise. That fallback is what keeps config.js working unchanged
// with no per-brand northStar values defined: every brand there resolves to
// the portfolio metric/current/target exactly as before this existed.
//
// The portfolio target is rolled up from brand targets only when every brand
// defines one — summing a partial set would silently under-count the brands
// that don't, which is worse than the authored fallback.
export function resolveNorthStar(activeBrand, brands, settings, weeklyMetrics) {
  const periodMatch = (settings.northStarTarget || "").match(/\/\s*(\w+)/);
  const period = periodMatch ? "/" + periodMatch[1] : "";
  const withPeriod = (n) => fmtCur(n) + period;

  if (!activeBrand || activeBrand === "all") {
    const list = brands || [];
    const derived = deriveTrailingRevenue(weeklyMetrics, "all");
    const brandsWithTarget = list.filter(b => b.northStar?.target);
    const target = (brandsWithTarget.length > 0 && brandsWithTarget.length === list.length)
      ? withPeriod(brandsWithTarget.reduce((s, b) => s + (parseNorthStarValue(b.northStar.target) || 0), 0))
      : settings.northStarTarget;
    return {
      metric:  settings.northStarMetric,
      current: derived != null ? withPeriod(derived) : settings.northStarCurrent,
      target,
    };
  }

  const brand = (brands || []).find(b => b.id === activeBrand);
  const ns = brand?.northStar;
  const derived = deriveTrailingRevenue(weeklyMetrics, activeBrand);
  return {
    metric:  ns?.metric  || settings.northStarMetric,
    current: derived != null ? withPeriod(derived) : (ns?.current || settings.northStarCurrent),
    target:  ns?.target  || settings.northStarTarget,
  };
}

export const fmtDate = (d) => d ? new Date(d+"T12:00:00").toLocaleDateString(NUM_FMT.locale,{month:"short",day:"numeric",year:"numeric"}) : "—";
/** Same date, no year. For dense strips where the year is already established. */
export const fmtDateShort = (d) => d ? new Date(d+"T12:00:00").toLocaleDateString(NUM_FMT.locale,{month:"short",day:"numeric"}) : "—";
/** Long form, for document headers and exported readouts. */
export const fmtDateLong = (d) => (d ? new Date(d+"T12:00:00") : new Date()).toLocaleDateString(NUM_FMT.locale,{month:"long",day:"numeric",year:"numeric"});
export const parseD  = (d) => d ? new Date(d+"T12:00:00") : null;
export const somM    = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const eomM    = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59);
// Returns the Monday (local time) of the week containing d. Used for weekly rec batch anchoring.
export const mondayOf = (d) => {
  const copy = new Date(d);
  const day  = copy.getDay(); // 0=Sun, 1=Mon … 6=Sat
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  copy.setHours(0, 0, 0, 0);
  return copy;
};

// Parse a weekly metrics CSV — header-driven, order-independent.
//
// Splits with the shared quote-aware splitter rather than a plain `split(",")`.
// This is the parser a Meta or GA4 export actually lands in, and those files
// quote any field containing a comma — a campaign name, a notes cell — so a
// naive split shifted every column after the first quoted one and imported the
// resulting garbage without complaint. See services/csvLine.js.
export function parseMetricsCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) return { rows:[], errors:["File appears empty or has no data rows."] };

  const rawHeaders = splitCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g,"_"));
  const mapped = rawHeaders.map(h => METRIC_CSV_ALIASES[h] || h);

  const errors = [];
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.every(v=>!v)) continue;
    const obj = {};
    rawHeaders.forEach((_, j) => { obj[mapped[j]] = vals[j] || ""; });

    // Require at minimum: date
    if (!obj.date) { errors.push(`Row ${i+1}: missing date, skipped`); continue; }

    // Normalise date to YYYY-MM-DD
    const d = new Date(obj.date+"T12:00:00");
    if (isNaN(d)) { errors.push(`Row ${i+1}: unrecognised date "${obj.date}", skipped`); continue; }
    obj.date = d.toISOString().slice(0,10);

    // Normalise numeric fields
    const numericKeys = ["revenue","spend","cac","roas","cvr","aov","traffic","sessions","conversions","impressions","clicks","cpm","ctr","cpc","bounce","return_rate","registrations"];
    const metrics = {};
    numericKeys.forEach(k => {
      if (obj[k] !== undefined && obj[k] !== "") {
        const n = parseFloat(obj[k].replace(/[$,%]/g,""));
        if (!isNaN(n)) metrics[k] = n;
      }
    });
    if (obj.notes) metrics.notes = obj.notes;
    // Carry through any unmapped custom columns
    Object.keys(obj).forEach(k => {
      if (!["date","brand","source","notes",...numericKeys].includes(k) && obj[k]) {
        metrics[k] = obj[k];
      }
    });

    rows.push({
      date:  obj.date,
      brand: obj.brand || "default",
      source: obj.source || "manual",
      metrics,
    });
  }

  return { rows, errors };
}

// Generate human-readable initiative ID
export const generateInitId = (brandId, brands, existingItems) => {
  const brand  = brands && brands.find(b => b.id === brandId);
  const prefix = brand?.code
    ? brand.code.toUpperCase().slice(0,3)
    : (brand ? brand.name.split(/\s+/).map(w=>w[0]).join("").toUpperCase().slice(0,3).padEnd(2,"X") : "XX");
  const existing = existingItems.filter(e => e.initId && e.initId.startsWith(prefix+"-"));
  const maxNum = existing.reduce((max, e) => {
    const n = parseInt((e.initId||"").split("-")[1]||"0");
    return n > max ? n : max;
  }, 0);
  return prefix + "-" + String(maxNum + 1).padStart(3,"0");
};

export const mkDefault = (cats, activeBrand) => ({
  _new:true, id:"e-"+Date.now(), title:"", hypothesis:"",
  observation:"", successMetric:"",
  category:cats[0]||"", initType:"A/B Test", owner:"",
  primaryMetric:"", killCriteria:"", status:"Draft",
  // Unset by default rather than defaulting to "Franchise" — a default that
  // always agrees with the safer answer is not a classification, it is a
  // field nobody has to look at. See RISK_TYPES above.
  riskType:"",
  // The learning agenda item this initiative answers, if any. Set either from
  // "start an experiment" on an agenda item (which seeds the fields below) or
  // from the form's own agenda picker for an initiative that already existed.
  agendaId:null,
  startDate:"", endDate:"", ice:{impact:5,certainty:5,ease:5},
  revenueImpact:0, spendCost:0, resourceCost:0, linkedIds:[], results:null,
  // Diagnostic-escalation evidence (ROADMAP 5.3) — one entry per (dimension,
  // paste-back), scoped to this initiative's own post-mortem. Never merged
  // into the performance fact rows; see services/diagnosticEscalation.js.
  evidence:[],
  createdAt:new Date().toISOString().slice(0,10), notes:"",
  brandId: activeBrand && activeBrand!=="all" ? activeBrand : "default",
  blocker:"None",
  // Attribution socket — lets imported data map to this initiative later.
  // measurementMetric: the canonical metric column this initiative is judged on (maps to a CSV/feed column).
  // measurementScope: optional segment/filter (e.g. "new visitors", "top 20 SKUs").
  // trackingTag: optional hard identifier (UTM campaign, discount code, GA4 event) for precise auto-match.
  // The measurement window is startDate→endDate, already above.
  measurementMetric:"", measurementScope:"", trackingTag:"",
  // adNames: campaign / ad set / ad names claimed by this initiative, as
  // {name, level, channel, addedAt}. The trackingTag above works when the name
  // was built from the convention; this works when it wasn't — a campaign that
  // has been live in Ads Manager for six weeks cannot be renamed without
  // resetting its learning phase, so the join has to accept the name as it
  // already is. Matched at any level an export carries, so claiming a campaign
  // claims every ad row underneath it. See services/naming.js.
  adNames:[],
});

// -- Prediction ledger ---------------------------------------------------------
// When an initiative goes Draft -> Running, we freeze the prediction the team is
// committing to: ICE, the revenue estimate, and the date. This snapshot is what
// every later calibration claim ("did our predictions get better?") compares
// against. It MUST be immutable once set — editing ICE afterwards must not touch
// it — so the stamp is idempotent: if a snapshot already exists, it's left alone.
//
// Stored under `predictionSnapshot` on the initiative. Deliberately undisplayed
// in the main editor (it's plumbing, not a field the user fills in), but it is
// plain data — visible in JSON backup/restore and recoverable if needed.
export function stampPredictionSnapshot(e) {
  if (!e || e.predictionSnapshot) return e;          // never overwrite
  return {
    ...e,
    predictionSnapshot: {
      ice: { ...(e.ice || {impact:5,certainty:5,ease:5}) },
      revenueImpact: e.revenueImpact || 0,
      snapshotDate: new Date().toISOString().slice(0,10),
    },
  };
}

// Apply the stamp only on a Draft/none -> Running transition. Called from every
// path that can move an initiative into Running (status dropdown, one-click
// activate, CSV import). Safe to call when status isn't Running — it's a no-op.
export function withRunningSnapshot(e, nextStatus) {
  if (nextStatus !== "Running") return e;
  return stampPredictionSnapshot(e);
}

// Compute the signed prediction error at close. Frozen into results so the
// delta is recorded at the moment of truth, not recomputed later from mutable
// fields. revenueDelta = actual - predicted (positive = beat the estimate).
// outcomeVsCertainty pairs the team's confidence-at-close with the classified
// outcome, which is the raw material for a calibration curve.
export function computePredictionError(item, results) {
  const snap = item && item.predictionSnapshot;
  const predictedRev = snap ? (snap.revenueImpact || 0) : (item.revenueImpact || 0);
  const actualRev = (results && typeof results.actualRevenueImpact === "number")
    ? results.actualRevenueImpact : null;
  return {
    predictedRevenue: predictedRev,
    actualRevenue: actualRev,
    revenueDelta: actualRev != null ? actualRev - predictedRev : null,
    predictedIce: snap ? { ...snap.ice } : (item.ice ? { ...item.ice } : null),
    snapshotDate: snap ? snap.snapshotDate : null,
    // confidence the team held when CLOSING vs. how it actually landed
    closeCertainty: results ? (results.outcomeCertainty ?? null) : null,
    // certainty the team PREDICTED at launch (ICE certainty, 1-10 -> %)
    predictedCertainty: snap && snap.ice && snap.ice.certainty != null
      ? snap.ice.certainty * 10 : null,
    outcomeClassification: results ? results.outcomeClassification : null,
  };
}
