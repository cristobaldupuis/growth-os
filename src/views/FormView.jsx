import { useState } from "react";
import { STATUSES, INIT_TYPES, BLOCKERS, SL, SD, fmtCur } from "../constants.js";
import { gG, gGh, gI, gTA, gSl, gSc, gSL } from "../components/styles.js";
import { FR } from "../components/FR.jsx";
import { ICESliders } from "../components/ICESliders.jsx";
import { adNamesOf, adNameEntry, normKey } from "../services/naming.js";

// -- Form ----------------------------------------------------------------------
export function FormView({form,setForm,items,t,dk,cats,brands,aiLoad,iceLoad,hypReview,iceReview,dataCtx,setDataCtx,onAi,onIceAssist,onAcceptHyp,onRejectHyp,onAcceptIce,onRejectIce,onSave,onCancel,onOpenBuilder}) {
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const claimed = adNamesOf(form);
  const [pasteName,setPasteName] = useState("");
  const addName = () => {
    const entry = adNameEntry({ name: pasteName, addedAt: new Date().toISOString().slice(0,10) });
    if (!entry) return;
    if (claimed.some(e => normKey(e.name) === normKey(entry.name))) { setPasteName(""); return; }
    f("adNames", [...claimed, entry]);
    setPasteName("");
  };
  const canAi  = form.hypothesis&&form.hypothesis.length>=60;
  const canIce = !!(form.hypothesis&&form.title);
  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontSize:18,fontWeight:600,color:t.text,fontFamily:t.serif}}>{form._new?"New initiative":"Edit initiative"}</div>

      <FR label="Title *" t={t}><input style={gI(t)} value={form.title} onChange={e=>f("title",e.target.value)} placeholder="e.g. Homepage hero A/B: lifestyle vs product-first creative"/></FR>

      <div style={gSc(t)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={gSL(t)}>Hypothesis framework</div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <FR label="📊 Observation · What data or behaviour prompted this? *" t={t}>
            <textarea style={gTA(t)} rows={2} value={form.observation||""} onChange={e=>f("observation",e.target.value)}
              placeholder="e.g. New-visitor CVR dropped from 1.85% to 0.42% over 4 weeks following the March widget rollout. Paid social mobile traffic is the most affected segment."/>
          </FR>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <label style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>💡 Hypothesis · If we do X, then Y… *</label>
              <button style={{...gGh(t),fontSize:11,padding:"2px 9px",opacity:canAi?1:0.4}} onClick={onAi} disabled={!canAi||aiLoad} title={canAi?"Expand with AI, requires your confirmation":"Write 60+ chars in hypothesis first"}>
                {aiLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Expanding…</>:<><span style={{fontSize:12}}>&#10024;</span> Expand with AI</>}
              </button>
            </div>
            <textarea style={gTA(t)} rows={3} value={form.hypothesis} onChange={e=>f("hypothesis",e.target.value)} placeholder="We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason]."/>
            {!canAi&&form.hypothesis&&form.hypothesis.length>0&&form.hypothesis.length<60&&<div style={{fontSize:11,color:t.textMuted,marginTop:3,fontFamily:t.serif}}><span style={{fontFamily:t.mono}}>{60-form.hypothesis.length}</span> more chars to unlock AI expand</div>}
            {hypReview&&(
              <div style={{marginTop:10,padding:"12px 14px",borderRadius:6,background:t.tealBg,border:"1px solid "+t.teal}}>
                <div style={{fontSize:10,color:t.teal,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:8}}>AI suggestion · review before accepting</div>
                <p style={{margin:"0 0 12px",fontSize:13,color:t.text,lineHeight:1.7,fontStyle:"italic"}}>"{hypReview.proposed}"</p>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={onAcceptHyp} style={{...gG(t),fontSize:11,padding:"4px 11px"}}><span>&#10003;</span> Accept</button>
                  <button onClick={onRejectHyp} style={{...gGh(t),fontSize:11,padding:"4px 11px"}}><span>&#10005;</span> Discard</button>
                </div>
              </div>
            )}
          </div>

          <FR label="🎯 Success metric · What KPI determines a win? *" t={t}>
            <input style={gI(t)} value={form.successMetric||""} onChange={e=>f("successMetric",e.target.value)}
              placeholder="e.g. New-visitor CVR recovers to ≥1.76% on paid-social mobile within 3 weeks of rollback."/>
          </FR>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:brands&&brands.length>1?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr",gap:10}}>
        {brands&&brands.length>1&&<FR label="Retailer" t={t}><select style={gSl(t)} value={form.brandId||"default"} onChange={e=>f("brandId",e.target.value)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></FR>}
        <FR label="Category" t={t}><select style={gSl(t)} value={form.category} onChange={e=>f("category",e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select></FR>
        <FR label="Type" t={t}><select style={gSl(t)} value={form.initType||"A/B Test"} onChange={e=>f("initType",e.target.value)}>{INIT_TYPES.map(tp=><option key={tp}>{tp}</option>)}</select></FR>
        <FR label="Owner" t={t}><input style={gI(t)} value={form.owner||""} onChange={e=>f("owner",e.target.value)}/></FR>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Status" t={t}><select style={gSl(t)} value={form.status} onChange={e=>f("status",e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></FR>
        <FR label="Primary metric" t={t}><input style={gI(t)} value={form.primaryMetric||""} onChange={e=>f("primaryMetric",e.target.value)} placeholder="e.g. CVR, ROAS, AOV, CAC"/></FR>
      </div>

      {/* Measurement & attribution — how imported data maps back to this initiative */}
      <div style={gSc(t)}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
          <div style={gSL(t)}>Measurement &amp; attribution</div>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>optional · powers data matching</span>
        </div>
        <p style={{fontSize:11.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,margin:"0 0 12px"}}>
          Tells Growth OS which metric, segment, and date window this initiative is judged on, so an imported CSV or feed can be matched to it. The window is the start/end dates below.
        </p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <FR label="Metric measured" t={t}>
            <input style={gI(t)} list="measure-metrics" value={form.measurementMetric||""} onChange={e=>f("measurementMetric",e.target.value)} placeholder="e.g. CVR, Revenue, ROAS, AOV"/>
            <datalist id="measure-metrics">
              {["CVR","Revenue","ROAS","AOV","CAC","Sessions / Traffic","Conversions","Add-to-cart rate","Email CTR","Repeat rate","LTV","Bounce rate"].map(m=><option key={m} value={m}/>)}
            </datalist>
          </FR>
          <FR label="Scope / segment" t={t}>
            <input style={gI(t)} value={form.measurementScope||""} onChange={e=>f("measurementScope",e.target.value)} placeholder="e.g. new visitors, top 20 SKUs"/>
          </FR>
        </div>
        <div style={{marginTop:10}}>
          <FR label="Tracking tag" t={t}>
            <input style={{...gI(t),fontFamily:t.mono}} value={form.trackingTag||""} onChange={e=>f("trackingTag",e.target.value)} placeholder="optional: UTM campaign, discount code, or GA4 event for precise auto-match"/>
          </FR>
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,marginTop:5,lineHeight:1.5}}>
            Use this only when the test has a clean identifier (mostly paid campaigns). Most initiatives match on metric + window + scope alone.
          </div>
        </div>

        {/* Claimed ad names — the other bridge.
            The tracking tag above works when the name was built from the naming
            convention. This works when it wasn't, which is most spend that
            already exists: a campaign live in Ads Manager for six weeks cannot be
            renamed without resetting its learning phase, so the join has to take
            the name as it is. Pasting one here is enough — an imported row
            matches at any level, so claiming a campaign claims every ad under it.
            Composing a NEW name belongs in the builder, not in this form, which
            is why that is a link rather than a second editor. */}
        <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+t.borderSoft}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:6}}>
            <div style={{...gSL(t),marginBottom:0}}>Campaign &amp; ad names</div>
            {onOpenBuilder && (
              <button type="button" onClick={onOpenBuilder} style={{...gGh(t),fontSize:11,padding:"4px 10px"}}
                title="Save this initiative and open the name builder with it selected">
                Build a new name &#8594;
              </button>
            )}
          </div>
          <p style={{fontSize:11.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,margin:"0 0 9px"}}>
            Paste a campaign, ad set or ad name exactly as it appears in Google or Meta and this initiative claims it.
            Imported performance rows carrying that name roll up here automatically — a claimed campaign brings every ad
            underneath it. To compose a convention-correct name from scratch, use the builder.
          </p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input style={{...gI(t),fontFamily:t.mono,flex:"1 1 260px",width:"auto"}} value={pasteName}
              onChange={e=>setPasteName(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addName();}}}
              placeholder="e.g. Meta_Prospect_Pastry_US_Purchase"/>
            <button type="button" onClick={addName} disabled={!pasteName.trim()}
              style={{...gG(t),opacity:pasteName.trim()?1:0.45,cursor:pasteName.trim()?"pointer":"not-allowed"}}>Claim</button>
          </div>
          {claimed.length>0 && (
            <div style={{marginTop:9}}>
              {claimed.map(e=>(
                <div key={e.name} style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"baseline",padding:"6px 0",borderBottom:"1px solid "+t.borderSoft,flexWrap:"wrap"}}>
                  <div style={{minWidth:0,flex:"1 1 240px"}}>
                    <div style={{fontFamily:t.mono,fontSize:11.5,color:t.text,wordBreak:"break-all"}}>{e.name}</div>
                    {[e.channel,e.level,e.addedAt].filter(Boolean).length>0 && (
                      <div style={{fontFamily:t.mono,fontSize:10,color:t.textMuted,marginTop:2}}>
                        {[e.channel,e.level,e.addedAt].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={()=>f("adNames",claimed.filter(x=>normKey(x.name)!==normKey(e.name)))}
                    style={{...gGh(t),fontSize:11,padding:"3px 9px"}}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FR label="⚠️ Blocker" t={t}>
        <select style={{...gSl(t), ...(form.blocker&&form.blocker!=="None"?{borderColor:t.warnBorder,background:t.warnBg,color:t.warn,fontWeight:700}:{})}}
          value={form.blocker||"None"} onChange={e=>f("blocker",e.target.value)}>
          {BLOCKERS.map(b=><option key={b}>{b}</option>)}
        </select>
        {form.blocker&&form.blocker!=="None"&&(
          <div style={{marginTop:4,fontSize:11,color:t.warn,fontFamily:t.serif,fontWeight:600}}>
            ⚠️ This initiative is flagged as blocked. It will display a warning badge in all views.
          </div>
        )}
      </FR>

      <div style={gSc(t)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={gSL(t)}>ICE Scoring: Impact &#183; Certainty &#183; Ease</div>
          <button style={{...gGh(t),fontSize:11,padding:"2px 9px",opacity:canIce?1:0.4}} onClick={onIceAssist} disabled={!canIce||iceLoad} title={canIce?"Suggest Impact + Certainty with AI":"Add title and hypothesis first"}>
            {iceLoad?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>&#8635;</span> Scoring…</>:<><span style={{fontSize:12}}>&#129302;</span> Suggest Impact + Certainty</>}
          </button>
        </div>
        {iceReview&&(
          <div style={{marginBottom:14,padding:"12px 14px",borderRadius:6,background:t.warnBg,border:"1px solid "+t.warnBorder}}>
            <div style={{fontSize:10,color:t.warn,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:10}}>AI scoring suggestion · review and adjust before accepting</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              {[{label:"Impact",score:iceReview.impact,rationale:iceReview.impact_rationale},{label:"Certainty",score:iceReview.certainty,rationale:iceReview.certainty_rationale}].map(d=>(
                <div key={d.label}>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                    <span style={{fontSize:20,fontWeight:700,color:t.gold,fontFamily:t.mono}}>{d.score}</span>
                    <span style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>/10 {d.label}</span>
                  </div>
                  <div style={{fontSize:12,color:t.textSub,lineHeight:1.5,fontFamily:t.serif}}>{d.rationale}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={onAcceptIce} style={{...gG(t),fontSize:11,padding:"4px 11px"}}><span>&#10003;</span> Accept scores</button>
              <button onClick={onRejectIce} style={{...gGh(t),fontSize:11,padding:"4px 11px"}}><span>&#10005;</span> Discard</button>
            </div>
          </div>
        )}
        <ICESliders ice={form.ice||{impact:5,certainty:5,ease:5}} onChange={v=>f("ice",v)} t={t}/>
      </div>

      <FR label="Kill criteria" t={t}><textarea style={gTA(t)} rows={2} value={form.killCriteria||""} onChange={e=>f("killCriteria",e.target.value)} placeholder="e.g. If CVR doesn't improve by ≥0.5pp after 2 weeks on 500+ sessions, kill it. If CAC exceeds $55, pause and review spend allocation."/></FR>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Start date" t={t}><input style={gI(t)} type="date" value={form.startDate||""} onChange={e=>f("startDate",e.target.value)}/></FR>
        <FR label="End date" t={t}><input style={gI(t)} type="date" value={form.endDate||""} onChange={e=>f("endDate",e.target.value)}/></FR>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Sample size" t={t}><input style={gI(t)} value={form.sampleSize||""} onChange={e=>f("sampleSize",e.target.value)}/></FR>
        <FR label="Duration" t={t}><input style={gI(t)} value={form.duration||""} onChange={e=>f("duration",e.target.value)}/></FR>
      </div>
      <div style={{...gSc(t)}}>
        <div style={gSL(t)}>Investment & return</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <FR label="Est. media / spend cost ($)" t={t}><input style={gI(t)} type="number" value={form.spendCost||0} onChange={e=>f("spendCost",parseInt(e.target.value)||0)} placeholder="0"/></FR>
          <FR label="Est. resource cost ($)" t={t}><input style={gI(t)} type="number" value={form.resourceCost||0} onChange={e=>f("resourceCost",parseInt(e.target.value)||0)} placeholder="0"/></FR>
          <FR label="Est. revenue impact ($)" t={t}><input style={gI(t)} type="number" value={form.revenueImpact||0} onChange={e=>f("revenueImpact",parseInt(e.target.value)||0)} placeholder="0"/></FR>
        </div>
        {((form.spendCost||0)+(form.resourceCost||0))>0&&(
          <div style={{marginTop:10,padding:"8px 12px",background:t.surfaceAlt,borderRadius:4,fontSize:12,fontFamily:t.serif,color:t.textMuted,display:"flex",gap:16,flexWrap:"wrap"}}>
            <span>Total est. cost: <strong style={{color:t.text}}>{fmtCur((form.spendCost||0)+(form.resourceCost||0))}</strong></span>
            {(form.revenueImpact||0)>0&&<span>Est. ROI: <strong style={{color:t.gold}}>{((form.revenueImpact||0)/((form.spendCost||0)+(form.resourceCost||0))).toFixed(1)}x</strong></span>}
          </div>
        )}
      </div>

      <div style={{...gSc(t),border:"1px dashed "+t.border}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={gSL(t)}>Data context <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:t.textMuted}}>(optional, used by AI)</span></div>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,background:t.border,padding:"2px 6px",borderRadius:3}}>Placeholder</span>
        </div>
        <textarea style={{...gTA(t),fontSize:12}} rows={3} value={dataCtx} onChange={e=>setDataCtx(e.target.value)} placeholder={"Paste relevant metrics here: CVR, ROAS, sessions, revenue trends, etc.\nExample: Paid social CVR last 4W: 0.42% vs prior 4W: 1.85%. ROAS: 0.24x.\nFuture: will connect to Google Sheets, GA4, Meta Ads."}/>
      </div>

      <FR label="Notes" t={t}><textarea style={gTA(t)} rows={2} value={form.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="Sequencing logic, caveats, context"/></FR>

      <LinkedInitiativePicker form={form} setForm={setForm} items={items} t={t} dk={dk}/>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
        <button style={gGh(t)} onClick={onCancel}>Cancel</button>
        <button style={gG(t)} onClick={()=>onSave()} disabled={!form.title}>Save</button>
      </div>
    </div>
  );
}

// -- Linked Initiative Picker -------------------------------------------------
function LinkedInitiativePicker({form, setForm, items, t, dk}) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);

  const linked = (form.linkedIds||[]);
  const f = (v) => setForm(p=>({...p, linkedIds:v}));

  const candidates = items.filter(e=>{
    if (e.id === form.id) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return e.title.toLowerCase().includes(q) || (e.initId||"").toLowerCase().includes(q);
  }).slice(0, 8);

  const linkedItems = items.filter(e=>linked.includes(e.id));

  const toggle = (id) => {
    f(linked.includes(id) ? linked.filter(x=>x!==id) : [...linked, id]);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>Link related initiatives</label>

      {/* Selected chips */}
      {linkedItems.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {linkedItems.map(e=>(
            <span key={e.id} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,padding:"3px 9px",borderRadius:4,background:t.tealBg,border:"1px solid "+t.teal,color:t.teal,fontFamily:t.serif}}>
              {e.initId&&<span style={{opacity:0.7}}>{e.initId}</span>}
              {e.title.slice(0,32)}{e.title.length>32?"…":""}
              <button onClick={()=>toggle(e.id)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",padding:"0 0 0 2px",fontSize:12,lineHeight:1}}>&#10005;</button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{position:"relative"}}>
        <input style={gI(t)} value={query}
          onChange={e=>{setQuery(e.target.value);setOpen(true);}}
          onFocus={()=>setOpen(true)}
          onBlur={()=>setTimeout(()=>setOpen(false),200)}
          placeholder="Search by title or ID (e.g. NH-001)…"/>

        {/* Dropdown */}
        {open&&candidates.length>0&&(
          <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,background:t.surface,border:"1px solid "+t.border,borderRadius:6,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",maxHeight:220,overflowY:"auto"}}>
            {candidates.map(e=>{
              const isLinked = linked.includes(e.id);
              const c=(dk?SD:SL)[e.status]||SL.Draft;
              return (
                <div key={e.id} onMouseDown={()=>toggle(e.id)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",
                    background:isLinked?t.tealBg:t.surface,
                    borderBottom:"1px solid "+t.border}}>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,minWidth:52,flexShrink:0}}>{e.initId||"—"}</span>
                  <span style={{fontSize:12,color:t.text,flex:1,fontFamily:t.serif}}>{e.title.slice(0,50)}{e.title.length>50?"…":""}</span>
                  <span style={{fontSize:10,fontWeight:600,color:c.text,background:c.bg,border:"1px solid "+c.border,borderRadius:3,padding:"1px 5px",flexShrink:0}}>{e.status}</span>
                  {isLinked&&<span style={{fontSize:11,color:t.teal}}>&#10003;</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!open&&!query&&linkedItems.length===0&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>Start typing to search initiatives…</div>}
    </div>
  );
}
