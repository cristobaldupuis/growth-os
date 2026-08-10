import { useMemo, useState } from "react";
import { Modal } from "../components/Modal.jsx";
import { TaxonomyEditor } from "../components/TaxonomyEditor.jsx";
import { FR } from "../components/FR.jsx";
import { gG, gGh, gI, gOff } from "../components/styles.js";
import { IconClose, IconDownload, IconImport, IconRefresh, IconPlus } from "../components/icons.jsx";
import { iconFor, ICON_REGISTRY } from "../components/iconRegistry.js";
import { DEFAULT_AGENTS, DEFAULT_SETTINGS, brandColor, catColor } from "../constants.js";
import { DEMO_MODE } from "../activeConfig.js";
import { WORKSPACE_MODES, resolveWorkspaceMode, isLiveWorkspace } from "../services/dataSafety.js";

// Currencies the shipped formatter is checked against. The list is short on
// purpose — it covers the markets the ICP sells into, and an operator outside
// them is better served by us adding one than by a free-text box that silently
// produces "XYZ 1.4M".
const CURRENCIES = [
  { code:"USD", label:"US dollar (USD)" },
  { code:"CAD", label:"Canadian dollar (CAD)" },
  { code:"GBP", label:"Pound sterling (GBP)" },
  { code:"EUR", label:"Euro (EUR)" },
  { code:"AUD", label:"Australian dollar (AUD)" },
  { code:"NZD", label:"New Zealand dollar (NZD)" },
];
const LOCALES = [
  { code:"en-CA", label:"English (Canada) — Aug 12, 2026" },
  { code:"en-US", label:"English (US) — Aug 12, 2026" },
  { code:"en-GB", label:"English (UK) — 12 Aug 2026" },
  { code:"en-AU", label:"English (Australia) — 12 Aug 2026" },
  { code:"de-DE", label:"German — 12. Aug. 2026" },
  { code:"fr-FR", label:"French — 12 août 2026" },
];

// The sections, in the order an operator meets them. `hint` is what the section
// settles, because a left rail of eight nouns is a filing cabinet and a rail of
// eight questions is navigation.
const SECTIONS = [
  { key:"workspace",  label:"Workspace",   hint:"name, model, currency" },
  { key:"northstar",  label:"North star",  hint:"the metric everything moves" },
  { key:"categories", label:"Categories",  hint:"how work is filed" },
  { key:"brands",     label:"Retailers",   hint:"briefs the AI reads" },
  { key:"naming",     label:"Naming convention", hint:"the ad-name grammar" },
  { key:"agents",     label:"Debate agents",     hint:"who argues in Signal" },
  { key:"health",     label:"Health metrics",    hint:"portfolio guardrails" },
  { key:"data",       label:"Data",        hint:"backup, restore, demo" },
];

// -- Settings ------------------------------------------------------------------
//
// Was a modal: nine sections stacked in a 560px box capped at 88vh, with no
// sub-navigation, no anchors and no search — so reconfiguring five health
// metrics meant scrolling past four unrelated sections inside a
// viewport-constrained window, and a backdrop click threw the lot away.
//
// It is a page now, with the sections down the left, which is the same call
// Stripe and Twilio both made and for the same reason: settings is not a
// question you answer and dismiss, it is a place you go.
//
// The naming convention moved in with it. It is the product's headline
// differentiator and it was living at Performance → Taxonomy, two levels deep
// inside a view named after something else, while the README said the
// convention "lives in settings" — true of the data, and false of the address.
export function SettingsView({t,dk,settings,onSave,onClose,onDownloadBackup,onRestoreBackup,onResetDemo,showToast,initialSection}) {
  const [sec,setSec] = useState(initialSection || "workspace");
  const [local,setLocal]=useState({...settings});
  const [newCat,setNewCat]=useState("");
  const [confirmDiscard,setConfirmDiscard]=useState(false);
  const f=(k,v)=>setLocal(p=>({...p,[k]:v}));
  const addCat=()=>{const c=newCat.trim();if(!c||local.categories.includes(c))return;f("categories",[...local.categories,c]);setNewCat("");};

  // Nine sections of editable state lived in this component and a click on the
  // backdrop threw all of it away without asking — brand briefs, agent lenses,
  // health-metric targets. Reconfiguring five metrics and then mis-clicking the
  // scrim cost ten minutes. Every exit now goes through one guarded path.
  const dirty = useMemo(()=>JSON.stringify(local)!==JSON.stringify(settings),[local,settings]);
  const requestClose = ()=>{ if(dirty) setConfirmDiscard(true); else onClose(); };

  if (confirmDiscard) {
    return (
      <Modal t={t} dk={dk} onClose={()=>setConfirmDiscard(false)} title="Discard settings changes?">
        <div style={{fontSize:13,color:t.textSub,fontFamily:t.serif,lineHeight:1.6,marginBottom:18}}>
          You have unsaved changes to this workspace's settings. Closing now discards them.
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          <button style={gGh(t)} onClick={()=>setConfirmDiscard(false)}>Keep editing</button>
          <button style={gG(t)} onClick={()=>onSave(local)}>Save and close</button>
          <button style={{...gGh(t),color:t.red,borderColor:t.red}} onClick={onClose}>Discard</button>
        </div>
      </Modal>
    );
  }

  return (
    <div style={{padding:"16px 20px",display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}>

      {/* Section rail */}
      <nav aria-label="Settings sections" className="gos-settings-rail"
        style={{width:196,flexShrink:0,position:"sticky",top:70,display:"flex",flexDirection:"column",gap:2}}>
        {SECTIONS.map(x=>{
          const on = sec===x.key;
          return (
            <button key={x.key} onClick={()=>setSec(x.key)} aria-current={on?"page":undefined}
              style={{textAlign:"left",padding:"8px 10px",borderRadius:t.r.sm,cursor:"pointer",
                background:on?t.surface:"transparent",
                border:"1px solid "+(on?t.border:"transparent"),
                boxShadow:on?t.shadow:"none",display:"block",width:"100%"}}>
              <span style={{display:"block",fontSize:13,fontWeight:on?600:500,color:on?t.text:t.textSub,fontFamily:t.sans}}>{x.label}</span>
              <span style={{display:"block",fontSize:10.5,color:on?t.gold:t.textMuted,fontFamily:t.sans,marginTop:1}}>{x.hint}</span>
            </button>
          );
        })}
      </nav>

      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:14}}>
        {sec==="naming" && (
          <TaxonomyEditor t={t} dk={dk} settings={settings} showToast={showToast}
            onSaveSettings={(next)=>{ setLocal(next); onSave(next); }}/>
        )}
        {sec==="workspace" && (<>
        {/* Mode leads the section because it changes what several of the other
            settings mean. It is also the answer to a question nobody could ask
            before: "is this browser holding a client's data?" — which decides
            whether Reset Demo is reachable and how hard the backup reminder
            pushes. See services/dataSafety.js. */}
        <FR label="Workspace mode" t={t}
            hint={(WORKSPACE_MODES.find(m=>m.id===resolveWorkspaceMode(local, DEMO_MODE))||WORKSPACE_MODES[0]).hint}>
          <select style={{...gI(t),cursor:"pointer"}}
            value={resolveWorkspaceMode(local, DEMO_MODE)}
            onChange={e=>f("workspaceMode",e.target.value)}>
            {WORKSPACE_MODES.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </FR>
        {isLiveWorkspace(local, DEMO_MODE) && (
          <div style={{fontSize:12,color:t.textSub,fontFamily:t.serif,lineHeight:1.6,padding:"10px 12px",
                       background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:t.r.sm,marginTop:-6}}>
            This workspace holds aggregates about ad entities — spend, conversions, revenue and the dimensions
            parsed out of a name. It does not hold people. Importers drop any column carrying an email address,
            a phone number, a person's name or a customer id, and report that they did. Everything lives in this
            browser until the Postgres migration lands, so a backup is the only copy.
          </div>
        )}
        <FR label="Company / workspace name" t={t}><input style={gI(t)} value={local.companyName} onChange={e=>f("companyName",e.target.value)}/></FR>
        <FR label="Business model (one line)" t={t}><input style={gI(t)} value={local.businessModel} onChange={e=>f("businessModel",e.target.value)}/></FR>
        {/* Money and dates were hardcoded to a dollar sign and en-CA in four
            separate formatters, in a product whose central artifact is a revenue
            claim a client forwards to their board. */}
        <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <FR label="Currency" t={t} hint="Used everywhere a figure is shown or exported.">
            <select style={{...gI(t),cursor:"pointer"}} value={local.currency||"USD"} onChange={e=>f("currency",e.target.value)}>
              {CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </FR>
          <FR label="Date format" t={t} hint="Also sets thousands separators.">
            <select style={{...gI(t),cursor:"pointer"}} value={local.locale||"en-CA"} onChange={e=>f("locale",e.target.value)}>
              {LOCALES.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </FR>
        </div>
        </>)}
        {sec==="northstar" && (
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>North star metric</div>
          <div className="gos-grid-3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <FR label="Metric name" t={t}><input style={gI(t)} value={local.northStarMetric} onChange={e=>f("northStarMetric",e.target.value)}/></FR>
            <FR label="Current value" t={t}><input style={gI(t)} value={local.northStarCurrent} onChange={e=>f("northStarCurrent",e.target.value)}/></FR>
            <FR label="Target" t={t}><input style={gI(t)} value={local.northStarTarget} onChange={e=>f("northStarTarget",e.target.value)}/></FR>
          </div>
        </div>
        )}
        {sec==="categories" && (
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
        )}
        {sec==="brands" && (
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
                <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
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
            style={gGh(t,"sm")}><IconPlus size={12}/> Add retailer</button>
        </div>
        )}
        {sec==="agents" && (
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:4,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>C-Suite Debate Agents</div>
          <p style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5,margin:"0 0 10px"}}>
            Customise the agents that participate in the strategy debate. Edit lenses to match your industry (e.g. "Category Manager" for CPG, "Buyer Relations" for retail).
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
            {(local.agents||DEFAULT_AGENTS).map((agent,i)=>(
              <div key={agent.id} style={{padding:"10px 12px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:6,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {/* This was a 44px text input whose value was an emoji
                      character — the avatar system was "paste a glyph in a box".
                      It is a list of the icons the app actually ships. */}
                  {(()=>{ const AgentIcon = iconFor(agent.icon); return (
                    <span style={{width:30,height:30,borderRadius:t.r.sm,background:t.surface,border:"1px solid "+t.border,
                      display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:agent.color}}>
                      <AgentIcon size={15}/>
                    </span>
                  ); })()}
                  <select aria-label="Agent icon" style={{...gI(t),width:104,flexShrink:0,cursor:"pointer",fontSize:11}}
                    value={ICON_REGISTRY[agent.icon] ? agent.icon : "briefcase"}
                    onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],icon:e.target.value};setLocal(p=>({...p,agents:a}));}}>
                    {Object.keys(ICON_REGISTRY).map(k=><option key={k} value={k}>{k}</option>)}
                  </select>
                  <input style={{...gI(t),flex:"0 0 80px",fontWeight:700}}
                    value={agent.label}
                    onChange={e=>{const a=[...(local.agents||DEFAULT_AGENTS)];a[i]={...a[i],label:e.target.value};setLocal(p=>({...p,agents:a}));}}
                    placeholder="Label"/>
                  <div style={{width:20,height:20,borderRadius:"50%",background:agent.color,flexShrink:0,border:"2px solid "+t.border}}/>
                  {(local.agents||DEFAULT_AGENTS).length>2&&(
                    <button onClick={()=>setLocal(p=>({...p,agents:(p.agents||DEFAULT_AGENTS).filter((_,j)=>j!==i)}))}
                      style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",padding:"0 4px",marginLeft:"auto",display:"inline-flex"}} aria-label="Remove agent"><IconClose size={13}/></button>
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
            <button onClick={()=>{const newA={id:"agent-"+Date.now(),label:"New",icon:"briefcase",color:"#888888",lens:"",blindspot:""};setLocal(p=>({...p,agents:[...(p.agents||DEFAULT_AGENTS),newA]}));}}
              style={gGh(t,"sm")}><IconPlus size={12}/> Add agent</button>
            <button onClick={()=>setLocal(p=>({...p,agents:DEFAULT_AGENTS}))}
              style={gGh(t,"sm")}>Reset to defaults</button>
          </div>
        </div>
        )}
        {sec==="health" && (
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
                      role="switch" aria-checked={metric.enabled}
                      aria-label={(metric.enabled?"Disable ":"Enable ")+(metric.label||"metric")}
                      style={{flexShrink:0,width:34,height:20,borderRadius:t.r.pill,cursor:"pointer",border:"none",
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
                  <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
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
            <button style={gGh(t,"sm")} onClick={()=>{
              const hm=local.healthMetrics||DEFAULT_SETTINGS.healthMetrics;
              if(hm.length>=8)return;
              setLocal(p=>({...p,healthMetrics:[...hm,{key:"metric_"+Date.now(),label:"Custom Metric",enabled:true,isCalculated:false,calculationNote:"",manualValue:null,target:null,higherIsBetter:true}]}));
            }}>+ Add metric</button>
          )}
        </div>
        )}
        {sec==="data" && (
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:10,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Backup &amp; restore</div>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.6,margin:"0 0 10px"}}>Download a full snapshot of your data (initiatives, settings, debates, weekly metrics) as a JSON file. Keep a copy somewhere safe. This is the only off-device record until cloud sync ships.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={onDownloadBackup} style={gG(t)}><IconDownload size={13}/> Download backup</button>
            <label style={{...gGh(t),cursor:"pointer"}}>
              <IconImport size={13}/> Restore from backup
              <input type="file" accept="application/json,.json" style={{display:"none"}}
                onChange={e=>{ const f=e.target.files?.[0]; if(f){onRestoreBackup(f); e.target.value="";} }}/>
            </label>
          </div>
        </div>
        )}
        {sec==="data" && (
        <div style={{borderTop:"1px solid "+t.border,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textSub,marginBottom:8,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>Demo data</div>
          {/* Unreachable in a live workspace rather than confirmable. A dialog is
              the right guard for a destructive action whose target the operator
              can see; this one replaces a client's entire portfolio with a
              seeded one, and the correct number of clicks between a live
              workspace and that outcome is none. */}
          {isLiveWorkspace(local, DEMO_MODE) ? (
            <p style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.6,margin:0}}>
              Not available in a live workspace — reseeding would replace this client&apos;s portfolio with the
              demonstration one. Switch the workspace mode above if this browser is genuinely a demo.
            </p>
          ) : (<>
            <p style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.6,margin:"0 0 10px"}}>Reload the built-in demo initiatives and weekly metrics. Replaces all current initiatives and weekly pulse data.</p>
            <button onClick={onResetDemo} style={gGh(t)}><IconRefresh size={13}/> Reset to demo data</button>
          </>)}
        </div>
        )}
        {/* A "Data sources" section badged "Placeholder · coming soon", whose
            content was a roadmap paragraph and an empty state reading "No data
            sources connected yet", used to sit here. Roadmap honesty belongs in
            the README; inside a client-facing tool an empty section is not a
            plan, it is a gap. It comes back when there is something to connect.
            See ROADMAP Phase 2. */}
        {/* The taxonomy editor writes through on every edit, so the save bar
          * would be lying if it appeared there. Every other section is a draft
          * until saved. */}
        {sec!=="naming" && (
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center",paddingTop:4,
            position:"sticky",bottom:0,background:t.bg,paddingBottom:12,borderTop:"1px solid "+t.borderSoft,marginTop:4}}>
            {dirty
              ? <span style={{marginRight:"auto",fontSize:11,color:t.warn,fontFamily:t.mono}}>unsaved changes</span>
              : <span style={{marginRight:"auto",fontSize:11,color:t.textMuted,fontFamily:t.mono}}>saved</span>}
            <button style={gGh(t)} onClick={requestClose}>{dirty?"Discard":"Close"}</button>
            <button style={{...gG(t),...(dirty?null:gOff)}} disabled={!dirty} onClick={()=>{ onSave(local); }}>Save settings</button>
          </div>
        )}
      </div>
    </div>
  );
}
