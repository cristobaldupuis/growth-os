import { useState } from "react";
import { Modal } from "./Modal.jsx";
import { FR } from "./FR.jsx";
import { gG, gGh, gI } from "./styles.js";
import { DEFAULT_AGENTS, DEFAULT_SETTINGS, brandColor, catColor } from "../constants.js";

// -- Settings ------------------------------------------------------------------
export function SettingsModal({t,dk,settings,onSave,onClose,onDownloadBackup,onRestoreBackup,onResetDemo}) {
  const [local,setLocal]=useState({...settings});
  const [newCat,setNewCat]=useState("");
  const f=(k,v)=>setLocal(p=>({...p,[k]:v}));
  const addCat=()=>{const c=newCat.trim();if(!c||local.categories.includes(c))return;f("categories",[...local.categories,c]);setNewCat("");};
  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title="Settings">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <FR label="Company / workspace name" t={t}><input style={gI(t)} value={local.companyName} onChange={e=>f("companyName",e.target.value)}/></FR>
        <FR label="Business model (one line)" t={t}><input style={gI(t)} value={local.businessModel} onChange={e=>f("businessModel",e.target.value)}/></FR>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>North star metric</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <FR label="Metric name" t={t}><input style={gI(t)} value={local.northStarMetric} onChange={e=>f("northStarMetric",e.target.value)}/></FR>
            <FR label="Current value" t={t}><input style={gI(t)} value={local.northStarCurrent} onChange={e=>f("northStarCurrent",e.target.value)}/></FR>
            <FR label="Target" t={t}><input style={gI(t)} value={local.northStarTarget} onChange={e=>f("northStarTarget",e.target.value)}/></FR>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Categories</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
            {local.categories.map(c=>(
              <span key={c} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600,color:catColor(c,local.categories,dk),background:t.surfaceAlt,border:"1px solid "+(t.border),borderRadius:4,padding:"3px 8px"}}>
                {c}<button onClick={()=>f("categories",local.categories.filter(x=>x!==c))} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",padding:0,fontSize:12,lineHeight:1,opacity:0.6}}>&#215;</button>
              </span>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input style={{...gI(t),flex:1}} value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCat();}} placeholder="New category…"/>
            <button style={gG(t)} onClick={addCat}>Add</button>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Retailers / Partners</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:10}}>
            {(local.brands||[]).map((b,i)=>{
              const upd = (k,v) => { const bs=[...(local.brands||[])]; bs[i]={...bs[i],[k]:v}; setLocal(p=>({...p,brands:bs})); };
              return (
              <div key={b.id} style={{padding:"12px 14px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8}}>
                {/* Name row */}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:brandColor(b.id,local.brands||[],dk),flexShrink:0}}/>
                  <input style={{...gI(t),flex:1,padding:"4px 8px",fontWeight:700}} value={b.name}
                    onChange={e=>upd("name",e.target.value)} placeholder="Retailer / brand name"/>
                  {(local.brands||[]).length>1&&<button onClick={()=>setLocal(p=>({...p,brands:(p.brands||[]).filter((_,j)=>j!==i)}))}
                    style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>&#10005;</button>}
                </div>
                {/* Brief fields */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>WHAT THEY SELL</label>
                    <input style={{...gI(t),fontSize:11}} value={b.whatTheySell||""} onChange={e=>upd("whatTheySell",e.target.value)}
                      placeholder="e.g. Premium home décor, $80–$300 AOV"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>CATEGORIES (comma-separated)</label>
                    <input style={{...gI(t),fontSize:11}} value={b.categories||""} onChange={e=>upd("categories",e.target.value)}
                      placeholder="e.g. Home decor, Gifting, Candles"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>ICP (comma-separated)</label>
                    <input style={{...gI(t),fontSize:11}} value={b.icp||""} onChange={e=>upd("icp",e.target.value)}
                      placeholder="e.g. Women 28–45, gifting buyers, high-intent decorators"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>WHY THEY WIN</label>
                    <input style={{...gI(t),fontSize:11}} value={b.whyTheyWin||""} onChange={e=>upd("whyTheyWin",e.target.value)}
                      placeholder="e.g. Visual brand, strong repeat buyer LTV"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>RELATIONSHIP</label>
                    <input style={{...gI(t),fontSize:11}} value={b.relationship||""} onChange={e=>upd("relationship",e.target.value)}
                      placeholder="e.g. Own DTC brand, wholesale account, marketplace"/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>CURRENT CONSTRAINT</label>
                    <input style={{...gI(t),fontSize:11}} value={b.constraint||""} onChange={e=>upd("constraint",e.target.value)}
                      placeholder="e.g. CAC rising, thin margin on hero SKU"/>
                  </div>
                </div>
              </div>
            );})}
          </div>
          <button onClick={()=>{const newId="brand-"+Date.now();setLocal(p=>({...p,brands:[...(p.brands||[]),{id:newId,name:"New retailer"}]}));}}
            style={{...gGh(t),fontSize:11}}>+ Add retailer</button>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:4,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>C-Suite Debate Agents</div>
          <p style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5,margin:"0 0 10px"}}>
            Customise the agents that participate in the strategy debate. Edit lenses to match your industry (e.g. "Category Manager" for CPG, "Buyer Relations" for retail).
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
            {(local.agents||DEFAULT_AGENTS).map((agent,i)=>(
              <div key={agent.id} style={{padding:"10px 12px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input style={{...gI(t),width:44,textAlign:"center",padding:"4px",fontSize:18,flexShrink:0}}
                    value={agent.icon}
                    onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],icon:e.target.value};setLocal(p=>({...p,agents:a}));}}/>
                  <input style={{...gI(t),flex:"0 0 80px",fontWeight:700}}
                    value={agent.label}
                    onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],label:e.target.value};setLocal(p=>({...p,agents:a}));}}
                    placeholder="Label"/>
                  <div style={{width:20,height:20,borderRadius:"50%",background:agent.color,flexShrink:0,border:"2px solid "+t.border}}/>
                  {(local.agents||DEFAULT_AGENTS).length>2&&(
                    <button onClick={()=>setLocal(p=>({...p,agents:(p.agents||DEFAULT_AGENTS).filter((_,j)=>j!==i)}))}
                      style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px",marginLeft:"auto"}}>✕</button>
                  )}
                </div>
                <input style={gI(t)} value={agent.lens}
                  onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],lens:e.target.value};setLocal(p=>({...p,agents:a}));}}
                  placeholder="Strategic lens (what this exec focuses on)"/>
                <input style={{...gI(t),fontSize:11}} value={agent.blindspot}
                  onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],blindspot:e.target.value};setLocal(p=>({...p,agents:a}));}}
                  placeholder="Known blindspot (keeps the debate honest)"/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{const newA={id:"agent-"+Date.now(),label:"New",icon:"💼",color:"#888888",lens:"",blindspot:""};setLocal(p=>({...p,agents:[...(p.agents||DEFAULT_AGENTS),newA]}));}}
              style={{...gGh(t),fontSize:11}}>+ Add agent</button>
            <button onClick={()=>setLocal(p=>({...p,agents:DEFAULT_AGENTS}))}
              style={{...gGh(t),fontSize:11}}>Reset to defaults</button>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:4,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Health Metrics</div>
          <p style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5,margin:"0 0 10px"}}>
            Portfolio-level guardrail metrics surfaced on the dashboard. Calculated metrics pull from weekly pulse data automatically.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
            {(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).map((metric,idx)=>{
              const updhm=(k,v)=>{const hm=(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).map((m,i)=>i===idx?{...m,[k]:v}:m);setLocal(p=>({...p,healthMetrics:hm}));};
              return (
                <div key={metric.key} style={{padding:"10px 12px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8,opacity:metric.enabled?1:0.55}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button onClick={()=>updhm("enabled",!metric.enabled)}
                      style={{flexShrink:0,width:34,height:20,borderRadius:10,cursor:"pointer",border:"none",
                        background:metric.enabled?t.teal:t.border,position:"relative",transition:"background 0.15s"}}>
                      <span style={{position:"absolute",top:3,left:metric.enabled?16:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.15s"}}/>
                    </button>
                    <input style={{...gI(t),flex:1,fontWeight:600,fontSize:12}} value={metric.label}
                      onChange={e=>updhm("label",e.target.value)} placeholder="Metric label"/>
                    <button onClick={()=>setLocal(p=>({...p,healthMetrics:(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).filter((_,i)=>i!==idx)}))}
                      style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>&#10005;</button>
                  </div>
                  {metric.isCalculated&&(
                    <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5,padding:"5px 8px",background:t.surface,border:"1px solid "+t.borderSoft,borderRadius:4}}>
                      {metric.calculationNote}
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>
                        {metric.isCalculated?"MANUAL FALLBACK":"CURRENT VALUE"}
                      </label>
                      <input style={{...gI(t),fontSize:12}} type="number" step="any"
                        value={metric.manualValue??""} placeholder={metric.isCalculated?"Used if auto-calc unavailable":"Enter current value"}
                        onChange={e=>updhm("manualValue",e.target.value===""?null:parseFloat(e.target.value))}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,display:"block",marginBottom:3,letterSpacing:"0.05em"}}>TARGET (OPTIONAL)</label>
                      <input style={{...gI(t),fontSize:12}} type="number" step="any"
                        value={metric.target??""} placeholder="Target value"
                        onChange={e=>updhm("target",e.target.value===""?null:parseFloat(e.target.value))}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>Direction:</span>
                    {[{v:true,l:"Higher is better"},{v:false,l:"Lower is better"}].map(opt=>(
                      <button key={String(opt.v)} onClick={()=>updhm("higherIsBetter",opt.v)}
                        style={{fontSize:10,padding:"3px 8px",borderRadius:3,cursor:"pointer",fontFamily:t.serif,
                          background:metric.higherIsBetter===opt.v?t.gold:"transparent",
                          border:"1px solid "+(metric.higherIsBetter===opt.v?t.gold:t.border),
                          color:metric.higherIsBetter===opt.v?t.goldText:t.textMuted}}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {(local.healthMetrics||DEFAULT_SETTINGS.healthMetrics).length<8&&(
            <button style={{...gGh(t),fontSize:11}} onClick={()=>{
              const hm=local.healthMetrics||DEFAULT_SETTINGS.healthMetrics;
              if(hm.length>=8)return;
              setLocal(p=>({...p,healthMetrics:[...hm,{key:"metric_"+Date.now(),label:"Custom Metric",enabled:true,isCalculated:false,calculationNote:"",manualValue:null,target:null,higherIsBetter:true}]}));
            }}>+ Add metric</button>
          )}
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Backup &amp; restore</div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.6,margin:"0 0 10px"}}>Download a full snapshot of your data (initiatives, settings, debates, weekly metrics) as a JSON file. Keep a copy somewhere safe. This is the only off-device record until cloud sync ships.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={onDownloadBackup} style={{...gG(t),fontSize:12}}>&#8659; Download backup</button>
            <label style={{...gGh(t),fontSize:12,cursor:"pointer"}}>
              &#8645; Restore from backup
              <input type="file" accept="application/json,.json" style={{display:"none"}}
                onChange={e=>{ const f=e.target.files?.[0]; if(f){onRestoreBackup(f); e.target.value="";} }}/>
            </label>
          </div>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:8,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Demo data</div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.6,margin:"0 0 10px"}}>Reload the built-in demo initiatives and weekly metrics. Replaces all current initiatives and weekly pulse data.</p>
          <button onClick={onResetDemo} style={{...gGh(t),fontSize:12}}>&#8635; Reset to demo data</button>
        </div>
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:700,color:t.textSub,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Data sources</div>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,background:t.border,padding:"2px 6px",borderRadius:3}}>Placeholder · coming soon</span>
          </div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.6,margin:"0 0 8px"}}>Planned: Google Sheets (pulling from GA4, Looker, Meta Ads), BigQuery, direct GA4 and Meta Ads APIs. Paste data manually in the initiative form for now.</p>
          <div style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,padding:"10px 12px",background:t.surfaceAlt,borderRadius:4,border:"1px dashed "+t.border}}>No data sources connected yet.</div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
          <button style={gGh(t)} onClick={onClose}>Cancel</button>
          <button style={gG(t)} onClick={()=>{ onSave(local); }}>Save settings</button>
        </div>
      </div>
    </Modal>
  );
}
