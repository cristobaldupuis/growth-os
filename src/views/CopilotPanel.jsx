import { useState, useMemo } from "react";
import { gG, gGh, gI, gTA, gSc } from "../components/styles.js";
import { CBdg, TBdg } from "../components/badges.jsx";
import { getApiKey } from "../services/ai/_shared.js";
import { callAgentTurn } from "../services/ai/callAgentTurn.js";
import { callModerator } from "../services/ai/callModerator.js";
import { callDebateSynthesis } from "../services/ai/callDebateSynthesis.js";
import { buildPortfolioTools, buildPortfolioContext } from "../services/portfolio.js";

// -- Agentic Debate Panel v2 ---------------------------------------------------
const MAX_TURNS = 8;
const TOOL_LABEL = {
  get_portfolio_summary:     "📋 reading portfolio summary",
  get_running_initiatives:   "🏃 checking running initiatives",
  get_category_coverage:     "🗺️ analysing category coverage",
  get_win_rate_by_category:  "📈 pulling win rates by category",
  get_top_draft_opportunities:"💡 scanning draft pipeline",
  get_failure_patterns:      "❌ reviewing failure patterns",
  get_blocked_initiatives:   "⚠️ checking blocked initiatives",
  get_revenue_gap_analysis:  "💰 running revenue gap analysis",
};

function IdeaCard({idea, idx, results, setResults, added, onAdd, t, dk, cats, agents}) {
  const [isEditing, setEditing] = useState(false);
  const iceS = ice => ice ? Math.round(((ice.impact||0)*(ice.certainty||0)*(ice.ease||0)/1000)*100) : null;
  const iceC = s => s===null?t.textMuted:s>=60?t.gold:s>=30?"#c08820":"#a03030";
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
              <CBdg cat={idea.category||cats[0]} cats={cats} dk={dk}/>
              <TBdg type={idea.initType||"A/B Test"} dk={dk}/>
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
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{champAgent?.icon} Championed by</div>
              <div style={{fontSize:11,color:t.textSub,fontFamily:t.serif,lineHeight:1.5}}>{idea.championedBy}</div>
            </div>
          )}
          {idea.dissentVoice&&(
            <div style={{padding:"7px 10px",background:dk?"#2a1a1a":"#fdf5f5",border:"1px solid "+(dk?"#6a3030":"#e0b0b0"),borderRadius:5}}>
              <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{dissentAgent?.icon} Risk / Dissent</div>
              <div style={{fontSize:11,color:dk?"#e09090":"#a03030",fontFamily:t.serif,lineHeight:1.5}}>{idea.dissentVoice}</div>
            </div>
          )}
        </div>

        {idea.csoRationale&&(
          <div style={{padding:"8px 12px",background:dk?"#1a1a2a":"#f4f4ff",border:"1px solid "+(dk?"#3a3a6a":"#c0c0e8"),borderRadius:5}}>
            <div style={{fontSize:9,color:dk?"#8888cc":"#5555aa",fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>✦ CSO · Why we proceed</div>
            <div style={{fontSize:11,color:dk?"#b0b0e0":"#333366",fontFamily:t.serif,lineHeight:1.5,fontWeight:600}}>{idea.csoRationale}</div>
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
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>📊 Observation</div>
              {isEditing
                ? <textarea style={{...gTA(t),fontSize:12}} rows={2} value={idea.observation}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],observation:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.observation}</p>}
            </div>
          )}
          {idea.hypothesis&&(
            <div style={{borderLeft:"3px solid "+t.gold,paddingLeft:10}}>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>💡 Hypothesis</div>
              {isEditing
                ? <textarea style={{...gTA(t),fontSize:12}} rows={3} value={idea.hypothesis}
                    onChange={e=>{const r=[...results];r[idx]={...r[idx],hypothesis:e.target.value};setResults(r);}}/>
                : <p style={{margin:0,fontSize:12,color:t.textSub,lineHeight:1.6,fontWeight:600,cursor:"text"}} onClick={()=>setEditing(true)}>{idea.hypothesis}</p>}
            </div>
          )}
          {idea.successMetric&&(
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>🎯 Success metric</div>
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
              fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.serif,textAlign:"center"}}>✓ Added to Growth Backlog</div>
          ) : (
            <>
              <button onClick={()=>onAdd(idea,idx)} style={{...gG(t),flex:1,justifyContent:"center",fontSize:12,padding:"8px 12px",}}>
                + Add to Growth Backlog
              </button>
              <button onClick={()=>setEditing(!isEditing)} style={{...gGh(t),fontSize:11,padding:"8px 11px"}}>
                {isEditing?"✓ Done":"✎ Edit"}
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
  const [running,    setRunning]   = useState(false);
  const [transcript, setTranscript]= useState([]);
  const [activeAgent,setActiveAgent]=useState(null); // {label, icon, color, toolsUsed}
  const [modNote,    setModNote]   = useState("");   // moderator's reasoning shown briefly
  const [results,    setResults]   = useState(null);
  const [error,      setError]     = useState("");
  const [added,      setAdded]     = useState({});
  const [phase,      setPhase]     = useState("input");
  const [turnCount,  setTurnCount] = useState(0);

  const portfolioCtx = buildPortfolioContext(items, settings, brands, activeBrand, weeklyMetrics);
  const portfolioTools = buildPortfolioTools(items, settings, brands, activeBrand, weeklyMetrics);

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

  const runDebate = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setError("AI features are not configured. Contact the app administrator."); return; }

    setRunning(true); setError(""); setTranscript([]); setResults(null);
    setAdded({}); setPhase("debating"); setTurnCount(0); setModNote("");

    const fullTranscript = [];
    // Build shared message history so agents read each other's words
    const messageHistory = [];
    let currentTurn = 0;

    // Pick opening agent
    let nextAgent = agents[0];

    try {
      while (currentTurn < MAX_TURNS) {
        setTurnCount(currentTurn + 1);
        setActiveAgent({ ...nextAgent, toolsUsed:[] });

        // Agent speaks (with tool use)
        const { text, toolsUsed } = await callAgentTurn(
          nextAgent, portfolioCtx, context, messageHistory, portfolioTools, currentTurn === 0
        );

        setActiveAgent(null);
        const turn = { agent:nextAgent.id, icon:nextAgent.icon, label:nextAgent.label,
          color:nextAgent.color, text, toolsUsed };
        fullTranscript.push(turn);
        setTranscript([...fullTranscript]);

        // Add to shared history as alternating user/assistant
        messageHistory.push({ role:"user", content: currentTurn===0
          ? `Portfolio:\n${portfolioCtx}\n\nContext:\n${context||"None."}\n\nOpen the debate. Use your tools then give your take.`
          : `${nextAgent.label}, your turn.` });
        messageHistory.push({ role:"assistant", content: `${nextAgent.icon} ${nextAgent.label}: ${text}` });

        currentTurn++;

        // Moderator decides what's next
        if (currentTurn >= 2) {
          const modDecision = await callModerator(
            portfolioCtx, context, fullTranscript, agents, currentTurn, MAX_TURNS
          );
          setModNote(modDecision.reason || "");

          if (modDecision.decision === "synthesise" || currentTurn >= MAX_TURNS - 1) {
            break;
          }

          const nextLabel = modDecision.next_agent;
          const found = agents.find(a => a.label === nextLabel);
          if (modDecision.decision === "followup" && found && modDecision.followup_prompt) {
            // Inject the moderator's specific question as the next prompt
            messageHistory.push({ role:"user", content: `Moderator to ${nextLabel}: ${modDecision.followup_prompt}` });
            messageHistory.push({ role:"assistant", content: `Understood.` });
          }
          nextAgent = found || agents[currentTurn % agents.length];
        } else {
          nextAgent = agents[currentTurn % agents.length];
        }
      }

      // Synthesis
      setPhase("synthesising"); setActiveAgent(null);
      const transcriptStr = fullTranscript.map(m=>`${m.icon} ${m.label}:\n${m.text}`).join("\n\n---\n\n");
      const ideas = await callDebateSynthesis(portfolioCtx, context, fullTranscript, cats, settings, portfolioTools);

      // Save debate to history
      const saved = {
        id: "dbt-"+Date.now(),
        date: new Date().toISOString(),
        context,
        transcript: fullTranscript,
        results: ideas,
        turnCount: currentTurn,
      };
      onSaveDebate(saved);

      setResults(ideas);
      setPhase("done");
    } catch(e) {
      setError("Debate failed: " + (e.message||"check your API key in Settings."));
      setPhase("input");
    }
    setRunning(false); setActiveAgent(null);
  };

  const handleAdd = (idea, idx) => {
    onAddToBacklog(idea);
    setAdded(prev => ({...prev, [idx]: true}));
  };

  const resetDebate = () => {
    setPhase("input"); setTranscript([]); setResults(null);
    setAdded({}); setTurnCount(0); setModNote(""); setError("");
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:400,display:"flex"}}>
      <div style={{flex:1,background:"rgba(10,10,8,0.5)"}} onClick={!running?onClose:undefined}/>

      <div style={{width:Math.min(600,window.innerWidth-16),background:t.surface,
        borderLeft:"1px solid "+t.border,display:"flex",flexDirection:"column",
        height:"100vh",boxShadow:"-8px 0 48px rgba(0,0,0,0.22)"}}>

        {/* Header */}
        <div style={{padding:"13px 20px",borderBottom:"1px solid "+t.border,background:t.goldBg,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif}}>✦ Signal AI</div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:2}}>
                Agents query your live portfolio · Moderator routes the debate · 3 net-new initiatives
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {agents.map(a=>(
                <div key={a.id} title={a.label} style={{fontSize:13,width:26,height:26,borderRadius:"50%",
                  display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.3s",
                  background:activeAgent?.id===a.id?a.color+"25":t.surfaceAlt,
                  border:"1px solid "+(activeAgent?.id===a.id?a.color:t.border),
                  boxShadow:activeAgent?.id===a.id?"0 0 8px "+a.color+"60":"none"}}>
                  {a.icon}
                </div>
              ))}
              {!running&&<button onClick={onClose} style={{background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",fontSize:18,padding:"2px 4px",lineHeight:1,marginLeft:4}}>✕</button>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:4,marginTop:10}}>
            {[["debate","🧠 Debate"],["history","🗂️ Past Debates ("+debates.length+")"]].map(([v,l])=>(
              <button key={v} onClick={()=>setTab(v)} style={{fontSize:11,padding:"4px 11px",borderRadius:4,cursor:"pointer",
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
                onFocus={e=>{ if(!context && smartDefaultContext) setContext(smartDefaultContext); }}
                placeholder={smartDefaultContext || "What should the C-Suite know right now?\n• Black Friday is 8 weeks out\n• Gross margin compressed 4pts this quarter\n• A competitor just launched a subscription tier"}/>
            </div>

            {/* Portfolio snapshot — collapsible */}
            <details style={{...gSc(t,dk),background:t.surfaceAlt}}>
              <summary style={{fontSize:11,fontWeight:600,color:t.textSub,fontFamily:t.serif,cursor:"pointer",listStyle:"none",display:"flex",justifyContent:"space-between"}}>
                <span>📋 Portfolio the agents will read</span>
                <span style={{color:t.textMuted,fontWeight:400}}>▼</span>
              </summary>
              <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.7,whiteSpace:"pre-wrap",marginTop:10,maxHeight:200,overflowY:"auto"}}>
                {portfolioCtx}
              </div>
              <div style={{marginTop:8,fontSize:10,color:t.textMuted,fontFamily:t.serif,padding:"6px 8px",background:t.surface,borderRadius:4,border:"1px solid "+t.border}}>
                🔧 Agents also have 8 live tools to query deeper: win rates, blocked items, coverage gaps, failure patterns, revenue gaps…
              </div>
            </details>

            {/* Launch */}
            {phase==="input"&&(
              <button onClick={runDebate} style={{...gG(t),fontSize:13,padding:"11px 16px",justifyContent:"center",}}>
                🧠 Start C-Suite Debate
              </button>
            )}

            {error&&(
              <div style={{padding:"10px 14px",background:dk?"#2a1010":"#fdf0f0",border:"1px solid "+(dk?"#6a2828":"#e09090"),borderRadius:6,fontSize:12,fontFamily:t.serif,color:dk?"#e08080":"#a03030"}}>
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
                  <div key={i} style={{borderLeft:"3px solid "+msg.color,paddingLeft:12,paddingTop:7,paddingBottom:7,
                    background:t.surfaceAlt,borderRadius:"0 6px 6px 0",
                    border:"1px solid "+t.border,borderLeft:"3px solid "+msg.color}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:13}}>{msg.icon}</span>
                      <span style={{fontSize:11,fontWeight:600,color:msg.color,fontFamily:t.serif,letterSpacing:"0.04em"}}>{msg.label}</span>
                      {msg.toolsUsed&&msg.toolsUsed.length>0&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {msg.toolsUsed.map(tool=>(
                            <span key={tool} style={{fontSize:9,color:t.textMuted,fontFamily:t.serif,background:t.surface,
                              border:"1px solid "+t.border,borderRadius:3,padding:"1px 5px"}}>
                              🔧 {tool.replace("get_","").replace(/_/g," ")}
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
                    fontSize:11,color:dk?"#d4b060":"#7a5800",fontFamily:t.serif,display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontWeight:700}}>🎙 Moderator:</span> {modNote}
                  </div>
                )}

                {/* Active agent typing */}
                {running&&activeAgent&&phase==="debating"&&(
                  <div style={{borderLeft:"3px solid "+activeAgent.color,paddingLeft:12,paddingTop:8,paddingBottom:8,
                    background:t.surfaceAlt,borderRadius:"0 6px 6px 0",border:"1px solid "+t.border}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13}}>{activeAgent.icon}</span>
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
                    ✅ {results.length} net-new initiatives · {turnCount} agent turns · {transcript.reduce((s,m)=>s+(m.toolsUsed?.length||0),0)} tool calls
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
                <div style={{fontSize:28,marginBottom:10}}>🧠</div>
                <div style={{fontSize:13,fontWeight:600,color:t.text,fontFamily:t.serif,marginBottom:8}}>Autonomous C-Suite debate</div>
                <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {agents.map(a=>(
                    <span key={a.id} style={{fontSize:11,padding:"4px 10px",borderRadius:4,fontFamily:t.serif,fontWeight:600,
                      color:a.color,background:a.color+"15",border:"1px solid "+a.color+"30"}}>
                      {a.icon} {a.label}
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
              ):debates.map((d,i)=>(
                <div key={d.id} style={{...gSc(t,dk)}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:t.text,fontFamily:t.serif}}>
                        {new Date(d.date).toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                      </div>
                      <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:2}}>
                        {d.turnCount} turns · {d.results?.length||0} initiatives generated
                        {d.context&&<span> · "{d.context.slice(0,50)}{d.context.length>50?"…":""}"</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:4}}>
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
                          <div style={{fontSize:10,fontWeight:600,color:msg.color,fontFamily:t.serif,marginBottom:3}}>{msg.icon} {msg.label}</div>
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
