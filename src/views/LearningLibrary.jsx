import { useState, useMemo } from "react";
import { COMPANY_NAME, BUSINESS_MODEL, NORTH_STAR_METRIC } from "../config.js";
import { INIT_TYPES, OL, OD, brandColor, brandName, fmtCur, fmtDate } from "../constants.js";
import { gG, gGh, gI, gSl, gSc } from "../components/styles.js";
import { Bdg, OBdg, CBdg, TBdg } from "../components/badges.jsx";
import { Modal } from "../components/Modal.jsx";
import { CitationModal, renderCitedText } from "../components/citation.jsx";
import { callSynthesizeLearnings } from "../services/ai/callSynthesizeLearnings.js";
import { callAskLibrary } from "../services/ai/callAskLibrary.js";

// -- Learning Library ---------------------------------------------------------
export function LearningLibrary({items, t, dk, cats, brands, activeBrand, onReplicate, settings}) {
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
      setAskAnswer(result || "No answer returned — try rephrasing.");
    } catch { setAskAnswer("Query failed — check that your API proxy is deployed and the secret is configured."); }
    setAskLoad(false);
  };

  const gI2 = (t)=>({...gI(t),width:"auto",flex:1,minWidth:160});

  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:16}}>

      {/* Ask the library — natural-language retrieval over the full closed record */}
      <div style={{...gSc(t,dk),background:t.goldBg,border:"1px solid "+t.goldBorder}}>
        <div style={{fontSize:11,fontWeight:700,color:t.gold,fontFamily:t.sans,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Ask the library</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start"}}>
          <input style={{...gI(t),flex:1,minWidth:200}} value={ask} onChange={e=>setAsk(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")runAsk();}} placeholder={String.fromCharCode(34)+"Have we tried creative angles for retention?"+String.fromCharCode(34)+"  ·  "+String.fromCharCode(34)+"What worked for us at BFCM?"+String.fromCharCode(34)}/>
          <button style={{...gG(t),whiteSpace:"nowrap"}} disabled={askLoad||!ask.trim()||closed.length===0} onClick={runAsk}>
            {askLoad ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Searching…</> : <>&#128269; Ask</>}
          </button>
        </div>
        <div style={{fontSize:10.5,color:t.textMuted,fontFamily:t.sans,marginTop:6}}>Searches every closed initiative — wins and failures — weighing relevance first, recency second.</div>
        {askVisible&&(
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+t.goldBorder}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,fontFamily:t.sans,letterSpacing:"0.06em",textTransform:"uppercase"}}>Answer from {closed.length} closed initiative{closed.length!==1?"s":""}</div>
              <button onClick={()=>{setAskVisible(false);setAskAnswer("");}} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14}}>&#10005;</button>
            </div>
            {askLoad
              ? <div style={{fontSize:13,color:t.textMuted,fontFamily:t.sans}}>Reading the record…</div>
              : <div style={{fontSize:13,color:t.textSub,lineHeight:1.75,whiteSpace:"pre-wrap",fontFamily:t.sans}}>{renderCitedText(askAnswer, (id)=>closed.find(e=>(e.initId||e.id)===id)||null, setCiteItem, t)}</div>}
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
              <div style={{fontSize:28,fontWeight:700,color:active?c.text:t.textMuted,fontFamily:t.serif,lineHeight:1}}>{counts[o]||0}</div>
              <div style={{fontSize:11,fontWeight:600,color:active?c.text:t.textMuted,fontFamily:t.sans,marginTop:4,letterSpacing:"0.04em"}}>{o}</div>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:180}}>
          <label style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,letterSpacing:"0.06em",textTransform:"uppercase"}}>Search learnings</label>
          <input style={gI2(t)} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Keyword across learnings and titles..."/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,letterSpacing:"0.06em",textTransform:"uppercase"}}>Category</label>
          <select value={fCat} onChange={e=>setFCat(e.target.value)} style={{...gSl(t),minWidth:130}}>{["All",...cats].map(c=><option key={c}>{c}</option>)}</select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,letterSpacing:"0.06em",textTransform:"uppercase"}}>Type</label>
          <select value={fType} onChange={e=>setFType(e.target.value)} style={{...gSl(t),minWidth:120}}>{["All",...INIT_TYPES].map(tp=><option key={tp}>{tp}</option>)}</select>
        </div>
      </div>

      {/* Count + Synthesize */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:12,color:t.textMuted,fontFamily:t.sans}}>
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
                const result = await callSynthesizeLearnings(payload, settings||{companyName:COMPANY_NAME,businessModel:BUSINESS_MODEL,northStarMetric:NORTH_STAR_METRIC,northStarCurrent:"—",northStarTarget:"—"});
                setSynthesis(result);
              } catch { setSynthesis("Synthesis failed — check your API key in Settings."); }
              setSynthLoad(false);
            }}>
            {synthLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Synthesizing…</>:<><span>&#10024;</span> Synthesize learnings</>}
          </button>
        )}
      </div>

      {/* Synthesis panel */}
      {synthVisible&&(
        <div style={{...gSc(t,dk),background:dk?"#1a2a18":"#f0faf2",border:"1px solid "+(dk?"#2a6a40":"#7adca0")}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:dk?"#60d080":"#1a7a48",fontFamily:t.sans,letterSpacing:"0.06em",textTransform:"uppercase"}}>AI Synthesis — {filtered.length} learnings</div>
            <button onClick={()=>setSynthVisible(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14}}>&#10005;</button>
          </div>
          {synthLoad
            ?<div style={{fontSize:13,color:t.textMuted,fontFamily:t.sans}}>Analysing learnings…</div>
            :synthesis
              ?<div style={{fontSize:13,color:t.textSub,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:t.sans}}>{synthesis}</div>
              :<div style={{fontSize:12,color:dk?"#e08080":"#a03030",fontFamily:t.sans}}>Synthesis failed — check that your API proxy is deployed and the API key is configured.</div>
          }
        </div>
      )}

      {/* Empty state */}
      {closed.length===0&&(
        <div style={{padding:"48px 24px",textAlign:"center",color:t.textMuted,fontFamily:t.sans,border:"1px dashed "+t.border,borderRadius:8}}>
          <div style={{fontSize:32,marginBottom:12}}>&#128218;</div>
          <div style={{fontSize:14,marginBottom:6,color:t.text}}>No learnings yet</div>
          <div style={{fontSize:12}}>Learnings appear here when you close an initiative and log results.</div>
        </div>
      )}

      {/* Learning cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(item=>{
          const isWin=item.results.outcomeClassification==="Jackpot"||item.results.outcomeClassification==="Success";
          return (
            <div key={item.id} style={{background:t.surface,border:"1px solid "+t.border,borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"16px 18px"}}>
                {/* Badges row */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
                  <OBdg o={item.results.outcomeClassification} dk={dk}/>
                  <CBdg cat={item.category} cats={cats} dk={dk}/>
                  <TBdg type={item.initType} dk={dk}/>
                  {(item.results.durability==="structural")
                    ? <Bdg label="Structural" color={dk?"#7fb8ff":"#1a5fb4"} bg={dk?"#16243a":"#eaf2ff"} border={dk?"#27425f":"#b8d4f0"}/>
                    : <Bdg label="Tactical" color={t.textMuted} bg={dk?"#1e1e14":"#f4f3ee"} border={t.border}/>}
                  {brands&&brands.length>1&&<Bdg label={brandName(item.brandId||"default",brands)} color={brandColor(item.brandId||"default",brands,dk)} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"}/>}
                  {item.endDate&&<span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginLeft:"auto"}}>{fmtDate(item.endDate)}</span>}
                </div>

                {/* The learning — hero element */}
                <div style={{borderLeft:"3px solid "+t.border,paddingLeft:14,marginBottom:14}}>
                  <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.sans,marginBottom:6}}>Key learning</div>
                  <p style={{margin:0,fontSize:16,fontWeight:600,color:t.text,lineHeight:1.6,fontFamily:t.serif,fontStyle:"italic"}}>
                    "{item.results.keyLearning}"
                  </p>
                </div>

                {/* Initiative title */}
                <div style={{fontSize:12,color:t.textMuted,fontFamily:t.sans,marginBottom:item.results.decisionMade?10:0}}>
                  From: <span style={{color:t.textSub,fontWeight:600}}>{item.title}</span>
                </div>

                {/* Decision made — collapsed but visible */}
                {item.results.decisionMade&&(
                  <div style={{fontSize:12,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,padding:"8px 10px",background:t.surfaceAlt,borderRadius:4,marginBottom:10}}>
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

      {citeItem && <CitationModal item={citeItem} t={t} dk={dk} cats={cats} brands={brands} onClose={()=>setCiteItem(null)}/>}
    </div>
  );
}
