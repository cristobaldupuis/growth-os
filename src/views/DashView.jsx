import { useState } from "react";
import { OUTCOMES, INIT_TYPES, METRIC_SOURCES, OL, OD, TYPE_L, TYPE_D, DEFAULT_SETTINGS, catColor, brandName, iceScore, iceColor, fmtCur, fmtDate, mondayOf } from "../constants.js";
import { gG, gGh, gSL, gCd } from "../components/styles.js";
import { Spark } from "../components/Spark.jsx";
import { WeeklyStandupModal } from "../components/WeeklyStandupModal.jsx";
import { buildCrossBrandTransfers } from "../services/portfolio.js";
import { renderProse } from "../components/text.jsx";

// -- Weekly Pulse --------------------------------------------------------------
function WeeklyPulseSection({t, brands, weeklyMetrics, onLog, onImport}) {
  const [expanded, setExpanded] = useState(true);

  const now = new Date();

  // Latest entry across all brand+source combos
  const sorted = [...(weeklyMetrics||[])].sort((a,b)=>b.date.localeCompare(a.date));
  const latestDate = sorted[0]?.date || null;
  const daysSince = latestDate ? Math.floor((now - new Date(latestDate+"T12:00:00")) / 86400000) : null;
  const isStale = daysSince !== null && daysSince > 7;
  const isEmpty = !weeklyMetrics || weeklyMetrics.length === 0;

  // Last 4 distinct weeks
  const weeks = [...new Set(sorted.map(m=>m.date))].slice(0,4);

  // Revenue sparkline: sum revenue across all brands for each of last 4 weeks
  const revenueByWeek = weeks.map(w =>
    weeklyMetrics.filter(m=>m.date===w).reduce((s,m)=>s+(m.metrics.revenue||0),0)
  ).reverse();

  // Build a summary table: brands × latest week metrics (revenue, spend, roas)
  const summaryRows = brands.map(b => {
    const brandId = b.id;
    const latestEntries = sorted.filter(m => m.brand === brandId || m.brand === b.name || (brandId==="default"&&(!m.brand||m.brand==="default")));
    const latestEntry = latestEntries[0];
    const prevEntry = latestEntries.find(m => m.date < (latestEntry?.date||""));

    if (!latestEntry) return { brand: b.name, date: null, metrics: null };

    const delta = (key) => {
      if (!prevEntry || prevEntry.metrics[key]==null || latestEntry.metrics[key]==null) return null;
      const d = ((latestEntry.metrics[key] - prevEntry.metrics[key]) / Math.max(Math.abs(prevEntry.metrics[key]),0.01)) * 100;
      return d;
    };

    return {
      brand: b.name,
      date: latestEntry.date,
      source: latestEntry.source,
      revenue: latestEntry.metrics.revenue ?? null,
      spend: latestEntry.metrics.spend ?? null,
      roas: latestEntry.metrics.roas ?? null,
      cvr: latestEntry.metrics.cvr ?? null,
      revDelta: delta("revenue"),
      roasDelta: delta("roas"),
    };
  });

  // A brand with no logged week at all returns `{date:null, metrics:null}` above,
  // so `revDelta`/`roasDelta` come through as `undefined`, not `null`. The old
  // guard was `d === null`, which `undefined` walks straight past — the row then
  // rendered "▼NaN%" in red next to an em dash, which reads to a client as a
  // catastrophic decline rather than "we have never logged this brand".
  // Non-finite covers null, undefined, and any divide-by-zero that slips through.
  const deltaEl = (d) => {
    if (typeof d !== "number" || !isFinite(d)) return null;
    const pos = d >= 0;
    return <span style={{fontSize:10,fontWeight:600,fontFamily:t.mono,color:pos?t.teal:t.red,marginLeft:3}}>{pos?"▲":"▼"}{Math.abs(d).toFixed(1)}%</span>;
  };

  const stalenessColor  = isStale ? t.warn : t.teal;
  const stalenessBg     = isStale ? t.warnBg : t.tealBg;
  const stalenessBorder = isStale ? t.warnBorder : t.teal;

  return (
    <div style={{...gCd(t),border:"1px solid "+t.border}}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setExpanded(e=>!e)} style={{background:"none",border:"none",cursor:"pointer",color:t.textMuted,fontSize:13,padding:0,lineHeight:1}}>
            {expanded?"▾":"▸"}
          </button>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono}}>Weekly Pulse</span>
          {!isEmpty && (
            <span style={{fontSize:10,padding:"2px 7px",borderRadius:3,background:stalenessBg,border:"1px solid "+stalenessBorder,color:stalenessColor,fontFamily:t.serif,fontWeight:600}}>
              {renderProse(isStale ? `Last logged ${daysSince}d ago ⚠️` : `Updated ${daysSince===0?"today":daysSince+"d ago"}`)}
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:5}}>
          <button onClick={onImport} style={{...gGh(t),fontSize:11,padding:"3px 9px"}}>⬆ Import CSV</button>
          <button onClick={onLog}    style={{...gG(t),fontSize:11,padding:"3px 9px"}}>+ Log this week</button>
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:12}}>
          {isEmpty ? (
            <div style={{padding:"26px 20px",textAlign:"center",border:"1px dashed "+t.border,borderRadius:10}}>
              <div style={{fontSize:24,marginBottom:8,opacity:.5}}>&#128202;</div>
              <div style={{fontSize:13.5,fontWeight:600,color:t.text,fontFamily:t.sans,marginBottom:4}}>No metrics logged yet</div>
              <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,maxWidth:340,margin:"0 auto 14px"}}>Track revenue, spend, ROAS and CVR week over week to power the pulse and contribution views.</div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={onLog} style={{...gG(t),fontSize:12.5,padding:"7px 15px"}}>+ Log this week</button>
                <button onClick={onImport} style={{...gGh(t),fontSize:12.5,padding:"7px 13px"}}>&#8645; Import CSV</button>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Revenue sparkline strip */}
              {revenueByWeek.some(v=>v>0) && (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:t.surfaceAlt,borderRadius:5}}>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,minWidth:60}}>Revenue</span>
                  <Spark vals={revenueByWeek} color={t.gold} w={100} h={24}/>
                  <span style={{fontSize:11,fontWeight:700,color:t.gold,fontFamily:t.mono,marginLeft:4}}>
                    {fmtCur(revenueByWeek[revenueByWeek.length-1])}
                  </span>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginLeft:"auto"}}>last <span style={{fontFamily:t.mono}}>{weeks.length}</span> entries</span>
                </div>
              )}

              {/* Summary table */}
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:t.mono}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid "+t.border}}>
                      {["Brand","Date","Source","Revenue","Spend","ROAS","CVR"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"4px 8px",color:t.textMuted,fontWeight:600,letterSpacing:"0.05em",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid "+t.border,opacity:row.date?1:0.4}}>
                        <td style={{padding:"6px 8px",color:t.text,fontWeight:600,whiteSpace:"nowrap"}}>{row.brand}</td>
                        <td style={{padding:"6px 8px",color:t.textMuted,whiteSpace:"nowrap"}}>{row.date?fmtDate(row.date):"—"}</td>
                        <td style={{padding:"6px 8px",color:t.textMuted,whiteSpace:"nowrap"}}>
                          {row.source ? (METRIC_SOURCES.find(s=>s.id===row.source)?.label||row.source) : "—"}
                        </td>
                        <td style={{padding:"6px 8px",color:t.gold,fontWeight:700,whiteSpace:"nowrap"}}>
                          {row.revenue!=null?fmtCur(row.revenue):"—"}{deltaEl(row.revDelta)}
                        </td>
                        <td style={{padding:"6px 8px",color:t.textSub,whiteSpace:"nowrap"}}>{row.spend!=null?fmtCur(row.spend):"—"}</td>
                        <td style={{padding:"6px 8px",color:t.textSub,whiteSpace:"nowrap"}}>
                          {row.roas!=null?row.roas.toFixed(2)+"x":"—"}{deltaEl(row.roasDelta)}
                        </td>
                        <td style={{padding:"6px 8px",color:t.textSub,whiteSpace:"nowrap"}}>{row.cvr!=null?row.cvr.toFixed(2)+"%":"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// -- Dashboard -----------------------------------------------------------------
// -- Contribution to Revenue View ---------------------------------------------
// Three-layer breakdown of how the portfolio contributes to revenue, scoped to
// the active date range and active retailer. Built to be the artifact the
// operator forwards to a client to justify a retainer.
// -- Funnel coverage map -----------------------------------------------------
// Treats categories as funnel stages and shows, per stage: how many initiatives,
// average ICE quality, and revenue in play (running + draft estimate). Surfaces
// thin/empty stages as coverage gaps — the diagnostic artifact for onboarding calls.
function FunnelCoverageMap({t, dk, items, cats, brands, activeBrand}) {
  const normB = id => (!id||id==="default") ? ((brands[0]&&brands[0].id)||"default") : id;
  const scoped = items.filter(e=>activeBrand==="all"||normB(e.brandId)===normB(activeBrand));
  const fmtK = (n) => n===0 ? "$0" : "$"+(n>=1000?Math.round(n/100)/10+"k":Math.round(n).toLocaleString());

  const stages = cats.map(cat=>{
    const inCat   = scoped.filter(e=>e.category===cat);
    const active  = inCat.filter(e=>e.status==="Running"||e.status==="Draft");
    const running = inCat.filter(e=>e.status==="Running").length;
    const draft   = inCat.filter(e=>e.status==="Draft").length;
    const done    = inCat.filter(e=>e.status==="Completed").length;
    const revInPlay = active.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
    const iceVals = inCat.map(e=>e.ice&&iceScore(e.ice.impact,e.ice.certainty,e.ice.ease)).filter(s=>s!=null&&s>0);
    const avgIce  = iceVals.length?Math.round(iceVals.reduce((a,b)=>a+b,0)/iceVals.length):null;
    return {cat,count:inCat.length,active:active.length,running,draft,done,revInPlay,avgIce};
  });

  const maxCount = Math.max(...stages.map(s=>s.count),1);
  const gaps     = stages.filter(s=>s.active===0);
  const totalRevInPlay = stages.reduce((s,r)=>s+r.revInPlay,0);

  return (
    <div style={{...gCd(t)}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:6}}>
        <div>
          <div style={gSL(t)}>Funnel coverage</div>
          <div style={{fontSize:11.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5}}>
            Where active work and revenue are concentrated across the funnel, and which stages are uncovered.
          </div>
        </div>
        <span style={{fontSize:12,fontWeight:600,color:t.gold,fontFamily:t.mono}}>{fmtK(totalRevInPlay)} in play</span>
      </div>

      {gaps.length>0 && (
        <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",borderRadius:9,background:t.redBg,border:"1px solid "+t.red,margin:"10px 0 14px"}}>
          <span style={{color:t.red,fontSize:13,lineHeight:1.4,flexShrink:0}}>&#9888;</span>
          <span style={{fontSize:12,color:t.red,fontFamily:t.sans,lineHeight:1.45}}>
            <strong style={{fontWeight:600}}>{gaps.length} stage{gaps.length>1?"s":""} with no active work:</strong> {gaps.map(g=>g.cat).join(", ")}. These are coverage gaps worth a hypothesis.
          </span>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:gaps.length>0?0:12}}>
        {stages.map((s,i)=>{
          const isGap = s.active===0;
          const barPct = Math.max(4,(s.count/maxCount)*100);
          const accent = catColor(s.cat,cats,dk);
          return (
            <div key={s.cat} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<stages.length-1?"1px solid "+t.borderSoft:"none"}}>
              {/* Stage label + count bar */}
              <div style={{flex:"1 1 auto",minWidth:0}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:5}}>
                  <span style={{fontSize:13,fontWeight:600,color:isGap?t.textMuted:t.text,fontFamily:t.sans}}>{s.cat}</span>
                  {isGap
                    ? <span style={{fontSize:10,fontWeight:600,color:t.red,fontFamily:t.mono,letterSpacing:"0.04em"}}>UNCOVERED</span>
                    : <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>{s.running} running · {s.draft} draft · {s.done} done</span>}
                </div>
                <div style={{height:7,borderRadius:4,background:t.surfaceAlt,overflow:"hidden"}}>
                  <div style={{width:barPct+"%",height:"100%",background:isGap?t.border:accent,borderRadius:4,transition:"width .3s"}}/>
                </div>
              </div>
              {/* Quality */}
              <div style={{width:62,textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>ICE</div>
                <div style={{fontSize:14,fontWeight:600,color:s.avgIce!=null?(s.avgIce>=60?t.teal:s.avgIce>=35?t.text:t.textSub):t.textMuted,fontFamily:t.mono,lineHeight:1.2}}>{s.avgIce!=null?s.avgIce:"—"}</div>
              </div>
              {/* Revenue in play */}
              <div style={{width:74,textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase"}}>In play</div>
                <div style={{fontSize:14,fontWeight:600,color:s.revInPlay>0?t.gold:t.textMuted,fontFamily:t.mono,lineHeight:1.2,letterSpacing:"-0.02em"}}>{fmtK(s.revInPlay)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// -- Business Health Panel -----------------------------------------------------
function BusinessHealthPanel({ t, settings, weeklyMetrics }) {
  const [expanded, setExpanded] = useState(true);

  const allEntries = weeklyMetrics || [];
  const sorted = [...allEntries].sort((a,b) => b.date.localeCompare(a.date));
  const latestDate = sorted[0]?.date || null;
  const priorDate  = latestDate ? (sorted.find(m => m.date < latestDate)?.date || null) : null;
  const latestEntries = latestDate ? allEntries.filter(m => m.date === latestDate) : [];
  const priorEntries  = priorDate  ? allEntries.filter(m => m.date === priorDate)  : [];

  const sumField = (entries, field) => {
    const vals = entries.map(m => m.metrics[field]).filter(v => v != null);
    return vals.length > 0 ? vals.reduce((s,v) => s+v, 0) : null;
  };

  // `registrations` and `return_rate` are both defined as importable fields in
  // METRIC_SOURCES and accepted by the CSV alias map, but nothing ever read them
  // into the health panel — so a workspace that had dutifully imported them still
  // showed "Configure in Settings" on those tiles. They're computed here now.
  //
  // Return rate is averaged weighted by order volume rather than as a flat mean
  // across brands: a 20% return rate on 40 orders and 5% on 900 is not a 12.5%
  // portfolio return rate.
  //
  // This was also two near-identical functions differing only in which entry set
  // they closed over. One function, parameterised.
  const calcFor = (metric, entries) => {
    if (!metric.isCalculated) return null;
    switch (metric.key) {
      case "orders":
        return sumField(entries, "conversions");
      case "registrations":
        return sumField(entries, "registrations");
      case "blended_cac": {
        const spend = sumField(entries, "spend");
        const conv  = sumField(entries, "conversions");
        return (spend != null && conv != null && conv > 0) ? spend / conv : null;
      }
      case "return_rate": {
        const weighted = entries.reduce((acc, m) => {
          const rate = m.metrics.return_rate, orders = m.metrics.conversions;
          if (rate == null || orders == null) return acc;
          return { num: acc.num + rate * orders, den: acc.den + orders };
        }, { num: 0, den: 0 });
        return weighted.den > 0 ? weighted.num / weighted.den : null;
      }
      default:
        return null;
    }
  };

  const calcCurrent = (metric) => calcFor(metric, latestEntries);
  const calcPrior   = (metric) => calcFor(metric, priorEntries);

  const fmtVal = (metric, val) => {
    if (val === null || val === undefined) return null;
    const lbl = metric.label || "";
    if (lbl.includes("(%)") || metric.key.endsWith("_cvr") || metric.key.endsWith("_rate")) {
      return val.toFixed(1) + "%";
    }
    if (lbl.includes("($)") || metric.key.endsWith("_cac") || metric.key.includes("spend") || metric.key.includes("cost")) {
      return "$" + (val >= 100 ? Math.round(val).toLocaleString() : val.toFixed(2));
    }
    return Math.round(val).toLocaleString();
  };

  const deltaChip = (curr, prior, higherIsBetter) => {
    if (curr === null || prior === null || prior === 0) return null;
    const d    = ((curr - prior) / Math.abs(prior)) * 100;
    const pos  = d > 0;
    const good = higherIsBetter ? pos : !pos;
    return (
      <span style={{fontSize:10,fontWeight:600,fontFamily:t.mono,color:good?t.teal:t.red,marginLeft:4}}>
        {pos?"▲":"▼"}{Math.abs(d).toFixed(1)}%
      </span>
    );
  };

  const healthMetrics = (settings.healthMetrics || DEFAULT_SETTINGS.healthMetrics).filter(m => m.enabled);
  if (healthMetrics.length === 0) return null;

  return (
    <div style={{...gCd(t),border:"1px solid "+t.border}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setExpanded(e=>!e)} style={{background:"none",border:"none",cursor:"pointer",color:t.textMuted,fontSize:13,padding:0,lineHeight:1}}>
            {expanded?"▾":"▸"}
          </button>
          <div>
            <span style={{fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono}}>Business Health</span>
            <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,marginTop:1}}>
              Portfolio-level guardrail metrics: watch these when experiments are running
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
          {healthMetrics.map(metric => {
            const autoVal  = calcCurrent(metric);
            const priorVal = calcPrior(metric);
            const val      = autoVal !== null ? autoVal : (metric.manualValue ?? null);
            const fmtd     = fmtVal(metric, val);
            const showTgt  = metric.target != null && val !== null;
            const tgtPct   = showTgt ? Math.min(
              metric.higherIsBetter
                ? (val / metric.target) * 100
                : (metric.target / val) * 100,
              100
            ) : null;

            return (
              <div key={metric.key} style={{background:t.surface,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",boxShadow:t.shadow,minHeight:96,display:"flex",flexDirection:"column"}}>
                <div style={{fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,fontWeight:600,marginBottom:"auto",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{metric.label}</div>
                <div style={{marginTop:9,display:"flex",alignItems:"baseline",flexWrap:"wrap",gap:2}}>
                  {fmtd !== null
                    ? <span style={{fontSize:26,fontWeight:700,color:t.gold,fontFamily:t.mono,lineHeight:1,letterSpacing:"-0.03em"}}>{fmtd}</span>
                    : <span style={{fontSize:22,fontWeight:700,color:t.textMuted,fontFamily:t.mono,lineHeight:1}}>—</span>}
                  {fmtd !== null && deltaChip(val, priorVal, metric.higherIsBetter)}
                </div>
                {fmtd === null && (
                  <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:4,lineHeight:1.4}}>Configure in Settings</div>
                )}
                {showTgt && tgtPct !== null && (
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:9.5,color:t.textMuted,fontFamily:t.mono,marginBottom:3}}>Target {fmtVal(metric, metric.target)}</div>
                    <div style={{height:3,borderRadius:2,background:t.border,overflow:"hidden"}}>
                      <div style={{width:tgtPct+"%",height:"100%",borderRadius:2,background:tgtPct>=100?t.teal:t.gold,transition:"width .3s"}}/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


function ContributionView({t, contribution, totals, dRange, activeBrand, brands, showToast}) {
  const rangeLabel = dRange==="thisMonth"?"this month":dRange==="lastMonth"?"last month":"selected range";
  const retailerLabel = activeBrand==="all" ? "All retailers" : brandName(activeBrand, brands);
  const grand = totals.realised + totals.inflight + totals.pipeline;
  const grandWithBackfill = grand + (totals.realisedBackfilled||0);

  // Empty state — no data at all
  if (grandWithBackfill === 0) {
    return (
      <div style={{...gCd(t)}}>
        <div style={gSL(t)}>Contribution to revenue</div>
        <div style={{padding:"24px 12px",textAlign:"center",color:t.textMuted,fontFamily:t.serif,fontSize:12,lineHeight:1.7}}>
          No revenue contribution recorded for {rangeLabel}.<br/>
          Complete an initiative with actual revenue impact or add running / draft items to see this view.
        </div>
      </div>
    );
  }

  const maxRow = Math.max(...contribution.map(r=>r.realised+r.inflight+r.pipeline), 1);
  const fmt = (n) => n===0 ? "—" : "$"+(n>=1000?Math.round(n/100)/10+"k":n.toLocaleString());
  const fmtBig = (n) => "$"+(n>=1000?(Math.round(n/100)/10).toLocaleString()+"k":n.toLocaleString());

  // Tones: realised = gold (the defensible number), inflight = mid amber, pipeline = muted
  const colorRealised = t.gold;
  const colorInflight = t.warn;
  const colorPipeline = t.textMuted;

  const copyText = () => {
    const date = new Date().toLocaleDateString("en-CA",{month:"long",day:"numeric",year:"numeric"});
    const lines = [
      "Contribution to Revenue · "+date,
      "Retailer: "+retailerLabel+" | Range: "+rangeLabel,
      "",
      "TOTALS",
      "Realised (completed, measured): "+fmtBig(totals.realised),
      "In-flight (running, probability-weighted): "+fmtBig(totals.inflight),
      "Pipeline (draft, probability-weighted): "+fmtBig(totals.pipeline),
      ...(totals.realisedBackfilled>0 ? [
        "",
        "Plus "+fmtBig(totals.realisedBackfilled)+" from backfilled history (self-reported estimates, not measured by the system, excluded from the totals above)."
      ] : []),
      "",
      "BY CATEGORY",
      ...contribution.map(r=>"  "+r.category+": realised "+fmt(r.realised)+" | in-flight "+fmt(r.inflight)+" | pipeline "+fmt(r.pipeline)+" (win rate "+r.winRate+"%)"),
      "",
      "Note: In-flight and pipeline figures are probability-weighted by historical category win rate. Realised is sum of measured actual revenue impact on completed, system-tracked initiatives.",
    ].join("\n");
    try { navigator.clipboard.writeText(lines); showToast("Contribution summary copied to clipboard.", "success"); } catch { showToast("Couldn't copy to clipboard.", "error"); }
  };

  // Data confidence header counts — derived from fields on each contribution row
  const totalActualsCount   = contribution.reduce((s,r) => s + (r.actualsCount   || 0), 0);
  const totalEstimatesCount = contribution.reduce((s,r) => s + (r.inflightCount || 0) + (r.pipelineCount || 0), 0);
  const totalInView = totalActualsCount + totalEstimatesCount;

  return (
    <div style={{...gCd(t)}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <div>
          <div style={gSL(t)}>Contribution to revenue</div>
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5}}>
            {retailerLabel} &middot; {rangeLabel} &middot; in-flight and pipeline are probability-weighted by category win rate
          </div>
          {totalInView > 0 && (
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:3}}>
              {totalActualsCount} of {totalInView} initiatives use recorded actuals; remaining figures are team estimates
            </div>
          )}
        </div>
        <button onClick={copyText} style={{...gGh(t),fontSize:11,padding:"3px 10px"}}>&#128203; Copy</button>
      </div>

      {/* Totals row — three big numbers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
        <div style={{padding:"12px 14px",borderRadius:6,background:t.goldBg,border:"1px solid "+t.goldBorder}}>
          <div style={{fontSize:10,color:t.gold,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Realised</div>
          <div style={{fontSize:26,fontWeight:700,fontFamily:t.mono,color:colorRealised,letterSpacing:"-0.02em",lineHeight:1}}>{fmtBig(totals.realised)}</div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:4}}>measured on completed</div>
        </div>
        <div style={{padding:"12px 14px",borderRadius:6,background:t.surface,border:"1px solid "+t.border}}>
          <div style={{fontSize:10,color:colorInflight,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>In-flight</div>
          <div style={{fontSize:26,fontWeight:700,fontFamily:t.mono,color:colorInflight,letterSpacing:"-0.02em",lineHeight:1}}>{fmtBig(totals.inflight)}</div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:4}}>running, probability-weighted</div>
        </div>
        <div style={{padding:"12px 14px",borderRadius:6,background:t.surface,border:"1px solid "+t.border}}>
          <div style={{fontSize:10,color:colorPipeline,fontFamily:t.mono,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Pipeline</div>
          <div style={{fontSize:26,fontWeight:700,fontFamily:t.mono,color:colorPipeline,letterSpacing:"-0.02em",lineHeight:1}}>{fmtBig(totals.pipeline)}</div>
          <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:4}}>draft, probability-weighted</div>
        </div>
      </div>

      {totals.realisedBackfilled>0 && (
        <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5,marginTop:-8,marginBottom:14,fontStyle:"italic"}}>
          + {fmtBig(totals.realisedBackfilled)} from backfilled history (self-reported estimates, not system-measured). Excluded from Realised above.
        </div>
      )}

      {/* By category — stacked bars */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {contribution.map(row => {
          const rowTotal = row.realised + row.inflight + row.pipeline;
          const pct = (v) => (v/maxRow)*100;
          return (
            <div key={row.category}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5,gap:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",minWidth:0}}>
                  <span style={{fontSize:12,fontWeight:600,color:t.text,fontFamily:t.serif}}>{row.category}</span>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>
                    win rate {row.winRate}%{row.usesFallback?" (portfolio avg)":""}
                  </span>
                </div>
                <span style={{fontSize:13,fontWeight:700,color:t.text,fontFamily:t.mono,letterSpacing:"-0.01em"}}>{fmtBig(rowTotal)}</span>
              </div>
              <div style={{display:"flex",height:10,borderRadius:3,overflow:"hidden",background:t.border}}>
                {row.realised>0 && <div title={"Realised: "+fmt(row.realised)} style={{width:pct(row.realised)+"%",background:colorRealised}}/>}
                {row.inflight>0 && <div title={"In-flight: "+fmt(row.inflight)} style={{width:pct(row.inflight)+"%",background:colorInflight}}/>}
                {row.pipeline>0 && <div title={"Pipeline: "+fmt(row.pipeline)} style={{width:pct(row.pipeline)+"%",background:colorPipeline}}/>}
              </div>
              <div style={{display:"flex",gap:12,marginTop:4,fontSize:10,color:t.textMuted,fontFamily:t.mono,flexWrap:"wrap"}}>
                {row.realised>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorRealised,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>Realised {fmt(row.realised)}</span>}
                {row.inflight>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorInflight,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>In-flight {fmt(row.inflight)}</span>}
                {row.pipeline>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorPipeline,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>Pipeline {fmt(row.pipeline)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Batch diffing helpers ----------------------------------------------------
// Pure functions; no side effects. Match plays across batches by title —
// rec IDs are time-stamped and are never stable across independently generated
// batches, so title (lowercased + trimmed) is the only viable stable key.
function iceTier(rec) {
  const s = iceScore(rec.ice.impact, rec.ice.certainty, rec.ice.ease);
  if (s === null) return "low";
  return s >= 7 ? "high" : s >= 4 ? "medium" : "low";
}

function diffBatches(latest, prev) {
  if (!latest || !prev) return { entered: [], dropped: [], changed: [] };
  const latestRecs    = latest.recommendations || [];
  const prevRecs      = prev.recommendations   || [];
  const latestByTitle = new Map(latestRecs.map(r => [r.title.toLowerCase().trim(), r]));
  const prevByTitle   = new Map(prevRecs.map(r =>   [r.title.toLowerCase().trim(), r]));
  const entered = latestRecs.filter(r => !prevByTitle.has(r.title.toLowerCase().trim()));
  const dropped = prevRecs.filter(r =>   !latestByTitle.has(r.title.toLowerCase().trim()));
  const changed = latestRecs.filter(r => {
    const key = r.title.toLowerCase().trim();
    const p   = prevByTitle.get(key);
    return p && iceTier(r) !== iceTier(p);
  });
  return { entered, dropped, changed };
}

// -- Next Plays UI -----------------------------------------------------------

// Pure helper — derives week state from rec batches and today's date.
// Returns "current" (this week has a slate), "stale" (latest is a prior week),
// or "none" (no batches ever generated).
function recWeekState(recs, today) {
  if (!recs || recs.length === 0) return "none";
  const latest = recs[0];
  const thisMonday = mondayOf(today).toISOString().slice(0, 10);
  // Fall back to deriving from generatedAt for legacy batches missing weekOf.
  const batchMonday = latest.weekOf || mondayOf(new Date(latest.generatedAt)).toISOString().slice(0, 10);
  return batchMonday === thisMonday ? "current" : "stale";
}

// Card that lives on the Dashboard. Shows the latest batch of recommendations
// or a generate CTA if none exist yet. Clicking a rec opens the detail modal.
function NextPlaysCard({ t, recs, recsLoad, recsErr, items, onGenerate, onOpenRec }) {
  const [diffExpanded, setDiffExpanded] = useState(false);

  const latest   = recs && recs.length > 0 ? recs[0] : null;
  // If latest carries weekOf, find the most recent batch from a prior week so
  // same-week regenerations don't clobber the prior-week reference point.
  // Falls back to recs[1] for batches generated before weekOf was stamped.
  const prev = latest
    ? (latest.weekOf
        ? (recs.find(b => b.weekOf && b.weekOf < latest.weekOf) || null)
        : (recs.length > 1 ? recs[1] : null))
    : null;
  const pending  = latest ? latest.recommendations.filter(r => r.status === "pending")  : [];
  const accepted = latest ? latest.recommendations.filter(r => r.status === "accepted") : [];
  const dismissed = latest ? latest.recommendations.filter(r => r.status === "dismissed") : [];

  const diff    = diffBatches(latest, prev);
  const hasDiff = diff.entered.length > 0 || diff.dropped.length > 0 || diff.changed.length > 0;

  const closedCount = (items||[]).filter(e =>
    (e.status==="Completed"||e.status==="Killed") && e.results && e.results.keyLearning
  ).length;

  const weekState = recWeekState(recs, new Date());
  // Derive the Monday date string for labelling — use weekOf if present, fall back to generatedAt.
  const batchWeekOf = latest
    ? (latest.weekOf || mondayOf(new Date(latest.generatedAt)).toISOString().slice(0, 10))
    : null;
  const weekLabel = batchWeekOf
    ? new Date(batchWeekOf + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;

  // -- COMPACT MODE — recs exist and not currently loading -------------------
  // One header strip + one row per pending recommendation. Clicking any row
  // opens the detail modal directly (Option 2 — skip the intermediate list).
  if (latest && !recsLoad) {
    return (
      <div style={{...gCd(t),display:"flex",flexDirection:"column",gap:8,border:"1px solid "+t.goldBorder,padding:"10px 14px"}}>
        {/* Staleness nudge — shown when the current week has no slate yet */}
        {/* Says which slate you're looking at rather than that none exists — the
          * old copy read "This week's plays haven't been generated yet" directly
          * above a header saying "3 ready · Jun 8", which is a flat contradiction
          * from the reader's point of view. Both statements were true; only one
          * of them was useful. */}
        {weekState === "stale" && weekLabel && (
          <div style={{padding:"6px 10px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:4,fontSize:11,color:t.textSub,fontFamily:t.serif}}>
            Showing the slate from {weekLabel}. Regenerate for this week.
          </div>
        )}

        {/* Header strip */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,color:t.gold}}>◆</span>
            <span style={{fontSize:12,fontWeight:600,fontFamily:t.serif,color:t.text,letterSpacing:"0.02em"}}>Next Plays</span>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>
              {renderProse(pending.length > 0 ? pending.length+" ready" : "all resolved")}
            </span>
            {weekLabel && (
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,opacity:0.7}}>
                · {weekState === "current" ? "Week of "+weekLabel : weekLabel}
              </span>
            )}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {(accepted.length > 0 || dismissed.length > 0) && (
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginRight:4}}>
                {accepted.length > 0 && <span>✓ {accepted.length}</span>}
                {accepted.length > 0 && dismissed.length > 0 && <span> · </span>}
                {dismissed.length > 0 && <span>✕ {dismissed.length}</span>}
              </span>
            )}
            <button onClick={onGenerate}
              style={{...(weekState==="stale"?gG(t):gGh(t)),fontSize:10,padding:"3px 8px"}}
              title="Regenerate from current portfolio state">
              ↻ Regenerate
            </button>
          </div>
        </div>

        {/* Error inline (rare — usually cleared by next successful gen) */}
        {recsErr && (
          <div style={{padding:"6px 10px",background:t.redBg,border:"1px solid "+t.red,borderRadius:4,fontSize:11,color:t.red,fontFamily:t.serif}}>
            {recsErr}
          </div>
        )}

        {/* Pending rows — tight one-line entries */}
        {pending.length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {pending.map(rec => {
              const iceTotal = iceScore(rec.ice.impact, rec.ice.certainty, rec.ice.ease);
              return (
                <button key={rec.id} onClick={()=>onOpenRec(latest.id, rec.id)}
                  style={{textAlign:"left",padding:"7px 10px",background:t.surface,border:"1px solid "+t.border,borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontFamily:t.serif,transition:"border-color 0.15s, background 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=t.gold;e.currentTarget.style.background=t.goldBg;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.background=t.surface;}}>
                  {/* Title — flexes to fill, truncates if needed */}
                  <span style={{fontSize:12,fontWeight:600,color:t.text,fontFamily:t.serif,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {rec.title}
                  </span>
                  {/* Meta chips — hide on narrow screens via flexShrink */}
                  <span style={{fontSize:9,color:t.textMuted,fontFamily:t.mono,padding:"1px 5px",border:"1px solid "+t.border,borderRadius:3,textTransform:"uppercase",letterSpacing:"0.04em",flexShrink:0}}>{rec.category}</span>
                  <span style={{fontSize:9,color:t.textMuted,fontFamily:t.serif,flexShrink:0,display:"none"}} className="np-brand">{rec.brandTarget}</span>
                  {/* ICE — always visible, the most important signal at a glance */}
                  <span style={{display:"flex",gap:3,alignItems:"baseline",flexShrink:0}}>
                    <span style={{fontSize:9,color:t.textMuted,fontFamily:t.mono}}>ICE</span>
                    <span style={{fontSize:13,fontWeight:700,color:iceColor(iceTotal,t),fontFamily:t.mono,minWidth:18,textAlign:"right"}}>
                      {iceTotal!==null?iceTotal:"—"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* All-resolved nudge — encourages a regenerate when the slate is exhausted */}
        {pending.length === 0 && (accepted.length > 0 || dismissed.length > 0) && (
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,fontStyle:"italic",padding:"4px 2px"}}>
            All recommendations from this batch have been resolved. Regenerate when you're ready for the next slate.
          </div>
        )}

        {/* Changes from last week — collapsed by default; subordinate context, not primary content */}
        {hasDiff && (
          <div style={{borderTop:"1px solid "+t.border,paddingTop:6,marginTop:2}}>
            <button
              onClick={() => setDiffExpanded(x => !x)}
              style={{background:"none",border:"none",cursor:"pointer",padding:"2px 0",display:"flex",alignItems:"center",gap:6,width:"100%",textAlign:"left"}}
            >
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>{diffExpanded ? "▾" : "▸"}</span>
              <span style={{fontSize:10,color:t.textSub,fontFamily:t.serif}}>Changes from last week</span>
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,marginLeft:2}}>
                {[
                  diff.entered.length > 0 && `${diff.entered.length} new`,
                  diff.dropped.length > 0 && `${diff.dropped.length} dropped`,
                  diff.changed.length > 0 && `${diff.changed.length} re-ranked`,
                ].filter(Boolean).join(" · ")}
              </span>
            </button>
            {diffExpanded && (
              <div style={{marginTop:4,display:"flex",flexDirection:"column",gap:3}}>
                {diff.entered.map(r => (
                  <div key={r.id} style={{fontSize:11,color:t.textSub,fontFamily:t.serif,display:"flex",gap:6,paddingLeft:4}}>
                    <span style={{color:t.textMuted}}>+</span>
                    <span>{r.title}</span>
                  </div>
                ))}
                {diff.dropped.map(r => (
                  <div key={r.id} style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,display:"flex",gap:6,paddingLeft:4}}>
                    <span>−</span>
                    <span style={{textDecoration:"line-through"}}>{r.title}</span>
                  </div>
                ))}
                {diff.changed.map(r => (
                  <div key={r.id} style={{fontSize:11,color:t.textSub,fontFamily:t.serif,display:"flex",gap:6,paddingLeft:4}}>
                    <span style={{color:t.textMuted}}>↕</span>
                    <span>{r.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // -- FULL MODE — empty state or loading. Earns the click; once recs exist, --
  // -- this collapses to the compact strip above. -----------------------------
  return (
    <div style={{...gCd(t),display:"flex",flexDirection:"column",gap:12,border:"1px solid "+t.goldBorder}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18,color:t.gold}}>◆</span>
          <span style={{fontSize:13,fontWeight:600,fontFamily:t.serif,color:t.text,letterSpacing:"0.02em"}}>Next Plays</span>
          <span style={{fontSize:10,color:t.textMuted,fontFamily:t.mono,letterSpacing:"0.04em",textTransform:"uppercase"}}>
            AI-recommended experiments
          </span>
        </div>
        <button onClick={onGenerate} disabled={recsLoad}
          style={{...gG(t),fontSize:11,padding:"5px 11px",opacity:recsLoad?0.6:1}}>
          {recsLoad
            ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Generating…</>
            : <>✦ Generate</>}
        </button>
      </div>

      {/* Empty state — first run */}
      {!recsLoad && !recsErr && (
        <div style={{padding:"14px 16px",background:t.surfaceAlt,border:"1px dashed "+t.border,borderRadius:6,fontSize:12,color:t.textSub,fontFamily:t.serif,lineHeight:1.6}}>
          {renderProse(closedCount === 0
            ? "No experiments closed yet. Recommendations will be sharpest once you have a few logged learnings, but you can still generate from your current portfolio state."
            : "Generate to see 3 grounded experiment recommendations, with hypothesis, ICE, and reasoning trace pre-filled. Based on your "+closedCount+" closed initiative"+(closedCount===1?"":"s")+" and current portfolio state.")}
        </div>
      )}

      {/* Error state */}
      {recsErr && !recsLoad && (
        <div style={{padding:"10px 14px",background:t.redBg,border:"1px solid "+t.red,borderRadius:6,fontSize:12,color:t.red,fontFamily:t.serif}}>
          {recsErr}
        </div>
      )}

      {/* Loading skeleton — three tight rows so it previews the compact state */}
      {recsLoad && (
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {[0,1,2].map(i => (
            <div key={i} style={{padding:"8px 10px",background:t.surfaceAlt,border:"1px solid "+t.border,borderRadius:4,opacity:0.6,display:"flex",alignItems:"center",gap:10}}>
              <div style={{height:10,flex:1,background:t.border,borderRadius:3}}/>
              <div style={{height:10,width:50,background:t.border,borderRadius:3,opacity:0.5}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Modal — full recommendation detail with hypothesis, ICE rationale, reasoning
// trace, and cited learnings. Actions: Add to backlog | Dismiss.

// Parse a north star display string (e.g. "$1.4M/mo", "$320k", "42000") into a
// raw number so gap coverage can be computed. Returns null if unparseable.
function parseNorthStarValue(str) {
  if (!str) return null;
  const s = String(str).replace(/[$,\s]/g, "").toLowerCase();
  const m = s.match(/^([\d.]+)(m|k)?(?:\/.*)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  if (m[2] === "m") return num * 1_000_000;
  if (m[2] === "k") return num * 1_000;
  return num;
}

export function DashView({t,dk,dash,cats,settings,brands,activeBrand,weeklyMetrics,onLog,onImport,dRange,setDRange,cFrom,cTo,setCFrom,setCTo,onGo,recs,recsLoad,recsErr,items,onGenerateRecs,onOpenRec,showToast,onSaveItems}) {
  const maxCat  = Math.max(...Object.values(dash.catCounts),1);
  const maxType = Math.max(...Object.values(dash.typeCounts),1);
  const [showStandup, setShowStandup] = useState(false);

  // Forward pipeline against the north-star gap.
  //
  // This used to render as "Portfolio covers N% of gap" and was wrong twice over.
  // It divided realised + inflight + pipeline by (target - current), so:
  //
  //   1. Realised revenue was in the numerator. That revenue has already landed,
  //      which means it is already inside `current` — counting it again as
  //      progress toward closing the gap between current and target is a straight
  //      double-count, and it grew every time an initiative closed.
  //   2. The two sides aren't the same unit. A north star is written per period
  //      ("$1.1M/mo"), while `revenueImpact` is an absolute estimate over an
  //      initiative's own run length with no period attached. Dividing one by the
  //      other produces a number with no meaning; a demo portfolio was showing
  //      230%, which invites exactly one question from a client and there is no
  //      good answer to it.
  //
  // Both sides are now shown as absolute dollars and never divided. The numerator
  // is forward-looking only (probability-weighted in-flight + pipeline), the gap
  // is labelled with its own period, and the two sit next to each other so the
  // reader does the comparison knowing what they're comparing.
  const nsCurrentNum = parseNorthStarValue(settings.northStarCurrent);
  const nsTargetNum  = parseNorthStarValue(settings.northStarTarget);
  const nsGap = (nsCurrentNum !== null && nsTargetNum !== null && nsTargetNum > nsCurrentNum)
    ? nsTargetNum - nsCurrentNum : null;
  const forwardPipeline = (dash.contributionTotals.inflight || 0)
    + (dash.contributionTotals.pipeline || 0);
  // The period suffix the user wrote on the north star ("/mo", "/qtr", …), reused
  // verbatim so the gap is never presented as a bare, period-less number.
  const nsPeriod = (settings.northStarTarget || "").match(/\/\s*(\w+)/);
  const nsPeriodLabel = nsPeriod ? "/" + nsPeriod[1] : "";

  // Cross-brand transfer opportunities — top 3, only shown if >= 2 exist.
  const transfers = buildCrossBrandTransfers(items, brands).slice(0, 3);

  return (
    <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
      {/* North star */}
      <div style={{...gCd(t),background:t.goldBg,border:"1px solid "+t.goldBorder,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:t.gold,fontFamily:t.mono,marginBottom:4}}>North star</div>
          <div style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif}}>{settings.northStarMetric}</div>
        </div>
        <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
          <div><div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Current</div><div style={{fontSize:26,fontWeight:600,color:t.gold,fontFamily:t.serif,letterSpacing:"-0.02em"}}>{settings.northStarCurrent}</div></div>
          <div style={{fontSize:20,color:t.textMuted,alignSelf:"center"}}>&#8594;</div>
          <div><div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Target</div><div style={{fontSize:26,fontWeight:600,color:t.text,fontFamily:t.serif,letterSpacing:"-0.02em"}}>{settings.northStarTarget}</div></div>
        </div>
        {nsGap !== null && (
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,lineHeight:1.5}}
            title="Weighted pipeline is the sum of estimated revenue on running and draft initiatives, each multiplied by its category win rate. It is an absolute figure over each initiative's own run length, so it is shown alongside the gap rather than divided into it.">
            <div>Gap to target <strong style={{color:t.text,fontFamily:t.mono}}>{fmtCur(nsGap)}</strong>{nsPeriodLabel}</div>
            <div>Weighted pipeline <strong style={{color:t.gold,fontFamily:t.mono}}>{fmtCur(forwardPipeline)}</strong></div>
          </div>
        )}
        <div style={{marginLeft:"auto",fontSize:11,color:t.textMuted,fontFamily:t.serif,textAlign:"right"}}>
          {activeBrand!=="all"&&<div style={{fontSize:12,fontWeight:600,color:t.gold,marginBottom:2}}>{brandName(activeBrand,brands)}</div>}
          {settings.businessModel}
        </div>
      </div>

      {/* This week's focus — attention nudges + weekly standup entry point */}
      {(()=>{
        const today = new Date();
        const expiring = (dash._runningItems||[]).filter(e => {
          if(!e.endDate) return false;
          const days = Math.ceil((new Date(e.endDate+"T12:00:00") - today) / 86400000);
          return days >= 0 && days <= 7;
        });
        const overdue = (dash._runningItems||[]).filter(e => {
          if(!e.startDate) return false;
          const days = Math.ceil((today - new Date(e.startDate+"T12:00:00")) / 86400000);
          return days > 30;
        });
        const nudges = [
          ...expiring.map(e => ({ type:"expiring", item:e })),
          ...overdue.filter(e => !expiring.find(x=>x.id===e.id)).map(e => ({ type:"overdue", item:e })),
        ].slice(0,3);
        const hasNudges = nudges.length>0;
        return (
          <div style={hasNudges
            ? {padding:"10px 14px",background:t.warnBg,border:"1px solid "+t.warnBorder,borderRadius:6}
            : {padding:"10px 14px",background:t.surface,border:"1px solid "+t.border,borderRadius:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:hasNudges?8:0}}>
              <div style={{fontSize:10,fontWeight:700,color:hasNudges?t.warn:t.textMuted,fontFamily:t.mono,letterSpacing:"0.08em",textTransform:"uppercase"}}>
                {hasNudges ? `⚡ ${nudges.length} initiative${nudges.length!==1?"s":""} need attention` : "⚡ This week's focus"}
              </div>
              <button onClick={()=>setShowStandup(true)} style={{...gGh(t),fontSize:11,padding:"3px 10px"}}>Weekly standup</button>
            </div>
            {hasNudges && (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {nudges.map(({type,item},i)=>{
                  const days = type==="expiring"
                    ? Math.ceil((new Date(item.endDate+"T12:00:00") - today) / 86400000)
                    : Math.ceil((today - new Date(item.startDate+"T12:00:00")) / 86400000);
                  return (
                    <div key={i} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10,fontWeight:600,fontFamily:t.serif,
                        color:type==="expiring"?t.warn:t.red,
                        background:type==="expiring"?t.warnBg:t.redBg,
                        border:"1px solid "+(type==="expiring"?t.warnBorder:t.red),
                        borderRadius:3,padding:"1px 6px",flexShrink:0}}>
                        {type==="expiring" ? `ends in ${days}d` : `running ${days}d`}
                      </span>
                      <span style={{fontSize:12,color:t.textSub,fontFamily:t.serif,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</span>
                      {item.owner&&<span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,flexShrink:0}}>{item.owner}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {showStandup && (
        <WeeklyStandupModal
          t={t} dk={dk}
          items={items}
          brands={brands}
          onCommit={(updated)=>onSaveItems&&onSaveItems(updated)}
          onClose={()=>setShowStandup(false)}
          showToast={showToast}
        />
      )}

      {/* Next Plays — AI-recommended experiments */}
      <NextPlaysCard
        t={t} dk={dk}
        recs={recs}
        recsLoad={recsLoad}
        recsErr={recsErr}
        brands={brands}
        items={items}
        onGenerate={onGenerateRecs}
        onOpenRec={onOpenRec}
      />

      {/* Weekly Pulse */}
      <WeeklyPulseSection
        t={t}
        brands={brands}
        weeklyMetrics={weeklyMetrics}
        onLog={onLog}
        onImport={onImport}
      />

      {/* Business Health */}
      <BusinessHealthPanel t={t} settings={settings} weeklyMetrics={weeklyMetrics}/>

      {/* Executive summary */}
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button style={{...gGh(t),fontSize:11,padding:"4px 10px"}}
          onClick={()=>{
            const retailerLabel = activeBrand==="all"?"All retailers":brandName(activeBrand,brands);
            const date = new Date().toLocaleDateString("en-CA",{month:"long",day:"numeric",year:"numeric"});
            const headline = dash.revImpacted>0
              ? fmtCur(dash.revImpacted)+" in measured revenue impact from completed work this period."
              : (dash.running+dash.pipeline)+" initiatives in motion; "+fmtCur(dash.revAtRisk)+" of revenue in play.";
            const text = [
              "WEEKLY GROWTH UPDATE · "+retailerLabel,
              date,
              "",
              headline,
              "",
              "PORTFOLIO",
              "• "+dash.running+" running · "+dash.pipeline+" in draft · "+dash.completed+" completed this period",
              "• Revenue in play (running): "+fmtCur(dash.revAtRisk),
              "• Avg initiative quality (ICE): "+(dash.avgIce||"n/a"),
              "",
              "RESULTS",
              "• Win rate: "+(dash.winRate!==null?dash.winRate+"% ("+dash.wins+" of "+dash.closed+" closed)":"no closed initiatives yet"),
              "• Projected Impact (completed): "+fmtCur(dash.revImpacted),
              "• ROI on closed work: "+(dash.closedROI!==null?dash.closedROI+"x return":"not yet measurable"),
              "• Avg time to close: "+(dash.avgDays?dash.avgDays+" days":"n/a"),
              "",
              "FORECAST",
              "• Probability-weighted revenue in-flight: "+fmtCur(dash.contributionTotals.inflight),
              "• Probability-weighted pipeline: "+fmtCur(dash.contributionTotals.pipeline),
              "• Estimate accuracy to date: "+(dash.calibration!==null?dash.calibration+"%":"not yet measurable"),
              "",
              "Tracked in Growth OS · "+date,
            ].join("\n");
            try { navigator.clipboard.writeText(text); showToast("Executive summary copied. Ready to paste.", "success"); } catch { showToast("Couldn't copy to clipboard.", "error"); }
          }}>
          &#128203; Copy executive summary
        </button>
      </div>

      {/* Range */}
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:2,background:t.surfaceAlt,padding:3,borderRadius:9,border:"1px solid "+t.border}}>
          {[["thisMonth","This month"],["lastMonth","Last month"],["custom","Custom"]].map(([v,l])=>(
            <button key={v} onClick={()=>setDRange(v)} style={{fontSize:12,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontFamily:t.sans,fontWeight:dRange===v?600:500,background:dRange===v?t.gold:"transparent",border:"none",color:dRange===v?t.goldText:t.textSub}}>{l}</button>
          ))}
        </div>
        {dRange==="custom"&&<>
          <input type="date" value={cFrom} onChange={e=>setCFrom(e.target.value)} style={{fontSize:12,padding:"6px 9px",borderRadius:9,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.mono}}/>
          <span style={{color:t.textMuted,fontSize:12}}>to</span>
          <input type="date" value={cTo} onChange={e=>setCTo(e.target.value)} style={{fontSize:12,padding:"6px 9px",borderRadius:9,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.mono}}/>
        </>}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
        {[
          {l:"Projected Impact", v:fmtCur(dash.revImpacted), s:dash.revImpactedProjected?"from completed (projected)":"from completed", hero:true},
          {l:"Revenue at risk",  v:fmtCur(dash.revAtRisk),   s:"running now"},
          {l:"Completed",        v:dash.completed,            s:" "},
          {l:"Killed",           v:dash.killed,               s:" "},
          {l:"Draft pipeline",   v:dash.pipeline,             s:" "},
          {l:"Running",          v:dash.running,              s:" "},
          {l:"Win rate",         v:dash.winRate!==null?dash.winRate+"%":"—", s:dash.wins+"/"+dash.closed+" closed"},
          {l:"Avg to close",     v:dash.avgDays||"—",         s:"days, completed"},
          {l:"Avg ICE",          v:dash.avgIce||"—",          s:"all initiatives"},
          {l:"Closed ROI",        v:dash.closedROI!==null?dash.closedROI+"x":"—", s:"actual rev / cost"},
        ].map(m=>{
          const isMoney = typeof m.v === "string" && m.v.startsWith("$");
          const isPct   = typeof m.v === "string" && m.v.endsWith("%");
          const isMulti = typeof m.v === "string" && m.v.endsWith("x");
          const isFinancial = isMoney || isPct || isMulti;
          return (
          <div key={m.l} style={{background:m.hero?t.goldBg:t.surface,border:"1px solid "+(m.hero?t.goldBorder:t.border),borderRadius:12,padding:"14px 16px",boxShadow:t.shadow,minHeight:96,display:"flex",flexDirection:"column"}}>
            <div style={{fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:t.textMuted,fontFamily:t.mono,fontWeight:600,marginBottom:"auto",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{m.l}</div>
            <div style={{fontSize:26,fontWeight:700,color:isFinancial?t.gold:t.text,fontFamily:t.mono,lineHeight:1,letterSpacing:"-0.03em",marginTop:9}}>{m.v}</div>
            {m.s&&m.s!==" "&&<div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginTop:7,whiteSpace:"nowrap",letterSpacing:"0.02em"}}>{m.s}</div>}
          </div>
          );
        })}
      </div>

      {/* Funnel coverage map — diagnostic: where work & revenue sit across the funnel */}
      <FunnelCoverageMap t={t} dk={dk} items={items} cats={cats} brands={brands} activeBrand={activeBrand}/>

      {/* Contribution to revenue — three-layer breakdown by category */}
      <ContributionView
        t={t} dk={dk}
        contribution={dash.contribution}
        totals={dash.contributionTotals}
        dRange={dRange}
        activeBrand={activeBrand}
        brands={brands}
        showToast={showToast}
      />

      {/* Transfer Opportunities — only render when >= 2 gaps exist */}
      {transfers.length >= 2 && (
        <div style={{...gCd(t)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:10}}>
            <div style={gSL(t)}>Transfer opportunities</div>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>proven at one brand, not yet running at another</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {transfers.map((tr,i) => {
              const revStr = tr.revenueActual !== null
                ? " (+$"+(tr.revenueActual>=1000?Math.round(tr.revenueActual/100)/10+"k":tr.revenueActual.toLocaleString())+" actual)"
                : "";
              return (
                <div key={i} style={{fontSize:12,fontFamily:t.serif,color:t.textSub,lineHeight:1.5}}>
                  <span style={{fontWeight:700,color:t.text}}>{tr.category}:</span>{" "}
                  proven at <span style={{color:t.gold}}>{tr.winningBrand}</span>{revStr}, not running at {tr.missingBrands.join(", ")}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Calibration card */}
      <div style={{...gCd(t),border:"1px solid "+(dash.calibration!==null?(dash.calibration>=80?t.goldBorder:dash.calibration>=50?t.warnBorder:t.border):t.border)}}>
        <div style={gSL(t)}>Revenue estimate calibration</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,alignItems:"center",marginBottom:dash.totalEstCost>0?12:0}}>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Total estimated</div>
            <div style={{fontSize:22,fontWeight:700,color:t.text,fontFamily:t.mono,letterSpacing:"-0.02em"}}>{fmtCur(dash.totalEstimated)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Total actual</div>
            <div style={{fontSize:22,fontWeight:700,color:t.gold,fontFamily:t.mono,letterSpacing:"-0.02em"}}>{fmtCur(dash.totalActual)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Accuracy</div>
            <div style={{fontSize:24,fontWeight:700,fontFamily:t.mono,color:dash.calibration===null?t.textMuted:dash.calibration>=80?t.gold:dash.calibration>=50?t.warn:t.red}}>
              {dash.calibration!==null?dash.calibration+"%":"—"}
            </div>
            {dash.calibration!==null&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,marginTop:2}}>{dash.calibration>=80?"Well calibrated":dash.calibration>=50?"Moderate accuracy":"Overestimating"}</div>}
          </div>
        </div>
        {dash.totalEstCost>0&&(
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+t.border,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Total est. cost</div>
              <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.mono}}>{fmtCur(dash.totalEstCost)}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Total actual cost</div>
              <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.mono}}>{dash.totalActualCost>0?fmtCur(dash.totalActualCost):"—"}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.serif,marginBottom:2}}>Closed ROI</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:t.mono,color:dash.closedROI===null?t.textMuted:dash.closedROI>=2?t.gold:dash.closedROI>=1?t.warn:t.red}}>
                {dash.closedROI!==null?dash.closedROI+"x":"—"}
              </div>
              {dash.closedROI!==null&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,marginTop:2}}>{dash.closedROI>=3?"Strong return":dash.closedROI>=1?"Positive":"Negative"}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Velocity + Category + Type */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
        <div style={gCd(t)}>
          <div style={gSL(t)}>Velocity · last 8 weeks</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[{label:"Started / week",vals:dash.vel.started,color:t.teal},{label:"Closed / week",vals:dash.vel.closed,color:t.gold}].map(row=>(
              <div key={row.label}>
                <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,marginBottom:4}}>{row.label}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <Spark vals={row.vals} color={row.color} w={120} h={26}/>
                  <span style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.mono}}>{row.vals[row.vals.length-1]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={gCd(t)}>
          <div style={gSL(t)}>By category</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {cats.map(cat=>{
              const n=dash.catCounts[cat]||0,pct=maxCat>0?Math.round((n/maxCat)*100):0;
              return(
                <div key={cat}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:12,color:t.textSub,fontFamily:t.serif}}>{cat}</span>
                    <span style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{n}</span>
                  </div>
                  <div style={{height:5,background:t.border,borderRadius:3}}>
                    <div style={{width:pct+"%",height:"100%",borderRadius:3,background:catColor(cat,cats,dk)}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Type breakdown */}
      <div style={gCd(t)}>
        <div style={gSL(t)}>By initiative type</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {INIT_TYPES.map(tp=>{
            const n=dash.typeCounts[tp]||0,pct=maxType>0?Math.round((n/maxType)*100):0;
            const color=(dk?TYPE_D:TYPE_L)[tp]||t.gold;
            return(
              <div key={tp}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                  <span style={{fontSize:12,color:t.textSub,fontFamily:t.serif}}>{tp}</span>
                  <span style={{fontSize:12,color:t.textMuted,fontFamily:t.mono}}>{n}</span>
                </div>
                <div style={{height:5,background:t.border,borderRadius:3}}>
                  <div style={{width:pct+"%",height:"100%",borderRadius:3,background:color}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outcome breakdown */}
      <div style={gCd(t)}>
        <div style={gSL(t)}>Outcome breakdown · all closed</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {OUTCOMES.map(o=>{const c=(dk?OD:OL)[o]||{};return(
            <div key={o} style={{background:c.bg||t.surfaceAlt,border:"1px solid "+(c.border||t.border),borderRadius:6,padding:"8px 14px",minWidth:80}}>
              <div style={{fontSize:20,fontWeight:700,color:c.text||t.text,fontFamily:t.mono}}>{dash.outCounts[o]||0}</div>
              <div style={{fontSize:11,color:c.text||t.textMuted,opacity:0.85,fontFamily:t.serif}}>{o}</div>
            </div>
          );})}
        </div>
      </div>

      <button style={{...gGh(t),alignSelf:"flex-start"}} onClick={onGo}>View initiatives</button>
    </div>
  );
}
