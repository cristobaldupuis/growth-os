import { useState } from "react";
import { OUTCOMES, INIT_TYPES, METRIC_SOURCES, OL, OD, DEFAULT_SETTINGS, brandName, iceScore, iceColor, fmtCur, fmtCurFine, fmtDate, fmtDateLong, fmtDateShort, mondayOf, parseNorthStarValue, resolveNorthStar } from "../constants.js";
import { interactive, tile, stagger } from "../components/motion.js";
import { ChargeBar } from "../components/ChargeBar.jsx";
import { gG, gGh, gSL, gCd } from "../components/styles.js";
import { Trend } from "../components/Trend.jsx";
import { Spark } from "../components/Spark.jsx";
import { WeeklyStandupModal } from "../components/WeeklyStandupModal.jsx";
import { buildCrossBrandTransfers } from "../services/portfolio.js";
import { renderProse } from "../components/text.jsx";
import { navName } from "../components/navSections.js";
import { IconImport, IconPlus, IconChart, IconAlert, IconChevronDown, IconChevronRight, IconCopy, IconSparkle, IconSpinner, IconDiamond, IconTrendUp, IconTrendDown, IconCheck, IconClose } from "../components/icons.jsx";

// -- Weekly Pulse --------------------------------------------------------------
function WeeklyPulseSection({t, brands, weeklyMetrics, onLog, onImport}) {
  const [expanded, setExpanded] = useState(true);
  const [revHi, setRevHi] = useState(null);
  // Column sort. Null keeps the brands in their configured order, which is the
  // order an operator already knows them in; a header click sorts, a second
  // reverses, a third returns to that order.
  const [sort, setSort] = useState(null); // { key, dir: 1 | -1 }

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
  const revenuePoints = [...weeks].reverse().map((w,i) => ({ label:w, value:revenueByWeek[i] }));
  const revPoint = revHi != null ? revenuePoints[revHi] : null;

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

  const COLS = [
    { key:"brand",   label:"Brand" },
    { key:"date",    label:"Date" },
    { key:"source",  label:"Source" },
    { key:"revenue", label:"Revenue", num:true },
    { key:"spend",   label:"Spend",   num:true },
    { key:"roas",    label:"ROAS",    num:true },
    { key:"cvr",     label:"CVR",     num:true },
  ];
  const cycleSort = (col) => setSort(cur => {
    // Numbers open largest-first, text A–Z: the first click answers "which is
    // biggest" or "find by name", whichever the column is for.
    const first = col.num ? -1 : 1;
    if (!cur || cur.key !== col.key) return { key: col.key, dir: first };
    if (cur.dir === first) return { key: col.key, dir: -first };
    return null;
  });
  // Rows with no value for the sorted column sink to the bottom in either
  // direction, so reversing a sort never floats a row of em dashes to the top.
  const sortedRows = !sort ? summaryRows : [...summaryRows].sort((a, b) => {
    const va = a[sort.key], vb = b[sort.key];
    const ea = va == null || va === "", eb = vb == null || vb === "";
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
    return c * sort.dir;
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
    return (
      <span style={{display:"inline-flex",alignItems:"center",gap:2,fontSize:12,fontWeight:500,fontFamily:t.sans,color:pos?t.teal:t.red,marginLeft:6,verticalAlign:"-1px"}}>
        {pos?<IconTrendUp size={10}/>:<IconTrendDown size={10}/>}{Math.abs(d).toFixed(1)}%
      </span>
    );
  };

  const stalenessColor  = isStale ? t.warn : t.teal;
  const stalenessBg     = isStale ? t.warnBg : t.tealBg;
  const stalenessBorder = isStale ? t.warnBorder : t.teal;

  return (
    <div style={{...gCd(t),border:"1px solid "+t.border}}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setExpanded(e=>!e)} aria-expanded={expanded} aria-label={(expanded?"Collapse":"Expand")+" Weekly Pulse"}
            style={{background:"none",border:"none",cursor:"pointer",color:t.textMuted,padding:0,lineHeight:1,display:"inline-flex"}}>
            {expanded?<IconChevronDown size={14}/>:<IconChevronRight size={14}/>}
          </button>
          <span style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.01em"}}>Weekly pulse</span>
          {!isEmpty && (
            <span style={{fontSize:12,padding:"2px 8px",borderRadius:t.r.pill,background:stalenessBg,border:"1px solid "+stalenessBorder,color:stalenessColor,fontFamily:t.sans,fontWeight:500}}>
              {isStale && <IconAlert size={11} style={{display:"inline-block",verticalAlign:"-1px",marginRight:4}}/>}
              {renderProse(isStale ? `Last logged ${daysSince}d ago` : `Updated ${daysSince===0?"today":daysSince+"d ago"}`)}
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:5}}>
          <button onClick={onImport} style={gGh(t,"sm")}><IconImport size={12}/> Import CSV</button>
          <button onClick={onLog}    style={gG(t,"sm")}><IconPlus size={12}/> Log this week</button>
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:12}}>
          {isEmpty ? (
            <div style={{padding:"26px 20px",textAlign:"center",border:"1px dashed "+t.border,borderRadius:10}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:8,color:t.textFaint}}><IconChart size={24}/></div>
              <div style={{fontSize:13.5,fontWeight:600,color:t.text,fontFamily:t.sans,marginBottom:4}}>No metrics logged yet</div>
              <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.5,maxWidth:340,margin:"0 auto 14px"}}>Track revenue, spend, ROAS and CVR week over week to power the pulse and contribution views.</div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={onLog} style={gG(t)}><IconPlus size={13}/> Log this week</button>
                <button onClick={onImport} style={gGh(t)}><IconImport size={13}/> Import CSV</button>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Revenue sparkline strip */}
              {revenueByWeek.some(v=>v>0) && (
                <div style={{display:"flex",alignItems:"center",gap:20,padding:"12px 16px",background:t.surfaceAlt,borderRadius:t.r.md,flexWrap:"wrap"}}>
                  <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:120}}>
                    <span style={{fontSize:12.5,color:t.textMuted,fontFamily:t.sans}}>
                      {revPoint ? "Revenue, week of "+fmtDateShort(revPoint.label) : "Revenue, latest week"}
                    </span>
                    <span aria-live="polite" style={{fontSize:18,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.01em"}}>
                      {fmtCur(revPoint ? revPoint.value : revenueByWeek[revenueByWeek.length-1])}
                    </span>
                  </div>
                  <div style={{flex:"1 1 200px",maxWidth:320}}>
                    <Trend t={t} points={revenuePoints} height={36} label="Portfolio revenue" onScrub={setRevHi}/>
                  </div>
                  <span style={{fontSize:12,color:t.textMuted,fontFamily:t.sans,marginLeft:"auto"}}>Last {weeks.length} entries</span>
                </div>
              )}

              {/* Summary table */}
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:t.sans}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid "+t.borderSoft}}>
                      {COLS.map(col=>{
                        const on = sort && sort.key===col.key;
                        return (
                          <th key={col.key} scope="col" aria-sort={on?(sort.dir===1?"ascending":"descending"):"none"}
                            style={{textAlign:"left",padding:"4px 2px",fontWeight:500,fontSize:12,whiteSpace:"nowrap"}}>
                            <button type="button" onClick={()=>cycleSort(col)} className="gos-nav"
                              title={"Sort by "+col.label.toLowerCase()}
                              style={{"--gos-hover-bg":t.borderSoft,display:"inline-flex",alignItems:"center",gap:4,padding:"4px 6px",border:"none",borderRadius:t.r.sm,background:"transparent",cursor:"pointer",fontFamily:t.sans,fontSize:12,fontWeight:500,color:on?t.text:t.textMuted}}>
                              {col.label}
                              <span aria-hidden="true" style={{display:"inline-flex",opacity:on?1:0.35,transform:on&&sort.dir===1?"rotate(180deg)":"none",transition:"transform .15s ease, opacity .15s ease"}}>
                                <IconChevronDown size={11}/>
                              </span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row)=>(
                      <tr key={row.brand} style={{borderBottom:"1px solid "+t.borderSoft,opacity:row.date?1:0.4}}>
                        <td style={{padding:"11px 8px",color:t.text,fontWeight:500,whiteSpace:"nowrap"}}>{row.brand}</td>
                        <td style={{padding:"11px 8px",color:t.textMuted,whiteSpace:"nowrap"}}>{row.date?fmtDate(row.date):"—"}</td>
                        <td style={{padding:"11px 8px",color:t.textMuted,whiteSpace:"nowrap"}}>
                          {row.source ? (METRIC_SOURCES.find(s=>s.id===row.source)?.label||row.source) : "—"}
                        </td>
                        <td style={{padding:"11px 8px",color:t.text,fontWeight:600,whiteSpace:"nowrap"}}>
                          {row.revenue!=null?fmtCur(row.revenue):"—"}{deltaEl(row.revDelta)}
                        </td>
                        <td style={{padding:"11px 8px",color:t.textSub,whiteSpace:"nowrap"}}>{row.spend!=null?fmtCur(row.spend):"—"}</td>
                        <td style={{padding:"11px 8px",color:t.textSub,whiteSpace:"nowrap"}}>
                          {row.roas!=null?row.roas.toFixed(2)+"x":"—"}{deltaEl(row.roasDelta)}
                        </td>
                        <td style={{padding:"11px 8px",color:t.textSub,whiteSpace:"nowrap"}}>{row.cvr!=null?row.cvr.toFixed(2)+"%":"—"}</td>
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
function FunnelCoverageMap({t, items, cats, brands, activeBrand}) {
  const normB = id => (!id||id==="default") ? ((brands[0]&&brands[0].id)||"default") : id;
  const scoped = items.filter(e=>activeBrand==="all"||normB(e.brandId)===normB(activeBrand));
  // Was a third local currency formatter, disagreeing with both the shared one
  // and Triage's copy. `fmtCurFine` is the shared one with the decimal place
  // this dense breakdown wants.
  const fmtK = fmtCurFine;

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
        <span style={{fontSize:12,fontWeight:600,color:t.text,fontFamily:t.sans}}>{fmtK(totalRevInPlay)} in play</span>
      </div>

      {/* A coverage gap is an opportunity, not a failure, and red is reserved
        * for blockers and failed outcomes — spending it here is what made the
        * loudest element on the dashboard the least actionable one. */}
      {gaps.length>0 && (
        <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",borderRadius:9,background:t.goldBg,border:"1px solid "+t.goldBorder,margin:"10px 0 14px"}}>
          <span style={{fontSize:12,color:t.text,fontFamily:t.sans,lineHeight:1.45}}>
            <strong style={{fontWeight:600}}>{gaps.length} stage{gaps.length>1?"s":""} with no active work:</strong> {gaps.map(g=>g.cat).join(", ")}. These are coverage gaps worth a hypothesis.
          </span>
        </div>
      )}

      {/* One ink for every bar. Hue carries nothing in a magnitude chart — the
        * row is labelled and the length is the number — so a colour per stage
        * was decoration competing with the figures beside it. */}
      <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:gaps.length>0?0:12}}>
        {stages.map((s,i)=>{
          const isGap = s.active===0;
          const barPct = Math.max(4,(s.count/maxCount)*100);
          return (
            <div key={s.cat} {...(()=>{const p=interactive(t,isGap?t.border:t.goldFill,{flat:true,index:i,hoverBg:t.surfaceAlt});
              return {className:p.className, style:{...p.style,display:"flex",alignItems:"center",gap:12,padding:"10px 10px 10px 12px",borderBottom:i<stages.length-1?"1px solid "+t.borderSoft:"none",borderRadius:8}};})()}>
              {/* Stage label + count bar */}
              <div style={{flex:"1 1 auto",minWidth:0}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:5}}>
                  <span style={{fontSize:13,fontWeight:600,color:isGap?t.textMuted:t.text,fontFamily:t.sans}}>{s.cat}</span>
                  {isGap
                    ? <span style={{fontSize:10,fontWeight:600,color:t.textMuted,fontFamily:t.sans,letterSpacing:"0.04em"}}>Uncovered</span>
                    : <span style={{fontSize:11,color:t.textMuted,fontFamily:t.sans}}>{s.running} running · {s.draft} draft · {s.done} done</span>}
                </div>
                <ChargeBar t={t} pct={barPct} height={7} muted={isGap} index={i}/>
              </div>
              {/* Quality */}
              <div style={{width:62,textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:12,color:t.textMuted,fontFamily:t.sans}}>ICE</div>
                <div style={{fontSize:14,fontWeight:600,color:s.avgIce!=null?t.text:t.textMuted,fontFamily:t.sans,lineHeight:1.2}}>{s.avgIce!=null?s.avgIce:"—"}</div>
              </div>
              {/* Revenue in play */}
              <div style={{width:74,textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:12,color:t.textMuted,fontFamily:t.sans}}>In play</div>
                <div style={{fontSize:14,fontWeight:600,color:s.revInPlay>0?t.text:t.textMuted,fontFamily:t.sans,lineHeight:1.2,letterSpacing:"-0.02em"}}>{fmtK(s.revInPlay)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// -- Business Health Panel -----------------------------------------------------
function BusinessHealthPanel({ t, settings, weeklyMetrics, activeBrand, lead }) {

  // Scoped to the active brand so the tiles read that brand's own guardrails
  // rather than a portfolio blend when one is selected — same "all" convention
  // as the rest of the dashboard (dash, contribution, funnel coverage).
  const allEntries = (weeklyMetrics || []).filter(m => !activeBrand || activeBrand === "all" || m.brand === activeBrand);
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
      <span style={{fontSize:12,fontWeight:600,fontFamily:t.sans,color:good?t.teal:t.red}}>
        {pos?"▲":"▼"} {Math.abs(d).toFixed(1)}%
      </span>
    );
  };

  // The trend under each tile: the same calculation run over each logged date,
  // oldest first, capped at the last eight so a long history stays a sparkline.
  const dates = [...new Set(allEntries.map(m => m.date))].sort().slice(-8);
  const seriesFor = (metric) => dates
    .map(d => ({ label: d, value: calcFor(metric, allEntries.filter(m => m.date === d)) }))
    .filter(p => p.value !== null);

  const healthMetrics = (settings.healthMetrics || DEFAULT_SETTINGS.healthMetrics).filter(m => m.enabled);
  const tiles = healthMetrics.map(metric => {
    const autoVal  = calcCurrent(metric);
    const val      = autoVal !== null ? autoVal : (metric.manualValue ?? null);
    return { metric, val, prior: calcPrior(metric), fmtd: fmtVal(metric, val), series: seriesFor(metric) };
  });
  // A metric with no value yet is a setup prompt, not a KPI: it moves out of the
  // row to one line underneath rather than holding a tile open on an em dash.
  const live = tiles.filter(x => x.fmtd !== null);
  const unset = tiles.filter(x => x.fmtd === null);
  if (!lead && live.length === 0) return null;

  // The north star leads the row at double width. Column counts are handed to
  // the stylesheet (see .gos-kpi in index.css) so the row can reflow: wide, the
  // lead and every tile share one row; narrower, the lead takes its own row.
  const n = Math.max(1, Math.min(live.length, 5));
  const wide = live.length <= 4 && lead ? n + 2 : n;
  const cols = (k) => "repeat(" + k + ", minmax(0, 1fr))";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div className="gos-kpi" style={{display:"grid",gap:16,
        "--kpi-wide":cols(wide),"--kpi-mid":cols(n),
        "--kpi-lead": live.length <= 4 && lead ? "span 2" : "1 / -1"}}>
        {lead && <div className="gos-kpi-lead" style={{display:"flex",minWidth:0}}>{lead}</div>}
        {live.map(({ metric, val, prior, fmtd, series }, i) => (
          <KpiTile key={metric.key} t={t} index={i} metric={metric} val={val} fmtd={fmtd} series={series}
            delta={deltaChip(val, prior, metric.higherIsBetter)} fmtVal={fmtVal}/>
        ))}
      </div>
      {unset.length > 0 && (
        <div style={{fontSize:12.5,color:t.textMuted,fontFamily:t.sans}}>
          Not configured yet: {unset.map(x => x.metric.label).join(", ")}. Set {unset.length === 1 ? "it" : "them"} up in Settings.
        </div>
      )}
    </div>
  );
}

// One KPI tile. Scrubbing its trend swaps the headline figure for the week
// under the pointer and says which week that is, so the sparkline answers
// "what was it then?" instead of only "which way is it going?".
function KpiTile({ t, index, metric, val, fmtd, series, delta, fmtVal }) {
  const [hi, setHi] = useState(null);
  const point = hi != null ? series[hi] : null;
  const showTgt = metric.target != null && val !== null;
  const tgtPct = showTgt ? Math.min(
    metric.higherIsBetter ? (val / metric.target) * 100 : (metric.target / val) * 100,
    100
  ) : null;
  return (
    <div className="gos-enter" style={{...gCd(t),"--gos-delay":stagger(index + 1),padding:"18px 18px 14px",minWidth:0,display:"flex",flexDirection:"column",gap:8}}>
      <div title={metric.label} style={{fontSize:13,color:t.textMuted,fontFamily:t.sans,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{metric.label}</div>
      <div aria-live="polite" style={{fontSize:t.fs.figure,fontWeight:600,color:t.text,fontFamily:t.sans,lineHeight:1.1,letterSpacing:"-0.02em"}}>
        {point ? fmtVal(metric, point.value) : fmtd}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:t.textMuted,fontFamily:t.sans,whiteSpace:"nowrap",minHeight:16}}>
        {point
          ? <span>Week of {fmtDateShort(point.label)}</span>
          : (delta ? <>{delta}<span>vs prior week</span></> : <span>No prior week</span>)}
      </div>
      {showTgt && tgtPct !== null && (
        <div title={"Target "+fmtVal(metric, metric.target)} style={{height:4,borderRadius:t.r.pill,background:t.borderSoft,overflow:"hidden"}}>
          <div style={{width:tgtPct+"%",height:"100%",borderRadius:t.r.pill,background:tgtPct>=100?t.teal:t.goldFill,transition:"width .3s"}}/>
        </div>
      )}
      <div style={{marginTop:"auto"}}><Trend t={t} points={series} label={metric.label} onScrub={setHi}/></div>
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
  // Was a fifth currency formatter — a local `fmt` and `fmtBig`, both hardcoding
  // a dollar sign — which is why this panel read "$273k" while the funnel map
  // directly above it read "US$704.8k" on the same screen.
  const fmt    = (n) => n===0 ? "—" : fmtCurFine(n);
  const fmtBig = fmtCurFine;

  // The three layers are a certainty ramp — measured, then probable, then
  // speculative — and the old colours did not encode that. Realised was `gold`
  // and in-flight was `warn`, which in light mode are #856310 and #8A5A0B: a
  // 1.07:1 lightness ratio, so the two most important segments of a stacked bar
  // were the same colour. Pipeline was `textMuted` grey, a third unrelated hue.
  //
  // Realised is now teal, which is not a new idea — it is what the rest of the
  // app already does. The Initiatives group header renders "realised" in teal
  // and "at risk" in gold, and an initiative card shows its measured `actual`
  // in teal. This panel was the one place that said it in gold.
  //
  // So: teal means measured, gold means forecast, pale gold means a forecast
  // further from evidence. Hue separates fact from estimate; lightness
  // separates the two estimates.
  const colorRealised = t.rampMeasured;
  const colorInflight = t.rampInflight;
  const colorPipeline = t.rampPipeline;

  const copyText = () => {
    const date = fmtDateLong();
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
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,lineHeight:1.5}}>
            {retailerLabel} &middot; {rangeLabel} &middot; in-flight and pipeline are probability-weighted by category win rate
          </div>
          {totalInView > 0 && (
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginTop:3}}>
              {totalActualsCount} of {totalInView} initiatives use recorded actuals; remaining figures are team estimates
            </div>
          )}
        </div>
        <button onClick={copyText} style={gGh(t,"sm")}><IconCopy size={12}/> Copy</button>
      </div>

      {/* Totals row — three big numbers.
        *
        * The swatch is what ties each tile to its segment in the bars below.
        * The figure itself is drawn in an ink token, not in the ramp colour:
        * the ramp is tuned for two blocks of colour touching in a 10px bar,
        * where the pale end of it is a legitimate value, and the same pale gold
        * set as `color` on a 26px numeral is unreadable on white. Bars and text
        * are different jobs and this panel used one set of colours for both. */}
      <div className="gos-grid-3" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
        {[
          { key:"realised", label:"Realised", value:totals.realised, ink:t.teal,     swatch:colorRealised,
            sub:"measured on completed", hero:true },
          { key:"inflight", label:"In-flight", value:totals.inflight, ink:t.gold,    swatch:colorInflight,
            sub:"running, probability-weighted" },
          { key:"pipeline", label:"Pipeline",  value:totals.pipeline, ink:t.textSub, swatch:colorPipeline,
            sub:"draft, probability-weighted" },
        ].map(m=>(
          <div key={m.key} style={{padding:"12px 14px",borderRadius:t.r.md,
            background:t.surfaceAlt,
            border:"1px solid "+t.borderSoft}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span aria-hidden="true" style={{width:8,height:8,borderRadius:2,background:m.swatch,flexShrink:0,
                border:"1px solid "+(m.key==="pipeline"?t.border:"transparent")}}/>
              <span style={{fontSize:12,color:t.textMuted,fontFamily:t.sans}}>{m.label}</span>
            </div>
            <div style={{fontSize:t.fs.display,fontWeight:700,fontFamily:t.sans,color:m.ink,letterSpacing:"-0.02em",lineHeight:1}}>{fmtBig(m.value)}</div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginTop:4}}>{m.sub}</div>
          </div>
        ))}
      </div>

      {totals.realisedBackfilled>0 && (
        <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,lineHeight:1.5,marginTop:-8,marginBottom:14,fontStyle:"italic"}}>
          + {fmtBig(totals.realisedBackfilled)} from backfilled history (self-reported estimates, not system-measured). Excluded from Realised above.
        </div>
      )}

      {/* By category — stacked bars.
        *
        * These rows were inert: no hover, no entry, no charge, while the funnel
        * map directly above them lifted, railed and swept. Two panels on one
        * screen, one alive and one not, reads as the second one being broken.
        * They now take the same `interactive` treatment, and the segments are
        * real `gos-fill` elements, so the shared charge sweep and the
        * saturate/brighten on hover apply here exactly as they do everywhere
        * else — the colour is earned by pointing at it rather than spent at
        * rest, which is the rule the whole interaction layer is built on. */}
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {contribution.map((row, ri) => {
          const rowTotal = row.realised + row.inflight + row.pipeline;
          const pct = (v) => (v/maxRow)*100;
          const p = interactive(t, t.goldFill, {flat:true, index:ri, hoverBg:t.surfaceAlt});
          return (
            <div key={row.category} className={p.className}
              style={{...p.style, padding:"9px 10px 10px 12px", borderRadius:t.r.sm}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5,gap:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",minWidth:0}}>
                  <span style={{fontSize:12,fontWeight:600,color:t.text,fontFamily:t.sans}}>{row.category}</span>
                  <span style={{fontSize:10,color:t.textMuted,fontFamily:t.sans}}>
                    win rate {row.winRate}%{row.usesFallback?" (portfolio avg)":""}
                  </span>
                </div>
                <span style={{fontSize:13,fontWeight:700,color:t.text,fontFamily:t.sans,letterSpacing:"-0.01em"}}>{fmtBig(rowTotal)}</span>
              </div>
              <div className="gos-track" style={{display:"flex",height:10,background:t.rampTrack}}>
                {row.realised>0 && <div className="gos-fill" title={"Realised: "+fmt(row.realised)}
                  style={{width:pct(row.realised)+"%",background:colorRealised,borderRadius:0,"--gos-spark":t.spark,"--gos-delay":stagger(ri)}}/>}
                {row.inflight>0 && <div className="gos-fill" title={"In-flight: "+fmt(row.inflight)}
                  style={{width:pct(row.inflight)+"%",background:colorInflight,borderRadius:0,"--gos-spark":t.spark,"--gos-delay":stagger(ri)}}/>}
                {row.pipeline>0 && <div className="gos-fill" title={"Pipeline: "+fmt(row.pipeline)}
                  style={{width:pct(row.pipeline)+"%",background:colorPipeline,borderRadius:0,"--gos-spark":t.spark,"--gos-delay":stagger(ri)}}/>}
              </div>
              <div style={{display:"flex",gap:12,marginTop:4,fontSize:10,color:t.textMuted,fontFamily:t.sans,flexWrap:"wrap"}}>
                {row.realised>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorRealised,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>Realised {fmt(row.realised)}</span>}
                {row.inflight>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorInflight,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>In-flight {fmt(row.inflight)}</span>}
                {row.pipeline>0 && <span><span style={{display:"inline-block",width:7,height:7,background:colorPipeline,border:"1px solid "+t.border,marginRight:4,borderRadius:1,verticalAlign:"middle"}}/>Pipeline {fmt(row.pipeline)}</span>}
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
    ? fmtDateShort(batchWeekOf)
    : null;

  // -- COMPACT MODE — recs exist and not currently loading -------------------
  // One header strip + one row per pending recommendation. Clicking any row
  // opens the detail modal directly (Option 2 — skip the intermediate list).
  if (latest && !recsLoad) {
    return (
      <div style={{...gCd(t),display:"flex",flexDirection:"column",gap:10}}>
        {/* Staleness nudge — shown when the current week has no slate yet */}
        {/* Says which slate you're looking at rather than that none exists — the
          * old copy read "This week's plays haven't been generated yet" directly
          * above a header saying "3 ready · Jun 8", which is a flat contradiction
          * from the reader's point of view. Both statements were true; only one
          * of them was useful. */}
        {weekState === "stale" && weekLabel && (
          <div style={{padding:"6px 10px",background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:4,fontSize:11,color:t.textSub,fontFamily:t.sans}}>
            Showing the slate from {weekLabel}. Regenerate for this week.
          </div>
        )}

        {/* Header strip */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:t.gold,display:"inline-flex"}}><IconDiamond size={13}/></span>
            <span style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.01em"}}>Next plays</span>
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.sans}}>
              {renderProse(pending.length > 0 ? pending.length+" ready" : "all resolved")}
            </span>
            {weekLabel && (
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,opacity:0.7}}>
                · {weekState === "current" ? "Week of "+weekLabel : weekLabel}
              </span>
            )}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {(accepted.length > 0 || dismissed.length > 0) && (
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginRight:4}}>
                {accepted.length > 0 && <span style={{display:"inline-flex",alignItems:"center",gap:3}}><IconCheck size={11}/>{accepted.length}</span>}
                {accepted.length > 0 && dismissed.length > 0 && <span> · </span>}
                {dismissed.length > 0 && <span style={{display:"inline-flex",alignItems:"center",gap:3}}><IconClose size={11}/>{dismissed.length}</span>}
              </span>
            )}
            <button onClick={onGenerate}
              style={{...(weekState==="stale"?gG(t):gGh(t)),fontSize:10,padding:"3px 8px"}}
              title="Regenerate from current portfolio state">
              — Regenerate
            </button>
          </div>
        </div>

        {/* Error inline (rare — usually cleared by next successful gen) */}
        {recsErr && (
          <div style={{padding:"6px 10px",background:t.redBg,border:"1px solid "+t.red,borderRadius:4,fontSize:11,color:t.red,fontFamily:t.sans}}>
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
                  <span style={{fontSize:12,color:t.textMuted,fontFamily:t.sans,padding:"1px 5px",border:"1px solid "+t.border,borderRadius:3,flexShrink:0}}>{rec.category}</span>
                  <span style={{fontSize:9,color:t.textMuted,fontFamily:t.sans,flexShrink:0,display:"none"}} className="np-brand">{rec.brandTarget}</span>
                  {/* ICE — always visible, the most important signal at a glance */}
                  <span style={{display:"flex",gap:3,alignItems:"baseline",flexShrink:0}}>
                    <span style={{fontSize:9,color:t.textMuted,fontFamily:t.sans}}>ICE</span>
                    <span style={{fontSize:13,fontWeight:700,color:iceColor(iceTotal,t),fontFamily:t.sans,minWidth:18,textAlign:"right"}}>
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
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,fontStyle:"italic",padding:"4px 2px"}}>
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
              <span style={{color:t.textMuted,display:"inline-flex"}}>{diffExpanded ? <IconChevronDown size={11}/> : <IconChevronRight size={11}/>}</span>
              <span style={{fontSize:10,color:t.textSub,fontFamily:t.sans}}>Changes from last week</span>
              <span style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginLeft:2}}>
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
                  <div key={r.id} style={{fontSize:11,color:t.textSub,fontFamily:t.sans,display:"flex",gap:6,paddingLeft:4}}>
                    <span style={{color:t.textMuted}}>+</span>
                    <span>{r.title}</span>
                  </div>
                ))}
                {diff.dropped.map(r => (
                  <div key={r.id} style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,display:"flex",gap:6,paddingLeft:4}}>
                    <span>−</span>
                    <span style={{textDecoration:"line-through"}}>{r.title}</span>
                  </div>
                ))}
                {diff.changed.map(r => (
                  <div key={r.id} style={{fontSize:11,color:t.textSub,fontFamily:t.sans,display:"flex",gap:6,paddingLeft:4}}>
                    <span style={{color:t.textMuted}}>±</span>
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
    <div style={{...gCd(t),display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:t.gold,display:"inline-flex"}}><IconDiamond size={15}/></span>
          <span style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.01em"}}>Next plays</span>
          <span style={{fontSize:11,fontWeight:600,color:t.gold,background:t.goldBg,borderRadius:t.r.sm,padding:"2px 6px",fontFamily:t.sans}}>AI</span>
        </div>
        <button onClick={onGenerate} disabled={recsLoad}
          style={{...gGh(t,"sm"),opacity:recsLoad?0.6:1}}>
          {recsLoad
            ? <><IconSpinner size={12}/> Generating…</>
            : <><span style={{color:t.gold,display:"inline-flex"}}><IconSparkle size={13}/></span> Generate plays</>}
        </button>
      </div>

      {/* Empty state — first run */}
      {!recsLoad && !recsErr && (
        <div style={{padding:"16px 18px",background:t.surfaceAlt,borderRadius:t.r.md,fontSize:13,color:t.textSub,fontFamily:t.sans,lineHeight:1.6}}>
          {renderProse(closedCount === 0
            ? "No experiments closed yet. Plays get sharper once you have a few logged learnings, but you can still generate from the current portfolio."
            : "Get three experiment ideas from your "+closedCount+" closed initiative"+(closedCount===1?"":"s")+". Each comes with a hypothesis, an ICE score and the reasoning behind it.")}
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


// -- Stat tiles ----------------------------------------------------------------
//
// Split into the four that answer "how is the portfolio doing" and the six that
// answer "what is in it". The second group is counts and averages — real, worth
// having, and not what anyone opens the dashboard to read.
//
// "Projected Impact" is renamed. The same figure was called four things across
// the product — "Projected Impact" on this tile, "Revenue impacted" in the
// README, "realised" in the contribution breakdown, and "Projected impact from
// completed work" in the client readout — which is untenable in a product whose
// pitch is defensible measurement. It is "Measured impact" everywhere now, and
// the sublabel says when it still contains an estimate.
const PRIMARY_TILES = (dash) => [
  // `to` is the view that holds the work behind the number: closed results live
  // in the Library, the running work that puts revenue at risk in Triage.
  { l:"Measured impact", v:fmtCur(dash.revImpacted), s:dash.revImpactedProjected?"completed · includes estimates":"completed · actuals", hero:true, to:"library" },
  { l:"Revenue at risk",  v:fmtCur(dash.revAtRisk),  s:"running now", to:"triage" },
  { l:"Win rate",         v:dash.winRate!==null?dash.winRate+"%":"—", s:dash.wins+"/"+dash.closed+" closed", to:"library" },
  { l:"Closed ROI",       v:dash.closedROI!==null?dash.closedROI+"x":"—", s:"actual revenue / cost", to:"library" },
];

const SECONDARY_TILES = (dash) => [
  { l:"Running",        v:dash.running,   s:" " },
  { l:"Draft pipeline", v:dash.pipeline,  s:" " },
  { l:"Completed",      v:dash.completed, s:" " },
  { l:"Killed",         v:dash.killed,    s:" " },
  { l:"Avg to close",   v:dash.avgDays||"—", s:"days, completed" },
  { l:"Avg ICE",        v:dash.avgIce||"—",  s:"all initiatives" },
  { l:"Loonshots active", v:dash.loonshotShare!==null?dash.loonshotShare+"%":"—", s:dash.classifiedActiveCount+"/"+dash.activeCount+" classified" },
];

// A tile with a `to` and an `onNav` is a link to the view behind its number:
// it renders as a button, tints on hover, and shows where it goes.
function StatTile({ t, m, index, big, onNav }) {
  const go = m.to && onNav;
  const p = go ? interactive(t, null, { index }) : tile(t, t.goldFill, index);
  const Tag = go ? "button" : "div";
  return (
    <Tag type={go ? "button" : undefined} onClick={go ? () => onNav(m.to) : undefined}
      title={go ? "Open "+navName(m.to) : undefined}
      className={p.className+(go?" gos-row":"")} style={{...p.style,
      background:t.surface,
      border:"1px solid "+t.border,
      borderRadius:t.r.lg,padding:big?"18px 20px":"14px 16px",boxShadow:t.shadow,
      minHeight:big?104:96,display:"flex",flexDirection:"column",
      textAlign:"left",fontFamily:t.sans,cursor:go?"pointer":"default",width:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,width:"100%",marginBottom:"auto"}}>
        <span style={{flex:1,minWidth:0,fontSize:12,color:t.textMuted,fontFamily:t.sans,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.l}</span>
        {go && <span className="gos-row-go" aria-hidden="true" style={{display:"flex",alignItems:"center",gap:3,fontSize:12,color:t.textFaint,whiteSpace:"nowrap"}}>{navName(m.to)}<IconChevronRight size={12}/></span>}
      </div>
      <div style={{fontSize:big?28:t.fs.figure,fontWeight:600,color:m.v==="—"?t.textFaint:t.text,fontFamily:t.sans,lineHeight:1,letterSpacing:"-0.02em",marginTop:10}}>{m.v}</div>
      {m.s&&m.s!==" "&&<div style={{fontSize:12,color:t.textMuted,fontFamily:t.sans,marginTop:8,whiteSpace:"nowrap"}}>{m.s}</div>}
    </Tag>
  );
}

export function DashView({t,dk,dash,cats,settings,brands,activeBrand,weeklyMetrics,onLog,onImport,dRange,setDRange,cFrom,cTo,setCFrom,setCTo,onGo,recs,recsLoad,recsErr,items,onGenerateRecs,onOpenRec,onOpenItem,onNav,showToast,onSaveItems}) {
  const maxCat  = Math.max(...Object.values(dash.catCounts),1);
  const maxType = Math.max(...Object.values(dash.typeCounts),1);
  const [showStandup, setShowStandup] = useState(false);
  const [showAllTiles, setShowAllTiles] = useState(false);
  const [showComposition, setShowComposition] = useState(false);

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
  // Resolved for the active scope: a brand's own northStar when the config
  // defines one and a brand is selected, the computed roll-up for "all", and
  // the portfolio setting as the fallback either way (see resolveNorthStar).
  const ns = resolveNorthStar(activeBrand, brands, settings, weeklyMetrics);
  const nsCurrentNum = parseNorthStarValue(ns.current);
  const nsTargetNum  = parseNorthStarValue(ns.target);
  const nsGap = (nsCurrentNum !== null && nsTargetNum !== null && nsTargetNum > nsCurrentNum)
    ? nsTargetNum - nsCurrentNum : null;
  const forwardPipeline = (dash.contributionTotals.inflight || 0)
    + (dash.contributionTotals.pipeline || 0);
  // The period suffix on the north star ("/mo", "/qtr", …), reused verbatim so
  // the gap is never presented as a bare, period-less number.
  const nsPeriod = (ns.target || "").match(/\/\s*(\w+)/);
  const nsPeriodLabel = nsPeriod ? "/" + nsPeriod[1] : "";

  // Cross-brand transfer opportunities — top 3, only shown if >= 2 exist.
  const transfers = buildCrossBrandTransfers(items, brands).slice(0, 3);

  // North star. A plain card with one progress bar: the figure is the content,
  // so it is set in ink, and the accent is spent on the bar that says how far
  // along it is. It leads the KPI row rather than sitting above it.
  const northStarCard = (()=>{
        const pct = (nsCurrentNum !== null && nsTargetNum)
          ? Math.max(0, Math.min(100, Math.round(nsCurrentNum / nsTargetNum * 100))) : null;
        return (
          <div data-tour="northstar" className="gos-enter" style={{...gCd(t),padding:"20px 22px",display:"flex",flexDirection:"column",justifyContent:"space-between",gap:14,flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:500,color:t.textMuted,fontFamily:t.sans}}>
                North star · <span style={{color:t.text}}>{ns.metric}</span>
                {activeBrand!=="all"&&<> · <span style={{color:t.gold}}>{brandName(activeBrand,brands)}</span></>}
              </span>
              {pct !== null && (
                <span style={{fontSize:12,fontWeight:500,color:t.gold,background:t.goldBg,borderRadius:t.r.pill,padding:"2px 9px",fontFamily:t.sans}}>{pct}% to target</span>
              )}
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:t.fs.display,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.02em",lineHeight:1}}>{ns.current}</span>
              <span style={{fontSize:14,color:t.textMuted,fontFamily:t.sans}}>of {ns.target} target</span>
            </div>
            {pct !== null && (
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to north star target"
                style={{height:8,borderRadius:t.r.pill,background:t.borderSoft,overflow:"hidden"}}>
                <div className="gos-grow" style={{width:pct+"%",height:"100%",borderRadius:t.r.pill,background:t.goldFill}}/>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",fontSize:13,color:t.textMuted,fontFamily:t.sans}}>
              {nsGap !== null ? (
                <span title="Weighted pipeline is the sum of estimated revenue on running and draft initiatives, each multiplied by its category win rate. It is an absolute figure over each initiative's own run length, so it is shown alongside the gap rather than divided into it.">
                  Gap <strong style={{color:t.text,fontWeight:600}}>{fmtCur(nsGap)}</strong>{nsPeriodLabel}
                  <span style={{margin:"0 8px",color:t.textFaint}}>·</span>
                  Weighted pipeline <strong style={{color:t.text,fontWeight:600}}>{fmtCur(forwardPipeline)}</strong>
                </span>
              ) : <span/>}
              <span>{settings.businessModel}</span>
            </div>
          </div>
        );
      })();

  return (
    <div style={{padding:"24px 32px 40px",display:"flex",flexDirection:"column",gap:16}}>
      {/* KPI row — the north star leads, the business-health guardrails follow.
        * These read the latest logged week, as Weekly Pulse does; the range
        * control further down governs only the results section under it. */}
      <BusinessHealthPanel t={t} settings={settings} weeklyMetrics={weeklyMetrics} activeBrand={activeBrand} lead={northStarCard}/>

      {/* What needs a decision this week, beside what to try next. */}
      <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"minmax(0,3fr) minmax(0,2fr)",gap:16,alignItems:"stretch"}}>
      {/* This week's focus — attention nudges + weekly standup entry point.
        * A white card with amber state pills rather than an amber panel: the
        * panel tinted the whole block as an alarm, and red "running 36d" chips
        * read as errors when they are reminders. */}
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
          <div style={{...gCd(t),padding:hasNudges?"18px 20px 6px":"18px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:hasNudges?6:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.01em"}}>
                  {hasNudges ? "Needs attention" : "This week's focus"}
                </span>
                {hasNudges && (
                  <span style={{fontSize:12,fontWeight:500,color:t.textSub,background:t.borderSoft,borderRadius:t.r.pill,padding:"1px 8px",fontFamily:t.sans}}>{nudges.length}</span>
                )}
              </div>
              <button onClick={()=>setShowStandup(true)} style={gGh(t,"sm")}>Weekly standup</button>
            </div>
            {hasNudges && (
              <div style={{display:"flex",flexDirection:"column"}}>
                {nudges.map(({type,item},i)=>{
                  const days = type==="expiring"
                    ? Math.ceil((new Date(item.endDate+"T12:00:00") - today) / 86400000)
                    : Math.ceil((today - new Date(item.startDate+"T12:00:00")) / 86400000);
                  return (
                    <button key={i} type="button" onClick={()=>onOpenItem&&onOpenItem(item.id)} disabled={!onOpenItem}
                      {...(()=>{const p=interactive(t,null,{flat:true});return{className:p.className+" gos-row",style:{...p.style,display:"flex",gap:12,alignItems:"center",width:"calc(100% + 16px)",margin:"0 -8px",padding:"12px 8px",textAlign:"left",border:"none",borderTop:"1px solid "+t.borderSoft,borderRadius:t.r.sm,background:"transparent",cursor:onOpenItem?"pointer":"default",fontFamily:t.sans}};})()}
                      title={onOpenItem ? "Open "+item.title : undefined}>
                      <span aria-hidden="true" style={{width:8,height:8,borderRadius:"50%",background:t.warn,flexShrink:0}}/>
                      <span style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:14,fontWeight:500,color:t.text,fontFamily:t.sans,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</span>
                        {item.owner&&<span style={{fontSize:12.5,color:t.textMuted,fontFamily:t.sans}}>{item.owner}</span>}
                      </span>
                      <span style={{fontSize:12,fontWeight:500,fontFamily:t.sans,color:t.warn,background:t.warnBg,
                        borderRadius:t.r.pill,padding:"2px 9px",flexShrink:0,whiteSpace:"nowrap"}}>
                        {type==="expiring" ? `Ends in ${days} day${days===1?"":"s"}` : `Running ${days} days`}
                      </span>
                      <span className="gos-row-go" aria-hidden="true" style={{color:t.textFaint,display:"flex"}}><IconChevronRight size={14}/></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

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

      </div>

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

      {/* Weekly Pulse */}
      <WeeklyPulseSection
        t={t}
        brands={brands}
        weeklyMetrics={weeklyMetrics}
        onLog={onLog}
        onImport={onImport}
      />


      {/* Scope bar.
        *
        * The range control used to sit seventh down the page, below the north
        * star, the attention nudges, Next Plays, Weekly Pulse and Business
        * Health — none of which it governs — and above the ten tiles and six
        * analytical panels, all of which it does. Nothing said so, so a reader
        * could not tell which numbers on the page were scoped and which were
        * not. It now sits beside the heading of the section it actually
        * filters, under a rule, so the scope is carried by the layout rather
        * than by a sentence explaining it.
        *
        * The executive summary button came with it: it was a right-floated
        * control belonging to no section, sitting between two panels, and it is
        * one of the most valuable actions in the product. */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:12,flexWrap:"wrap",
        borderTop:"1px solid "+t.border,paddingTop:20,marginTop:6}}>
        <div>
          <h2 style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.01em",margin:"0 0 10px"}}>Results</h2>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            {/* The selected option's surface slides to it rather than jumping,
              * so the change reads as one control moving, not three repainting.
              * Equal columns make the indicator's position a simple offset. */}
            {(()=>{
              const opts=[["thisMonth","This month"],["lastMonth","Last month"],["custom","Custom"]];
              const at=Math.max(0,opts.findIndex(([v])=>v===dRange));
              return (
                <div role="group" aria-label="Date range" style={{position:"relative",display:"grid",gridTemplateColumns:"repeat("+opts.length+",minmax(0,1fr))",background:t.borderSoft,padding:3,borderRadius:t.r.md}}>
                  <span aria-hidden="true" style={{position:"absolute",top:3,bottom:3,left:3,width:"calc((100% - 6px) / "+opts.length+")",
                    transform:"translateX("+(at*100)+"%)",transition:"transform .22s cubic-bezier(.2,.7,.3,1)",
                    background:t.surface,borderRadius:t.r.sm,boxShadow:t.shadow}}/>
                  {opts.map(([v,l])=>(
                    <button key={v} onClick={()=>setDRange(v)} aria-pressed={dRange===v} className="gos-nav"
                      style={{position:"relative",fontSize:13,padding:"5px 14px",borderRadius:t.r.sm,cursor:"pointer",fontFamily:t.sans,fontWeight:500,background:"transparent",border:"none",color:dRange===v?t.text:t.textSub,transition:"color .15s ease",whiteSpace:"nowrap"}}>{l}</button>
                  ))}
                </div>
              );
            })()}
            {dRange==="custom"&&<>
              <input type="date" aria-label="Range start" value={cFrom} onChange={e=>setCFrom(e.target.value)} style={{fontSize:12,padding:"6px 9px",borderRadius:t.r.md,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.sans}}/>
              <span style={{color:t.textMuted,fontSize:12}}>to</span>
              <input type="date" aria-label="Range end" value={cTo} onChange={e=>setCTo(e.target.value)} style={{fontSize:12,padding:"6px 9px",borderRadius:t.r.md,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontFamily:t.sans}}/>
            </>}
          </div>
        </div>
        <button style={gGh(t,"sm")}
          onClick={()=>{
            const retailerLabel = activeBrand==="all"?"All retailers":brandName(activeBrand,brands);
            const date = fmtDateLong();
            const headline = dash.revImpacted>0
              ? fmtCur(dash.revImpacted)+" in measured revenue impact from completed work this period."
              : (dash.running+dash.pipeline)+" initiatives in motion; "+fmtCur(dash.revAtRisk)+" of revenue in play.";
            const text = [
              ((settings.companyName||"Portfolio").toUpperCase())+" — WEEKLY GROWTH UPDATE · "+retailerLabel,
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
              "• Measured impact (completed): "+fmtCur(dash.revImpacted),
              "• ROI on closed work: "+(dash.closedROI!==null?dash.closedROI+"x return":"not yet measurable"),
              "• Avg time to close: "+(dash.avgDays?dash.avgDays+" days":"n/a"),
              "",
              "FORECAST",
              "• Probability-weighted revenue in-flight: "+fmtCur(dash.contributionTotals.inflight),
              "• Probability-weighted pipeline: "+fmtCur(dash.contributionTotals.pipeline),
              "• Estimate accuracy to date: "+(dash.calibration!==null?dash.calibration+"%":"not yet measurable"),
              "",
              "Tracked in Marketers Lab · "+date,
            ].join("\n");
            try { navigator.clipboard.writeText(text); showToast("Executive summary copied. Ready to paste.", "success"); } catch { showToast("Couldn't copy to clipboard.", "error"); }
          }}>
          <IconCopy size={13}/> Copy executive summary
        </button>
      </div>

      {/* KPIs.
        *
        * Ten tiles at near-equal weight, with only the first marked `hero`, is
        * the same as no hierarchy at all — Stripe's dashboard leads with three
        * numbers and makes you ask for the rest. The four that answer "how is
        * the portfolio doing" lead; the six that answer "what is in it" are a
        * click away and remembered per session. */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
        {PRIMARY_TILES(dash).map((m,mi)=>(
          <StatTile key={m.l} t={t} m={m} index={mi} big onNav={onNav}/>
        ))}
      </div>

      <div>
        <button onClick={()=>setShowAllTiles(x=>!x)} aria-expanded={showAllTiles}
          style={{background:"none",border:"none",padding:"2px 0",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
            color:t.textMuted,fontSize:11.5,fontFamily:t.sans}}>
          {showAllTiles?<IconChevronDown size={12}/>:<IconChevronRight size={12}/>}
          {showAllTiles?"Hide portfolio counts":"Portfolio counts, quality and duration"}
        </button>
        {showAllTiles&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginTop:10}}>
            {SECONDARY_TILES(dash).map((m,mi)=>(
              <StatTile key={m.l} t={t} m={m} index={mi}/>
            ))}
          </div>
        )}
      </div>

      {/* Funnel coverage map — diagnostic: where work & revenue sit across the funnel */}
      <FunnelCoverageMap t={t} items={items} cats={cats} brands={brands} activeBrand={activeBrand}/>

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
            <span style={{fontSize:10,color:t.textMuted,fontFamily:t.sans}}>proven at one brand, not yet running at another</span>
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
        <div className="gos-grid-3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,alignItems:"center",marginBottom:dash.totalEstCost>0?12:0}}>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginBottom:2}}>Total estimated</div>
            <div style={{fontSize:22,fontWeight:700,color:t.text,fontFamily:t.sans,letterSpacing:"-0.02em"}}>{fmtCur(dash.totalEstimated)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginBottom:2}}>Total actual</div>
            <div style={{fontSize:22,fontWeight:600,color:t.text,fontFamily:t.sans,letterSpacing:"-0.02em"}}>{fmtCur(dash.totalActual)}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginBottom:2}}>Accuracy</div>
            <div style={{fontSize:24,fontWeight:700,fontFamily:t.sans,color:dash.calibration===null?t.textMuted:dash.calibration>=80?t.gold:dash.calibration>=50?t.warn:t.red}}>
              {dash.calibration!==null?dash.calibration+"%":"—"}
            </div>
            {dash.calibration!==null&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,marginTop:2}}>{dash.calibration>=80?"Well calibrated":dash.calibration>=50?"Moderate accuracy":"Overestimating"}</div>}
          </div>
        </div>
        {dash.totalEstCost>0&&(
          <div className="gos-grid-3" style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+t.border,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginBottom:2}}>Total est. cost</div>
              <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.sans}}>{fmtCur(dash.totalEstCost)}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginBottom:2}}>Total actual cost</div>
              <div style={{fontSize:18,fontWeight:700,color:t.text,fontFamily:t.sans}}>{dash.totalActualCost>0?fmtCur(dash.totalActualCost):"—"}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:t.textMuted,fontFamily:t.sans,marginBottom:2}}>Closed ROI</div>
              <div style={{fontSize:22,fontWeight:700,fontFamily:t.sans,color:dash.closedROI===null?t.textMuted:dash.closedROI>=2?t.gold:dash.closedROI>=1?t.warn:t.red}}>
                {dash.closedROI!==null?dash.closedROI+"x":"—"}
              </div>
              {dash.closedROI!==null&&<div style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,marginTop:2}}>{dash.closedROI>=3?"Strong return":dash.closedROI>=1?"Positive":"Negative"}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Portfolio composition.
        *
        * Velocity, category mix, type mix and outcome counts are diagnostics
        * you consult when a number above them looks wrong — not things anyone
        * opens the dashboard to read. They were four full-width panels at the
        * foot of a fifteen-panel scroll, which is a lot of page for a question
        * nobody asked yet. */}
      <div>
        <button onClick={()=>setShowComposition(x=>!x)} aria-expanded={showComposition}
          style={{background:"none",border:"none",padding:"2px 0",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
            color:t.textMuted,fontSize:11.5,fontFamily:t.sans}}>
          {showComposition?<IconChevronDown size={12}/>:<IconChevronRight size={12}/>}
          {showComposition?"Hide composition":"Velocity, category, type and outcome mix"}
        </button>
        {showComposition&&(
          <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:12}}>
        {/* Velocity + Category + Type */}
        <div className="gos-grid-2" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
          <div style={gCd(t)}>
            <div style={gSL(t)}>Velocity · last 8 weeks</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[{label:"Started / week",vals:dash.vel.started,color:t.teal},{label:"Closed / week",vals:dash.vel.closed,color:t.gold}].map(row=>(
                <div key={row.label}>
                  <div style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,marginBottom:4}}>{row.label}</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <Spark vals={row.vals} color={row.color} w={120} h={26}/>
                    <span style={{fontSize:20,fontWeight:700,color:t.text,fontFamily:t.sans}}>{row.vals[row.vals.length-1]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={gCd(t)}>
            <div style={gSL(t)}>By category</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {cats.map((cat,ci)=>{
                const n=dash.catCounts[cat]||0,pct=maxCat>0?Math.round((n/maxCat)*100):0;
                return(
                  <div key={cat} className="gos-charge" style={{padding:"1px 0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:12,color:t.textSub,fontFamily:t.sans}}>{cat}</span>
                      <span style={{fontSize:12,color:t.textMuted,fontFamily:t.sans}}>{n}</span>
                    </div>
                    <ChargeBar t={t} pct={pct} height={5} muted={n===0} index={ci}/>
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
            {INIT_TYPES.map((tp,ti)=>{
              const n=dash.typeCounts[tp]||0,pct=maxType>0?Math.round((n/maxType)*100):0;
              return(
                <div key={tp} className="gos-charge" style={{padding:"1px 0"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:12,color:t.textSub,fontFamily:t.sans}}>{tp}</span>
                    <span style={{fontSize:12,color:t.textMuted,fontFamily:t.sans}}>{n}</span>
                  </div>
                  <ChargeBar t={t} pct={pct} height={5} muted={n===0} index={ti}/>
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
                <div style={{fontSize:20,fontWeight:700,color:c.text||t.text,fontFamily:t.sans}}>{dash.outCounts[o]||0}</div>
                <div style={{fontSize:11,color:c.text||t.textMuted,opacity:0.85,fontFamily:t.sans}}>{o}</div>
              </div>
            );})}
          </div>
        </div>
          </div>
        )}
      </div>

      <button style={{...gGh(t),alignSelf:"flex-start"}} onClick={onGo}>View initiatives</button>
    </div>
  );
}
