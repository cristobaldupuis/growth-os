import { useMemo, useState } from "react";
import { learningRef, isClosedLearning } from "../services/supersession.js";
import { fmtDate } from "../constants.js";
import { gI } from "./styles.js";

// -- Does this result change an earlier learning? (ROADMAP 5.8) ---------------
//
// The one part of supersession a person has to supply. Everything else in the
// model is derived — provenance from the frozen snapshot, prediction error from
// the same, confidence from this graph — because a derived field stays true and
// a typed one is a number that was right once. This is the exception, and the
// roadmap is explicit about why: only a person knows that two results are about
// the same belief. No amount of category matching or embedding similarity
// establishes that "discount creative wins on prospecting" and "discount
// creative underperforms on prospecting" are the same claim rather than two
// claims about different quarters.
//
// So it sits in the close flow, where the person writing the learning is the
// one who just held both results in their head, and it is optional. A close
// with no edges is the normal case and costs one glance.
//
// Three relations, one per target, because a result cannot both retract and
// confirm the same earlier one:
//
//   Supersedes  — this replaces that belief. That learning leaves the citation
//                 index and stays on the record.
//   Contradicts — these disagree and neither is decisive. Both stay citable,
//                 both read as contested, and the pair becomes a candidate
//                 learning-agenda question.
//   Confirms    — these agree. This is what makes confidence computable
//                 instead of typed.
const RELATIONS = [
  { kind:"supersedes",  label:"Supersedes",  hint:"This replaces that learning. It leaves the citation index and stays on the record." },
  { kind:"contradicts", label:"Contradicts", hint:"These disagree and neither is decisive yet. Both stay citable, flagged contested." },
  { kind:"confirms",    label:"Confirms",    hint:"These agree. Replication is what raises confidence." },
];

export function SupersessionPicker({ items, currentId, selection, onChange, t }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // Only closed initiatives carrying a learning can be on either end of an
  // edge — a draft has no result to be retracted by.
  const candidates = useMemo(() => (items||[])
    .filter(e => isClosedLearning(e) && e.id !== currentId)
    .sort((a,b) => (b.endDate||b.createdAt||"").localeCompare(a.endDate||a.createdAt||"")),
    [items, currentId]);

  const chosen = Object.keys(selection || {});

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = candidates.filter(e => !chosen.includes(learningRef(e)));
    if (!q) return pool.slice(0, 6);
    return pool.filter(e =>
      (e.title||"").toLowerCase().includes(q) ||
      (e.results.keyLearning||"").toLowerCase().includes(q) ||
      (e.initId||"").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [candidates, chosen, query]);

  const byRef = useMemo(() => {
    const m = new Map();
    candidates.forEach(e => m.set(learningRef(e), e));
    return m;
  }, [candidates]);

  const set = (ref, kind) => onChange({ ...(selection||{}), [ref]: kind });
  const drop = (ref) => { const next = { ...(selection||{}) }; delete next[ref]; onChange(next); };

  const lbl = {fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.08em",textTransform:"uppercase"};

  if (candidates.length === 0) return null;

  return (
    <div>
      {chosen.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
          {chosen.map(ref => {
            const e = byRef.get(ref);
            const kind = selection[ref];
            return (
              <div key={ref} style={{padding:"9px 11px",borderRadius:6,background:t.surfaceAlt,border:"1px solid "+t.border}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <span style={{fontSize:10.5,color:t.gold,fontFamily:t.mono,marginRight:6}}>{ref}</span>
                    <span style={{fontSize:12.5,color:t.text,fontFamily:t.sans,fontWeight:600}}>{e ? e.title : "(not in this workspace)"}</span>
                    {e && e.endDate && <span style={{fontSize:10.5,color:t.textMuted,fontFamily:t.mono,marginLeft:8}}>{fmtDate(e.endDate)}</span>}
                  </div>
                  <button onClick={()=>drop(ref)} aria-label={"Remove "+ref}
                    style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:13,lineHeight:1,padding:0}}>&#10005;</button>
                </div>
                {e && (
                  <p style={{margin:"0 0 7px",fontSize:11.5,color:t.textSub,fontFamily:t.serif,lineHeight:1.45,borderLeft:"2px solid "+t.border,paddingLeft:8}}>
                    "{e.results.keyLearning}"
                  </p>
                )}
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {RELATIONS.map(r => {
                    const act = kind === r.kind;
                    const tone = r.kind==="supersedes" ? t.red : r.kind==="contradicts" ? t.warn : t.teal;
                    const toneBg = r.kind==="supersedes" ? t.redBg : r.kind==="contradicts" ? t.warnBg : t.tealBg;
                    return (
                      <button key={r.kind} title={r.hint} onClick={()=>set(ref, r.kind)} aria-pressed={act}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:4,cursor:"pointer",fontWeight:600,fontFamily:t.sans,
                          background:act?toneBg:t.surface,border:"1px solid "+(act?tone:t.border),color:act?tone:t.textMuted}}>
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{fontSize:10.5,color:t.textMuted,fontFamily:t.serif,marginTop:6,lineHeight:1.45}}>
                  {(RELATIONS.find(r=>r.kind===kind)||{}).hint}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!open && (
        <button onClick={()=>setOpen(true)}
          style={{background:"none",border:"1px dashed "+t.border,borderRadius:6,cursor:"pointer",padding:"7px 11px",
            fontSize:11.5,fontWeight:600,fontFamily:t.sans,color:t.textSub,width:"100%",textAlign:"left"}}>
          + Link this to an earlier learning
        </button>
      )}

      {open && (
        <div style={{border:"1px solid "+t.border,borderRadius:6,padding:9,background:t.surface}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={lbl}>Search closed learnings</div>
            <button onClick={()=>{setOpen(false);setQuery("");}}
              style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:13,padding:0}}>&#10005;</button>
          </div>
          <input style={{...gI(t),fontSize:12.5}} autoFocus value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Title, learning text, or initiative id"/>
          <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:7,maxHeight:210,overflowY:"auto"}}>
            {matches.length===0 && (
              <div style={{fontSize:11.5,color:t.textMuted,fontFamily:t.serif,padding:"6px 2px"}}>
                {query.trim() ? "No closed learning matches that." : "No other closed learnings yet."}
              </div>
            )}
            {matches.map(e => (
              <button key={e.id} onClick={()=>{ set(learningRef(e), "supersedes"); setQuery(""); setOpen(false); }}
                style={{textAlign:"left",background:"none",border:"none",borderRadius:5,cursor:"pointer",padding:"6px 7px"}}
                onMouseEnter={ev=>{ev.currentTarget.style.background=t.surfaceAlt;}}
                onMouseLeave={ev=>{ev.currentTarget.style.background="none";}}>
                <div style={{fontSize:12,color:t.text,fontFamily:t.sans,fontWeight:600}}>
                  <span style={{fontSize:10,color:t.gold,fontFamily:t.mono,marginRight:6}}>{learningRef(e)}</span>
                  {e.title}
                </div>
                <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.4,marginTop:2}}>
                  "{(e.results.keyLearning||"").slice(0,110)}{(e.results.keyLearning||"").length>110?"…":""}"
                </div>
              </button>
            ))}
          </div>
          <div style={{fontSize:10.5,color:t.textMuted,fontFamily:t.serif,marginTop:7,lineHeight:1.45}}>
            Picks land as <strong>Supersedes</strong>; change the relation on the card above.
          </div>
        </div>
      )}
    </div>
  );
}
