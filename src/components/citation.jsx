import { OD, OL, brandName, brandColor, fmtDate, fmtCur } from "../constants.js";
import { Modal } from "./Modal.jsx";
import { Bdg, OBdg, CBdg, TBdg } from "./badges.jsx";

// ── Citation system ─────────────────────────────────────────────────────────
// Reusable across any AI surface that references past initiatives. A surface
// either (a) emits [INIT-ID] tokens in prose (Ask the library) and uses
// renderCitedText, or (b) carries structured sourceLearningIds and uses
// footnote superscripts (Signal). Both open the same focused CitationModal.

// Focused, read-only view of one initiative — title, outcome, learning,
// decision, hypothesis. Deliberately lighter than the full DetailView so it
// can open as an overlay without leaving the current surface.
export function CitationModal({ item, t, dk, cats, brands, onClose }) {
  if (!item) return null;
  const r = item.results || {};
  const c = (dk?OD:OL)[r.outcomeClassification] || {};
  return (
    <Modal t={t} dk={dk} onClose={onClose} title="Referenced initiative" wide>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:8}}>
            {item.initId && <span style={{fontSize:11,fontWeight:600,color:t.gold,fontFamily:t.mono}}>{item.initId}</span>}
            <span style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.serif,lineHeight:1.3}}>{item.title}</span>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {r.outcomeClassification && <OBdg o={r.outcomeClassification} dk={dk}/>}
            {item.category && <CBdg cat={item.category} cats={cats||[]} dk={dk}/>}
            {item.initType && <TBdg type={item.initType} dk={dk}/>}
            {brands && brands.length>1 && <Bdg label={brandName(item.brandId||"default",brands)} color={brandColor(item.brandId||"default",brands,dk)} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"}/>}
            {(r.durability==="structural")
              ? <Bdg label="Structural" color={dk?"#7fb8ff":"#1a5fb4"} bg={dk?"#16243a":"#eaf2ff"} border={dk?"#27425f":"#b8d4f0"}/>
              : (r.keyLearning ? <Bdg label="Tactical" color={t.textMuted} bg={dk?"#1e1e14":"#f4f3ee"} border={t.border}/> : null)}
            {item.endDate && <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono,marginLeft:"auto"}}>closed {fmtDate(item.endDate)}</span>}
          </div>
        </div>

        {r.keyLearning && (
          <div style={{borderLeft:"3px solid "+(c.border||t.gold),paddingLeft:14}}>
            <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.sans,marginBottom:6}}>Key learning</div>
            <p style={{margin:0,fontSize:15,fontWeight:600,color:t.text,lineHeight:1.6,fontFamily:t.serif,fontStyle:"italic"}}>"{r.keyLearning}"</p>
          </div>
        )}

        {item.hypothesis && (
          <div>
            <div style={{fontSize:10,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.sans,marginBottom:4}}>Original hypothesis</div>
            <p style={{margin:0,fontSize:13,color:t.textSub,lineHeight:1.6,fontFamily:t.sans}}>{item.hypothesis}</p>
          </div>
        )}

        {r.decisionMade && (
          <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.6,padding:"10px 12px",background:t.surfaceAlt,borderRadius:6}}>
            <span style={{color:t.textMuted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>Decision: </span>
            {r.decisionMade}
          </div>
        )}

        {(item.revenueImpact!==0 || r.actualRevenueImpact!=null) && (
          <div style={{display:"flex",gap:18,fontSize:12,fontFamily:t.mono,color:t.textMuted}}>
            {item.revenueImpact!==0 && <span>Est: <strong style={{color:t.text}}>{fmtCur(item.revenueImpact)}</strong></span>}
            {r.actualRevenueImpact!=null && <span>Actual: <strong style={{color:t.gold}}>{fmtCur(r.actualRevenueImpact)}</strong></span>}
          </div>
        )}

        {/* Calibration readout — the rigor artifact. Reads the frozen prediction
            (snapshot at launch) against the recorded outcome. Only renders when
            we have a frozen predictionError with a measurable delta, so older
            closed initiatives without a snapshot simply don't show it. */}
        {r.predictionError && r.predictionError.revenueDelta != null && (() => {
          const pe = r.predictionError;
          const beat = pe.revenueDelta >= 0;
          const deltaColor = beat ? "#4a7c59" : "#a24b4b";
          const pct = pe.predictedRevenue ? Math.round((pe.revenueDelta / Math.abs(pe.predictedRevenue)) * 100) : null;
          return (
            <div style={{marginTop:4,padding:"10px 12px",borderRadius:6,border:"1px solid "+t.border,background:dk?"#15150f":"#faf9f4"}}>
              <div style={{fontSize:9,color:t.textMuted,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.sans,marginBottom:6}}>
                Calibration · frozen at launch {pe.snapshotDate ? "("+pe.snapshotDate+")" : ""}
              </div>
              <div style={{display:"flex",gap:18,fontSize:12,fontFamily:t.mono,color:t.textMuted,flexWrap:"wrap"}}>
                <span>Predicted: <strong style={{color:t.text}}>{fmtCur(pe.predictedRevenue)}</strong></span>
                <span>Actual: <strong style={{color:t.text}}>{fmtCur(pe.actualRevenue)}</strong></span>
                <span>Δ <strong style={{color:deltaColor}}>{beat?"+":""}{fmtCur(pe.revenueDelta)}{pct!=null?" ("+(beat?"+":"")+pct+"%)":""}</strong></span>
              </div>
            </div>
          );
        })()}

        {!r.keyLearning && (
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.sans,fontStyle:"italic"}}>No logged results for this initiative yet.</div>
        )}
      </div>
    </Modal>
  );
}

// Parse a text block, turning [INIT-ID] tokens into clickable citation chips.
// idResolver maps an id string -> item (or null). Unknown ids render as plain
// text so a hallucinated/stale id never produces a dead link. onCite(item) opens
// the modal. Returns an array of React nodes safe to splice into a <p>.
export function renderCitedText(text, idResolver, onCite, t) {
  if (!text) return null;
  const parts = String(text).split(/(\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]$/);
    if (!m) return <span key={i}>{part}</span>;
    const item = idResolver(m[1].trim());
    if (!item) return <span key={i}>{part}</span>;
    return (
      <button key={i} onClick={()=>onCite(item)} title={item.title}
        style={{display:"inline",padding:"0 4px",margin:"0 1px",fontSize:"0.82em",fontWeight:700,fontFamily:t.mono,
          color:t.gold,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:4,cursor:"pointer",lineHeight:1.4,verticalAlign:"baseline"}}>
        {item.initId || m[1].trim()}
      </button>
    );
  });
}
