import { gG, gGh, gSL, gCd } from "../components/styles.js";
import { interactive, tile } from "../components/motion.js";
import { renderProse } from "../components/text.jsx";
import { fmtCur, fmtDateShort, parseD, iceScore } from "../constants.js";
import { IconCheck } from "../components/icons.jsx";

// -- Triage View --------------------------------------------------------------
//
// This file used to carry local copies of `fmtCur`, `fmtDate`, `parseD` and the
// ICE calculation. They had drifted: the local `fmtCur` had no millions branch,
// so a $2.4M initiative read "$2400k" here and "$2.4M" on the dashboard, and the
// local `fmtDate` dropped the year, so the same end date read "Aug 12" here and
// "Aug 12, 2026" everywhere else. The shared ones are also the only place the
// workspace currency and locale are applied.
export function TriageView({items, t, brands, activeBrand, onDetail, onLogResults, onExtend, onActivate}) {
  const today = new Date();
  const fmtDate = fmtDateShort;
  const brandFilter = e => activeBrand==="all" || (e.brandId||"default")===activeBrand;
  const brandLabel = e => (brands.find(b=>b.id===(e.brandId||"default"))||brands[0]||{}).name||"";
  const iceOf = e => e.ice ? (iceScore(e.ice.impact, e.ice.certainty, e.ice.ease) || 0) : 0;
  const daysFrom = d => { const p=parseD(d); return p?Math.ceil((p-today)/86400000):null; };

  const running = items.filter(e=>e.status==="Running"&&brandFilter(e));
  const draft   = items.filter(e=>e.status==="Draft"&&brandFilter(e));
  const totalAtRisk = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);

  // --- Build a single ranked action queue --------------------------------------
  // Each entry: {id, kind, urgency(0-100), title, brand, reason, metric, money, actions[]}
  // urgency drives ordering; higher = more pressing. Money and time both feed it.
  const queue = [];

  running.forEach(e=>{
    const dleft = daysFrom(e.endDate);
    const money = Math.max(0,e.revenueImpact||0);
    const moneyW = Math.min(40, money/2500); // up to 40 pts from revenue at risk

    // Overdue — past end date, still running: must decide
    if (dleft!==null && dleft<0) {
      queue.push({
        id:e.id, kind:"overdue", urgency:90+moneyW,
        accent:t.red, tag:"OVERDUE", title:e.title, brand:brandLabel(e),
        reason:"Ended "+fmtDate(e.endDate)+" ("+Math.abs(dleft)+"d ago) and is still marked running. Decide the outcome or extend the window.",
        metric:e.primaryMetric, money,
        actions:[
          {label:"Log results", primary:true, fn:()=>onLogResults(e.id)},
          {label:"Extend 2 wks", fn:()=>onExtend(e.id,14)},
        ],
      });
      return;
    }
    // Ending within 3 days: decide now
    if (dleft!==null && dleft<=3) {
      queue.push({
        id:e.id, kind:"ending", urgency:70+moneyW,
        accent:t.warn, tag:dleft===0?"DUE TODAY":"ENDS IN "+dleft+"D", title:e.title, brand:brandLabel(e),
        reason:"Window closes "+fmtDate(e.endDate)+". Prepare to read results, or extend if the test needs more data.",
        metric:e.primaryMetric, money,
        actions:[
          {label:"Log results", primary:true, fn:()=>onLogResults(e.id)},
          {label:"Extend 1 wk", fn:()=>onExtend(e.id,7)},
        ],
      });
      return;
    }
    // Blocked: resolve or escalate
    if (e.blocker && e.blocker!=="None") {
      queue.push({
        id:e.id, kind:"blocked", urgency:55+moneyW,
        accent:t.red, tag:"BLOCKED", title:e.title, brand:brandLabel(e),
        reason:e.blocker+". Resolve the dependency or escalate; it's holding up "+(money>0?fmtCur(money)+" of impact.":"a live initiative."),
        metric:e.primaryMetric, money,
        actions:[],
      });
      return;
    }
    // Incomplete setup: missing the things needed to judge it
    const missing = [];
    if (!e.owner) missing.push("owner");
    if (!e.primaryMetric) missing.push("metric");
    if (!e.killCriteria) missing.push("kill criteria");
    if (missing.length) {
      queue.push({
        id:e.id, kind:"incomplete", urgency:40+moneyW,
        accent:t.textMuted, tag:"NEEDS SETUP", title:e.title, brand:brandLabel(e),
        reason:"Running without "+missing.join(", ")+". Without these it can't be cleanly judged or stopped.",
        metric:e.primaryMetric, money,
        actions:[],
      });
      return;
    }
    // High-stakes healthy runner — keep visible but low urgency
    if (money>=50000) {
      queue.push({
        id:e.id, kind:"highstake", urgency:20+moneyW/4,
        accent:t.gold, tag:"HIGH STAKES", title:e.title, brand:brandLabel(e),
        reason:fmtCur(money)+" of revenue riding on this. On track"+(e.endDate?", ends "+fmtDate(e.endDate)+".":"."),
        metric:e.primaryMetric, money,
        actions:[],
      });
    }
  });

  // Best uninitiated idea — one slot, only if genuinely strong
  const bestDraft = draft.map(e=>({e,ice:iceOf(e)})).filter(x=>x.ice>=40).sort((a,b)=>b.ice-a.ice)[0];
  if (bestDraft) {
    const e=bestDraft.e, money=Math.max(0,e.revenueImpact||0);
    queue.push({
      id:e.id, kind:"activate", urgency:30+(bestDraft.ice/10),
      accent:t.teal, tag:"READY TO ACTIVATE", title:e.title, brand:brandLabel(e),
      reason:"Highest-leverage idea sitting in draft (ICE "+bestDraft.ice+(money>0?", "+fmtCur(money)+" potential":"")+"). Nothing's blocking it from starting.",
      metric:e.primaryMetric, money,
      actions:[
        {label:"Activate now", primary:true, fn:()=>onActivate(e.id)},
      ],
    });
  }

  queue.sort((a,b)=>b.urgency-a.urgency);
  const topItem = queue[0]||null;

  // Stat strip
  const overdueCount = queue.filter(q=>q.kind==="overdue").length;
  const endingCount  = queue.filter(q=>q.kind==="ending").length;

  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>

      {/* Lead banner — the single most pressing call, framed as a decision */}
      <div style={{...gCd(t), borderLeft:"3px solid "+(topItem?topItem.accent:t.teal),
        background: topItem?t.surface:t.tealBg,
        border:"1px solid "+(topItem?t.border:t.teal)}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:topItem?12:4}}>
          <div style={{fontSize:10,letterSpacing:"0.11em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,fontWeight:600}}>
            {today.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}
          </div>
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>
            {renderProse(totalAtRisk>0?fmtCur(totalAtRisk)+" at risk across "+running.length+" running":running.length+" running · "+draft.length+" in draft")}
          </div>
        </div>
        {topItem ? (
          <div>
            <div style={{fontSize:10,fontWeight:600,color:topItem.accent,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>
              Do this first · {topItem.tag}
            </div>
            <div style={{fontSize:16,fontWeight:600,color:t.text,fontFamily:t.sans,lineHeight:1.3,marginBottom:4}}>{topItem.title}</div>
            <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,marginBottom:12}}>{topItem.reason}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {topItem.actions.map((a,i)=>(
                <button key={i} onClick={a.fn} style={a.primary?{...gG(t),fontSize:12.5,padding:"8px 15px"}:{...gGh(t),fontSize:12.5,padding:"8px 14px"}}>{a.label}</button>
              ))}
              <button onClick={()=>onDetail(topItem.id)} style={{...gGh(t),fontSize:12.5,padding:"8px 14px",border:"none",background:"transparent"}}>View detail →</button>
            </div>
          </div>
        ) : (
          <div style={{fontSize:13.5,color:t.teal,fontFamily:t.sans,fontWeight:500}}>
            Queue clear. Nothing needs a decision today. Good week to activate a draft or run the Signal debate.
          </div>
        )}
      </div>

      {/* Stat strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
        {[
          {l:"In the queue", v:queue.length, gold:false},
          {l:"Overdue", v:overdueCount, gold:overdueCount>0},
          {l:"Ending soon", v:endingCount, gold:false},
          {l:"Revenue at risk", v:fmtCur(totalAtRisk), gold:true},
        ].map(m=>(
          <div key={m.l} {...(()=>{const p=tile(t,m.gold?t.goldFill:t.border,queue.length?0:null);return{className:p.className,style:{...p.style,background:t.surface,border:"1px solid "+t.border,borderRadius:12,padding:"13px 15px",boxShadow:t.shadow}};})()}>
            <div style={{fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,fontWeight:600,marginBottom:8}}>{m.l}</div>
            <div style={{fontSize:24,fontWeight:700,color:m.gold?t.gold:t.text,fontFamily:t.mono,letterSpacing:"-0.03em",lineHeight:1}}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* The action queue */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8}}>
          <span style={gSL(t)}>Action queue</span>
          <span style={{fontSize:11,color:t.textMuted,fontFamily:t.sans}}>ranked by urgency · clear each item with a decision</span>
        </div>

        {queue.length===0 && (
          <div style={{...gCd(t),padding:"40px 24px",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:8,color:t.teal}}><IconCheck size={24}/></div>
            <div style={{fontSize:14,fontWeight:600,color:t.text,fontFamily:t.sans,marginBottom:5}}>Nothing in the queue</div>
            <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,maxWidth:360,margin:"0 auto"}}>No running initiatives need a decision and no strong drafts are waiting. Log new metrics or generate a Signal slate to fill the pipeline.</div>
          </div>
        )}

        {/* The rail used to be a permanently painted 3px child, and Triage was
            the only view in the app that had one — which made it read as a
            different product from the pages either side of it. It is now the
            shared hover primitive: inert until you point at the card, then it
            charges downward in the colour of that card's urgency. The urgency
            is still legible at rest from the tag and the ordering; the colour
            is what the pointer buys you. */}
        {queue.map((q,i)=>(
          <div key={q.id+"-"+q.kind} {...(()=>{const p=interactive(t,q.accent,{index:i});return{className:p.className,style:{...gCd(t),...p.style,padding:0,display:"flex"}};})()}>
            <div style={{flex:1,minWidth:0,padding:"13px 16px 13px 19px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,fontWeight:600,color:q.accent,fontFamily:t.serif,letterSpacing:"0.05em"}}>{q.tag}</span>
                    {q.brand&&brands.length>1&&<span style={{fontSize:10.5,color:t.textMuted,fontFamily:t.serif}}>{q.brand}</span>}
                  </div>
                  <button type="button" onClick={()=>onDetail(q.id)} style={{background:"none",border:"none",padding:0,textAlign:"left",font:"inherit",fontSize:14.5,fontWeight:600,color:t.text,fontFamily:t.sans,lineHeight:1.3,cursor:"pointer"}}>{q.title}</button>
                </div>
                {q.money>0 && <span style={{fontSize:16,fontWeight:700,color:t.gold,fontFamily:t.mono,letterSpacing:"-0.02em",flexShrink:0}}>{fmtCur(q.money)}</span>}
              </div>
              <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,marginBottom:11}}>{q.reason}</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                {q.actions.map((a,i)=>(
                  <button key={i} onClick={a.fn} style={a.primary?{...gG(t),fontSize:12,padding:"6px 13px"}:{...gGh(t),fontSize:12,padding:"6px 12px"}}>{a.label}</button>
                ))}
                <button onClick={()=>onDetail(q.id)} style={{...gGh(t),fontSize:12,padding:"6px 12px",border:"none",background:"transparent",color:t.textSub}}>View detail →</button>
                {q.metric&&<span style={{marginLeft:"auto",fontSize:11,color:t.textMuted,fontFamily:t.serif}}>{q.metric.slice(0,42)}{q.metric.length>42?"…":""}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
