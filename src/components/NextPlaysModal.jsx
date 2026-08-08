import { useState } from "react";
import { Modal } from "./Modal.jsx";
import { CitationModal } from "./citation.jsx";
import { renderProse } from "./text.jsx";
import { gG, gGh, gSL, gSc } from "./styles.js";
import { brandName, iceScore, iceColor } from "../constants.js";
import { IconCheck, IconClose } from "./icons.jsx";

// Modal — full recommendation detail with hypothesis, ICE rationale, reasoning
// trace, and cited learnings. Actions: Add to backlog | Dismiss.
export function NextPlaysModal({ t, dk, batchId, recId, recs, items, brands, cats, onAccept, onDismiss, onClose }) {
  // Every hook must run before the first early return. `useState` used to sit
  // below `if (!rec) return null`, so the hook count changed between renders the
  // moment a recommendation stopped resolving (dismissed from another surface, a
  // batch rotating out of the last-10 window, a restored backup) and React threw
  // "rendered fewer hooks than expected", taking the whole dashboard down.
  const [citeItem, setCiteItem] = useState(null);

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
  const footnotes = citedLearnings.map((it, i) => ({ n: i+1, item: it }));

  const isResolved = rec.status !== "pending";

  return (
    <Modal t={t} dk={dk} onClose={onClose} title="Next Play" wide>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Title + meta */}
        <div>
          <div style={{fontSize:20,fontWeight:600,color:t.text,fontFamily:t.serif,lineHeight:1.3,marginBottom:8}}>{rec.title}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,padding:"2px 8px",border:"1px solid "+t.border,borderRadius:3,textTransform:"uppercase",letterSpacing:"0.04em"}}>{rec.category}</span>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,padding:"2px 8px",border:"1px solid "+t.border,borderRadius:3}}>{rec.brandTarget}</span>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,padding:"2px 8px",border:"1px solid "+t.border,borderRadius:3}}>{rec.initType}</span>
            {isResolved && (
              <span style={{fontSize:10,fontFamily:t.serif,padding:"2px 8px",borderRadius:3,fontWeight:600,
                background: rec.status==="accepted"?(t.tealBg):(t.surfaceAlt),
                color: rec.status==="accepted"?(t.teal):t.textMuted,
                border:"1px solid "+(rec.status==="accepted"?(t.teal):t.border)}}>
                {rec.status==="accepted" ? <><IconCheck size={12}/> Added to backlog</> : <><IconClose size={12}/> Dismissed</>}
              </span>
            )}
          </div>
        </div>

        {/* Why now — the specific portfolio signal that drove this recommendation
            (Pass 1 rationale). Muted single line, distinct from the hypothesis
            block. Older recs predate this field — render nothing rather than a
            placeholder. */}
        {rec.whyNow && (
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5,marginTop:-6}}>
            <span style={{fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",marginRight:6}}>Why now</span>
            {rec.whyNow}
          </div>
        )}

        {/* Reasoning trace — the trust-builder. Footnote superscripts map to the
            cited learnings below; prose stays clean, references are clickable. */}
        {rec.reasoningTrace && (
          <div style={gSc(t)}>
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
                    style={{display:"flex",gap:6,alignItems:"baseline",background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,fontFamily:t.serif}}>
                    <span style={{fontSize:10,fontWeight:700,color:t.gold}}>{f.n}</span>
                    <span style={{fontSize:11,color:t.textMuted}}>
                      {f.item.initId ? f.item.initId+" · " : ""}{f.item.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hypothesis structure */}
        <div style={gSc(t)}>
          <div style={gSL(t)}>Hypothesis framework</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {rec.observation && (
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>Observation</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{rec.observation}</p>
              </div>
            )}
            {rec.hypothesis && (
              <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:12}}>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>Hypothesis</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:14,fontWeight:600}}>{rec.hypothesis}</p>
              </div>
            )}
            {rec.successMetric && (
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>Success metric</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{rec.successMetric}</p>
              </div>
            )}
            {rec.killCriteria && (
              <div>
                <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:4}}>— Kill criteria</div>
                <p style={{margin:0,color:t.textSub,lineHeight:1.7,fontSize:13}}>{rec.killCriteria}</p>
              </div>
            )}
          </div>
        </div>

        {/* ICE with rationale */}
        <div style={gSc(t)}>
          <div style={gSL(t)}>ICE scoring · AI suggested</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:14,alignItems:"center"}}>
            <div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                <span style={{fontSize:22,fontWeight:700,color:t.gold,fontFamily:t.mono}}>{rec.ice.impact}</span>
                <span style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>/10 Impact</span>
              </div>
              {rec.impactRationale && <div style={{fontSize:12,color:t.textSub,lineHeight:1.5,fontFamily:t.serif}}>{rec.impactRationale}</div>}
            </div>
            <div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                <span style={{fontSize:22,fontWeight:700,color:t.gold,fontFamily:t.mono}}>{rec.ice.certainty}</span>
                <span style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>/10 Certainty</span>
              </div>
              {rec.certaintyRationale && <div style={{fontSize:12,color:t.textSub,lineHeight:1.5,fontFamily:t.serif}}>{rec.certaintyRationale}</div>}
            </div>
            <div style={{textAlign:"center",borderLeft:"1px solid "+t.border,paddingLeft:16}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total</div>
              <div style={{fontSize:24,fontWeight:700,fontFamily:t.mono,color:iceTotal!==null?iceColor(iceTotal,t):t.textMuted}}>{iceTotal!==null?iceTotal:"—"}</div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono}}>/100</div>
            </div>
          </div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:8,fontStyle:"italic"}}>
            Ease is left at 5. Adjust when you add to backlog based on your team's capacity.
          </div>
        </div>

        {/* Cited source learnings — the grounding */}
        {citedLearnings.length > 0 && (
          <div style={gSc(t)}>
            <div style={gSL(t)}>Source learnings · what this is grounded in</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {citedLearnings.map(item => (
                <div key={item.id} onClick={()=>setCiteItem(item)} style={{padding:"10px 12px",background:t.surfaceAlt,borderLeft:"3px solid "+t.gold,borderRadius:"0 4px 4px 0",cursor:"pointer"}}>
                  <div style={{fontSize:12,fontWeight:600,color:t.text,fontFamily:t.serif,marginBottom:4}}>{item.title}</div>
                  <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:9,color:t.textMuted,fontFamily:t.serif,padding:"1px 6px",border:"1px solid "+t.border,borderRadius:3}}>
                      {item.results?.outcomeClassification || "Inconclusive"}
                    </span>
                    <span style={{fontSize:9,color:t.textMuted,fontFamily:t.serif,padding:"1px 6px",border:"1px solid "+t.border,borderRadius:3}}>
                      {brandName(item.brandId, brands)}
                    </span>
                  </div>
                  {item.results?.keyLearning && (
                    <div style={{fontSize:12,color:t.textSub,fontFamily:t.serif,lineHeight:1.5}}>"{renderProse(item.results.keyLearning)}"</div>
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
              <IconClose size={13}/> Dismiss
            </button>
            <button onClick={()=>onAccept(batchId, recId)} style={{...gG(t),fontSize:12,padding:"7px 14px"}}>
              <IconCheck size={13}/> Add to backlog
            </button>
          </div>
        )}
      </div>
      {citeItem && <CitationModal item={citeItem} t={t} dk={dk} cats={cats} brands={brands} onClose={()=>setCiteItem(null)}/>}
    </Modal>
  );
}
