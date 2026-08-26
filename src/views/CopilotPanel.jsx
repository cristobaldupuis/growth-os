import { useState, useMemo, useEffect, useRef } from "react";
import { gG, gGh, gI, gTA, gSc } from "../components/styles.js";
import { useDialog } from "../components/useDialog.js";
import { iconFor } from "../components/iconRegistry.js";
import { IconSparkle, IconClose, IconBrain, IconArchive, IconWrench, IconChart, IconCheck, IconEdit, IconChevronDown } from "../components/icons.jsx";
import { CBdg, TBdg } from "../components/badges.jsx";
import { buildPortfolioTools, buildPortfolioContext } from "../services/portfolio.js";
import { startDebate, watchDebate, sweepDebates, buildSnapshot } from "../services/ai/debateClient.js";
import { unwrap } from "../services/ai/schemas.js";
import { iceScore, iceColor } from "../constants.js";
import {
  mkDebateRun, fromServerRun, isResumable, statusLabel, DONE, RUNNING,
} from "../services/debateRun.js";

// -- Agentic Debate Panel v2 ---------------------------------------------------
const MAX_TURNS = 8;
const _TOOL_LABEL = {
  get_portfolio_summary:     "reading portfolio summary",
  get_running_initiatives:   "checking running initiatives",
  get_category_coverage:     "analysing category coverage",
  get_win_rate_by_category:  "pulling win rates by category",
  get_top_draft_opportunities:"scanning draft pipeline",
  get_failure_patterns:      "reviewing failure patterns",
  get_blocked_initiatives:   "checking blocked initiatives",
  get_revenue_gap_analysis:  "running revenue gap analysis",
};

function IdeaCard({idea, idx, results, setResults, added, onAdd, t, dk, cats, agents}) {
  const [isEditing, setEditing] = useState(false);
  // Both of these used to be reimplemented here, and the colour thresholds had
  // already drifted from the shared ones. Use the single definition instead.
  const iceS = ice => iceScore(ice && ice.impact, ice && ice.certainty, ice && ice.ease);
  const iceC = s => iceColor(s, t);
  const score = iceS(idea.ice);
  const isAdded = added[idx];
  const champAgent = agents.find(a => idea.championedBy?.toLowerCase().includes(a.label.toLowerCase()));
  const dissentAgent = agents.find(a => idea.dissentVoice?.toLowerCase().includes(a.label.toLowerCase()));

  return (
    <div style={{background:t.surface,border:"1px solid "+(isAdded?t.gold:t.border),borderRadius:8,
      overflow:"hidden",boxShadow:"0 2px 16px rgba(0,0,0,0.07)",opacity:isAdded?0.7:1,transition:"opacity 0.2s,border-color 0.2s"}}>
      <div style={{height:3,background:champAgent?champAgent.color:t.gold}}/>
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:6}}>
              <CBdg cat={idea.category||cats[0]} cats={cats} dk={dk} t={t}/>
              <TBdg type={idea.initType||"A/B Test"} dk={dk} t={t}/>
              <span style={{fontSize:10,fontWeight:600,color:t.textMuted,fontFamily:t.serif,
                background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:3,padding:"1px 6px"}}>AI · Net New</span>
            </div>
            {isEditing
              ? <input style={{...gI(t),fontSize:14,fontWeight:700}} value={idea.title} autoFocus
                  onChange={e=>{const r=[...results];r[idx]={...r[idx],title:e.target.value};setResults(r);}}/>
              : <div style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif,lineHeight:1.35,cursor:"text"}}
                  onClick={()=>setEditing(true)}>{idea.title}</div>}
          </div>
          {score!==null&&(
            <div style={{textAlign:"center",flexShrink:0,paddingLeft:12,borderLeft:"1px solid "+t.border}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>ICE</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:t.mono,color:iceC(score),lineHeight:1}}>{score}</div>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono}}>/100</div>
            </div>
          )}
        </div>

        {/* Champion + Dissent */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {idea.championedBy&&(
            <div style={{padding:"7px 10px",background:champAgent?champAgent.color+"18":t.goldBg,
              border:"1px solid "+(champAgent?champAgent.color+"50":t.goldBorder),borderRadius:5}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
                {champAgent&&(()=>{const A=iconFor(champAgent.icon);return <span style={{color:champAgent.color,display:"inline-flex"}}><A size={11}/></span>;})()}
                Championed by</div>
              <div style={{fontSize:11,color:t.textSub,fontFamily:t.serif,lineHeight:1.5}}>{idea.championedBy}</div>
            </div>
          )}
          {idea.dissentVoice&&(
            <div style={{padding:"7px 10px",background:t.redBg,border:"1px solid "+(t.red),borderRadius:5}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
                {dissentAgent&&(()=>{const A=iconFor(dissentAgent.icon);return <span style={{color:dissentAgent.color,display:"inline-flex"}}><A size={11}/></span>;})()}
                Risk / Dissent</div>
              <div style={{fontSize:11,color:t.red,fontFamily:t.serif,lineHeight:1.5}}>{idea.dissentVoice}</div>
            </div>
          )}
        </div>

        {idea.csoRationale&&(
          <div style={{padding:"8px 12px",background:t.surfaceAlt,border:"1px solid "+(t.border),borderRadius:5}}>
            <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>CSO · Why we proceed</div>
            <div style={{fontSize:11,color:t.textSub,fontFamily:t.serif,lineHeight:1.5,fontWeight:600}}>{idea.csoRationale}</div>
          </div>
        )}

        {idea.whyNotAlreadyRunning&&(
          <div style={{padding:"7px 10px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:5,fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5}}>
            <strong style={{color:t.textSub}}>Gap reason: </strong>{idea.whyNotAlreadyRunning}
          </div>
        )}

        {/* Hypothesis framework */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {idea.observation&&(
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>Observation</div>
              {isEditing
                ? <textarea style={{...gTA(t),fontSize:12}} rows={2} value={idea.observation}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],observation:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.observation}</p>}
            </div>
          )}
          {idea.hypothesis&&(
            <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:10}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>Hypothesis</div>
              {isEditing
                ? <textarea style={{...gTA(t),fontSize:12}} rows={3} value={idea.hypothesis}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],hypothesis:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,fontWeight:600,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.hypothesis}</p>}
            </div>
          )}
          {idea.successMetric&&(
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>Success metric</div>
              {isEditing
                ? <input style={{...gI(t),fontSize:12}} value={idea.successMetric}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],successMetric:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.successMetric}</p>}
            </div>
          )}
        </div>

        {/* ICE breakdown */}
        {idea.ice&&(
          <div style={{display:"flex",gap:10,padding:"8px 10px",background:t.surfaceAlt,borderRadius:5,border:"1px solid "+t.border}}>
            {[["Impact",idea.ice.impact],["Certainty",idea.ice.certainty],["Ease",idea.ice.ease]].map(([l,v])=>(
              <div key={l} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{l}</div>
                <div style={{fontSize:16,fontWeight:700,color:t.text,fontFamily:t.mono}}>{v}<span style={{fontSize:9,color:t.textMuted}}>/10</span></div>
              </div>
            ))}
            <div style={{flex:1,textAlign:"center",borderLeft:"1px solid "+t.border}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Score</div>
              <div style={{fontSize:16,fontWeight:700,fontFamily:t.mono,color:iceC(score)}}>{score||"—"}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:6}}>
          {isAdded ? (
            <div style={{flex:1,padding:"7px 12px",borderRadius:5,background:t.goldBg,border:"1px solid "+t.goldBorder,
              fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.serif,textAlign:"center"}}>Added to Growth Backlog</div>
          ) : (
            <>
              <button onClick={()=>onAdd(idea,idx)} style={{...gG(t),flex:1,justifyContent:"center",fontSize:12,padding:"8px 12px",}}>
                + Add to Growth Backlog
              </button>
              <button onClick={()=>setEditing(!isEditing)} style={{...gGh(t),fontSize:11,padding:"8px 11px"}}>
                {isEditing?<><IconCheck size={11}/> Done</>:<><IconEdit size={11}/> Edit</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CopilotPanel({t, dk, settings, cats, brands, items, activeBrand, agents, debates, weeklyMetrics, onSaveDebate, onAddToBacklog, onClose}) {
  const [tab,        setTab]       = useState("debate"); // debate | history
  const [context,    setContext]   = useState("");

  // A debate this browser started that is still running on the server. Resolved
  // once, at mount, from the local History mirror — which is why reopening the app
  // mid-debate lands straight back in it rather than on an empty input form.
  // Lazy-initialised so it is computed exactly once and the state below can be
  // derived from it, rather than corrected by an effect after first paint.
  const [initialLive] = useState(
    () => (debates || []).find(d => d.serverRunId && d.status === RUNNING) || null,
  );
  const [running,    setRunning]   = useState(!!initialLive);
  const [transcript, setTranscript]= useState([]);
  const [activeAgent,setActiveAgent]=useState(null); // {label, icon, color, toolsUsed}
  const [modNote,    setModNote]   = useState("");   // moderator's reasoning shown briefly
  const [results,    setResults]   = useState(null);
  const [error,      setError]     = useState("");
  const [added,      setAdded]     = useState({});
  const [phase,      setPhase]     = useState(initialLive ? "debating" : "input");
  const [turnCount,  setTurnCount] = useState(0);

  // Detach handle for the poller. A ref rather than state because changing it
  // must never re-render, and because the cleanup path has to see the latest one.
  const detach = useRef(null);

  // Display only. The server derives its own copy from the snapshot it is sent —
  // this is here so the operator can read what the agents will read BEFORE
  // spending anything, which is the whole purpose of the disclosure below.
  const portfolioCtx = useMemo(
    () => buildPortfolioContext(items, settings, brands, activeBrand, weeklyMetrics),
    [items, settings, brands, activeBrand, weeklyMetrics],
  );

  /** Saved runs with a transcript but no synthesis — finishable in one call. */
  const unfinished = useMemo(() => (debates || []).filter(isResumable), [debates]);

  // Build a smart default context from live portfolio data when panel opens
  const smartDefaultContext = useMemo(() => {
    const tools = buildPortfolioTools(items, settings, brands, activeBrand);
    const summary = tools.execute("get_portfolio_summary");
    const blocked = tools.execute("get_blocked_initiatives");
    const coverage = tools.execute("get_category_coverage");
    const gapCats = coverage.filter(c=>c.running===0&&c.draft===0).map(c=>c.category);

    const parts = [];
    if(summary.running>0) parts.push(`${summary.running} initiatives running, ${summary.draft} in draft`);
    if(summary.revenue_at_risk&&summary.revenue_at_risk!=="$0") parts.push(`${summary.revenue_at_risk} revenue at risk`);
    if(summary.north_star?.current&&summary.north_star?.target) parts.push(`north star: ${summary.north_star.current} → ${summary.north_star.target}`);
    if(blocked.length>0) parts.push(`${blocked.length} blocked initiative${blocked.length!==1?"s":""}`);
    if(gapCats.length>0) parts.push(`no coverage in: ${gapCats.slice(0,3).join(", ")}`);

    if(parts.length===0) return "";
    return "Portfolio snapshot: "+parts.join(" · ")+". What should we prioritise next?";
  }, [items, settings, brands, activeBrand]);

  // -- Running a debate --------------------------------------------------------
  //
  // This panel does not run the debate. It starts one and watches it.
  //
  // The loop used to live here, and that made the page load-bearing: closing the
  // tab killed the run mid-argument. Saving every turn made that non-destructive,
  // but "you can pick it up afterwards" is a weaker promise than "it kept going",
  // and the work is the same either way — so the loop moved to api/debate.js,
  // where it advances one model call per serverless invocation and chains itself
  // along. See supabase/migrations/0004_debate_runs.sql for the state model.
  //
  // What is left here is a `start` call carrying a portfolio snapshot, and a
  // poller. Neither is load-bearing: `watchDebate` returns a detach function, and
  // detaching is explicitly not cancelling. Close the panel, close the tab, close
  // the laptop — the run is on the server and keeps going, and reopening the app
  // reattaches to it.

  /** Mirror a server run into the panel's own state and the local History store. */
  const applyRun = (run) => {
    if (!run) return;
    setTranscript(run.transcript || []);
    setTurnCount(run.turn_index || (run.transcript || []).length);
    setModNote(run.note || "");
    // The agent mid-turn, so the "querying portfolio data" indicator still has
    // something to name while a step is in flight.
    setActiveAgent(run.status === "running" && run.phase === "agent_turn" ? run.current_agent : null);

    // History is still the browser's, so a finished run is mirrored into it and
    // stays readable offline. `fromServerRun` keeps the shape debateRun.js already
    // defines, so nothing downstream needs to know where a run executed.
    onSaveDebate(fromServerRun(run));

    if (run.status === "done") {
      setResults(unwrap(run.results));
      setPhase("done");
      setRunning(false);
    } else if (run.status === "failed") {
      const kept = (run.transcript || []).length;
      setError(
        "Debate stopped: " + (run.error || "the AI request failed.") +
        (kept >= 2 ? ` The ${kept} turns already completed are saved in History.` : "")
      );
      setPhase("input");
      setRunning(false);
    } else {
      setPhase(run.phase === "synthesis" ? "synthesising" : "debating");
    }
  };

  /** Attach to a run and mirror it until it finishes. Detaching never cancels. */
  const watch = (runId) => {
    if (detach.current) detach.current();
    detach.current = watchDebate(runId, applyRun);
  };

  // Reattach to a run that is still going, on mount. This is what makes reopening
  // the app after closing it look like nothing happened — the debate has been
  // running the whole time and the panel simply finds it again.
  useEffect(() => {
    if (initialLive) watch(initialLive.serverRunId);
    // Detach on unmount. The run continues; only the watcher stops.
    return () => { if (detach.current) detach.current(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDebate = async () => {
    setRunning(true); setError(""); setTranscript([]); setResults(null);
    setAdded({}); setPhase("debating"); setTurnCount(0); setModNote("");
    try {
      const runId = await startDebate({
        snapshot: buildSnapshot({ items, settings, brands, activeBrand, weeklyMetrics, cats }),
        context, agents, maxTurns: MAX_TURNS,
      });
      // Recorded locally the moment the server accepts it, so a run is findable
      // from this browser even if the very next thing that happens is a reload.
      onSaveDebate(mkDebateRun({ context, agents, maxTurns: MAX_TURNS, serverRunId: runId }));
      watch(runId);
    } catch (e) {
      setError("Could not start the debate: " + (e.message || "the service is unavailable."));
      setPhase("input");
      setRunning(false);
    }
  };

  /**
   * Reattach to a run recorded in History.
   *
   * For a run still going this is just "show me that again". For one that failed
   * before synthesis there is nothing to reattach to, so it starts a fresh run
   * seeded with the same context — the transcript is kept either way, and the
   * server is where a retry belongs now.
   */
  const resumeDebate = async (run) => {
    setTab("debate");
    setError(""); setAdded({}); setResults(null);
    setTranscript(run.transcript || []);
    setTurnCount(run.turnCount || (run.transcript || []).length);
    if (run.serverRunId) {
      setRunning(true);
      setPhase("debating");
      watch(run.serverRunId);
      // A stalled chain is repaired by asking; the lease means a run somebody
      // already holds is skipped rather than double-stepped.
      sweepDebates();
    } else {
      setError("This debate ran in an older version that executed in the browser, so there is nothing on the server to resume. Its transcript is kept below.");
      setPhase("input");
    }
  };

  const handleAdd = (idea, idx) => {
    onAddToBacklog(idea);
    setAdded(prev => ({...prev, [idx]: true}));
  };

  const resetDebate = () => {
    setPhase("input"); setTranscript([]); setResults(null);
    setAdded({}); setTurnCount(0); setModNote(""); setError("");
  };

  // Escape closes the panel, including mid-debate.
  //
  // It used to be deliberately inert while a debate was running, because closing
  // threw away a multi-turn call nothing had saved. That is no longer true: the
  // run loop holds its own record and writes after every turn, so closing the
  // panel costs nothing — the debate carries on and the turns keep landing in
  // History. Making Escape work again is the visible half of that fix.
  const panelRef = useDialog({ onClose });

  return (
    <div style={{position:"fixed",inset:0,zIndex:400,display:"flex"}}>
      <div style={{flex:1,background:"rgba(10,10,8,0.5)"}} onClick={!running?onClose:undefined}/>

      {/* Width was `Math.min(600, window.innerWidth-16)` read once at render,
          with no resize listener, so it never responded to a rotation. CSS does
          this without needing to know the viewport. */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Signal — C-suite debate" tabIndex={-1}
        style={{width:"min(600px, calc(100vw - 16px))",background:t.surface,
        borderLeft:"1px solid "+t.border,display:"flex",flexDirection:"column",
        height:"100vh",boxShadow:"-8px 0 48px rgba(0,0,0,0.22)",outline:"none"}}>

        {/* Header */}
        <div style={{padding:"13px 20px",borderBottom:"1px solid "+t.border,background:t.goldBg,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:7,fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif}}><IconSparkle size={15}/> Signal AI</div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:2}}>
                Agents query your live portfolio · Moderator routes the debate · 3 net-new initiatives
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {agents.map(a=>(
                <div key={a.id} title={a.label} aria-label={a.label}
                  style={{width:26,height:26,borderRadius:"50%",
                  display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.3s",
                  color:activeAgent?.id===a.id?a.color:t.textMuted,
                  background:activeAgent?.id===a.id?a.color+"25":t.surfaceAlt,
                  border:"1px solid "+(activeAgent?.id===a.id?a.color:t.border),
                  boxShadow:activeAgent?.id===a.id?"0 0 8px "+a.color+"60":"none"}}>
                  {(()=>{const A=iconFor(a.icon);return <A size={13}/>;})()}
                </div>
              ))}
              {!running&&<button onClick={onClose} aria-label="Close Signal" style={{background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",padding:"2px 4px",lineHeight:1,marginLeft:4,display:"inline-flex"}}><IconClose size={16}/></button>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:4,marginTop:10}}>
            {[["debate",<><IconBrain size={12}/> Debate</>],["history",<><IconArchive size={12}/> Past debates ({debates.length})</>]].map(([v,l])=>(
              <button key={v} onClick={()=>setTab(v)} aria-pressed={tab===v} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,padding:"4px 11px",borderRadius:t.r.xs,cursor:"pointer",
                fontFamily:t.serif,fontWeight:600,
                background:tab===v?t.gold:"transparent",border:"1px solid "+(tab===v?t.gold:t.border),
                color:tab===v?t.goldText:t.textMuted}}>{l}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>

          {/* ── DEBATE TAB ── */}
          {tab==="debate"&&<>

            {/* Context input */}
            <div>
              <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,marginBottom:5}}>
                Situation context <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional, sharper with context)</span>
              </div>
              <textarea style={{...gTA(t),fontSize:12,minHeight:68,opacity:running?0.6:1}}
                disabled={running} value={context}
                onChange={e=>setContext(e.target.value)}
                onFocus={()=>{ if(!context && smartDefaultContext) setContext(smartDefaultContext); }}
                placeholder={smartDefaultContext || "What should the C-Suite know right now?\n• Black Friday is 8 weeks out\n• Gross margin compressed 4pts this quarter\n• A competitor just launched a subscription tier"}/>
            </div>

            {/* Portfolio snapshot — collapsible */}
            <details style={{...gSc(t),background:t.surfaceAlt}}>
              <summary style={{fontSize:11,fontWeight:600,color:t.textSub,fontFamily:t.serif,cursor:"pointer",listStyle:"none",display:"flex",justifyContent:"space-between"}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:6}}><IconChart size={12}/> Portfolio the agents will read</span>
                <span style={{color:t.textMuted,display:"inline-flex"}}><IconChevronDown size={12}/></span>
              </summary>
              <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.7,whiteSpace:"pre-wrap",marginTop:10,maxHeight:200,overflowY:"auto"}}>
                {portfolioCtx}
              </div>
              <div style={{marginTop:8,fontSize:10,color:t.textMuted,fontFamily:t.serif,padding:"6px 8px",background:t.surface,borderRadius:4,border:"1px solid "+t.border}}>
                Agents also have 8 live tools to query deeper: win rates, blocked items, coverage gaps, failure patterns, revenue gaps…
              </div>
            </details>

            {/* An unfinished debate is worth surfacing here rather than only in
                History, because this is the screen where someone is about to
                spend twenty-five calls on a new one. Finishing the old one costs
                a single synthesis call against a transcript already paid for. */}
            {phase==="input"&&unfinished.length>0&&(
              <div style={{padding:"10px 14px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:6,
                display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.serif}}>
                  {unfinished.length===1?"A debate was never finished":`${unfinished.length} debates were never finished`}
                </div>
                <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.6}}>
                  The transcript{unfinished.length===1?" is":"s are"} saved. Synthesising costs one call — running a fresh debate costs the lot.
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {unfinished.slice(0,3).map(d=>(
                    <button key={d.id} onClick={()=>resumeDebate(d)} disabled={running}
                      style={{...gGh(t),fontSize:11,padding:"5px 10px"}}>
                      Finish {new Date(d.date).toLocaleDateString(undefined,{month:"short",day:"numeric"})} · {d.transcript?.length||0} turns
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Launch */}
            {phase==="input"&&(
              <button onClick={runDebate} style={{...gG(t,"lg"),width:"100%"}}>
                <IconBrain size={15}/> Start C-Suite debate
              </button>
            )}

            {error&&(
              <div style={{padding:"10px 14px",background:t.redBg,border:"1px solid "+(t.red),borderRadius:6,fontSize:12,fontFamily:t.serif,color:t.red}}>
                {error}
              </div>
            )}

            {/* Live transcript */}
            {transcript.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,display:"flex",justifyContent:"space-between"}}>
                  <span>Debate transcript</span>
                  <span>{turnCount}/{MAX_TURNS} turns</span>
                </div>

                {transcript.map((msg,i)=>(
                  <div key={i} style={{paddingLeft:12,paddingTop:7,paddingBottom:7,
                    background:t.surfaceAlt,borderRadius:"0 6px 6px 0",
                    border:"1px solid "+t.border,borderLeft:"3px solid "+msg.color}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{color:msg.color,display:"inline-flex"}}>{(()=>{const A=iconFor(msg.icon);return <A size={13}/>;})()}</span>
                      <span style={{fontSize:11,fontWeight:600,color:msg.color,fontFamily:t.serif,letterSpacing:"0.04em"}}>{msg.label}</span>
                      {msg.toolsUsed&&msg.toolsUsed.length>0&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {msg.toolsUsed.map(tool=>(
                            <span key={tool} style={{fontSize:9,color:t.textMuted,fontFamily:t.serif,background:t.surface,
                              border:"1px solid "+t.border,borderRadius:3,padding:"1px 5px"}}>
                              <IconWrench size={10}/> {tool.replace("get_","").replace(/_/g," ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.7,fontFamily:t.serif}}>{msg.text}</p>
                  </div>
                ))}

                {/* Moderator note */}
                {modNote&&!running&&phase==="debating"&&(
                  <div style={{padding:"6px 10px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:5,
                    fontSize:11,color:t.warn,fontFamily:t.serif,display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontWeight:700}}>Moderator:</span> {modNote}
                  </div>
                )}

                {/* Active agent typing */}
                {running&&activeAgent&&phase==="debating"&&(
                  <div style={{borderLeft:"3px solid "+activeAgent.color,paddingLeft:12,paddingTop:8,paddingBottom:8,
                    background:t.surfaceAlt,borderRadius:"0 6px 6px 0",border:"1px solid "+t.border}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:activeAgent.color,display:"inline-flex"}}>{(()=>{const A=iconFor(activeAgent.icon);return <A size={13}/>;})()}</span>
                      <span style={{fontSize:11,fontWeight:600,color:activeAgent.color,fontFamily:t.serif}}>{activeAgent.label}</span>
                      <span style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>
                        <span style={{display:"inline-block",animation:"spin 1.2s linear infinite"}}>⟳</span> querying portfolio data…
                      </span>
                    </div>
                  </div>
                )}
                {running&&phase==="synthesising"&&(
                  <div style={{padding:"12px 16px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:6,
                    display:"flex",alignItems:"center",gap:8}}>
                    <span style={{display:"inline-block",animation:"spin 1.2s linear infinite",fontSize:14}}>⟳</span>
                    <span style={{fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.serif}}>CSO synthesizing debate → 3 net-new initiatives…</span>
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {results&&phase==="done"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{padding:"11px 14px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:6}}>
                  <div style={{fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.serif,marginBottom:2}}>
                    {results.length} net-new initiatives · {turnCount} agent turns · {transcript.reduce((s,m)=>s+(m.toolsUsed?.length||0),0)} tool calls
                  </div>
                  <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>
                    Not currently running. Review, edit, then add to your Growth Backlog.
                  </div>
                </div>
                {results.map((idea,idx)=>(
                  <IdeaCard key={idx} idea={idea} idx={idx} results={results} setResults={setResults}
                    added={added} onAdd={handleAdd} t={t} dk={dk} cats={cats} agents={agents}/>
                ))}
                <button onClick={resetDebate} style={{...gGh(t),justifyContent:"center",fontSize:12}}>
                  ⟳ Run a new debate
                </button>
              </div>
            )}

            {/* Empty state */}
            {phase==="input"&&transcript.length===0&&(
              <div style={{padding:"28px 16px",textAlign:"center",border:"1px dashed "+t.border,borderRadius:8}}>
                <div style={{display:"flex",justifyContent:"center",marginBottom:10,color:t.textMuted}}><IconBrain size={26}/></div>
                <div style={{fontSize:13,fontWeight:600,color:t.text,fontFamily:t.serif,marginBottom:8}}>Autonomous C-Suite debate</div>
                <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {agents.map(a=>(
                    <span key={a.id} style={{fontSize:11,padding:"4px 10px",borderRadius:4,fontFamily:t.serif,fontWeight:600,
                      color:a.color,background:a.color+"15",border:"1px solid "+a.color+"30"}}>
                      {a.label}
                    </span>
                  ))}
                </div>
                <div style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,lineHeight:1.8,maxWidth:380,margin:"0 auto"}}>
                  Each exec has 8 live tools to query your portfolio data (win rates, blocked initiatives, coverage gaps, failure patterns, revenue gaps) before forming opinions.
                  A Moderator routes the debate dynamically. The CSO synthesizes into 3 net-new initiatives with champion and dissenting voice.
                  <br/><br/>
                  <strong style={{color:t.textSub}}>Add situation context above for sharper results.</strong>
                  <br/>Use Signal AI to analyse your portfolio.
                </div>
              </div>
            )}
          </>}

          {/* ── HISTORY TAB ── */}
          {tab==="history"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {debates.length===0?(
                <div style={{padding:"32px 16px",textAlign:"center",border:"1px dashed "+t.border,borderRadius:8,color:t.textMuted,fontFamily:t.serif,fontSize:12}}>
                  No saved debates yet. Run your first debate and it will appear here.
                </div>
              ):debates.map((d)=>(
                <div key={d.id} style={{...gSc(t)}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:t.text,fontFamily:t.serif}}>
                        {new Date(d.date).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                      </div>
                      <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:2}}>
                        {d.turnCount||d.transcript?.length||0} turns · {statusLabel(d)}
                        {d.context&&<span> · "{d.context.slice(0,50)}{d.context.length>50?"…":""}"</span>}
                      </div>
                      {/* Why it stopped, kept on the record rather than only in a
                          toast that is long gone by the time anyone looks here. */}
                      {d.error&&d.status!==DONE&&(
                        <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:3,fontStyle:"italic"}}>
                          {d.error}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {/* An unfinished debate is the case this whole record type
                          exists for: the turns are bought and saved, and only the
                          synthesis is missing. Finishing it costs one call instead
                          of the twenty-five that produced the transcript. */}
                      {isResumable(d)&&!running&&(
                        <button onClick={()=>resumeDebate(d)}
                          title="Synthesise this transcript into initiatives"
                          style={{fontSize:10,padding:"3px 9px",borderRadius:3,fontFamily:t.serif,fontWeight:600,cursor:"pointer",
                            background:t.goldBg,border:"1px solid "+t.goldBorder,color:t.gold}}>
                          Finish this debate
                        </button>
                      )}
                      {(d.results||[]).map((idea,idx)=>(
                        <button key={idx} onClick={()=>{onAddToBacklog(idea);}}
                          title={"Add: "+idea.title}
                          style={{fontSize:9,padding:"2px 7px",borderRadius:3,fontFamily:t.serif,fontWeight:600,cursor:"pointer",
                            background:t.goldBg,border:"1px solid "+t.goldBorder,color:t.gold}}>
                          + {(idea.title||"").split(" ").slice(0,3).join(" ")}…
                        </button>
                      ))}
                    </div>
                  </div>
                  <details>
                    <summary style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,cursor:"pointer"}}>View transcript (<span style={{fontFamily:t.mono}}>{d.transcript?.length||0}</span> turns)</summary>
                    <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6,maxHeight:300,overflowY:"auto"}}>
                      {(d.transcript||[]).map((msg,j)=>(
                        <div key={j} style={{borderLeft:"3px solid "+msg.color,paddingLeft:10,paddingTop:4,paddingBottom:4}}>
                          <div style={{fontSize:10,fontWeight:600,color:msg.color,fontFamily:t.serif,marginBottom:3}}>{msg.label}</div>
                          <p style={{margin:0,fontSize:11,color:t.textSub,fontFamily:t.serif,lineHeight:1.6}}>{msg.text}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
