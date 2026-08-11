import { useMemo, useState } from "react";
import { AGENDA_STATUSES, mkAgendaItem, agendaRollup } from "../services/learningAgenda.js";
import { gG, gGh, gI, gTA, gSl, gSc, gSL } from "../components/styles.js";
import { Modal } from "../components/Modal.jsx";
import { SBdg } from "../components/badges.jsx";
import { brandName } from "../constants.js";
import { IconPlus, IconArrowRight } from "../components/icons.jsx";

// -- Learning agenda (ROADMAP 5.1) ----------------------------------------------
//
// The layer above initiatives: a question the business needs answered, with
// experiments laddering up to it via `agendaId`. See services/learningAgenda.js
// for why the backward test design step (hold constant / vary / falsifying
// result → seeded initiative) is deterministic rather than AI-assisted.
export function AgendaView({ agenda, items, cats, brands, activeBrand, t, dk, onSaveAgenda, onStartExperiment, onViewInitiative }) {
  const [editing, setEditing] = useState(null); // agenda item being edited, or a fresh mkAgendaItem() draft
  const [fStatus, setFStatus] = useState("All");

  const rolled = useMemo(() => agendaRollup(agenda, items), [agenda, items]);

  const scoped = useMemo(() => rolled.filter(a =>
    (activeBrand === "all" || (a.brandId || "default") === activeBrand) &&
    (fStatus === "All" || a.status === fStatus)
  ), [rolled, activeBrand, fStatus]);

  const save = (draft) => {
    const exists = agenda.some(a => a.id === draft.id);
    onSaveAgenda(exists ? agenda.map(a => a.id === draft.id ? draft : a) : [draft, ...agenda]);
    setEditing(null);
  };

  const remove = (id) => { onSaveAgenda(agenda.filter(a => a.id !== id)); setEditing(null); };

  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:18,fontWeight:600,color:t.text,fontFamily:t.serif}}>Learning agenda</div>
          <div style={{fontSize:12,color:t.textSub,fontFamily:t.sans,marginTop:3,maxWidth:560,lineHeight:1.5}}>
            The questions the portfolio is trying to answer. Experiments ladder up to a question here instead of sitting
            as an unconnected backlog — which is what makes "did any of this actually teach us anything" answerable.
          </div>
        </div>
        <button style={gG(t)} onClick={()=>setEditing(mkAgendaItem(activeBrand, cats))}><IconPlus size={13}/> New question</button>
      </div>

      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {["All",...AGENDA_STATUSES].map(s => (
          <button key={s} onClick={()=>setFStatus(s)} aria-pressed={fStatus===s}
            style={{fontSize:12,padding:"5px 13px",borderRadius:t.r.md,cursor:"pointer",fontWeight:600,
              background:fStatus===s?t.goldFill:t.surfaceAlt,border:"1px solid "+(fStatus===s?t.goldFill:t.border),
              color:fStatus===s?t.goldText:t.textMuted}}>
            {s}{s!=="All"&&" ("+rolled.filter(a=>(activeBrand==="all"||(a.brandId||"default")===activeBrand)&&a.status===s).length+")"}
          </button>
        ))}
      </div>

      {scoped.length===0 && (
        <div style={{padding:"40px 24px",textAlign:"center",color:t.textMuted,fontFamily:t.serif,border:"1px dashed "+t.border,borderRadius:8}}>
          <div style={{fontSize:14,marginBottom:6,color:t.text}}>No questions yet</div>
          <div style={{fontSize:12}}>Name a question the business needs answered, then start an experiment from it.</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {scoped.map(a => (
          <div key={a.id} style={{...gSc(t)}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:t.r.xs,fontFamily:t.sans,
                    background:a.status==="Answered"?t.tealBg:a.status==="Parked"?t.surfaceAlt:t.goldBg,
                    color:a.status==="Answered"?t.teal:a.status==="Parked"?t.textMuted:t.gold,
                    border:"1px solid "+(a.status==="Answered"?t.teal:a.status==="Parked"?t.border:t.goldBorder)}}>{a.status}</span>
                  {a.category&&<span style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>{a.category}</span>}
                  {brands&&brands.length>1&&<span style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>{brandName(a.brandId||"default",brands)}</span>}
                  {a.hasAnswer&&a.status==="Open"&&(
                    <span style={{fontSize:10.5,fontWeight:600,color:t.teal,fontFamily:t.sans}}>&#9679; has a closed result — worth marking Answered</span>
                  )}
                </div>
                <div style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif,lineHeight:1.35}}>{a.question||"(untitled question)"}</div>
                {a.latestLearning&&(
                  <p style={{margin:"6px 0 0",fontSize:12.5,color:t.textSub,fontFamily:t.serif,lineHeight:1.5,borderLeft:"2px solid "+t.border,paddingLeft:9}}>
                    "{a.latestLearning}"
                  </p>
                )}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button style={gGh(t,"sm")} onClick={()=>setEditing(a)}>Edit</button>
                <button style={gG(t,"sm")} onClick={()=>onStartExperiment(a)}>Start experiment <IconArrowRight size={12}/></button>
              </div>
            </div>
            {a.linkedCount>0 && (
              <div style={{display:"flex",gap:8,flexWrap:"wrap",paddingTop:8,borderTop:"1px solid "+t.borderSoft}}>
                {a.linked.map(e=>(
                  <button key={e.id} onClick={()=>onViewInitiative(e.id)}
                    style={{display:"inline-flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0}}>
                    <SBdg s={e.status} dk={dk}/>
                    <span style={{fontSize:12,color:t.textSub,fontFamily:t.sans,textDecoration:"underline",textUnderlineOffset:2}}>
                      {e.title.slice(0,44)}{e.title.length>44?"…":""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <AgendaEditor t={t} dk={dk} cats={cats} draft={editing} isNew={!agenda.some(a=>a.id===editing.id)}
          onSave={save} onDelete={()=>remove(editing.id)} onClose={()=>setEditing(null)}/>
      )}
    </div>
  );
}

function AgendaEditor({ t, dk, cats, draft, isNew, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(draft);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title={isNew?"New agenda question":"Edit agenda question"}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div style={gSL(t)}>Question</div>
          <textarea style={gTA(t)} rows={2} value={form.question} onChange={e=>f("question",e.target.value)}
            placeholder="e.g. Does creator authority beat product demonstration for cold traffic?"/>
        </div>
        <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={gSL(t)}>Category</div>
            <select style={gSl(t)} value={form.category} onChange={e=>f("category",e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <div style={gSL(t)}>Status</div>
            <select style={gSl(t)} value={form.status} onChange={e=>f("status",e.target.value)}>{AGENDA_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
          </div>
        </div>
        <div style={{fontSize:11.5,color:t.textMuted,fontFamily:t.sans,lineHeight:1.5}}>
          The next three fields are backward test design — name the question, then say what would falsify it, and an
          experiment can be built to test exactly that.
        </div>
        <div>
          <div style={gSL(t)}>Hold constant</div>
          <input style={gI(t)} value={form.holdConstant} onChange={e=>f("holdConstant",e.target.value)} placeholder="e.g. budget, placement, offer"/>
        </div>
        <div>
          <div style={gSL(t)}>What varies</div>
          <input style={gI(t)} value={form.varies} onChange={e=>f("varies",e.target.value)} placeholder="e.g. creator-led vs. product-first creative"/>
        </div>
        <div>
          <div style={gSL(t)}>Result that would falsify it</div>
          <textarea style={gTA(t)} rows={2} value={form.falsifyingResult} onChange={e=>f("falsifyingResult",e.target.value)}
            placeholder="e.g. No CVR lift after 3 weeks on 1,000+ sessions per arm"/>
        </div>
        <div>
          <div style={gSL(t)}>Sample / duration guidance</div>
          <input style={gI(t)} value={form.sampleGuidance} onChange={e=>f("sampleGuidance",e.target.value)} placeholder="e.g. 3 weeks, 1,000 sessions per arm"/>
        </div>
        <div>
          <div style={gSL(t)}>Notes</div>
          <textarea style={gTA(t)} rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"space-between",flexWrap:"wrap"}}>
          {!isNew ? <button style={{...gGh(t),color:t.red,borderColor:t.red}} onClick={onDelete}>Delete</button> : <span/>}
          <div style={{display:"flex",gap:8}}>
            <button style={gGh(t)} onClick={onClose}>Cancel</button>
            <button style={{...gG(t),...(!form.question.trim()?{opacity:0.45,cursor:"not-allowed"}:null)}}
              disabled={!form.question.trim()} onClick={()=>onSave(form)}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
