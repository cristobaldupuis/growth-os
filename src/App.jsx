import { useState, useEffect, useMemo } from "react";

const KEY_ITEMS    = "gos_items_v4";

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
const KEY_SETTINGS = "gos_settings_v2";
const KEY_THEME    = "gos_theme_v1";

const DEFAULT_SETTINGS = {
  companyName:      "Growth OS",
  businessModel:    "Multi-retailer growth portfolio",
  northStarMetric:  "Portfolio Revenue",
  northStarCurrent: "$1.1M/mo",
  northStarTarget:  "$1.4M/mo",
  categories:       ["Paid Media","Organic","Conversion","Merchandising","Retention","Brand","Data / Analytics"],
  dataSources:      [],
  brands:           [
    {id:"default", name:"Northcove Home"},
    {id:"r1",      name:"Retailer 1"},
    {id:"r2",      name:"Retailer 2"},
  ],
};

const STATUSES  = ["Draft","Running","Completed","Killed"];
const OUTCOMES  = ["Jackpot","Success","Failed","Inconclusive"];
const INIT_TYPES = ["A/B Test","Campaign","Process","Research","Infrastructure"];

const TL = {
  bg:"#f8f8f4", surface:"#ffffff", surfaceAlt:"#f3f2ea",
  border:"#e8e4d8", text:"#1a1a14", textSub:"#555040", textMuted:"#9a9880",
  gold:"#c08820", goldText:"#ffffff", goldBg:"#fdf8ee", goldBorder:"#e8c870",
  headerBg:"#ffffff", inputBg:"#ffffff", inputBorder:"#e0dcd0",
  mono:"'Courier New',monospace", serif:"'Georgia',serif",
};
const TD = {
  bg:"#111108", surface:"#161610", surfaceAlt:"#1d1d12",
  border:"#2a2820", text:"#e8e4d4", textSub:"#a8a488", textMuted:"#666450",
  gold:"#d4a83a", goldText:"#111111", goldBg:"#2a2410", goldBorder:"#6a5820",
  headerBg:"#0e0e08", inputBg:"#1a1a12", inputBorder:"#2e2c20",
  mono:"'Courier New',monospace", serif:"'Georgia',serif",
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

const TEMPLATES = [
  { id:"ab",        label:"A/B Test",          icon:"ti-test-pipe",    initType:"A/B Test",       description:"Split traffic between two variants to measure conversion impact.",           defaults:{ hypothesis:"We believe that [changing X] will result in [metric improvement] for [audience], because [evidence or reasoning].", primaryMetric:"Conversion rate on [page/flow]", killCriteria:"No statistically significant improvement (p<0.05) at [n] sessions per variant within [timeframe]. Use sequential testing.", sampleSize:"[n] sessions per variant", duration:"[2-4] weeks" } },
  { id:"channel",   label:"Channel Experiment", icon:"ti-speakerphone", initType:"Campaign",       description:"Test a new or underinvested acquisition or retention channel.",              defaults:{ hypothesis:"We believe that investing in [channel] will result in [CAC/ROAS/volume] improvement for [audience segment], because [analogues or prior signal].", primaryMetric:"Incremental ROAS / CAC vs current channel mix", killCriteria:"ROAS below [threshold] after [$spend] at [timeframe].", sampleSize:"$[budget] test spend", duration:"[3-6] weeks" } },
  { id:"pricing",   label:"Pricing / Promo",    icon:"ti-tag",          initType:"Campaign",       description:"Test price point, discount structure, or promotional mechanic.",              defaults:{ hypothesis:"We believe that [price change / promo structure] will result in [revenue / margin / conversion] improvement, because [price elasticity signal or competitive context].", primaryMetric:"Revenue per visitor; gross margin impact", killCriteria:"No improvement in revenue per visitor after [n] orders. Gross margin must not fall below [threshold].", sampleSize:"[n] orders", duration:"[2-3] weeks" } },
  { id:"landing",   label:"Landing Page / PDP", icon:"ti-layout",       initType:"A/B Test",       description:"Test content, layout, or trust signals on a conversion-driving page.",        defaults:{ hypothesis:"We believe that [content/layout change] on [page] will result in [CVR/ATC/bounce improvement] for [traffic segment], because [friction or trust signal identified].", primaryMetric:"CVR on [page]; secondary: ATC rate / bounce rate", killCriteria:"No CVR improvement on affected pages after [n] sessions or [timeframe] vs prior baseline.", sampleSize:"[n] sessions", duration:"[2-3] weeks" } },
  { id:"lifecycle", label:"Lifecycle / CRM",    icon:"ti-mail",         initType:"Campaign",       description:"Test a new email, SMS, or retention flow targeting a specific segment.",      defaults:{ hypothesis:"We believe that [new flow / message] sent to [segment] will result in [reactivation / retention / LTV] improvement, because [segment behaviour or prior engagement signal].", primaryMetric:"Reactivation rate / repeat purchase rate within [n] days", killCriteria:"Response rate below [threshold] after [n] sends to [n]+ recipients.", sampleSize:"[n] customers", duration:"[4-6] weeks" } },
  { id:"merch",     label:"Merch / Assortment", icon:"ti-shirt",        initType:"Process",        description:"Test a merchandising change — bundle, sequencing, curation, or OOS handling.", defaults:{ hypothesis:"We believe that [merchandising change] will result in [AOV / attach rate / return rate] improvement, because [customer behaviour or friction identified].", primaryMetric:"AOV / attach rate / return rate on affected SKUs or pages", killCriteria:"No improvement vs prior 2W baseline after [n] orders or [timeframe].", sampleSize:"[n] orders / [n] sessions", duration:"[2-4] weeks" } },
];

const SEED = [
  { id:"e01", initId:"NH-001", title:"Widget A/B — Pause Personalization on Mobile Collection Pages", initType:"A/B Test", hypothesis:"Removing personalization widgets from paid-social mobile entry traffic to lighting and living room collections will recover CVR toward prior 4W baseline (1.85%) by eliminating load-time and rendering friction introduced in late March.", category:"Conversion", owner:"Site / Product", primaryMetric:"CVR on paid-social mobile entry", killCriteria:"Cell B CVR >= 1.76% = widgets confirmed as cause. Cell B flat = widen investigation.", status:"Running", startDate:"2026-05-12", endDate:"2026-06-07", ice:{impact:9,certainty:7,ease:8}, revenueImpact:118352, linkedIds:["e02","e03","e04"], results:null, createdAt:"2026-05-10", brandId:"default", notes:"Cell A: widgets on. Cell B: widgets off. Scoped to paid-social mobile only." },
  { id:"e02", initId:"NH-002", title:"PDP Content Fix — Delivery Clarity, Swatches, OOS on Top 20 SKUs", initType:"Process", hypothesis:"Fixing delivery messaging, swatch clarity, and OOS display on the top 20 traffic-driving SKUs will reduce checkout abandonment and improve new-visitor CVR by 15-20% on affected PDPs.", category:"Merchandising", owner:"Merch + Site", primaryMetric:"New-visitor CVR on top 20 SKUs; care ticket volume", killCriteria:"No CVR improvement on affected SKUs after 2 weeks vs prior baseline.", status:"Running", startDate:"2026-05-12", endDate:"2026-05-26", ice:{impact:7,certainty:8,ease:7}, revenueImpact:34112, linkedIds:["e01","e03"], results:null, createdAt:"2026-05-10", brandId:"default", notes:"Runs parallel to widget test." },
  { id:"e03", initId:"NH-003", title:"Weekly Growth Triage — Collection Health Scorecard", initType:"Process", hypothesis:"A shared weekly triage with a scored collection-page health system will reduce mean time to intervention on conversion problems by at least 50% by eliminating the five-team information silo.", category:"Conversion", owner:"Director of Growth", primaryMetric:"Mean time to intervention; scorecard adoption across 5 functions", killCriteria:"If triage fails to produce one owner-assigned action per week after 3 sessions, redesign.", status:"Running", startDate:"2026-05-12", endDate:"2026-06-30", ice:{impact:6,certainty:9,ease:8}, revenueImpact:0, linkedIds:["e01","e02","e04"], results:null, createdAt:"2026-05-10", brandId:"default", notes:"Monday cadence." },
  { id:"e04", initId:"NH-004", title:"Mobile PDP QA Walk — New Customer Entry Products", initType:"Research", hypothesis:"A structured mobile PDP audit of new-visitor entry products will uncover rendering, load, and trust issues contributing to the 11-12x CVR gap between new visitors and returning customers.", category:"Conversion", owner:"Director of Growth", primaryMetric:"Actionable issues found per PDP; % resolved within 2 weeks", killCriteria:"Discovery task — output is a prioritized bug list.", status:"Completed", startDate:"2026-05-12", endDate:"2026-05-19", ice:{impact:7,certainty:9,ease:9}, revenueImpact:0, linkedIds:["e01","e02"], results:{ actualOutcome:"14 actionable issues found across 12 PDPs. Swatch rendering broken on 6 lighting SKUs. Delivery messaging absent on 4 living room hero SKUs. Avg load time 5.1s.", keyLearning:"New visitors hit a materially degraded PDP experience independent of widgets — fixing content and load in parallel is not optional.", outcomeClassification:"Success", decisionMade:"8 of 14 issues resolved same week. Remaining 6 tracked in weekly triage.", outcomeCertainty:90, actualRevenueImpact:0 }, createdAt:"2026-05-10", brandId:"default" },
  { id:"e05", initId:"NH-005", title:"Paid Social Spend Hold — No Budget Increase Until CVR Recovers", initType:"Process", hypothesis:"Holding paid social spend flat until new-visitor CVR recovers to >= 1.76% will improve incremental ROAS from 0.24x by stopping paid volume from flowing into a broken funnel.", category:"Paid Media", owner:"Paid + Director of Growth", primaryMetric:"Incremental ROAS; new-visitor CVR WoW", killCriteria:"Hold lifted when widget test resolves and CVR recovers to >= 1.76%.", status:"Running", startDate:"2026-05-12", endDate:"2026-06-07", ice:{impact:8,certainty:9,ease:9}, revenueImpact:80000, linkedIds:["e01","e06"], results:null, createdAt:"2026-05-10", brandId:"default", notes:"Incremental ROAS last 4W = 0.24x." },
  { id:"e06", initId:"R1-001", title:"Email Welcome Series — Reduce First-Purchase Drop-off", initType:"Campaign", hypothesis:"A 3-email welcome series sent within 48h of signup will increase first-purchase conversion rate by 12% by building product trust before discount dependency forms.", category:"Retention", owner:"CRM", primaryMetric:"First-purchase CVR within 30 days of signup", killCriteria:"No improvement in first-purchase CVR vs control after 4 weeks with 2,000+ recipients.", status:"Running", startDate:"2026-05-01", endDate:"2026-06-15", ice:{impact:7,certainty:7,ease:8}, revenueImpact:38000, linkedIds:[], results:null, createdAt:"2026-05-01", brandId:"r1", notes:"Retailer 1 has high signup-to-purchase drop-off (68%). Welcome series is low-cost, high-leverage." },
  { id:"e07", initId:"NH-007", title:"Collection Rebuild — Top Paid-Social Landing Pages", initType:"A/B Test", hypothesis:"Rebuilding lighting and living room collection pages with in-stock priority sequencing, load-time optimization, and hero-SKU variant gap resolution will recover CVR to prior 4W baseline and support paid social scaling at ROAS above 1.5x.", category:"Conversion", owner:"Site / Product + Merch", primaryMetric:"Collection-page CVR; mobile load time; OOS rate on hero SKUs", killCriteria:"Scope changes if widget test Cell B is not materially better than Cell A.", status:"Draft", startDate:"2026-06-10", endDate:"2026-07-01", ice:{impact:9,certainty:6,ease:5}, revenueImpact:118352, linkedIds:["e01","e02","e04"], results:null, createdAt:"2026-05-10", brandId:"default", notes:"Second move — scope depends on widget test result." },
  { id:"e08", initId:"NH-008", title:"Sitewide 15% Promo — Rejected", initType:"Campaign", hypothesis:"A sitewide 15% promotional discount will lift CVR quickly and protect topline revenue while conversion infrastructure issues are resolved.", category:"Merchandising", owner:"Finance", primaryMetric:"CVR lift; gross margin impact", killCriteria:"N/A — not pursuing.", status:"Killed", startDate:"2026-05-10", endDate:"2026-05-14", ice:{impact:3,certainty:2,ease:8}, revenueImpact:-118000, linkedIds:[], results:{ actualOutcome:"Decision not to pursue. Gross profit already down $118k last 4W. Decor markdown at 23%.", keyLearning:"Promo compresses margin without addressing root cause — the problem is site experience, not price.", outcomeClassification:"Failed", decisionMade:"Do not pursue. Revisit only after CVR infrastructure is stable.", outcomeCertainty:95, actualRevenueImpact:0 }, createdAt:"2026-05-10", brandId:"default" },
  { id:"e09", initId:"NH-009", title:"Paid Social +25% Scale — Rejected", initType:"Campaign", hypothesis:"Increasing paid social spend 25% into current winning audiences will accelerate new-customer growth given improving creative CTR.", category:"Paid Media", owner:"Paid", primaryMetric:"New-customer revenue; incremental ROAS", killCriteria:"N/A — not pursuing.", status:"Killed", startDate:"2026-05-10", endDate:"2026-05-14", ice:{impact:4,certainty:2,ease:7}, revenueImpact:-60000, linkedIds:["e05"], results:{ actualOutcome:"Rejected. Incremental ROAS = 0.24x. $80k spend generated $19k incremental revenue.", keyLearning:"Scaling volume into a broken funnel makes the problem more expensive, not better.", outcomeClassification:"Failed", decisionMade:"Hold spend. Confirm attribution methodology first.", outcomeCertainty:92, actualRevenueImpact:-60000 }, createdAt:"2026-05-10", brandId:"default" },
  { id:"e10", initId:"NH-010", title:"Homepage Hero Redesign — Premium Brand Presentation", initType:"A/B Test", hypothesis:"Redesigning the homepage hero and seasonal brand creative to feel more premium and less promotional will improve trust signals for new visitors and support conversion quality over time.", category:"Brand", owner:"Brand", primaryMetric:"New-visitor bounce rate; new-visitor CVR on brand-entry traffic", killCriteria:"No measurable improvement in new-visitor bounce rate or CVR after 4 weeks.", status:"Draft", startDate:"2026-07-01", endDate:"2026-08-01", ice:{impact:5,certainty:4,ease:6}, revenueImpact:22000, linkedIds:["e01","e02"], results:null, createdAt:"2026-05-10", brandId:"default", notes:"Sequenced after widget test and PDP fixes." },
  { id:"e11", initId:"R2-001", title:"PDP Image Quality Uplift — High-Res Lifestyle Photography", initType:"A/B Test", hypothesis:"Replacing stock product images with high-resolution lifestyle photography on top 15 PDPs will increase add-to-cart rate by 10% by reducing purchase hesitation caused by poor visual trust.", category:"Conversion", owner:"Merchandising", primaryMetric:"Add-to-cart rate on affected PDPs", killCriteria:"No ATC improvement after 3 weeks with 3,000+ sessions per variant.", status:"Completed", startDate:"2026-04-01", endDate:"2026-05-01", ice:{impact:6,certainty:7,ease:5}, revenueImpact:28000, spendCost:8000, resourceCost:4000, linkedIds:[], results:{ actualOutcome:"ATC rate improved 14.2% on lifestyle-image PDPs vs control. Strongest lift on furniture category (+19%). No impact on accessories.", keyLearning:"High-quality lifestyle imagery materially lifts purchase intent on considered purchases — the effect is category-specific, not sitewide.", outcomeClassification:"Success", decisionMade:"Roll out to all furniture PDPs. Accessories deprioritised. Northcove team briefed for similar test.", outcomeCertainty:88, actualRevenueImpact:31000, actualSpendCost:9200, actualResourceCost:4500 }, createdAt:"2026-04-01", brandId:"r2" },
  { id:"e12", initId:"R2-002", title:"Checkout Flow Simplification — Remove Optional Fields", initType:"A/B Test", hypothesis:"Removing 3 optional form fields from the checkout flow will reduce checkout abandonment by 8% by lowering cognitive load at the point of highest purchase intent.", category:"Conversion", owner:"Product", primaryMetric:"Checkout completion rate; abandonment rate", killCriteria:"No improvement in checkout completion rate after 2 weeks with 1,500+ checkout sessions.", status:"Draft", startDate:"2026-06-01", endDate:"2026-07-01", ice:{impact:8,certainty:8,ease:7}, revenueImpact:52000, spendCost:0, resourceCost:6000, linkedIds:["e11"], results:null, createdAt:"2026-05-10", brandId:"r2", notes:"Informed by e11 learnings — trust signals matter, so friction reduction should amplify the uplift." },
];

// Generate human-readable initiative ID
const generateInitId = (brandId, brands, existingItems) => {
  const brand = brands && brands.find(b => b.id === brandId);
  const name  = brand ? brand.name : "XX";
  const prefix = name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0,3).padEnd(2,"X");
  const existing = existingItems.filter(e => e.initId && e.initId.startsWith(prefix+"-"));
  const maxNum = existing.reduce((max, e) => {
    const n = parseInt((e.initId||"").split("-")[1]||"0");
    return n > max ? n : max;
  }, 0);
  return prefix + "-" + String(maxNum + 1).padStart(3,"0");
};

const mkDefault = (cats, activeBrand) => ({
  _new:true, id:"e-"+Date.now(), title:"", hypothesis:"",
  category:cats[0]||"", initType:"A/B Test", owner:"",
  primaryMetric:"", killCriteria:"", status:"Draft",
  startDate:"", endDate:"", ice:{impact:5,certainty:5,ease:5},
  revenueImpact:0, spendCost:0, resourceCost:0, linkedIds:[], results:null,
  createdAt:new Date().toISOString().slice(0,10), notes:"",
  brandId: activeBrand && activeBrand!=="all" ? activeBrand : "default",
});

// -- AI ------------------------------------------------------------------------
const getApiKey = () => {
  try { return localStorage.getItem("gos_apikey") || ""; } catch { return ""; }
};
const AI_HEADERS = (key) => ({
  "Content-Type": "application/json",
  "x-api-key": key,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerously-allow-browser": "true",
});

async function callExpandHypothesis(rough, title, settings, dataCtx) {
  const apiKey = getApiKey();
  if (!apiKey) { alert("Add your Anthropic API key in Settings (gear icon) to use AI features."); return ""; }
  const sys = [
    "You help growth teams write structured initiative hypotheses for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Write a single hypothesis: We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason].",
    "One sentence. No markdown. Use the title to inform the change. Be specific about mechanism. Return only the hypothesis.",
    dataCtx ? "Data context: "+dataCtx : "",
  ].join(" ");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:AI_HEADERS(apiKey),
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:300, system:sys,
      messages:[{role:"user", content:"Title: "+(title||"none")+". Rough idea: "+rough}] }),
  });
  const data = await resp.json();
  return data.content && data.content[0] ? data.content[0].text.trim() : "";
}

async function callSynthesiseLearnings(learnings, settings) {
  const apiKey = getApiKey();
  if (!apiKey) { alert("Add your Anthropic API key in Settings to use AI features."); return ""; }
  const lines = learnings.map((l,i)=>String(i+1)+". ["+l.outcome+"]["+l.category+"]["+l.retailer+"] "+l.learning).join("\n");
  const sys = [
    "You are a growth strategist analysing learnings from "+settings.companyName+".",
    "Given a list of initiative learnings (with outcome, category, and retailer labels), produce a concise synthesis.",
    "Structure your response with these sections:",
    "PATTERNS: 2-3 recurring themes across multiple learnings (what keeps working or failing).",
    "CROSS-RETAILER SIGNALS: any learning from one retailer that should be tested at another.",
    "WATCH OUT: 1-2 failure patterns or repeated mistakes the team should avoid.",
    "Keep each section to 2-4 bullet points maximum. Be specific and direct. No generic advice.",
  ].join(" ");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:AI_HEADERS(apiKey),
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:600, system:sys,
      messages:[{role:"user", content:"Learnings to synthesise:\n"+lines}] }),
  });
  const data = await resp.json();
  return data.content && data.content[0] ? data.content[0].text.trim() : "";
}

async function callSuggestICE(form, settings, dataCtx) {
  const apiKey = getApiKey();
  if (!apiKey) { alert("Add your Anthropic API key in Settings (gear icon) to use AI features."); return null; }
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
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:AI_HEADERS(apiKey),
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:400, system:sys,
      messages:[{role:"user", content:user}] }),
  });
  const data = await resp.json();
  const raw   = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const clean = raw.replace(/```json|```/g,"").trim();
  return JSON.parse(clean);
}

async function callQuickCapture(description, settings, cats, initTypes) {
  const apiKey = getApiKey();
  if (!apiKey) { alert("Add your Anthropic API key in Settings to use AI features."); return null; }
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
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:AI_HEADERS(apiKey),
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:600, system:sys,
      messages:[{role:"user", content:"Rough idea: "+description}] }),
  });
  const data = await resp.json();
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}

// -- Style helpers -------------------------------------------------------------
const menuItem = (t) => ({fontSize:14,padding:"10px 12px",background:"transparent",border:"none",color:t.text,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,fontFamily:t.mono,width:"100%"});
const gG  = (t) => ({fontSize:12,padding:"6px 13px",borderRadius:4,background:t.gold,border:"1px solid "+t.gold,color:t.goldText,cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",gap:4,fontFamily:t.mono});
const gGh = (t) => ({fontSize:12,padding:"6px 12px",borderRadius:4,background:"transparent",border:"1px solid "+t.border,color:t.textMuted,cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:t.mono});
const gI  = (t) => ({width:"100%",padding:"7px 10px",fontSize:13,fontFamily:t.mono,background:t.inputBg,border:"1px solid "+t.inputBorder,borderRadius:4,color:t.text,boxSizing:"border-box"});
const gTA = (t) => ({...gI(t),resize:"vertical"});
const gSl = (t) => ({...gI(t),cursor:"pointer"});
const gSc = (t) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:8,padding:"13px 16px"});
const gSL = (t) => ({fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.textMuted,marginBottom:8,fontFamily:t.mono});
const gCd = (t) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:8,padding:"12px 15px"});

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

  const t    = dk ? TD : TL;
  const cats   = settings.categories || DEFAULT_SETTINGS.categories;
  const brands = settings.brands || DEFAULT_SETTINGS.brands || [{id:"default",name:"Northcove Home"}];

  useEffect(()=>{
    // Theme persisted in memory only (localStorage not available in all environments)
    const load = async ()=>{
      try {
        const [ir,sr] = await Promise.all([store.get(KEY_ITEMS),store.get(KEY_SETTINGS)]);
        setItems(ir&&ir.value?JSON.parse(ir.value):SEED);
        if(!ir||!ir.value) store.set(KEY_ITEMS,JSON.stringify(SEED));
        if(sr&&sr.value) setSettings(JSON.parse(sr.value));
      } catch { setItems(SEED); }
      setLoaded(true);
    };
    load();
  },[]);

  const saveItems    = d => { setItems(d); try{store.set(KEY_ITEMS,JSON.stringify(d));}catch{} };
  const saveSettings = s => { setSettings(s); try{store.set(KEY_SETTINGS,JSON.stringify(s));}catch{} };
  const toggleDk     = ()=> { setDk(n => !n); };

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
    return {completed:completed.length,killed:killed.length,pipeline:pipeline.length,running:running.length,revImpacted,revAtRisk,totalEstimated,totalActual,calibration,totalEstCost,totalActualCost,closedROI,winRate,wins:wins.length,closed:closed.length,avgDays,catCounts,typeCounts,outCounts,vel,avgIce};
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

  if(!loaded) return <div style={{background:t.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:t.textMuted,fontFamily:t.mono}}>Loading Growth OS…</span></div>;

  const navBtn=(v,lbl)=>(
    <button key={v} onClick={()=>setNav(v)} style={{fontSize:12,padding:"5px 12px",borderRadius:4,cursor:"pointer",fontFamily:t.mono,background:nav===v?t.gold:"transparent",border:"1px solid "+(nav===v?t.gold:t.border),color:nav===v?t.goldText:t.textMuted}}>{lbl}</button>
  );

  return (
    <div style={{background:t.bg,minHeight:"100vh",fontFamily:t.serif,color:t.text}}>
      <style>{"@import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css');*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}input[type=range]{accent-color:"+t.gold+"}@media(max-width:640px){.desktop-nav{display:none!important}.hamburger-btn{display:block!important}}"}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid "+t.border,background:t.headerBg,position:"sticky",top:0,zIndex:100,minHeight:48}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,minWidth:0}}>
          <span style={{fontSize:13,fontWeight:700,letterSpacing:"0.12em",color:t.gold,fontFamily:t.serif,whiteSpace:"nowrap"}}>GROWTH OS</span>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:120}}>{settings.companyName}</span>
        </div>
        {/* Desktop nav — hidden on mobile via inline media workaround */}
        <div className="desktop-nav" style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
          {brands.length>1&&(
            <select value={activeBrand} onChange={e=>setActiveBrand(e.target.value)}
              style={{fontSize:11,padding:"4px 8px",borderRadius:4,border:"1px solid "+t.gold,background:activeBrand==="all"?t.surface:t.goldBg,color:activeBrand==="all"?t.textMuted:t.gold,fontFamily:t.mono,cursor:"pointer",maxWidth:130}}>
              <option value="all">All retailers</option>
              {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {navBtn("dashboard","Dashboard")}
          {navBtn("initiatives","Initiatives")}
          {navBtn("library","Library")}
          {(nav==="detail"||nav==="form")&&<button onClick={()=>setNav("initiatives")} style={{...gGh(t),gap:4,padding:"5px 10px"}}><span style={{fontSize:13}}>&#8592;</span> Back</button>}
          {nav==="initiatives"&&<>
            <button onClick={()=>setShowCapture(true)} style={{...gGh(t),padding:"5px 10px",fontSize:11}} title="Quick capture — describe an initiative in plain text"><span>&#9889;</span> Quick capture</button>
            <button onClick={goNew} style={{...gG(t),padding:"5px 10px"}}><span>+</span> New</button>
          </>}
          <button onClick={()=>setShowSet(true)} title="Settings" style={{fontSize:14,padding:"5px 7px",borderRadius:4,cursor:"pointer",background:"transparent",border:"1px solid "+t.border,color:t.textMuted,lineHeight:1}}><span dangerouslySetInnerHTML={{__html:"&#9881;"}}/></button>
          <button onClick={toggleDk} title={dk?"Light mode":"Dark mode"} style={{fontSize:14,padding:"5px 7px",borderRadius:4,cursor:"pointer",background:"transparent",border:"1px solid "+t.border,color:t.textMuted,lineHeight:1}}><span dangerouslySetInnerHTML={{__html:dk?"&#9728;":"&#9790;"}}/></button>
        </div>
        {/* Hamburger — shown on mobile */}
        <button className="hamburger-btn" onClick={()=>setShowMenu(m=>!m)}
          style={{display:"none",fontSize:20,padding:"5px 8px",borderRadius:4,cursor:"pointer",background:"transparent",border:"1px solid "+t.border,color:t.textMuted,lineHeight:1}}>
          {showMenu?"&#10005;":"&#9776;"}
        </button>
      </div>
      {/* Mobile menu drawer */}
      {showMenu&&(
        <div style={{position:"fixed",inset:0,zIndex:200}} onClick={()=>setShowMenu(false)}>
          <div style={{position:"absolute",top:48,right:0,left:0,background:t.headerBg,borderBottom:"1px solid "+t.border,padding:"12px 16px",display:"flex",flexDirection:"column",gap:8,boxShadow:"0 4px 16px rgba(0,0,0,0.12)"}}
            onClick={e=>e.stopPropagation()}>
            {brands.length>1&&(
              <div style={{padding:"4px 12px"}}>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Brand</div>
                <select value={activeBrand} onChange={e=>{setActiveBrand(e.target.value);setShowMenu(false);}}
                  style={{...gSl(t),width:"100%"}}>
                  <option value="all">All retailers</option>
                  {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <button onClick={()=>{setNav("dashboard");setShowMenu(false);}} style={{...menuItem(t),fontWeight:nav==="dashboard"?700:400,color:nav==="dashboard"?t.gold:t.text}}>Dashboard</button>
            <button onClick={()=>{setNav("initiatives");setShowMenu(false);}} style={{...menuItem(t),fontWeight:nav==="initiatives"?700:400,color:nav==="initiatives"?t.gold:t.text}}>Initiatives</button>
            <button onClick={()=>{setNav("library");setShowMenu(false);}} style={{...menuItem(t),fontWeight:nav==="library"?700:400,color:nav==="library"?t.gold:t.text}}>Library</button>
            {(nav==="detail"||nav==="form")&&<button onClick={()=>{setNav("initiatives");setShowMenu(false);}} style={menuItem(t)}>&#8592; Back</button>}
            {nav==="initiatives"&&<>
              <button onClick={()=>{setShowCapture(true);setShowMenu(false);}} style={{...menuItem(t)}}>&#9889; Quick capture</button>
              <button onClick={()=>{goNew();setShowMenu(false);}} style={{...menuItem(t),background:t.gold,color:t.goldText,borderRadius:4,justifyContent:"center",fontWeight:700}}>+ New initiative</button>
            </>}
            <div style={{borderTop:"1px solid "+t.border,marginTop:4,paddingTop:8,display:"flex",gap:8}}>
              <button onClick={()=>{setShowSet(true);setShowMenu(false);}} style={{...gGh(t),flex:1,justifyContent:"center"}}><span dangerouslySetInnerHTML={{__html:"&#9881;"}}/> Settings</button>
              <button onClick={()=>{toggleDk();setShowMenu(false);}} style={{...gGh(t),flex:1,justifyContent:"center"}}><span dangerouslySetInnerHTML={{__html:dk?"&#9728; Light":"&#9790; Dark"}}/></button>
            </div>
          </div>
        </div>
      )}

      {nav==="dashboard"&&<DashView t={t} dk={dk} dash={dash} cats={cats} settings={settings} brands={brands} activeBrand={activeBrand} dRange={dRange} setDRange={setDRange} cFrom={cFrom} cTo={cTo} setCFrom={setCFrom} setCTo={setCTo} onGo={()=>setNav("initiatives")}/>}
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
                  <option value="ice">ICE Score</option>
                  <option value="endDate">End date</option>
                  <option value="revenue">Revenue</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {filtered.length===0&&<div style={{padding:48,textAlign:"center",color:t.textMuted}}>No initiatives match your filters.</div>}
            {filtered.map(item=>(
              <div key={item.id} onClick={()=>goDetail(item.id)} style={{...gCd(t),cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                    <CBdg cat={item.category} cats={cats} dk={dk}/>
                    <TBdg type={item.initType} dk={dk}/>
                    {brands&&brands.length>1&&activeBrand==="all"&&<Bdg label={brandName(item.brandId||"default",brands)} color={brandColor(item.brandId||"default",brands,dk)} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"} small/>}
                    <SBdg s={item.status} dk={dk}/>
                    {item.results&&<OBdg o={item.results.outcomeClassification} dk={dk}/>}
                    <EAlert endDate={item.endDate} status={item.status} t={t} dk={dk}/>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <ICEChip ice={item.ice} t={t}/>
                    {item.revenueImpact!==0&&<span style={{fontSize:13,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{fmtCur(item.revenueImpact)}</span>}
                    {item.results&&typeof item.results.actualRevenueImpact==="number"&&<span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>actual: {fmtCur(item.results.actualRevenueImpact)}</span>}
                    {item.owner&&<span style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{item.owner.split(" (")[0].split("+")[0].trim()}</span>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  {item.initId&&<span style={{fontSize:10,fontWeight:700,color:t.gold,fontFamily:t.mono,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:3,padding:"1px 6px",flexShrink:0}}>{item.initId}</span>}
                  <div style={{fontSize:14,fontWeight:700,color:t.text,lineHeight:1.4,fontFamily:t.serif}}>{item.title}</div>
                </div>
                {item.hypothesis&&<div style={{fontSize:12,color:t.textMuted,lineHeight:1.5,marginBottom:item.status!=="Draft"?6:0,fontFamily:t.mono}}>{item.hypothesis.slice(0,130)}{item.hypothesis.length>130?"…":""}</div>}
                {item.status!=="Draft"&&(
                  <div style={{display:"flex",gap:14,alignItems:"center",fontSize:12,color:t.textMuted,fontFamily:t.mono,flexWrap:"wrap"}}>
                    {item.primaryMetric&&<span>{item.primaryMetric.slice(0,48)}{item.primaryMetric.length>48?"…":""}</span>}
                    {item.endDate&&<span>End: {fmtDate(item.endDate)}</span>}
                    {item.linkedIds&&item.linkedIds.length>0&&<span>{item.linkedIds.length} linked</span>}
                  </div>
                )}
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
          onLink={goDetail}/>
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
                } catch(e){ alert("AI extraction failed — try adding more detail."); }
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
              <div key={tpl.id} onClick={()=>startFromTemplate(tpl)} style={{...gCd(t),cursor:"pointer",display:"flex",alignItems:"flex-start",gap:12}}>
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

      {showSet&&<SettingsModal t={t} dk={dk} settings={settings} onSave={s=>{saveSettings(s);setShowSet(false);}} onClose={()=>setShowSet(false)}/>}

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
    </div>
  );
}

// -- Dashboard -----------------------------------------------------------------
function DashView({t,dk,dash,cats,settings,brands,activeBrand,dRange,setDRange,cFrom,cTo,setCFrom,setCTo,onGo}) {
  const maxCat  = Math.max(...Object.values(dash.catCounts),1);
  const maxType = Math.max(...Object.values(dash.typeCounts),1);
  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
      {/* North star */}
      <div style={{...gCd(t),background:t.goldBg,border:"1px solid "+t.goldBorder,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.gold,fontFamily:t.mono,marginBottom:4}}>North star</div>
          <div style={{fontSize:15,fontWeight:700,color:t.text,fontFamily:t.serif}}>{settings.northStarMetric}</div>
        </div>
        <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
          <div><div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Current</div><div style={{fontSize:20,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{settings.northStarCurrent}</div></div>
          <div style={{fontSize:20,color:t.textMuted,alignSelf:"center"}}>&#8594;</div>
          <div><div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Target</div><div style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.serif}}>{settings.northStarTarget}</div></div>
        </div>
        <div style={{marginLeft:"auto",fontSize:11,color:t.textMuted,fontFamily:t.mono,textAlign:"right"}}>
          {activeBrand!=="all"&&<div style={{fontSize:12,fontWeight:600,color:t.gold,marginBottom:2}}>{brandName(activeBrand,brands)}</div>}
          {settings.businessModel}
        </div>
      </div>

      {/* Executive summary */}
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button style={{...gGh(t),fontSize:11,padding:"4px 10px"}}
          onClick={()=>{
            const retailerLabel = activeBrand==="all"?"All retailers":brandName(activeBrand,brands);
            const date = new Date().toLocaleDateString("en-CA",{month:"long",day:"numeric",year:"numeric"});
            const text = [
              "Growth OS — Weekly Update ("+date+")",
              "Retailer: "+retailerLabel,
              "",
              "PIPELINE",
              "Active initiatives: "+dash.running+" running, "+dash.pipeline+" in draft",
              "Revenue at risk: "+fmtCur(dash.revAtRisk),
              "",
              "PERFORMANCE",
              "Win rate: "+(dash.winRate!==null?dash.winRate+"%":"no closed initiatives yet")+" ("+dash.wins+" wins from "+dash.closed+" closed)",
              "Avg days to close: "+(dash.avgDays||"n/a"),
              "Avg ICE score: "+(dash.avgIce||"n/a"),
              "",
              "FINANCIALS",
              "Revenue impacted (completed): "+fmtCur(dash.revImpacted),
              "ROI on closed initiatives: "+(dash.closedROI!==null?dash.closedROI+"x":"not yet measurable"),
              "Estimate accuracy: "+(dash.calibration!==null?dash.calibration+"%":"not yet measurable"),
            ].join("\n");
            try { navigator.clipboard.writeText(text); } catch {}
            alert("Executive summary copied to clipboard.");
          }}>
          &#128203; Copy executive summary
        </button>
      </div>

      {/* Range */}
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {[["thisMonth","This month"],["lastMonth","Last month"],["custom","Custom"]].map(([v,l])=>(
          <button key={v} onClick={()=>setDRange(v)} style={{fontSize:12,padding:"4px 11px",borderRadius:4,cursor:"pointer",fontFamily:t.mono,background:dRange===v?t.gold:"transparent",border:"1px solid "+(dRange===v?t.gold:t.border),color:dRange===v?t.goldText:t.textMuted}}>{l}</button>
        ))}
        {dRange==="custom"&&<>
          <input type="date" value={cFrom} onChange={e=>setCFrom(e.target.value)} style={{fontSize:12,padding:"4px 8px",borderRadius:4,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.mono}}/>
          <span style={{color:t.textMuted,fontSize:12}}>to</span>
          <input type="date" value={cTo} onChange={e=>setCTo(e.target.value)} style={{fontSize:12,padding:"4px 8px",borderRadius:4,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.mono}}/>
        </>}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
        {[
          {l:"Revenue impacted", v:fmtCur(dash.revImpacted), s:"from completed"},
          {l:"Revenue at risk",  v:fmtCur(dash.revAtRisk),   s:"running now"},
          {l:"Completed",        v:dash.completed,            s:" "},
          {l:"Killed",           v:dash.killed,               s:" "},
          {l:"Draft pipeline",   v:dash.pipeline,             s:" "},
          {l:"Running",          v:dash.running,              s:" "},
          {l:"Win rate",         v:dash.winRate!==null?dash.winRate+"%":"—", s:dash.wins+"/"+dash.closed+" closed"},
          {l:"Avg to close",     v:dash.avgDays||"—",         s:"days, completed"},
          {l:"Avg ICE",          v:dash.avgIce||"—",          s:"all initiatives"},
          {l:"Closed ROI",        v:dash.closedROI!==null?dash.closedROI+"x":"—", s:"actual rev / cost"},
        ].map(m=>(
          <div key={m.l} style={{...gCd(t),display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"14px 10px",minHeight:100}}>
            <div style={{fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,marginBottom:6,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{m.l}</div>
            <div style={{fontSize:28,fontWeight:700,color:t.gold,fontFamily:t.serif,lineHeight:1}}>{m.v}</div>
            {m.s&&m.s!==" "&&<div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginTop:4,whiteSpace:"nowrap"}}>{m.s}</div>}
          </div>
        ))}
      </div>

      {/* Calibration card */}
      <div style={{...gCd(t),border:"1px solid "+(dash.calibration!==null?(dash.calibration>=80?t.goldBorder:dash.calibration>=50?"#c0a030":t.border):t.border)}}>
        <div style={gSL(t)}>Revenue estimate calibration</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,alignItems:"center",marginBottom:dash.totalEstCost>0?12:0}}>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Total estimated</div>
            <div style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(dash.totalEstimated)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Total actual</div>
            <div style={{fontSize:20,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{fmtCur(dash.totalActual)}</div>
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
        <div style={gCd(t)}>
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
        <div style={gCd(t)}>
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
      <div style={gCd(t)}>
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
      <div style={gCd(t)}>
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

      <button style={{...gGh(t),alignSelf:"flex-start"}} onClick={onGo}><span style={{fontSize:12}}>&#9776;</span> View initiatives</button>
    </div>
  );
}

// -- Detail --------------------------------------------------------------------
function DetailView({item,items,t,dk,cats,onEdit,onDelete,onStatus,onResults,onLink}) {
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
      <div style={{...gSc(t),background:t.surfaceAlt}}>
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

      <div style={gSc(t)}>
        <div style={gSL(t)}>Hypothesis</div>
        <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:14}}>{item.hypothesis||<span style={{color:t.textMuted,fontStyle:"italic"}}>No hypothesis yet.</span>}</p>
      </div>

      {item.ice&&(
        <div style={gSc(t)}>
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
        <div style={gSc(t)}>
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

      {item.killCriteria&&item.status!=="Draft"&&<div style={gSc(t)}><div style={gSL(t)}>Kill criteria</div><p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:13}}>{item.killCriteria}</p></div>}
      {item.notes&&<div style={gSc(t)}><div style={gSL(t)}>Notes</div><p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:13}}>{item.notes}</p></div>}

      {item.results&&(()=>{
        const c=(dk?OD:OL)[item.results.outcomeClassification]||{};
        return (
          <div style={{...gSc(t),background:c.bg,border:"1px solid "+c.border}}>
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
        <div style={gSc(t)}>
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

// -- Form ----------------------------------------------------------------------
function FormView({form,setForm,items,t,dk,cats,brands,aiLoad,iceLoad,hypReview,iceReview,dataCtx,setDataCtx,onAi,onIceAssist,onAcceptHyp,onRejectHyp,onAcceptIce,onRejectIce,onSave,onCancel}) {
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const canAi  = form.hypothesis&&form.hypothesis.length>=60;
  const canIce = !!(form.hypothesis&&form.title);
  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.serif}}>{form._new?"New initiative":"Edit initiative"}</div>

      <FR label="Title *" t={t}><input style={gI(t)} value={form.title} onChange={e=>f("title",e.target.value)} placeholder="Clear, specific title"/></FR>

      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <label style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>Hypothesis</label>
          <button style={{...gGh(t),fontSize:11,padding:"2px 9px",opacity:canAi?1:0.4}} onClick={onAi} disabled={!canAi||aiLoad} title={canAi?"Expand with AI — requires your confirmation":"Write at least 60 characters first"}>
            {aiLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Expanding…</>:<><span style={{fontSize:12}}>&#10024;</span> Expand with AI</>}
          </button>
        </div>
        <textarea style={gTA(t)} rows={4} value={form.hypothesis} onChange={e=>f("hypothesis",e.target.value)} placeholder="Write a rough idea (60+ chars) and AI can expand it, or write the full hypothesis directly."/>
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

      <div style={{display:"grid",gridTemplateColumns:brands&&brands.length>1?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr",gap:10}}>
        {brands&&brands.length>1&&<FR label="Retailer" t={t}><select style={gSl(t)} value={form.brandId||"default"} onChange={e=>f("brandId",e.target.value)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></FR>}
        <FR label="Category" t={t}><select style={gSl(t)} value={form.category} onChange={e=>f("category",e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select></FR>
        <FR label="Type" t={t}><select style={gSl(t)} value={form.initType||"A/B Test"} onChange={e=>f("initType",e.target.value)}>{INIT_TYPES.map(tp=><option key={tp}>{tp}</option>)}</select></FR>
        <FR label="Owner" t={t}><input style={gI(t)} value={form.owner||""} onChange={e=>f("owner",e.target.value)}/></FR>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Status" t={t}><select style={gSl(t)} value={form.status} onChange={e=>f("status",e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></FR>
        <FR label="Primary metric" t={t}><input style={gI(t)} value={form.primaryMetric||""} onChange={e=>f("primaryMetric",e.target.value)}/></FR>
      </div>

      <div style={gSc(t)}>
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

      <FR label="Kill criteria" t={t}><textarea style={gTA(t)} rows={2} value={form.killCriteria||""} onChange={e=>f("killCriteria",e.target.value)}/></FR>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Start date" t={t}><input style={gI(t)} type="date" value={form.startDate||""} onChange={e=>f("startDate",e.target.value)}/></FR>
        <FR label="End date" t={t}><input style={gI(t)} type="date" value={form.endDate||""} onChange={e=>f("endDate",e.target.value)}/></FR>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Sample size" t={t}><input style={gI(t)} value={form.sampleSize||""} onChange={e=>f("sampleSize",e.target.value)}/></FR>
        <FR label="Duration" t={t}><input style={gI(t)} value={form.duration||""} onChange={e=>f("duration",e.target.value)}/></FR>
      </div>
      <div style={{...gSc(t)}}>
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

      <div style={{...gSc(t),border:"1px dashed "+t.border}}>
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
function SettingsModal({t,dk,settings,onSave,onClose}) {
  const [local,setLocal]=useState({...settings});
  const [newCat,setNewCat]=useState("");
  const [apiKey,setApiKey]=useState(()=>{ try{return localStorage.getItem("gos_apikey")||"";}catch{return "";} });
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
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
            {(local.brands||[]).map((b,i)=>(
              <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:t.surfaceAlt,borderRadius:4}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:brandColor(b.id,local.brands||[],dk),flexShrink:0}}/>
                <input style={{...gI(t),flex:1,padding:"4px 8px"}} value={b.name}
                  onChange={e=>{const bs=[...(local.brands||[])];bs[i]={...bs[i],name:e.target.value};setLocal(p=>({...p,brands:bs}));}}/>
                {(local.brands||[]).length>1&&<button onClick={()=>setLocal(p=>({...p,brands:(p.brands||[]).filter((_,j)=>j!==i)}))}
                  style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>&#10005;</button>}
              </div>
            ))}
          </div>
          <button onClick={()=>{const newId="brand-"+Date.now();setLocal(p=>({...p,brands:[...(p.brands||[]),{id:newId,name:"New retailer"}]}));}}
            style={{...gGh(t),fontSize:11}}>+ Add retailer</button>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:700,color:t.textSub,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Data sources</div>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,background:t.border,padding:"2px 6px",borderRadius:3}}>Placeholder — coming soon</span>
          </div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,lineHeight:1.6,margin:"0 0 8px"}}>Planned: Google Sheets (pulling from GA4, Looker, Meta Ads), BigQuery, direct GA4 and Meta Ads APIs. Paste data manually in the initiative form for now.</p>
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,padding:"10px 12px",background:dk?"#1a1a12":"#f5f5f0",borderRadius:4,border:"1px dashed "+t.border}}>No data sources connected yet.</div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:6,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>AI Integration</div>
          <p style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5,margin:"0 0 10px"}}>
            Your API key is stored only in this browser. Never shared or sent anywhere except directly to Anthropic.
          </p>
          <FR label="Anthropic API key" t={t}>
            <input type="password" style={gI(t)} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-ant-api03-..."/>
          </FR>
          {apiKey&&<div style={{fontSize:11,color:"#2a9a60",fontFamily:t.mono,marginTop:6}}>Key saved — AI features enabled.</div>}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
          <button style={gGh(t)} onClick={onClose}>Cancel</button>
          <button style={gG(t)} onClick={()=>{ try{localStorage.setItem("gos_apikey",apiKey.trim());}catch{}; onSave(local); }}>Save settings</button>
        </div>
      </div>
    </Modal>
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
                const result = await callSynthesiseLearnings(payload, settings||{companyName:"Growth OS",businessModel:"growth portfolio",northStarMetric:"Revenue",northStarCurrent:"—",northStarTarget:"—"});
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
        <div style={{...gSc(t),background:dk?"#1a2a18":"#f0faf2",border:"1px solid "+(dk?"#2a6a40":"#7adca0")}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:dk?"#60d080":"#1a7a48",fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>AI Synthesis — {filtered.length} learnings</div>
            <button onClick={()=>setSynthVisible(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14}}>&#10005;</button>
          </div>
          {synthLoad?<div style={{fontSize:13,color:t.textMuted,fontFamily:t.mono}}>Analysing learnings…</div>
            :<div style={{fontSize:13,color:t.textSub,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:t.mono}}>{synthesis}</div>}
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
