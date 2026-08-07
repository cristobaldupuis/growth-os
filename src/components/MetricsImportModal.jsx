import { useState } from "react";
import { Modal } from "./Modal.jsx";
import { gG, gGh, gSL, gSl } from "./styles.js";
import { METRIC_SOURCES, fmtCur, parseMetricsCSV } from "../constants.js";
import { splitCSVLine } from "../services/csvLine.js";
import { detectCsvShape, parsePerformanceCSV, mergePerformanceRows, attachInitiatives } from "../services/performance.js";
import { resolveSchema, listChannels } from "../services/naming.js";

// Weekly metrics CSV import modal
// -- Metrics import ------------------------------------------------------------
//
// One entry point, two accepted shapes. Which one a file is gets decided by
// `detectCsvShape` from its headers rather than by asking the operator to pick
// first, because the operator does not think of "my Meta export" and "my weekly
// numbers" as two different importers — they think of it as the CSV they just
// downloaded. Getting the routing wrong is also cheap to notice and impossible
// to act on silently: the preview names the shape it detected before anything
// is written.
//
//   weekly       {date, brand, source, metrics:{}} — one row per week per brand.
//   performance  one row per ad entity per day, with dimensions inside the name.
//
// The performance path additionally needs the channel, because parsing a name
// positionally means knowing which template produced it. "Detect" is offered and
// is honest about ambiguity, but naming the channel is the reliable answer and
// the preview says so when detection fails.
export function MetricsImportModal({t, dk, weeklyMetrics, perfRows, items, settings, onSave, onSavePerf, showToast, onClose}) {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [shape, setShape] = useState("weekly"); // weekly | performance
  const [parsed, setParsed] = useState({rows:[], errors:[]});
  const [perf, setPerf] = useState({rows:[], errors:[], stats:null});
  const [rawText, setRawText] = useState("");
  const [channel, setChannel] = useState("");
  const [conflictMode, setConflictMode] = useState("overwrite"); // overwrite | skip

  const schema = resolveSchema(settings);
  const channels = listChannels(schema);
  // Default to the channel whose ad-level template the file's names actually
  // match, when there is exactly one — the common case, and it saves the
  // operator answering a question the data already answers.
  const effChannel = channel || channels[0]?.id || "meta";

  const readPerf = (text, ch) => {
    const res = parsePerformanceCSV(text, schema, { channel: ch });
    setPerf(res);
    return res;
  };

  const ingest = (text) => {
    setRawText(text);
    const headers = splitCSVLine((text.split(/\r?\n/)[0] || ""));
    const detected = detectCsvShape(headers);
    setShape(detected.shape);
    if (detected.shape === "performance") {
      // Try each channel and prefer one that parses everything; fall back to
      // the first rather than to "auto", since a named channel is deterministic.
      const scored = channels.map(c => ({ id: c.id, res: parsePerformanceCSV(text, schema, { channel: c.id }) }))
        .map(x => ({ ...x, ok: x.res.rows.filter(r => r.parsed).length }));
      const best = scored.sort((a,b) => b.ok - a.ok)[0];
      const pick = best && best.ok > 0 ? best.id : (channels[0]?.id || "meta");
      setChannel(pick);
      setPerf(best && best.ok > 0 ? best.res : parsePerformanceCSV(text, schema, { channel: pick }));
    } else {
      setParsed(parseMetricsCSV(text));
    }
    setStep("preview");
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => ingest(ev.target.result);
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => ingest(ev.target.result);
    reader.readAsText(file);
  };

  const handleConfirmPerf = () => {
    const { rows, dropped } = mergePerformanceRows(perfRows || [], perf.rows);
    onSavePerf(rows);
    const { counts } = attachInitiatives(perf.rows, items, schema);
    const bits = [`${perf.rows.length} row${perf.rows.length!==1?"s":""} imported`];
    if (counts.matched)   bits.push(`${counts.matched} attributed to initiatives`);
    if (counts.unmatched) bits.push(`${counts.unmatched} with a tag that resolves to nothing`);
    if (dropped)          bits.push(`${dropped} oldest row${dropped!==1?"s":""} dropped at the storage ceiling`);
    if (showToast) showToast(bits.join(" · "), counts.unmatched ? "info" : "success");
    setStep("done");
    setTimeout(onClose, 1200);
  };

  const handleConfirm = () => {
    const existing = [...weeklyMetrics];
    let merged;
    if (conflictMode === "overwrite") {
      const filtered = existing.filter(m =>
        !parsed.rows.some(r => r.date===m.date && r.brand===m.brand && r.source===m.source)
      );
      merged = [...parsed.rows, ...filtered].sort((a,b)=>b.date.localeCompare(a.date));
    } else {
      // skip: only add rows that don't already exist
      const newOnly = parsed.rows.filter(r =>
        !existing.some(m => m.date===r.date && m.brand===r.brand && m.source===r.source)
      );
      merged = [...newOnly, ...existing].sort((a,b)=>b.date.localeCompare(a.date));
    }
    onSave(merged);
    setStep("done");
    setTimeout(onClose, 1200);
  };

  const conflicts = parsed.rows.filter(r =>
    weeklyMetrics.some(m => m.date===r.date && m.brand===r.brand && m.source===r.source)
  );

  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title="Import CSV">
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {step==="done" && (
          <div style={{padding:"24px",textAlign:"center",color:t.teal,fontFamily:t.serif,fontSize:13}}>
            ✓ Imported successfully
          </div>
        )}

        {step==="upload" && (
          <>
            <div onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
              style={{border:"2px dashed "+t.border,borderRadius:8,padding:"28px",textAlign:"center",cursor:"pointer",background:t.surfaceAlt}}
              onClick={()=>document.getElementById("metrics-csv-input").click()}>
              <div style={{fontSize:28,marginBottom:8}}>📂</div>
              <div style={{fontSize:13,color:t.text,marginBottom:4}}>Drop your CSV here or click to upload</div>
              <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>Header-driven, so column order doesn't matter. The shape is detected from the headers.</div>
              <input id="metrics-csv-input" type="file" accept=".csv" style={{display:"none"}} onChange={handleFile}/>
            </div>
            <div style={{background:t.surfaceAlt,borderRadius:6,padding:"10px 12px",fontSize:11,fontFamily:t.serif,color:t.textMuted,lineHeight:1.7}}>
              <strong style={{color:t.textSub}}>Weekly numbers</strong> — needs <span style={{fontFamily:t.mono}}>date, brand, source</span>; then any of revenue, spend, roas, cvr, cac, aov, traffic, conversions, impressions, clicks, cpm, ctr, notes.<br/>
              <strong style={{color:t.textSub}}>Campaign export</strong> — needs an <span style={{fontFamily:t.mono}}>Ad name</span>, <span style={{fontFamily:t.mono}}>Ad set name</span>, <span style={{fontFamily:t.mono}}>Ad group name</span> or <span style={{fontFamily:t.mono}}>Campaign name</span> column. Each name is parsed through your naming convention and joined to an initiative by its tracking tag.<br/>
              Column names are case-insensitive, and platform export headers ("Amount spent (USD)", "Purchases conversion value", "Impr.") are recognised as they come.
            </div>
          </>
        )}

        {/* ------------------------------------------------ campaign-level preview */}
        {step==="preview" && shape==="performance" && (
          <>
            <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap",padding:"10px 12px",borderRadius:9,background:t.goldBg,border:"1px solid "+t.goldBorder}}>
              <div style={{flex:"1 1 260px",minWidth:0}}>
                <div style={{fontSize:12.5,color:t.text,fontFamily:t.serif,lineHeight:1.55}}>
                  <strong>Campaign-level export detected</strong> — {perf.identityLevel || "ad"}-level rows.
                  Names are parsed against your naming convention rather than treated as free text.
                </div>
              </div>
              <div>
                <div style={{...gSL(t),marginBottom:4}}>Channel</div>
                <select value={effChannel} onChange={e=>{setChannel(e.target.value); readPerf(rawText, e.target.value);}}
                  style={{...gSl(t),width:150,padding:"6px 9px",fontSize:12}}>
                  {channels.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>

            {perf.errors.length>0 && (
              <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:96,overflowY:"auto"}}>
                {perf.errors.slice(0,8).map((e,i)=>(
                  <div key={i} style={{fontSize:11,fontFamily:t.serif,padding:"4px 8px",background:t.warnBg,border:"1px solid "+t.warnBorder,borderRadius:4,color:t.text}}>{e}</div>
                ))}
              </div>
            )}

            {/* Coverage before confirmation. An import that parses 3 of 400 names
                is almost always the wrong channel, and this is where that is
                cheap to notice — after the write it is a wrong dashboard. */}
            <div style={{display:"flex",gap:18,flexWrap:"wrap",padding:"10px 12px",borderRadius:9,background:t.surfaceAlt,border:"1px solid "+t.border}}>
              {[
                ["Rows", (perf.stats?.total||0).toLocaleString()],
                ["Parsed", (perf.stats?.parsed||0).toLocaleString()],
                ["Unparsed", (perf.stats?.unparsed||0).toLocaleString()],
                ["Spend", fmtCur(Math.round(perf.stats?.spend||0))],
                ["Attributed", String(attachInitiatives(perf.rows, items, schema).counts.matched||0)],
              ].map(([l,v])=>(
                <div key={l}>
                  <div style={gSL(t)}>{l}</div>
                  <div style={{fontFamily:t.mono,fontSize:15,fontWeight:700,color:t.text,lineHeight:1.1}}>{v}</div>
                </div>
              ))}
            </div>

            {perf.stats && perf.stats.total>0 && perf.stats.parsed===0 && (
              <div style={{padding:"9px 12px",borderRadius:9,background:t.warnBg,border:"1px solid "+t.warnBorder,fontSize:12,color:t.text,fontFamily:t.serif,lineHeight:1.55}}>
                Nothing parsed against <strong>{channels.find(c=>c.id===effChannel)?.label}</strong>. Try another channel above —
                a slot-count mismatch means the names were built from a different template, and parsing refuses to guess
                at an alignment rather than mis-attributing every row.
              </div>
            )}

            <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
              {perf.rows.slice(0,120).map((row,i)=>(
                <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",borderRadius:4,
                  background:row.parsed?t.surfaceAlt:t.warnBg,border:"1px solid "+(row.parsed?t.border:t.warnBorder)}}>
                  <span style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,minWidth:74,flexShrink:0}}>{row.date||"lifetime"}</span>
                  <span style={{fontSize:10.5,fontFamily:t.mono,color:t.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.name}</span>
                  <span style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,flexShrink:0}}>{fmtCur(Math.round(row.metrics?.spend||0))}</span>
                  {!row.parsed && <span style={{fontSize:9,color:t.warn,fontFamily:t.mono,flexShrink:0}}>unparsed</span>}
                </div>
              ))}
              {perf.rows.length>120 && (
                <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,padding:"4px 10px"}}>…and {perf.rows.length-120} more rows.</div>
              )}
            </div>

            <div style={{display:"flex",gap:8,justifyContent:"space-between",paddingTop:4}}>
              <button style={gGh(t)} onClick={()=>setStep("upload")}>← Re-upload</button>
              <div style={{display:"flex",gap:8}}>
                <button style={gGh(t)} onClick={onClose}>Cancel</button>
                <button style={gG(t)} onClick={handleConfirmPerf} disabled={!perf.rows.length}>
                  Import {perf.rows.length} row{perf.rows.length!==1?"s":""}
                </button>
              </div>
            </div>
          </>
        )}

        {step==="preview" && shape==="weekly" && (
          <>
            {parsed.errors.length > 0 && (
              <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:100,overflowY:"auto"}}>
                {parsed.errors.map((e,i)=>(
                  <div key={i} style={{fontSize:11,fontFamily:t.serif,padding:"4px 8px",background:t.redBg,border:"1px solid "+(t.red),borderRadius:4,color:t.red}}>{e}</div>
                ))}
              </div>
            )}

            <div style={{fontSize:12,fontFamily:t.serif,color:t.textSub}}>
              <span style={{fontFamily:t.mono}}>{parsed.rows.length}</span> row{parsed.rows.length!==1?"s":""} ready to import
              {conflicts.length > 0 && <span style={{color:t.warn}}> · {conflicts.length} conflict{conflicts.length!==1?"s":""} with existing data</span>}
            </div>

            {conflicts.length > 0 && (
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:t.textMuted,fontFamily:t.serif}}>On conflict:</span>
                {[["overwrite","Overwrite existing"],["skip","Keep existing"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setConflictMode(v)}
                    style={{fontSize:11,padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:t.serif,
                      background:conflictMode===v?t.gold:"transparent",border:"1px solid "+(conflictMode===v?t.gold:t.border),
                      color:conflictMode===v?t.goldText:t.textMuted}}>{l}</button>
                ))}
              </div>
            )}

            <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
              {parsed.rows.map((row,i)=>{
                const isConflict = weeklyMetrics.some(m=>m.date===row.date&&m.brand===row.brand&&m.source===row.source);
                const srcDef = METRIC_SOURCES.find(s=>s.id===row.source);
                return (
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",
                    background:isConflict?(t.warnBg):t.surfaceAlt,
                    border:"1px solid "+(isConflict?(t.warnBorder):t.border),borderRadius:4}}>
                    <span style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,minWidth:80,flexShrink:0}}>{row.date}</span>
                    <span style={{fontSize:11,fontFamily:t.serif,color:t.text,fontWeight:600,minWidth:80,flexShrink:0}}>{row.brand}</span>
                    <span style={{fontSize:10,fontFamily:t.serif,color:t.textMuted,minWidth:60,flexShrink:0}}>{srcDef?.label||row.source}</span>
                    <span style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {Object.entries(row.metrics).filter(([k])=>k!=="notes").map(([k,v])=>`${k}: ${v}`).join(" · ")}
                    </span>
                    {isConflict&&<span style={{fontSize:9,color:t.warn,fontFamily:t.serif,flexShrink:0}}>conflict</span>}
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex",gap:8,justifyContent:"space-between",paddingTop:4}}>
              <button style={gGh(t)} onClick={()=>setStep("upload")}>← Re-upload</button>
              <div style={{display:"flex",gap:8}}>
                <button style={gGh(t)} onClick={onClose}>Cancel</button>
                <button style={gG(t)} onClick={handleConfirm} disabled={!parsed.rows.length}>
                  Import {parsed.rows.length} row{parsed.rows.length!==1?"s":""}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
