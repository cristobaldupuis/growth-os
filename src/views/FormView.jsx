import { useMemo, useRef, useState } from "react";
import { STATUSES, INIT_TYPES, RISK_TYPES, BLOCKERS, SL, SD, fmtCur } from "../constants.js";
import { gG, gGh, gI, gTA, gSl, gSc, gSL, gOff } from "../components/styles.js";
import { FR } from "../components/FR.jsx";
import { ICESliders } from "../components/ICESliders.jsx";
import { adNamesOf, adNameEntry, normKey } from "../services/naming.js";
import { validateInitiative, PROMPTS } from "../services/preregistration.js";
import { killGateBlocked, KILL_GATE_MESSAGE } from "../services/killGate.js";
import {
  IconChart, IconLightbulb, IconTarget, IconAlert, IconSparkle, IconSpinner,
  IconCheck, IconClose, IconArrowRight,
} from "../components/icons.jsx";

// -- Pre-registration --------------------------------------------------------
//
// Observation, hypothesis and success metric carried an asterisk and the README
// called this the "structured hypothesis enforcer: every initiative requires
// three distinct fields". Save was disabled on an empty *title* and nothing
// else, so all three could be left blank — the enforcer did not enforce, and a
// form that marks a field required and then accepts it empty teaches the
// operator that the discipline is optional. There was also no inline validation
// anywhere in the product: no message under a field, no `aria-invalid`, no
// summary. The only feedback channel was a toast, which is used for outcomes.
//
// This is the one place in the app where friction is the feature. The frozen
// prediction the calibration ledger later compares against is only worth
// something if it was actually written down before the test ran.
//
// ## Why existing initiatives are not blocked
//
// The requirement is enforced on new work and flagged, not blocked, on old.
// Every one of the thirty-eight seeded demo initiatives predates these fields
// and has neither an observation nor a success metric; hard-blocking would make
// each of them uneditable, so the first thing a new user did — open one and
// change a date — would fail. Legacy records get the same red fields and a
// banner explaining what is missing and why, and can still be saved. New ones
// cannot.
// -- Form ----------------------------------------------------------------------
export function FormView({form,setForm,items,agenda,t,dk,cats,brands,aiLoad,iceLoad,hypReview,iceReview,dataCtx,setDataCtx,onAi,onIceAssist,onAcceptHyp,onRejectHyp,onAcceptIce,onRejectIce,onSave,onCancel,onOpenBuilder}) {
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const claimed = adNamesOf(form);
  const [pasteName,setPasteName] = useState("");
  // Errors appear once the user has tried to save, not while they are still
  // filling the first field in. A form that turns red before you have finished
  // typing your title is nagging, not validating.
  const [submitted,setSubmitted] = useState(false);
  const v = useMemo(()=>validateInitiative(form),[form]);
  const errorFor = (key) => (submitted || v.legacy) && v.missing.some(m=>m.key===key)
    ? "Required. " + PROMPTS[key] : null;
  // The status this initiative had before this edit session — undefined for a
  // brand-new one, which killGateBlocked treats the same as "not Running".
  const prevStatus = form._new ? null : items.find(e=>e.id===form.id)?.status;
  const killBlocked = killGateBlocked(form.status, prevStatus, form.killCriteria);
  const killError = submitted && killBlocked ? "Required. " + KILL_GATE_MESSAGE : null;
  const trySave = () => {
    setSubmitted(true);
    if (v.blocking || killBlocked) {
      // Send focus to the first thing that is wrong rather than leaving the
      // reader to hunt for the red field in a twenty-field form.
      document.getElementById(v.blocking ? "gos-missing-summary" : "gos-kill-criteria")?.scrollIntoView({behavior:"smooth",block:"center"});
      return;
    }
    onSave();
  };
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

      {/* What is missing, named once at the top, so a twenty-field form does not
        * have to be scanned for red. */}
      {(submitted||v.legacy)&&v.missing.length>0&&(
        <div id="gos-missing-summary" role="alert"
          style={{padding:"11px 14px",borderRadius:t.r.md,
            background:v.blocking?t.redBg:t.warnBg,
            border:"1px solid "+(v.blocking?t.red:t.warnBorder)}}>
          <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,fontWeight:700,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",
            color:v.blocking?t.red:t.warn,marginBottom:6}}>
            <IconAlert size={13}/>
            {v.blocking ? "Not ready to save" : "Missing pre-registration"}
          </div>
          <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.55}}>
            {v.blocking
              ? <>An initiative is a prediction on the record. Fill in <strong style={{color:t.text}}>{v.missing.map(m=>m.label).join(", ")}</strong> before saving — these are what the result is later compared against.</>
              : <>This initiative predates the pre-registration fields and is missing <strong style={{color:t.text}}>{v.missing.map(m=>m.label).join(", ")}</strong>. You can still save it, but its outcome cannot be scored against anything until they are filled in.</>}
          </div>
        </div>
      )}

      <FR label="Title" t={t} required error={errorFor("title")}><input style={gI(t)} value={form.title} onChange={e=>f("title",e.target.value)} placeholder="e.g. Homepage hero A/B: lifestyle vs product-first creative"/></FR>

      <div style={gSc(t)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={gSL(t)}>Hypothesis framework</div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <FR label={<><IconChart size={13}/> Observation · what data or behaviour prompted this?</>} t={t} required error={errorFor("observation")}>
            <textarea style={gTA(t)} rows={2} value={form.observation||""} onChange={e=>f("observation",e.target.value)}
              placeholder="e.g. New-visitor CVR dropped from 1.85% to 0.42% over 4 weeks following the March widget rollout. Paid social mobile traffic is the most affected segment."/>
          </FR>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <label htmlFor="gos-hypothesis" style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:t.textMuted,fontFamily:t.serif,cursor:"pointer"}}>
                <IconLightbulb size={13}/> Hypothesis · if we do X, then Y…<span aria-hidden="true" style={{color:t.gold}}>*</span>
              </label>
              <button style={{...gGh(t,"sm"),...(canAi&&!aiLoad?null:gOff)}} onClick={onAi} disabled={!canAi||aiLoad} title={canAi?"Expand with AI, requires your confirmation":"Write 60+ chars in hypothesis first"}>
                {aiLoad?<><IconSpinner size={12}/> Expanding…</>:<><IconSparkle size={12}/> Expand with AI</>}
              </button>
            </div>
            <textarea id="gos-hypothesis" style={{...gTA(t),...(errorFor("hypothesis")?{borderColor:t.red}:null)}} rows={3}
              aria-required="true" aria-invalid={errorFor("hypothesis")?"true":undefined} aria-describedby={errorFor("hypothesis")?"gos-hypothesis-error":undefined}
              value={form.hypothesis} onChange={e=>f("hypothesis",e.target.value)} placeholder="We believe that [specific change] will result in [measurable outcome] for [context], because [evidence-based reason]."/>
            {errorFor("hypothesis")&&<div id="gos-hypothesis-error" role="alert" style={{fontSize:11,color:t.red,fontFamily:t.sans,fontWeight:600,marginTop:5,lineHeight:1.45}}>{errorFor("hypothesis")}</div>}
            {!canAi&&form.hypothesis&&form.hypothesis.length>0&&form.hypothesis.length<60&&<div style={{fontSize:11,color:t.textMuted,marginTop:3,fontFamily:t.serif}}><span style={{fontFamily:t.mono}}>{60-form.hypothesis.length}</span> more chars to unlock AI expand</div>}
            {hypReview&&(
              <div style={{marginTop:10,padding:"12px 14px",borderRadius:6,background:t.tealBg,border:"1px solid "+t.teal}}>
                <div style={{fontSize:10,color:t.teal,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:8}}>AI suggestion · review before accepting</div>
                <p style={{margin:"0 0 12px",fontSize:13,color:t.text,lineHeight:1.7,fontStyle:"italic"}}>"{hypReview.proposed}"</p>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={onAcceptHyp} style={gG(t,"sm")}><IconCheck size={12}/> Accept</button>
                  <button onClick={onRejectHyp} style={gGh(t,"sm")}><IconClose size={12}/> Discard</button>
                </div>
              </div>
            )}
          </div>

          <FR label={<><IconTarget size={13}/> Success metric · what KPI determines a win?</>} t={t} required error={errorFor("successMetric")}>
            <input style={gI(t)} value={form.successMetric||""} onChange={e=>f("successMetric",e.target.value)}
              placeholder="e.g. New-visitor CVR recovers to ≥1.76% on paid-social mobile within 3 weeks of rollback."/>
          </FR>
        </div>
      </div>

      <div className="gos-grid-3" style={{display:"grid",gridTemplateColumns:brands&&brands.length>1?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr",gap:10}}>
        {brands&&brands.length>1&&<FR label="Retailer" t={t}><select style={gSl(t)} value={form.brandId||"default"} onChange={e=>f("brandId",e.target.value)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></FR>}
        <FR label="Category" t={t}><select style={gSl(t)} value={form.category} onChange={e=>f("category",e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select></FR>
        <FR label="Type" t={t}><select style={gSl(t)} value={form.initType||"A/B Test"} onChange={e=>f("initType",e.target.value)}>{INIT_TYPES.map(tp=><option key={tp}>{tp}</option>)}</select></FR>
        <FR label="Owner" t={t}><input style={gI(t)} value={form.owner||""} onChange={e=>f("owner",e.target.value)}/></FR>
      </div>

      <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Status" t={t}><select style={gSl(t)} value={form.status} onChange={e=>f("status",e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></FR>
        <FR label="Primary metric" t={t}><input style={gI(t)} value={form.primaryMetric||""} onChange={e=>f("primaryMetric",e.target.value)} placeholder="e.g. CVR, ROAS, AOV, CAC"/></FR>
      </div>

      {agenda&&agenda.length>0&&(
        <FR label="Answers agenda question" t={t} hint="Optional. Links this initiative into the learning agenda so its result rolls up against the question it was run to answer.">
          <select style={gSl(t)} value={form.agendaId||""} onChange={e=>f("agendaId",e.target.value||null)}>
            <option value="">— none —</option>
            {agenda.map(a=><option key={a.id} value={a.id}>{(a.question||"(untitled)").slice(0,80)}</option>)}
          </select>
        </FR>
      )}

      {/* Measurement & attribution — how imported data maps back to this initiative */}
      <div style={gSc(t)}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
          <div style={gSL(t)}>Measurement &amp; attribution</div>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>optional · powers data matching</span>
        </div>
        <p style={{fontSize:11.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,margin:"0 0 12px"}}>
          Tells Marketers Lab which metric, segment, and date window this initiative is judged on, so an imported CSV or feed can be matched to it. The window is the start/end dates below.
        </p>
        <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
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
              <button type="button" onClick={onOpenBuilder} style={gGh(t,"sm")}
                title="Save this initiative and open the name builder with it selected">
                Build a new name <IconArrowRight size={12}/>
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
              style={{...gG(t),...(pasteName.trim()?null:gOff)}}>Claim</button>
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
                    style={gGh(t,"sm")}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FR label={<><IconAlert size={13}/> Blocker</>} t={t}>
        <select style={{...gSl(t), ...(form.blocker&&form.blocker!=="None"?{borderColor:t.warnBorder,background:t.warnBg,color:t.warn,fontWeight:700}:{})}}
          value={form.blocker||"None"} onChange={e=>f("blocker",e.target.value)}>
          {BLOCKERS.map(b=><option key={b}>{b}</option>)}
        </select>
        {form.blocker&&form.blocker!=="None"&&(
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4,fontSize:11,color:t.warn,fontFamily:t.serif,fontWeight:600}}>
            <IconAlert size={13}/> This initiative is flagged as blocked. It will display a warning badge in all views.
          </div>
        )}
      </FR>

      <div style={gSc(t)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={gSL(t)}>ICE Scoring: Impact &#183; Certainty &#183; Ease</div>
          <button style={{...gGh(t,"sm"),...(canIce&&!iceLoad?null:gOff)}} onClick={onIceAssist} disabled={!canIce||iceLoad} title={canIce?"Suggest Impact + Certainty with AI":"Add title and hypothesis first"}>
            {iceLoad?<><IconSpinner size={12}/> Scoring…</>:<><IconSparkle size={12}/> Suggest Impact + Certainty</>}
          </button>
        </div>
        {iceReview&&(
          <div style={{marginBottom:14,padding:"12px 14px",borderRadius:6,background:t.warnBg,border:"1px solid "+t.warnBorder}}>
            <div style={{fontSize:10,color:t.warn,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:t.mono,marginBottom:10}}>AI scoring suggestion · review and adjust before accepting</div>
            <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
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
              <button onClick={onAcceptIce} style={gG(t,"sm")}><IconCheck size={12}/> Accept scores</button>
              <button onClick={onRejectIce} style={gGh(t,"sm")}><IconClose size={12}/> Discard</button>
            </div>
          </div>
        )}
        <ICESliders ice={form.ice||{impact:5,certainty:5,ease:5}} onChange={v=>f("ice",v)} t={t}/>
      </div>

      <FR label="Kill criteria" t={t} required={form.status==="Running"&&prevStatus!=="Running"} error={killError}
        hint={!killError&&form.status==="Running"&&prevStatus!=="Running"?"Required to start running — name the condition that would stop this.":null}>
        <textarea id="gos-kill-criteria" style={gTA(t)} rows={2} value={form.killCriteria||""} onChange={e=>f("killCriteria",e.target.value)} placeholder="e.g. If CVR doesn't improve by ≥0.5pp after 2 weeks on 500+ sessions, kill it. If CAC exceeds $55, pause and review spend allocation."/>
      </FR>

      <FR label="Risk type" t={t} hint="Franchise extends what already works. Loonshot is a real swing on something unproven — optional, and what lets the portfolio be read for whether it's taking any.">
        <select style={gSl(t)} value={form.riskType||""} onChange={e=>f("riskType",e.target.value)}>
          <option value="">Unclassified</option>
          {RISK_TYPES.map(r=><option key={r} value={r}>{r}</option>)}
        </select>
      </FR>

      <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Start date" t={t}><input style={gI(t)} type="date" value={form.startDate||""} onChange={e=>f("startDate",e.target.value)}/></FR>
        <FR label="End date" t={t}><input style={gI(t)} type="date" value={form.endDate||""} onChange={e=>f("endDate",e.target.value)}/></FR>
      </div>

      <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FR label="Sample size" t={t}><input style={gI(t)} value={form.sampleSize||""} onChange={e=>f("sampleSize",e.target.value)}/></FR>
        <FR label="Duration" t={t}><input style={gI(t)} value={form.duration||""} onChange={e=>f("duration",e.target.value)}/></FR>
      </div>
      <div style={{...gSc(t)}}>
        <div style={gSL(t)}>Investment & return</div>
        <div className="gos-grid-3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <FR label="Est. media / spend cost" t={t}><input style={gI(t)} type="number" inputMode="numeric" value={form.spendCost??""} onChange={e=>f("spendCost",e.target.value===""?0:parseInt(e.target.value)||0)} placeholder="0"/></FR>
          <FR label="Est. resource cost" t={t}><input style={gI(t)} type="number" inputMode="numeric" value={form.resourceCost??""} onChange={e=>f("resourceCost",e.target.value===""?0:parseInt(e.target.value)||0)} placeholder="0"/></FR>
          <FR label="Est. revenue impact" t={t}><input style={gI(t)} type="number" inputMode="numeric" value={form.revenueImpact??""} onChange={e=>f("revenueImpact",e.target.value===""?0:parseInt(e.target.value)||0)} placeholder="0"/></FR>
        </div>
        {((form.spendCost||0)+(form.resourceCost||0))>0&&(
          <div style={{marginTop:10,padding:"8px 12px",background:t.surfaceAlt,borderRadius:4,fontSize:12,fontFamily:t.serif,color:t.textMuted,display:"flex",gap:16,flexWrap:"wrap"}}>
            <span>Total est. cost: <strong style={{color:t.text}}>{fmtCur((form.spendCost||0)+(form.resourceCost||0))}</strong></span>
            {(form.revenueImpact||0)>0&&<span>Est. ROI: <strong style={{color:t.gold}}>{((form.revenueImpact||0)/((form.spendCost||0)+(form.resourceCost||0))).toFixed(1)}x</strong></span>}
          </div>
        )}
      </div>

      {/* This was badged "Placeholder" and its own placeholder text ended
        * "Future: will connect to Google Sheets, GA4, Meta Ads." It is a real
        * input that feeds every AI call on this form — telling the user not to
        * trust it was worse than decoration. It is a finished feature that
        * happens to be manual, and it is now described as one. */}
      <div style={gSc(t)}>
        <div style={{marginBottom:6}}>
          <div style={{...gSL(t),marginBottom:3}}>Supporting data</div>
          <div style={{fontSize:11.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5}}>
            Optional. Anything you paste here is read by Expand and by ICE Assist, so the
            numbers they reason from are yours rather than assumed.
          </div>
        </div>
        <FR label="Metrics for this initiative" t={t}>
          <textarea style={{...gTA(t),fontSize:12}} rows={3} value={dataCtx} onChange={e=>setDataCtx(e.target.value)} placeholder={"e.g. Paid social CVR last 4W: 0.42% vs prior 4W: 1.85%. ROAS 0.24x on $38k spend. Mobile share 71%."}/>
        </FR>
      </div>

      <FR label="Notes" t={t}><textarea style={gTA(t)} rows={2} value={form.notes||""} onChange={e=>f("notes",e.target.value)} placeholder="Sequencing logic, caveats, context"/></FR>

      <LinkedInitiativePicker form={form} setForm={setForm} items={items} t={t} dk={dk}/>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center",paddingTop:4,flexWrap:"wrap"}}>
        {(submitted&&v.blocking)&&(
          <span style={{fontSize:11.5,color:t.red,fontFamily:t.sans,fontWeight:600,marginRight:"auto"}}>
            {v.missing.length} required field{v.missing.length!==1?"s":""} still empty.
          </span>
        )}
        {(submitted&&!v.blocking&&killBlocked)&&(
          <span style={{fontSize:11.5,color:t.red,fontFamily:t.sans,fontWeight:600,marginRight:"auto"}}>
            Kill criteria required to start running.
          </span>
        )}
        <button style={gGh(t)} onClick={onCancel}>Cancel</button>
        <button style={{...gG(t),...((v.blocking||killBlocked)&&submitted?gOff:null)}} onClick={trySave}>Save</button>
      </div>
    </div>
  );
}

// -- Linked Initiative Picker -------------------------------------------------
//
// This was a custom combobox with no keyboard support at all: selection was
// `onMouseDown` only, there were no arrow keys, no combobox/listbox roles and
// no `aria-activedescendant`, and it closed on a 200ms `setTimeout` after blur
// — a timing hack that misfires the moment a click lands slower than that.
//
// The blur timer is replaced by a check of where focus actually went, which is
// the thing the timer was approximating.
function LinkedInitiativePicker({form, setForm, items, t, dk}) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listId = "gos-linked-list";

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

  // Keep the cursor inside the result set as it narrows under typing.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) { setLastQuery(query); setActive(0); }

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown")      { e.preventDefault(); setOpen(true); setActive(i=>Math.min(i+1, candidates.length-1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i=>Math.max(i-1, 0)); }
    else if (e.key === "Enter" && open && candidates[active]) { e.preventDefault(); toggle(candidates[active].id); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}} ref={wrapRef}
      onBlur={e=>{ if(!wrapRef.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <label htmlFor="gos-link-search" style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,width:"fit-content",cursor:"pointer"}}>
        Link related initiatives
      </label>

      {/* Selected chips */}
      {linkedItems.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {linkedItems.map(e=>(
            <span key={e.id} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,padding:"3px 9px",borderRadius:t.r.xs,background:t.tealBg,border:"1px solid "+t.teal,color:t.teal,fontFamily:t.serif}}>
              {e.initId&&<span style={{opacity:0.7}}>{e.initId}</span>}
              {e.title.slice(0,32)}{e.title.length>32?"…":""}
              <button onClick={()=>toggle(e.id)} aria-label={"Unlink "+e.title}
                style={{background:"none",border:"none",color:"inherit",cursor:"pointer",padding:"0 0 0 2px",lineHeight:1,display:"inline-flex"}}>
                <IconClose size={11}/>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{position:"relative"}}>
        <input id="gos-link-search" style={gI(t)} value={query}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open&&candidates[active] ? "gos-linked-opt-"+active : undefined}
          onChange={e=>{setQuery(e.target.value);setOpen(true);}}
          onFocus={()=>setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search by title or ID (e.g. NH-001)…"/>

        {/* Dropdown */}
        {open&&candidates.length>0&&(
          <div id={listId} role="listbox" aria-label="Matching initiatives"
            style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,background:t.surface,border:"1px solid "+t.border,borderRadius:t.r.sm,boxShadow:t.shadowHi,maxHeight:220,overflowY:"auto"}}>
            {candidates.map((e,i)=>{
              const isLinked = linked.includes(e.id);
              const c=(dk?SD:SL)[e.status]||SL.Draft;
              return (
                <div key={e.id} id={"gos-linked-opt-"+i} role="option" aria-selected={isLinked}
                  onMouseMove={()=>setActive(i)} onMouseDown={()=>toggle(e.id)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",
                    background:i===active?t.surfaceAlt:(isLinked?t.tealBg:t.surface),
                    borderBottom:"1px solid "+t.borderSoft}}>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,minWidth:52,flexShrink:0}}>{e.initId||"—"}</span>
                  <span style={{fontSize:12,color:t.text,flex:1,fontFamily:t.serif}}>{e.title.slice(0,50)}{e.title.length>50?"…":""}</span>
                  <span style={{fontSize:10,fontWeight:600,color:c.text,background:c.bg,border:"1px solid "+c.border,borderRadius:t.r.xs,padding:"1px 5px",flexShrink:0}}>{e.status}</span>
                  {isLinked&&<span style={{color:t.teal,display:"inline-flex"}}><IconCheck size={12}/></span>}
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
