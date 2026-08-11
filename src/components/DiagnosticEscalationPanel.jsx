import { useState } from "react";
import { gG, gGh, gTA, gSc, gSL } from "./styles.js";
import { IconAlert, IconCheck } from "./icons.jsx";
import {
  evaluateEscalation, escalationAsk, parseBreakdownCSV, buildEvidenceEntry,
} from "../services/diagnosticEscalation.js";

// -- Diagnostic escalation panel (ROADMAP 5.3) -----------------------------------
//
// Only renders for a closed initiative whose actual result diverged sharply
// from its frozen prediction AND has a nameable missing dimension — see
// services/diagnosticEscalation.js for the gate and why both halves matter.
// Recorded evidence is scoped to this one initiative (`item.evidence`), never
// merged into the performance fact rows: this is a post-mortem attachment to a
// single question, one window, one axis — not bulk ingestion.
export function DiagnosticEscalationPanel({ item, schema, t, onSaveEvidence }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null); // {rows, errors, entry} once analysed

  const evalRes = evaluateEscalation(item, schema);
  const alreadyAnswered = (item.evidence || []).some(e => e.dimension === evalRes.topCandidate?.key);
  if (!evalRes.fires || alreadyAnswered) return null;

  const candidate = evalRes.topCandidate;
  const ask = escalationAsk(item, candidate);

  const analyse = () => {
    const { rows, errors } = parseBreakdownCSV(text);
    if (rows.length === 0) { setPreview({ rows:[], errors: errors.length?errors:["Nothing parsed from that paste."] }); return; }
    const entry = buildEvidenceEntry({ item, candidate, rows });
    setPreview({ rows, errors, entry });
  };

  const record = () => {
    if (!preview?.entry) return;
    onSaveEvidence(item.id, [...(item.evidence || []), preview.entry]);
    setPasting(false); setText(""); setPreview(null);
  };

  return (
    <div style={{...gSc(t), background:t.warnBg, border:"1px solid "+t.warnBorder}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
        <span style={{color:t.warn,display:"inline-flex"}}><IconAlert size={13}/></span>
        <div style={{...gSL(t), color:t.warn, marginBottom:0}}>Diagnostic escalation</div>
      </div>
      <p style={{margin:"0 0 10px",fontSize:12.5,color:t.textSub,lineHeight:1.55,fontFamily:t.sans}}>
        Actual landed {Math.round(evalRes.error.relativeError*100)}% off the prediction frozen at launch, and{" "}
        <strong style={{color:t.text}}>{candidate.label.toLowerCase()}</strong> isn't a dimension this test's naming
        captures. {ask}
      </p>

      {!pasting ? (
        <button style={gGh(t,"sm")} onClick={()=>setPasting(true)}>Paste breakdown</button>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <textarea style={{...gTA(t),fontFamily:t.mono,fontSize:11.5}} rows={5} value={text}
            onChange={e=>{setText(e.target.value);setPreview(null);}}
            placeholder={candidate.label+",Amount spent (USD),Purchases conversion value\n18-24,1200,900\n25-34,3400,6800"}/>
          <div style={{display:"flex",gap:8}}>
            <button style={gG(t,"sm")} disabled={!text.trim()} onClick={analyse}>Analyze</button>
            <button style={gGh(t,"sm")} onClick={()=>{setPasting(false);setText("");setPreview(null);}}>Cancel</button>
          </div>

          {preview && preview.errors.length>0 && preview.rows.length===0 && (
            <div style={{fontSize:11.5,color:t.red,fontFamily:t.sans}}>{preview.errors.join(" ")}</div>
          )}

          {preview?.entry && (
            <div style={{padding:"10px 12px",borderRadius:t.r.md,background:t.surface,border:"1px solid "+t.border}}>
              <div style={{fontSize:13,color:t.text,fontWeight:600,lineHeight:1.5,marginBottom:8}}>{preview.entry.verdict}</div>
              <div style={{fontSize:10.5,color:t.textMuted,fontFamily:t.mono,marginBottom:8}}>{preview.rows.length} row{preview.rows.length!==1?"s":""} parsed{preview.errors.length?" · "+preview.errors.length+" skipped":""}</div>
              <button style={gG(t,"sm")} onClick={record}><IconCheck size={12}/> Record to this initiative</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
