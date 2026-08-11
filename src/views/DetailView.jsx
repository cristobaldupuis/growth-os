import { useState } from "react";
import { STATUSES, SL, SD, OL, OD, iceScore, iceColor, fmtCur, fmtDate } from "../constants.js";
import {
  readingWindow, readingSummary, evaluate, readsOf, recordRead,
  sequentialThreshold, toISO, MAX_TABULATED_LOOKS,
} from "../services/testValidity.js";
import { IconEdit, IconTrash, IconAlert, IconCopy } from "../components/icons.jsx";
import { gG, gGh, gGd, gI, gTA, gSl, gSc, gSL } from "../components/styles.js";
import { SBdg, OBdg, CBdg, TBdg, BlockerBadge, ICEChip, RiskBdg } from "../components/badges.jsx";
import { EAlert } from "../components/EAlert.jsx";
import { renderProse } from "../components/text.jsx";
import { killLineProgress } from "../services/killGate.js";
import { DiagnosticEscalationPanel } from "../components/DiagnosticEscalationPanel.jsx";
import { resolveSchema } from "../services/naming.js";

// -- Detail --------------------------------------------------------------------
export function DetailView({item,items,t,dk,cats,settings,onEdit,onDelete,onStatus,onResults,onLink,onSaveTestValidity,onSaveEvidence}) {
  const linked = items.filter(e=>item.linkedIds&&item.linkedIds.includes(e.id));
  const score  = iceScore(item.ice&&item.ice.impact,item.ice&&item.ice.certainty,item.ice&&item.ice.ease);
  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
            <CBdg cat={item.category} cats={cats} dk={dk} t={t}/>
            <TBdg type={item.initType} dk={dk} t={t}/>
            <SBdg s={item.status} dk={dk}/>
            {item.results&&<OBdg o={item.results.outcomeClassification} dk={dk}/>}
            <ICEChip ice={item.ice} t={t}/>
            <RiskBdg riskType={item.riskType} t={t}/>
            <EAlert endDate={item.endDate} status={item.status} t={t} dk={dk}/>
            <BlockerBadge blocker={item.blocker} t={t}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:2}}>
            {item.initId&&<span style={{fontSize:11,fontWeight:700,color:t.gold,fontFamily:t.mono,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:3,padding:"2px 8px",flexShrink:0}}>{item.initId}</span>}
            <h2 style={{margin:0,fontSize:19,fontWeight:600,color:t.text,lineHeight:1.3,letterSpacing:"-0.02em",fontFamily:t.serif}}>{item.title}</h2>
          </div>
          {item.owner&&<div style={{fontSize:13,color:t.textMuted,marginTop:5,fontFamily:t.serif}}>{item.owner}</div>}
        </div>
        <div style={{display:"flex",gap:6}}>
          <button style={gGh(t)} onClick={onEdit}><IconEdit size={13}/> Edit</button>
          {/* Was an unlabelled icon-only button firing a native confirm() that
              did not name what it was deleting. The confirmation moved up to
              App, where it can name the initiative and offer an undo. */}
          <button style={gGd(t)} onClick={onDelete} title="Delete this initiative" aria-label="Delete this initiative">
            <IconTrash size={13}/>
          </button>
        </div>
      </div>

      {/* Status */}
      <div style={{...gSc(t),background:t.surfaceAlt}}>
        <div style={gSL(t)}>Status</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {STATUSES.map(s=>{const c=(dk?SD:SL)[s]||{},act=item.status===s;return(
            <button key={s} onClick={()=>onStatus(s)} style={{fontSize:12,padding:"5px 13px",borderRadius:4,cursor:"pointer",fontWeight:600,background:act?c.bg:(t.surfaceAlt),border:"1px solid "+(act?c.border:t.border),color:act?c.text:t.textMuted}}>{s}</button>
          );})}
          {(item.status==="Completed"||item.status==="Killed")&&(
            <button style={gG(t)} onClick={onResults}><IconCopy size={13}/> {item.results?"Edit results":"Log results"}</button>
          )}
        </div>
      </div>

      {/* Blocker warning — full-width attention strip */}
      {item.blocker&&item.blocker!=="None"&&(
        <div style={{background:t.warnBg,border:"2px solid "+t.warnBorder,borderRadius:6,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:t.warn,flexShrink:0,display:"inline-flex"}}><IconAlert size={19}/></span>
          <div>
            <div style={{fontSize:12,fontWeight:800,color:t.warn,letterSpacing:"0.04em",fontFamily:t.mono,textTransform:"uppercase"}}>BLOCKED</div>
            <div style={{fontSize:14,fontWeight:600,color:t.warn,fontFamily:t.serif}}>{item.blocker}</div>
          </div>
        </div>
      )}

      <div style={gSc(t)}>
        <div style={gSL(t)}>Hypothesis framework</div>
        {/* Backwards compatibility: show legacy description if structured fields absent */}
        {(item.observation||item.hypothesis||item.successMetric) ? (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {item.observation&&(
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>Observation · what data prompted this?</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{item.observation}</p>
              </div>
            )}
            {item.hypothesis&&(
              <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:12}}>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>Hypothesis · if we do X, then Y…</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:14,fontWeight:600}}>{item.hypothesis}</p>
              </div>
            )}
            {item.successMetric&&(
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>Success metric · what KPI determines a win?</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{item.successMetric}</p>
              </div>
            )}
            {/* Legacy fallback: show description if present and no new fields */}
            {!item.observation&&!item.successMetric&&item.hypothesis&&(
              <p style={{margin:0,color:t.textMuted,fontSize:12,fontFamily:t.serif,fontStyle:"italic"}}>Legacy entry. Observation and success metric not yet captured.</p>
            )}
          </div>
        ) : (
          <p style={{margin:0,color:t.textMuted,fontStyle:"italic",fontSize:13}}>No hypothesis yet.</p>
        )}
      </div>

      {item.ice&&(
        <div style={gSc(t)}>
          <div style={gSL(t)}>ICE scoring</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr) auto",gap:12,alignItems:"center"}}>
            {[["Impact",item.ice.impact],["Certainty",item.ice.certainty],["Ease",item.ice.ease]].map(([l,v])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
                <div style={{fontSize:22,fontWeight:700,color:t.text,fontFamily:t.mono}}>{v}</div>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>/10</div>
              </div>
            ))}
            <div style={{textAlign:"center",borderLeft:"1px solid "+t.border,paddingLeft:16}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Score</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:t.mono,color:score!==null?iceColor(score,t):t.textMuted}}>{score!==null?score:"—"}</div>
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
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Est. spend cost</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(item.spendCost)}</div>
            </div>}
            {(item.resourceCost||0)>0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Est. resource cost</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(item.resourceCost)}</div>
            </div>}
            {((item.spendCost||0)+(item.resourceCost||0))>0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Total est. cost</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur((item.spendCost||0)+(item.resourceCost||0))}</div>
            </div>}
            {item.revenueImpact!==0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Est. revenue</div>
              <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(item.revenueImpact)}</div>
            </div>}
            {item.revenueImpact!==0&&((item.spendCost||0)+(item.resourceCost||0))>0&&<div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Est. ROI</div>
              <div style={{fontSize:16,fontWeight:700,color:t.gold,fontFamily:t.mono}}>{((item.revenueImpact||0)/((item.spendCost||0)+(item.resourceCost||0))).toFixed(1)}x</div>
            </div>}
          </div>
          {item.results?.actualRevenueImpact!=null&&(
            <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+t.border}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Actual results</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
                {item.results.actualSpendCost!=null&&<div>
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Actual spend cost</div>
                  <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(item.results.actualSpendCost)}</div>
                </div>}
                {item.results.actualResourceCost!=null&&<div>
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Actual resource cost</div>
                  <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(item.results.actualResourceCost)}</div>
                </div>}
                <div>
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Actual revenue</div>
                  <div style={{fontSize:16,fontWeight:700,color:t.gold,fontFamily:t.mono}}>{fmtCur(item.results.actualRevenueImpact)}</div>
                </div>
                {(()=>{
                  const actCost=(item.results.actualSpendCost||0)+(item.results.actualResourceCost||0);
                  const actRev=item.results.actualRevenueImpact||0;
                  if(!actCost) return null;
                  const roi=(actRev/actCost).toFixed(1);
                  const color=parseFloat(roi)>=2?t.gold:parseFloat(roi)>=1?t.warn:t.red;
                  return <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Actual ROI</div>
                    <div style={{fontSize:20,fontWeight:700,color,fontFamily:t.mono}}>{roi}x</div>
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
            const deltaColor = beat ? t.gold : t.red;
            const pct = pe.predictedRevenue ? Math.round((pe.revenueDelta/Math.abs(pe.predictedRevenue))*100) : null;
            const certCol = pe.predictedCertainty!=null ? pe.predictedCertainty : null;
            return (
              <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+t.border}}>
                <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>
                  Calibration · prediction frozen {pe.snapshotDate?"at launch ("+pe.snapshotDate+")":"at launch"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
                  <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Predicted revenue</div>
                    <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(pe.predictedRevenue)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Actual revenue</div>
                    <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(pe.actualRevenue)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Prediction error</div>
                    <div style={{fontSize:20,fontWeight:700,color:deltaColor,fontFamily:t.mono}}>{beat?"+":""}{fmtCur(pe.revenueDelta)}{pct!=null?" ("+(beat?"+":"")+pct+"%)":""}</div>
                  </div>
                  {certCol!=null&&<div>
                    <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Predicted certainty</div>
                    <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{certCol}%</div>
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

      {item.killCriteria&&item.status!=="Draft"&&(
        <div style={gSc(t)}>
          <div style={gSL(t)}>Kill criteria</div>
          <p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:13}}>{item.killCriteria}</p>
          {/* Distance to the kill line — elapsed vs. the planned window, since
              the criteria above are free text with no threshold to evaluate
              live. See services/killGate.js for why this is the honest proxy. */}
          {item.status==="Running" && (()=>{
            const kl = killLineProgress(item);
            if (!kl) return null;
            const pct = Math.round(kl.progress*100);
            return (
              <div style={{marginTop:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10.5,color:kl.overdue?t.red:t.textMuted,fontFamily:t.mono,marginBottom:4}}>
                  <span>{pct}% of planned window elapsed</span>
                  <span>{kl.overdue?Math.abs(kl.daysRemaining)+"d past end date":kl.daysRemaining+"d remaining"}</span>
                </div>
                <div style={{height:5,borderRadius:3,background:t.surfaceAlt,overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",borderRadius:3,background:kl.overdue?t.red:t.gold}}/>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {item.notes&&<div style={gSc(t)}><div style={gSL(t)}>Notes</div><p style={{margin:0,color:t.textSub,lineHeight:1.6,fontSize:13}}>{item.notes}</p></div>}

      {(item.status==="Running"||item.status==="Completed"||item.status==="Killed")&&(
        <TestValidityPanel key={item.id} item={item} t={t} dk={dk} onSaveTestValidity={onSaveTestValidity}/>
      )}

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
                <p style={{margin:0,color:t.warn,fontSize:14,fontWeight:600}}>"{renderProse(item.results.keyLearning)}"</p>
              </div>
              {item.results.decisionMade&&<div><div style={{fontSize:10,color:c.text,opacity:0.7,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,fontFamily:t.mono}}>Decision made</div><p style={{margin:0,color:t.textSub,fontSize:13,lineHeight:1.6}}>{renderProse(item.results.decisionMade)}</p></div>}
            </div>
          </div>
        );
      })()}

      {(item.status==="Completed"||item.status==="Killed")&&settings&&onSaveEvidence&&(
        <DiagnosticEscalationPanel item={item} schema={resolveSchema(settings)} t={t} dk={dk} onSaveEvidence={onSaveEvidence}/>
      )}

      {linked.length>0&&(
        <div style={gSc(t)}>
          <div style={gSL(t)}>Linked initiatives</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {linked.map(l=>(
              <div key={l.id} onClick={()=>onLink(l.id)} style={{background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,padding:"10px 14px",cursor:"pointer"}}>
                <div style={{display:"flex",gap:5,marginBottom:4}}><CBdg cat={l.category} cats={cats} dk={dk} t={t}/><TBdg type={l.initType} dk={dk} t={t}/><SBdg s={l.status} dk={dk}/>{l.results&&<OBdg o={l.results.outcomeClassification} dk={dk}/>}<ICEChip ice={l.ice} t={t}/></div>
                <div style={{fontSize:13,color:t.text,fontWeight:600}}>{l.title}</div>
                {l.results&&l.results.keyLearning&&<div style={{fontSize:12,color:t.textMuted,marginTop:3}}>"{renderProse(l.results.keyLearning)}"</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -- Test Validity Panel -------------------------------------------------------
//
// The statistics moved to src/services/testValidity.js, where they are tested.
// What is left here is the part that is genuinely a UI decision: the result is
// behind a click, and the click is counted.
//
// That is the whole peeking guard. A confidence figure rendered on every open of
// this page is consulted a dozen times over a two-week test and reported as
// though it had been consulted once, and no amount of correct arithmetic
// downstream recovers from that. Making the reading an action is what turns the
// number of looks into something knowable, and knowing it is what lets the
// threshold be right.
function TestValidityPanel({ item, t, onSaveTestValidity }) {
  const tv = item.testValidity || {};
  const [baseRate, setBaseRate] = useState(tv.baseRate ?? 2);
  const [mde,      setMde]      = useState(tv.mde ?? 10);
  const [sigAlpha, setSigAlpha] = useState(tv.sigAlpha ?? 0.05);
  const [weeklySessions, setWeeklySessions] = useState(tv.weeklySessions ?? "");

  const [convC,    setConvC]    = useState(tv.convC ?? "");
  const [sessC,    setSessC]    = useState(tv.sessC ?? "");
  const [convV,    setConvV]    = useState(tv.convV ?? "");
  const [sessV,    setSessV]    = useState(tv.sessV ?? "");

  const [counterfactual, setCounterfactual] = useState(tv.counterfactual ?? "");

  // Revealed for this session only. Persisting it would defeat the mechanism:
  // the point is that seeing the result is an act, and an act that happens once
  // and then never again is indistinguishable from the number simply being on
  // the page.
  const [revealed, setRevealed] = useState(false);

  const startedAt = tv.startedAt || item.startDate || "";
  const draft = { baseRate, mde, sigAlpha, weeklySessions, startedAt, convC, sessC, convV, sessV, counterfactual };

  const window_ = readingWindow(draft);
  const reads   = readsOf(tv);
  const hasData = convC !== "" && sessC !== "" && convV !== "" && sessV !== "";
  // The look being taken now is the one that counts. A result already on screen
  // has been read `reads.length` times; one about to be revealed makes it one
  // more, and correcting for the earlier number would under-correct the decision
  // actually being made.
  const looks   = reads.length + (revealed ? 0 : 1);
  const result  = hasData ? evaluate({ convC, sessC, convV, sessV, looks: Math.max(1, revealed ? reads.length : looks), alpha: sigAlpha }) : null;
  const summary = readingSummary(window_, revealed ? result : null);

  const uplift = (Number(sessC) > 0 && Number(sessV) > 0 && Number(convC) > 0)
    ? (((Number(convV) / Number(sessV)) - (Number(convC) / Number(sessC))) / (Number(convC) / Number(sessC)) * 100).toFixed(1)
    : null;

  const dirty = JSON.stringify(draft) !== JSON.stringify({
    baseRate: tv.baseRate ?? 2, mde: tv.mde ?? 10, sigAlpha: tv.sigAlpha ?? 0.05,
    weeklySessions: tv.weeklySessions ?? "", startedAt: tv.startedAt || item.startDate || "",
    convC: tv.convC ?? "", sessC: tv.sessC ?? "", convV: tv.convV ?? "",
    sessV: tv.sessV ?? "", counterfactual: tv.counterfactual ?? "",
  });

  const reveal = () => {
    setRevealed(true);
    onSaveTestValidity(recordRead({ ...draft, reads }, {
      early: window_.gated,
      observed: hasData ? Number(sessC) + Number(sessV) : null,
    }));
  };

  const sigColor = !result ? t.textMuted : result.significant ? t.teal : result.overturned ? t.red : t.warn;
  const sigBg    = !result ? t.surfaceAlt : result.significant ? t.tealBg : result.overturned ? t.redBg : t.warnBg;
  const sigBorder= !result ? t.border : result.significant ? t.teal : result.overturned ? t.red : t.warnBorder;

  const labelStyle = {fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3};
  const numStyle   = {fontSize:20,fontWeight:700,fontFamily:t.mono};
  const headStyle  = {fontSize:11,fontWeight:600,color:t.textSub,fontFamily:t.serif,marginBottom:10,letterSpacing:"0.04em"};

  return (
    <div style={{...gSc(t),border:"1px solid "+t.warnBorder,background:t.warnBg}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{...gSL(t),marginBottom:0}}>Test Validity</div>
        {dirty&&(
          <button style={{...gG(t),fontSize:11,padding:"3px 10px"}}
            onClick={()=>onSaveTestValidity({ ...draft, reads })}>
            Save
          </button>
        )}
      </div>

      {/* 1 — The plan, and the date it produces */}
      <div style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid "+t.border}}>
        <div style={headStyle}>&#8680; Reading window · sample size and when it arrives</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4, minmax(0,1fr))",gap:10,marginBottom:10}}>
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
          <div>
            <div style={labelStyle}>Sessions per week</div>
            <input style={{...gI(t),fontSize:13}} type="number" min="0" step="100"
              value={weeklySessions} onChange={e=>setWeeklySessions(e.target.value)} placeholder="both arms"/>
          </div>
        </div>
        {window_.perArm !== null ? (
          <div style={{display:"flex",gap:24,alignItems:"baseline",flexWrap:"wrap",padding:"10px 12px",background:t.surfaceAlt,borderRadius:6,border:"1px solid "+t.border}}>
            <div>
              <div style={labelStyle}>Sessions needed per variant</div>
              <div style={{...numStyle,color:t.gold}}>{window_.perArm.toLocaleString()}</div>
            </div>
            <div>
              <div style={labelStyle}>Total sessions</div>
              <div style={{...numStyle,fontSize:16,color:t.textSub}}>{window_.requiredTotal.toLocaleString()}</div>
            </div>
            {window_.readableAt && (
              <div>
                <div style={labelStyle}>Readable from</div>
                <div style={{...numStyle,fontSize:16,color:window_.gated?t.warn:t.teal}}>{fmtDate(toISO(window_.readableAt))}</div>
              </div>
            )}
            <div style={{marginLeft:"auto",fontSize:11,color:t.textMuted,fontFamily:t.serif,maxWidth:200,lineHeight:1.5}}>
              80% power, two-sided.<br/>Detects a {mde}% relative change from {baseRate}% CVR.
            </div>
          </div>
        ) : (
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>Enter valid inputs above to calculate.</div>
        )}
      </div>

      {/* 2 — The result, behind a click */}
      <div style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid "+t.border}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
          <div style={headStyle}>&#8680; Result</div>
          {reads.length>0&&(
            <div style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>
              Read {reads.length}&times; · threshold z &ge; {sequentialThreshold(Math.max(1,reads.length), sigAlpha).threshold.toFixed(2)}
            </div>
          )}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4, minmax(0,1fr))",gap:8,marginBottom:10}}>
          {[
            {label:"Control conversions",  val:convC,  set:setConvC},
            {label:"Control sessions",     val:sessC,  set:setSessC},
            {label:"Variant conversions",  val:convV,  set:setConvV},
            {label:"Variant sessions",     val:sessV,  set:setSessV},
          ].map(f_=>(
            <div key={f_.label}>
              <div style={labelStyle}>{f_.label}</div>
              <input style={{...gI(t),fontSize:13}} type="number" min="0" step="1"
                value={f_.val} onChange={e=>f_.set(e.target.value)} placeholder="—"/>
            </div>
          ))}
        </div>

        <div style={{padding:"10px 12px",background:revealed?sigBg:t.surfaceAlt,border:"1px solid "+(revealed?sigBorder:t.border),borderRadius:6}}>
          {!revealed ? (
            <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{flex:"1 1 260px",fontSize:12,color:t.textSub,fontFamily:t.serif,lineHeight:1.55}}>
                {summary}
              </div>
              <button
                style={{...(window_.gated?gGd(t):gG(t)),fontSize:12}}
                disabled={!hasData}
                onClick={reveal}>
                {window_.gated ? `Read early — this is look ${looks}` : reads.length ? `Read again — look ${looks}` : "Read the result"}
              </button>
            </div>
          ) : !result ? (
            <div style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>Enter conversion and session counts to evaluate.</div>
          ) : (
            <>
              <div style={{display:"flex",gap:24,alignItems:"baseline",flexWrap:"wrap"}}>
                <div>
                  <div style={{...labelStyle,color:sigColor}}>Confidence</div>
                  <div style={{...numStyle,color:sigColor}}>{(result.confidence*100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style={labelStyle}>Z-statistic</div>
                  <div style={{...numStyle,fontSize:16,color:t.textSub}}>{result.z.toFixed(2)}</div>
                </div>
                <div>
                  <div style={labelStyle}>Threshold at {result.looks} look{result.looks===1?"":"s"}</div>
                  <div style={{...numStyle,fontSize:16,color:t.textSub}}>{result.threshold.toFixed(2)}</div>
                </div>
                {uplift !== null && (
                  <div>
                    <div style={labelStyle}>Observed uplift</div>
                    <div style={{...numStyle,fontSize:16,color:parseFloat(uplift)>=0?t.teal:t.red}}>
                      {parseFloat(uplift)>=0?"+":""}{uplift}%
                    </div>
                  </div>
                )}
              </div>
              <div style={{marginTop:8,fontSize:11.5,color:t.textSub,fontFamily:t.serif,lineHeight:1.55}}>
                {summary}
              </div>
              {result.beyondTable&&(
                <div style={{marginTop:6,fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5}}>
                  Past {MAX_TABULATED_LOOKS} looks the correction is held flat and understates the real one. At this
                  point the count is the finding: this result has been consulted enough times that it should be
                  re-run rather than re-read.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3 — Incrementality / counterfactual */}
      <div>
        <div style={{fontSize:11,fontWeight:600,color:t.textSub,fontFamily:t.serif,marginBottom:6,letterSpacing:"0.04em"}}>
          &#8680; Incrementality · counterfactual definition
        </div>
        <div style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,marginBottom:8,lineHeight:1.5}}>
          Required before marking this initiative Completed. What would have happened without this change?
        </div>
        <textarea style={{...gTA(t),fontSize:13}} rows={3}
          value={counterfactual}
          onChange={e=>setCounterfactual(e.target.value)}
          placeholder={"e.g. Without this test, paid social would have continued driving traffic into a 1.2% CVR funnel. At current spend, that's approx. $80k/mo in lost revenue vs the 1.76% baseline."}/>
        {item.status==="Completed" && !counterfactual && (
          <div style={{marginTop:6,padding:"6px 10px",background:t.redBg,border:"1px solid "+(t.red),borderRadius:4,fontSize:11,color:t.red,fontFamily:t.serif}}>
            &#9888; Counterfactual is required for Completed initiatives. Define what success would look like vs the null scenario.
          </div>
        )}
        {counterfactual && (
          <div style={{marginTop:6,fontSize:11,color:t.teal,fontFamily:t.serif}}>
            &#10003; Counterfactual defined. Incrementality claim is documented.
          </div>
        )}
      </div>
    </div>
  );
}
