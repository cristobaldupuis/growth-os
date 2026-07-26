import { useState, useMemo, useCallback } from "react";
import { COMPANY_NAME, BUSINESS_MODEL, NORTH_STAR_METRIC } from "../config.js";
import { INIT_TYPES, OL, OD, brandColor, brandName, fmtCur, fmtDate } from "../constants.js";
import { gG, gGh, gI, gSl, gSc } from "../components/styles.js";
import { Bdg, OBdg, CBdg, TBdg } from "../components/badges.jsx";
import { CitationModal } from "../components/citation.jsx";
import { renderCitedText, renderProse } from "../components/text.jsx";
import { callSynthesizeLearnings } from "../services/ai/callSynthesizeLearnings.js";
import { callAskLibrary } from "../services/ai/callAskLibrary.js";

// Layout toggle glyphs. Drawn inline rather than pulled from an icon font so
// the control renders on first paint and offline.
const IconList = ({size=13}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/>
  </svg>
);
const IconGrid = ({size=13}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="2" y="2.5" width="5" height="11" rx="1"/><rect x="9" y="2.5" width="5" height="11" rx="1"/>
  </svg>
);

// -- Learning Library ---------------------------------------------------------
export function LearningLibrary({items, t, dk, cats, brands, activeBrand, onReplicate, settings, view="list", onView}) {
  const [activeOutcomes, setActiveOutcomes] = useState(["Jackpot","Success"]);
  const [fCat,  setFCat]  = useState("All");
  const [fType, setFType] = useState("All");
  const [query, setQuery] = useState("");
  const [synthesis,    setSynthesis]    = useState("");
  const [synthLoad,    setSynthLoad]    = useState(false);
  const [synthVisible, setSynthVisible] = useState(false);
  const [ask,        setAsk]        = useState("");
  const [askAnswer,  setAskAnswer]  = useState("");
  const [askLoad,    setAskLoad]    = useState(false);
  const [askVisible, setAskVisible] = useState(false);
  const [citeItem,   setCiteItem]   = useState(null);

  const normB = useCallback(
    id => (!id||id==="default") ? (brands&&brands[0]&&brands[0].id||"default") : id,
    [brands]
  );
  const closed = useMemo(()=>items.filter(e=>(e.status==="Completed"||e.status==="Killed")&&e.results&&e.results.keyLearning&&(activeBrand==="all"||normB(e.brandId)===normB(activeBrand))),[items,activeBrand,normB]);

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

  const runAsk = async()=>{
    const q = ask.trim();
    if(!q || askLoad) return;
    setAskLoad(true); setAskVisible(true); setAskAnswer("");
    try {
      const corpus = closed.map(e=>({
        initId: e.initId || e.id,
        outcome: e.results.outcomeClassification || "Inconclusive",
        category: e.category,
        retailer: brandName(e.brandId||"default", brands),
        durability: e.results.durability==="structural" ? "structural" : "tactical",
        provenance: e.predictionSnapshot ? "tracked" : "backfilled",
        closedDate: e.endDate || e.createdAt || null,
        learning: e.results.keyLearning,
        decision: e.results.decisionMade || "",
        hypothesis: e.hypothesis || "",
      }));
      const result = await callAskLibrary(q, corpus, settings||{companyName:COMPANY_NAME,businessModel:BUSINESS_MODEL});
      setAskAnswer(result || "No answer returned. Try rephrasing the question.");
    } catch { setAskAnswer("Query failed. Check that your API proxy is deployed and the secret is configured."); }
    setAskLoad(false);
  };

  const gI2 = (t)=>({...gI(t),width:"auto",flex:1,minWidth:160});

  // One micro-label style for every line of a card, so From / Decision /
  // Est / Actual all read as the same rank and none of them needs a container.
  const cLbl = (t)=>({fontSize:9.5,fontWeight:600,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.09em",textTransform:"uppercase",marginRight:6});
  // Shared body line for the card's supporting rows.
  const cLine = (t)=>({fontSize:11.5,color:t.textSub,fontFamily:t.serif,lineHeight:1.45,marginTop:3});

  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:16}}>

      {/* Ask the library: natural-language retrieval over the full closed record */}
      <div style={{...gSc(t),background:t.goldBg,border:"1px solid "+t.goldBorder}}>
        <div style={{fontSize:11,fontWeight:700,color:t.gold,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Ask the library</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start"}}>
          <input style={{...gI(t),flex:1,minWidth:200}} value={ask} onChange={e=>setAsk(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")runAsk();}} placeholder={String.fromCharCode(34)+"Have we tried creative angles for retention?"+String.fromCharCode(34)+"  ·  "+String.fromCharCode(34)+"What worked for us at BFCM?"+String.fromCharCode(34)}/>
          <button style={{...gG(t),whiteSpace:"nowrap"}} disabled={askLoad||!ask.trim()||closed.length===0} onClick={runAsk}>
            {askLoad ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Searching…</> : <>&#128269; Ask</>}
          </button>
        </div>
        <div style={{fontSize:10.5,color:t.textMuted,fontFamily:t.serif,marginTop:6}}>Searches every closed initiative, wins and failures alike, weighing relevance first and recency second.</div>
        {askVisible&&(
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+t.goldBorder}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Answer from {closed.length} closed initiative{closed.length!==1?"s":""}</div>
              <button onClick={()=>{setAskVisible(false);setAskAnswer("");}} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14}}>&#10005;</button>
            </div>
            {askLoad
              ? <div style={{fontSize:13,color:t.textMuted,fontFamily:t.serif}}>Reading the record…</div>
              : <div style={{fontSize:13,color:t.textSub,lineHeight:1.75,whiteSpace:"pre-wrap",fontFamily:t.serif}}>{renderCitedText(askAnswer, (id)=>closed.find(e=>(e.initId||e.id)===id)||null, setCiteItem, t)}</div>}
          </div>
        )}
      </div>

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
              <div style={{fontSize:28,fontWeight:700,color:active?c.text:t.textMuted,fontFamily:t.mono,lineHeight:1}}>{counts[o]||0}</div>
              <div style={{fontSize:11,fontWeight:600,color:active?c.text:t.textMuted,fontFamily:t.serif,marginTop:4,letterSpacing:"0.04em"}}>{o}</div>
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
        {/* Layout toggle. Same segmented-control pattern as the header nav. */}
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>View</label>
          <div style={{display:"flex",gap:2,background:t.surfaceAlt,padding:3,borderRadius:9,border:"1px solid "+t.border}}>
            {[["list",IconList,"List view"],["grid",IconGrid,"Two-column grid view"]].map(([v,Icon,title])=>(
              <button key={v} onClick={()=>onView&&onView(v)} title={title} aria-label={title} aria-pressed={view===v}
                style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:26,borderRadius:7,cursor:"pointer",border:"none",
                  background:view===v?t.surface:"transparent",color:view===v?t.text:t.textMuted,
                  boxShadow:view===v?t.shadow:"none",transition:"all .15s"}}>
                <Icon/>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Count + Synthesize */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>
          <span style={{fontFamily:t.mono}}>{filtered.length}</span> learning{filtered.length!==1?"s":""} {query?"matching":""}
          {filtered.length===0&&closed.length>0&&<span style={{color:t.gold}}> · try adjusting filters or clicking more outcome tiles above</span>}
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
                const result = await callSynthesizeLearnings(payload, settings||{companyName:COMPANY_NAME,businessModel:BUSINESS_MODEL,northStarMetric:NORTH_STAR_METRIC,northStarCurrent:"n/a",northStarTarget:"n/a"});
                setSynthesis(result);
              } catch { setSynthesis("Synthesis failed. Check your API key in Settings."); }
              setSynthLoad(false);
            }}>
            {synthLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Synthesizing…</>:<><span>&#10024;</span> Synthesize learnings</>}
          </button>
        )}
      </div>

      {/* Synthesis panel */}
      {synthVisible&&(
        <div style={{...gSc(t),background:t.tealBg,border:"1px solid "+(t.teal)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:t.teal,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>AI Synthesis · {filtered.length} learnings</div>
            <button onClick={()=>setSynthVisible(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14}}>&#10005;</button>
          </div>
          {synthLoad
            ?<div style={{fontSize:13,color:t.textMuted,fontFamily:t.serif}}>Analysing learnings…</div>
            :synthesis
              ?<div style={{fontSize:13,color:t.textSub,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:t.serif}}>{renderProse(synthesis)}</div>
              :<div style={{fontSize:12,color:t.red,fontFamily:t.serif}}>Synthesis failed. Check that your API proxy is deployed and the API key is configured.</div>
          }
        </div>
      )}

      {/* Empty state */}
      {closed.length===0&&(
        <div style={{padding:"48px 24px",textAlign:"center",color:t.textMuted,fontFamily:t.serif,border:"1px dashed "+t.border,borderRadius:8}}>
          <div style={{fontSize:32,marginBottom:12}}>&#128218;</div>
          <div style={{fontSize:14,marginBottom:6,color:t.text}}>No learnings yet</div>
          <div style={{fontSize:12}}>Learnings appear here when you close an initiative and log results.</div>
        </div>
      )}

      {/* Learning cards. Grid columns are minmax(0,...) so a long unbroken
          learning cannot push a column past its share. */}
      <div style={view==="grid"
        ? {display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,alignItems:"start"}
        : {display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(item=>{
          const isWin=item.results.outcomeClassification==="Jackpot"||item.results.outcomeClassification==="Success";
          return (
            <div key={item.id} style={{background:t.surface,border:"1px solid "+t.border,borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"10px 14px"}}>
                {/* Badges row */}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:6}}>
                  <OBdg o={item.results.outcomeClassification} dk={dk}/>
                  <CBdg cat={item.category} cats={cats} dk={dk} t={t}/>
                  <TBdg type={item.initType} dk={dk} t={t}/>
                  {(item.results.durability==="structural")
                    ? <Bdg label="Structural" color={t.teal} bg={t.tealBg} border={t.teal} small/>
                    : <Bdg label="Tactical" color={t.textMuted} bg={t.surfaceAlt} border={t.border} small/>}
                  {brands&&brands.length>1&&<Bdg label={brandName(item.brandId||"default",brands)} color={brandColor(item.brandId||"default",brands,dk)} bg={t.surfaceAlt} border={t.border} small/>}
                  {item.endDate&&<span style={{fontSize:10.5,color:t.textMuted,fontFamily:t.mono,marginLeft:"auto"}}>{fmtDate(item.endDate)}</span>}
                </div>

                {/* The learning: hero element. Upright, not italic; the quotation
                    marks are what mark it as a quote. The label runs in on the
                    first line so the quote costs no extra row. */}
                <p style={{margin:"0 0 5px",borderLeft:"3px solid "+t.border,paddingLeft:11,fontSize:14,fontWeight:600,color:t.text,lineHeight:1.38,fontFamily:t.serif}}>
                  <span style={{...cLbl(t),fontWeight:600}}>Key learning</span>
                  "{renderProse(item.results.keyLearning)}"
                </p>

                {/* Initiative title */}
                <div style={{...cLine(t),marginTop:0}}>
                  <span style={cLbl(t)}>From</span>{renderProse(item.title)}
                </div>

                {/* Decision made: a plain line matching From, not a box */}
                {item.results.decisionMade&&(
                  <div style={cLine(t)}>
                    <span style={cLbl(t)}>Decision</span>{renderProse(item.results.decisionMade)}
                  </div>
                )}

                {/* Est / Actual stay on one inline row, and the action rides
                    the same row rather than claiming a block of its own. */}
                {(item.revenueImpact!==0||isWin)&&(
                  <div style={{...cLine(t),display:"flex",gap:14,flexWrap:"wrap",alignItems:"baseline"}}>
                    {item.revenueImpact!==0&&(
                      <span><span style={cLbl(t)}>Est</span><strong style={{color:t.text,fontFamily:t.mono,fontWeight:600}}>{fmtCur(item.revenueImpact)}</strong></span>
                    )}
                    {item.revenueImpact!==0&&item.results.actualRevenueImpact!=null&&(
                      <span><span style={cLbl(t)}>Actual</span><strong style={{color:t.gold,fontFamily:t.mono,fontWeight:600}}>{fmtCur(item.results.actualRevenueImpact)}</strong></span>
                    )}
                    {isWin&&(
                      <button onClick={()=>onReplicate(item)}
                        style={{marginLeft:"auto",padding:0,background:"none",border:"none",cursor:"pointer",
                          fontSize:11,fontWeight:600,fontFamily:t.sans,color:t.gold,textDecoration:"underline",textUnderlineOffset:2}}>
                        &#8635; Replicate this initiative
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {citeItem && <CitationModal item={citeItem} t={t} dk={dk} cats={cats} brands={brands} onClose={()=>setCiteItem(null)}/>}
    </div>
  );
}
