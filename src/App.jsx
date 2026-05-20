import { useState, useEffect, useMemo } from "react";

const KEY_ITEMS    = "gos_items_v3";

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
  companyName:      "Northcove Home",
  businessModel:    "DTC ecommerce — home furnishings and decor",
  northStarMetric:  "Revenue",
  northStarCurrent: "$1.1M/mo",
  northStarTarget:  "$1.4M/mo",
  categories:       ["Paid Media","Organic","Conversion","Merchandising","Retention","Brand","Data / Analytics"],
  dataSources:      [],
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
  { id:"e01", title:"Widget A/B — Pause Personalization on Mobile Collection Pages", initType:"A/B Test", hypothesis:"Removing personalization widgets from paid-social mobile entry traffic to lighting and living room collections will recover CVR toward prior 4W baseline (1.85%) by eliminating load-time and rendering friction introduced in late March.", category:"Conversion", owner:"Site / Product", primaryMetric:"CVR on paid-social mobile entry", killCriteria:"Cell B CVR >= 1.76% = widgets confirmed as cause. Cell B flat = widen investigation.", status:"Running", startDate:"2026-05-12", endDate:"2026-06-07", ice:{impact:9,certainty:7,ease:8}, revenueImpact:118352, linkedIds:["e02","e03","e04"], results:null, createdAt:"2026-05-10", notes:"Cell A: widgets on. Cell B: widgets off. Scoped to paid-social mobile only." },
  { id:"e02", title:"PDP Content Fix — Delivery Clarity, Swatches, OOS on Top 20 SKUs", initType:"Process", hypothesis:"Fixing delivery messaging, swatch clarity, and OOS display on the top 20 traffic-driving SKUs will reduce checkout abandonment and improve new-visitor CVR by 15-20% on affected PDPs.", category:"Merchandising", owner:"Merch + Site", primaryMetric:"New-visitor CVR on top 20 SKUs; care ticket volume", killCriteria:"No CVR improvement on affected SKUs after 2 weeks vs prior baseline.", status:"Running", startDate:"2026-05-12", endDate:"2026-05-26", ice:{impact:7,certainty:8,ease:7}, revenueImpact:34112, linkedIds:["e01","e03"], results:null, createdAt:"2026-05-10", notes:"Runs parallel to widget test." },
  { id:"e03", title:"Weekly Growth Triage — Collection Health Scorecard", initType:"Process", hypothesis:"A shared weekly triage with a scored collection-page health system will reduce mean time to intervention on conversion problems by at least 50% by eliminating the five-team information silo.", category:"Conversion", owner:"Director of Growth", primaryMetric:"Mean time to intervention; scorecard adoption across 5 functions", killCriteria:"If triage fails to produce one owner-assigned action per week after 3 sessions, redesign.", status:"Running", startDate:"2026-05-12", endDate:"2026-06-30", ice:{impact:6,certainty:9,ease:8}, revenueImpact:0, linkedIds:["e01","e02","e04"], results:null, createdAt:"2026-05-10", notes:"Monday cadence." },
  { id:"e04", title:"Mobile PDP QA Walk — New Customer Entry Products", initType:"Research", hypothesis:"A structured mobile PDP audit of new-visitor entry products will uncover rendering, load, and trust issues contributing to the 11-12x CVR gap between new visitors and returning customers.", category:"Conversion", owner:"Director of Growth", primaryMetric:"Actionable issues found per PDP; % resolved within 2 weeks", killCriteria:"Discovery task — output is a prioritized bug list.", status:"Completed", startDate:"2026-05-12", endDate:"2026-05-19", ice:{impact:7,certainty:9,ease:9}, revenueImpact:0, linkedIds:["e01","e02"], results:{ actualOutcome:"14 actionable issues found across 12 PDPs. Swatch rendering broken on 6 lighting SKUs. Delivery messaging absent on 4 living room hero SKUs. Avg load time 5.1s.", keyLearning:"New visitors hit a materially degraded PDP experience independent of widgets — fixing content and load in parallel is not optional.", outcomeClassification:"Success", decisionMade:"8 of 14 issues resolved same week. Remaining 6 tracked in weekly triage.", outcomeCertainty:90, actualRevenueImpact:0 }, createdAt:"2026-05-10" },
  { id:"e05", title:"Paid Social Spend Hold — No Budget Increase Until CVR Recovers", initType:"Process", hypothesis:"Holding paid social spend flat until new-visitor CVR recovers to >= 1.76% will improve incremental ROAS from 0.24x by stopping paid volume from flowing into a broken funnel.", category:"Paid Media", owner:"Paid + Director of Growth", primaryMetric:"Incremental ROAS; new-visitor CVR WoW", killCriteria:"Hold lifted when widget test resolves and CVR recovers to >= 1.76%.", status:"Running", startDate:"2026-05-12", endDate:"2026-06-07", ice:{impact:8,certainty:9,ease:9}, revenueImpact:80000, linkedIds:["e01","e06"], results:null, createdAt:"2026-05-10", notes:"Incremental ROAS last 4W = 0.24x." },
  { id:"e06", title:"Budget Shift — Paid Social to Retargeting (Post-Fix)", initType:"Campaign", hypothesis:"Shifting 15% of paid social budget into retargeting after PDP fixes are live will yield higher incremental ROAS by re-engaging warm intent with an improved destination.", category:"Paid Media", owner:"Paid", primaryMetric:"Retargeting incremental ROAS vs current paid social ROAS", killCriteria:"Retargeting ROAS below 1.0x after $20k spend at 2-week mark.", status:"Draft", startDate:"2026-06-10", endDate:"2026-07-15", ice:{impact:7,certainty:6,ease:7}, revenueImpact:47000, linkedIds:["e01","e05"], results:null, createdAt:"2026-05-10", notes:"Do not launch until widget test and PDP fixes complete." },
  { id:"e07", title:"Collection Rebuild — Top Paid-Social Landing Pages", initType:"A/B Test", hypothesis:"Rebuilding lighting and living room collection pages with in-stock priority sequencing, load-time optimization, and hero-SKU variant gap resolution will recover CVR to prior 4W baseline and support paid social scaling at ROAS above 1.5x.", category:"Conversion", owner:"Site / Product + Merch", primaryMetric:"Collection-page CVR; mobile load time; OOS rate on hero SKUs", killCriteria:"Scope changes if widget test Cell B is not materially better than Cell A.", status:"Draft", startDate:"2026-06-10", endDate:"2026-07-01", ice:{impact:9,certainty:6,ease:5}, revenueImpact:118352, linkedIds:["e01","e02","e04"], results:null, createdAt:"2026-05-10", notes:"Second move — scope depends on widget test result." },
  { id:"e08", title:"Sitewide 15% Promo — Rejected", initType:"Campaign", hypothesis:"A sitewide 15% promotional discount will lift CVR quickly and protect topline revenue while conversion infrastructure issues are resolved.", category:"Merchandising", owner:"Finance", primaryMetric:"CVR lift; gross margin impact", killCriteria:"N/A — not pursuing.", status:"Killed", startDate:"2026-05-10", endDate:"2026-05-14", ice:{impact:3,certainty:2,ease:8}, revenueImpact:-118000, linkedIds:[], results:{ actualOutcome:"Decision not to pursue. Gross profit already down $118k last 4W. Decor markdown at 23%.", keyLearning:"Promo compresses margin without addressing root cause — the problem is site experience, not price.", outcomeClassification:"Failed", decisionMade:"Do not pursue. Revisit only after CVR infrastructure is stable.", outcomeCertainty:95, actualRevenueImpact:0 }, createdAt:"2026-05-10" },
  { id:"e09", title:"Paid Social +25% Scale — Rejected", initType:"Campaign", hypothesis:"Increasing paid social spend 25% into current winning audiences will accelerate new-customer growth given improving creative CTR.", category:"Paid Media", owner:"Paid", primaryMetric:"New-customer revenue; incremental ROAS", killCriteria:"N/A — not pursuing.", status:"Killed", startDate:"2026-05-10", endDate:"2026-05-14", ice:{impact:4,certainty:2,ease:7}, revenueImpact:-60000, linkedIds:["e05"], results:{ actualOutcome:"Rejected. Incremental ROAS = 0.24x. $80k spend generated $19k incremental revenue.", keyLearning:"Scaling volume into a broken funnel makes the problem more expensive, not better.", outcomeClassification:"Failed", decisionMade:"Hold spend. Confirm attribution methodology first.", outcomeCertainty:92, actualRevenueImpact:-60000 }, createdAt:"2026-05-10" },
  { id:"e10", title:"Homepage Hero Redesign — Premium Brand Presentation", initType:"A/B Test", hypothesis:"Redesigning the homepage hero and seasonal brand creative to feel more premium and less promotional will improve trust signals for new visitors and support conversion quality over time.", category:"Brand", owner:"Brand", primaryMetric:"New-visitor bounce rate; new-visitor CVR on brand-entry traffic", killCriteria:"No measurable improvement in new-visitor bounce rate or CVR after 4 weeks.", status:"Draft", startDate:"2026-07-01", endDate:"2026-08-01", ice:{impact:5,certainty:4,ease:6}, revenueImpact:22000, linkedIds:["e01","e02"], results:null, createdAt:"2026-05-10", notes:"Sequenced after widget test and PDP fixes." },
];

const mkDefault = (cats) => ({
  _new:true, id:"e-"+Date.now(), title:"", hypothesis:"",
  category:cats[0]||"", initType:"A/B Test", owner:"",
  primaryMetric:"", killCriteria:"", status:"Draft",
  startDate:"", endDate:"", ice:{impact:5,certainty:5,ease:5},
  revenueImpact:0, linkedIds:[], results:null,
  createdAt:new Date().toISOString().slice(0,10), notes:"",
});

// -- AI ------------------------------------------------------------------------
async function callExpandHypothesis(rough, title, settings, dataCtx) {
  const sys = [
    "You help growth teams write structured initiative hypotheses for "+settings.companyName+",",
    "a "+settings.businessModel+" business.",
    "North star: "+settings.northStarMetric+" (current: "+settings.northStarCurrent+", target: "+settings.northStarTarget+").",
    "Write a single hypothesis: We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason].",
    "One sentence. No markdown. Use the title to inform the change. Be specific about mechanism. Return only the hypothesis.",
    dataCtx ? "Data context: "+dataCtx : "",
  ].join(" ");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:300, system:sys,
      messages:[{role:"user", content:"Title: "+(title||"none")+". Rough idea: "+rough}] }),
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
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:400, system:sys,
      messages:[{role:"user", content:user}] }),
  });
  const data = await resp.json();
  const raw   = data.content && data.content[0] ? data.content[0].text.trim() : "{}";
  const clean = raw.replace(/```json|```/g,"").trim();
  return JSON.parse(clean);
}

// -- Style helpers -------------------------------------------------------------
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
  const cats = settings.categories || DEFAULT_SETTINGS.categories;

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

  const inRange = item=>{
    if(!bounds) return true;
    const d=parseD(item.endDate)||parseD(item.createdAt);
    return d&&d>=bounds.from&&d<=bounds.to;
  };

  const dash = useMemo(()=>{
    const ranged    = items.filter(inRange);
    const completed = ranged.filter(e=>e.status==="Completed");
    const killed    = ranged.filter(e=>e.status==="Killed");
    const pipeline  = items.filter(e=>e.status==="Draft");
    const running   = items.filter(e=>e.status==="Running");
    const closed    = [...completed,...killed];
    const wins      = closed.filter(e=>e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success"));
    const winRate   = closed.length>0?Math.round((wins.length/closed.length)*100):null;
    const revImpacted   = completed.reduce((s,e)=>s+Math.max(0,e.revenueImpact),0);
    const revAtRisk     = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact),0);
    const closedWithActual = closed.filter(e=>e.results&&typeof e.results.actualRevenueImpact==="number");
    const totalEstimated   = closedWithActual.reduce((s,e)=>s+e.revenueImpact,0);
    const totalActual      = closedWithActual.reduce((s,e)=>s+e.results.actualRevenueImpact,0);
    const calibration      = totalEstimated!==0?Math.round((totalActual/totalEstimated)*100):null;
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
    return {completed:completed.length,killed:killed.length,pipeline:pipeline.length,running:running.length,revImpacted,revAtRisk,totalEstimated,totalActual,calibration,winRate,wins:wins.length,closed:closed.length,avgDays,catCounts,typeCounts,outCounts,vel,avgIce};
  },[items,bounds,cats]);

  const filtered = useMemo(()=>{
    let list=items.slice();
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
  },[items,fSt,fCat,fType,fOwn,sort]);

  const goDetail = id=>{setSelId(id);setNav("detail");};
  const goNew    = ()=>setShowTpl(true);
  const goEdit   = item=>{setForm({...item});setNav("form");};

  const startFromTemplate = tpl=>{
    const base=mkDefault(cats);
    const defs=tpl?tpl.defaults:{};
    setForm({...base,...defs,initType:tpl?tpl.initType:"A/B Test"});
    setShowTpl(false);setNav("form");
  };

  const handleSave = ()=>{
    if(!form||!form.title) return;
    const {_new,...data}=form;
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
    const r={...rForm,actualRevenueImpact:rForm.actualRevenueImpact!==""?parseInt(rForm.actualRevenueImpact)||0:null};
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
      <style>{"@import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css');*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}input[type=range]{accent-color:"+t.gold+"}"}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 20px",borderBottom:"1px solid "+t.border,background:t.headerBg,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <span style={{fontSize:14,fontWeight:700,letterSpacing:"0.14em",color:t.gold,fontFamily:t.serif}}>GROWTH OS</span>
          <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em"}}>{settings.companyName}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {navBtn("dashboard","Dashboard")}
          {navBtn("initiatives","Initiatives")}
          {(nav==="detail"||nav==="form")&&<button onClick={()=>setNav("initiatives")} style={{...gGh(t),gap:4}}><span style={{fontSize:13}}>&#8592;</span> Back</button>}
          {nav==="initiatives"&&<button onClick={goNew} style={gG(t)}><span>+</span> New</button>}
          <button onClick={()=>setShowSet(true)} title="Settings" style={{fontSize:15,padding:"5px 8px",borderRadius:4,cursor:"pointer",background:"transparent",border:"1px solid "+t.border,color:t.textMuted}}>{"⚙"}</button>
          <button onClick={toggleDk} title={dk?"Light mode":"Dark mode"} style={{fontSize:15,padding:"5px 8px",borderRadius:4,cursor:"pointer",background:"transparent",border:"1px solid "+t.border,color:t.textMuted}}>{dk?"☀":"☾"}</button>
        </div>
      </div>

      {nav==="dashboard"&&<DashView t={t} dk={dk} dash={dash} cats={cats} settings={settings} dRange={dRange} setDRange={setDRange} cFrom={cFrom} cTo={cTo} setCFrom={setCFrom} setCTo={setCTo} onGo={()=>setNav("initiatives")}/>}

      {nav==="initiatives"&&(
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {["All",...STATUSES].map(s=>(
                <button key={s} onClick={()=>setFSt(s)} style={{fontSize:12,padding:"4px 10px",borderRadius:4,cursor:"pointer",fontFamily:t.mono,background:fSt===s?t.gold:"transparent",border:"1px solid "+(fSt===s?t.gold:t.border),color:fSt===s?t.goldText:t.textMuted}}>{s}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <select value={fCat}  onChange={e=>setFCat(e.target.value)}  style={gSl(t)}>{["All",...cats].map(c=><option key={c}>{c}</option>)}</select>
              <select value={fType} onChange={e=>setFType(e.target.value)} style={gSl(t)}>{["All",...INIT_TYPES].map(tp=><option key={tp}>{tp}</option>)}</select>
              <select value={fOwn}  onChange={e=>setFOwn(e.target.value)}  style={gSl(t)}>{owners.map(o=><option key={o}>{o}</option>)}</select>
              <select value={sort}  onChange={e=>setSort(e.target.value)}  style={gSl(t)}>
                <option value="ice">ICE Score</option>
                <option value="endDate">End date</option>
                <option value="revenue">Revenue</option>
                <option value="newest">Newest</option>
              </select>
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
                <div style={{fontSize:14,fontWeight:700,color:t.text,lineHeight:1.4,marginBottom:4,fontFamily:t.serif}}>{item.title}</div>
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
          onResults={()=>{setRForm(sel.results?{...sel.results,actualRevenueImpact:sel.results.actualRevenueImpact!=null?sel.results.actualRevenueImpact:""}:{actualOutcome:"",keyLearning:"",outcomeClassification:"Success",decisionMade:"",outcomeCertainty:75,actualRevenueImpact:""});setShowR(true);}}
          onLink={goDetail}/>
      )}

      {nav==="form"&&form&&(
        <FormView form={form} setForm={setForm} items={items} t={t} dk={dk} cats={cats}
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
            <div style={{display:"flex",justifyContent:"flex-end"}}><button style={gG(t)} onClick={saveResults} disabled={!rForm.keyLearning}>Save results</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// -- Dashboard -----------------------------------------------------------------
function DashView({t,dk,dash,cats,settings,dRange,setDRange,cFrom,cTo,setCFrom,setCTo,onGo}) {
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
          <div style={{fontSize:20,color:t.textMuted,alignSelf:"center"}}>→</div>
          <div><div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Target</div><div style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.serif}}>{settings.northStarTarget}</div></div>
        </div>
        <div style={{marginLeft:"auto",fontSize:11,color:t.textMuted,fontFamily:t.mono}}>{settings.businessModel}</div>
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
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
        {[
          {l:"Revenue impacted",v:fmtCur(dash.revImpacted),s:"from completed"},
          {l:"Revenue at risk",  v:fmtCur(dash.revAtRisk),  s:"running now"},
          {l:"Completed",        v:dash.completed},
          {l:"Killed",           v:dash.killed},
          {l:"Draft pipeline",   v:dash.pipeline},
          {l:"Running",          v:dash.running},
          {l:"Win rate",         v:dash.winRate!==null?dash.winRate+"%":"—",s:dash.wins+"/"+dash.closed+" closed"},
          {l:"Avg days to close",v:dash.avgDays||"—",s:"completed only"},
          {l:"Avg ICE score",    v:dash.avgIce||"—",s:"all initiatives"},
        ].map(m=>(
          <div key={m.l} style={gCd(t)}>
            <div style={gSL(t)}>{m.l}</div>
            <div style={{fontSize:24,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{m.v}</div>
            {m.s&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginTop:2}}>{m.s}</div>}
          </div>
        ))}
      </div>

      {/* Calibration card */}
      <div style={{...gCd(t),border:"1px solid "+(dash.calibration!==null?(dash.calibration>=80?t.goldBorder:dash.calibration>=50?"#c0a030":t.border):t.border)}}>
        <div style={gSL(t)}>Revenue estimate calibration</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,alignItems:"center"}}>
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
          <h2 style={{margin:0,fontSize:19,fontWeight:700,color:t.text,lineHeight:1.3,letterSpacing:"-0.02em",fontFamily:t.serif}}>{item.title}</h2>
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

      {/* Revenue estimate vs actual */}
      {(item.revenueImpact!==0||item.results?.actualRevenueImpact!=null)&&(
        <div style={gSc(t)}>
          <div style={gSL(t)}>Revenue impact</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"+(item.results?.actualRevenueImpact!=null?" 1fr":""),gap:16}}>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Estimated</div>
              <div style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(item.revenueImpact)}</div>
            </div>
            {item.results?.actualRevenueImpact!=null&&<>
              <div>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Actual</div>
                <div style={{fontSize:20,fontWeight:700,color:t.gold,fontFamily:t.serif}}>{fmtCur(item.results.actualRevenueImpact)}</div>
              </div>
              {item.revenueImpact!==0&&(
                <div>
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Accuracy</div>
                  <div style={{fontSize:20,fontWeight:700,fontFamily:t.serif,color:t.gold}}>{Math.round((item.results.actualRevenueImpact/item.revenueImpact)*100)}%</div>
                </div>
              )}
            </>}
          </div>
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
function FormView({form,setForm,items,t,dk,cats,aiLoad,iceLoad,hypReview,iceReview,dataCtx,setDataCtx,onAi,onIceAssist,onAcceptHyp,onRejectHyp,onAcceptIce,onRejectIce,onSave,onCancel}) {
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

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
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
          <div style={gSL(t)}>ICE Scoring — Impact · Certainty · Ease</div>
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

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <FR label="Sample size" t={t}><input style={gI(t)} value={form.sampleSize||""} onChange={e=>f("sampleSize",e.target.value)}/></FR>
        <FR label="Duration" t={t}><input style={gI(t)} value={form.duration||""} onChange={e=>f("duration",e.target.value)}/></FR>
        <FR label="Revenue impact ($)" t={t}><input style={gI(t)} type="number" value={form.revenueImpact||0} onChange={e=>f("revenueImpact",parseInt(e.target.value)||0)}/></FR>
      </div>

      <div style={{...gSc(t),border:"1px dashed "+t.border}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={gSL(t)}>Data context <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:t.textMuted}}>(optional — used by AI)</span></div>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,background:t.border,padding:"2px 6px",borderRadius:3}}>Placeholder</span>
        </div>
        <textarea style={{...gTA(t),fontSize:12}} rows={3} value={dataCtx} onChange={e=>setDataCtx(e.target.value)} placeholder={"Paste relevant metrics here — CVR, ROAS, sessions, revenue trends, etc.\nExample: Paid social CVR last 4W: 0.42% vs prior 4W: 1.85%. ROAS: 0.24x.\nFuture: will connect to Google Sheets, GA4, Meta Ads."}/>
      </div>

      <FR label="Notes" t={t}><textarea style={gTA(t)} rows={2} value={form.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="Sequencing logic, caveats, context"/></FR>

      <FR label="Link related initiatives" t={t}>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {items.filter(e=>e.id!==form.id).map(e=>{
            const lnk=form.linkedIds&&form.linkedIds.includes(e.id);
            return <button key={e.id} onClick={()=>f("linkedIds",lnk?form.linkedIds.filter(id=>id!==e.id):[...(form.linkedIds||[]),e.id])} style={{fontSize:11,padding:"3px 9px",borderRadius:4,cursor:"pointer",background:lnk?(dk?"#122a18":"#edfaf2"):(dk?"#1a1a14":"#f5f5f0"),border:"1px solid "+(lnk?(dk?"#2a7a40":"#7adca0"):t.border),color:lnk?(dk?"#60d080":"#1a7a48"):t.textMuted}}>{lnk?"✓ ":""}{e.title.slice(0,36)}{e.title.length>36?"…":""}</button>;
          })}
        </div>
      </FR>

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
                {c}<button onClick={()=>f("categories",local.categories.filter(x=>x!==c))} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",padding:0,fontSize:12,lineHeight:1,opacity:0.6}}>×</button>
              </span>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input style={{...gI(t),flex:1}} value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCat();}} placeholder="New category…"/>
            <button style={gG(t)} onClick={addCat}>Add</button>
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
          <button style={gG(t)} onClick={()=>onSave(local)}>Save settings</button>
        </div>
      </div>
    </Modal>
  );
}