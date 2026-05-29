import { useState, useEffect, useMemo } from "react";
import {
  COMPANY_NAME, BUSINESS_MODEL,
  NORTH_STAR_METRIC, NORTH_STAR_CURRENT, NORTH_STAR_TARGET,
  BRANDS as CONFIG_BRANDS,
  CATEGORIES,
  AGENTS as CONFIG_AGENTS,
  TEMPLATES,
  SEED,
} from "./config.js";

const KEY_ITEMS    = "gos_items_v4";
const KEY_SETTINGS = "gos_settings_v2";
const KEY_THEME    = "gos_theme_v1";
const KEY_DEBATES  = "gos_debates_v1";
const KEY_METRICS  = "gos_metrics_v1";
const KEY_RECS     = "gos_recs_v1";

// Storage helper — works in Claude artifacts (window.storage), StackBlitz (localStorage), or memory
const store = (() => {
  const mem = {};
  const hasLS = (() => { try { localStorage.setItem("__t","1"); localStorage.removeItem("__t"); return true; } catch { return false; } })();
  const hasWS = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
  return {
    async get(key) {
      if (hasWS) { try { return await window.storage.get(key); } catch {} }
      if (hasLS) { try { const v = localStorage.getItem(key); return v ? { value: v } : null; } catch {} }
      return mem[key] ? { value: mem[key] } : null;
    },
    async set(key, value) {
      if (hasWS) { try { await window.storage.set(key, value); return; } catch {} }
      if (hasLS) { try { localStorage.setItem(key, value); return; } catch {} }
      mem[key] = value;
    },
  };
})();
const DEFAULT_AGENTS = CONFIG_AGENTS;

// Default brand briefs — injected into existing brands that don't yet have brief fields.
// Keyed by lowercase brand name for fuzzy matching.
const DEFAULT_BRAND_BRIEFS = {
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
function applyBrandBriefDefaults(brand) {
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

const DEFAULT_SETTINGS = {
  companyName:      COMPANY_NAME,
  businessModel:    BUSINESS_MODEL,
  northStarMetric:  NORTH_STAR_METRIC,
  northStarCurrent: NORTH_STAR_CURRENT,
  northStarTarget:  NORTH_STAR_TARGET,
  categories:       CATEGORIES,
  dataSources:      [],
  brands:           (CONFIG_BRANDS||[]).map(applyBrandBriefDefaults),
  agents:           DEFAULT_AGENTS,
};

const STATUSES  = ["Draft","Running","Completed","Killed"];
const OUTCOMES  = ["Jackpot","Success","Failed","Inconclusive"];
const INIT_TYPES = ["A/B Test","Campaign","Process","Research","Infrastructure"];
const BLOCKERS  = ["None","Waiting on Engineering","Waiting on Creative","Waiting on Merch/Inventory","Waiting on Legal","Waiting on Finance","Waiting on Leadership"];

// Weekly metrics — source definitions and their fields
const METRIC_SOURCES = [
  { id:"manual",      label:"Manual",       icon:"✏️",
    fields:[
      {key:"revenue",     label:"Revenue ($)",          type:"number", hint:"Total revenue this period"},
      {key:"spend",       label:"Ad Spend ($)",          type:"number", hint:"Total paid media spend"},
      {key:"cac",         label:"CAC ($)",               type:"number", hint:"Cost to acquire one customer"},
      {key:"roas",        label:"ROAS",                  type:"number", hint:"Return on ad spend (e.g. 3.2)"},
      {key:"cvr",         label:"CVR (%)",               type:"number", hint:"Conversion rate (e.g. 2.4 for 2.4%)"},
      {key:"aov",         label:"AOV ($)",               type:"number", hint:"Average order value"},
      {key:"traffic",     label:"Sessions / Traffic",    type:"number", hint:"Total sessions or visits"},
      {key:"conversions", label:"Total Conversions",     type:"number", hint:"Total orders / goal completions"},
      {key:"notes",       label:"Notes",                 type:"text",   hint:"Any context for this week"},
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
const METRIC_CSV_ALIASES = {
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
  // notes
  "notes":"notes","note":"notes","comment":"notes","comments":"notes",
};

const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

const TL = {
  bg:"#EBE8E1", surface:"#FFFFFF", surfaceAlt:"#F6F4EE",
  border:"#E2DFD6", borderSoft:"#ECEAE3",
  text:"#1A1815", textSub:"#5C5A52", textMuted:"#979488",
  gold:"#C9A227", goldSoft:"#D8B94E", goldText:"#1A1815", goldBg:"#FBF7EA", goldBorder:"#EBDCA8",
  teal:"#1D8F6E", tealBg:"#E4F4EE", red:"#C0492F", redBg:"#FBEDE9",
  headerBg:"#FFFFFF", inputBg:"#FFFFFF", inputBorder:"#DCD9D2",
  shadow:"0 1px 2px rgba(40,38,30,0.04), 0 4px 14px rgba(40,38,30,0.06)",
  shadowHi:"0 2px 6px rgba(40,38,30,0.06), 0 12px 30px rgba(40,38,30,0.10)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SANS,
};
const TD = {
  bg:"#100F0D", surface:"#1A1916", surfaceAlt:"#232118",
  border:"#322F26", borderSoft:"#262420",
  text:"#F3F1EA", textSub:"#ABA89C", textMuted:"#807D72",
  gold:"#E1C261", goldSoft:"#EBD588", goldText:"#100F0D", goldBg:"#241F12", goldBorder:"#5A4D24",
  teal:"#4FC79A", tealBg:"#14271F", red:"#E27A63", redBg:"#2A1813",
  headerBg:"#100F0D", inputBg:"#1A1916", inputBorder:"#322F26",
  shadow:"0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)",
  shadowHi:"0 2px 8px rgba(0,0,0,0.5), 0 14px 36px rgba(0,0,0,0.5)",
  mono:FONT_MONO, sans:FONT_SANS, serif:FONT_SANS,
};

const SL = { Draft:{bg:"#f4f4ee",border:"#c8c4a8",text:"#666440"}, Running:{bg:"#edfaf2",border:"#7adca0",text:"#1a7a48"}, Completed:{bg:"#eef0fd",border:"#9090e0",text:"#3a3aa0"}, Killed:{bg:"#fdf0f0",border:"#e09090",text:"#a03030"} };
const SD = { Draft:{bg:"#2a2a1e",border:"#4a4838",text:"#a0a080"}, Running:{bg:"#122a1a",border:"#2a6a40",text:"#5ad080"}, Completed:{bg:"#14142a",border:"#3a3a80",text:"#8080e0"}, Killed:{bg:"#2a1212",border:"#6a2828",text:"#e08080"} };
const OL = { Jackpot:{bg:"#edfaf2",border:"#7adca0",text:"#1a7a48"}, Success:{bg:"#edfaf6",border:"#7ad4b0",text:"#1a6a50"}, Failed:{bg:"#fdf0f0",border:"#e09090",text:"#a03030"}, Inconclusive:{bg:"#fdf8ee",border:"#e0c070",text:"#8a6010"} };
const OD = { Jackpot:{bg:"#122a18",border:"#2a7a40",text:"#60d080"}, Success:{bg:"#122820",border:"#2a6a50",text:"#50c898"}, Failed:{bg:"#2a1010",border:"#6a2020",text:"#e07070"}, Inconclusive:{bg:"#2a2410",border:"#6a5818",text:"#d0a838"} };

// Type badge colors - fixed palette
const TYPE_L = { "A/B Test":"#2878a0", Campaign:"#a04828", Process:"#4848b0", Research:"#6a4090", Infrastructure:"#208050" };
const TYPE_D = { "A/B Test":"#50a8d8", Campaign:"#d07050", Process:"#8080e0", Research:"#a870d0", Infrastructure:"#40c880" };

const CAT_L = ["#b07818","#187860","#4848b0","#b03838","#a04828","#2878a0","#6a4090","#208050"];
const CAT_D = ["#d4a83a","#3acca0","#8080e0","#e08080","#d07050","#50a8d8","#a870d0","#40c880"];
const catColor = (cat, cats, dk) => (dk ? CAT_D : CAT_L)[cats.indexOf(cat) % 8] || "#888";

const BRAND_COLORS_L = ["#b07818","#187860","#4848b0","#b03838","#a04828","#2878a0"];
const BRAND_COLORS_D = ["#d4a83a","#3acca0","#8080e0","#e08080","#d07050","#50a8d8"];
const brandColor = (brandId, brands, dk) => {
  const idx = brands.findIndex(b=>b.id===brandId);
  return (dk?BRAND_COLORS_D:BRAND_COLORS_L)[idx%6]||"#888";
};
const brandName = (brandId, brands) => {
  if(!brandId||brandId==="default") return brands[0]&&brands[0].name||"Default";
  return (brands.find(b=>b.id===brandId)||{name:brandId}).name;
};
const iceScore = (i, c, e) => (!i && !c && !e) ? null : Math.round(((i||0)*(c||0)*(e||0)/1000)*100);
const iceColor = (s, t) => s === null ? t.textMuted : s >= 60 ? t.gold : s >= 30 ? "#c08820" : "#a03030";

const fmtCur = (n) => {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  const s = abs >= 1000000 ? "$"+(abs/1000000).toFixed(1)+"M" : abs >= 1000 ? "$"+Math.round(abs/1000)+"k" : "$"+abs;
  return n < 0 ? "-"+s : s;
};
const fmtDate = (d) => d ? new Date(d+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"}) : "—";
const parseD  = (d) => d ? new Date(d+"T12:00:00") : null;
const somM    = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const eomM    = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59);

// Parse a weekly metrics CSV — header-driven, order-independent
function parseMetricsCSV(text) {
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
    const numericKeys = ["revenue","spend","cac","roas","cvr","aov","traffic","sessions","conversions","impressions","clicks","cpm","ctr","cpc","bounce"];
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
const generateInitId = (brandId, brands, existingItems) => {
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

const mkDefault = (cats, activeBrand) => ({
  _new:true, id:"e-"+Date.now(), title:"", hypothesis:"",
  observation:"", successMetric:"",
  category:cats[0]||"", initType:"A/B Test", owner:"",
  primaryMetric:"", killCriteria:"", status:"Draft",
  startDate:"", endDate:"", ice:{impact:5,certainty:5,ease:5},
  revenueImpact:0, spendCost:0, resourceCost:0, linkedIds:[], results:null,
  createdAt:new Date().toISOString().slice(0,10), notes:"",
  brandId: activeBrand && activeBrand!=="all" ? activeBrand : "default",
  blocker:"None",
});

// -- AI ------------------------------------------------------------------------
// All AI calls route through the Vercel proxy — API key never touches the browser.
const PROXY_URL    = "/api/proxy";
const GOS_SECRET   = import.meta.env.VITE_GOS_SECRET || "";

const AI_HEADERS = () => ({
  "Content-Type": "application/json",
  "x-gos-secret": GOS_SECRET,
});

// Legacy — kept so existing call sites that check for a key still work during transition
const getApiKey = () => GOS_SECRET ? "proxied" : "";

// Defensive JSON extraction for LLM responses. Tries direct parse, then largest
// balanced bracket substring, then (for arrays) wraps a single object. Returns
// null on total failure so callers can show a useful error.
function safeParseJSON(raw, expectArray) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const open  = expectArray ? "[" : "{";
  const close = expectArray ? "]" : "}";
  const start = cleaned.indexOf(open);
  const end   = cleaned.lastIndexOf(close);
  if (start !== -1 && end !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }
  if (expectArray) {
    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === "object") return [obj];
    } catch {}
  }
  return null;
}

async function callExpandHypothesis(rough, title, settings, dataCtx) {
  const sys = [
    "You help growth teams write structured initiative hypotheses for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Write a single hypothesis: We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason].",
    "One sentence. No markdown. Use the title to inform the change. Be specific about mechanism. Return only the hypothesis.",
    dataCtx ? "Data context: "+dataCtx : "",
  ].join(" ");
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:300, system:sys,
      messages:[{role:"user", content:"Title: "+(title||"none")+". Rough idea: "+rough}] }),
  });
  const data = await resp.json();
  return data.content && data.content[0] ? data.content[0].text.trim() : "";
}

async function callSynthesiseLearnings(learnings, settings) {
  const lines = learnings.map((l,i)=>String(i+1)+". ["+l.outcome+"]["+l.category+"]["+l.retailer+"] "+l.learning).join("\n");
  const retailers = [...new Set(learnings.map(l=>l.retailer))].join(", ");
  const sys = [
    "You are synthesising completed initiative learnings for "+settings.companyName+", a "+settings.businessModel+" business. Active retailers: "+retailers+".",
    "All initiatives are closed. Your job is to turn this evidence into a clear picture of what worked, what gaps exist, what not to repeat, and what to do next.",
    "Respond in exactly four sections:",
    "",
    "PATTERNS",
    "2-3 recurring themes across the closed initiatives. Look across retailers and initiative types — if a mechanic appears at multiple retailers or in multiple categories, call it out explicitly. Name the mechanism, not just the outcome.",
    "",
    "GAPS",
    "Where is a result proven at one retailer but not yet run at another? Format each gap as: [Tactic] is proven at [Retailer A] — not yet tested at [Retailer B/C]. Only include gaps with real evidence behind them.",
    "",
    "LESSONS",
    "1-2 things that failed and why, framed as forward guidance: what specifically to avoid next time and what to do instead. Write in past tense — these are closed initiatives.",
    "",
    "DO NEXT",
    "The 3 highest-confidence actions to run now, based strictly on the evidence in these learnings. Format each as: [Retailer] → [Specific action] → [Why the evidence supports this]. No hedging. Gaps from the GAPS section are automatic candidates.",
    "",
    "Keep bullets tight. No generic advice. Be specific about retailers, mechanics, and expected outcomes where the data supports it.",
  ].join(" ");
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1200, system:sys,
      messages:[{role:"user", content:"Learnings to synthesise:\n"+lines}] }),
  });
  const data = await resp.json();
  return data.content && data.content[0] ? data.content[0].text.trim() : "";
}

async function callSuggestICE(form, settings, dataCtx) {
  const sys = [
    "You help growth teams score initiatives using ICE for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Score only Impact (1-10) and Certainty (1-10). Ease is excluded.",
    "Impact: how significantly could this move the north star? 1=negligible, 10=game-changing.",
    "Certainty: how confident should the team be the hypothesis is directionally right? 1=gut feel, 10=strong evidence.",
    "Return ONLY a JSON object with keys: impact (int 1-10), impact_rationale (string), certainty (int 1-10), certainty_rationale (string). No markdown.",
    dataCtx ? "Data context: "+dataCtx : "",
  ].join(" ");
  const user = [
    "Title: "+(form.title||"none"),
    "Type: "+(form.initType||"none"),
    "Category: "+(form.category||"none"),
    "Hypothesis: "+(form.hypothesis||"none"),
    "Primary metric: "+(form.primaryMetric||"none"),
    "Kill criteria: "+(form.killCriteria||"none"),
    "Revenue estimate: $"+(form.revenueImpact||0),
  ].join(". ");
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:400, system:sys,
      messages:[{role:"user", content:user}] }),
  });
  const data = await resp.json();
  const raw   = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  return safeParseJSON(raw, false) || null;
}

async function callQuickCapture(description, settings, cats, initTypes) {
  const sys = [
    "You help growth teams structure initiative ideas for "+settings.companyName+", a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Given a rough description, extract and structure an initiative.",
    "Return ONLY valid JSON with these keys:",
    "title (string, concise), hypothesis (string, format: We believe that X will result in Y for Z, because W),",
    "category (one of: "+cats.join(", ")+"),",
    "initType (one of: "+initTypes.join(", ")+"),",
    "primaryMetric (string), killCriteria (string), notes (string, optional context).",
    "No markdown, no explanation, just the JSON object.",
  ].join(" ");
  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:600, system:sys,
      messages:[{role:"user", content:"Rough idea: "+description}] }),
  });
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const parsed = safeParseJSON(raw, false);
  if (!parsed) throw new Error("Quick capture: couldn't parse AI response. Try again.");
  return parsed;
}

// -- Next Plays (Recommendation Engine) ---------------------------------------
// Two-step pattern: (1) cheap candidate generation across portfolio state and
// learnings, (2) per-candidate expansion with full hypothesis + ICE + reasoning.
// Single-step prompts produced shallow output because the model rationed tokens
// across too many tasks at once.

// Compact, grounded view of the user's actual learning history. Used both for
// candidate generation and to validate sourceLearningIds during expansion.
function buildLearningsIndex(items, brands) {
  const closed = (items||[]).filter(e =>
    (e.status==="Completed"||e.status==="Killed") && e.results && e.results.keyLearning
  );
  return closed.map(e => ({
    id: e.id,
    initId: e.initId || e.id,
    title: e.title,
    category: e.category,
    initType: e.initType,
    retailer: brandName(e.brandId, brands),
    outcome: e.results.outcomeClassification || "Inconclusive",
    learning: e.results.keyLearning,
    actualRev: e.results.actualRevenueImpact != null ? e.results.actualRevenueImpact : null,
  }));
}

// Step 1: cheap pass. Generate 5-7 candidate ideas with one-line reasoning so
// the model casts a wide net before we spend tokens expanding.
async function callGenerateCandidates(portfolioCtx, learningsIndex, settings, cats) {
  const learningsBlock = learningsIndex.length === 0
    ? "  (no completed initiatives yet — recommendations must rely on portfolio state and brand briefs only)"
    : learningsIndex.slice(0, 30).map(l =>
        `  [${l.id}] (${l.outcome}|${l.retailer}|${l.category}) ${l.learning}`
      ).join("\n");

  const sys = [
    "You are a growth strategist generating next-experiment recommendations for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Your job: propose 5-7 high-quality candidate experiments grounded in (a) the current portfolio state, (b) the learnings library, and (c) any live metrics movements.",
    "Each candidate must be specific to this business — no generic playbook items. If a candidate is essentially a replay or close cousin of something already running or already in drafts, do NOT propose it.",
    "Prefer candidates that exploit gaps: tactics proven at one retailer but not yet tested at another, uncovered categories with revenue potential, or metrics moving the wrong way that no current initiative addresses.",
    "Return ONLY a JSON array of 5-7 objects. Each object must have these keys exactly:",
    "title (string, concise, specific), category (one of: "+cats.join(", ")+"),",
    "brandTarget (string — retailer name if the candidate is brand-specific, or 'Portfolio' if cross-brand),",
    "rationale (string, one sentence — why this, why now, anchored in what you saw in the context),",
    "sourceLearningIds (array of strings — item ids from the LEARNINGS block that informed this candidate; empty array if none).",
    "No markdown, no preamble, just the JSON array.",
  ].join(" ");

  const user = "PORTFOLIO CONTEXT:\n"+portfolioCtx+"\n\nLEARNINGS (id | outcome|retailer|category | one-line learning):\n"+learningsBlock;

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1600, system:sys,
      messages:[{role:"user", content:user}] }),
  });
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "[]";
  const parsed = safeParseJSON(raw, true);
  if (!Array.isArray(parsed)) throw new Error("Next Plays: candidate generation returned malformed response.");
  return parsed;
}

// Step 2: expand one selected candidate into a full recommendation. Run in
// parallel for the top 3 so a single failure doesn't sink the whole batch.
async function callExpandRecommendation(candidate, portfolioCtx, learningsIndex, settings) {
  // Filter learnings to just the ones the candidate cited, so the expander
  // grounds its reasoning trace in real history rather than re-inventing context.
  const citedLearnings = (candidate.sourceLearningIds || [])
    .map(id => learningsIndex.find(l => l.id === id))
    .filter(Boolean);
  const citedBlock = citedLearnings.length === 0
    ? "  (this candidate did not cite specific past learnings)"
    : citedLearnings.map(l =>
        `  [${l.id}] (${l.outcome}|${l.retailer}|${l.category}) ${l.title} — ${l.learning}`
      ).join("\n");

  const sys = [
    "You are expanding a growth experiment candidate into a fully-specified recommendation for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Return ONLY a JSON object with these keys exactly:",
    "observation (string — what specifically in the portfolio context or learnings prompted this — 1-2 sentences, cite numbers if present),",
    "hypothesis (string — format: We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason]),",
    "successMetric (string — the one metric that would prove or disprove this, plus a concrete threshold if you can defend one),",
    "primaryMetric (string — short label, e.g. 'CVR', 'ROAS', 'CAC'),",
    "killCriteria (string — concrete stop conditions),",
    "initType (one of: A/B Test, Campaign, Process, Research, Infrastructure),",
    "impact (int 1-10), impactRationale (string, one sentence),",
    "certainty (int 1-10), certaintyRationale (string, one sentence — explicitly reference cited learnings if any),",
    "reasoningTrace (string — 2-3 sentences explaining the full logic: why this, why now, what specific evidence supports it. Reference the cited learnings by what they showed, not by id.).",
    "Be specific. No hedging. No generic advice. If certainty is high, the cited learnings should justify it.",
  ].join(" ");

  const user = [
    "CANDIDATE:",
    "  Title: "+candidate.title,
    "  Category: "+candidate.category,
    "  Brand target: "+(candidate.brandTarget||"Portfolio"),
    "  Initial rationale: "+candidate.rationale,
    "",
    "CITED LEARNINGS:",
    citedBlock,
    "",
    "PORTFOLIO CONTEXT:",
    portfolioCtx,
  ].join("\n");

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, system:sys,
      messages:[{role:"user", content:user}] }),
  });
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const parsed = safeParseJSON(raw, false);
  if (!parsed) throw new Error("Next Plays: expansion returned malformed response for '"+candidate.title+"'.");
  return parsed;
}


// Tools the agents can call against the live portfolio

function buildPortfolioTools(items, settings, brands, activeBrand) {
  const filter = e => activeBrand === "all" || (e.brandId||"default") === activeBrand;
  const all = items.filter(filter);
  const iceS = e => e.ice ? Math.round(((e.ice.impact||0)*(e.ice.certainty||0)*(e.ice.ease||0)/1000)*100) : 0;

  return {
    // Tool definitions sent to the API
    definitions: [
      {
        name: "get_portfolio_summary",
        description: "Get high-level portfolio statistics: running count, draft count, revenue at risk, win rate, avg ICE, north star gap.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_running_initiatives",
        description: "Get all currently running initiatives with title, category, revenue at risk, owner, and any blockers.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_category_coverage",
        description: "Get a breakdown of how many initiatives (running + draft) exist per category, revealing coverage gaps.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_win_rate_by_category",
        description: "Get historical win rate and average actual revenue impact broken down by initiative category.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_top_draft_opportunities",
        description: "Get the highest-ICE draft initiatives that are not yet running — the best uninitiated opportunities.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_failure_patterns",
        description: "Get what has failed or been killed, with key learnings, to avoid repeating mistakes.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_blocked_initiatives",
        description: "Get all initiatives currently blocked and what they are waiting on.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_revenue_gap_analysis",
        description: "Calculate the gap between north star current and target, and how much running initiatives cover it.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
    ],

    // Tool executor — called when model uses a tool
    execute(toolName) {
      const running  = all.filter(e => e.status==="Running");
      const draft    = all.filter(e => e.status==="Draft");
      const closed   = all.filter(e => e.status==="Completed"||e.status==="Killed");
      const wins     = closed.filter(e => e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success"));
      const failures = closed.filter(e => e.results&&(e.results.outcomeClassification==="Failed"||e.results.outcomeClassification==="Inconclusive"));
      const blocked  = running.filter(e => e.blocker&&e.blocker!=="None");

      switch(toolName) {
        case "get_portfolio_summary": {
          const revAtRisk = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
          const winRate   = closed.length>0?Math.round((wins.length/closed.length)*100):null;
          const iceScores = all.filter(e=>e.ice).map(iceS).filter(s=>s>0);
          const avgIce    = iceScores.length>0?Math.round(iceScores.reduce((a,b)=>a+b,0)/iceScores.length):null;
          return { running:running.length, draft:draft.length, closed:closed.length,
            revenue_at_risk:`$${revAtRisk.toLocaleString()}`, win_rate:winRate!==null?winRate+"%":"n/a",
            avg_ice:avgIce||"n/a", blocked_count:blocked.length,
            north_star:{ metric:settings.northStarMetric, current:settings.northStarCurrent, target:settings.northStarTarget }};
        }
        case "get_running_initiatives":
          return running.map(e=>({
            id:e.initId, title:e.title, category:e.category, owner:e.owner||"unassigned",
            revenue_at_risk:`$${(e.revenueImpact||0).toLocaleString()}`,
            blocker:e.blocker&&e.blocker!=="None"?e.blocker:"none",
            ice:iceS(e), end_date:e.endDate||"no end date",
          }));
        case "get_category_coverage": {
          const cats = settings.categories || DEFAULT_SETTINGS.categories;
          return cats.map(cat=>({
            category:cat,
            running:running.filter(e=>e.category===cat).length,
            draft:draft.filter(e=>e.category===cat).length,
            total:all.filter(e=>e.category===cat).length,
          })).sort((a,b)=>(b.running+b.draft)-(a.running+a.draft));
        }
        case "get_win_rate_by_category": {
          const cats = [...new Set(closed.map(e=>e.category))];
          return cats.map(cat=>{
            const catClosed = closed.filter(e=>e.category===cat);
            const catWins   = catClosed.filter(e=>e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success"));
            const actuals   = catClosed.filter(e=>e.results&&typeof e.results.actualRevenueImpact==="number");
            const avgActual = actuals.length>0?Math.round(actuals.reduce((s,e)=>s+(e.results.actualRevenueImpact||0),0)/actuals.length):null;
            return { category:cat, closed:catClosed.length, wins:catWins.length,
              win_rate:catClosed.length>0?Math.round((catWins.length/catClosed.length)*100)+"%":"n/a",
              avg_actual_revenue:avgActual!==null?`$${avgActual.toLocaleString()}`:"no data" };
          }).sort((a,b)=>b.closed-a.closed);
        }
        case "get_top_draft_opportunities":
          return draft.sort((a,b)=>iceS(b)-iceS(a)).slice(0,6).map(e=>({
            id:e.initId, title:e.title, category:e.category,
            ice:iceS(e), est_revenue:`$${(e.revenueImpact||0).toLocaleString()}`,
            hypothesis:(e.hypothesis||"").slice(0,120)+"…",
          }));
        case "get_failure_patterns":
          return failures.slice(0,6).map(e=>({
            title:e.title, category:e.category,
            outcome:e.results?.outcomeClassification,
            key_learning:e.results?.keyLearning||"no learning recorded",
            decision:e.results?.decisionMade||"no decision recorded",
          }));
        case "get_blocked_initiatives":
          return blocked.map(e=>({
            id:e.initId, title:e.title, category:e.category,
            blocked_by:e.blocker, revenue_at_risk:`$${(e.revenueImpact||0).toLocaleString()}`,
          }));
        case "get_revenue_gap_analysis": {
          const revAtRisk = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
          const draftRev  = draft.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
          return {
            current:settings.northStarCurrent, target:settings.northStarTarget,
            revenue_at_risk_from_running:`$${revAtRisk.toLocaleString()}`,
            potential_from_draft_pipeline:`$${draftRev.toLocaleString()}`,
            note:"Revenue at risk = estimated impact of running initiatives. Does not account for probability of success."
          };
        }
        default: return { error:`Unknown tool: ${toolName}` };
      }
    }
  };
}

// Build a concise portfolio snapshot (still used as initial context)
function buildPortfolioContext(items, settings, brands, activeBrand, weeklyMetrics) {
  const tools = buildPortfolioTools(items, settings, brands, activeBrand);
  const summary = tools.execute("get_portfolio_summary");
  const running = tools.execute("get_running_initiatives");
  const coverage = tools.execute("get_category_coverage");
  const topDrafts = tools.execute("get_top_draft_opportunities");

  const runStr = running.slice(0,8).map(e =>
    `  [${e.id||"?"}] "${e.title}" | ${e.category} | ${e.revenue_at_risk}${e.blocker!=="none"?" | ⚠️ "+e.blocker:""}`
  ).join("\n") || "  (none)";

  const gapCats = coverage.filter(c=>c.running===0&&c.draft===0).map(c=>c.category).join(", ");

  // Build live metrics block
  let metricsBlock = "";
  if (weeklyMetrics && weeklyMetrics.length > 0) {
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // last 5 weeks
    const recent = weeklyMetrics
      .filter(m => new Date(m.date+"T12:00:00") >= recentCutoff)
      .sort((a,b) => b.date.localeCompare(a.date));

    const latestDate = recent[0]?.date;
    const daysSinceLast = latestDate
      ? Math.floor((now - new Date(latestDate+"T12:00:00")) / 86400000)
      : null;

    const stalenessNote = daysSinceLast !== null && daysSinceLast > 10
      ? ` ⚠️ Note: metrics are ${daysSinceLast} days old — treat as directional.`
      : "";

    // Group by brand+source for latest week
    const latestByBrandSource = {};
    recent.forEach(m => {
      const key = `${m.brand}::${m.source}`;
      if (!latestByBrandSource[key]) latestByBrandSource[key] = m;
    });

    // For each brand+source, find previous week for WoW delta
    const prevByBrandSource = {};
    recent.forEach(m => {
      const key = `${m.brand}::${m.source}`;
      if (latestByBrandSource[key] && m.date < latestByBrandSource[key].date) {
        if (!prevByBrandSource[key] || m.date > prevByBrandSource[key].date) {
          prevByBrandSource[key] = m;
        }
      }
    });

    const metricsLines = Object.entries(latestByBrandSource).map(([key, latest]) => {
      const [brand, source] = key.split("::");
      const prev = prevByBrandSource[key];
      const brandLabel = brand === "default" ? (brands[0]?.name || "Portfolio") : (brands.find(b=>b.id===brand)?.name || brand);
      const srcDef = METRIC_SOURCES.find(s=>s.id===source);
      const srcLabel = srcDef ? srcDef.label : source;

      const metricParts = Object.entries(latest.metrics)
        .filter(([k]) => k !== "notes")
        .map(([k, v]) => {
          const label = k.toUpperCase();
          let delta = "";
          if (prev && prev.metrics[k] !== undefined && typeof v === "number") {
            const d = ((v - prev.metrics[k]) / Math.max(Math.abs(prev.metrics[k]), 0.01) * 100);
            delta = " (" + (d >= 0 ? "+" : "") + d.toFixed(1) + "% WoW)";
          }
          return `${label}: ${typeof v === "number" ? v.toLocaleString() : v}${delta}`;
        }).join(" | ");

      return `  [${brandLabel} · ${srcLabel}] ${latest.date}: ${metricParts}`;
    }).join("\n") || "  (none logged)";

    metricsBlock = `\nLIVE METRICS${stalenessNote}:\n${metricsLines}`;
  } else {
    metricsBlock = "\nLIVE METRICS: Not yet logged — agents should note data is manually estimated only.";
  }

  // Build brand briefs block
  const briefedBrands = (brands||[]).filter(b =>
    b.whatTheySell || b.categories || b.icp || b.whyTheyWin || b.relationship || b.constraint
  );
  const brandBriefsBlock = briefedBrands.length > 0
    ? "\nBRAND BRIEFS:\n" + briefedBrands.map(b => {
        const lines = [`  [${b.name}]`];
        if (b.whatTheySell)  lines.push(`    What they sell: ${b.whatTheySell}`);
        if (b.categories)    lines.push(`    Categories: ${b.categories}`);
        if (b.icp)           lines.push(`    ICP: ${b.icp}`);
        if (b.whyTheyWin)    lines.push(`    Why they win: ${b.whyTheyWin}`);
        if (b.relationship)  lines.push(`    Relationship: ${b.relationship}`);
        if (b.constraint)    lines.push(`    Current constraint: ${b.constraint}`);
        return lines.join("\n");
      }).join("\n")
    : "";

  return `COMPANY: ${settings.companyName} | ${settings.businessModel}
NORTH STAR: ${settings.northStarMetric} | Now: ${settings.northStarCurrent} → Target: ${settings.northStarTarget}
PORTFOLIO: ${summary.running} running | ${summary.draft} draft | ${summary.blocked_count} blocked | Win rate: ${summary.win_rate} | Avg ICE: ${summary.avg_ice}
REVENUE AT RISK: ${summary.revenue_at_risk}${brandBriefsBlock}

RUNNING:
${runStr}

TOP UNINITIATED DRAFTS (by ICE):
${topDrafts.slice(0,4).map(e=>`  [ICE ${e.ice}] "${e.title}" | ${e.category} | ${e.est_revenue}`).join("\n")||"  (none)"}

UNCOVERED CATEGORIES (zero initiatives): ${gapCats||"none"}${metricsBlock}`.trim();
}

// Single agent turn with tool use — agentic: agent decides what data to fetch
async function callAgentTurn(agent, portfolioCtx, userContext, messageHistory, portfolioTools, isFirstTurn) {

  const mandates = {
    "CMO":  "Your mandate: argue for investment in growth and acquisition even when the data is early or mixed. You believe underinvestment is a bigger risk than overspend. Push back hard on anyone who says 'wait for more data' or 'protect margin first'.",
    "CFO":  "Your mandate: protect margin and challenge every spend assumption. You do not accept revenue projections at face value. Ask who is accountable for the number, what the downside looks like, and whether the same capital has a better home elsewhere.",
    "CGO":  "Your mandate: the north star gap is your only scorecard. Every proposal must be evaluated on whether it closes that gap within the horizon. You will kill debates about tactics that don't move the number, and accelerate anything that does.",
    "CRO":  "Your mandate: pipeline and retention are the only levers that matter. You are sceptical of brand and awareness plays. You want to know the conversion path from any proposed initiative before you'll support it.",
    "CPO":  "Your mandate: product and experience are the moat. You push back on quick-win tactics that erode the customer experience or create technical debt. You champion initiatives that compound over time, not one-off lifts.",
  };
  const agentMandate = mandates[agent.label] || "Your mandate: represent your strategic lens forcefully and push back on anything that conflicts with it.";

  const sys = `You are the ${agent.label} (${agent.icon}) in a C-Suite strategy debate about what this company should be doing that it currently isn't.

Your strategic lens: ${agent.lens}.
Your known blindspot (acknowledge it if relevant): ${agent.blindspot}.
${agentMandate}

You have access to tools that query the live portfolio data. Use them before forming opinions — don't guess at data you can look up.
Be direct, commercially specific, and reference actual initiatives by name.
When you disagree with another executive, state exactly what they got wrong and why — don't soften it.
Your goal: surface HIGH-IMPACT net-new opportunities the team is NOT currently running, and defend your position under challenge.
Max 180 words per turn. No filler. Speak like a real boardroom executive who has a point of view and will fight for it.`;

  const firstUserMsg = `Portfolio snapshot:\n${portfolioCtx}\n\nSituation context:\n${userContext||"None provided."}\n\nOpen the debate. Use your tools to look deeper at anything in the portfolio that concerns you, then make your case for what's being overlooked.`;

  const messages = isFirstTurn
    ? [{ role:"user", content: firstUserMsg }]
    : [...messageHistory, { role:"user", content:`${agent.label}: It's your turn. Use tools if needed, then give your take — push back on what's been said or add what's being missed.` }];

  // Agentic loop — agent may call multiple tools before responding
  let currentMessages = messages;
  let iterations = 0;
  const MAX_TOOL_ITERS = 4;

  while (iterations < MAX_TOOL_ITERS) {
    const resp = await fetch(PROXY_URL, {
      method:"POST", headers:AI_HEADERS(),
      body: JSON.stringify({
        model:"claude-sonnet-4-6", max_tokens:600, system:sys,
        tools: portfolioTools.definitions,
        messages: currentMessages,
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const stopReason = data.stop_reason;
    const content = data.content || [];

    if (stopReason === "tool_use") {
      // Execute all tool calls
      const toolResults = content
        .filter(b => b.type === "tool_use")
        .map(b => ({
          type:"tool_result",
          tool_use_id: b.id,
          content: JSON.stringify(portfolioTools.execute(b.name)),
        }));

      // Add assistant turn + tool results to history
      currentMessages = [
        ...currentMessages,
        { role:"assistant", content },
        { role:"user", content: toolResults },
      ];
      iterations++;
    } else {
      // Final text response
      const text = content.filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      // Return text + the tool calls made (for transparency in UI)
      const toolsUsed = content.filter(b=>b.type==="tool_use").map(b=>b.name);
      // Also gather tool calls from the loop
      const allToolsUsed = currentMessages
        .flatMap(m => Array.isArray(m.content) ? m.content : [])
        .filter(b => b.type==="tool_use")
        .map(b=>b.name);
      return { text, toolsUsed:[...new Set(allToolsUsed)] };
    }
  }
  throw new Error("Agent exceeded tool iteration limit");
}

// Moderator — decides what happens next after each agent turn
async function callModerator(portfolioCtx, userContext, transcript, agents, turnCount, maxTurns) {

  const agentLabels = agents.map(a=>a.label).join(", ");
  const transcriptStr = transcript.map(m=>`${m.icon} ${m.label}: ${m.text}`).join("\n\n---\n\n");

  const sys = `You are the debate Moderator for a C-Suite strategy session.
Your job: read the current debate and decide what happens next.
Agents available: ${agentLabels}.
Current turn: ${turnCount}. Maximum turns: ${maxTurns}.

Return ONLY a JSON object (no markdown) with this structure:
{
  "decision": "continue" | "followup" | "synthesise",
  "next_agent": "<agent label — required if decision is continue or followup>",
  "followup_prompt": "<specific question to put to next_agent — required if decision is followup, null otherwise>",
  "reason": "<one sentence on why you made this decision>"
}

Rules:
- "continue": normal next turn, rotate to an agent who hasn't spoken recently or who has a mandate-driven reason to weigh in
- "followup": USE THIS when two agents have taken opposing positions — force the challenged agent to respond directly. The followup_prompt must name the specific claim being contested, e.g. "The CFO said your revenue projection is unsupported — respond to that specific objection." Use followup aggressively in turns 2-5 to generate real tension before synthesising.
- "synthesise": the debate has surfaced genuine opposing positions, key tensions have been directly contested, and you have enough signal to produce differentiated initiatives. Do not synthesise if agents have only agreed with each other.
- Force "synthesise" if turnCount >= ${maxTurns - 1}

Priority: favour "followup" over "continue" whenever there is an unresolved disagreement in the transcript. Consensus too early produces generic output.`;

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body: JSON.stringify({
      model:"claude-sonnet-4-6", max_tokens:300, system:sys,
      messages:[{role:"user", content:`Portfolio:\n${portfolioCtx}\n\nContext:\n${userContext||"none"}\n\nTranscript so far:\n${transcriptStr}\n\nDecide what happens next.`}],
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  const raw = data.content?.[0]?.text?.trim()||"{}";
  const parsed = safeParseJSON(raw, false);
  // Moderator failure is non-fatal — fall back to "continue with next agent"
  return parsed || { decision: "continue", next_agent: null, followup_prompt: null, reason: "Moderator response unparseable; continuing." };
}

// Final synthesis — reads full debate + tool outputs, returns 3 structured initiatives
async function callDebateSynthesis(portfolioCtx, userContext, transcript, cats, settings, portfolioTools) {

  // Give synthesis access to full data too
  const winRate   = portfolioTools.execute("get_win_rate_by_category");
  const failures  = portfolioTools.execute("get_failure_patterns");
  const coverage  = portfolioTools.execute("get_category_coverage");
  const dataAppendix = `\nDATA APPENDIX:\nWin rates by category: ${JSON.stringify(winRate)}\nFailures: ${JSON.stringify(failures)}\nCoverage: ${JSON.stringify(coverage)}`;

  const transcriptStr = transcript.map(m=>`${m.icon} ${m.label}:\n${m.text}`).join("\n\n---\n\n");

  const sys = `You are a Chief Strategy Officer synthesising a C-Suite debate into net-new growth initiatives.

Your job is not to summarise the debate — it is to resolve it. Where executives disagreed, you must take a position and explain why you're proceeding despite the objection. Where they agreed, scrutinise whether consensus was earned or just convenient.

Rules:
- NET NEW only — not already in the active or draft pipeline.
- Each initiative must be grounded in specific data from the portfolio tools, not just debate rhetoric.
- The championedBy and dissentVoice fields are not decorative — they are the executive summary. A CGO reading this card should immediately understand who is accountable, who is skeptical, and why you're proceeding anyway.
- Rank by expected impact on the north star metric, highest first.
- Be brutally specific. Dollar estimates must be grounded in actual portfolio win rates and revenue figures from the data.

Return ONLY a valid JSON array of exactly 3 objects. No markdown, no preamble:
{
  "title": "concise specific title (max 12 words)",
  "observation": "2-3 sentences grounded in the portfolio data and debate that justify this — cite specific numbers where available",
  "hypothesis": "We believe that [specific change] will result in [measurable outcome] for [context], because [evidence from debate/data].",
  "successMetric": "single measurable KPI that defines a win",
  "primaryMetric": "short label",
  "killCriteria": "specific stop/pivot condition with a number",
  "category": "one of: ${cats.join(", ")}",
  "initType": "one of: ${INIT_TYPES.join(", ")}",
  "ice": { "impact": <1-10>, "certainty": <1-10>, "ease": <1-10> },
  "revenueImpact": <integer dollar estimate grounded in portfolio data>,
  "championedBy": "<agent label> — <specifically what data or argument drove them to push for this>",
  "dissentVoice": "<agent label> — <their specific objection and the number or risk they cited>",
  "whyNotAlreadyRunning": "honest one-sentence on why this gap exists — be specific, not generic",
  "csoRationale": "one sentence: why you're proceeding despite the dissent — this is your call as CSO"
}`;

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body: JSON.stringify({
      model:"claude-sonnet-4-6", max_tokens:3500, system:sys,
      messages:[{role:"user", content:
        `Portfolio:\n${portfolioCtx}${dataAppendix}\n\nContext:\n${userContext||"None."}\n\nDebate:\n${transcriptStr}\n\nSynthesize the 3 highest-impact net-new initiatives.`
      }],
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  const raw = data.content?.[0]?.text?.trim()||"[]";
  const parsed = safeParseJSON(raw, true);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("The debate produced ideas but the final synthesis came back malformed. Open this debate in History to keep the transcript, then re-run.");
  }
  return parsed;
}

// -- Style helpers -------------------------------------------------------------
const menuItem = (t) => ({fontSize:14,padding:"10px 12px",background:"transparent",border:"none",color:t.text,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,fontFamily:t.sans,width:"100%"});
const gG  = (t) => ({fontSize:12.5,padding:"7px 14px",borderRadius:9,background:t.gold,border:"1px solid "+t.gold,color:t.goldText,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:5,fontFamily:t.sans});
const gGh = (t) => ({fontSize:12.5,padding:"7px 13px",borderRadius:9,background:t.surfaceAlt,border:"1px solid "+t.border,color:t.textSub,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontFamily:t.sans,fontWeight:500});
const gI  = (t) => ({width:"100%",padding:"8px 11px",fontSize:13,fontFamily:t.sans,background:t.inputBg,border:"1px solid "+t.inputBorder,borderRadius:9,color:t.text,boxSizing:"border-box"});
const gTA = (t) => ({...gI(t),resize:"vertical"});
const gSl = (t) => ({...gI(t),cursor:"pointer"});
const gSc = (t,dk) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:14,padding:"15px 18px",boxShadow:t.shadow});
const gSL = (t) => ({fontSize:10,letterSpacing:"0.11em",textTransform:"uppercase",color:t.textMuted,marginBottom:8,fontFamily:t.mono,fontWeight:600});
const gCd = (t,dk) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:14,padding:"15px 18px",boxShadow:t.shadow});
// Financial metric style — large, high-contrast, instantly scannable
const gFin = (t) => ({fontFamily:t.mono,fontWeight:700,fontSize:28,letterSpacing:"-0.02em",color:t.gold,lineHeight:1});

function FR({label,t,children}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <label style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{label}</label>
      {children}
    </div>
  );
}

// -- Atoms ---------------------------------------------------------------------
function Bdg({label,color,bg,border,small}) {
  return <span style={{display:"inline-block",fontSize:small?10:11,fontWeight:600,letterSpacing:"0.03em",padding:small?"1px 6px":"2px 8px",borderRadius:4,border:"1px solid "+(border||"#ccc"),background:bg||"#f5f5f0",color:color||"#666",whiteSpace:"nowrap"}}>{label}</span>;
}
function SBdg({s,dk})        { const c=(dk?SD:SL)[s]||SL.Draft; return <Bdg label={s} color={c.text} bg={c.bg} border={c.border}/>; }
function OBdg({o,dk})        { const c=(dk?OD:OL)[o]||{};        return <Bdg label={o} color={c.text} bg={c.bg} border={c.border}/>; }
function CBdg({cat,cats,dk}) { return <Bdg label={cat} color={catColor(cat,cats,dk)} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"}/>; }
function TBdg({type,dk}) {
  const color = (dk?TYPE_D:TYPE_L)[type]||"#888";
  return <Bdg label={type} color={color} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"} small/>;
}

function BlockerBadge({blocker}) {
  if (!blocker || blocker === "None") return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:800,
      background:"#1a1400",color:"#ffd700",border:"2px solid #ffd700",borderRadius:4,
      padding:"3px 9px",letterSpacing:"0.03em",whiteSpace:"nowrap",boxShadow:"0 0 0 1px #b8a000"}}>
      ⚠️ BLOCKED: {blocker}
    </span>
  );
}

function ICEChip({ice,t}) {
  const s = iceScore(ice&&ice.impact, ice&&ice.certainty, ice&&ice.ease);
  if (s===null) return <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>No ICE</span>;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:iceColor(s,t),fontFamily:t.mono,border:"1px solid "+t.border,borderRadius:4,padding:"2px 7px"}}>ICE {s}</span>;
}

function CBar({pct,t}) {
  const col = pct>=80?t.gold:pct>=60?"#c08820":"#c04040";
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{flex:1,height:4,background:t.border,borderRadius:2}}>
        <div style={{width:pct+"%",height:"100%",borderRadius:2,background:col}}/>
      </div>
      <span style={{fontSize:12,color:t.textMuted,minWidth:32,textAlign:"right"}}>{pct}%</span>
    </div>
  );
}

function EAlert({endDate,status,t,dk}) {
  if (!["Running","Draft"].includes(status)||!endDate) return null;
  const days = Math.ceil((new Date(endDate+"T12:00:00")-new Date())/86400000);
  if (days>14) return null;
  const urg = days<=3;
  return <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,background:urg?(dk?"#2a1010":"#fdf0f0"):(dk?"#2a2410":"#fdf8ee"),color:urg?"#e07070":"#c09828",border:"1px solid "+(urg?"#6a2828":"#c09828")}}>{days<=0?"End date passed":"Ends in "+days+"d"}</span>;
}

function Spark({vals,color,w,h}) {
  if (!vals||vals.length<2) return <span style={{fontSize:11,color:"#aaa"}}>—</span>;
  const W=w||120,H=h||28,mx=Math.max(...vals,1);
  const pts = vals.map((v,i)=>((i/(vals.length-1))*(W-4)+2).toFixed(1)+","+(H-2-((v/mx)*(H-4))).toFixed(1)).join(" ");
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      {vals.map((v,i)=>{const x=(i/(vals.length-1))*(W-4)+2,y=H-2-((v/mx)*(H-4)); return <circle key={i} cx={x} cy={y} r="2.2" fill={color}/>;})}
    </svg>
  );
}

function ICESliders({ice,onChange,t}) {
  const dims = [
    {key:"impact",    label:"Impact",    hint:"How big is the upside? 1=negligible, 10=game-changing"},
    {key:"certainty", label:"Certainty", hint:"How confident is the team the hypothesis is right? 1=gut feel, 10=strong evidence"},
    {key:"ease",      label:"Ease",      hint:"How easy to execute? 1=months of work, 10=days to ship"},
  ];
  const score = iceScore(ice&&ice.impact, ice&&ice.certainty, ice&&ice.ease);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {dims.map(d=>(
        <div key={d.key}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,color:t.textSub,fontFamily:t.mono}}>{d.label}</span>
            <span style={{fontSize:12,fontWeight:700,color:t.gold,fontFamily:t.mono}}>{(ice&&ice[d.key])||0}</span>
          </div>
          <input type="range" min={1} max={10} step={1} value={(ice&&ice[d.key])||5}
            onChange={e=>onChange({...ice,[d.key]:parseInt(e.target.value)})} style={{width:"100%"}}/>
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginTop:2}}>{d.hint}</div>
        </div>
      ))}
      <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:4,borderTop:"1px solid "+t.border}}>
        <span style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>ICE Score:</span>
        <span style={{fontSize:18,fontWeight:700,fontFamily:t.serif,color:score!==null?iceColor(score,t):t.textMuted}}>{score!==null?score:"—"}</span>
        <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>/100</span>
      </div>
    </div>
  );
}

function Modal({t,dk,onClose,children,title,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:dk?"rgba(0,0,0,0.7)":"rgba(20,18,10,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:t.surface,border:"1px solid "+t.border,borderRadius:10,padding:24,width:"100%",maxWidth:wide?560:440,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          {title&&<span style={{fontSize:15,fontWeight:700,color:t.text,fontFamily:t.serif}}>{title}</span>}
          <button onClick={onClose} style={{marginLeft:"auto",background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",fontSize:17}}><span>&#10005;</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// -- App -----------------------------------------------------------------------
// ── Onboarding Modal ────────────────────────────────────────────────────────
function OnboardingModal({ t, dk, settings, onSave, onSkip }) {
  const [step, setStep]   = useState(0);
  const [data, setData]   = useState({
    companyName:      settings.companyName      || "",
    businessModel:    settings.businessModel    || "",
    northStarMetric:  settings.northStarMetric  || "",
    northStarCurrent: settings.northStarCurrent || "",
    northStarTarget:  settings.northStarTarget  || "",
  });
  const [brands, setBrands] = useState(
    (settings.brands||[]).map(b=>({...b,
      whatTheySell: b.whatTheySell||"",
      categories:   b.categories||"",
      icp:          b.icp||"",
      whyTheyWin:   b.whyTheyWin||"",
      relationship: b.relationship||"",
      constraint:   b.constraint||"",
    }))
  );
  const f = (k,v) => setData(p=>({...p,[k]:v}));
  const fb = (i,k,v) => setBrands(bs => { const n=[...bs]; n[i]={...n[i],[k]:v}; return n; });

  const STEPS = [
    {
      id: "company",
      title: "Your company",
      subtitle: "This personalises every AI output — hypotheses, debates, synthesis.",
      fields: (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:4}}>Company name</label>
            <input style={gI(t)} value={data.companyName} onChange={e=>f("companyName",e.target.value)}
              placeholder="e.g. Northcove Home" autoFocus/>
          </div>
          <div>
            <label style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:4}}>Business model</label>
            <input style={gI(t)} value={data.businessModel} onChange={e=>f("businessModel",e.target.value)}
              placeholder="e.g. Multi-retailer DTC, eCommerce brand, SaaS, Marketplace"/>
          </div>
        </div>
      ),
    },
    {
      id: "northstar",
      title: "Your north star",
      subtitle: "The single metric everything should move. Agents will anchor every debate to the gap.",
      fields: (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:4}}>Metric name</label>
            <input style={gI(t)} value={data.northStarMetric} onChange={e=>f("northStarMetric",e.target.value)}
              placeholder="e.g. Portfolio Revenue, Monthly Recurring Revenue, GMV"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:4}}>Current value</label>
              <input style={gI(t)} value={data.northStarCurrent} onChange={e=>f("northStarCurrent",e.target.value)}
                placeholder="e.g. $1.1M/mo"/>
            </div>
            <div>
              <label style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:4}}>Target value</label>
              <input style={gI(t)} value={data.northStarTarget} onChange={e=>f("northStarTarget",e.target.value)}
                placeholder="e.g. $1.4M/mo"/>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "brands",
      title: "Your brands & retailers",
      subtitle: "This is what makes AI recommendations specific to your business — not generic advice.",
      fields: (
        <div style={{display:"flex",flexDirection:"column",gap:10,maxHeight:320,overflowY:"auto",paddingRight:4}}>
          {brands.map((b,i)=>(
            <div key={b.id} style={{padding:"10px 12px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:12,fontWeight:700,color:t.text,fontFamily:t.serif}}>{b.name}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div>
                  <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:2}}>WHAT THEY SELL</label>
                  <input style={{...gI(t),fontSize:11}} value={b.whatTheySell} onChange={e=>fb(i,"whatTheySell",e.target.value)} placeholder="e.g. Premium home décor, $80–$300 AOV"/>
                </div>
                <div>
                  <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:2}}>CATEGORIES</label>
                  <input style={{...gI(t),fontSize:11}} value={b.categories} onChange={e=>fb(i,"categories",e.target.value)} placeholder="e.g. Home decor, Gifting, Candles"/>
                </div>
                <div>
                  <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:2}}>ICP</label>
                  <input style={{...gI(t),fontSize:11}} value={b.icp} onChange={e=>fb(i,"icp",e.target.value)} placeholder="e.g. Women 28–45, gifting buyers"/>
                </div>
                <div>
                  <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:2}}>WHY THEY WIN</label>
                  <input style={{...gI(t),fontSize:11}} value={b.whyTheyWin} onChange={e=>fb(i,"whyTheyWin",e.target.value)} placeholder="e.g. Visual brand, strong LTV"/>
                </div>
                <div>
                  <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:2}}>RELATIONSHIP</label>
                  <input style={{...gI(t),fontSize:11}} value={b.relationship} onChange={e=>fb(i,"relationship",e.target.value)} placeholder="e.g. Own DTC, wholesale, marketplace"/>
                </div>
                <div>
                  <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:2}}>CURRENT CONSTRAINT</label>
                  <input style={{...gI(t),fontSize:11}} value={b.constraint} onChange={e=>fb(i,"constraint",e.target.value)} placeholder="e.g. Rising CAC, thin margin"/>
                </div>
              </div>
            </div>
          ))}
          {brands.length===0&&<div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,padding:"12px 0"}}>No brands configured — add them in Settings after setup.</div>}
        </div>
      ),
    },
    {
      id: "done",
      title: "You're set up",
      subtitle: "Your portfolio is ready. Add your first initiative, import a CSV, or let Signal AI analyse your current state.",
      fields: (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[
            { icon:"⚡", label:"Quick capture", desc:"Paste any idea — AI structures it into an initiative" },
            { icon:"✦",  label:"Signal AI",     desc:"C-Suite debate that queries your live portfolio and recommends what to run next" },
            { icon:"📚", label:"Library",        desc:"Every completed initiative becomes searchable institutional memory" },
          ].map(({icon,label,desc})=>(
            <div key={label} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"10px 12px",
              background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6}}>
              <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{icon}</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:t.text,fontFamily:t.serif,marginBottom:2}}>{label}</div>
                <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step) / (STEPS.length - 1)) * 100;

  const handleNext = () => {
    if (isLast) {
      onSave(data, brands);
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:t.surface,border:"1px solid "+t.border,borderRadius:12,width:"100%",maxWidth:480,
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"20px 24px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,fontFamily:t.mono,color:t.gold,letterSpacing:"0.10em",textTransform:"uppercase",marginBottom:6}}>
              Growth OS {step < STEPS.length - 1 ? `· Step ${step+1} of ${STEPS.length - 1}` : "· Ready"}
            </div>
            <div style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.serif,lineHeight:1.2}}>{currentStep.title}</div>
          </div>
          <button onClick={onSkip} style={{background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",
            fontSize:11,fontFamily:t.mono,padding:"2px 6px",borderRadius:3,flexShrink:0,marginTop:2,
            textDecoration:"underline",textUnderlineOffset:3}}>
            Skip all
          </button>
        </div>

        {/* Progress bar */}
        {step < STEPS.length - 1 && (
          <div style={{margin:"14px 24px 0",height:2,background:t.border,borderRadius:1}}>
            <div style={{height:"100%",background:t.gold,borderRadius:1,width:progress+"%",transition:"width 0.3s ease"}}/>
          </div>
        )}

        {/* Subtitle */}
        <div style={{padding:"8px 24px 0",fontSize:12,color:t.textMuted,fontFamily:t.mono,lineHeight:1.6}}>
          {currentStep.subtitle}
        </div>

        {/* Fields */}
        <div style={{padding:"16px 24px 20px"}}>
          {currentStep.fields}
        </div>

        {/* Footer */}
        <div style={{padding:"14px 24px",borderTop:"1px solid "+t.border,display:"flex",justifyContent:"space-between",alignItems:"center",background:t.surfaceAlt}}>
          {step > 0 && step < STEPS.length - 1
            ? <button style={gGh(t)} onClick={()=>setStep(s=>s-1)}>← Back</button>
            : <div/>
          }
          <button style={{...gG(t),fontSize:13,padding:"8px 20px"}} onClick={handleNext}>
            {isLast ? "Start using Growth OS →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [items,     setItems]     = useState([]);
  const [settings,  setSettings]  = useState(DEFAULT_SETTINGS);
  const [dk,        setDk]        = useState(false);
  const [nav,       setNav]       = useState("dashboard");
  const [selId,     setSelId]     = useState(null);
  const [fSt,       setFSt]       = useState("All");
  const [fCat,      setFCat]      = useState("All");
  const [fType,     setFType]     = useState("All");
  const [fOwn,      setFOwn]      = useState("All");
  const [sort,      setSort]      = useState("ice");
  const [form,      setForm]      = useState(null);
  const [rForm,     setRForm]     = useState(null);
  const [showR,     setShowR]     = useState(false);
  const [showSM,    setShowSM]    = useState(false);
  const [pendS,     setPendS]     = useState(null);
  const [confC,     setConfC]     = useState(75);
  const [showTpl,   setShowTpl]   = useState(false);
  const [showSet,   setShowSet]   = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [showMenu,  setShowMenu]  = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureLoad, setCaptureLoad] = useState(false);
  const [activeBrand, setActiveBrand] = useState("all");
  const [aiLoad,    setAiLoad]    = useState(false);
  const [iceLoad,   setIceLoad]   = useState(false);
  const [hypReview, setHypReview] = useState(null);
  const [iceReview, setIceReview] = useState(null);
  const [dataCtx,   setDataCtx]   = useState("");
  const [dRange,    setDRange]    = useState("thisMonth");
  const [cFrom,     setCFrom]     = useState("");
  const [cTo,       setCTo]       = useState("");
  const [loaded,    setLoaded]    = useState(false);
  const [showImport,setShowImport]= useState(false);
  const [importRows,setImportRows]= useState([]);
  const [importErrs,setImportErrs]= useState([]);
  const [importDone,setImportDone]= useState(false);
  const [showCopilot,setShowCopilot]=useState(false);
  const [debates,   setDebates]   = useState([]);
  const [recs,      setRecs]      = useState([]); // [{id, generatedAt, recommendations:[...]}]
  const [recsLoad,  setRecsLoad]  = useState(false);
  const [recsErr,   setRecsErr]   = useState("");
  const [showRecModal, setShowRecModal] = useState(null); // {batchId, recId} or null
  const [weeklyMetrics, setWeeklyMetrics] = useState([]);
  const [showPulse, setShowPulse] = useState(false);
  const [showMetricsImport, setShowMetricsImport] = useState(false);
  const [toast, setToast] = useState(null); // {msg, type:"info"|"error"|"success"}
  const showToast = (msg, type="info") => { setToast({msg,type}); setTimeout(()=>setToast(null), 3500); };

  // Restore confirm modal state
  const [restorePayload, setRestorePayload] = useState(null);

  const t    = dk ? TD : TL;
  const cats   = settings.categories || DEFAULT_SETTINGS.categories;
  const brands = settings.brands || DEFAULT_SETTINGS.brands || CONFIG_BRANDS;

  useEffect(()=>{
    // Theme persisted in memory only (localStorage not available in all environments)
    const load = async ()=>{
      try {
        const [ir,sr,dr,mr,rr] = await Promise.all([store.get(KEY_ITEMS),store.get(KEY_SETTINGS),store.get(KEY_DEBATES),store.get(KEY_METRICS),store.get(KEY_RECS)]);
        setItems(ir&&ir.value?JSON.parse(ir.value):SEED);
        if(!ir||!ir.value) store.set(KEY_ITEMS,JSON.stringify(SEED));
        if(sr&&sr.value) {
          const saved = JSON.parse(sr.value);
          // Backfill brand brief defaults for any brand that's missing them
          if (Array.isArray(saved.brands)) {
            saved.brands = saved.brands.map(applyBrandBriefDefaults);
          }
          setSettings(saved);
        }
        else { setOnboarding(true); }
        if(dr&&dr.value) setDebates(JSON.parse(dr.value));
        if(mr&&mr.value) setWeeklyMetrics(JSON.parse(mr.value));
        if(rr&&rr.value) setRecs(JSON.parse(rr.value));
      } catch { setItems(SEED); }
      setLoaded(true);
    };
    load();
  },[]);

  const saveItems    = d => { setItems(d); try{store.set(KEY_ITEMS,JSON.stringify(d));}catch{} };
  const saveSettings = s => { setSettings(s); try{store.set(KEY_SETTINGS,JSON.stringify(s));}catch{} };
  const saveDebates  = d => { setDebates(d); try{store.set(KEY_DEBATES,JSON.stringify(d));}catch{} };
  const saveMetrics  = m => { setWeeklyMetrics(m); try{store.set(KEY_METRICS,JSON.stringify(m));}catch{} };
  const saveRecs     = r => { setRecs(r);          try{store.set(KEY_RECS,JSON.stringify(r));}catch{} };
  const toggleDk     = ()=> { setDk(n => !n); };

  // -- Next Plays orchestrator -------------------------------------------------
  // Two-step: candidate generation then parallel expansion of the top 3. Keeps
  // the last 10 batches so the user can see history. Partial failures are
  // tolerated — if 1 of 3 expansions fails, ship the 2 that worked.
  const generateRecommendations = async () => {
    setRecsErr("");
    setRecsLoad(true);
    try {
      const portfolioCtx   = buildPortfolioContext(items, settings, brands, activeBrand, weeklyMetrics);
      const learningsIndex = buildLearningsIndex(items, brands);

      const candidates = await callGenerateCandidates(portfolioCtx, learningsIndex, settings, cats);
      if (!candidates || candidates.length === 0) {
        throw new Error("No candidates were generated. Add more learnings or running initiatives for grounding.");
      }

      // Take the first 3 (the generator orders them by quality)
      const top3 = candidates.slice(0, 3);

      // Parallel expansion — tolerate per-item failure
      const settled = await Promise.allSettled(
        top3.map(c => callExpandRecommendation(c, portfolioCtx, learningsIndex, settings))
      );

      const recommendations = settled
        .map((res, i) => {
          if (res.status !== "fulfilled" || !res.value) return null;
          const exp = res.value;
          const cand = top3[i];
          // Validate sourceLearningIds against the actual index — drop hallucinated ones
          const validIds = new Set(learningsIndex.map(l => l.id));
          const cleanIds = (cand.sourceLearningIds || []).filter(id => validIds.has(id));
          return {
            id: "rec-"+Date.now()+"-"+i,
            title: cand.title,
            category: cand.category,
            brandTarget: cand.brandTarget || "Portfolio",
            observation: exp.observation || "",
            hypothesis: exp.hypothesis || "",
            successMetric: exp.successMetric || "",
            primaryMetric: exp.primaryMetric || "",
            killCriteria: exp.killCriteria || "",
            initType: exp.initType || "A/B Test",
            ice: {
              impact:    Math.min(10, Math.max(1, parseInt(exp.impact) || 5)),
              certainty: Math.min(10, Math.max(1, parseInt(exp.certainty) || 5)),
              ease:      5,  // user adjusts; expander doesn't score ease (matches existing ICE Assist behaviour)
            },
            impactRationale:    exp.impactRationale || "",
            certaintyRationale: exp.certaintyRationale || "",
            reasoningTrace:     exp.reasoningTrace || "",
            sourceLearningIds:  cleanIds,
            status: "pending",
            acceptedAsInitId: null,
          };
        })
        .filter(Boolean);

      if (recommendations.length === 0) {
        throw new Error("All candidate expansions failed. Try regenerating.");
      }

      const batch = {
        id: "recbatch-"+Date.now(),
        generatedAt: new Date().toISOString(),
        recommendations,
      };

      // Keep the last 10 batches
      const next = [batch, ...(recs||[])].slice(0, 10);
      saveRecs(next);
      showToast("Generated "+recommendations.length+" next plays.", "success");
    } catch (err) {
      console.error("Next Plays error:", err);
      setRecsErr(err.message || "Generation failed. Try again.");
      showToast("Next Plays generation failed.", "error");
    } finally {
      setRecsLoad(false);
    }
  };

  // Mark a recommendation as accepted and pre-populate a new initiative form.
  // Reuses the same form/nav flow as the Learning Library replicate action.
  const acceptRecommendation = (batchId, recId) => {
    const batch = recs.find(b => b.id === batchId);
    if (!batch) return;
    const rec = batch.recommendations.find(r => r.id === recId);
    if (!rec) return;

    const base = mkDefault(cats, activeBrand);
    // Resolve brand target → brandId if it matches a known brand name
    const matchedBrand = brands.find(b => b.name === rec.brandTarget);
    const brandId = matchedBrand ? matchedBrand.id : base.brandId;

    setForm({
      ...base,
      title: rec.title,
      observation: rec.observation,
      hypothesis: rec.hypothesis,
      successMetric: rec.successMetric,
      primaryMetric: rec.primaryMetric,
      killCriteria: rec.killCriteria,
      category: rec.category || base.category,
      initType: rec.initType || base.initType,
      brandId,
      ice: { ...rec.ice },
      linkedIds: rec.sourceLearningIds || [],
      notes: rec.reasoningTrace
        ? "From Next Plays — reasoning: "+rec.reasoningTrace
        : "From Next Plays",
    });

    // Mark accepted in the rec store
    const updated = recs.map(b => b.id !== batchId ? b : {
      ...b,
      recommendations: b.recommendations.map(r =>
        r.id === recId ? { ...r, status: "accepted", acceptedAsInitId: base.id } : r
      ),
    });
    saveRecs(updated);
    setShowRecModal(null);
    setNav("form");
  };

  const dismissRecommendation = (batchId, recId) => {
    const updated = recs.map(b => b.id !== batchId ? b : {
      ...b,
      recommendations: b.recommendations.map(r =>
        r.id === recId ? { ...r, status: "dismissed" } : r
      ),
    });
    saveRecs(updated);
    setShowRecModal(null);
  };


  // -- JSON backup / restore ---------------------------------------------------
  const handleDownloadBackup = () => {
    const payload = {
      _meta: {
        format: "growth-os-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        company: settings.companyName || "Growth OS",
      },
      items,
      settings,
      debates,
      weeklyMetrics,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const stamp = new Date().toISOString().slice(0,10);
    const slug  = (settings.companyName || "GrowthOS").replace(/\s+/g,"_");
    a.href = url;
    a.download = slug+"_backup_"+stamp+".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || parsed._meta?.format !== "growth-os-backup") {
          showToast("This file doesn't look like a Growth OS backup. Restore cancelled.", "error");
          return;
        }
        const counts = {
          items: Array.isArray(parsed.items) ? parsed.items.length : 0,
          debates: Array.isArray(parsed.debates) ? parsed.debates.length : 0,
          metrics: Array.isArray(parsed.weeklyMetrics) ? parsed.weeklyMetrics.length : 0,
        };
        const stamp = parsed._meta?.exportedAt
          ? new Date(parsed._meta.exportedAt).toLocaleString()
          : "unknown date";
        setRestorePayload({ parsed, counts, stamp });
      } catch (err) {
        showToast("Couldn't read that backup file — it may be corrupted.", "error");
        console.error("Restore error:", err);
      }
    };
    reader.readAsText(file);
  };

  const agents = (settings.agents && settings.agents.length > 0) ? settings.agents : DEFAULT_AGENTS;

  const sel    = useMemo(()=>items.find(e=>e.id===selId),[items,selId]);
  const owners = useMemo(()=>["All",...new Set(items.map(e=>e.owner).filter(Boolean).map(o=>o.split(" (")[0].split("+")[0].trim()))],[items]);

  const bounds = useMemo(()=>{
    const now=new Date();
    if(dRange==="thisMonth") return {from:somM(now),to:eomM(now)};
    if(dRange==="lastMonth"){const lm=new Date(now.getFullYear(),now.getMonth()-1,1);return{from:somM(lm),to:eomM(lm)};}
    if(dRange==="custom"&&cFrom&&cTo) return{from:new Date(cFrom+"T00:00:00"),to:new Date(cTo+"T23:59:59")};
    return null;
  },[dRange,cFrom,cTo]);

  const normBrandId = id => (!id||id==="default") ? (brands[0]&&brands[0].id||"default") : id;
  const brandFilter = item => activeBrand==="all" || normBrandId(item.brandId)===normBrandId(activeBrand);

  const inRange = item=>{
    if(!brandFilter(item)) return false;
    if(!bounds) return true;
    const d=parseD(item.endDate)||parseD(item.createdAt);
    return d&&d>=bounds.from&&d<=bounds.to;
  };

  const dash = useMemo(()=>{
    const ranged    = items.filter(inRange);
    const completed = ranged.filter(e=>e.status==="Completed");
    const killed    = ranged.filter(e=>e.status==="Killed");
    const pipeline  = items.filter(e=>e.status==="Draft"&&brandFilter(e));
    const running   = items.filter(e=>e.status==="Running"&&brandFilter(e));
    const closed    = [...completed,...killed];
    const wins      = closed.filter(e=>e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success"));
    const winRate   = closed.length>0?Math.round((wins.length/closed.length)*100):null;
    const revImpacted   = completed.reduce((s,e)=>s+Math.max(0,e.revenueImpact),0);
    const revAtRisk     = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact),0);
    const closedWithActual = closed.filter(e=>e.results&&typeof e.results.actualRevenueImpact==="number");
    const totalEstimated   = closedWithActual.reduce((s,e)=>s+e.revenueImpact,0);
    const totalActual      = closedWithActual.reduce((s,e)=>s+e.results.actualRevenueImpact,0);
    const calibration      = totalEstimated!==0?Math.round((totalActual/totalEstimated)*100):null;
    const totalEstCost     = items.reduce((s,e)=>s+(e.spendCost||0)+(e.resourceCost||0),0);
    const closedWithActualCost = closed.filter(e=>e.results&&typeof e.results.actualSpendCost==="number");
    const totalActualCost  = closedWithActualCost.reduce((s,e)=>s+(e.results.actualSpendCost||0)+(e.results.actualResourceCost||0),0);
    const closedROI        = (()=>{
      const subset=closed.filter(e=>e.results&&typeof e.results.actualRevenueImpact==="number"&&typeof e.results.actualSpendCost==="number");
      if(!subset.length) return null;
      const rev=subset.reduce((s,e)=>s+(e.results.actualRevenueImpact||0),0);
      const cost=subset.reduce((s,e)=>s+(e.results.actualSpendCost||0)+(e.results.actualResourceCost||0),0);
      return cost>0?Math.round((rev/cost)*100)/100:null;
    })();
    const durs   = completed.filter(e=>e.startDate&&e.endDate).map(e=>Math.round((parseD(e.endDate)-parseD(e.startDate))/86400000));
    const avgDays= durs.length>0?Math.round(durs.reduce((a,b)=>a+b,0)/durs.length):null;
    const catCounts  = {}; cats.forEach(c=>{catCounts[c]=items.filter(e=>e.category===c).length;});
    const typeCounts = {}; INIT_TYPES.forEach(tp=>{typeCounts[tp]=items.filter(e=>e.initType===tp).length;});
    const outCounts  = {}; OUTCOMES.forEach(o=>{outCounts[o]=closed.filter(e=>e.results&&e.results.outcomeClassification===o).length;});
    const iceScores  = items.filter(e=>e.ice).map(e=>iceScore(e.ice.impact,e.ice.certainty,e.ice.ease)).filter(s=>s!==null);
    const avgIce     = iceScores.length>0?Math.round(iceScores.reduce((a,b)=>a+b,0)/iceScores.length):null;
    const now=new Date();
    const weeks=Array.from({length:8},(_,i)=>{const wE=new Date(now);wE.setDate(now.getDate()-7*i);const wS=new Date(wE);wS.setDate(wE.getDate()-6);return{wS,wE};}).reverse();
    const vel={
      started:weeks.map(w=>items.filter(e=>{const d=parseD(e.startDate);return d&&d>=w.wS&&d<=w.wE;}).length),
      closed: weeks.map(w=>items.filter(e=>{const d=parseD(e.endDate);return d&&d>=w.wS&&d<=w.wE&&(e.status==="Completed"||e.status==="Killed");}).length),
    };

    // Contribution to revenue — by category, three layers:
    //   realised  = sum of actualRevenueImpact on Completed items in range (positives only).
    //   inflight  = sum of revenueImpact on Running items × category win rate (probability-adjusted).
    //   pipeline  = sum of revenueImpact on Draft items × category win rate (probability-adjusted).
    // Win rate per category falls back to the portfolio win rate, then to 50% if neither exists.
    // We use the *unscoped* closed history for the win-rate baseline so a narrow date filter doesn't
    // spike the multiplier on a single recent win/loss.
    const allClosedForRate = items.filter(e=>brandFilter(e)&&(e.status==="Completed"||e.status==="Killed"));
    const overallWinRate = allClosedForRate.length>0
      ? allClosedForRate.filter(e=>e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success")).length / allClosedForRate.length
      : 0.5;
    const catWinRate = {};
    cats.forEach(c=>{
      const catClosed = allClosedForRate.filter(e=>e.category===c);
      catWinRate[c] = catClosed.length>=3
        ? catClosed.filter(e=>e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success")).length / catClosed.length
        : overallWinRate;
    });
    const contribution = cats.map(c=>{
      const realised = completed
        .filter(e=>e.category===c&&e.results&&typeof e.results.actualRevenueImpact==="number")
        .reduce((s,e)=>s+Math.max(0,e.results.actualRevenueImpact),0);
      const inflightRaw = running.filter(e=>e.category===c).reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
      const pipelineRaw = pipeline.filter(e=>e.category===c).reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
      const rate = catWinRate[c];
      return {
        category: c,
        realised,
        inflight: Math.round(inflightRaw * rate),
        pipeline: Math.round(pipelineRaw * rate),
        winRate: Math.round(rate * 100),
        usesFallback: allClosedForRate.filter(e=>e.category===c).length < 3,
      };
    }).filter(r=>r.realised>0||r.inflight>0||r.pipeline>0);
    const contributionTotals = contribution.reduce((acc,r)=>({
      realised: acc.realised + r.realised,
      inflight: acc.inflight + r.inflight,
      pipeline: acc.pipeline + r.pipeline,
    }),{realised:0,inflight:0,pipeline:0});

    return {completed:completed.length,killed:killed.length,pipeline:pipeline.length,running:running.length,revImpacted,revAtRisk,totalEstimated,totalActual,calibration,totalEstCost,totalActualCost,closedROI,winRate,wins:wins.length,closed:closed.length,avgDays,catCounts,typeCounts,outCounts,vel,avgIce,contribution,contributionTotals,_runningItems:running};
  },[items,bounds,cats,activeBrand,brands]);

  const filtered = useMemo(()=>{
    let list=items.filter(e=>activeBrand==="all"||normBrandId(e.brandId)===normBrandId(activeBrand));
    if(fSt!=="All")   list=list.filter(e=>e.status===fSt);
    if(fCat!=="All")  list=list.filter(e=>e.category===fCat);
    if(fType!=="All") list=list.filter(e=>e.initType===fType);
    if(fOwn!=="All")  list=list.filter(e=>e.owner&&e.owner.includes(fOwn));
    list.sort((a,b)=>{
      if(sort==="ice"){const sa=iceScore(a.ice&&a.ice.impact,a.ice&&a.ice.certainty,a.ice&&a.ice.ease)||-1,sb=iceScore(b.ice&&b.ice.impact,b.ice&&b.ice.certainty,b.ice&&b.ice.ease)||-1;return sb-sa;}
      if(sort==="endDate"){if(a.status==="Draft"&&b.status==="Draft")return b.revenueImpact-a.revenueImpact;return(a.endDate||"9999")<(b.endDate||"9999")?-1:1;}
      if(sort==="revenue") return b.revenueImpact-a.revenueImpact;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  },[items,fSt,fCat,fType,fOwn,sort,activeBrand,brands]);

  const goDetail = id=>{setSelId(id);setNav("detail");};
  const goNew    = ()=>{ setShowTpl(true); };
  const goEdit   = item=>{setForm({...item});setNav("form");};

  const startFromTemplate = tpl=>{
    const base=mkDefault(cats, activeBrand);
    const defs=tpl?tpl.defaults:{};
    setForm({...base,...defs,initType:tpl?tpl.initType:"A/B Test"});
    setShowTpl(false);setNav("form");
  };

  const handleSave = ()=>{
    if(!form||!form.title) return;
    const {_new,...data}=form;
    if(_new && !data.initId) data.initId = generateInitId(data.brandId||"default", brands, items);
    const updated=_new?[data,...items]:items.map(e=>e.id===data.id?data:e);
    saveItems(updated);setNav(_new?"initiatives":"detail");
    setForm(null);setHypReview(null);setIceReview(null);setDataCtx("");
  };

  const reqStatus = s=>{
    if(s==="Completed"||s==="Killed"){setPendS(s);setConfC(sel&&sel.ice&&sel.ice.certainty?sel.ice.certainty*10:75);setShowSM(true);}
    else saveItems(items.map(e=>e.id===selId?{...e,status:s}:e));
  };

  const applyStatus = (s,conf)=>{
    const updated=items.map(e=>e.id===selId?{...e,status:s}:e);
    saveItems(updated);setShowSM(false);
    const exp=updated.find(e=>e.id===selId);
    if((s==="Completed"||s==="Killed")&&exp&&!exp.results)
      setTimeout(()=>{setRForm({actualOutcome:"",keyLearning:"",outcomeClassification:"Success",decisionMade:"",outcomeCertainty:conf,actualRevenueImpact:""});setShowR(true);},150);
  };

  const saveResults = ()=>{
    if(!rForm||!rForm.keyLearning) return;
    const r={...rForm,
      actualRevenueImpact:rForm.actualRevenueImpact!==""?parseInt(rForm.actualRevenueImpact)||0:null,
      actualSpendCost:rForm.actualSpendCost!==""&&rForm.actualSpendCost!==undefined?parseInt(rForm.actualSpendCost)||0:null,
      actualResourceCost:rForm.actualResourceCost!==""&&rForm.actualResourceCost!==undefined?parseInt(rForm.actualResourceCost)||0:null,
    };
    saveItems(items.map(e=>e.id===selId?{...e,results:r}:e));
    setShowR(false);
  };

  const handleAiExpand = async()=>{
    if(!form||!form.hypothesis||form.hypothesis.length<60) return;
    setAiLoad(true);
    try{const x=await callExpandHypothesis(form.hypothesis,form.title,settings,dataCtx);if(x)setHypReview({proposed:x});}catch{}
    setAiLoad(false);
  };

  const handleIceAssist = async()=>{
    if(!form||!form.hypothesis) return;
    setIceLoad(true);
    try{const x=await callSuggestICE(form,settings,dataCtx);if(x&&x.impact)setIceReview(x);}catch{}
    setIceLoad(false);
  };


  // -- CSV helpers (import + export) ------------------------------------------

  // Column definitions — single source of truth for both export and import
  const CSV_COLS = [
    "initId","title","initType","category","status","brandId","owner",
    "hypothesis","primaryMetric","killCriteria","startDate","endDate",
    "sampleSize","duration","ice_impact","ice_certainty","ice_ease",
    "revenueImpact","spendCost","resourceCost","notes",
    "results_actualOutcome","results_keyLearning","results_outcomeClassification",
    "results_decisionMade","results_outcomeCertainty","results_actualRevenueImpact",
    "results_actualSpendCost","results_actualResourceCost",
  ];

  const itemToCSVRow = (item) => ({
    initId:           item.initId || "",
    title:            item.title || "",
    initType:         item.initType || "",
    category:         item.category || "",
    status:           item.status || "",
    brandId:          brandName(item.brandId || "default", brands),
    owner:            item.owner || "",
    hypothesis:       item.hypothesis || "",
    primaryMetric:    item.primaryMetric || "",
    killCriteria:     item.killCriteria || "",
    startDate:        item.startDate || "",
    endDate:          item.endDate || "",
    sampleSize:       item.sampleSize || "",
    duration:         item.duration || "",
    ice_impact:       item.ice?.impact ?? "",
    ice_certainty:    item.ice?.certainty ?? "",
    ice_ease:         item.ice?.ease ?? "",
    revenueImpact:    item.revenueImpact ?? "",
    spendCost:        item.spendCost ?? "",
    resourceCost:     item.resourceCost ?? "",
    notes:            item.notes || "",
    results_actualOutcome:          item.results?.actualOutcome || "",
    results_keyLearning:            item.results?.keyLearning || "",
    results_outcomeClassification:  item.results?.outcomeClassification || "",
    results_decisionMade:           item.results?.decisionMade || "",
    results_outcomeCertainty:       item.results?.outcomeCertainty ?? "",
    results_actualRevenueImpact:    item.results?.actualRevenueImpact ?? "",
    results_actualSpendCost:        item.results?.actualSpendCost ?? "",
    results_actualResourceCost:     item.results?.actualResourceCost ?? "",
  });

  const escapeCSV = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const downloadCSV = (rows, filename) => {
    const header = CSV_COLS.join(",");
    const body = rows.map(r => CSV_COLS.map(c => escapeCSV(r[c])).join(",")).join("\n");
    const csv = header + "\n" + body;
    const encoded = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement("a"); a.href = encoded; a.download = filename; a.click();
  };

  const handleExportCSV = (rowsToExport, filename) => {
    downloadCSV(rowsToExport.map(itemToCSVRow), filename);
  };

  const TEMPLATE_URL = "https://docs.google.com/spreadsheets/d/1Oar4THeAKIGvvBzKUmqwfWersaUdLqqoq-FW_jBvS1E/edit?gid=896589738#gid=896589738";
  const handleDownloadTemplate = () => { window.open(TEMPLATE_URL, "_blank"); };

  const normaliseDate = (raw) => {
    if (!raw) return "";
    const s = raw.trim();
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // M/D/YYYY or MM/DD/YYYY
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) return slash[3] + "-" + slash[1].padStart(2,"0") + "-" + slash[2].padStart(2,"0");
    // D-M-YYYY
    const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dash) return dash[3] + "-" + dash[2].padStart(2,"0") + "-" + dash[1].padStart(2,"0");
    return "";  // unparseable — drop it and flag
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const splitLine = (line) => {
      const result = []; let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      result.push(cur.trim()); return result;
    };
    const headers = splitLine(lines[0]).map(h => h.replace(/\s*\*\s*$/, "").trim());
    const rows = lines.slice(1).map(l => {
      const vals = splitLine(l);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
      return obj;
    }).filter(r => r.title || r.initId);
    return { headers, rows };
  };

  const handleCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows } = parseCSV(e.target.result);
      const errs = [];
      const parsed = rows.map((r, idx) => {
        const rowErrs = [];
        if (!r.title) rowErrs.push("Missing title");
        if (r.status && !STATUSES.includes(r.status)) rowErrs.push("Unknown status: " + r.status);
        if (r.initType && !INIT_TYPES.includes(r.initType)) rowErrs.push("Unknown type: " + r.initType);

        // Date normalisation
        const sd = normaliseDate(r.startDate);
        const ed = normaliseDate(r.endDate);
        if (r.startDate && !sd) rowErrs.push("Unparseable startDate: " + r.startDate);
        if (r.endDate   && !ed) rowErrs.push("Unparseable endDate: " + r.endDate);

        // initId match — primary key
        const existingById  = r.initId ? items.find(e => e.initId === r.initId.trim()) : null;
        const isUpdate = !!existingById;
        if (isUpdate) rowErrs.push("Will update existing initiative " + r.initId);

        // Brand: match by name (trimmed), fall back to default
        const matchedBrand = brands.find(b => b.name.trim().toLowerCase() === (r.brandId||"").trim().toLowerCase());
        const resolvedBrandId = matchedBrand ? matchedBrand.id : (existingById?.brandId || "default");

        if (rowErrs.length) errs.push({ row: idx + 2, title: r.title || r.initId || "(no title)", issues: rowErrs, isUpdate });

        const clamp = (v, lo, hi) => { const n = parseInt(v); return isNaN(n) ? lo : Math.min(hi, Math.max(lo, n)); };
        const numOrNull = (v) => (v !== "" && v !== undefined && v !== null) ? (parseInt(v) || 0) : null;

        const item = {
          // Preserve existing id/initId on update, generate fresh on create
          id:     existingById ? existingById.id     : "csv-" + Date.now() + "-" + idx,
          initId: existingById ? existingById.initId : (r.initId?.trim() || generateInitId(resolvedBrandId, brands, items)),
          title:  r.title || existingById?.title || "",
          initType: INIT_TYPES.includes(r.initType) ? r.initType : (existingById?.initType || "A/B Test"),
          category: r.category || existingById?.category || cats[0] || "",
          status:   STATUSES.includes(r.status)   ? r.status   : (existingById?.status   || "Draft"),
          brandId:  resolvedBrandId,
          owner:    r.owner    !== undefined ? r.owner    : (existingById?.owner    || ""),
          hypothesis:    r.hypothesis    || existingById?.hypothesis    || "",
          primaryMetric: r.primaryMetric || existingById?.primaryMetric || "",
          killCriteria:  r.killCriteria  || existingById?.killCriteria  || "",
          startDate: sd || existingById?.startDate || "",
          endDate:   ed || existingById?.endDate   || "",
          sampleSize: r.sampleSize || existingById?.sampleSize || "",
          duration:   r.duration   || existingById?.duration   || "",
          ice: {
            impact:    clamp(r.ice_impact,    1, 10) || existingById?.ice?.impact    || 5,
            certainty: clamp(r.ice_certainty, 1, 10) || existingById?.ice?.certainty || 5,
            ease:      clamp(r.ice_ease,      1, 10) || existingById?.ice?.ease      || 5,
          },
          revenueImpact: r.revenueImpact !== "" ? (parseInt(r.revenueImpact) || 0) : (existingById?.revenueImpact || 0),
          spendCost:     r.spendCost     !== "" ? (parseInt(r.spendCost)     || 0) : (existingById?.spendCost     || 0),
          resourceCost:  r.resourceCost  !== "" ? (parseInt(r.resourceCost)  || 0) : (existingById?.resourceCost  || 0),
          notes: r.notes || existingById?.notes || "",
          linkedIds: existingById?.linkedIds || [],
          createdAt: existingById?.createdAt || new Date().toISOString().slice(0, 10),
          testValidity: existingById?.testValidity || null,
          results: r.results_keyLearning ? {
            actualOutcome: r.results_actualOutcome || "",
            keyLearning:   r.results_keyLearning,
            outcomeClassification: ["Jackpot","Success","Failed","Inconclusive"].includes(r.results_outcomeClassification)
              ? r.results_outcomeClassification : "Inconclusive",
            decisionMade: r.results_decisionMade || "",
            outcomeCertainty: parseInt(r.results_outcomeCertainty) || 75,
            actualRevenueImpact: numOrNull(r.results_actualRevenueImpact),
            actualSpendCost:     numOrNull(r.results_actualSpendCost),
            actualResourceCost:  numOrNull(r.results_actualResourceCost),
          } : (existingById?.results || null),
          _fromCSV: true,
          _isUpdate: isUpdate,
        };
        return item;
      });
      setImportRows(parsed);
      setImportErrs(errs);
      setImportDone(false);
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    let updated = [...items];
    importRows.forEach(row => {
      if (row._isUpdate) {
        updated = updated.map(e => e.id === row.id ? { ...row } : e);
      } else {
        updated = [row, ...updated];
      }
    });
    saveItems(updated);
    setImportDone(true);
    setTimeout(() => { setShowImport(false); setImportRows([]); setImportErrs([]); setImportDone(false); }, 1800);
  };

  if(!loaded) return <div style={{background:t.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:t.textMuted,fontFamily:t.mono}}>Loading Growth OS…</span></div>;

  const navBtn=(v,lbl)=>(
    <button key={v} onClick={()=>setNav(v)} style={{fontSize:13,fontWeight:nav===v?600:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",fontFamily:t.sans,background:nav===v?t.surface:"transparent",border:"none",color:nav===v?t.text:t.textSub,boxShadow:nav===v?t.shadow:"none",transition:"all .15s"}}>{lbl}</button>
  );

  return (
    <div style={{background:t.bg,minHeight:"100vh",fontFamily:t.serif,color:t.text}}>
      <style>{"@import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css');*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}input[type=range]{accent-color:"+t.gold+"}@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}"}</style>

      {/* Onboarding — first run only */}
      {onboarding&&(
        <OnboardingModal
          t={t} dk={dk} settings={settings}
          onSave={(data,obBrands)=>{
            const mergedBrands = (settings.brands||[]).map(b=>{
              const ob = (obBrands||[]).find(ob=>ob.id===b.id);
              return ob ? {...b,...ob} : b;
            });
            saveSettings({...settings,...data,brands:mergedBrands});
            setOnboarding(false);
          }}
          onSkip={()=>{
            saveSettings(settings);
            setOnboarding(false);
          }}
        />
      )}

      {/* Toast notifications */}
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:9999,
          background:toast.type==="error"?(dk?"#3a1a1a":"#fff0f0"):toast.type==="success"?(dk?"#1a2a1a":"#f0faf2"):(dk?"#1a1a2a":"#f0f4ff"),
          border:"1px solid "+(toast.type==="error"?(dk?"#7a3030":"#e09090"):toast.type==="success"?(dk?"#2a6a40":"#7adca0"):(dk?"#3a4a7a":"#a0b4e0")),
          color:toast.type==="error"?(dk?"#f08080":"#a03030"):toast.type==="success"?(dk?"#60d080":"#1a7a48"):(dk?"#a0b4f0":"#2a3a8a"),
          borderRadius:8,padding:"10px 18px",fontSize:13,fontFamily:t.mono,fontWeight:600,
          boxShadow:"0 4px 20px rgba(0,0,0,0.15)",animation:"slideIn 0.2s ease",whiteSpace:"nowrap",
          maxWidth:"90vw",textOverflow:"ellipsis",overflow:"hidden"}}>
          {toast.type==="error"?"⚠ ":toast.type==="success"?"✓ ":"ℹ "}{toast.msg}
        </div>
      )}

      {/* Restore backup confirm modal */}
      {restorePayload&&(
        <Modal t={t} dk={dk} onClose={()=>setRestorePayload(null)} title="Restore from backup?">
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{padding:"10px 14px",background:dk?"#2a1a1a":"#fff8f0",border:"1px solid "+(dk?"#7a3030":"#e0a060"),borderRadius:6}}>
              <div style={{fontSize:12,fontWeight:700,color:dk?"#e08060":"#a04010",fontFamily:t.mono,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>⚠ This will overwrite your current data</div>
              <div style={{fontSize:12,color:t.textSub,fontFamily:t.mono,lineHeight:1.8}}>
                <div>Exported: <strong style={{color:t.text}}>{restorePayload.stamp}</strong></div>
                <div>Initiatives: <strong style={{color:t.text}}>{restorePayload.counts.items}</strong></div>
                <div>Debates: <strong style={{color:t.text}}>{restorePayload.counts.debates}</strong></div>
                <div>Weekly metrics: <strong style={{color:t.text}}>{restorePayload.counts.metrics}</strong></div>
              </div>
            </div>
            <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>Your current initiatives, settings, and metrics will be replaced. This cannot be undone.</div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button style={gGh(t)} onClick={()=>setRestorePayload(null)}>Cancel</button>
              <button style={{...gG(t),background:"#c03030",border:"none"}} onClick={()=>{
                const {parsed} = restorePayload;
                if (Array.isArray(parsed.items))         saveItems(parsed.items);
                if (parsed.settings)                     saveSettings(parsed.settings);
                if (Array.isArray(parsed.debates))       saveDebates(parsed.debates);
                if (Array.isArray(parsed.weeklyMetrics)) saveMetrics(parsed.weeklyMetrics);
                setRestorePayload(null);
                showToast("Backup restored successfully.", "success");
              }}>Restore backup</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Header — single bar */}
      <div style={{background:t.headerBg,borderBottom:"1px solid "+t.border,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,padding:"10px 16px",flexWrap:"wrap"}}>
          {/* Left: logo lockup (home) + tabs */}
          <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
            <button onClick={()=>setNav("dashboard")} title="Back to Dashboard"
              style={{display:"flex",alignItems:"center",gap:9,padding:"5px 9px",borderRadius:10,cursor:"pointer",
                background:"transparent",border:"1px solid transparent",transition:"background .15s, border-color .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=t.goldBg;e.currentTarget.style.borderColor=t.goldBorder;}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
              <span style={{width:26,height:26,borderRadius:8,background:t.gold,color:t.goldText,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,fontFamily:t.mono,letterSpacing:"-0.02em",flexShrink:0}}>GO</span>
              <span style={{display:"flex",flexDirection:"column",alignItems:"flex-start",lineHeight:1.15}}>
                <span style={{fontSize:14,fontWeight:700,letterSpacing:"0.06em",color:t.text,fontFamily:t.sans,whiteSpace:"nowrap"}}>GROWTH OS</span>
                <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.02em",whiteSpace:"nowrap"}}>{settings.companyName}</span>
              </span>
            </button>
            <div style={{width:1,height:24,background:t.border}}/>
            <div style={{display:"flex",gap:2,background:t.surfaceAlt,padding:3,borderRadius:10,border:"1px solid "+t.border}}>
              {navBtn("dashboard","Dashboard")}
              {navBtn("initiatives","Initiatives")}
              {navBtn("library","Library")}
              {navBtn("triage","Triage")}
            </div>
            {(nav==="detail"||nav==="form")&&(
              <button onClick={()=>setNav("initiatives")} style={{...gGh(t),padding:"6px 12px",fontSize:12}}>
                <span style={{fontSize:12}}>&#8592;</span> Back
              </button>
            )}
          </div>

          {/* Right: retailer + contextual actions + utilities */}
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {brands.length>1&&(
              <select value={activeBrand} onChange={e=>setActiveBrand(e.target.value)}
                style={{fontSize:12,padding:"6px 11px",borderRadius:9,border:"1px solid "+(activeBrand==="all"?t.border:t.goldBorder),background:activeBrand==="all"?t.surfaceAlt:t.goldBg,color:activeBrand==="all"?t.textSub:t.gold,fontFamily:t.mono,cursor:"pointer",maxWidth:150}}>
                <option value="all">All retailers</option>
                {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {nav==="initiatives"&&(<>
              <button onClick={()=>setShowCapture(true)} style={{...gGh(t),padding:"6px 11px",fontSize:11.5}}>
                &#9889; Quick capture
              </button>
              <button onClick={()=>{setImportRows([]);setImportErrs([]);setImportDone(false);setShowImport(true);}} style={{...gGh(t),padding:"6px 11px",fontSize:11.5}}>
                &#8645; Import CSV
              </button>
              <button onClick={()=>handleExportCSV(filtered,"GrowthOS_export_"+new Date().toISOString().slice(0,10)+".csv")} style={{...gGh(t),padding:"6px 11px",fontSize:11.5}} title="Export current filtered view as CSV">
                &#8659; Export CSV
              </button>
              <button onClick={goNew} style={{...gG(t),padding:"6px 12px",fontSize:12.5}}>
                + New
              </button>
            </>)}
            <button onClick={()=>setShowCopilot(true)}
              style={{fontSize:12.5,padding:"7px 14px",borderRadius:9,cursor:"pointer",
                background:t.gold,border:"1px solid "+t.gold,color:t.goldText,fontWeight:600,fontFamily:t.sans,
                display:"flex",alignItems:"center",gap:5,boxShadow:t.shadow}}>
              ✦ Signal
            </button>
            <button onClick={()=>setShowSet(true)} title="Settings"
              style={{width:32,height:32,borderRadius:9,cursor:"pointer",background:t.surfaceAlt,border:"1px solid "+t.border,color:t.textSub,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
              <span dangerouslySetInnerHTML={{__html:"&#9881;"}}/>
            </button>
            <button onClick={toggleDk} title={dk?"Light mode":"Dark mode"}
              style={{width:32,height:32,borderRadius:9,cursor:"pointer",background:t.surfaceAlt,border:"1px solid "+t.border,color:t.textSub,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
              <span dangerouslySetInnerHTML={{__html:dk?"&#9728;":"&#9790;"}}/>
            </button>
          </div>
        </div>
      </div>

      {nav==="dashboard"&&<DashView t={t} dk={dk} dash={dash} cats={cats} settings={settings} brands={brands} activeBrand={activeBrand} weeklyMetrics={weeklyMetrics} onLog={()=>setShowPulse(true)} onImport={()=>setShowMetricsImport(true)} dRange={dRange} setDRange={setDRange} cFrom={cFrom} cTo={cTo} setCFrom={setCFrom} setCTo={setCTo} onGo={()=>setNav("initiatives")} recs={recs} recsLoad={recsLoad} recsErr={recsErr} items={items} onGenerateRecs={generateRecommendations} onOpenRec={(batchId,recId)=>setShowRecModal({batchId,recId})}/>}
      {nav==="triage"&&<TriageView items={items} t={t} dk={dk} cats={cats} brands={brands} activeBrand={activeBrand} onDetail={goDetail}/>}
      {nav==="library"&&<LearningLibrary items={items} t={t} dk={dk} cats={cats} brands={brands} activeBrand={activeBrand} settings={settings} onReplicate={(item)=>{const base=mkDefault(cats,activeBrand);setForm({...base,title:"[Replicate] "+item.title,hypothesis:"Based on learning from: "+item.title+". Original: "+item.hypothesis,category:item.category,initType:item.initType,ice:{...item.ice},revenueImpact:item.revenueImpact,notes:"Replicated from initiative "+item.id+". Original learning: "+item.results.keyLearning});setNav("form");}}/>}

      {nav==="initiatives"&&(
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {["All",...STATUSES].map(s=>(
                <button key={s} onClick={()=>setFSt(s)} style={{fontSize:12,padding:"4px 10px",borderRadius:4,cursor:"pointer",fontFamily:t.mono,background:fSt===s?t.gold:"transparent",border:"1px solid "+(fSt===s?t.gold:t.border),color:fSt===s?t.goldText:t.textMuted}}>{s}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Category</label>
                <select value={fCat} onChange={e=>setFCat(e.target.value)} style={{...gSl(t),minWidth:130}}>{["All",...cats].map(c=><option key={c}>{c}</option>)}</select>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Type</label>
                <select value={fType} onChange={e=>setFType(e.target.value)} style={{...gSl(t),minWidth:120}}>{["All",...INIT_TYPES].map(tp=><option key={tp}>{tp}</option>)}</select>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Owner</label>
                <select value={fOwn} onChange={e=>setFOwn(e.target.value)} style={{...gSl(t),minWidth:120}}>{owners.map(o=><option key={o}>{o}</option>)}</select>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Sort by</label>
                <select value={sort} onChange={e=>setSort(e.target.value)} style={{...gSl(t),minWidth:110}}>
                  <option value="ice">Highest ICE Score</option>
                  <option value="revenue">Highest Rev at Risk</option>
                  <option value="endDate">End date</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {filtered.length===0&&(
              items.filter(e=>activeBrand==="all"||normBrandId(e.brandId)===normBrandId(activeBrand)).length===0 ? (
                <div style={{...gCd(t,dk),padding:"44px 24px",textAlign:"center"}}>
                  <div style={{fontSize:28,marginBottom:10,opacity:.5}}>&#9670;</div>
                  <div style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.sans,marginBottom:6}}>No initiatives yet</div>
                  <div style={{fontSize:13,color:t.textSub,fontFamily:t.sans,lineHeight:1.55,maxWidth:380,margin:"0 auto 16px"}}>Start your growth portfolio — add an initiative, capture a quick idea, or generate a slate from Signal.</div>
                  <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                    <button onClick={goNew} style={{...gG(t),fontSize:12.5,padding:"8px 16px"}}>+ New initiative</button>
                    <button onClick={()=>setShowCapture(true)} style={{...gGh(t),fontSize:12.5,padding:"8px 14px"}}>&#9889; Quick capture</button>
                  </div>
                </div>
              ) : (
                <div style={{...gCd(t,dk),padding:"40px 24px",textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:600,color:t.text,fontFamily:t.sans,marginBottom:5}}>No initiatives match your filters</div>
                  <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,marginBottom:14}}>Try widening the status, category, type, or owner filters.</div>
                  <button onClick={()=>{setFSt("All");setFCat("All");setFType("All");setFOwn("All");}} style={{...gGh(t),fontSize:12.5,padding:"7px 14px",margin:"0 auto",display:"inline-flex"}}>Clear all filters</button>
                </div>
              )
            )}
            {filtered.map(item=>(
              <div key={item.id} onClick={()=>goDetail(item.id)} style={{...gCd(t,dk),cursor:"pointer",padding:"14px 16px",transition:"border-color .15s, box-shadow .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=t.goldBorder;e.currentTarget.style.boxShadow=t.shadowHi;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.boxShadow=t.shadow;}}>
                {/* Row 1: title (lead) + ICE/revenue anchors */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:"1 1 auto",minWidth:0}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:7,marginBottom:item.hypothesis?3:0}}>
                      {item.initId&&<span style={{fontSize:10,fontWeight:600,color:t.textMuted,fontFamily:t.mono,flexShrink:0}}>{item.initId}</span>}
                      <span style={{fontSize:14.5,fontWeight:600,color:t.text,lineHeight:1.3,fontFamily:t.sans,textAlign:"left"}}>{item.title}</span>
                      <SBdg s={item.status} dk={dk}/>
                    </div>
                    {item.hypothesis&&<div style={{fontSize:12.5,color:t.textSub,lineHeight:1.5,fontFamily:t.sans,textAlign:"left"}}>{item.hypothesis.slice(0,128)}{item.hypothesis.length>128?"…":""}</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                    {item.revenueImpact!==0&&<span style={{fontSize:18,fontWeight:700,color:t.gold,fontFamily:t.mono,letterSpacing:"-0.02em",lineHeight:1}}>{fmtCur(item.revenueImpact)}</span>}
                    <ICEChip ice={item.ice} t={t}/>
                  </div>
                </div>
                {/* Row 2: quiet metadata strip */}
                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginTop:10,paddingTop:9,borderTop:"1px solid "+t.borderSoft}}>
                  <CBdg cat={item.category} cats={cats} dk={dk}/>
                  <TBdg type={item.initType} dk={dk}/>
                  {brands&&brands.length>1&&activeBrand==="all"&&<Bdg label={brandName(item.brandId||"default",brands)} color={brandColor(item.brandId||"default",brands,dk)} bg={t.surfaceAlt} border={t.border} small/>}
                  {item.results&&<OBdg o={item.results.outcomeClassification} dk={dk}/>}
                  <EAlert endDate={item.endDate} status={item.status} t={t} dk={dk}/>
                  <BlockerBadge blocker={item.blocker}/>
                  <span style={{marginLeft:"auto",display:"flex",gap:13,alignItems:"center",fontSize:11,color:t.textMuted,fontFamily:t.mono,flexWrap:"wrap"}}>
                    {item.results&&typeof item.results.actualRevenueImpact==="number"&&<span>actual {fmtCur(item.results.actualRevenueImpact)}</span>}
                    {item.status!=="Draft"&&item.endDate&&<span>end {fmtDate(item.endDate)}</span>}
                    {item.linkedIds&&item.linkedIds.length>0&&<span>{item.linkedIds.length} linked</span>}
                    {item.owner&&<span>{item.owner.split(" (")[0].split("+")[0].trim()}</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {nav==="detail"&&sel&&(
        <DetailView item={sel} items={items} t={t} dk={dk} cats={cats}
          onEdit={()=>goEdit(sel)}
          onDelete={()=>{saveItems(items.filter(e=>e.id!==sel.id));setNav("initiatives");}}
          onStatus={reqStatus}
          onResults={()=>{setRForm(sel.results?{...sel.results,actualRevenueImpact:sel.results.actualRevenueImpact!=null?sel.results.actualRevenueImpact:"",actualSpendCost:sel.results.actualSpendCost!=null?sel.results.actualSpendCost:"",actualResourceCost:sel.results.actualResourceCost!=null?sel.results.actualResourceCost:""}:{actualOutcome:"",keyLearning:"",outcomeClassification:"Success",decisionMade:"",outcomeCertainty:75,actualRevenueImpact:"",actualSpendCost:"",actualResourceCost:""});setShowR(true);}}
          onLink={goDetail}
          onSaveTestValidity={tv=>{saveItems(items.map(e=>e.id===sel.id?{...e,testValidity:tv}:e));}}/>
      )}

      {nav==="form"&&form&&(
        <FormView form={form} setForm={setForm} items={items} t={t} dk={dk} cats={cats} brands={brands}
          aiLoad={aiLoad} iceLoad={iceLoad} hypReview={hypReview} iceReview={iceReview}
          dataCtx={dataCtx} setDataCtx={setDataCtx}
          onAi={handleAiExpand} onIceAssist={handleIceAssist}
          onAcceptHyp={()=>{if(hypReview){setForm(p=>({...p,hypothesis:hypReview.proposed}));setHypReview(null);}}}
          onRejectHyp={()=>setHypReview(null)}
          onAcceptIce={()=>{if(iceReview){setForm(p=>({...p,ice:{...p.ice,impact:iceReview.impact,certainty:iceReview.certainty}}));setIceReview(null);}}}
          onRejectIce={()=>setIceReview(null)}
          onSave={handleSave}
          onCancel={()=>{setForm(null);setHypReview(null);setIceReview(null);setDataCtx("");setNav("initiatives");}}/>
      )}

      {showCapture&&(
        <Modal t={t} dk={dk} onClose={()=>{setShowCapture(false);setCaptureText("");}} title="Quick capture">
          <p style={{fontSize:13,color:t.textSub,fontFamily:t.mono,marginBottom:14,lineHeight:1.6}}>
            Describe the initiative in plain language — one sentence or a few. AI will pre-fill the form. You review and adjust before saving.
          </p>
          <FR label="What do you want to test or change?" t={t}>
            <textarea style={{...gTA(t),fontSize:13}} rows={4} value={captureText} onChange={e=>setCaptureText(e.target.value)}
              placeholder={"e.g. We should test removing the discount banner on the homepage for new visitors — I think it's training customers to wait for deals rather than buying at full price. Primary metric would be full-price order rate."}/>
          </FR>
          {captureText.length>0&&captureText.length<30&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginTop:4}}>{30-captureText.length} more chars to enable AI</div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
            <button style={gGh(t)} onClick={()=>{setShowCapture(false);setCaptureText("");}}>Cancel</button>
            <button style={{...gG(t),opacity:captureText.length>=30?1:0.4}} disabled={captureText.length<30||captureLoad}
              onClick={async()=>{
                setCaptureLoad(true);
                try {
                  const result = await callQuickCapture(captureText, settings, cats, INIT_TYPES);
                  if (result && result.title) {
                    const base = mkDefault(cats, activeBrand);
                    setForm({...base, ...result});
                    setShowCapture(false);
                    setCaptureText("");
                    setNav("form");
                  }
                } catch(e){ showToast("AI extraction failed — try adding more detail.", "error"); }
                setCaptureLoad(false);
              }}>
              {captureLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Extracting…</>:<><span>&#9889;</span> Extract with AI</>}
            </button>
          </div>
        </Modal>
      )}
      {showTpl&&(
        <Modal t={t} dk={dk} onClose={()=>setShowTpl(false)} wide title="Start from a template">
          <p style={{fontSize:13,color:t.textSub,marginBottom:16,fontFamily:t.mono}}>Pick a template to pre-fill the form, or start blank.</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {TEMPLATES.map(tpl=>(
              <div key={tpl.id} onClick={()=>startFromTemplate(tpl)} style={{...gCd(t,dk),cursor:"pointer",display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{fontSize:20,color:t.gold,marginTop:1}}><span style={{fontSize:18}}>&#9670;</span></div>
                <div>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                    <span style={{fontSize:13,fontWeight:700,color:t.text}}>{tpl.label}</span>
                    <TBdg type={tpl.initType} dk={dk}/>
                  </div>
                  <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{tpl.description}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={()=>startFromTemplate(null)} style={{...gGh(t),width:"100%",justifyContent:"center"}}>Start blank</button>
        </Modal>
      )}

      {showSet&&<SettingsModal t={t} dk={dk} settings={settings} onSave={s=>{saveSettings(s);setShowSet(false);}} onClose={()=>setShowSet(false)} onDownloadBackup={handleDownloadBackup} onRestoreBackup={handleRestoreBackup}/>}

      {showImport&&(
        <Modal t={t} dk={dk} onClose={()=>{setShowImport(false);setImportRows([]);setImportErrs([]);setImportDone(false);}} wide title="Import CSV">
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {importDone?(
              <div style={{textAlign:"center",padding:"24px 0"}}>
                <div style={{fontSize:28,marginBottom:8}}>&#10003;</div>
                <div style={{fontSize:15,fontWeight:700,color:t.text,fontFamily:t.serif,marginBottom:4}}>{importRows.length} initiative{importRows.length!==1?"s":""} imported</div>
                <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>Closing…</div>
              </div>
            ) : importRows.length === 0 ? (
              <>
                <p style={{fontSize:13,color:t.textSub,fontFamily:t.mono,lineHeight:1.6,marginBottom:4}}>
                  Upload a CSV exported from the Growth OS Import Template. Column headers must match the template exactly.
                </p>
                <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:"28px 20px",border:"2px dashed "+t.border,borderRadius:8,cursor:"pointer",background:t.surfaceAlt}}
                  onDragOver={e=>{e.preventDefault();e.stopPropagation();}}
                  onDrop={e=>{e.preventDefault();e.stopPropagation();const f=e.dataTransfer.files[0];if(f)handleCSVFile(f);}}>
                  <span style={{fontSize:28}}>&#128196;</span>
                  <span style={{fontSize:13,fontWeight:700,color:t.text,fontFamily:t.mono}}>Click to choose a CSV file</span>
                  <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>or drag and drop here</span>
                  <input type="file" accept=".csv" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleCSVFile(e.target.files[0]);}}/>
                </label>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,padding:"10px 12px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6}}>
                  <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5}}>
                    First time? Download the CSV template — correct headers, one example row.
                  </span>
                  <button style={{...gG(t),fontSize:11,padding:"4px 11px",flexShrink:0}} onClick={handleDownloadTemplate}>
                    &#8599; Open template in Google Sheets
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{padding:"10px 14px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",gap:16,flexWrap:"wrap"}}>
                  <div><span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>Rows parsed: </span><strong style={{color:t.text,fontFamily:t.mono}}>{importRows.length}</strong></div>
                  <div><span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>New: </span><strong style={{color:dk?"#60d080":"#1a7a48",fontFamily:t.mono}}>{importRows.filter(r=>!r._isUpdate).length}</strong></div>
                  <div><span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>Updates: </span><strong style={{color:dk?"#d0a838":"#8a6010",fontFamily:t.mono}}>{importRows.filter(r=>r._isUpdate).length}</strong></div>
                  {importErrs.length>0&&<div><span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>Warnings: </span><strong style={{color:dk?"#e08080":"#a03030",fontFamily:t.mono}}>{importErrs.length}</strong></div>}
                </div>
                {importErrs.length>0&&(
                  <div style={{maxHeight:120,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                    {importErrs.map((e,i)=>(
                      <div key={i} style={{fontSize:11,fontFamily:t.mono,padding:"5px 10px",background:dk?"#2a1212":"#fdf0f0",border:"1px solid "+(dk?"#6a2828":"#e09090"),borderRadius:4,color:dk?"#e08080":"#a03030"}}>
                        Row {e.row} — <strong>{e.title}</strong>: {e.issues.join("; ")}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                  {importRows.map((row,i)=>{
                    const sc=(dk?SD:SL)[row.status]||SL.Draft;
                    return(
                      <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"7px 10px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:5}}>
                        <span style={{fontSize:10,padding:"2px 7px",borderRadius:3,background:sc.bg,border:"1px solid "+sc.border,color:sc.text,fontFamily:t.mono,fontWeight:600,flexShrink:0}}>{row.status}</span>
                        {row._isUpdate&&<span style={{fontSize:10,color:dk?"#d0a838":"#8a6010",fontFamily:t.mono,flexShrink:0}}>update</span>}
                        <span style={{fontSize:12,color:t.text,fontFamily:t.mono,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.title}</span>
                        <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,flexShrink:0}}>{row.category}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",paddingTop:4}}>
                  <button style={gGh(t)} onClick={()=>{setImportRows([]);setImportErrs([]);}}>&#8592; Re-upload</button>
                  <button style={gG(t)} onClick={confirmImport}>
                    Import {importRows.length} initiative{importRows.length!==1?"s":""}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {showSM&&(
        <Modal t={t} dk={dk} onClose={()=>{setShowSM(false);setPendS(null);}} title={"Mark as "+pendS}>
          <p style={{fontSize:13,color:t.textSub,marginBottom:16,fontFamily:t.mono}}>Confirm outcome certainty before closing — how confident are you in the result based on data collected?</p>
          <FR label={"Outcome certainty: "+confC+"%"} t={t}>
            <input type="range" min={0} max={100} step={5} value={confC} onChange={e=>setConfC(parseInt(e.target.value))} style={{width:"100%",marginTop:4}}/>
            <CBar pct={confC} t={t}/>
          </FR>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:18}}>
            <button style={gGh(t)} onClick={()=>{setShowSM(false);setPendS(null);}}>Cancel</button>
            <button onClick={()=>applyStatus(pendS,confC)} style={{...gG(t),background:pendS==="Killed"?"#c03030":t.gold,border:"none"}}>Mark as {pendS}</button>
          </div>
        </Modal>
      )}

      {showR&&rForm&&(
        <Modal t={t} dk={dk} onClose={()=>setShowR(false)} wide title="Log results">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <FR label="Actual outcome vs hypothesis" t={t}><textarea style={gTA(t)} rows={3} value={rForm.actualOutcome} onChange={e=>setRForm({...rForm,actualOutcome:e.target.value})}/></FR>
            <FR label="Key learning — one sentence (required)" t={t}><input style={gI(t)} value={rForm.keyLearning} onChange={e=>setRForm({...rForm,keyLearning:e.target.value})}/></FR>
            <FR label="Outcome classification" t={t}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {OUTCOMES.map(o=>{const c=(dk?OD:OL)[o]||{},act=rForm.outcomeClassification===o;return(
                  <button key={o} onClick={()=>setRForm({...rForm,outcomeClassification:o})} style={{fontSize:12,padding:"5px 11px",borderRadius:4,cursor:"pointer",fontWeight:600,background:act?c.bg:(dk?"#1a1a14":"#f5f5f0"),border:"1px solid "+(act?c.border:t.border),color:act?c.text:t.textMuted}}>{o}</button>
                );})}
              </div>
            </FR>
            <FR label="Decision made" t={t}><textarea style={gTA(t)} rows={2} value={rForm.decisionMade} onChange={e=>setRForm({...rForm,decisionMade:e.target.value})}/></FR>
            <FR label="Actual revenue impact ($) — leave blank if not measurable" t={t}><input style={gI(t)} type="number" value={rForm.actualRevenueImpact} placeholder="e.g. 42000 or -15000" onChange={e=>setRForm({...rForm,actualRevenueImpact:e.target.value})}/></FR>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <FR label="Actual media / spend cost ($)" t={t}><input style={gI(t)} type="number" value={rForm.actualSpendCost||""} placeholder="leave blank if unchanged" onChange={e=>setRForm({...rForm,actualSpendCost:e.target.value})}/></FR>
              <FR label="Actual resource cost ($)" t={t}><input style={gI(t)} type="number" value={rForm.actualResourceCost||""} placeholder="leave blank if unchanged" onChange={e=>setRForm({...rForm,actualResourceCost:e.target.value})}/></FR>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end"}}><button style={gG(t)} onClick={saveResults} disabled={!rForm.keyLearning}>Save results</button></div>
          </div>
        </Modal>
      )}

      {showCopilot&&(
        <CopilotPanel
          t={t} dk={dk}
          settings={settings}
          cats={cats}
          brands={brands}
          items={items}
          activeBrand={activeBrand}
          agents={agents}
          debates={debates}
          weeklyMetrics={weeklyMetrics}
          onSaveDebate={debate => saveDebates([debate, ...debates].slice(0,20))}
          onAddToBacklog={(initiative) => {
            const base = mkDefault(cats, activeBrand);
            const newItem = {
              ...base,
              ...initiative,
              _new: undefined,
              id: "cop-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
              initId: generateInitId(base.brandId, brands, items),
              status: "Draft",
              createdAt: new Date().toISOString().slice(0,10),
              blocker: "None",
              results: null,
              linkedIds: [],
            };
            saveItems([newItem, ...items]);
          }}
          onClose={() => setShowCopilot(false)}
        />
      )}
      {showRecModal && (
        <NextPlaysModal
          t={t} dk={dk}
          batchId={showRecModal.batchId}
          recId={showRecModal.recId}
          recs={recs}
          items={items}
          brands={brands}
          onAccept={acceptRecommendation}
          onDismiss={dismissRecommendation}
          onClose={()=>setShowRecModal(null)}
        />
      )}
      {showPulse&&(
        <MetricsLogModal
          t={t} dk={dk}
          settings={settings}
          brands={brands}
          weeklyMetrics={weeklyMetrics}
          onSave={saveMetrics}
          onClose={()=>setShowPulse(false)}
        />
      )}
      {showMetricsImport&&(
        <MetricsImportModal
          t={t} dk={dk}
          weeklyMetrics={weeklyMetrics}
          onSave={saveMetrics}
          onClose={()=>setShowMetricsImport(false)}
        />
      )}
    </div>
  );
}

// -- Agentic Debate Panel v2 ---------------------------------------------------
const MAX_TURNS = 8;
const TOOL_LABEL = {
  get_portfolio_summary:     "📋 reading portfolio summary",
  get_running_initiatives:   "🏃 checking running initiatives",
  get_category_coverage:     "🗺️ analysing category coverage",
  get_win_rate_by_category:  "📈 pulling win rates by category",
  get_top_draft_opportunities:"💡 scanning draft pipeline",
  get_failure_patterns:      "❌ reviewing failure patterns",
  get_blocked_initiatives:   "⚠️ checking blocked initiatives",
  get_revenue_gap_analysis:  "💰 running revenue gap analysis",
};

function IdeaCard({idea, idx, results, setResults, added, onAdd, t, dk, cats, agents}) {
  const [isEditing, setEditing] = useState(false);
  const iceS = ice => ice ? Math.round(((ice.impact||0)*(ice.certainty||0)*(ice.ease||0)/1000)*100) : null;
  const iceC = s => s===null?t.textMuted:s>=60?t.gold:s>=30?"#c08820":"#a03030";
  const score = iceS(idea.ice);
  const isAdded = added[idx];
  const champAgent = agents.find(a => idea.championedBy?.toLowerCase().includes(a.label.toLowerCase()));
  const dissentAgent = agents.find(a => idea.dissentVoice?.toLowerCase().includes(a.label.toLowerCase()));

  return (
    <div style={{background:t.surface,border:"1px solid "+(isAdded?t.gold:t.border),borderRadius:8,
      overflow:"hidden",boxShadow:"0 2px 16px rgba(0,0,0,0.07)",opacity:isAdded?0.7:1,transition:"opacity 0.2s,border-color 0.2s"}}>
      <div style={{height:3,background:champAgent?champAgent.color:t.gold}}/>
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:6}}>
              <CBdg cat={idea.category||cats[0]} cats={cats} dk={dk}/>
              <TBdg type={idea.initType||"A/B Test"} dk={dk}/>
              <span style={{fontSize:10,fontWeight:600,color:t.textMuted,fontFamily:t.mono,
                background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:3,padding:"1px 6px"}}>AI · Net New</span>
            </div>
            {isEditing
              ? <input style={{...gI(t),fontSize:14,fontWeight:700}} value={idea.title} autoFocus
                  onChange={e=>{const r=[...results];r[idx]={...r[idx],title:e.target.value};setResults(r);}}/>
              : <div style={{fontSize:15,fontWeight:700,color:t.text,fontFamily:t.serif,lineHeight:1.35,cursor:"text"}}
                  onClick={()=>setEditing(true)}>{idea.title}</div>}
          </div>
          {score!==null&&(
            <div style={{textAlign:"center",flexShrink:0,paddingLeft:12,borderLeft:"1px solid "+t.border}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>ICE</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:t.serif,color:iceC(score),lineHeight:1}}>{score}</div>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono}}>/100</div>
            </div>
          )}
        </div>

        {/* Champion + Dissent */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {idea.championedBy&&(
            <div style={{padding:"7px 10px",background:champAgent?champAgent.color+"18":t.goldBg,
              border:"1px solid "+(champAgent?champAgent.color+"50":t.goldBorder),borderRadius:5}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{champAgent?.icon} Championed by</div>
              <div style={{fontSize:11,color:t.textSub,fontFamily:t.mono,lineHeight:1.5}}>{idea.championedBy}</div>
            </div>
          )}
          {idea.dissentVoice&&(
            <div style={{padding:"7px 10px",background:dk?"#2a1a1a":"#fdf5f5",border:"1px solid "+(dk?"#6a3030":"#e0b0b0"),borderRadius:5}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{dissentAgent?.icon} Risk / Dissent</div>
              <div style={{fontSize:11,color:dk?"#e09090":"#a03030",fontFamily:t.mono,lineHeight:1.5}}>{idea.dissentVoice}</div>
            </div>
          )}
        </div>

        {idea.csoRationale&&(
          <div style={{padding:"8px 12px",background:dk?"#1a1a2a":"#f4f4ff",border:"1px solid "+(dk?"#3a3a6a":"#c0c0e8"),borderRadius:5}}>
            <div style={{fontSize:9,color:dk?"#8888cc":"#5555aa",fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>✦ CSO — Why we proceed</div>
            <div style={{fontSize:11,color:dk?"#b0b0e0":"#333366",fontFamily:t.mono,lineHeight:1.5,fontWeight:600}}>{idea.csoRationale}</div>
          </div>
        )}

        {idea.whyNotAlreadyRunning&&(
          <div style={{padding:"7px 10px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:5,fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5}}>
            <strong style={{color:t.textSub}}>Gap reason: </strong>{idea.whyNotAlreadyRunning}
          </div>
        )}

        {/* Hypothesis framework */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {idea.observation&&(
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>📊 Observation</div>
              {isEditing
                ? <textarea style={{...gTA(t),fontSize:12}} rows={2} value={idea.observation}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],observation:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.observation}</p>}
            </div>
          )}
          {idea.hypothesis&&(
            <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:10}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>💡 Hypothesis</div>
              {isEditing
                ? <textarea style={{...gTA(t),fontSize:12}} rows={3} value={idea.hypothesis}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],hypothesis:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,fontWeight:600,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.hypothesis}</p>}
            </div>
          )}
          {idea.successMetric&&(
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>🎯 Success metric</div>
              {isEditing
                ? <input style={{...gI(t),fontSize:12}} value={idea.successMetric}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],successMetric:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.successMetric}</p>}
            </div>
          )}
        </div>

        {/* ICE breakdown */}
        {idea.ice&&(
          <div style={{display:"flex",gap:10,padding:"8px 10px",background:t.surfaceAlt,borderRadius:5,border:"1px solid "+t.border}}>
            {[["Impact",idea.ice.impact],["Certainty",idea.ice.certainty],["Ease",idea.ice.ease]].map(([l,v])=>(
              <div key={l} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{l}</div>
                <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{v}<span style={{fontSize:9,color:t.textMuted}}>/10</span></div>
              </div>
            ))}
            <div style={{flex:1,textAlign:"center",borderLeft:"1px solid "+t.border}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Score</div>
              <div style={{fontSize:16,fontWeight:700,fontFamily:t.serif,color:iceC(score)}}>{score||"—"}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:6}}>
          {isAdded ? (
            <div style={{flex:1,padding:"7px 12px",borderRadius:5,background:t.goldBg,border:"1px solid "+t.goldBorder,
              fontSize:12,fontWeight:700,color:t.gold,fontFamily:t.mono,textAlign:"center"}}>✓ Added to Growth Backlog</div>
          ) : (
            <>
              <button onClick={()=>onAdd(idea,idx)} style={{...gG(t),flex:1,justifyContent:"center",fontSize:12,padding:"8px 12px",}}>
                + Add to Growth Backlog
              </button>
              <button onClick={()=>setEditing(!isEditing)} style={{...gGh(t),fontSize:11,padding:"8px 11px"}}>
                {isEditing?"✓ Done":"✎ Edit"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CopilotPanel({t, dk, settings, cats, brands, items, activeBrand, agents, debates, weeklyMetrics, onSaveDebate, onAddToBacklog, onClose}) {
  const [tab,        setTab]       = useState("debate"); // debate | history
  const [context,    setContext]   = useState("");
  const [running,    setRunning]   = useState(false);
  const [transcript, setTranscript]= useState([]);
  const [activeAgent,setActiveAgent]=useState(null); // {label, icon, color, toolsUsed}
  const [modNote,    setModNote]   = useState("");   // moderator's reasoning shown briefly
  const [results,    setResults]   = useState(null);
  const [error,      setError]     = useState("");
  const [added,      setAdded]     = useState({});
  const [phase,      setPhase]     = useState("input");
  const [turnCount,  setTurnCount] = useState(0);

  const portfolioCtx = buildPortfolioContext(items, settings, brands, activeBrand, weeklyMetrics);
  const portfolioTools = buildPortfolioTools(items, settings, brands, activeBrand, weeklyMetrics);

  // Build a smart default context from live portfolio data when panel opens
  const smartDefaultContext = useMemo(() => {
    const tools = buildPortfolioTools(items, settings, brands, activeBrand);
    const summary = tools.execute("get_portfolio_summary");
    const blocked = tools.execute("get_blocked_initiatives");
    const coverage = tools.execute("get_category_coverage");
    const gapCats = coverage.filter(c=>c.running===0&&c.draft===0).map(c=>c.category);

    const parts = [];
    if(summary.running>0) parts.push(`${summary.running} initiatives running, ${summary.draft} in draft`);
    if(summary.revenue_at_risk&&summary.revenue_at_risk!=="$0") parts.push(`${summary.revenue_at_risk} revenue at risk`);
    if(summary.north_star?.current&&summary.north_star?.target) parts.push(`north star: ${summary.north_star.current} → ${summary.north_star.target}`);
    if(blocked.length>0) parts.push(`${blocked.length} blocked initiative${blocked.length!==1?"s":""}`);
    if(gapCats.length>0) parts.push(`no coverage in: ${gapCats.slice(0,3).join(", ")}`);

    if(parts.length===0) return "";
    return "Portfolio snapshot: "+parts.join(" · ")+". What should we prioritise next?";
  }, [items, settings, brands, activeBrand]);

  const runDebate = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setError("AI features are not configured. Contact the app administrator."); return; }

    setRunning(true); setError(""); setTranscript([]); setResults(null);
    setAdded({}); setPhase("debating"); setTurnCount(0); setModNote("");

    const fullTranscript = [];
    // Build shared message history so agents read each other's words
    const messageHistory = [];
    let currentTurn = 0;

    // Pick opening agent
    let nextAgent = agents[0];

    try {
      while (currentTurn < MAX_TURNS) {
        setTurnCount(currentTurn + 1);
        setActiveAgent({ ...nextAgent, toolsUsed:[] });

        // Agent speaks (with tool use)
        const { text, toolsUsed } = await callAgentTurn(
          nextAgent, portfolioCtx, context, messageHistory, portfolioTools, currentTurn === 0
        );

        setActiveAgent(null);
        const turn = { agent:nextAgent.id, icon:nextAgent.icon, label:nextAgent.label,
          color:nextAgent.color, text, toolsUsed };
        fullTranscript.push(turn);
        setTranscript([...fullTranscript]);

        // Add to shared history as alternating user/assistant
        messageHistory.push({ role:"user", content: currentTurn===0
          ? `Portfolio:\n${portfolioCtx}\n\nContext:\n${context||"None."}\n\nOpen the debate. Use your tools then give your take.`
          : `${nextAgent.label}, your turn.` });
        messageHistory.push({ role:"assistant", content: `${nextAgent.icon} ${nextAgent.label}: ${text}` });

        currentTurn++;

        // Moderator decides what's next
        if (currentTurn >= 2) {
          const modDecision = await callModerator(
            portfolioCtx, context, fullTranscript, agents, currentTurn, MAX_TURNS
          );
          setModNote(modDecision.reason || "");

          if (modDecision.decision === "synthesise" || currentTurn >= MAX_TURNS - 1) {
            break;
          }

          const nextLabel = modDecision.next_agent;
          const found = agents.find(a => a.label === nextLabel);
          if (modDecision.decision === "followup" && found && modDecision.followup_prompt) {
            // Inject the moderator's specific question as the next prompt
            messageHistory.push({ role:"user", content: `Moderator to ${nextLabel}: ${modDecision.followup_prompt}` });
            messageHistory.push({ role:"assistant", content: `Understood.` });
          }
          nextAgent = found || agents[currentTurn % agents.length];
        } else {
          nextAgent = agents[currentTurn % agents.length];
        }
      }

      // Synthesis
      setPhase("synthesising"); setActiveAgent(null);
      const transcriptStr = fullTranscript.map(m=>`${m.icon} ${m.label}:\n${m.text}`).join("\n\n---\n\n");
      const ideas = await callDebateSynthesis(portfolioCtx, context, fullTranscript, cats, settings, portfolioTools);

      // Save debate to history
      const saved = {
        id: "dbt-"+Date.now(),
        date: new Date().toISOString(),
        context,
        transcript: fullTranscript,
        results: ideas,
        turnCount: currentTurn,
      };
      onSaveDebate(saved);

      setResults(ideas);
      setPhase("done");
    } catch(e) {
      setError("Debate failed — " + (e.message||"check your API key in Settings."));
      setPhase("input");
    }
    setRunning(false); setActiveAgent(null);
  };

  const handleAdd = (idea, idx) => {
    onAddToBacklog(idea);
    setAdded(prev => ({...prev, [idx]: true}));
  };

  const resetDebate = () => {
    setPhase("input"); setTranscript([]); setResults(null);
    setAdded({}); setTurnCount(0); setModNote(""); setError("");
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:400,display:"flex"}}>
      <div style={{flex:1,background:"rgba(10,10,8,0.5)"}} onClick={!running?onClose:undefined}/>

      <div style={{width:Math.min(600,window.innerWidth-16),background:t.surface,
        borderLeft:"1px solid "+t.border,display:"flex",flexDirection:"column",
        height:"100vh",boxShadow:"-8px 0 48px rgba(0,0,0,0.22)"}}>

        {/* Header */}
        <div style={{padding:"13px 20px",borderBottom:"1px solid "+t.border,background:t.goldBg,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:t.text,fontFamily:t.serif}}>✦ Signal AI</div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:2}}>
                Agents query your live portfolio · Moderator routes the debate · 3 net-new initiatives
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {agents.map(a=>(
                <div key={a.id} title={a.label} style={{fontSize:13,width:26,height:26,borderRadius:"50%",
                  display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.3s",
                  background:activeAgent?.id===a.id?a.color+"25":t.surfaceAlt,
                  border:"1px solid "+(activeAgent?.id===a.id?a.color:t.border),
                  boxShadow:activeAgent?.id===a.id?"0 0 8px "+a.color+"60":"none"}}>
                  {a.icon}
                </div>
              ))}
              {!running&&<button onClick={onClose} style={{background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",fontSize:18,padding:"2px 4px",lineHeight:1,marginLeft:4}}>✕</button>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:4,marginTop:10}}>
            {[["debate","🧠 Debate"],["history","🗂️ Past Debates ("+debates.length+")"]].map(([v,l])=>(
              <button key={v} onClick={()=>setTab(v)} style={{fontSize:11,padding:"4px 11px",borderRadius:4,cursor:"pointer",
                fontFamily:t.mono,fontWeight:600,
                background:tab===v?t.gold:"transparent",border:"1px solid "+(tab===v?t.gold:t.border),
                color:tab===v?t.goldText:t.textMuted}}>{l}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>

          {/* ── DEBATE TAB ── */}
          {tab==="debate"&&<>

            {/* Context input */}
            <div>
              <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,marginBottom:5}}>
                Situation context <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional — sharper with context)</span>
              </div>
              <textarea style={{...gTA(t),fontSize:12,minHeight:68,opacity:running?0.6:1}}
                disabled={running} value={context}
                onChange={e=>setContext(e.target.value)}
                onFocus={e=>{ if(!context && smartDefaultContext) setContext(smartDefaultContext); }}
                placeholder={smartDefaultContext || "What should the C-Suite know right now?\n• Black Friday is 8 weeks out\n• Gross margin compressed 4pts this quarter\n• A competitor just launched a subscription tier"}/>
            </div>

            {/* Portfolio snapshot — collapsible */}
            <details style={{...gSc(t,dk),background:t.surfaceAlt}}>
              <summary style={{fontSize:11,fontWeight:600,color:t.textSub,fontFamily:t.mono,cursor:"pointer",listStyle:"none",display:"flex",justifyContent:"space-between"}}>
                <span>📋 Portfolio the agents will read</span>
                <span style={{color:t.textMuted,fontWeight:400}}>▼</span>
              </summary>
              <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.7,whiteSpace:"pre-wrap",marginTop:10,maxHeight:200,overflowY:"auto"}}>
                {portfolioCtx}
              </div>
              <div style={{marginTop:8,fontSize:10,color:t.textMuted,fontFamily:t.mono,padding:"6px 8px",background:t.surface,borderRadius:4,border:"1px solid "+t.border}}>
                🔧 Agents also have 8 live tools to query deeper: win rates, blocked items, coverage gaps, failure patterns, revenue gaps…
              </div>
            </details>

            {/* Launch */}
            {phase==="input"&&(
              <button onClick={runDebate} style={{...gG(t),fontSize:13,padding:"11px 16px",justifyContent:"center",}}>
                🧠 Start C-Suite Debate
              </button>
            )}

            {error&&(
              <div style={{padding:"10px 14px",background:dk?"#2a1010":"#fdf0f0",border:"1px solid "+(dk?"#6a2828":"#e09090"),borderRadius:6,fontSize:12,fontFamily:t.mono,color:dk?"#e08080":"#a03030"}}>
                {error}
              </div>
            )}

            {/* Live transcript */}
            {transcript.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,display:"flex",justifyContent:"space-between"}}>
                  <span>Debate transcript</span>
                  <span>{turnCount}/{MAX_TURNS} turns</span>
                </div>

                {transcript.map((msg,i)=>(
                  <div key={i} style={{borderLeft:"3px solid "+msg.color,paddingLeft:12,paddingTop:7,paddingBottom:7,
                    background:t.surfaceAlt,borderRadius:"0 6px 6px 0",
                    border:"1px solid "+t.border,borderLeft:"3px solid "+msg.color}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:13}}>{msg.icon}</span>
                      <span style={{fontSize:11,fontWeight:700,color:msg.color,fontFamily:t.mono,letterSpacing:"0.04em"}}>{msg.label}</span>
                      {msg.toolsUsed&&msg.toolsUsed.length>0&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {msg.toolsUsed.map(tool=>(
                            <span key={tool} style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,background:t.surface,
                              border:"1px solid "+t.border,borderRadius:3,padding:"1px 5px"}}>
                              🔧 {tool.replace("get_","").replace(/_/g," ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.7,fontFamily:t.mono}}>{msg.text}</p>
                  </div>
                ))}

                {/* Moderator note */}
                {modNote&&!running&&phase==="debating"&&(
                  <div style={{padding:"6px 10px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:5,
                    fontSize:11,color:dk?"#d4b060":"#7a5800",fontFamily:t.mono,display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontWeight:700}}>🎙 Moderator:</span> {modNote}
                  </div>
                )}

                {/* Active agent typing */}
                {running&&activeAgent&&phase==="debating"&&(
                  <div style={{borderLeft:"3px solid "+activeAgent.color,paddingLeft:12,paddingTop:8,paddingBottom:8,
                    background:t.surfaceAlt,borderRadius:"0 6px 6px 0",border:"1px solid "+t.border}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13}}>{activeAgent.icon}</span>
                      <span style={{fontSize:11,fontWeight:700,color:activeAgent.color,fontFamily:t.mono}}>{activeAgent.label}</span>
                      <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>
                        <span style={{display:"inline-block",animation:"spin 1.2s linear infinite"}}>⟳</span> querying portfolio data…
                      </span>
                    </div>
                  </div>
                )}
                {running&&phase==="synthesising"&&(
                  <div style={{padding:"12px 16px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:6,
                    display:"flex",alignItems:"center",gap:8}}>
                    <span style={{display:"inline-block",animation:"spin 1.2s linear infinite",fontSize:14}}>⟳</span>
                    <span style={{fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.mono}}>CSO synthesising debate → 3 net-new initiatives…</span>
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {results&&phase==="done"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{padding:"11px 14px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:6}}>
                  <div style={{fontSize:12,fontWeight:700,color:t.gold,fontFamily:t.mono,marginBottom:2}}>
                    ✅ {results.length} net-new initiatives · {turnCount} agent turns · {transcript.reduce((s,m)=>s+(m.toolsUsed?.length||0),0)} tool calls
                  </div>
                  <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>
                    Not currently running. Review, edit, then add to your Growth Backlog.
                  </div>
                </div>
                {results.map((idea,idx)=>(
                  <IdeaCard key={idx} idea={idea} idx={idx} results={results} setResults={setResults}
                    added={added} onAdd={handleAdd} t={t} dk={dk} cats={cats} agents={agents}/>
                ))}
                <button onClick={resetDebate} style={{...gGh(t),justifyContent:"center",fontSize:12}}>
                  ⟳ Run a new debate
                </button>
              </div>
            )}

            {/* Empty state */}
            {phase==="input"&&transcript.length===0&&(
              <div style={{padding:"28px 16px",textAlign:"center",border:"1px dashed "+t.border,borderRadius:8}}>
                <div style={{fontSize:28,marginBottom:10}}>🧠</div>
                <div style={{fontSize:13,fontWeight:600,color:t.text,fontFamily:t.serif,marginBottom:8}}>Autonomous C-Suite debate</div>
                <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {agents.map(a=>(
                    <span key={a.id} style={{fontSize:11,padding:"4px 10px",borderRadius:4,fontFamily:t.mono,fontWeight:600,
                      color:a.color,background:a.color+"15",border:"1px solid "+a.color+"30"}}>
                      {a.icon} {a.label}
                    </span>
                  ))}
                </div>
                <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,lineHeight:1.8,maxWidth:380,margin:"0 auto"}}>
                  Each exec has 8 live tools to query your portfolio data — win rates, blocked initiatives, coverage gaps, failure patterns, revenue gaps — before forming opinions.
                  A Moderator routes the debate dynamically. The CSO synthesises into 3 net-new initiatives with champion and dissenting voice.
                  <br/><br/>
                  <strong style={{color:t.textSub}}>Add situation context above for sharper results.</strong>
                  <br/>Use Signal AI to analyse your portfolio.
                </div>
              </div>
            )}
          </>}

          {/* ── HISTORY TAB ── */}
          {tab==="history"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {debates.length===0?(
                <div style={{padding:"32px 16px",textAlign:"center",border:"1px dashed "+t.border,borderRadius:8,color:t.textMuted,fontFamily:t.mono,fontSize:12}}>
                  No saved debates yet. Run your first debate and it will appear here.
                </div>
              ):debates.map((d,i)=>(
                <div key={d.id} style={{...gSc(t,dk)}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:t.text,fontFamily:t.mono}}>
                        {new Date(d.date).toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                      </div>
                      <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:2}}>
                        {d.turnCount} turns · {d.results?.length||0} initiatives generated
                        {d.context&&<span> · "{d.context.slice(0,50)}{d.context.length>50?"…":""}"</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      {(d.results||[]).map((idea,idx)=>(
                        <button key={idx} onClick={()=>{onAddToBacklog(idea);}}
                          title={"Add: "+idea.title}
                          style={{fontSize:9,padding:"2px 7px",borderRadius:3,fontFamily:t.mono,fontWeight:600,cursor:"pointer",
                            background:t.goldBg,border:"1px solid "+t.goldBorder,color:t.gold}}>
                          + {(idea.title||"").split(" ").slice(0,3).join(" ")}…
                        </button>
                      ))}
                    </div>
                  </div>
                  <details>
                    <summary style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,cursor:"pointer"}}>View transcript ({d.transcript?.length||0} turns)</summary>
                    <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6,maxHeight:300,overflowY:"auto"}}>
                      {(d.transcript||[]).map((msg,j)=>(
                        <div key={j} style={{borderLeft:"3px solid "+msg.color,paddingLeft:10,paddingTop:4,paddingBottom:4}}>
                          <div style={{fontSize:10,fontWeight:700,color:msg.color,fontFamily:t.mono,marginBottom:3}}>{msg.icon} {msg.label}</div>
                          <p style={{margin:0,fontSize:11,color:t.textSub,fontFamily:t.mono,lineHeight:1.6}}>{msg.text}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Weekly Pulse --------------------------------------------------------------
function WeeklyPulseSection({t, dk, settings, brands, weeklyMetrics, onLog, onImport}) {
  const [expanded, setExpanded] = useState(true);

  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000); // 4 weeks

  // Latest entry across all brand+source combos
  const sorted = [...(weeklyMetrics||[])].sort((a,b)=>b.date.localeCompare(a.date));
  const latestDate = sorted[0]?.date || null;
  const daysSince = latestDate ? Math.floor((now - new Date(latestDate+"T12:00:00")) / 86400000) : null;
  const isStale = daysSince !== null && daysSince > 7;
  const isEmpty = !weeklyMetrics || weeklyMetrics.length === 0;

  // Last 4 distinct weeks
  const weeks = [...new Set(sorted.map(m=>m.date))].slice(0,4);

  // Revenue sparkline: sum revenue across all brands for each of last 4 weeks
  const revenueByWeek = weeks.map(w =>
    weeklyMetrics.filter(m=>m.date===w).reduce((s,m)=>s+(m.metrics.revenue||0),0)
  ).reverse();

  // Build a summary table: brands × latest week metrics (revenue, spend, roas)
  const summaryRows = brands.map(b => {
    const brandId = b.id;
    const latestEntries = sorted.filter(m => m.brand === brandId || m.brand === b.name || (brandId==="default"&&(!m.brand||m.brand==="default")));
    const latestEntry = latestEntries[0];
    const prevEntry = latestEntries.find(m => m.date < (latestEntry?.date||""));

    if (!latestEntry) return { brand: b.name, date: null, metrics: null };

    const delta = (key) => {
      if (!prevEntry || prevEntry.metrics[key]==null || latestEntry.metrics[key]==null) return null;
      const d = ((latestEntry.metrics[key] - prevEntry.metrics[key]) / Math.max(Math.abs(prevEntry.metrics[key]),0.01)) * 100;
      return d;
    };

    return {
      brand: b.name,
      date: latestEntry.date,
      source: latestEntry.source,
      revenue: latestEntry.metrics.revenue ?? null,
      spend: latestEntry.metrics.spend ?? null,
      roas: latestEntry.metrics.roas ?? null,
      cvr: latestEntry.metrics.cvr ?? null,
      revDelta: delta("revenue"),
      roasDelta: delta("roas"),
    };
  });

  const deltaEl = (d) => {
    if (d === null) return null;
    const pos = d >= 0;
    return <span style={{fontSize:10,fontWeight:600,fontFamily:t.mono,color:pos?"#2a8a50":"#c03030",marginLeft:3}}>{pos?"▲":"▼"}{Math.abs(d).toFixed(1)}%</span>;
  };

  const stalenessColor = isStale ? (dk?"#d0a838":"#8a6010") : (dk?"#5ad080":"#1a7a48");
  const stalenessBg   = isStale ? (dk?"#2a2410":"#fdf8ee") : (dk?"#122a18":"#edfaf2");
  const stalenessBorder = isStale ? (dk?"#6a5818":"#e0c070") : (dk?"#2a7a40":"#7adca0");

  return (
    <div style={{...gCd(t,dk),border:"1px solid "+t.border}}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setExpanded(e=>!e)} style={{background:"none",border:"none",cursor:"pointer",color:t.textMuted,fontSize:13,padding:0,lineHeight:1}}>
            {expanded?"▾":"▸"}
          </button>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono}}>Weekly Pulse</span>
          {!isEmpty && (
            <span style={{fontSize:10,padding:"2px 7px",borderRadius:3,background:stalenessBg,border:"1px solid "+stalenessBorder,color:stalenessColor,fontFamily:t.mono,fontWeight:600}}>
              {isStale ? `Last logged ${daysSince}d ago ⚠️` : `Updated ${daysSince===0?"today":daysSince+"d ago"}`}
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:5}}>
          <button onClick={onImport} style={{...gGh(t),fontSize:11,padding:"3px 9px"}}>⬆ Import CSV</button>
          <button onClick={onLog}    style={{...gG(t),fontSize:11,padding:"3px 9px"}}>+ Log this week</button>
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:12}}>
          {isEmpty ? (
            <div style={{padding:"26px 20px",textAlign:"center",border:"1px dashed "+t.border,borderRadius:10}}>
              <div style={{fontSize:24,marginBottom:8,opacity:.5}}>&#128202;</div>
              <div style={{fontSize:13.5,fontWeight:600,color:t.text,fontFamily:t.sans,marginBottom:4}}>No metrics logged yet</div>
              <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,maxWidth:340,margin:"0 auto 14px"}}>Track revenue, spend, ROAS and CVR week over week to power the pulse and contribution views.</div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={onLog} style={{...gG(t),fontSize:12.5,padding:"7px 15px"}}>+ Log this week</button>
                <button onClick={onImport} style={{...gGh(t),fontSize:12.5,padding:"7px 13px"}}>&#8645; Import CSV</button>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Revenue sparkline strip */}
              {revenueByWeek.some(v=>v>0) && (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:t.surfaceAlt,borderRadius:5}}>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,minWidth:60}}>Revenue</span>
                  <Spark vals={revenueByWeek} color={t.gold} w={100} h={24}/>
                  <span style={{fontSize:11,fontWeight:700,color:t.gold,fontFamily:t.mono,marginLeft:4}}>
                    {fmtCur(revenueByWeek[revenueByWeek.length-1])}
                  </span>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginLeft:"auto"}}>last {weeks.length} entries</span>
                </div>
              )}

              {/* Summary table */}
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:t.mono}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid "+t.border}}>
                      {["Brand","Date","Source","Revenue","Spend","ROAS","CVR"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"4px 8px",color:t.textMuted,fontWeight:600,letterSpacing:"0.05em",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid "+t.border,opacity:row.date?1:0.4}}>
                        <td style={{padding:"6px 8px",color:t.text,fontWeight:600,whiteSpace:"nowrap"}}>{row.brand}</td>
                        <td style={{padding:"6px 8px",color:t.textMuted,whiteSpace:"nowrap"}}>{row.date?fmtDate(row.date):"—"}</td>
                        <td style={{padding:"6px 8px",color:t.textMuted,whiteSpace:"nowrap"}}>
                          {row.source ? (METRIC_SOURCES.find(s=>s.id===row.source)?.label||row.source) : "—"}
                        </td>
                        <td style={{padding:"6px 8px",color:t.gold,fontWeight:700,whiteSpace:"nowrap"}}>
                          {row.revenue!=null?fmtCur(row.revenue):"—"}{deltaEl(row.revDelta)}
                        </td>
                        <td style={{padding:"6px 8px",color:t.textSub,whiteSpace:"nowrap"}}>{row.spend!=null?fmtCur(row.spend):"—"}</td>
                        <td style={{padding:"6px 8px",color:t.textSub,whiteSpace:"nowrap"}}>
                          {row.roas!=null?row.roas.toFixed(2)+"x":"—"}{deltaEl(row.roasDelta)}
                        </td>
                        <td style={{padding:"6px 8px",color:t.textSub,whiteSpace:"nowrap"}}>{row.cvr!=null?row.cvr.toFixed(2)+"%":"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Weekly metrics log modal — manual entry per brand, source-filtered fields
function MetricsLogModal({t, dk, settings, brands, weeklyMetrics, onSave, onClose}) {
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState(
    brands.map(b => ({ brandId: b.id, source: "manual", metrics: {} }))
  );

  const updateRow = (idx, field, val) => {
    setRows(r => r.map((row,i) => i===idx ? {...row, [field]: val} : row));
  };
  const updateMetric = (idx, key, val) => {
    setRows(r => r.map((row,i) => i===idx ? {...row, metrics:{...row.metrics,[key]:val}} : row));
  };

  const handleSave = () => {
    const newEntries = rows
      .filter(row => Object.values(row.metrics).some(v => v !== "" && v !== undefined))
      .map(row => {
        const src = METRIC_SOURCES.find(s=>s.id===row.source);
        const cleanMetrics = {};
        if (src) {
          src.fields.forEach(f => {
            const v = row.metrics[f.key];
            if (v !== "" && v !== undefined) {
              cleanMetrics[f.key] = f.type === "number" ? parseFloat(v)||0 : v;
            }
          });
        }
        return { date, brand: row.brandId, source: row.source, metrics: cleanMetrics };
      });

    if (!newEntries.length) { onClose(); return; }

    // Deduplicate: replace existing entries for same date+brand+source
    const filtered = weeklyMetrics.filter(m =>
      !newEntries.some(e => e.date===m.date && e.brand===m.brand && e.source===m.source)
    );
    onSave([...newEntries, ...filtered].sort((a,b)=>b.date.localeCompare(a.date)));
    onClose();
  };

  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title="Log this week's metrics">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <FR label="Week ending / reporting date" t={t}>
          <input type="date" style={gI(t)} value={date} onChange={e=>setDate(e.target.value)}/>
        </FR>

        {rows.map((row, idx) => {
          const brand = brands[idx];
          const srcDef = METRIC_SOURCES.find(s=>s.id===row.source);
          return (
            <div key={idx} style={{border:"1px solid "+t.border,borderRadius:6,padding:"12px 14px",background:t.surfaceAlt}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{fontSize:13,fontWeight:700,color:t.text,fontFamily:t.serif}}>{brand.name}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {METRIC_SOURCES.map(s=>(
                    <button key={s.id} onClick={()=>updateRow(idx,"source",s.id)}
                      style={{fontSize:10,padding:"3px 8px",borderRadius:4,cursor:"pointer",fontFamily:t.mono,
                        background:row.source===s.id?t.gold:"transparent",
                        border:"1px solid "+(row.source===s.id?t.gold:t.border),
                        color:row.source===s.id?t.goldText:t.textMuted,fontWeight:row.source===s.id?700:400}}>
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
                {srcDef && srcDef.fields.map(f=>(
                  <div key={f.key} style={{display:"flex",flexDirection:"column",gap:3}}>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>{f.label}</label>
                    {f.type==="text"
                      ? <input style={{...gI(t),fontSize:12}} value={row.metrics[f.key]||""} placeholder={f.hint} onChange={e=>updateMetric(idx,f.key,e.target.value)}/>
                      : <input style={{...gI(t),fontSize:12}} type="number" step="any" value={row.metrics[f.key]||""} placeholder={f.hint} onChange={e=>updateMetric(idx,f.key,e.target.value)}/>
                    }
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
          <button style={gGh(t)} onClick={onClose}>Cancel</button>
          <button style={gG(t)} onClick={handleSave}>Save metrics</button>
        </div>
      </div>
    </Modal>
  );
}

// Weekly metrics CSV import modal
function MetricsImportModal({t, dk, weeklyMetrics, onSave, onClose}) {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [parsed, setParsed] = useState({rows:[], errors:[]});
  const [conflictMode, setConflictMode] = useState("overwrite"); // overwrite | skip

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseMetricsCSV(ev.target.result);
      setParsed(result);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseMetricsCSV(ev.target.result);
      setParsed(result);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleConfirm = () => {
    const existing = [...weeklyMetrics];
    let merged;
    if (conflictMode === "overwrite") {
      const filtered = existing.filter(m =>
        !parsed.rows.some(r => r.date===m.date && r.brand===m.brand && r.source===m.source)
      );
      merged = [...parsed.rows, ...filtered].sort((a,b)=>b.date.localeCompare(a.date));
    } else {
      // skip: only add rows that don't already exist
      const newOnly = parsed.rows.filter(r =>
        !existing.some(m => m.date===r.date && m.brand===r.brand && m.source===r.source)
      );
      merged = [...newOnly, ...existing].sort((a,b)=>b.date.localeCompare(a.date));
    }
    onSave(merged);
    setStep("done");
    setTimeout(onClose, 1200);
  };

  const conflicts = parsed.rows.filter(r =>
    weeklyMetrics.some(m => m.date===r.date && m.brand===r.brand && m.source===r.source)
  );

  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title="Import metrics CSV">
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {step==="done" && (
          <div style={{padding:"24px",textAlign:"center",color:dk?"#60d080":"#1a7a48",fontFamily:t.mono,fontSize:13}}>
            ✓ Metrics imported successfully
          </div>
        )}

        {step==="upload" && (
          <>
            <div onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
              style={{border:"2px dashed "+t.border,borderRadius:8,padding:"28px",textAlign:"center",cursor:"pointer",background:t.surfaceAlt}}
              onClick={()=>document.getElementById("metrics-csv-input").click()}>
              <div style={{fontSize:28,marginBottom:8}}>📂</div>
              <div style={{fontSize:13,color:t.text,marginBottom:4}}>Drop your CSV here or click to upload</div>
              <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>Header-driven — column order doesn't matter. See template for required columns.</div>
              <input id="metrics-csv-input" type="file" accept=".csv" style={{display:"none"}} onChange={handleFile}/>
            </div>
            <div style={{background:dk?"#1a1a12":"#f5f5f0",borderRadius:6,padding:"10px 12px",fontSize:11,fontFamily:t.mono,color:t.textMuted,lineHeight:1.7}}>
              <strong style={{color:t.textSub}}>Required columns:</strong> date, brand, source<br/>
              <strong style={{color:t.textSub}}>Common columns:</strong> revenue, spend, roas, cvr, cac, aov, traffic, conversions, impressions, clicks, cpm, ctr, notes<br/>
              <strong style={{color:t.textSub}}>Source values:</strong> manual, meta, ga4, google_ads<br/>
              Column names are case-insensitive. Spaces and underscores are treated the same. Common export aliases (e.g. "Amount Spent", "Conv. Value") are recognised automatically.
            </div>
          </>
        )}

        {step==="preview" && (
          <>
            {parsed.errors.length > 0 && (
              <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:100,overflowY:"auto"}}>
                {parsed.errors.map((e,i)=>(
                  <div key={i} style={{fontSize:11,fontFamily:t.mono,padding:"4px 8px",background:dk?"#2a1212":"#fdf0f0",border:"1px solid "+(dk?"#6a2828":"#e09090"),borderRadius:4,color:dk?"#e08080":"#a03030"}}>{e}</div>
                ))}
              </div>
            )}

            <div style={{fontSize:12,fontFamily:t.mono,color:t.textSub}}>
              {parsed.rows.length} row{parsed.rows.length!==1?"s":""} ready to import
              {conflicts.length > 0 && <span style={{color:dk?"#d0a838":"#8a6010"}}> · {conflicts.length} conflict{conflicts.length!==1?"s":""} with existing data</span>}
            </div>

            {conflicts.length > 0 && (
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>On conflict:</span>
                {[["overwrite","Overwrite existing"],["skip","Keep existing"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setConflictMode(v)}
                    style={{fontSize:11,padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:t.mono,
                      background:conflictMode===v?t.gold:"transparent",border:"1px solid "+(conflictMode===v?t.gold:t.border),
                      color:conflictMode===v?t.goldText:t.textMuted}}>{l}</button>
                ))}
              </div>
            )}

            <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
              {parsed.rows.map((row,i)=>{
                const isConflict = weeklyMetrics.some(m=>m.date===row.date&&m.brand===row.brand&&m.source===row.source);
                const srcDef = METRIC_SOURCES.find(s=>s.id===row.source);
                return (
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",
                    background:isConflict?(dk?"#2a2410":"#fdf8ee"):t.surfaceAlt,
                    border:"1px solid "+(isConflict?(dk?"#6a5818":"#e0c070"):t.border),borderRadius:4}}>
                    <span style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,minWidth:80,flexShrink:0}}>{row.date}</span>
                    <span style={{fontSize:11,fontFamily:t.mono,color:t.text,fontWeight:600,minWidth:80,flexShrink:0}}>{row.brand}</span>
                    <span style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,minWidth:60,flexShrink:0}}>{srcDef?.label||row.source}</span>
                    <span style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {Object.entries(row.metrics).filter(([k])=>k!=="notes").map(([k,v])=>`${k}: ${v}`).join(" · ")}
                    </span>
                    {isConflict&&<span style={{fontSize:9,color:dk?"#d0a838":"#8a6010",fontFamily:t.mono,flexShrink:0}}>conflict</span>}
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex",gap:8,justifyContent:"space-between",paddingTop:4}}>
              <button style={gGh(t)} onClick={()=>setStep("upload")}>← Re-upload</button>
              <div style={{display:"flex",gap:8}}>
                <button style={gGh(t)} onClick={onClose}>Cancel</button>
                <button style={gG(t)} onClick={handleConfirm} disabled={!parsed.rows.length}>
                  Import {parsed.rows.length} row{parsed.rows.length!==1?"s":""}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// -- Dashboard -----------------------------------------------------------------
// -- Contribution to Revenue View ---------------------------------------------
// Three-layer breakdown of how the portfolio contributes to revenue, scoped to
// the active date range and active retailer. Built to be the artifact the
// operator forwards to a client to justify a retainer.
// -- Funnel coverage map -----------------------------------------------------
// Treats categories as funnel stages and shows, per stage: how many initiatives,
// average ICE quality, and revenue in play (running + draft estimate). Surfaces
// thin/empty stages as coverage gaps — the diagnostic artifact for onboarding calls.
function FunnelCoverageMap({t, dk, items, cats, brands, activeBrand}) {
  const normB = id => (!id||id==="default") ? ((brands[0]&&brands[0].id)||"default") : id;
  const scoped = items.filter(e=>activeBrand==="all"||normB(e.brandId)===normB(activeBrand));
  const fmtK = (n) => n===0 ? "$0" : "$"+(n>=1000?Math.round(n/100)/10+"k":Math.round(n).toLocaleString());

  const stages = cats.map(cat=>{
    const inCat   = scoped.filter(e=>e.category===cat);
    const active  = inCat.filter(e=>e.status==="Running"||e.status==="Draft");
    const running = inCat.filter(e=>e.status==="Running").length;
    const draft   = inCat.filter(e=>e.status==="Draft").length;
    const done    = inCat.filter(e=>e.status==="Completed").length;
    const revInPlay = active.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
    const iceVals = inCat.map(e=>e.ice&&iceScore(e.ice.impact,e.ice.certainty,e.ice.ease)).filter(s=>s!=null&&s>0);
    const avgIce  = iceVals.length?Math.round(iceVals.reduce((a,b)=>a+b,0)/iceVals.length):null;
    return {cat,count:inCat.length,active:active.length,running,draft,done,revInPlay,avgIce};
  });

  const maxCount = Math.max(...stages.map(s=>s.count),1);
  const maxRev   = Math.max(...stages.map(s=>s.revInPlay),1);
  const gaps     = stages.filter(s=>s.active===0);
  const totalRevInPlay = stages.reduce((s,r)=>s+r.revInPlay,0);

  return (
    <div style={{...gCd(t,dk)}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:6}}>
        <div>
          <div style={gSL(t)}>Funnel coverage</div>
          <div style={{fontSize:11.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5}}>
            Where active work and revenue are concentrated across the funnel — and which stages are uncovered.
          </div>
        </div>
        <span style={{fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.mono}}>{fmtK(totalRevInPlay)} in play</span>
      </div>

      {gaps.length>0 && (
        <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",borderRadius:9,background:t.redBg,border:"1px solid "+(dk?"#5a2a1e":"#f0cabf"),margin:"10px 0 14px"}}>
          <span style={{color:t.red,fontSize:13,lineHeight:1.4,flexShrink:0}}>&#9888;</span>
          <span style={{fontSize:12,color:t.red,fontFamily:t.sans,lineHeight:1.45}}>
            <strong style={{fontWeight:600}}>{gaps.length} stage{gaps.length>1?"s":""} with no active work:</strong> {gaps.map(g=>g.cat).join(", ")}. These are coverage gaps worth a hypothesis.
          </span>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:gaps.length>0?0:12}}>
        {stages.map((s,i)=>{
          const isGap = s.active===0;
          const barPct = Math.max(4,(s.count/maxCount)*100);
          const accent = catColor(s.cat,cats,dk);
          return (
            <div key={s.cat} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<stages.length-1?"1px solid "+t.borderSoft:"none"}}>
              {/* Stage label + count bar */}
              <div style={{flex:"1 1 auto",minWidth:0}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:5}}>
                  <span style={{fontSize:13,fontWeight:600,color:isGap?t.textMuted:t.text,fontFamily:t.sans}}>{s.cat}</span>
                  {isGap
                    ? <span style={{fontSize:10,fontWeight:600,color:t.red,fontFamily:t.mono,letterSpacing:"0.04em"}}>UNCOVERED</span>
                    : <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>{s.running} running · {s.draft} draft · {s.done} done</span>}
                </div>
                <div style={{height:7,borderRadius:4,background:t.surfaceAlt,overflow:"hidden"}}>
                  <div style={{width:barPct+"%",height:"100%",background:isGap?t.border:accent,borderRadius:4,transition:"width .3s"}}/>
                </div>
              </div>
              {/* Quality */}
              <div style={{width:62,textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>ICE</div>
                <div style={{fontSize:14,fontWeight:600,color:s.avgIce!=null?(s.avgIce>=60?t.teal:s.avgIce>=35?t.text:t.textSub):t.textMuted,fontFamily:t.mono,lineHeight:1.2}}>{s.avgIce!=null?s.avgIce:"—"}</div>
              </div>
              {/* Revenue in play */}
              <div style={{width:74,textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>In play</div>
                <div style={{fontSize:14,fontWeight:600,color:s.revInPlay>0?t.gold:t.textMuted,fontFamily:t.mono,lineHeight:1.2,letterSpacing:"-0.02em"}}>{fmtK(s.revInPlay)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function ContributionView({t, dk, contribution, totals, dRange, activeBrand, brands}) {
  const rangeLabel = dRange==="thisMonth"?"this month":dRange==="lastMonth"?"last month":"selected range";
  const retailerLabel = activeBrand==="all" ? "All retailers" : brandName(activeBrand, brands);
  const grand = totals.realised + totals.inflight + totals.pipeline;

  // Empty state — no data at all
  if (grand === 0) {
    return (
      <div style={{...gCd(t,dk)}}>
        <div style={gSL(t)}>Contribution to revenue</div>
        <div style={{padding:"24px 12px",textAlign:"center",color:t.textMuted,fontFamily:t.mono,fontSize:12,lineHeight:1.7}}>
          No revenue contribution recorded for {rangeLabel}.<br/>
          Complete an initiative with actual revenue impact or add running / draft items to see this view.
        </div>
      </div>
    );
  }

  const maxRow = Math.max(...contribution.map(r=>r.realised+r.inflight+r.pipeline), 1);
  const fmt = (n) => n===0 ? "—" : "$"+(n>=1000?Math.round(n/100)/10+"k":n.toLocaleString());
  const fmtBig = (n) => "$"+(n>=1000?(Math.round(n/100)/10).toLocaleString()+"k":n.toLocaleString());

  // Tones: realised = gold (the defensible number), inflight = mid amber, pipeline = muted
  const colorRealised = t.gold;
  const colorInflight = dk ? "#c08820" : "#c08820";
  const colorPipeline = dk ? "#7a6438" : "#a89060";

  const copyText = () => {
    const date = new Date().toLocaleDateString("en-CA",{month:"long",day:"numeric",year:"numeric"});
    const lines = [
      "Contribution to Revenue — "+date,
      "Retailer: "+retailerLabel+" | Range: "+rangeLabel,
      "",
      "TOTALS",
      "Realised (completed, measured): "+fmtBig(totals.realised),
      "In-flight (running, probability-weighted): "+fmtBig(totals.inflight),
      "Pipeline (draft, probability-weighted): "+fmtBig(totals.pipeline),
      "",
      "BY CATEGORY",
      ...contribution.map(r=>"  "+r.category+": realised "+fmt(r.realised)+" | in-flight "+fmt(r.inflight)+" | pipeline "+fmt(r.pipeline)+" (win rate "+r.winRate+"%)"),
      "",
      "Note: In-flight and pipeline figures are probability-weighted by historical category win rate. Realised is sum of measured actual revenue impact on completed initiatives.",
    ].join("\n");
    try { navigator.clipboard.writeText(lines); showToast("Contribution summary copied to clipboard.", "success"); } catch { showToast("Couldn't copy to clipboard.", "error"); }
  };

  return (
    <div style={{...gCd(t,dk)}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <div>
          <div style={gSL(t)}>Contribution to revenue</div>
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5}}>
            {retailerLabel} &middot; {rangeLabel} &middot; in-flight and pipeline are probability-weighted by category win rate
          </div>
        </div>
        <button onClick={copyText} style={{...gGh(t),fontSize:11,padding:"3px 10px"}}>&#128203; Copy</button>
      </div>

      {/* Totals row — three big numbers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
        <div style={{padding:"12px 14px",borderRadius:6,background:t.goldBg,border:"1px solid "+t.goldBorder}}>
          <div style={{fontSize:10,color:t.gold,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Realised</div>
          <div style={{fontSize:26,fontWeight:700,fontFamily:t.mono,color:colorRealised,letterSpacing:"-0.02em",lineHeight:1}}>{fmtBig(totals.realised)}</div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:4}}>measured on completed</div>
        </div>
        <div style={{padding:"12px 14px",borderRadius:6,background:t.surface,border:"1px solid "+t.border}}>
          <div style={{fontSize:10,color:colorInflight,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>In-flight</div>
          <div style={{fontSize:26,fontWeight:700,fontFamily:t.mono,color:colorInflight,letterSpacing:"-0.02em",lineHeight:1}}>{fmtBig(totals.inflight)}</div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:4}}>running, probability-weighted</div>
        </div>
        <div style={{padding:"12px 14px",borderRadius:6,background:t.surface,border:"1px solid "+t.border}}>
          <div style={{fontSize:10,color:colorPipeline,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Pipeline</div>
          <div style={{fontSize:26,fontWeight:700,fontFamily:t.mono,color:colorPipeline,letterSpacing:"-0.02em",lineHeight:1}}>{fmtBig(totals.pipeline)}</div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:4}}>draft, probability-weighted</div>
        </div>
      </div>

      {/* By category — stacked bars */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {contribution.map(row => {
          const rowTotal = row.realised + row.inflight + row.pipeline;
          const pct = (v) => (v/maxRow)*100;
          return (
            <div key={row.category}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5,gap:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",minWidth:0}}>
                  <span style={{fontSize:12,fontWeight:700,color:t.text,fontFamily:t.serif}}>{row.category}</span>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>
                    win rate {row.winRate}%{row.usesFallback?" (portfolio avg)":""}
                  </span>
                </div>
                <span style={{fontSize:13,fontWeight:700,color:t.text,fontFamily:t.mono,letterSpacing:"-0.01em"}}>{fmtBig(rowTotal)}</span>
              </div>
              <div style={{display:"flex",height:10,borderRadius:3,overflow:"hidden",background:t.border}}>
                {row.realised>0 && <div title={"Realised: "+fmt(row.realised)} style={{width:pct(row.realised)+"%",background:colorRealised}}/>}
                {row.inflight>0 && <div title={"In-flight: "+fmt(row.inflight)} style={{width:pct(row.inflight)+"%",background:colorInflight}}/>}
                {row.pipeline>0 && <div title={"Pipeline: "+fmt(row.pipeline)} style={{width:pct(row.pipeline)+"%",background:colorPipeline}}/>}
              </div>
              <div style={{display:"flex",gap:12,marginTop:4,fontSize:10,color:t.textMuted,fontFamily:t.mono,flexWrap:"wrap"}}>
                {row.realised>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorRealised,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>Realised {fmt(row.realised)}</span>}
                {row.inflight>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorInflight,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>In-flight {fmt(row.inflight)}</span>}
                {row.pipeline>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorPipeline,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>Pipeline {fmt(row.pipeline)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Next Plays UI -----------------------------------------------------------
// Card that lives on the Dashboard. Shows the latest batch of recommendations
// or a generate CTA if none exist yet. Clicking a rec opens the detail modal.
function NextPlaysCard({ t, dk, recs, recsLoad, recsErr, brands, items, onGenerate, onOpenRec }) {
  const latest = recs && recs.length > 0 ? recs[0] : null;
  const pending = latest ? latest.recommendations.filter(r => r.status === "pending") : [];
  const accepted = latest ? latest.recommendations.filter(r => r.status === "accepted") : [];
  const dismissed = latest ? latest.recommendations.filter(r => r.status === "dismissed") : [];

  const closedCount = (items||[]).filter(e =>
    (e.status==="Completed"||e.status==="Killed") && e.results && e.results.keyLearning
  ).length;

  // -- COMPACT MODE — recs exist and not currently loading -------------------
  // One header strip + one row per pending recommendation. Clicking any row
  // opens the detail modal directly (Option 2 — skip the intermediate list).
  if (latest && !recsLoad) {
    return (
      <div style={{...gCd(t,dk),display:"flex",flexDirection:"column",gap:8,border:"1px solid "+t.goldBorder,padding:"10px 14px"}}>
        {/* Header strip */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,color:t.gold}}>◆</span>
            <span style={{fontSize:12,fontWeight:700,fontFamily:t.serif,color:t.text,letterSpacing:"0.02em"}}>Next Plays</span>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>
              {pending.length > 0
                ? pending.length+" ready"
                : "all resolved"}
            </span>
            {latest && (
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,opacity:0.7}}>
                · {fmtDate(latest.generatedAt.slice(0,10))}
              </span>
            )}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {(accepted.length > 0 || dismissed.length > 0) && (
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginRight:4}}>
                {accepted.length > 0 && <span>✓ {accepted.length}</span>}
                {accepted.length > 0 && dismissed.length > 0 && <span> · </span>}
                {dismissed.length > 0 && <span>✕ {dismissed.length}</span>}
              </span>
            )}
            <button onClick={onGenerate} style={{...gGh(t),fontSize:10,padding:"3px 8px"}} title="Regenerate from current portfolio state">
              ↻ Regenerate
            </button>
          </div>
        </div>

        {/* Error inline (rare — usually cleared by next successful gen) */}
        {recsErr && (
          <div style={{padding:"6px 10px",background:dk?"#3a1010":"#fff0f0",border:"1px solid "+(dk?"#6a2020":"#e09090"),borderRadius:4,fontSize:11,color:dk?"#e08080":"#a03030",fontFamily:t.mono}}>
            {recsErr}
          </div>
        )}

        {/* Pending rows — tight one-line entries */}
        {pending.length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {pending.map(rec => {
              const iceTotal = iceScore(rec.ice.impact, rec.ice.certainty, rec.ice.ease);
              return (
                <button key={rec.id} onClick={()=>onOpenRec(latest.id, rec.id)}
                  style={{textAlign:"left",padding:"7px 10px",background:t.surface,border:"1px solid "+t.border,borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontFamily:t.mono,transition:"border-color 0.15s, background 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=t.gold;e.currentTarget.style.background=t.goldBg;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.background=t.surface;}}>
                  {/* Title — flexes to fill, truncates if needed */}
                  <span style={{fontSize:12,fontWeight:600,color:t.text,fontFamily:t.serif,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {rec.title}
                  </span>
                  {/* Meta chips — hide on narrow screens via flexShrink */}
                  <span style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,padding:"1px 5px",border:"1px solid "+t.border,borderRadius:3,textTransform:"uppercase",letterSpacing:"0.04em",flexShrink:0}}>{rec.category}</span>
                  <span style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,flexShrink:0,display:"none"}} className="np-brand">{rec.brandTarget}</span>
                  {/* ICE — always visible, the most important signal at a glance */}
                  <span style={{display:"flex",gap:3,alignItems:"baseline",flexShrink:0}}>
                    <span style={{fontSize:9,color:t.textMuted,fontFamily:t.mono}}>ICE</span>
                    <span style={{fontSize:13,fontWeight:700,color:iceColor(iceTotal,t),fontFamily:t.serif,minWidth:18,textAlign:"right"}}>
                      {iceTotal!==null?iceTotal:"—"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* All-resolved nudge — encourages a regenerate when the slate is exhausted */}
        {pending.length === 0 && (accepted.length > 0 || dismissed.length > 0) && (
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,fontStyle:"italic",padding:"4px 2px"}}>
            All recommendations from this batch have been resolved. Regenerate when you're ready for the next slate.
          </div>
        )}
      </div>
    );
  }

  // -- FULL MODE — empty state or loading. Earns the click; once recs exist, --
  // -- this collapses to the compact strip above. -----------------------------
  return (
    <div style={{...gCd(t,dk),display:"flex",flexDirection:"column",gap:12,border:"1px solid "+t.goldBorder}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18,color:t.gold}}>◆</span>
          <span style={{fontSize:13,fontWeight:700,fontFamily:t.serif,color:t.text,letterSpacing:"0.02em"}}>Next Plays</span>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.04em",textTransform:"uppercase"}}>
            AI-recommended experiments
          </span>
        </div>
        <button onClick={onGenerate} disabled={recsLoad}
          style={{...gG(t),fontSize:11,padding:"5px 11px",opacity:recsLoad?0.6:1}}>
          {recsLoad
            ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Generating…</>
            : <>✦ Generate</>}
        </button>
      </div>

      {/* Empty state — first run */}
      {!recsLoad && !recsErr && (
        <div style={{padding:"14px 16px",background:dk?"#1a1a14":"#fafaf5",border:"1px dashed "+t.border,borderRadius:6,fontSize:12,color:t.textSub,fontFamily:t.mono,lineHeight:1.6}}>
          {closedCount === 0
            ? "No experiments closed yet. Recommendations will be sharpest once you have a few logged learnings — but you can still generate from your current portfolio state."
            : "Generate to see 3 grounded experiment recommendations, with hypothesis, ICE, and reasoning trace pre-filled. Based on your "+closedCount+" closed initiative"+(closedCount===1?"":"s")+" and current portfolio state."}
        </div>
      )}

      {/* Error state */}
      {recsErr && !recsLoad && (
        <div style={{padding:"10px 14px",background:dk?"#3a1010":"#fff0f0",border:"1px solid "+(dk?"#6a2020":"#e09090"),borderRadius:6,fontSize:12,color:dk?"#e08080":"#a03030",fontFamily:t.mono}}>
          {recsErr}
        </div>
      )}

      {/* Loading skeleton — three tight rows so it previews the compact state */}
      {recsLoad && (
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {[0,1,2].map(i => (
            <div key={i} style={{padding:"8px 10px",background:dk?"#1a1a14":"#fafaf5",border:"1px solid "+t.border,borderRadius:4,opacity:0.6,display:"flex",alignItems:"center",gap:10}}>
              <div style={{height:10,flex:1,background:t.border,borderRadius:3}}/>
              <div style={{height:10,width:50,background:t.border,borderRadius:3,opacity:0.5}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Modal — full recommendation detail with hypothesis, ICE rationale, reasoning
// trace, and cited learnings. Actions: Add to backlog | Dismiss.
function NextPlaysModal({ t, dk, batchId, recId, recs, items, brands, onAccept, onDismiss, onClose }) {
  const batch = recs.find(b => b.id === batchId);
  const rec = batch ? batch.recommendations.find(r => r.id === recId) : null;
  if (!rec) return null;

  const iceTotal = iceScore(rec.ice.impact, rec.ice.certainty, rec.ice.ease);
  const citedLearnings = (rec.sourceLearningIds || [])
    .map(id => items.find(e => e.id === id))
    .filter(Boolean);

  const isResolved = rec.status !== "pending";

  return (
    <Modal t={t} dk={dk} onClose={onClose} title="Next Play" wide>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Title + meta */}
        <div>
          <div style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.serif,lineHeight:1.3,marginBottom:8}}>{rec.title}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,padding:"2px 8px",border:"1px solid "+t.border,borderRadius:3,textTransform:"uppercase",letterSpacing:"0.04em"}}>{rec.category}</span>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,padding:"2px 8px",border:"1px solid "+t.border,borderRadius:3}}>{rec.brandTarget}</span>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,padding:"2px 8px",border:"1px solid "+t.border,borderRadius:3}}>{rec.initType}</span>
            {isResolved && (
              <span style={{fontSize:10,fontFamily:t.mono,padding:"2px 8px",borderRadius:3,fontWeight:700,
                background: rec.status==="accepted"?(dk?"#1a3a1a":"#e8f5e8"):(dk?"#2a2a2a":"#f0f0f0"),
                color: rec.status==="accepted"?(dk?"#8ad08a":"#2a7a2a"):t.textMuted,
                border:"1px solid "+(rec.status==="accepted"?(dk?"#3a6a3a":"#a0d0a0"):t.border)}}>
                {rec.status==="accepted" ? "✓ Added to backlog" : "✕ Dismissed"}
              </span>
            )}
          </div>
        </div>

        {/* Reasoning trace — the trust-builder */}
        {rec.reasoningTrace && (
          <div style={gSc(t,dk)}>
            <div style={gSL(t)}>Why this, why now</div>
            <p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:14,fontFamily:t.serif}}>{rec.reasoningTrace}</p>
          </div>
        )}

        {/* Hypothesis structure */}
        <div style={gSc(t,dk)}>
          <div style={gSL(t)}>Hypothesis framework</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {rec.observation && (
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>📊 Observation</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{rec.observation}</p>
              </div>
            )}
            {rec.hypothesis && (
              <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:12}}>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>💡 Hypothesis</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:14,fontWeight:600}}>{rec.hypothesis}</p>
              </div>
            )}
            {rec.successMetric && (
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>🎯 Success metric</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{rec.successMetric}</p>
              </div>
            )}
            {rec.killCriteria && (
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>⏹ Kill criteria</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{rec.killCriteria}</p>
              </div>
            )}
          </div>
        </div>

        {/* ICE with rationale */}
        <div style={gSc(t,dk)}>
          <div style={gSL(t)}>ICE scoring — AI suggested</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:14,alignItems:"center"}}>
            <div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                <span style={{fontSize:22,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{rec.ice.impact}</span>
                <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>/10 Impact</span>
              </div>
              {rec.impactRationale && <div style={{fontSize:12,color:t.textSub,lineHeight:1.5,fontFamily:t.mono}}>{rec.impactRationale}</div>}
            </div>
            <div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                <span style={{fontSize:22,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{rec.ice.certainty}</span>
                <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>/10 Certainty</span>
              </div>
              {rec.certaintyRationale && <div style={{fontSize:12,color:t.textSub,lineHeight:1.5,fontFamily:t.mono}}>{rec.certaintyRationale}</div>}
            </div>
            <div style={{textAlign:"center",borderLeft:"1px solid "+t.border,paddingLeft:16}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total</div>
              <div style={{fontSize:24,fontWeight:700,fontFamily:t.serif,color:iceTotal!==null?iceColor(iceTotal,t):t.textMuted}}>{iceTotal!==null?iceTotal:"—"}</div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>/100</div>
            </div>
          </div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:8,fontStyle:"italic"}}>
            Ease is left at 5 — adjust when you add to backlog based on your team's capacity.
          </div>
        </div>

        {/* Cited source learnings — the grounding */}
        {citedLearnings.length > 0 && (
          <div style={gSc(t,dk)}>
            <div style={gSL(t)}>Source learnings — what this is grounded in</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {citedLearnings.map(item => (
                <div key={item.id} style={{padding:"10px 12px",background:dk?"#1a1a14":"#fafaf5",borderLeft:"3px solid "+t.gold,borderRadius:"0 4px 4px 0"}}>
                  <div style={{fontSize:12,fontWeight:700,color:t.text,fontFamily:t.serif,marginBottom:4}}>{item.title}</div>
                  <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,padding:"1px 6px",border:"1px solid "+t.border,borderRadius:3}}>
                      {item.results?.outcomeClassification || "Inconclusive"}
                    </span>
                    <span style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,padding:"1px 6px",border:"1px solid "+t.border,borderRadius:3}}>
                      {brandName(item.brandId, brands)}
                    </span>
                  </div>
                  {item.results?.keyLearning && (
                    <div style={{fontSize:12,color:t.textSub,fontFamily:t.mono,lineHeight:1.5,fontStyle:"italic"}}>"{item.results.keyLearning}"</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions — only if pending */}
        {!isResolved && (
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",borderTop:"1px solid "+t.border,paddingTop:14}}>
            <button onClick={()=>onDismiss(batchId, recId)} style={{...gGh(t),fontSize:12,padding:"7px 14px"}}>
              ✕ Dismiss
            </button>
            <button onClick={()=>onAccept(batchId, recId)} style={{...gG(t),fontSize:12,padding:"7px 14px"}}>
              ✓ Add to backlog
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}


function DashView({t,dk,dash,cats,settings,brands,activeBrand,weeklyMetrics,onLog,onImport,dRange,setDRange,cFrom,cTo,setCFrom,setCTo,onGo,recs,recsLoad,recsErr,items,onGenerateRecs,onOpenRec}) {
  const maxCat  = Math.max(...Object.values(dash.catCounts),1);
  const maxType = Math.max(...Object.values(dash.typeCounts),1);
  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
      {/* North star */}
      <div style={{...gCd(t,dk),background:t.goldBg,border:"1px solid "+t.goldBorder,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.gold,fontFamily:t.mono,marginBottom:4}}>North star</div>
          <div style={{fontSize:15,fontWeight:700,color:t.text,fontFamily:t.serif}}>{settings.northStarMetric}</div>
        </div>
        <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
          <div><div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Current</div><div style={{fontSize:26,fontWeight:700,color:t.gold,fontFamily:t.mono,letterSpacing:"-0.02em"}}>{settings.northStarCurrent}</div></div>
          <div style={{fontSize:20,color:t.textMuted,alignSelf:"center"}}>&#8594;</div>
          <div><div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Target</div><div style={{fontSize:26,fontWeight:700,color:t.text,fontFamily:t.mono,letterSpacing:"-0.02em"}}>{settings.northStarTarget}</div></div>
        </div>
        <div style={{marginLeft:"auto",fontSize:11,color:t.textMuted,fontFamily:t.mono,textAlign:"right"}}>
          {activeBrand!=="all"&&<div style={{fontSize:12,fontWeight:600,color:t.gold,marginBottom:2}}>{brandName(activeBrand,brands)}</div>}
          {settings.businessModel}
        </div>
      </div>

      {/* Attention nudge — overdue and expiring initiatives */}
      {(()=>{
        const today = new Date();
        const expiring = (dash._runningItems||[]).filter(e => {
          if(!e.endDate) return false;
          const days = Math.ceil((new Date(e.endDate+"T12:00:00") - today) / 86400000);
          return days >= 0 && days <= 7;
        });
        const overdue = (dash._runningItems||[]).filter(e => {
          if(!e.startDate) return false;
          const days = Math.ceil((today - new Date(e.startDate+"T12:00:00")) / 86400000);
          return days > 30;
        });
        const nudges = [
          ...expiring.map(e => ({ type:"expiring", item:e })),
          ...overdue.filter(e => !expiring.find(x=>x.id===e.id)).map(e => ({ type:"overdue", item:e })),
        ].slice(0,3);
        if(nudges.length===0) return null;
        return (
          <div style={{padding:"10px 14px",background:dk?"#2a2010":"#fffbf0",border:"1px solid "+(dk?"#6a5010":"#e0c060"),borderRadius:6}}>
            <div style={{fontSize:10,fontWeight:700,color:dk?"#d4a830":"#8a6000",fontFamily:t.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>
              ⚡ {nudges.length} initiative{nudges.length!==1?"s":""} need attention
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {nudges.map(({type,item},i)=>{
                const days = type==="expiring"
                  ? Math.ceil((new Date(item.endDate+"T12:00:00") - today) / 86400000)
                  : Math.ceil((today - new Date(item.startDate+"T12:00:00")) / 86400000);
                return (
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:10,fontWeight:700,fontFamily:t.mono,
                      color:type==="expiring"?(dk?"#e09040":"#a04000"):(dk?"#e08080":"#a03030"),
                      background:type==="expiring"?(dk?"#3a2010":"#fff0e0"):(dk?"#3a1010":"#fff0f0"),
                      border:"1px solid "+(type==="expiring"?(dk?"#7a4010":"#e09060"):(dk?"#7a2020":"#e09090")),
                      borderRadius:3,padding:"1px 6px",flexShrink:0}}>
                      {type==="expiring" ? `ends in ${days}d` : `running ${days}d`}
                    </span>
                    <span style={{fontSize:12,color:t.textSub,fontFamily:t.mono,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</span>
                    {item.owner&&<span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,flexShrink:0}}>{item.owner}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Next Plays — AI-recommended experiments */}
      <NextPlaysCard
        t={t} dk={dk}
        recs={recs}
        recsLoad={recsLoad}
        recsErr={recsErr}
        brands={brands}
        items={items}
        onGenerate={onGenerateRecs}
        onOpenRec={onOpenRec}
      />

      {/* Weekly Pulse */}
      <WeeklyPulseSection
        t={t} dk={dk}
        settings={settings}
        brands={brands}
        weeklyMetrics={weeklyMetrics}
        onLog={onLog}
        onImport={onImport}
      />

      {/* Executive summary */}
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button style={{...gGh(t),fontSize:11,padding:"4px 10px"}}
          onClick={()=>{
            const retailerLabel = activeBrand==="all"?"All retailers":brandName(activeBrand,brands);
            const date = new Date().toLocaleDateString("en-CA",{month:"long",day:"numeric",year:"numeric"});
            const ns = settings.northStarMetric ? settings.northStarMetric : "North Star";
            const headline = dash.revImpacted>0
              ? fmtCur(dash.revImpacted)+" in measured revenue impact from completed work this period."
              : (dash.running+dash.pipeline)+" initiatives in motion; "+fmtCur(dash.revAtRisk)+" of revenue in play.";
            const text = [
              "WEEKLY GROWTH UPDATE — "+retailerLabel,
              date,
              "",
              headline,
              "",
              "— PORTFOLIO —",
              "• "+dash.running+" running · "+dash.pipeline+" in draft · "+dash.completed+" completed this period",
              "• Revenue in play (running): "+fmtCur(dash.revAtRisk),
              "• Avg initiative quality (ICE): "+(dash.avgIce||"n/a"),
              "",
              "— RESULTS —",
              "• Win rate: "+(dash.winRate!==null?dash.winRate+"% ("+dash.wins+" of "+dash.closed+" closed)":"no closed initiatives yet"),
              "• Revenue impacted (completed): "+fmtCur(dash.revImpacted),
              "• ROI on closed work: "+(dash.closedROI!==null?dash.closedROI+"x return":"not yet measurable"),
              "• Avg time to close: "+(dash.avgDays?dash.avgDays+" days":"n/a"),
              "",
              "— FORECAST —",
              "• Probability-weighted revenue in-flight: "+fmtCur(dash.contributionTotals.inflight),
              "• Probability-weighted pipeline: "+fmtCur(dash.contributionTotals.pipeline),
              "• Estimate accuracy to date: "+(dash.calibration!==null?dash.calibration+"%":"not yet measurable"),
              "",
              "Tracked in Growth OS · "+date,
            ].join("\n");
            try { navigator.clipboard.writeText(text); showToast("Executive summary copied — ready to paste.", "success"); } catch { showToast("Couldn't copy to clipboard.", "error"); }
          }}>
          &#128203; Copy executive summary
        </button>
      </div>

      {/* Range */}
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:2,background:t.surfaceAlt,padding:3,borderRadius:9,border:"1px solid "+t.border}}>
          {[["thisMonth","This month"],["lastMonth","Last month"],["custom","Custom"]].map(([v,l])=>(
            <button key={v} onClick={()=>setDRange(v)} style={{fontSize:12,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontFamily:t.sans,fontWeight:dRange===v?600:500,background:dRange===v?t.gold:"transparent",border:"none",color:dRange===v?t.goldText:t.textSub}}>{l}</button>
          ))}
        </div>
        {dRange==="custom"&&<>
          <input type="date" value={cFrom} onChange={e=>setCFrom(e.target.value)} style={{fontSize:12,padding:"6px 9px",borderRadius:9,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.mono}}/>
          <span style={{color:t.textMuted,fontSize:12}}>to</span>
          <input type="date" value={cTo} onChange={e=>setCTo(e.target.value)} style={{fontSize:12,padding:"6px 9px",borderRadius:9,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.mono}}/>
        </>}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
        {[
          {l:"Revenue impacted", v:fmtCur(dash.revImpacted), s:"from completed", hero:true},
          {l:"Revenue at risk",  v:fmtCur(dash.revAtRisk),   s:"running now"},
          {l:"Completed",        v:dash.completed,            s:" "},
          {l:"Killed",           v:dash.killed,               s:" "},
          {l:"Draft pipeline",   v:dash.pipeline,             s:" "},
          {l:"Running",          v:dash.running,              s:" "},
          {l:"Win rate",         v:dash.winRate!==null?dash.winRate+"%":"—", s:dash.wins+"/"+dash.closed+" closed"},
          {l:"Avg to close",     v:dash.avgDays||"—",         s:"days, completed"},
          {l:"Avg ICE",          v:dash.avgIce||"—",          s:"all initiatives"},
          {l:"Closed ROI",        v:dash.closedROI!==null?dash.closedROI+"x":"—", s:"actual rev / cost"},
        ].map(m=>{
          const isMoney = typeof m.v === "string" && m.v.startsWith("$");
          const isPct   = typeof m.v === "string" && m.v.endsWith("%");
          const isMulti = typeof m.v === "string" && m.v.endsWith("x");
          const isFinancial = isMoney || isPct || isMulti;
          return (
          <div key={m.l} style={{background:m.hero?t.goldBg:t.surface,border:"1px solid "+(m.hero?t.goldBorder:t.border),borderRadius:12,padding:"14px 16px",boxShadow:t.shadow,minHeight:96,display:"flex",flexDirection:"column"}}>
            <div style={{fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,fontWeight:600,marginBottom:"auto",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{m.l}</div>
            <div style={{fontSize:26,fontWeight:700,color:isFinancial?t.gold:t.text,fontFamily:t.mono,lineHeight:1,letterSpacing:"-0.03em",marginTop:9}}>{m.v}</div>
            {m.s&&m.s!==" "&&<div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:7,whiteSpace:"nowrap",letterSpacing:"0.02em"}}>{m.s}</div>}
          </div>
          );
        })}
      </div>

      {/* Funnel coverage map — diagnostic: where work & revenue sit across the funnel */}
      <FunnelCoverageMap t={t} dk={dk} items={items} cats={cats} brands={brands} activeBrand={activeBrand}/>

      {/* Contribution to revenue — three-layer breakdown by category */}
      <ContributionView
        t={t} dk={dk}
        contribution={dash.contribution}
        totals={dash.contributionTotals}
        dRange={dRange}
        activeBrand={activeBrand}
        brands={brands}
      />

      {/* Calibration card */}
      <div style={{...gCd(t,dk),border:"1px solid "+(dash.calibration!==null?(dash.calibration>=80?t.goldBorder:dash.calibration>=50?"#c0a030":t.border):t.border)}}>
        <div style={gSL(t)}>Revenue estimate calibration</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,alignItems:"center",marginBottom:dash.totalEstCost>0?12:0}}>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Total estimated</div>
            <div style={{fontSize:22,fontWeight:700,color:t.text,fontFamily:t.mono,letterSpacing:"-0.02em"}}>{fmtCur(dash.totalEstimated)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Total actual</div>
            <div style={{fontSize:22,fontWeight:700,color:t.gold,fontFamily:t.mono,letterSpacing:"-0.02em"}}>{fmtCur(dash.totalActual)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Accuracy</div>
            <div style={{fontSize:24,fontWeight:700,fontFamily:t.serif,color:dash.calibration===null?t.textMuted:dash.calibration>=80?t.gold:dash.calibration>=50?"#c08820":"#c04040"}}>
              {dash.calibration!==null?dash.calibration+"%":"—"}
            </div>
            {dash.calibration!==null&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginTop:2}}>{dash.calibration>=80?"Well calibrated":dash.calibration>=50?"Moderate accuracy":"Overestimating"}</div>}
          </div>
        </div>
        {dash.totalEstCost>0&&(
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+t.border,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Total est. cost</div>
              <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(dash.totalEstCost)}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Total actual cost</div>
              <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.serif}}>{dash.totalActualCost>0?fmtCur(dash.totalActualCost):"—"}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Closed ROI</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:t.serif,color:dash.closedROI===null?t.textMuted:dash.closedROI>=2?t.gold:dash.closedROI>=1?"#c08820":"#c04040"}}>
                {dash.closedROI!==null?dash.closedROI+"x":"—"}
              </div>
              {dash.closedROI!==null&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginTop:2}}>{dash.closedROI>=3?"Strong return":dash.closedROI>=1?"Positive":"Negative"}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Velocity + Category + Type */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
        <div style={gCd(t,dk)}>
          <div style={gSL(t)}>Velocity — last 8 weeks</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[{label:"Started / week",vals:dash.vel.started,color:dk?"#5ad080":"#1a7a48"},{label:"Closed / week",vals:dash.vel.closed,color:dk?"#8080e0":"#4848b0"}].map(row=>(
              <div key={row.label}>
                <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginBottom:4}}>{row.label}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <Spark vals={row.vals} color={row.color} w={120} h={26}/>
                  <span style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.serif}}>{row.vals[row.vals.length-1]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={gCd(t,dk)}>
          <div style={gSL(t)}>By category</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {cats.map(cat=>{
              const n=dash.catCounts[cat]||0,pct=maxCat>0?Math.round((n/maxCat)*100):0;
              return(
                <div key={cat}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:12,color:t.textSub,fontFamily:t.mono}}>{cat}</span>
                    <span style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{n}</span>
                  </div>
                  <div style={{height:5,background:t.border,borderRadius:3}}>
                    <div style={{width:pct+"%",height:"100%",borderRadius:3,background:catColor(cat,cats,dk)}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Type breakdown */}
      <div style={gCd(t,dk)}>
        <div style={gSL(t)}>By initiative type</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {INIT_TYPES.map(tp=>{
            const n=dash.typeCounts[tp]||0,pct=maxType>0?Math.round((n/maxType)*100):0;
            const color=(dk?TYPE_D:TYPE_L)[tp]||t.gold;
            return(
              <div key={tp}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                  <span style={{fontSize:12,color:t.textSub,fontFamily:t.mono}}>{tp}</span>
                  <span style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{n}</span>
                </div>
                <div style={{height:5,background:t.border,borderRadius:3}}>
                  <div style={{width:pct+"%",height:"100%",borderRadius:3,background:color}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outcome breakdown */}
      <div style={gCd(t,dk)}>
        <div style={gSL(t)}>Outcome breakdown — all closed</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {OUTCOMES.map(o=>{const c=(dk?OD:OL)[o]||{};return(
            <div key={o} style={{background:c.bg||t.surfaceAlt,border:"1px solid "+(c.border||t.border),borderRadius:6,padding:"8px 14px",minWidth:80}}>
              <div style={{fontSize:20,fontWeight:700,color:c.text||t.text,fontFamily:t.serif}}>{dash.outCounts[o]||0}</div>
              <div style={{fontSize:11,color:c.text||t.textMuted,opacity:0.85,fontFamily:t.mono}}>{o}</div>
            </div>
          );})}
        </div>
      </div>

      <button style={{...gGh(t),alignSelf:"flex-start"}} onClick={onGo}>View initiatives</button>
    </div>
  );
}

// -- Detail --------------------------------------------------------------------
function DetailView({item,items,t,dk,cats,onEdit,onDelete,onStatus,onResults,onLink,onSaveTestValidity}) {
  const linked = items.filter(e=>item.linkedIds&&item.linkedIds.includes(e.id));
  const score  = iceScore(item.ice&&item.ice.impact,item.ice&&item.ice.certainty,item.ice&&item.ice.ease);
  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
            <CBdg cat={item.category} cats={cats} dk={dk}/>
            <TBdg type={item.initType} dk={dk}/>
            <SBdg s={item.status} dk={dk}/>
            {item.results&&<OBdg o={item.results.outcomeClassification} dk={dk}/>}
            <ICEChip ice={item.ice} t={t}/>
            <EAlert endDate={item.endDate} status={item.status} t={t} dk={dk}/>
            <BlockerBadge blocker={item.blocker}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:2}}>
            {item.initId&&<span style={{fontSize:11,fontWeight:700,color:t.gold,fontFamily:t.mono,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:3,padding:"2px 8px",flexShrink:0}}>{item.initId}</span>}
            <h2 style={{margin:0,fontSize:19,fontWeight:700,color:t.text,lineHeight:1.3,letterSpacing:"-0.02em",fontFamily:t.serif}}>{item.title}</h2>
          </div>
          {item.owner&&<div style={{fontSize:13,color:t.textMuted,marginTop:5,fontFamily:t.mono}}>{item.owner}</div>}
        </div>
        <div style={{display:"flex",gap:6}}>
          <button style={gGh(t)} onClick={onEdit}><span style={{fontSize:12}}>&#9998;</span> Edit</button>
          <button style={{...gGh(t),color:"#c03030",borderColor:dk?"#6a2828":"#e09090"}} onClick={()=>{if(confirm("Delete this initiative?"))onDelete();}}><span style={{fontSize:12}}>&#128465;</span></button>
        </div>
      </div>

      {/* Status */}
      <div style={{...gSc(t,dk),background:t.surfaceAlt}}>
        <div style={gSL(t)}>Status</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {STATUSES.map(s=>{const c=(dk?SD:SL)[s]||{},act=item.status===s;return(
            <button key={s} onClick={()=>onStatus(s)} style={{fontSize:12,padding:"5px 13px",borderRadius:4,cursor:"pointer",fontWeight:600,background:act?c.bg:(dk?"#1a1a14":"#f5f5f0"),border:"1px solid "+(act?c.border:t.border),color:act?c.text:t.textMuted}}>{s}</button>
          );})}
          {(item.status==="Completed"||item.status==="Killed")&&(
            <button style={gG(t)} onClick={onResults}><span style={{fontSize:12}}>&#128203;</span> {item.results?"Edit results":"Log results"}</button>
          )}
        </div>
      </div>

      {/* Blocker warning — full-width attention strip */}
      {item.blocker&&item.blocker!=="None"&&(
        <div style={{background:dk?"#1a1400":"#fffbe6",border:"2px solid #ffd700",borderRadius:6,padding:"10px 16px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 0 0 1px #b8a000"}}>
          <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
          <div>
            <div style={{fontSize:12,fontWeight:800,color:dk?"#ffd700":"#7a5800",letterSpacing:"0.04em",fontFamily:t.mono,textTransform:"uppercase"}}>BLOCKED</div>
            <div style={{fontSize:14,fontWeight:700,color:dk?"#ffd700":"#5a4000",fontFamily:t.serif}}>{item.blocker}</div>
          </div>
        </div>
      )}

      <div style={gSc(t,dk)}>
        <div style={gSL(t)}>Hypothesis framework</div>
        {/* Backwards compatibility: show legacy description if structured fields absent */}
        {(item.observation||item.hypothesis||item.successMetric) ? (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {item.observation&&(
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>📊 Observation — what data prompted this?</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{item.observation}</p>
              </div>
            )}
            {item.hypothesis&&(
              <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:12}}>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>💡 Hypothesis — if we do X, then Y…</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:14,fontWeight:600}}>{item.hypothesis}</p>
              </div>
            )}
            {item.successMetric&&(
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>🎯 Success metric — what KPI determines a win?</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{item.successMetric}</p>
              </div>
            )}
            {/* Legacy fallback: show description if present and no new fields */}
            {!item.observation&&!item.successMetric&&item.hypothesis&&(
              <p style={{margin:0,color:t.textMuted,fontSize:12,fontFamily:t.mono,fontStyle:"italic"}}>Legacy entry — observation and success metric not yet captured.</p>
            )}
          </div>
        ) : (
          <p style={{margin:0,color:t.textMuted,fontStyle:"italic",fontSize:13}}>No hypothesis yet.</p>
        )}
      </div>

      {item.ice&&(
        <div style={gSc(t,dk)}>
          <div style={gSL(t)}>ICE scoring</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr) auto",gap:12,alignItems:"center"}}>
            {[["Impact",item.ice.impact],["Certainty",item.ice.certainty],["Ease",item.ice.ease]].map(([l,v])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
                <div style={{fontSize:22,fontWeight:700,color:t.text,fontFamily:t.serif}}>{v}</div>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>/10</div>
              </div>
            ))}
            <div style={{textAlign:"center",borderLeft:"1px solid "+t.border,paddingLeft:16}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Score</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:t.serif,color:score!==null?iceColor(score,t):t.textMuted}}>{score!==null?score:"—"}</div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>/100</div>
            </div>
          </div>
        </div>
      )}

      {/* Investment & return */}
      {(item.revenueImpact!==0||(item.spendCost||0)>0||(item.resourceCost||0)>0||item.results?.actualRevenueImpact!=null)&&(
        <div style={gSc(t,dk)}>
          <div style={gSL(t)}>Investment and return</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
            {(item.spendCost||0)>0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Est. spend cost</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(item.spendCost)}</div>
            </div>}
            {(item.resourceCost||0)>0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Est. resource cost</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(item.resourceCost)}</div>
            </div>}
            {((item.spendCost||0)+(item.resourceCost||0))>0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Total est. cost</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur((item.spendCost||0)+(item.resourceCost||0))}</div>
            </div>}
            {item.revenueImpact!==0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Est. revenue</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(item.revenueImpact)}</div>
            </div>}
            {item.revenueImpact!==0&&((item.spendCost||0)+(item.resourceCost||0))>0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Est. ROI</div>
              <div style={{fontSize:16,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{((item.revenueImpact||0)/((item.spendCost||0)+(item.resourceCost||0))).toFixed(1)}x</div>
            </div>}
          </div>
          {item.results?.actualRevenueImpact!=null&&(
            <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+t.border}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Actual results</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
                {item.results.actualSpendCost!=null&&<div>
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Actual spend cost</div>
                  <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(item.results.actualSpendCost)}</div>
                </div>}
                {item.results.actualResourceCost!=null&&<div>
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Actual resource cost</div>
                  <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(item.results.actualResourceCost)}</div>
                </div>}
                <div>
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Actual revenue</div>
                  <div style={{fontSize:16,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{fmtCur(item.results.actualRevenueImpact)}</div>
                </div>
                {(()=>{
                  const actCost=(item.results.actualSpendCost||0)+(item.results.actualResourceCost||0);
                  const actRev=item.results.actualRevenueImpact||0;
                  if(!actCost) return null;
                  const roi=(actRev/actCost).toFixed(1);
                  const color=parseFloat(roi)>=2?t.gold:parseFloat(roi)>=1?"#c08820":"#c04040";
                  return <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Actual ROI</div>
                    <div style={{fontSize:20,fontWeight:700,color,fontFamily:t.serif}}>{roi}x</div>
                  </div>;
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {item.status!=="Draft"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
          {[{l:"Primary metric",v:item.primaryMetric},{l:"Start date",v:fmtDate(item.startDate)},{l:"End date",v:fmtDate(item.endDate)},{l:"Sample size",v:item.sampleSize||"—"},{l:"Duration",v:item.duration||"—"}].map(m=>(
            <div key={m.l} style={{background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3,fontFamily:t.mono}}>{m.l}</div>
              <div style={{fontSize:13,color:t.text,fontWeight:600}}>{m.v||"—"}</div>
            </div>
          ))}
        </div>
      )}

      {item.killCriteria&&item.status!=="Draft"&&<div style={gSc(t,dk)}><div style={gSL(t)}>Kill criteria</div><p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:13}}>{item.killCriteria}</p></div>}
      {item.notes&&<div style={gSc(t,dk)}><div style={gSL(t)}>Notes</div><p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:13}}>{item.notes}</p></div>}

      {(item.status==="Running"||item.status==="Completed"||item.status==="Killed")&&(
        <TestValidityPanel key={item.id} item={item} t={t} dk={dk} onSaveTestValidity={onSaveTestValidity}/>
      )}

      {item.results&&(()=>{
        const c=(dk?OD:OL)[item.results.outcomeClassification]||{};
        return (
          <div style={{...gSc(t,dk),background:c.bg,border:"1px solid "+c.border}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
              <div style={gSL(t)}>Results</div>
              <OBdg o={item.results.outcomeClassification} dk={dk}/>
              {item.results.outcomeCertainty&&<span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>Certainty: {item.results.outcomeCertainty}%</span>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {item.results.actualOutcome&&<div><div style={{fontSize:10,color:c.text,opacity:0.7,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,fontFamily:t.mono}}>Actual outcome</div><p style={{margin:0,color:t.textSub,fontSize:13,lineHeight:1.6}}>{item.results.actualOutcome}</p></div>}
              <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:12}}>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3,fontFamily:t.mono}}>Key learning</div>
                <p style={{margin:0,color:dk?"#d4b870":"#6a4a10",fontSize:14,fontStyle:"italic",fontWeight:600}}>{item.results.keyLearning}</p>
              </div>
              {item.results.decisionMade&&<div><div style={{fontSize:10,color:c.text,opacity:0.7,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,fontFamily:t.mono}}>Decision made</div><p style={{margin:0,color:t.textSub,fontSize:13,lineHeight:1.6}}>{item.results.decisionMade}</p></div>}
            </div>
          </div>
        );
      })()}

      {linked.length>0&&(
        <div style={gSc(t,dk)}>
          <div style={gSL(t)}>Linked initiatives</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {linked.map(l=>(
              <div key={l.id} onClick={()=>onLink(l.id)} style={{background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,padding:"10px 14px",cursor:"pointer"}}>
                <div style={{display:"flex",gap:5,marginBottom:4}}><CBdg cat={l.category} cats={cats} dk={dk}/><TBdg type={l.initType} dk={dk}/><SBdg s={l.status} dk={dk}/>{l.results&&<OBdg o={l.results.outcomeClassification} dk={dk}/>}<ICEChip ice={l.ice} t={t}/></div>
                <div style={{fontSize:13,color:t.text,fontWeight:600}}>{l.title}</div>
                {l.results&&l.results.keyLearning&&<div style={{fontSize:12,color:t.textMuted,marginTop:3,fontStyle:"italic"}}>"{l.results.keyLearning}"</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -- Test Validity Panel -------------------------------------------------------
// Stats helpers (no deps)
function calcSampleSize(baseRate, mde, alpha) {
  // Two-sided z-test for proportions, 80% power
  const z_alpha = alpha === 0.05 ? 1.96 : 1.645;
  const z_beta  = 0.8416;
  const p1 = baseRate / 100;
  const p2 = p1 * (1 + mde / 100);
  if (p2 <= 0 || p2 >= 1 || p1 <= 0 || p1 >= 1) return null;
  const n = ((z_alpha + z_beta) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) /
            ((p2 - p1) ** 2);
  return Math.ceil(n);
}

function calcZStat(convC, sessC, convV, sessV) {
  // Guard only on sessions — zero conversions is valid data, not missing data
  if (!sessC || !sessV) return null;
  const p1 = convC / sessC;
  const p2 = convV / sessV;
  const p  = (convC + convV) / (sessC + sessV);
  const se = Math.sqrt(p * (1 - p) * (1 / sessC + 1 / sessV));
  if (se === 0) return null;
  return (p2 - p1) / se;
}

function zToConfidence(z) {
  if (z === null) return null;
  const absZ = Math.abs(z);
  // Abramowitz and Stegun approximation (max error 7.5e-8)
  const t_ = 1 / (1 + 0.2316419 * absZ);
  const poly = t_ * (0.319381530 + t_ * (-0.356563782 + t_ * (1.781477937 + t_ * (-1.821255978 + t_ * 1.330274429))));
  const phi = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ) * poly;
  // Clamp to [0, 1] to guard against floating point overshoot at extreme z-values
  return Math.min(1, Math.max(0, phi * 2 - 1));
}

function TestValidityPanel({ item, t, dk, onSaveTestValidity }) {
  const [baseRate, setBaseRate] = useState(item.testValidity?.baseRate ?? 2);
  const [mde,      setMde]      = useState(item.testValidity?.mde ?? 10);
  const [sigAlpha, setSigAlpha] = useState(item.testValidity?.sigAlpha ?? 0.05);

  const [convC,    setConvC]    = useState(item.testValidity?.convC ?? "");
  const [sessC,    setSessC]    = useState(item.testValidity?.sessC ?? "");
  const [convV,    setConvV]    = useState(item.testValidity?.convV ?? "");
  const [sessV,    setSessV]    = useState(item.testValidity?.sessV ?? "");

  const [counterfactual, setCounterfactual] = useState(item.testValidity?.counterfactual ?? "");

  // Derived
  const n         = calcSampleSize(baseRate, mde, sigAlpha);
  const zStat     = calcZStat(Number(convC), Number(sessC), Number(convV), Number(sessV));
  const confidence= zToConfidence(zStat);
  const conf90    = confidence !== null && confidence >= 0.90;
  const conf95    = confidence !== null && confidence >= 0.95;
  const hasData   = convC !== "" && sessC !== "" && convV !== "" && sessV !== "";

  const uplift = (Number(sessC) > 0 && Number(sessV) > 0 && Number(convC) > 0)
    ? (((Number(convV) / Number(sessV)) - (Number(convC) / Number(sessC))) / (Number(convC) / Number(sessC)) * 100).toFixed(1)
    : null;

  const dirty = JSON.stringify({baseRate,mde,sigAlpha,convC,sessC,convV,sessV,counterfactual}) !==
    JSON.stringify({
      baseRate: item.testValidity?.baseRate ?? 2,
      mde:      item.testValidity?.mde ?? 10,
      sigAlpha: item.testValidity?.sigAlpha ?? 0.05,
      convC:    item.testValidity?.convC ?? "",
      sessC:    item.testValidity?.sessC ?? "",
      convV:    item.testValidity?.convV ?? "",
      sessV:    item.testValidity?.sessV ?? "",
      counterfactual: item.testValidity?.counterfactual ?? "",
    });

  const sigColor = conf95 ? (dk ? "#60d080" : "#1a7a48")
                 : conf90 ? (dk ? "#d0a838" : "#8a6010")
                 : (dk ? "#e08080" : "#a03030");
  const sigBg    = conf95 ? (dk ? "#122a18" : "#edfaf2")
                 : conf90 ? (dk ? "#2a2410" : "#fdf8ee")
                 : (dk ? "#2a1212" : "#fdf0f0");
  const sigBorder= conf95 ? (dk ? "#2a7a40" : "#7adca0")
                 : conf90 ? (dk ? "#6a5818" : "#e0c070")
                 : (dk ? "#6a2828" : "#e09090");

  const labelStyle = {fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3};
  const numStyle   = {fontSize:20,fontWeight:700,fontFamily:t.serif};

  return (
    <div style={{...gSc(t,dk),border:"1px solid "+(dk?"#3a3010":"#ddd090"),background:dk?"#1e1c0a":"#fffef5"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{...gSL(t),marginBottom:0}}>Test Validity</div>
        {dirty&&(
          <button style={{...gG(t),fontSize:11,padding:"3px 10px"}}
            onClick={()=>onSaveTestValidity({baseRate,mde,sigAlpha,convC,sessC,convV,sessV,counterfactual})}>
            Save
          </button>
        )}
      </div>

      {/* 1 — Sample size calculator */}
      <div style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid "+t.border}}>
        <div style={{fontSize:11,fontWeight:700,color:t.textSub,fontFamily:t.mono,marginBottom:10,letterSpacing:"0.04em"}}>
          &#8680; Sample size calculator
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <div style={labelStyle}>Baseline CVR (%)</div>
            <input style={{...gI(t),fontSize:13}} type="number" min="0.1" max="99" step="0.1"
              value={baseRate} onChange={e=>setBaseRate(parseFloat(e.target.value)||0)}/>
          </div>
          <div>
            <div style={labelStyle}>Min detectable effect (%)</div>
            <input style={{...gI(t),fontSize:13}} type="number" min="1" max="200" step="1"
              value={mde} onChange={e=>setMde(parseFloat(e.target.value)||0)}/>
          </div>
          <div>
            <div style={labelStyle}>Confidence level</div>
            <select style={{...gSl(t),fontSize:13}} value={sigAlpha} onChange={e=>setSigAlpha(parseFloat(e.target.value))}>
              <option value={0.05}>95%</option>
              <option value={0.10}>90%</option>
            </select>
          </div>
        </div>
        {n !== null ? (
          <div style={{display:"flex",gap:24,alignItems:"baseline",padding:"10px 12px",background:t.surfaceAlt,borderRadius:6,border:"1px solid "+t.border}}>
            <div>
              <div style={labelStyle}>Sessions needed per variant</div>
              <div style={{...numStyle,color:t.gold}}>{n.toLocaleString()}</div>
            </div>
            <div>
              <div style={labelStyle}>Total sessions</div>
              <div style={{...numStyle,fontSize:16,color:t.textSub}}>{(n*2).toLocaleString()}</div>
            </div>
            <div style={{marginLeft:"auto",fontSize:11,color:t.textMuted,fontFamily:t.mono,maxWidth:180,lineHeight:1.5}}>
              Assumes 80% power, two-sided test.<br/>
              Detects a {mde}% relative change from {baseRate}% CVR.
            </div>
          </div>
        ) : (
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>Enter valid inputs above to calculate.</div>
        )}
      </div>

      {/* 2 — Statistical significance */}
      <div style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid "+t.border}}>
        <div style={{fontSize:11,fontWeight:700,color:t.textSub,fontFamily:t.mono,marginBottom:10,letterSpacing:"0.04em"}}>
          &#8680; Statistical significance — current results
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
          {[
            {label:"Control conversions",  val:convC,  set:setConvC},
            {label:"Control sessions",     val:sessC,  set:setSessC},
            {label:"Variant conversions",  val:convV,  set:setConvV},
            {label:"Variant sessions",     val:sessV,  set:setSessV},
          ].map(f_=>(
            <div key={f_.label}>
              <div style={labelStyle}>{f_.label}</div>
              <input style={{...gI(t),fontSize:13}} type="number" min="0" step="1"
                value={f_.val} onChange={e=>f_.set(e.target.value)}
                placeholder="—"/>
            </div>
          ))}
        </div>
        {hasData && zStat !== null ? (
          <div style={{padding:"10px 12px",background:sigBg,border:"1px solid "+sigBorder,borderRadius:6}}>
            <div style={{display:"flex",gap:24,alignItems:"baseline",flexWrap:"wrap"}}>
              <div>
                <div style={{...labelStyle,color:sigColor}}>Confidence</div>
                <div style={{...numStyle,color:sigColor}}>
                  {(confidence * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div style={{...labelStyle}}>Z-statistic</div>
                <div style={{...numStyle,fontSize:16,color:t.textSub}}>{zStat.toFixed(2)}</div>
              </div>
              {uplift !== null && (
                <div>
                  <div style={labelStyle}>Observed uplift</div>
                  <div style={{...numStyle,fontSize:16,color:parseFloat(uplift)>=0?(dk?"#60d080":"#1a7a48"):(dk?"#e08080":"#a03030")}}>
                    {parseFloat(uplift)>=0?"+":""}{uplift}%
                  </div>
                </div>
              )}
              <div style={{marginLeft:"auto",display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:conf95?"#4caf50":"#ccc"}}/>
                  <span style={{fontSize:11,fontFamily:t.mono,color:conf95?sigColor:t.textMuted}}>
                    {conf95 ? "95% confidence reached" : "95% not yet reached"}
                  </span>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:conf90?"#c08820":"#ccc"}}/>
                  <span style={{fontSize:11,fontFamily:t.mono,color:conf90?sigColor:t.textMuted}}>
                    {conf90 ? "90% confidence reached" : "90% not yet reached"}
                  </span>
                </div>
              </div>
            </div>
            {!conf90&&hasData&&(
              <div style={{marginTop:8,fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5}}>
                Test has not reached statistical significance. Avoid calling a winner early — let it run to the target sample size.
              </div>
            )}
          </div>
        ) : (
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,padding:"8px 0"}}>
            Enter conversion and session counts to evaluate significance.
          </div>
        )}
      </div>

      {/* 3 — Incrementality / counterfactual */}
      <div>
        <div style={{fontSize:11,fontWeight:700,color:t.textSub,fontFamily:t.mono,marginBottom:6,letterSpacing:"0.04em"}}>
          &#8680; Incrementality — counterfactual definition
        </div>
        <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,marginBottom:8,lineHeight:1.5}}>
          Required before marking this initiative Completed. What would have happened without this change?
        </div>
        <textarea style={{...gTA(t),fontSize:13}} rows={3}
          value={counterfactual}
          onChange={e=>setCounterfactual(e.target.value)}
          placeholder={"e.g. Without this test, paid social would have continued driving traffic into a 1.2% CVR funnel — at current spend, that's approx. $80k/mo in lost revenue vs the 1.76% baseline."}/>
        {item.status==="Completed" && !counterfactual && (
          <div style={{marginTop:6,padding:"6px 10px",background:dk?"#2a1212":"#fdf0f0",border:"1px solid "+(dk?"#6a2828":"#e09090"),borderRadius:4,fontSize:11,color:dk?"#e08080":"#a03030",fontFamily:t.mono}}>
            &#9888; Counterfactual is required for Completed initiatives. Define what success would look like vs the null scenario.
          </div>
        )}
        {counterfactual && (
          <div style={{marginTop:6,fontSize:11,color:dk?"#60d080":"#1a7a48",fontFamily:t.mono}}>
            &#10003; Counterfactual defined — incrementality claim is documented.
          </div>
        )}
      </div>
    </div>
  );
}

// -- Form ----------------------------------------------------------------------
function FormView({form,setForm,items,t,dk,cats,brands,aiLoad,iceLoad,hypReview,iceReview,dataCtx,setDataCtx,onAi,onIceAssist,onAcceptHyp,onRejectHyp,onAcceptIce,onRejectIce,onSave,onCancel}) {
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const canAi  = form.hypothesis&&form.hypothesis.length>=60;
  const canIce = !!(form.hypothesis&&form.title);
  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.serif}}>{form._new?"New initiative":"Edit initiative"}</div>

      <FR label="Title *" t={t}><input style={gI(t)} value={form.title} onChange={e=>f("title",e.target.value)} placeholder="e.g. Homepage hero A/B — lifestyle vs product-first creative"/></FR>

      <div style={gSc(t,dk)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={gSL(t)}>Hypothesis framework</div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <FR label="📊 Observation — What data or behaviour prompted this? *" t={t}>
            <textarea style={gTA(t)} rows={2} value={form.observation||""} onChange={e=>f("observation",e.target.value)}
              placeholder="e.g. New-visitor CVR dropped from 1.85% to 0.42% over 4 weeks following the March widget rollout. Paid social mobile traffic is the most affected segment."/>
          </FR>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <label style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>💡 Hypothesis — If we do X, then Y… *</label>
              <button style={{...gGh(t),fontSize:11,padding:"2px 9px",opacity:canAi?1:0.4}} onClick={onAi} disabled={!canAi||aiLoad} title={canAi?"Expand with AI — requires your confirmation":"Write 60+ chars in hypothesis first"}>
                {aiLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Expanding…</>:<><span style={{fontSize:12}}>&#10024;</span> Expand with AI</>}
              </button>
            </div>
            <textarea style={gTA(t)} rows={3} value={form.hypothesis} onChange={e=>f("hypothesis",e.target.value)} placeholder="We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason]."/>
            {!canAi&&form.hypothesis&&form.hypothesis.length>0&&form.hypothesis.length<60&&<div style={{fontSize:11,color:t.textMuted,marginTop:3,fontFamily:t.mono}}>{60-form.hypothesis.length} more chars to unlock AI expand</div>}
            {hypReview&&(
              <div style={{marginTop:10,padding:"12px 14px",borderRadius:6,background:dk?"#122a18":"#edfaf2",border:"1px solid "+(dk?"#2a7a40":"#7adca0")}}>
                <div style={{fontSize:10,color:dk?"#60d080":"#1a7a48",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:8}}>AI suggestion — review before accepting</div>
                <p style={{margin:"0 0 12px",fontSize:13,color:t.text,lineHeight:1.7,fontStyle:"italic"}}>"{hypReview.proposed}"</p>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={onAcceptHyp} style={{...gG(t),fontSize:11,padding:"4px 11px"}}><span>&#10003;</span> Accept</button>
                  <button onClick={onRejectHyp} style={{...gGh(t),fontSize:11,padding:"4px 11px"}}><span>&#10005;</span> Discard</button>
                </div>
              </div>
            )}
          </div>

          <FR label="🎯 Success metric — What KPI determines a win? *" t={t}>
            <input style={gI(t)} value={form.successMetric||""} onChange={e=>f("successMetric",e.target.value)}
              placeholder="e.g. New-visitor CVR recovers to ≥1.76% on paid-social mobile within 3 weeks of rollback."/>
          </FR>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:brands&&brands.length>1?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr",gap:10}}>
        {brands&&brands.length>1&&<FR label="Retailer" t={t}><select style={gSl(t)} value={form.brandId||"default"} onChange={e=>f("brandId",e.target.value)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></FR>}
        <FR label="Category" t={t}><select style={gSl(t)} value={form.category} onChange={e=>f("category",e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select></FR>
        <FR label="Type" t={t}><select style={gSl(t)} value={form.initType||"A/B Test"} onChange={e=>f("initType",e.target.value)}>{INIT_TYPES.map(tp=><option key={tp}>{tp}</option>)}</select></FR>
        <FR label="Owner" t={t}><input style={gI(t)} value={form.owner||""} onChange={e=>f("owner",e.target.value)}/></FR>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Status" t={t}><select style={gSl(t)} value={form.status} onChange={e=>f("status",e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></FR>
        <FR label="Primary metric" t={t}><input style={gI(t)} value={form.primaryMetric||""} onChange={e=>f("primaryMetric",e.target.value)} placeholder="e.g. CVR, ROAS, AOV, CAC"/></FR>
      </div>

      <FR label="⚠️ Blocker" t={t}>
        <select style={{...gSl(t), ...(form.blocker&&form.blocker!=="None"?{borderColor:"#ffd700",background:dk?"#1a1400":"#fffbe6",color:dk?"#ffd700":"#7a5800",fontWeight:700}:{})}}
          value={form.blocker||"None"} onChange={e=>f("blocker",e.target.value)}>
          {BLOCKERS.map(b=><option key={b}>{b}</option>)}
        </select>
        {form.blocker&&form.blocker!=="None"&&(
          <div style={{marginTop:4,fontSize:11,color:dk?"#ffd700":"#8a6000",fontFamily:t.mono,fontWeight:600}}>
            ⚠️ This initiative is flagged as blocked. It will display a warning badge in all views.
          </div>
        )}
      </FR>

      <div style={gSc(t,dk)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={gSL(t)}>ICE Scoring — Impact &#183; Certainty &#183; Ease</div>
          <button style={{...gGh(t),fontSize:11,padding:"2px 9px",opacity:canIce?1:0.4}} onClick={onIceAssist} disabled={!canIce||iceLoad} title={canIce?"Suggest Impact + Certainty with AI":"Add title and hypothesis first"}>
            {iceLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Scoring…</>:<><span style={{fontSize:12}}>&#129302;</span> Suggest Impact + Certainty</>}
          </button>
        </div>
        {iceReview&&(
          <div style={{marginBottom:14,padding:"12px 14px",borderRadius:6,background:dk?"#2a2410":"#fdf8ee",border:"1px solid "+(dk?"#6a5818":"#e0c070")}}>
            <div style={{fontSize:10,color:dk?"#d0a838":"#8a6010",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:10}}>AI scoring suggestion — review and adjust before accepting</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              {[{label:"Impact",score:iceReview.impact,rationale:iceReview.impact_rationale},{label:"Certainty",score:iceReview.certainty,rationale:iceReview.certainty_rationale}].map(d=>(
                <div key={d.label}>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                    <span style={{fontSize:20,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{d.score}</span>
                    <span style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>/10 {d.label}</span>
                  </div>
                  <div style={{fontSize:12,color:t.textSub,lineHeight:1.5,fontFamily:t.mono}}>{d.rationale}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={onAcceptIce} style={{...gG(t),fontSize:11,padding:"4px 11px"}}><span>&#10003;</span> Accept scores</button>
              <button onClick={onRejectIce} style={{...gGh(t),fontSize:11,padding:"4px 11px"}}><span>&#10005;</span> Discard</button>
            </div>
          </div>
        )}
        <ICESliders ice={form.ice||{impact:5,certainty:5,ease:5}} onChange={v=>f("ice",v)} t={t}/>
      </div>

      <FR label="Kill criteria" t={t}><textarea style={gTA(t)} rows={2} value={form.killCriteria||""} onChange={e=>f("killCriteria",e.target.value)} placeholder="e.g. If CVR doesn't improve by ≥0.5pp after 2 weeks on 500+ sessions, kill it. If CAC exceeds $55, pause and review spend allocation."/></FR>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Start date" t={t}><input style={gI(t)} type="date" value={form.startDate||""} onChange={e=>f("startDate",e.target.value)}/></FR>
        <FR label="End date" t={t}><input style={gI(t)} type="date" value={form.endDate||""} onChange={e=>f("endDate",e.target.value)}/></FR>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Sample size" t={t}><input style={gI(t)} value={form.sampleSize||""} onChange={e=>f("sampleSize",e.target.value)}/></FR>
        <FR label="Duration" t={t}><input style={gI(t)} value={form.duration||""} onChange={e=>f("duration",e.target.value)}/></FR>
      </div>
      <div style={{...gSc(t,dk)}}>
        <div style={gSL(t)}>Investment & return</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <FR label="Est. media / spend cost ($)" t={t}><input style={gI(t)} type="number" value={form.spendCost||0} onChange={e=>f("spendCost",parseInt(e.target.value)||0)} placeholder="0"/></FR>
          <FR label="Est. resource cost ($)" t={t}><input style={gI(t)} type="number" value={form.resourceCost||0} onChange={e=>f("resourceCost",parseInt(e.target.value)||0)} placeholder="0"/></FR>
          <FR label="Est. revenue impact ($)" t={t}><input style={gI(t)} type="number" value={form.revenueImpact||0} onChange={e=>f("revenueImpact",parseInt(e.target.value)||0)} placeholder="0"/></FR>
        </div>
        {((form.spendCost||0)+(form.resourceCost||0))>0&&(
          <div style={{marginTop:10,padding:"8px 12px",background:t.surfaceAlt,borderRadius:4,fontSize:12,fontFamily:t.mono,color:t.textMuted,display:"flex",gap:16,flexWrap:"wrap"}}>
            <span>Total est. cost: <strong style={{color:t.text}}>{fmtCur((form.spendCost||0)+(form.resourceCost||0))}</strong></span>
            {(form.revenueImpact||0)>0&&<span>Est. ROI: <strong style={{color:t.gold}}>{((form.revenueImpact||0)/((form.spendCost||0)+(form.resourceCost||0))).toFixed(1)}x</strong></span>}
          </div>
        )}
      </div>

      <div style={{...gSc(t,dk),border:"1px dashed "+t.border}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={gSL(t)}>Data context <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:t.textMuted}}>(optional — used by AI)</span></div>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,background:t.border,padding:"2px 6px",borderRadius:3}}>Placeholder</span>
        </div>
        <textarea style={{...gTA(t),fontSize:12}} rows={3} value={dataCtx} onChange={e=>setDataCtx(e.target.value)} placeholder={"Paste relevant metrics here — CVR, ROAS, sessions, revenue trends, etc.\nExample: Paid social CVR last 4W: 0.42% vs prior 4W: 1.85%. ROAS: 0.24x.\nFuture: will connect to Google Sheets, GA4, Meta Ads."}/>
      </div>

      <FR label="Notes" t={t}><textarea style={gTA(t)} rows={2} value={form.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="Sequencing logic, caveats, context"/></FR>

      <LinkedInitiativePicker form={form} setForm={setForm} items={items} t={t} dk={dk}/>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
        <button style={gGh(t)} onClick={onCancel}>Cancel</button>
        <button style={gG(t)} onClick={onSave} disabled={!form.title}>Save</button>
      </div>
    </div>
  );
}

// -- Settings ------------------------------------------------------------------
function SettingsModal({t,dk,settings,onSave,onClose,onDownloadBackup,onRestoreBackup}) {
  const [local,setLocal]=useState({...settings});
  const [newCat,setNewCat]=useState("");
  const f=(k,v)=>setLocal(p=>({...p,[k]:v}));
  const addCat=()=>{const c=newCat.trim();if(!c||local.categories.includes(c))return;f("categories",[...local.categories,c]);setNewCat("");};
  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title="Settings">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <FR label="Company / workspace name" t={t}><input style={gI(t)} value={local.companyName} onChange={e=>f("companyName",e.target.value)}/></FR>
        <FR label="Business model (one line)" t={t}><input style={gI(t)} value={local.businessModel} onChange={e=>f("businessModel",e.target.value)}/></FR>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>North star metric</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <FR label="Metric name" t={t}><input style={gI(t)} value={local.northStarMetric} onChange={e=>f("northStarMetric",e.target.value)}/></FR>
            <FR label="Current value" t={t}><input style={gI(t)} value={local.northStarCurrent} onChange={e=>f("northStarCurrent",e.target.value)}/></FR>
            <FR label="Target" t={t}><input style={gI(t)} value={local.northStarTarget} onChange={e=>f("northStarTarget",e.target.value)}/></FR>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Categories</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
            {local.categories.map(c=>(
              <span key={c} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600,color:catColor(c,local.categories,dk),background:dk?"#1e1e14":"#f8f7f2",border:"1px solid "+(dk?"#2a2820":"#ddd8c8"),borderRadius:4,padding:"3px 8px"}}>
                {c}<button onClick={()=>f("categories",local.categories.filter(x=>x!==c))} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",padding:0,fontSize:12,lineHeight:1,opacity:0.6}}>&#215;</button>
              </span>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input style={{...gI(t),flex:1}} value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCat();}} placeholder="New category…"/>
            <button style={gG(t)} onClick={addCat}>Add</button>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Retailers / Partners</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:10}}>
            {(local.brands||[]).map((b,i)=>{
              const upd = (k,v) => { const bs=[...(local.brands||[])]; bs[i]={...bs[i],[k]:v}; setLocal(p=>({...p,brands:bs})); };
              return (
              <div key={b.id} style={{padding:"12px 14px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8}}>
                {/* Name row */}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:brandColor(b.id,local.brands||[],dk),flexShrink:0}}/>
                  <input style={{...gI(t),flex:1,padding:"4px 8px",fontWeight:700}} value={b.name}
                    onChange={e=>upd("name",e.target.value)} placeholder="Retailer / brand name"/>
                  {(local.brands||[]).length>1&&<button onClick={()=>setLocal(p=>({...p,brands:(p.brands||[]).filter((_,j)=>j!==i)}))}
                    style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>&#10005;</button>}
                </div>
                {/* Brief fields */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>WHAT THEY SELL</label>
                    <input style={{...gI(t),fontSize:11}} value={b.whatTheySell||""} onChange={e=>upd("whatTheySell",e.target.value)}
                      placeholder="e.g. Premium home décor, $80–$300 AOV"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>CATEGORIES (comma-separated)</label>
                    <input style={{...gI(t),fontSize:11}} value={b.categories||""} onChange={e=>upd("categories",e.target.value)}
                      placeholder="e.g. Home decor, Gifting, Candles"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>ICP (comma-separated)</label>
                    <input style={{...gI(t),fontSize:11}} value={b.icp||""} onChange={e=>upd("icp",e.target.value)}
                      placeholder="e.g. Women 28–45, gifting buyers, high-intent decorators"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>WHY THEY WIN</label>
                    <input style={{...gI(t),fontSize:11}} value={b.whyTheyWin||""} onChange={e=>upd("whyTheyWin",e.target.value)}
                      placeholder="e.g. Visual brand, strong repeat buyer LTV"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>RELATIONSHIP</label>
                    <input style={{...gI(t),fontSize:11}} value={b.relationship||""} onChange={e=>upd("relationship",e.target.value)}
                      placeholder="e.g. Own DTC brand, wholesale account, marketplace"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>CURRENT CONSTRAINT</label>
                    <input style={{...gI(t),fontSize:11}} value={b.constraint||""} onChange={e=>upd("constraint",e.target.value)}
                      placeholder="e.g. CAC rising, thin margin on hero SKU"/>
                  </div>
                </div>
              </div>
            );})}
          </div>
          <button onClick={()=>{const newId="brand-"+Date.now();setLocal(p=>({...p,brands:[...(p.brands||[]),{id:newId,name:"New retailer"}]}));}}
            style={{...gGh(t),fontSize:11}}>+ Add retailer</button>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:4,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>C-Suite Debate Agents</div>
          <p style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5,margin:"0 0 10px"}}>
            Customise the agents that participate in the strategy debate. Edit lenses to match your industry (e.g. "Category Manager" for CPG, "Buyer Relations" for retail).
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
            {(local.agents||DEFAULT_AGENTS).map((agent,i)=>(
              <div key={agent.id} style={{padding:"10px 12px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input style={{...gI(t),width:44,textAlign:"center",padding:"4px",fontSize:18,flexShrink:0}}
                    value={agent.icon}
                    onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],icon:e.target.value};setLocal(p=>({...p,agents:a}));}}/>
                  <input style={{...gI(t),flex:"0 0 80px",fontWeight:700}}
                    value={agent.label}
                    onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],label:e.target.value};setLocal(p=>({...p,agents:a}));}}
                    placeholder="Label"/>
                  <div style={{width:20,height:20,borderRadius:"50%",background:agent.color,flexShrink:0,border:"2px solid "+t.border}}/>
                  {(local.agents||DEFAULT_AGENTS).length>2&&(
                    <button onClick={()=>setLocal(p=>({...p,agents:(p.agents||DEFAULT_AGENTS).filter((_,j)=>j!==i)}))}
                      style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px",marginLeft:"auto"}}>✕</button>
                  )}
                </div>
                <input style={gI(t)} value={agent.lens}
                  onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],lens:e.target.value};setLocal(p=>({...p,agents:a}));}}
                  placeholder="Strategic lens (what this exec focuses on)"/>
                <input style={{...gI(t),fontSize:11}} value={agent.blindspot}
                  onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],blindspot:e.target.value};setLocal(p=>({...p,agents:a}));}}
                  placeholder="Known blindspot (keeps the debate honest)"/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{const newA={id:"agent-"+Date.now(),label:"New",icon:"💼",color:"#888888",lens:"",blindspot:""};setLocal(p=>({...p,agents:[...(p.agents||DEFAULT_AGENTS),newA]}));}}
              style={{...gGh(t),fontSize:11}}>+ Add agent</button>
            <button onClick={()=>setLocal(p=>({...p,agents:DEFAULT_AGENTS}))}
              style={{...gGh(t),fontSize:11}}>Reset to defaults</button>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Backup &amp; restore</div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,lineHeight:1.6,margin:"0 0 10px"}}>Download a full snapshot of your data (initiatives, settings, debates, weekly metrics) as a JSON file. Keep a copy somewhere safe — this is the only off-device record until cloud sync ships.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={onDownloadBackup} style={{...gG(t),fontSize:12}}>&#8659; Download backup</button>
            <label style={{...gGh(t),fontSize:12,cursor:"pointer"}}>
              &#8645; Restore from backup
              <input type="file" accept="application/json,.json" style={{display:"none"}}
                onChange={e=>{ const f=e.target.files?.[0]; if(f){onRestoreBackup(f); e.target.value="";} }}/>
            </label>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:700,color:t.textSub,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Data sources</div>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,background:t.border,padding:"2px 6px",borderRadius:3}}>Placeholder — coming soon</span>
          </div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,lineHeight:1.6,margin:"0 0 8px"}}>Planned: Google Sheets (pulling from GA4, Looker, Meta Ads), BigQuery, direct GA4 and Meta Ads APIs. Paste data manually in the initiative form for now.</p>
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,padding:"10px 12px",background:dk?"#1a1a12":"#f5f5f0",borderRadius:4,border:"1px dashed "+t.border}}>No data sources connected yet.</div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
          <button style={gGh(t)} onClick={onClose}>Cancel</button>
          <button style={gG(t)} onClick={()=>{ onSave(local); }}>Save settings</button>
        </div>
      </div>
    </Modal>
  );
}



// -- Triage View --------------------------------------------------------------
function TriageView({items, t, dk, cats, brands, activeBrand, onDetail}) {
  const today = new Date();
  const in7  = new Date(today); in7.setDate(today.getDate()+7);
  const parseD = d => d ? new Date(d+"T12:00:00") : null;
  const fmtDate = d => d ? new Date(d+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric"}) : "—";

  const brandFilter = e => activeBrand==="all" || (e.brandId||"default")===activeBrand;

  const running = items.filter(e=>e.status==="Running"&&brandFilter(e));
  const draft   = items.filter(e=>e.status==="Draft"&&brandFilter(e));

  // Buckets
  const endingSoon  = running.filter(e=>{ const d=parseD(e.endDate); return d&&d<=in7&&d>=today; });
  const overdue     = running.filter(e=>{ const d=parseD(e.endDate); return d&&d<today; });
  const needsAction = running.filter(e=>!e.killCriteria||!e.primaryMetric||!e.owner);
  const highStake   = running.filter(e=>e.revenueImpact>=50000);
  const topDrafts   = draft.filter(e=>{ const s=e.ice?(e.ice.impact||0)*(e.ice.certainty||0)*(e.ice.ease||0):0; return s>0; })
    .sort((a,b)=>(b.ice.impact*b.ice.certainty*b.ice.ease)-(a.ice.impact*a.ice.certainty*a.ice.ease))
    .slice(0,3);

  const totalAtRisk = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact),0);
  const fmtCur = n => { if(n===0)return"—"; const abs=Math.abs(n); return(abs>=1000?"$"+Math.round(abs/1000)+"k":"$"+abs); };

  const SBdg2 = ({s}) => { const c=(dk?SD:SL)[s]||SL.Draft; return <span style={{fontSize:10,fontWeight:600,color:c.text,background:c.bg,border:"1px solid "+c.border,borderRadius:3,padding:"1px 5px"}}>{s}</span>; };

  const Section = ({title, color, items: list, emptyMsg, children}) => (
    <div style={{...gSc(t,dk),borderLeft:"3px solid "+color}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:list.length?12:0}}>
        <div style={{fontSize:11,fontWeight:700,color,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>{title}</div>
        <span style={{fontSize:12,fontWeight:700,color,fontFamily:t.mono}}>{list.length}</span>
      </div>
      {list.length===0
        ? <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{emptyMsg}</div>
        : <div style={{display:"flex",flexDirection:"column",gap:8}}>{children}</div>}
    </div>
  );

  const InitRow = ({item, showEndDate, showRevenue, urgentDate}) => {
    const daysLeft = item.endDate ? Math.ceil((parseD(item.endDate)-today)/86400000) : null;
    return (
      <div onClick={()=>onDetail(item.id)}
        style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:6,
          background:t.surfaceAlt,cursor:"pointer",border:"1px solid "+t.border}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            {item.initId&&<span style={{fontSize:10,fontWeight:700,color:t.gold,fontFamily:t.mono,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:3,padding:"1px 5px"}}>{item.initId}</span>}
            <SBdg2 s={item.status}/>
            {brands&&brands.length>1&&<span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>{(brands.find(b=>b.id===(item.brandId||"default"))||brands[0]||{}).name}</span>}
            <BlockerBadge blocker={item.blocker}/>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:t.text,fontFamily:t.serif,marginBottom:2}}>{item.title}</div>
          {item.primaryMetric&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>{item.primaryMetric.slice(0,60)}{item.primaryMetric.length>60?"…":""}</div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          {showRevenue&&item.revenueImpact>0&&<span style={{fontSize:12,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{fmtCur(item.revenueImpact)}</span>}
          {showEndDate&&item.endDate&&(
            <span style={{fontSize:11,fontWeight:600,fontFamily:t.mono,
              color:daysLeft!==null&&daysLeft<=3?"#e07070":daysLeft!==null&&daysLeft<=7?"#c09828":t.textMuted}}>
              {daysLeft!==null&&daysLeft<0?"Overdue":daysLeft!==null&&daysLeft===0?"Due today":"Ends "+fmtDate(item.endDate)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>

      {/* This week's focus — opinionated priority card */}
      {(()=>{
        // Compute the 4 signals
        const urgentItem = [...overdue, ...endingSoon.filter(e=>{ const d=parseD(e.endDate); return d&&Math.ceil((d-today)/86400000)<=3; })]
          .sort((a,b)=>Math.max(0,b.revenueImpact||0)-Math.max(0,a.revenueImpact||0))[0] || endingSoon[0] || null;

        const longestBlocked = running
          .filter(e=>e.blocker&&e.blocker!=="None")
          .map(e=>{
            // Estimate how long blocked: use startDate as proxy if no block date stored
            const d = parseD(e.startDate);
            const daysSince = d ? Math.floor((today-d)/86400000) : 0;
            return {...e, daysSince};
          })
          .sort((a,b)=>b.daysSince-a.daysSince)[0] || null;

        const bestDraft = draft
          .filter(e=>e.ice&&e.ice.impact&&e.ice.certainty&&e.ice.ease)
          .map(e=>({...e, iceS:Math.round(((e.ice.impact||0)*(e.ice.certainty||0)*(e.ice.ease||0)/1000)*100)}))
          .sort((a,b)=>b.iceS-a.iceS)[0] || null;

        // North star gap coverage
        const nsGapCovered = (()=>{
          const totalAtRisk = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
          const hasGap = totalAtRisk > 0;
          return {totalAtRisk, hasGap};
        })();

        const signals = [
          urgentItem && {
            icon:"🔴", weight:3,
            label: overdue.includes(urgentItem) ? "Overdue — needs a decision" : "Ending in ≤3 days",
            text: urgentItem.title,
            sub: urgentItem.revenueImpact>0 ? fmtCur(urgentItem.revenueImpact)+" at risk" : urgentItem.endDate ? "End: "+fmtDate(urgentItem.endDate) : null,
            action: "Log results or extend",
            id: urgentItem.id,
            color: "#e07070",
          },
          longestBlocked && {
            icon:"⚠️", weight:2,
            label: "Blocked initiative",
            text: longestBlocked.title,
            sub: longestBlocked.blocker+(longestBlocked.revenueImpact>0?" · "+fmtCur(longestBlocked.revenueImpact)+" at risk":""),
            action: "Resolve or escalate",
            id: longestBlocked.id,
            color: "#c09828",
          },
          bestDraft && bestDraft.iceS >= 40 && {
            icon:"💡", weight:1,
            label: "Highest-leverage uninitiated idea",
            text: bestDraft.title,
            sub: "ICE "+(bestDraft.iceS)+(bestDraft.revenueImpact>0?" · "+fmtCur(bestDraft.revenueImpact)+" potential":""),
            action: "Consider activating",
            id: bestDraft.id,
            color: dk?"#3acca0":"#187860",
          },
        ].filter(Boolean);

        // Revenue coverage signal — always show as a status line, not a card row
        const revLine = nsGapCovered.totalAtRisk > 0
          ? fmtCur(nsGapCovered.totalAtRisk)+" at risk across "+running.length+" running initiative"+(running.length!==1?"s":"")
          : running.length > 0 ? running.length+" running, no revenue estimates set" : "No running initiatives";

        const allClear = signals.length === 0;

        return (
          <div style={{...gSc(t,dk), background: allClear?(dk?"#122a18":"#edfaf2"):t.surface,
            border:"1px solid "+(allClear?(dk?"#2a7a40":"#7adca0"):t.border)}}>

            {/* Header row */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:allClear?4:12}}>
              <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",
                color:allClear?(dk?"#60d080":"#1a7a48"):t.textMuted,fontFamily:t.mono,fontWeight:700}}>
                {new Date().toLocaleDateString("en-CA",{weekday:"long",month:"long",day:"numeric"})}
              </div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>{revLine}</div>
            </div>

            {allClear ? (
              <div style={{fontSize:13,color:dk?"#60d080":"#1a7a48",fontFamily:t.mono}}>
                ✓ Nothing urgent. Good week to activate a draft or run the Signal debate.
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {signals.map((s,i)=>(
                  <div key={i} onClick={()=>onDetail(s.id)}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"10px 13px",
                      borderRadius:6,cursor:"pointer",
                      background:t.surfaceAlt,border:"1px solid "+t.border,
                      borderLeft:"3px solid "+s.color,
                      transition:"background 0.12s"}}>
                    <span style={{fontSize:16,flexShrink:0}}>{s.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:s.color,fontFamily:t.mono,fontWeight:700,
                        textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{s.label}</div>
                      <div style={{fontSize:13,fontWeight:600,color:t.text,fontFamily:t.serif,
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.text}</div>
                      {s.sub&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginTop:1}}>{s.sub}</div>}
                    </div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,
                      flexShrink:0,textAlign:"right",lineHeight:1.4}}>
                      {s.action} →
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Stats strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8}}>
        {[
          {l:"Running",          v:running.length},
          {l:"Ending this week", v:endingSoon.length+overdue.length},
          {l:"Revenue at risk",  v:fmtCur(totalAtRisk)},
          {l:"Needs attention",  v:needsAction.length+overdue.length},
        ].map(m=>(
          <div key={m.l} style={{...gCd(t,dk),padding:"10px 12px"}}>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:3}}>{m.l}</div>
            <div style={{fontSize:20,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Overdue */}
      <Section title="Overdue — end date passed" color="#e07070" items={overdue} emptyMsg="Nothing overdue.">
        {overdue.map(e=><InitRow key={e.id} item={e} showEndDate showRevenue/>)}
      </Section>

      {/* Ending this week */}
      <Section title="Ending this week — decide now" color="#c09828" items={endingSoon} emptyMsg="Nothing ending this week.">
        {endingSoon.map(e=><InitRow key={e.id} item={e} showEndDate showRevenue/>)}
      </Section>

      {/* High stakes */}
      <Section title="High stakes — $50k+ revenue at risk" color={dk?"#8080e0":"#4848b0"} items={highStake} emptyMsg="No high-stakes initiatives running.">
        {highStake.map(e=><InitRow key={e.id} item={e} showEndDate showRevenue/>)}
      </Section>

      {/* Incomplete — missing owner / metric / kill criteria */}
      <Section title="Incomplete setup — missing owner, metric, or kill criteria" color={dk?"#e08080":"#a03030"} items={needsAction} emptyMsg="All running initiatives are properly configured.">
        {needsAction.map(e=>(
          <div key={e.id} onClick={()=>onDetail(e.id)}
            style={{...gSc(t,dk),cursor:"pointer",padding:"10px 12px"}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
              {e.initId&&<span style={{fontSize:10,fontWeight:700,color:t.gold,fontFamily:t.mono,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:3,padding:"1px 5px"}}>{e.initId}</span>}
            </div>
            <div style={{fontSize:13,fontWeight:600,color:t.text,marginBottom:6,fontFamily:t.serif}}>{e.title}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {!e.owner&&<span style={{fontSize:11,fontFamily:t.mono,color:"#e07070",background:dk?"#2a1010":"#fdf0f0",border:"1px solid #e09090",borderRadius:3,padding:"1px 6px"}}>No owner</span>}
              {!e.primaryMetric&&<span style={{fontSize:11,fontFamily:t.mono,color:"#e07070",background:dk?"#2a1010":"#fdf0f0",border:"1px solid #e09090",borderRadius:3,padding:"1px 6px"}}>No metric</span>}
              {!e.killCriteria&&<span style={{fontSize:11,fontFamily:t.mono,color:"#e07070",background:dk?"#2a1010":"#fdf0f0",border:"1px solid #e09090",borderRadius:3,padding:"1px 6px"}}>No kill criteria</span>}
            </div>
          </div>
        ))}
      </Section>

      {/* Top drafts ready to start */}
      <Section title="Top drafts by ICE — ready to prioritise" color={dk?"#3acca0":"#187860"} items={topDrafts} emptyMsg="No scored drafts in the pipeline.">
        {topDrafts.map(e=>(
          <div key={e.id} onClick={()=>onDetail(e.id)}
            style={{...gSc(t,dk),cursor:"pointer",padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                  {e.initId&&<span style={{fontSize:10,fontWeight:700,color:t.gold,fontFamily:t.mono,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:3,padding:"1px 5px"}}>{e.initId}</span>}
                  {brands&&brands.length>1&&<span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>{(brands.find(b=>b.id===(e.brandId||"default"))||brands[0]||{}).name}</span>}
                </div>
                <div style={{fontSize:13,fontWeight:600,color:t.text,fontFamily:t.serif}}>{e.title}</div>
                {e.revenueImpact>0&&<div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,marginTop:2}}>{fmtCur(e.revenueImpact)} estimated impact</div>}
              </div>
              <span style={{fontSize:11,fontWeight:700,color:t.gold,fontFamily:t.mono,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:4,padding:"3px 8px",flexShrink:0}}>
                ICE {Math.round(((e.ice.impact||0)*(e.ice.certainty||0)*(e.ice.ease||0)/1000)*100)}
              </span>
            </div>
          </div>
        ))}
      </Section>

    </div>
  );
}
// -- Linked Initiative Picker -------------------------------------------------
function LinkedInitiativePicker({form, setForm, items, t, dk}) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);

  const linked = (form.linkedIds||[]);
  const f = (v) => setForm(p=>({...p, linkedIds:v}));

  const candidates = items.filter(e=>{
    if (e.id === form.id) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return e.title.toLowerCase().includes(q) || (e.initId||"").toLowerCase().includes(q);
  }).slice(0, 8);

  const linkedItems = items.filter(e=>linked.includes(e.id));

  const toggle = (id) => {
    f(linked.includes(id) ? linked.filter(x=>x!==id) : [...linked, id]);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>Link related initiatives</label>

      {/* Selected chips */}
      {linkedItems.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {linkedItems.map(e=>(
            <span key={e.id} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,padding:"3px 9px",borderRadius:4,background:dk?"#122a18":"#edfaf2",border:"1px solid "+(dk?"#2a7a40":"#7adca0"),color:dk?"#60d080":"#1a7a48",fontFamily:t.mono}}>
              {e.initId&&<span style={{opacity:0.7}}>{e.initId}</span>}
              {e.title.slice(0,32)}{e.title.length>32?"…":""}
              <button onClick={()=>toggle(e.id)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",padding:"0 0 0 2px",fontSize:12,lineHeight:1}}>&#10005;</button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{position:"relative"}}>
        <input style={gI(t)} value={query}
          onChange={e=>{setQuery(e.target.value);setOpen(true);}}
          onFocus={()=>setOpen(true)}
          onBlur={()=>setTimeout(()=>setOpen(false),200)}
          placeholder="Search by title or ID (e.g. NH-001)…"/>

        {/* Dropdown */}
        {open&&candidates.length>0&&(
          <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,background:t.surface,border:"1px solid "+t.border,borderRadius:6,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",maxHeight:220,overflowY:"auto"}}>
            {candidates.map(e=>{
              const isLinked = linked.includes(e.id);
              const c=(dk?SD:SL)[e.status]||SL.Draft;
              return (
                <div key={e.id} onMouseDown={()=>toggle(e.id)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",
                    background:isLinked?(dk?"#122a18":"#edfaf2"):t.surface,
                    borderBottom:"1px solid "+t.border}}>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,minWidth:52,flexShrink:0}}>{e.initId||"—"}</span>
                  <span style={{fontSize:12,color:t.text,flex:1,fontFamily:t.mono}}>{e.title.slice(0,50)}{e.title.length>50?"…":""}</span>
                  <span style={{fontSize:10,fontWeight:600,color:c.text,background:c.bg,border:"1px solid "+c.border,borderRadius:3,padding:"1px 5px",flexShrink:0}}>{e.status}</span>
                  {isLinked&&<span style={{fontSize:11,color:dk?"#60d080":"#1a7a48"}}>&#10003;</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!open&&!query&&linkedItems.length===0&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>Start typing to search initiatives…</div>}
    </div>
  );
}
// -- Learning Library ---------------------------------------------------------
function LearningLibrary({items, t, dk, cats, brands, activeBrand, onReplicate, settings}) {
  const [activeOutcomes, setActiveOutcomes] = useState(["Jackpot","Success"]);
  const [fCat,  setFCat]  = useState("All");
  const [fType, setFType] = useState("All");
  const [query, setQuery] = useState("");
  const [synthesis,    setSynthesis]    = useState("");
  const [synthLoad,    setSynthLoad]    = useState(false);
  const [synthVisible, setSynthVisible] = useState(false);

  const normB = id => (!id||id==="default") ? (brands&&brands[0]&&brands[0].id||"default") : id;
  const closed = useMemo(()=>items.filter(e=>(e.status==="Completed"||e.status==="Killed")&&e.results&&e.results.keyLearning&&(activeBrand==="all"||normB(e.brandId)===normB(activeBrand))),[items,activeBrand,brands]);

  const counts = useMemo(()=>{
    const c={};
    ["Jackpot","Success","Failed","Inconclusive"].forEach(o=>{c[o]=closed.filter(e=>e.results.outcomeClassification===o).length;});
    return c;
  },[closed]);

  const filtered = useMemo(()=>{
    return closed.filter(e=>{
      if(!activeOutcomes.includes(e.results.outcomeClassification)) return false;
      if(fCat!=="All"&&e.category!==fCat) return false;
      if(fType!=="All"&&e.initType!==fType) return false;
      if(query.trim()){
        const q=query.toLowerCase();
        return e.results.keyLearning.toLowerCase().includes(q)||e.title.toLowerCase().includes(q);
      }
      return true;
    }).sort((a,b)=>(b.endDate||b.createdAt).localeCompare(a.endDate||a.createdAt));
  },[closed,activeOutcomes,fCat,fType,query]);

  const toggleOutcome = (o)=>{
    setActiveOutcomes(prev=>prev.includes(o)?prev.filter(x=>x!==o):[...prev,o]);
  };

  const gI2 = (t)=>({...gI(t),width:"auto",flex:1,minWidth:160});

  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:16}}>

      {/* Outcome summary tiles */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {["Jackpot","Success","Failed","Inconclusive"].map(o=>{
          const c=(dk?OD:OL)[o]||{};
          const active=activeOutcomes.includes(o);
          return (
            <button key={o} onClick={()=>toggleOutcome(o)}
              style={{border:"2px solid "+(active?c.border:t.border),borderRadius:8,padding:"12px 10px",
                background:active?c.bg:t.surface,cursor:"pointer",textAlign:"center",
                transition:"all 0.15s",opacity:active?1:0.45}}>
              <div style={{fontSize:28,fontWeight:700,color:active?c.text:t.textMuted,fontFamily:t.serif,lineHeight:1}}>{counts[o]||0}</div>
              <div style={{fontSize:11,fontWeight:600,color:active?c.text:t.textMuted,fontFamily:t.mono,marginTop:4,letterSpacing:"0.04em"}}>{o}</div>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:180}}>
          <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Search learnings</label>
          <input style={gI2(t)} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Keyword across learnings and titles..."/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Category</label>
          <select value={fCat} onChange={e=>setFCat(e.target.value)} style={{...gSl(t),minWidth:130}}>{["All",...cats].map(c=><option key={c}>{c}</option>)}</select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Type</label>
          <select value={fType} onChange={e=>setFType(e.target.value)} style={{...gSl(t),minWidth:120}}>{["All",...INIT_TYPES].map(tp=><option key={tp}>{tp}</option>)}</select>
        </div>
      </div>

      {/* Count + Synthesise */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>
          {filtered.length} learning{filtered.length!==1?"s":""} {query?"matching":""}
          {filtered.length===0&&closed.length>0&&<span style={{color:t.gold}}> — try adjusting filters or clicking more outcome tiles above</span>}
        </div>
        {filtered.length>=2&&(
          <button style={{...gGh(t),fontSize:11,padding:"4px 10px"}} disabled={synthLoad}
            onClick={async()=>{
              setSynthLoad(true); setSynthVisible(true); setSynthesis("");
              try {
                const payload = filtered.map(e=>({
                  outcome: e.results.outcomeClassification,
                  category: e.category,
                  retailer: brandName(e.brandId||"default", brands),
                  learning: e.results.keyLearning,
                }));
                const result = await callSynthesiseLearnings(payload, settings||{companyName:COMPANY_NAME,businessModel:BUSINESS_MODEL,northStarMetric:NORTH_STAR_METRIC,northStarCurrent:"—",northStarTarget:"—"});
                setSynthesis(result);
              } catch { setSynthesis("Synthesis failed — check your API key in Settings."); }
              setSynthLoad(false);
            }}>
            {synthLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Synthesising…</>:<><span>&#10024;</span> Synthesise learnings</>}
          </button>
        )}
      </div>

      {/* Synthesis panel */}
      {synthVisible&&(
        <div style={{...gSc(t,dk),background:dk?"#1a2a18":"#f0faf2",border:"1px solid "+(dk?"#2a6a40":"#7adca0")}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:dk?"#60d080":"#1a7a48",fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>AI Synthesis — {filtered.length} learnings</div>
            <button onClick={()=>setSynthVisible(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14}}>&#10005;</button>
          </div>
          {synthLoad
            ?<div style={{fontSize:13,color:t.textMuted,fontFamily:t.mono}}>Analysing learnings…</div>
            :synthesis
              ?<div style={{fontSize:13,color:t.textSub,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:t.mono}}>{synthesis}</div>
              :<div style={{fontSize:12,color:dk?"#e08080":"#a03030",fontFamily:t.mono}}>Synthesis failed — check that your API proxy is deployed and the API key is configured.</div>
          }
        </div>
      )}

      {/* Empty state */}
      {closed.length===0&&(
        <div style={{padding:"48px 24px",textAlign:"center",color:t.textMuted,fontFamily:t.mono,border:"1px dashed "+t.border,borderRadius:8}}>
          <div style={{fontSize:32,marginBottom:12}}>&#128218;</div>
          <div style={{fontSize:14,marginBottom:6,color:t.text}}>No learnings yet</div>
          <div style={{fontSize:12}}>Learnings appear here when you close an initiative and log results.</div>
        </div>
      )}

      {/* Learning cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(item=>{
          const c=(dk?OD:OL)[item.results.outcomeClassification]||{};
          const isWin=item.results.outcomeClassification==="Jackpot"||item.results.outcomeClassification==="Success";
          return (
            <div key={item.id} style={{background:t.surface,border:"1px solid "+(c.border||t.border),borderRadius:8,overflow:"hidden"}}>
              {/* Outcome stripe */}
              <div style={{height:3,background:c.border||t.border}}/>
              <div style={{padding:"16px 18px"}}>
                {/* Badges row */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
                  <OBdg o={item.results.outcomeClassification} dk={dk}/>
                  <CBdg cat={item.category} cats={cats} dk={dk}/>
                  <TBdg type={item.initType} dk={dk}/>
                  {brands&&brands.length>1&&<Bdg label={brandName(item.brandId||"default",brands)} color={brandColor(item.brandId||"default",brands,dk)} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"}/>}
                  {item.endDate&&<span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginLeft:"auto"}}>{fmtDate(item.endDate)}</span>}
                </div>

                {/* The learning — hero element */}
                <div style={{borderLeft:"3px solid "+c.border,paddingLeft:14,marginBottom:14}}>
                  <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:6}}>Key learning</div>
                  <p style={{margin:0,fontSize:16,fontWeight:600,color:t.text,lineHeight:1.6,fontFamily:t.serif,fontStyle:"italic"}}>
                    "{item.results.keyLearning}"
                  </p>
                </div>

                {/* Initiative title */}
                <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,marginBottom:item.results.decisionMade?10:0}}>
                  From: <span style={{color:t.textSub,fontWeight:600}}>{item.title}</span>
                </div>

                {/* Decision made — collapsed but visible */}
                {item.results.decisionMade&&(
                  <div style={{fontSize:12,color:t.textSub,fontFamily:t.mono,lineHeight:1.5,padding:"8px 10px",background:t.surfaceAlt,borderRadius:4,marginBottom:10}}>
                    <span style={{color:t.textMuted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>Decision: </span>
                    {item.results.decisionMade}
                  </div>
                )}

                {/* Revenue delta if available */}
                {item.revenueImpact!==0&&(
                  <div style={{display:"flex",gap:16,fontSize:12,fontFamily:t.mono,color:t.textMuted,marginBottom:10}}>
                    <span>Est: <strong style={{color:t.text}}>{fmtCur(item.revenueImpact)}</strong></span>
                    {item.results.actualRevenueImpact!=null&&(
                      <span>Actual: <strong style={{color:t.gold}}>{fmtCur(item.results.actualRevenueImpact)}</strong></span>
                    )}
                  </div>
                )}

                {/* Actions */}
                {isWin&&(
                  <button onClick={()=>onReplicate(item)}
                    style={{...gG(t),fontSize:11,padding:"5px 12px",marginTop:4}}>
                    &#8635; Replicate this initiative
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
