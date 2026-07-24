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
    whyTheyWin:    "Strong visual brand identity, high repeat LTV, emotional purchase driver — aspiration over utility",
    relationship:  "Own DTC brand — full control over pricing, creative, and customer experience",
    constraint:    "CAC rising on paid social, creative refresh cadence is the primary ROAS lever",
  },
  "retailer 1": {
    whatTheySell:  "Mid-premium lifestyle and home accessories, $50–$200 AOV",
    categories:    "Home accessories, Gifting, Candles, Seasonal",
    icp:           "Women 25–45, deal-aware but brand-loyal, mix of gifting and self-purchase",
    whyTheyWin:    "Strong loyalty base, broad SKU range, good replenishment behaviour on consumable SKUs",
    relationship:  "Wholesale / retail partner — shared margin, limited creative control, strong buyer relationship",
    constraint:    "Margin compression from freight and promo dependency, free shipping threshold sensitivity",
  },
  "retailer 2": {
    whatTheySell:  "Accessible home and lifestyle range, $40–$150 AOV",
    categories:    "Home decor, Accessories, Seasonal, Gifting",
    icp:           "Broad female demographic 24–50, price-conscious, discovery-driven, impulse and gifting",
    whyTheyWin:    "Wide reach, high traffic volume, good basket size when cross-sell is activated",
    relationship:  "Wholesale / retail partner — high volume, lower margin, category manager relationship",
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
    { key:"registrations",     label:"Registrations / New Accounts",   enabled:true, isCalculated:false, calculationNote:"",                                                                                                                                     manualValue:null, target:null, higherIsBetter:true  },
    { key:"blended_cac",       label:"Blended CAC ($)",                enabled:true, isCalculated:true,  calculationNote:"Auto-calculated from weekly pulse: total spend ÷ total conversions across all sources for the latest week. Falls back to manual if spend data is absent.", manualValue:null, target:null, higherIsBetter:false },
    { key:"return_rate",       label:"Return Rate (%)",                enabled:true, isCalculated:false, calculationNote:"",                                                                                                                                     manualValue:null, target:null, higherIsBetter:false },
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
  // sessions (ga4 specific — keep separate)
  "sessions":"sessions",
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
// Display face: headings, titles, and hero numerals only. Loaded in index.html.
export const FONT_SERIF = "'Fraunces', ui-serif, Georgia, 'Times New Roman', serif";

export const TL = {
  bg:"#EBE8E1", surface:"#FFFFFF", surfaceAlt:"#F6F4EE",
  border:"#E2DFD6", borderSoft:"#ECEAE3",
  text:"#1A1815", textSub:"#5C5A52", textMuted:"#979488",
  gold:"#C9A227", goldSoft:"#D8B94E", goldText:"#1A1815", goldBg:"#FBF7EA", goldBorder:"#EBDCA8",
  teal:"#1D8F6E", tealBg:"#E4F4EE", red:"#C0492F", redBg:"#FBEDE9",
  headerBg:"#FFFFFF", inputBg:"#FFFFFF", inputBorder:"#DCD9D2",
  shadow:"0 1px 2px rgba(40,38,30,0.04), 0 4px 14px rgba(40,38,30,0.06)",
  shadowHi:"0 2px 6px rgba(40,38,30,0.06), 0 12px 30px rgba(40,38,30,0.10)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SERIF,
};
export const TD = {
  bg:"#100F0D", surface:"#1A1916", surfaceAlt:"#232118",
  border:"#322F26", borderSoft:"#262420",
  text:"#F3F1EA", textSub:"#ABA89C", textMuted:"#807D72",
  gold:"#E1C261", goldSoft:"#EBD588", goldText:"#100F0D", goldBg:"#241F12", goldBorder:"#5A4D24",
  teal:"#4FC79A", tealBg:"#14271F", red:"#E27A63", redBg:"#2A1813",
  headerBg:"#100F0D", inputBg:"#1A1916", inputBorder:"#322F26",
  shadow:"0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)",
  shadowHi:"0 2px 8px rgba(0,0,0,0.5), 0 14px 36px rgba(0,0,0,0.5)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SERIF,
};

export const SL = { Draft:{bg:"#f4f4ee",border:"#c8c4a8",text:"#666440"}, Running:{bg:"#edfaf2",border:"#7adca0",text:"#1a7a48"}, Completed:{bg:"#eef0fd",border:"#9090e0",text:"#3a3aa0"}, Killed:{bg:"#fdf0f0",border:"#e09090",text:"#a03030"} };
export const SD = { Draft:{bg:"#2a2a1e",border:"#4a4838",text:"#a0a080"}, Running:{bg:"#122a1a",border:"#2a6a40",text:"#5ad080"}, Completed:{bg:"#14142a",border:"#3a3a80",text:"#8080e0"}, Killed:{bg:"#2a1212",border:"#6a2828",text:"#e08080"} };
export const OL = { Jackpot:{bg:"#edfaf2",border:"#7adca0",text:"#1a7a48"}, Success:{bg:"#edfaf6",border:"#7ad4b0",text:"#1a6a50"}, Failed:{bg:"#fdf0f0",border:"#e09090",text:"#a03030"}, Inconclusive:{bg:"#fdf8ee",border:"#e0c070",text:"#8a6010"} };
export const OD = { Jackpot:{bg:"#122a18",border:"#2a7a40",text:"#60d080"}, Success:{bg:"#122820",border:"#2a6a50",text:"#50c898"}, Failed:{bg:"#2a1010",border:"#6a2020",text:"#e07070"}, Inconclusive:{bg:"#2a2410",border:"#6a5818",text:"#d0a838"} };

// Type badge colors - fixed palette
export const TYPE_L = { "A/B Test":"#2878a0", Campaign:"#a04828", Process:"#4848b0", Research:"#6a4090", Infrastructure:"#208050" };
export const TYPE_D = { "A/B Test":"#50a8d8", Campaign:"#d07050", Process:"#8080e0", Research:"#a870d0", Infrastructure:"#40c880" };

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
export const iceColor = (s, t) => s === null ? t.textMuted : s >= 60 ? t.gold : s >= 30 ? "#c08820" : "#a03030";

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
    if (!obj.date) { errors.push(`Row ${i+1}: missing date — skipped`); continue; }

    // Normalise date to YYYY-MM-DD
    const d = new Date(obj.date+"T12:00:00");
    if (isNaN(d)) { errors.push(`Row ${i+1}: unrecognised date "${obj.date}" — skipped`); continue; }
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
