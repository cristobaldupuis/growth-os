import {
  COMPANY_NAME, BUSINESS_MODEL,
  NORTH_STAR_METRIC, NORTH_STAR_CURRENT, NORTH_STAR_TARGET,
  BRANDS as CONFIG_BRANDS,
  CATEGORIES,
  AGENTS as CONFIG_AGENTS,
} from "./config.js";

export const DEFAULT_AGENTS = CONFIG_AGENTS;

// Default brand briefs — injected into existing brands that don't yet have brief fields.
// Keyed by lowercase brand name for fuzzy matching.
export const DEFAULT_BRAND_BRIEFS = {
  "northcove home": {
    whatTheySell:  "Premium home décor and lifestyle products, $80–$300 AOV",
    categories:    "Home decor, Gifting, Candles, Textiles",
    icp:           "Women 28–48, considered purchase, gifting occasions and self-treat, high design sensitivity",
    whyTheyWin:    "Strong visual brand identity, high repeat LTV, emotional purchase driver: aspiration over utility",
    relationship:  "Own DTC brand: full control over pricing, creative, and customer experience",
    constraint:    "CAC rising on paid social, creative refresh cadence is the primary ROAS lever",
  },
  "retailer 1": {
    whatTheySell:  "Mid-premium lifestyle and home accessories, $50–$200 AOV",
    categories:    "Home accessories, Gifting, Candles, Seasonal",
    icp:           "Women 25–45, deal-aware but brand-loyal, mix of gifting and self-purchase",
    whyTheyWin:    "Strong loyalty base, broad SKU range, good replenishment behaviour on consumable SKUs",
    relationship:  "Wholesale / retail partner: shared margin, limited creative control, strong buyer relationship",
    constraint:    "Margin compression from freight and promo dependency, free shipping threshold sensitivity",
  },
  "retailer 2": {
    whatTheySell:  "Accessible home and lifestyle range, $40–$150 AOV",
    categories:    "Home decor, Accessories, Seasonal, Gifting",
    icp:           "Broad female demographic 24–50, price-conscious, discovery-driven, impulse and gifting",
    whyTheyWin:    "Wide reach, high traffic volume, good basket size when cross-sell is activated",
    relationship:  "Wholesale / retail partner: high volume, lower margin, category manager relationship",
    constraint:    "Low CVR vs category benchmark, PDP experience needs improvement, limited personalisation capability",
  },
};

// Merge brief defaults into a brand object if fields are missing
export function applyBrandBriefDefaults(brand) {
  const key = (brand.name||"").toLowerCase().trim();
  const defaults = DEFAULT_BRAND_BRIEFS[key];
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

export const DEFAULT_SETTINGS = {
  companyName:      COMPANY_NAME,
  businessModel:    BUSINESS_MODEL,
  northStarMetric:  NORTH_STAR_METRIC,
  northStarCurrent: NORTH_STAR_CURRENT,
  northStarTarget:  NORTH_STAR_TARGET,
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
export const OUTCOMES  = ["Jackpot","Success","Failed","Inconclusive"];
export const INIT_TYPES = ["A/B Test","Campaign","Process","Research","Infrastructure"];
export const BLOCKERS  = ["None","Waiting on Engineering","Waiting on Creative","Waiting on Merch/Inventory","Waiting on Legal","Waiting on Finance","Waiting on Leadership"];

// Weekly metrics — source definitions and their fields
export const METRIC_SOURCES = [
  { id:"manual",      label:"Manual",       icon:"✏️",
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
  { id:"meta",        label:"Meta Ads",     icon:"📘",
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
  { id:"ga4",         label:"Google Analytics (GA4)", icon:"📊",
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
  { id:"google_ads",  label:"Google Ads",   icon:"🔵",
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

export const FONT_SANS  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, sans-serif";
export const FONT_MONO  = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
// Reading face: headings, titles, and narrative UI copy. Numerals never use it.
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
export const TL = {
  bg:"#EDEAE3", surface:"#FFFFFF", surfaceAlt:"#F7F5EF",
  border:"#E0DCD2", borderSoft:"#EDEAE3",
  text:"#1A1815", textSub:"#57554E", textMuted:"#74716A",
  gold:"#856310", goldFill:"#C9A227", goldSoft:"#D8B94E", goldText:"#1A1815",
  goldBg:"#FBF6E7", goldBorder:"#E3D08F",
  teal:"#0F7A5A", tealBg:"#E2F2EC", red:"#B23A20", redBg:"#FBEAE5",
  warn:"#8A5A0B", warnBg:"#FDF4E3", warnBorder:"#E0C176",
  headerBg:"#FFFFFF", inputBg:"#FFFFFF", inputBorder:"#D8D4CA",
  shadow:"0 1px 2px rgba(40,38,30,0.04), 0 4px 14px rgba(40,38,30,0.06)",
  shadowHi:"0 2px 6px rgba(40,38,30,0.06), 0 12px 30px rgba(40,38,30,0.10)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SERIF,
};
export const TD = {
  bg:"#0E0F12", surface:"#16181D", surfaceAlt:"#1D2026",
  border:"#2C303A", borderSoft:"#232730",
  text:"#F2F3F5", textSub:"#A8ADB8", textMuted:"#868C99",
  gold:"#E8C765", goldFill:"#E8C765", goldSoft:"#F0D68C", goldText:"#0E0F12",
  goldBg:"#221E14", goldBorder:"#5C4E28",
  teal:"#43C79A", tealBg:"#10241E", red:"#E8836B", redBg:"#2A1512",
  warn:"#E0B155", warnBg:"#241D10", warnBorder:"#5A4820",
  headerBg:"#0E0F12", inputBg:"#16181D", inputBorder:"#2C303A",
  shadow:"0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)",
  shadowHi:"0 2px 8px rgba(0,0,0,0.5), 0 14px 36px rgba(0,0,0,0.5)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SERIF,
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
export const iceBand = (s) =>
  s === null ? "unscored" : s >= ICE_STRONG ? "high" : s >= ICE_MODERATE ? "medium" : "low";

export const fmtCur = (n) => {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  const s = abs >= 1000000 ? "$"+(abs/1000000).toFixed(1)+"M" : abs >= 1000 ? "$"+Math.round(abs/1000)+"k" : "$"+abs;
  return n < 0 ? "-"+s : s;
};
export const fmtDate = (d) => d ? new Date(d+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"}) : "—";
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

// Parse a weekly metrics CSV — header-driven, order-independent
export function parseMetricsCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) return { rows:[], errors:["File appears empty or has no data rows."] };

  const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,"").toLowerCase().replace(/\s+/g,"_"));
  const mapped = rawHeaders.map(h => METRIC_CSV_ALIASES[h] || h);

  const errors = [];
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g,""));
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
  startDate:"", endDate:"", ice:{impact:5,certainty:5,ease:5},
  revenueImpact:0, spendCost:0, resourceCost:0, linkedIds:[], results:null,
  createdAt:new Date().toISOString().slice(0,10), notes:"",
  brandId: activeBrand && activeBrand!=="all" ? activeBrand : "default",
  blocker:"None",
  // Attribution socket — lets imported data map to this initiative later.
  // measurementMetric: the canonical metric column this initiative is judged on (maps to a CSV/feed column).
  // measurementScope: optional segment/filter (e.g. "new visitors", "top 20 SKUs").
  // trackingTag: optional hard identifier (UTM campaign, discount code, GA4 event) for precise auto-match.
  // The measurement window is startDate→endDate, already above.
  measurementMetric:"", measurementScope:"", trackingTag:"",
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
