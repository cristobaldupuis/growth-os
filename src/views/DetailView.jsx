import { useState } from "react";
import { STATUSES, SL, SD, OL, OD, iceScore, iceColor, fmtCur, fmtDate } from "../constants.js";
import { gG, gGh, gI, gTA, gSl, gSc, gSL } from "../components/styles.js";
import { SBdg, OBdg, CBdg, TBdg, BlockerBadge, ICEChip } from "../components/badges.jsx";
import { EAlert } from "../components/EAlert.jsx";

// -- Detail --------------------------------------------------------------------
export function DetailView({item,items,t,dk,cats,onEdit,onDelete,onStatus,onResults,onLink,onSaveTestValidity}) {
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
          {/* Calibration — frozen launch prediction vs. recorded actual. The
              rigor artifact: it proves the prediction was made before the
              outcome was known. Renders only when a frozen delta exists. */}
          {item.results?.predictionError && item.results.predictionError.revenueDelta != null && (()=>{
            const pe = item.results.predictionError;
            const beat = pe.revenueDelta >= 0;
            const deltaColor = beat ? t.gold : "#c04040";
            const pct = pe.predictedRevenue ? Math.round((pe.revenueDelta/Math.abs(pe.predictedRevenue))*100) : null;
            const certCol = pe.predictedCertainty!=null ? pe.predictedCertainty : null;
            return (
              <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+t.border}}>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>
                  Calibration · prediction frozen {pe.snapshotDate?"at launch ("+pe.snapshotDate+")":"at launch"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
                  <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Predicted revenue</div>
                    <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(pe.predictedRevenue)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Actual revenue</div>
                    <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{fmtCur(pe.actualRevenue)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Prediction error</div>
                    <div style={{fontSize:20,fontWeight:700,color:deltaColor,fontFamily:t.serif}}>{beat?"+":""}{fmtCur(pe.revenueDelta)}{pct!=null?" ("+(beat?"+":"")+pct+"%)":""}</div>
                  </div>
                  {certCol!=null&&<div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:2}}>Predicted certainty</div>
                    <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.serif}}>{certCol}%</div>
                  </div>}
                </div>
              </div>
            );
          })()}
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
