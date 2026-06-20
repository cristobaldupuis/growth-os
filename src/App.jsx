import { Analytics } from "@vercel/analytics/react";
import { useState, useEffect, useMemo } from "react";
import {
  COMPANY_NAME, BUSINESS_MODEL,
  NORTH_STAR_METRIC, NORTH_STAR_CURRENT, NORTH_STAR_TARGET,
  BRANDS as CONFIG_BRANDS,
  CATEGORIES,
  AGENTS as CONFIG_AGENTS,
  TEMPLATES,
  SEED,
  SEED_WEEKLY_METRICS,
} from "./config.js";

import { KEY_ITEMS, KEY_SETTINGS, KEY_DEBATES, KEY_METRICS, KEY_RECS, KEY_THEME, store, handleDownloadBackup, handleRestoreBackup } from "./services/store.js";
import {
  applyBrandBriefDefaults, DEFAULT_AGENTS, DEFAULT_SETTINGS,
  STATUSES, OUTCOMES, INIT_TYPES, METRIC_SOURCES,
  TL, TD, SL, SD, OL, OD,
  catColor, brandColor, brandName, iceScore, iceColor,
  fmtCur, fmtDate, parseD, somM, eomM, mondayOf,
  parseMetricsCSV, generateInitId, mkDefault, withRunningSnapshot, computePredictionError,
} from "./constants.js";
import { downloadCSV, itemToCSVRow, normaliseDate, parseCSV, normalizeInitiativeRecord } from "./services/csv.js";
import { buildLearningsIndex, buildPortfolioContext } from "./services/portfolio.js";
import { callExpandHypothesis } from "./services/ai/callExpandHypothesis.js";
import { callSuggestICE } from "./services/ai/callSuggestICE.js";
import { callQuickCapture } from "./services/ai/callQuickCapture.js";
import { callGenerateCandidates } from "./services/ai/callGenerateCandidates.js";
import { callExpandRecommendation } from "./services/ai/callExpandRecommendation.js";
import { gG, gGh, gI, gTA, gSl, gSc, gSL, gCd } from "./components/styles.js";
import { Bdg, SBdg, OBdg, CBdg, TBdg, BlockerBadge, ICEChip } from "./components/badges.jsx";
import { Modal } from "./components/Modal.jsx";
import { CBar } from "./components/CBar.jsx";
import { EAlert } from "./components/EAlert.jsx";
import { FR } from "./components/FR.jsx";
import { CitationModal } from "./components/citation.jsx";
import { CopilotPanel } from "./views/CopilotPanel.jsx";
import { DashView } from "./views/DashView.jsx";
import { DetailView } from "./views/DetailView.jsx";
import { FormView } from "./views/FormView.jsx";
import { TriageView } from "./views/TriageView.jsx";
import { LearningLibrary } from "./views/LearningLibrary.jsx";
import { ClientReadoutView } from "./views/ClientReadoutView.jsx";

// ── Guide drawer ─────────────────────────────────────────────────────────────
// Feature discovery, organized by job-to-be-done rather than by feature name.
// Doubles as the onboarding walkthrough artifact on first client calls.
// Each entry: what it does, why it matters, and a deep-link into the live view.
// `openSection` is a section id to auto-scroll to (set when opened from an
// inline hint); null-but-open shows the full guide from the top.
const GUIDE_SECTIONS = [
  {
    id: "signal",
    views: ["signal","dashboard"],
    label: "Generate net-new strategy",
    feature: "Signal AI — C-suite debate engine",
    what: "A panel of C-suite AI personas debates your current portfolio and constraints, then synthesizes net-new initiatives you haven't thought of — each one grounded in your real brand brief and learnings.",
    why: "This is the part no spreadsheet or tracker can do. It turns your portfolio state into fresh, defensible strategy on demand — the thinking partner in the room.",
    cta: "Open Signal",
    action: "signal",
  },
  {
    id: "recs",
    views: ["dashboard"],
    label: "Get this week's experiments",
    feature: "Next Plays — weekly recommendations",
    what: "Proactive experiment suggestions with the hypothesis pre-written and ICE pre-scored, drawn from your portfolio, learnings library, brand briefs, and latest metrics.",
    why: "Removes the blank-page problem every week. You walk into the standup with three grounded plays already framed and prioritized.",
    cta: "Go to Dashboard",
    action: "dashboard",
  },
  {
    id: "contribution",
    views: ["dashboard"],
    label: "Prove ROI to justify the retainer",
    feature: "Contribution-to-revenue view",
    what: "A three-layer revenue picture — realised, probability-weighted in-flight, and probability-weighted pipeline — broken down by category, with one-click copy for client emails.",
    why: "This is the answer to \"what did this engagement actually drive?\" It's the artifact that justifies renewals.",
    cta: "Go to Dashboard",
    action: "dashboard",
  },
  {
    id: "library",
    views: ["library"],
    label: "Never re-run a dead experiment",
    feature: "Learnings library",
    what: "Every closed initiative becomes a searchable learning, tagged by outcome, category, and type. Filter, synthesize across them with AI, or replicate a winner in one click.",
    why: "Institutional memory that compounds. The longer the engagement runs, the smarter every recommendation gets.",
    cta: "Open Library",
    action: "library",
  },
  {
    id: "initiatives",
    views: ["initiatives","detail","form"],
    label: "Track & prioritize the portfolio",
    feature: "Initiatives + ICE scoring",
    what: "The full initiative pipeline with ICE scoring, status tracking, blockers, owners, multi-retailer support, CSV import/export, and quick capture for half-formed ideas.",
    why: "One ranked, shared source of truth for what's running, what's queued, and what it's worth.",
    cta: "Open Initiatives",
    action: "initiatives",
  },
  {
    id: "triage",
    views: ["triage"],
    label: "Run the weekly review",
    feature: "Triage",
    what: "Surfaces initiatives that need a decision this week — overdue, awaiting results, or blocked — so nothing stalls silently.",
    why: "Keeps the portfolio moving and gives the standup its agenda.",
    cta: "Open Triage",
    action: "triage",
  },
  {
    id: "data",
    views: ["settings"],
    label: "Keep your data safe & portable",
    feature: "Backup, restore & metrics import",
    what: "Download a full JSON backup any time, restore from one, log weekly metrics manually, or import from Meta / GA4. Brand briefs and settings live in one place.",
    why: "Your portfolio is portable and recoverable — no lock-in, no silent data loss.",
    cta: "Open Settings",
    action: "settings",
  },
];

function GuideDrawer({ t, dk, openSection, onClose, onNavigate, nav }) {
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    GUIDE_SECTIONS.forEach(s => { init[s.id] = s.views.includes(nav); });
    if (openSection && openSection !== true) init[openSection] = true;
    return init;
  });

  useEffect(() => {
    setExpanded(() => {
      const next = {};
      GUIDE_SECTIONS.forEach(s => { next[s.id] = s.views.includes(nav); });
      if (openSection && openSection !== true) next[openSection] = true;
      return next;
    });
  }, [nav, openSection]);

  useEffect(() => {
    if (openSection && openSection !== true) {
      const el = document.getElementById("guide-sec-" + openSection);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }, [openSection]);

  const relevant = GUIDE_SECTIONS.filter(s => s.views.includes(nav));
  const rest = GUIDE_SECTIONS.filter(s => !s.views.includes(nav));
  const hasRelevant = relevant.length > 0;

  const renderCard = (s) => (
    <div key={s.id} id={"guide-sec-"+s.id}
      style={{background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:12,padding:"16px 18px"}}>
      <div onClick={()=>setExpanded(prev=>({...prev,[s.id]:!prev[s.id]}))}
        style={{cursor:"pointer",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,letterSpacing:"0.09em",textTransform:"uppercase",color:t.gold,fontFamily:t.mono,fontWeight:700,marginBottom:6}}>{s.label}</div>
          <div style={{fontSize:14.5,fontWeight:700,color:t.text,fontFamily:t.serif}}>{s.feature}</div>
        </div>
        <span style={{color:t.textMuted,fontSize:10,flexShrink:0,marginTop:4,display:"inline-block",transition:"transform 0.18s",transform:expanded[s.id]?"rotate(180deg)":"rotate(0deg)"}}>&#9660;</span>
      </div>
      {expanded[s.id] && (
        <>
          <p style={{margin:"0 0 8px",fontSize:13,color:t.textSub,lineHeight:1.6,fontFamily:t.sans}}>{s.what}</p>
          <p style={{margin:"0 0 12px",fontSize:12.5,color:t.textMuted,lineHeight:1.6,fontFamily:t.sans,fontStyle:"italic"}}>{s.why}</p>
        </>
      )}
      <button onClick={e=>{e.stopPropagation();onNavigate(s.action);}} style={{...gG(t),fontSize:11.5,padding:"5px 12px"}}>{s.cta} &#8594;</button>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:dk?"rgba(0,0,0,0.6)":"rgba(20,18,10,0.35)",zIndex:320,display:"flex",justifyContent:"flex-end"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:t.surface,borderLeft:"1px solid "+t.border,width:"100%",maxWidth:460,height:"100%",overflowY:"auto",boxShadow:"-8px 0 32px rgba(0,0,0,0.18)",animation:"slideIn 0.2s ease"}}>
        {/* Header */}
        <div style={{position:"sticky",top:0,background:t.surface,borderBottom:"1px solid "+t.border,padding:"18px 22px",zIndex:2}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>What can Growth OS do?</div>
              <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,marginTop:3}}>Every capability, grouped by what you're trying to accomplish.</div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",fontSize:18,lineHeight:1,flexShrink:0}}><span>&#10005;</span></button>
          </div>
        </div>
        {/* Sections */}
        <div style={{padding:"16px 22px 40px",display:"flex",flexDirection:"column",gap:14}}>
          {hasRelevant ? (
            <>
              <div>
                <div style={{fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,fontWeight:700,paddingBottom:6}}>Relevant to where you are</div>
                <div style={{height:1,background:t.border}}/>
              </div>
              {relevant.map(renderCard)}
              <div style={{marginTop:4}}>
                <div style={{fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,fontWeight:700,paddingBottom:6}}>Everything else</div>
                <div style={{height:1,background:t.border}}/>
              </div>
              {rest.map(renderCard)}
            </>
          ) : (
            GUIDE_SECTIONS.map(renderCard)
          )}
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,textAlign:"center",lineHeight:1.7,paddingTop:6}}>
            Tip: open this any time from the <strong style={{color:t.textSub}}>?</strong> in the top bar.
          </div>
        </div>
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
  const [detailOrigin, setDetailOrigin] = useState("initiatives");
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
  const [guideSection, setGuideSection] = useState(null); // null=closed; string=open & scroll to section id
  const [debates,   setDebates]   = useState([]);
  const [recs,      setRecs]      = useState([]); // [{id, generatedAt, recommendations:[...]}]
  const [recsLoad,  setRecsLoad]  = useState(false);
  const [recsErr,   setRecsErr]   = useState("");
  const [showRecModal, setShowRecModal] = useState(null); // {batchId, recId} or null
  const [pendingRecAccept, setPendingRecAccept] = useState(null); // {batchId, recId} — rec awaiting a successful save before its status flips
  const [weeklyMetrics, setWeeklyMetrics] = useState([]);
  const [showPulse, setShowPulse] = useState(false);
  const [showMetricsImport, setShowMetricsImport] = useState(false);
  const [toast, setToast] = useState(null); // {msg, type:"info"|"error"|"success"}
  const showToast = (msg, type="info") => { setToast({msg,type}); setTimeout(()=>setToast(null), 3500); };

  // Restore confirm modal state
  const [restorePayload, setRestorePayload] = useState(null);
  // Backup nudge — fires at most once per session if the last backup is stale
  const [backupNudged, setBackupNudged] = useState(false);

  const t    = dk ? TD : TL;
  const cats   = settings.categories || DEFAULT_SETTINGS.categories;
  const brands = settings.brands || DEFAULT_SETTINGS.brands || CONFIG_BRANDS;

  useEffect(()=>{
    const load = async ()=>{
      try {
        const [ir,sr,dr,mr,rr,tr] = await Promise.all([store.get(KEY_ITEMS),store.get(KEY_SETTINGS),store.get(KEY_DEBATES),store.get(KEY_METRICS),store.get(KEY_RECS),store.get(KEY_THEME)]);
        // Read theme from the resolved store before first render (gated on `loaded`),
        // so the persisted choice applies without an async flash.
        if(tr&&tr.value) setDk(tr.value==="dark");
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
        else { setWeeklyMetrics(SEED_WEEKLY_METRICS); store.set(KEY_METRICS,JSON.stringify(SEED_WEEKLY_METRICS)); }
        if(rr&&rr.value) setRecs(JSON.parse(rr.value));
      } catch { setItems(SEED); }
      setLoaded(true);
      // Stale-backup nudge — once per session, if it's been >14 days since the last download
      try {
        const lastBackup = localStorage.getItem("gos_last_backup");
        if (lastBackup && !backupNudged) {
          const daysSince = (Date.now() - new Date(lastBackup).getTime()) / 86400000;
          if (daysSince > 14) {
            showToast("You haven't backed up in over 14 days — consider downloading a backup.", "info");
            setBackupNudged(true);
          }
        }
      } catch {}
    };
    load();
  },[]);

  const saveItems    = d => { const now = new Date().toISOString(); const stamped = d.map(item => ({ ...item, updatedAt: now })); setItems(stamped); try{store.set(KEY_ITEMS,JSON.stringify(stamped));}catch{} };
  const saveSettings = s => { setSettings(s); try{store.set(KEY_SETTINGS,JSON.stringify(s));}catch{} };
  const saveDebates  = d => { setDebates(d); try{store.set(KEY_DEBATES,JSON.stringify(d));}catch{} };
  const saveMetrics  = m => { setWeeklyMetrics(m); try{store.set(KEY_METRICS,JSON.stringify(m));}catch{} };
  const saveRecs     = r => { setRecs(r);          try{store.set(KEY_RECS,JSON.stringify(r));}catch{} };
  const toggleDk     = ()=> { setDk(n => { const next=!n; try{store.set(KEY_THEME,next?"dark":"light");}catch{} return next; }); };

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

      // Rank by the candidate's self-assessed confidence (high > medium > low),
      // preserving the generator's best-first order within a tier, then take 3.
      const confRank = { high: 3, medium: 2, low: 1 };
      const top3 = candidates
        .map((c, i) => ({ c, i, r: confRank[(c.confidence || "").toLowerCase()] ?? 0 }))
        .sort((a, b) => b.r - a.r || a.i - b.i)
        .slice(0, 3)
        .map(x => x.c);

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
            // Pass 1 rationale — the specific portfolio signal that triggered this
            // candidate. Surfaced as the "Why now" line on the recommendation card.
            whyNow: cand.rationale || "",
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

      // weekOf: Monday of the generation week (YYYY-MM-DD). Stable across same-week
      // regenerations so the diff always compares against a prior-week batch, not the
      // earlier generation from the same Monday session.
      const _now = new Date();
      const _day = _now.getDay();
      const _mon = new Date(_now);
      _mon.setDate(_now.getDate() + (_day === 0 ? -6 : 1 - _day));
      const weekOf = _mon.toISOString().slice(0, 10);

      const now = new Date();
      const batch = {
        id: "recbatch-"+Date.now(),
        generatedAt: now.toISOString(),
        weekOf: mondayOf(now).toISOString().slice(0,10),
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

    // Defer the status flip until the initiative is actually saved. If the user
    // dismisses the form without saving, the recommendation stays in its prior
    // state — see handleSave (commit) and onCancel (clear).
    setPendingRecAccept({ batchId, recId });
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


  // -- Demo data reset ----------------------------------------------------------
  const handleResetDemoData = () => {
    saveItems(SEED);
    saveMetrics(SEED_WEEKLY_METRICS);
    showToast(`Demo data restored — ${SEED.length} initiatives and ${SEED_WEEKLY_METRICS.length} weeks of metrics loaded.`, "success");
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
    // Prefer measured actuals; fall back to the projected estimate only where
    // actuals haven't been logged yet. revImpactedProjected flags that the
    // headline includes at least one estimate (so the tile can qualify it).
    const hasActualRev = e => e.results && typeof e.results.actualRevenueImpact==="number";
    const revImpacted   = completed.reduce((s,e)=>s+Math.max(0,hasActualRev(e)?e.results.actualRevenueImpact:e.revenueImpact),0);
    const revImpactedProjected = completed.some(e=>!hasActualRev(e)&&(e.revenueImpact||0)>0);
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
      const realisedItems = completed
        .filter(e=>e.category===c&&e.results&&typeof e.results.actualRevenueImpact==="number");
      // Guard the revenue artifact: only count revenue from TRACKED initiatives
      // (real frozen prediction → measured actual) toward the headline figure.
      // Backfilled actuals are remembered estimates; surface them separately so a
      // client-facing number is never silently inflated by guesswork.
      const realised = realisedItems
        .filter(e=>e.predictionSnapshot)
        .reduce((s,e)=>s+Math.max(0,e.results.actualRevenueImpact),0);
      const realisedBackfilled = realisedItems
        .filter(e=>!e.predictionSnapshot)
        .reduce((s,e)=>s+Math.max(0,e.results.actualRevenueImpact),0);
      const inflightRaw = running.filter(e=>e.category===c).reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
      const pipelineRaw = pipeline.filter(e=>e.category===c).reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
      const rate = catWinRate[c];
      return {
        category: c,
        realised,
        realisedBackfilled,
        inflight: Math.round(inflightRaw * rate),
        pipeline: Math.round(pipelineRaw * rate),
        winRate: Math.round(rate * 100),
        usesFallback: allClosedForRate.filter(e=>e.category===c).length < 3,
      };
    }).filter(r=>r.realised>0||r.realisedBackfilled>0||r.inflight>0||r.pipeline>0);
    const contributionTotals = contribution.reduce((acc,r)=>({
      realised: acc.realised + r.realised,
      realisedBackfilled: acc.realisedBackfilled + r.realisedBackfilled,
      inflight: acc.inflight + r.inflight,
      pipeline: acc.pipeline + r.pipeline,
    }),{realised:0,realisedBackfilled:0,inflight:0,pipeline:0});

    return {completed:completed.length,killed:killed.length,pipeline:pipeline.length,running:running.length,revImpacted,revImpactedProjected,revAtRisk,totalEstimated,totalActual,calibration,totalEstCost,totalActualCost,closedROI,winRate,wins:wins.length,closed:closed.length,avgDays,catCounts,typeCounts,outCounts,vel,avgIce,contribution,contributionTotals,_runningItems:running};
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

  const goDetail = (id, origin)=>{ if(origin) setDetailOrigin(origin); setSelId(id); setNav("detail"); };
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
    saveItems(updated);
    // A recommendation only transitions to "accepted" once its initiative saves.
    if(pendingRecAccept){
      const {batchId,recId}=pendingRecAccept;
      saveRecs(recs.map(b=>b.id!==batchId?b:{
        ...b,
        recommendations:b.recommendations.map(r=>
          r.id===recId?{...r,status:"accepted",acceptedAsInitId:data.id}:r
        ),
      }));
      setPendingRecAccept(null);
    }
    setNav(_new?"initiatives":"detail");
    setForm(null);setHypReview(null);setIceReview(null);setDataCtx("");
  };

  const reqStatus = s=>{
    if(s==="Completed"||s==="Killed"){setPendS(s);setConfC(sel&&sel.ice&&sel.ice.certainty?sel.ice.certainty*10:75);setShowSM(true);}
    else saveItems(items.map(e=>e.id===selId?withRunningSnapshot({...e,status:s},s):e));
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
      durability: rForm.durability==="structural" ? "structural" : "tactical",
      actualRevenueImpact:rForm.actualRevenueImpact!==""?parseInt(rForm.actualRevenueImpact)||0:null,
      actualSpendCost:rForm.actualSpendCost!==""&&rForm.actualSpendCost!==undefined?parseInt(rForm.actualSpendCost)||0:null,
      actualResourceCost:rForm.actualResourceCost!==""&&rForm.actualResourceCost!==undefined?parseInt(rForm.actualResourceCost)||0:null,
    };
    saveItems(items.map(e=>{
      if(e.id!==selId) return e;
      // Freeze the signed prediction-vs-actual delta against the launch
      // snapshot at the moment of close — the calibration record.
      return {...e, results:{...r, predictionError: computePredictionError(e, r)}};
    }));
    setShowR(false);
  };

  const handleAiExpand = async()=>{
    if(!form||!form.hypothesis||form.hypothesis.length<60) return;
    setAiLoad(true);
    try{const x=await callExpandHypothesis(form.hypothesis,form.title,settings,dataCtx);if(x)setHypReview({proposed:x});}
    catch(err){console.error("Expand hypothesis error:",err);showToast(err.message||"AI expand failed — try again.","error");}
    setAiLoad(false);
  };

  const handleIceAssist = async()=>{
    if(!form||!form.hypothesis) return;
    setIceLoad(true);
    try{const x=await callSuggestICE(form,settings,dataCtx);if(x&&x.impact)setIceReview(x);}
    catch(err){console.error("ICE assist error:",err);showToast(err.message||"AI scoring failed — try again.","error");}
    setIceLoad(false);
  };


  // -- CSV helpers (import + export) ------------------------------------------


  const handleExportCSV = (rowsToExport, filename) => {
    downloadCSV(rowsToExport.map(item => itemToCSVRow(item, brands)), filename);
  };

  const TEMPLATE_URL = "https://docs.google.com/spreadsheets/d/1Oar4THeAKIGvvBzKUmqwfWersaUdLqqoq-FW_jBvS1E/edit?gid=896589738#gid=896589738";
  const handleDownloadTemplate = () => { window.open(TEMPLATE_URL, "_blank"); };


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

        // Delegate shape-building to the shared ingestion contract. CSV rows
        // already use the contract's field names, so they pass straight through.
        // A future Shopify/GA4 adapter targets this same function.
        return normalizeInitiativeRecord(r, { items, brands, cats, idPrefix: "csv", idx, sd, ed });
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
                <div>Next Plays: <strong style={{color:t.text}}>{restorePayload.counts.recs}</strong></div>
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
                if (Array.isArray(parsed.recs))          saveRecs(parsed.recs);
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
              {navBtn("readout","Client Readout")}
            </div>
            {(nav==="detail"||nav==="form")&&(
              <button onClick={()=>setNav(nav==="detail"?detailOrigin:"initiatives")} style={{...gGh(t),padding:"6px 12px",fontSize:12}}>
                <span style={{fontSize:12}}>&#8592;</span> Back to {nav==="detail"?(detailOrigin==="triage"?"Triage":detailOrigin==="library"?"Library":"Initiatives"):"Initiatives"}
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
            <button onClick={()=>setGuideSection("signal")} title="What is Signal?"
              style={{width:20,height:20,marginLeft:-4,borderRadius:"50%",cursor:"pointer",background:"transparent",border:"1px solid "+t.border,color:t.textMuted,fontSize:11,fontWeight:700,fontFamily:t.serif,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              ?
            </button>
            <button onClick={()=>setGuideSection(true)} title="What can Growth OS do?"
              style={{width:32,height:32,borderRadius:9,cursor:"pointer",background:t.surfaceAlt,border:"1px solid "+t.border,color:t.textSub,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,fontFamily:t.serif}}>
              ?
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

      {nav==="dashboard"&&<DashView t={t} dk={dk} dash={dash} cats={cats} settings={settings} brands={brands} activeBrand={activeBrand} weeklyMetrics={weeklyMetrics} onLog={()=>setShowPulse(true)} onImport={()=>setShowMetricsImport(true)} dRange={dRange} setDRange={setDRange} cFrom={cFrom} cTo={cTo} setCFrom={setCFrom} setCTo={setCTo} onGo={()=>setNav("initiatives")} recs={recs} recsLoad={recsLoad} recsErr={recsErr} items={items} onGenerateRecs={generateRecommendations} onOpenRec={(batchId,recId)=>setShowRecModal({batchId,recId})} showToast={showToast} onSaveItems={saveItems}/>}
      {nav==="triage"&&<TriageView items={items} t={t} dk={dk} cats={cats} brands={brands} activeBrand={activeBrand} onDetail={(id)=>goDetail(id,"triage")}
        onStatus={(id,status)=>{const it=items.find(e=>e.id===id); if(it){setSelId(id); reqStatus(status);}}}
        onLogResults={(id)=>{const it=items.find(e=>e.id===id); if(it){setSelId(id); setRForm(it.results?{...it.results,actualRevenueImpact:it.results.actualRevenueImpact!=null?it.results.actualRevenueImpact:"",actualSpendCost:it.results.actualSpendCost!=null?it.results.actualSpendCost:"",actualResourceCost:it.results.actualResourceCost!=null?it.results.actualResourceCost:""}:{actualOutcome:"",keyLearning:"",outcomeClassification:"Success",decisionMade:"",outcomeCertainty:75,actualRevenueImpact:"",actualSpendCost:"",actualResourceCost:""}); setShowR(true);}}}
        onExtend={(id,days)=>{saveItems(items.map(e=>{if(e.id!==id)return e; const base=e.endDate?new Date(e.endDate+"T12:00:00"):new Date(); base.setDate(base.getDate()+days); return {...e,endDate:base.toISOString().slice(0,10)};})); showToast("Extended "+days+" days.","success");}}
        onActivate={(id)=>{saveItems(items.map(e=>e.id===id?withRunningSnapshot({...e,status:"Running",startDate:e.startDate||new Date().toISOString().slice(0,10)},"Running"):e)); showToast("Initiative activated — now running.","success");}}
      />}
      {nav==="library"&&<LearningLibrary items={items} t={t} dk={dk} cats={cats} brands={brands} activeBrand={activeBrand} settings={settings} onReplicate={(item)=>{const base=mkDefault(cats,activeBrand);setForm({...base,title:"[Replicate] "+item.title,hypothesis:"Based on learning from: "+item.title+". Original: "+item.hypothesis,category:item.category,initType:item.initType,ice:{...item.ice},revenueImpact:item.revenueImpact,notes:"Replicated from initiative "+item.id+". Original learning: "+item.results.keyLearning});setNav("form");}}/>}
      {nav==="readout"&&<ClientReadoutView t={t} dk={dk} dash={dash} items={items} brands={brands} activeBrand={activeBrand} cats={cats} weeklyMetrics={weeklyMetrics} settings={settings}/>}

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
                  <button onClick={()=>setGuideSection(true)} style={{background:"none",border:"none",color:t.textMuted,fontSize:12,fontFamily:t.mono,cursor:"pointer",marginTop:14,textDecoration:"underline",textUnderlineOffset:3}}>New here? See everything Growth OS can do &#8594;</button>
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
              <div key={item.id} onClick={()=>goDetail(item.id,"initiatives")} style={{...gCd(t,dk),cursor:"pointer",padding:"14px 16px",transition:"border-color .15s, box-shadow .15s"}}
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
          onCancel={()=>{setForm(null);setHypReview(null);setIceReview(null);setDataCtx("");setPendingRecAccept(null);setNav("initiatives");}}/>
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
                } catch(e){ showToast(e.message || "AI extraction failed — try adding more detail.", "error"); }
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

      {showSet&&<SettingsModal t={t} dk={dk} settings={settings} onSave={s=>{saveSettings(s);setShowSet(false);}} onClose={()=>setShowSet(false)} onDownloadBackup={() => { handleDownloadBackup(items, settings, debates, weeklyMetrics, recs); try { localStorage.setItem("gos_last_backup", new Date().toISOString()); } catch {} }} onRestoreBackup={(file) => handleRestoreBackup(file, showToast, setRestorePayload)} onResetDemo={handleResetDemoData}/>}

      {guideSection&&(
        <GuideDrawer t={t} dk={dk} openSection={guideSection} onClose={()=>setGuideSection(null)}
          nav={nav}
          onNavigate={(action)=>{
            setGuideSection(null);
            if(action==="signal")        setShowCopilot(true);
            else if(action==="settings") setShowSet(true);
            else                         setNav(action); // dashboard | library | initiatives | triage
          }}/>
      )}

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
            {sel&&(
              <div style={{padding:"12px 14px",borderRadius:10,background:t.goldBg,border:"1px solid "+t.goldBorder}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:sel.hypothesis?7:0}}>
                  {sel.initId&&<span style={{fontSize:10,fontWeight:600,color:t.gold,fontFamily:t.mono}}>{sel.initId}</span>}
                  <span style={{fontSize:14,fontWeight:600,color:t.text,fontFamily:t.sans,lineHeight:1.3}}>{sel.title}</span>
                </div>
                {sel.hypothesis&&(
                  <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,marginBottom:8}}>
                    <span style={{fontFamily:t.mono,fontSize:10,letterSpacing:"0.06em",textTransform:"uppercase",color:t.textMuted,marginRight:6}}>Hypothesis</span>
                    {sel.hypothesis}
                  </div>
                )}
                <div style={{display:"flex",gap:18,flexWrap:"wrap",fontSize:11.5,fontFamily:t.mono,color:t.textSub}}>
                  {sel.primaryMetric&&<span><span style={{color:t.textMuted}}>Metric:</span> {sel.primaryMetric}</span>}
                  {sel.measurementScope&&<span><span style={{color:t.textMuted}}>Scope:</span> {sel.measurementScope}</span>}
                  {sel.revenueImpact>0&&<span><span style={{color:t.textMuted}}>Est. impact:</span> <span style={{color:t.gold,fontWeight:600}}>{fmtCur(sel.revenueImpact)}</span></span>}
                  {sel.killCriteria&&<span style={{flexBasis:"100%",color:t.textMuted,marginTop:2}}>Kill criteria: <span style={{color:t.textSub}}>{sel.killCriteria.slice(0,120)}{sel.killCriteria.length>120?"…":""}</span></span>}
                </div>
              </div>
            )}
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
            <FR label="Durability — how long does this learning stay relevant?" t={t}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[
                  {k:"tactical",   label:"Tactical",   hint:"Context-bound — decays as platforms, creative, or market shift"},
                  {k:"structural", label:"Structural", hint:"Durable truth about the business — stays relevant for years"},
                ].map(d=>{
                  const act=(rForm.durability||"tactical")===d.k;
                  return (
                    <button key={d.k} title={d.hint} onClick={()=>setRForm({...rForm,durability:d.k})}
                      style={{fontSize:12,padding:"5px 11px",borderRadius:4,cursor:"pointer",fontWeight:600,background:act?t.goldBg:(dk?"#1a1a14":"#f5f5f0"),border:"1px solid "+(act?t.goldBorder:t.border),color:act?t.gold:t.textMuted}}>{d.label}</button>
                  );
                })}
              </div>
              <div style={{fontSize:10.5,color:t.textMuted,fontFamily:t.mono,marginTop:6,lineHeight:1.5}}>
                {(rForm.durability||"tactical")==="structural"
                  ? "Structural — Signal treats this as enduring evidence; not discounted by age."
                  : "Tactical — Signal down-weights this as it ages; library search still surfaces it, flagged by recency."}
              </div>
            </FR>
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
          cats={cats}
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
      <Analytics />
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
// Modal — full recommendation detail with hypothesis, ICE rationale, reasoning
// trace, and cited learnings. Actions: Add to backlog | Dismiss.
function NextPlaysModal({ t, dk, batchId, recId, recs, items, brands, cats, onAccept, onDismiss, onClose }) {
  const batch = recs.find(b => b.id === batchId);
  const rec = batch ? batch.recommendations.find(r => r.id === recId) : null;
  if (!rec) return null;

  const iceTotal = iceScore(rec.ice.impact, rec.ice.certainty, rec.ice.ease);
  const citedLearnings = (rec.sourceLearningIds || [])
    .map(id => items.find(e => e.id === id))
    .filter(Boolean);

  // Footnote map: each cited learning gets a stable superscript number, appended
  // to the reasoning trace as end-of-trace references. The prose stays clean; the
  // numbers tell you what fed the reasoning, and each is clickable.
  const [citeItem, setCiteItem] = useState(null);
  const footnotes = citedLearnings.map((it, i) => ({ n: i+1, item: it }));

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

        {/* Why now — the specific portfolio signal that drove this recommendation
            (Pass 1 rationale). Muted single line, distinct from the hypothesis
            block. Older recs predate this field — render nothing rather than a
            placeholder. */}
        {rec.whyNow && (
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5,marginTop:-6}}>
            <span style={{fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",marginRight:6}}>Why now</span>
            {rec.whyNow}
          </div>
        )}

        {/* Reasoning trace — the trust-builder. Footnote superscripts map to the
            cited learnings below; prose stays clean, references are clickable. */}
        {rec.reasoningTrace && (
          <div style={gSc(t,dk)}>
            <div style={gSL(t)}>Why this, why now</div>
            <p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:14,fontFamily:t.serif}}>
              {rec.reasoningTrace}
              {footnotes.map(f => (
                <button key={f.n} onClick={()=>setCiteItem(f.item)} title={f.item.title}
                  style={{verticalAlign:"super",fontSize:"0.7em",fontWeight:700,fontFamily:t.mono,color:t.gold,
                    background:"none",border:"none",cursor:"pointer",padding:"0 1px",lineHeight:1}}>
                  {f.n}
                </button>
              ))}
            </p>
            {footnotes.length>0 && (
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+t.border,display:"flex",flexDirection:"column",gap:4}}>
                {footnotes.map(f => (
                  <button key={f.n} onClick={()=>setCiteItem(f.item)}
                    style={{display:"flex",gap:6,alignItems:"baseline",background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,fontFamily:t.mono}}>
                    <span style={{fontSize:10,fontWeight:700,color:t.gold}}>{f.n}</span>
                    <span style={{fontSize:11,color:t.textMuted}}>
                      {f.item.initId ? f.item.initId+" — " : ""}{f.item.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
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
                <div key={item.id} onClick={()=>setCiteItem(item)} style={{padding:"10px 12px",background:dk?"#1a1a14":"#fafaf5",borderLeft:"3px solid "+t.gold,borderRadius:"0 4px 4px 0",cursor:"pointer"}}>
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
      {citeItem && <CitationModal item={citeItem} t={t} dk={dk} cats={cats} brands={brands} onClose={()=>setCiteItem(null)}/>}
    </Modal>
  );
}




// -- Settings ------------------------------------------------------------------
function SettingsModal({t,dk,settings,onSave,onClose,onDownloadBackup,onRestoreBackup,onResetDemo}) {
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
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:4,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Health Metrics</div>
          <p style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5,margin:"0 0 10px"}}>
            Portfolio-level guardrail metrics surfaced on the dashboard. Calculated metrics pull from weekly pulse data automatically.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
            {(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).map((metric,idx)=>{
              const updhm=(k,v)=>{const hm=(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).map((m,i)=>i===idx?{...m,[k]:v}:m);setLocal(p=>({...p,healthMetrics:hm}));};
              return (
                <div key={metric.key} style={{padding:"10px 12px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8,opacity:metric.enabled?1:0.55}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button onClick={()=>updhm("enabled",!metric.enabled)}
                      style={{flexShrink:0,width:34,height:20,borderRadius:10,cursor:"pointer",border:"none",
                        background:metric.enabled?t.teal:t.border,position:"relative",transition:"background 0.15s"}}>
                      <span style={{position:"absolute",top:3,left:metric.enabled?16:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.15s"}}/>
                    </button>
                    <input style={{...gI(t),flex:1,fontWeight:600,fontSize:12}} value={metric.label}
                      onChange={e=>updhm("label",e.target.value)} placeholder="Metric label"/>
                    <button onClick={()=>setLocal(p=>({...p,healthMetrics:(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).filter((_,i)=>i!==idx)}))}
                      style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>&#10005;</button>
                  </div>
                  {metric.isCalculated&&(
                    <div style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,lineHeight:1.5,padding:"5px 8px",background:t.surface,border:"1px solid "+t.borderSoft,borderRadius:4}}>
                      {metric.calculationNote}
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>
                        {metric.isCalculated?"MANUAL FALLBACK":"CURRENT VALUE"}
                      </label>
                      <input style={{...gI(t),fontSize:12}} type="number" step="any"
                        value={metric.manualValue??""} placeholder={metric.isCalculated?"Used if auto-calc unavailable":"Enter current value"}
                        onChange={e=>updhm("manualValue",e.target.value===""?null:parseFloat(e.target.value))}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>TARGET (OPTIONAL)</label>
                      <input style={{...gI(t),fontSize:12}} type="number" step="any"
                        value={metric.target??""} placeholder="Target value"
                        onChange={e=>updhm("target",e.target.value===""?null:parseFloat(e.target.value))}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>Direction:</span>
                    {[{v:true,l:"Higher is better"},{v:false,l:"Lower is better"}].map(opt=>(
                      <button key={String(opt.v)} onClick={()=>updhm("higherIsBetter",opt.v)}
                        style={{fontSize:10,padding:"3px 8px",borderRadius:3,cursor:"pointer",fontFamily:t.mono,
                          background:metric.higherIsBetter===opt.v?t.gold:"transparent",
                          border:"1px solid "+(metric.higherIsBetter===opt.v?t.gold:t.border),
                          color:metric.higherIsBetter===opt.v?t.goldText:t.textMuted}}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).length<8&&(
            <button style={{...gGh(t),fontSize:11}} onClick={()=>{
              const hm=local.healthMetrics||DEFAULT_SETTINGS.healthMetrics;
              if(hm.length>=8)return;
              setLocal(p=>({...p,healthMetrics:[...hm,{key:"metric_"+Date.now(),label:"Custom Metric",enabled:true,isCalculated:false,calculationNote:"",manualValue:null,target:null,higherIsBetter:true}]}));
            }}>+ Add metric</button>
          )}
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
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:8,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Demo data</div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.mono,lineHeight:1.6,margin:"0 0 10px"}}>Reload the built-in demo initiatives and weekly metrics. Replaces all current initiatives and weekly pulse data.</p>
          <button onClick={onResetDemo} style={{...gGh(t),fontSize:12}}>&#8635; Reset to demo data</button>
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



