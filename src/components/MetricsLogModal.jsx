import { useState } from "react";
import { Modal } from "./Modal.jsx";
import { FR } from "./FR.jsx";
import { gG, gGh, gI } from "./styles.js";
import { iconFor } from "./iconRegistry.js";
import { METRIC_SOURCES } from "../constants.js";

// Weekly metrics log modal — manual entry per brand, source-filtered fields
export function MetricsLogModal({t, dk, brands, weeklyMetrics, onSave, onClose}) {
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState(
    brands.map(b => ({ brandId: b.id, source: "manual", metrics: {} }))
  );

  const updateRow = (idx, field, val) => {
    setRows(r => r.map((row,i) => i===idx ? {...row, [field]: val} : row));
  };
  const updateMetric = (idx, key, val) => {
    setRows(r => r.map((row,i) => i===idx ? {...row, metrics:{...row.metrics,[key]:val}} : row));
  };

  const handleSave = () => {
    const newEntries = rows
      .filter(row => Object.values(row.metrics).some(v => v !== "" && v !== undefined))
      .map(row => {
        const src = METRIC_SOURCES.find(s=>s.id===row.source);
        const cleanMetrics = {};
        if (src) {
          src.fields.forEach(f => {
            const v = row.metrics[f.key];
            if (v !== "" && v !== undefined) {
              cleanMetrics[f.key] = f.type === "number" ? parseFloat(v)||0 : v;
            }
          });
        }
        return { date, brand: row.brandId, source: row.source, metrics: cleanMetrics };
      });

    if (!newEntries.length) { onClose(); return; }

    // Deduplicate: replace existing entries for same date+brand+source
    const filtered = weeklyMetrics.filter(m =>
      !newEntries.some(e => e.date===m.date && e.brand===m.brand && e.source===m.source)
    );
    onSave([...newEntries, ...filtered].sort((a,b)=>b.date.localeCompare(a.date)));
    onClose();
  };

  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title="Log this week's metrics">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <FR label="Week ending / reporting date" t={t}>
          <input type="date" style={gI(t)} value={date} onChange={e=>setDate(e.target.value)}/>
        </FR>

        {rows.map((row, idx) => {
          const brand = brands[idx];
          const srcDef = METRIC_SOURCES.find(s=>s.id===row.source);
          return (
            <div key={idx} style={{border:"1px solid "+t.border,borderRadius:6,padding:"12px 14px",background:t.surfaceAlt}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{fontSize:13,fontWeight:600,color:t.text,fontFamily:t.serif}}>{brand.name}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {METRIC_SOURCES.map(s=>(
                    <button key={s.id} onClick={()=>updateRow(idx,"source",s.id)}
                      style={{fontSize:10,padding:"3px 8px",borderRadius:4,cursor:"pointer",fontFamily:t.serif,
                        background:row.source===s.id?t.gold:"transparent",
                        border:"1px solid "+(row.source===s.id?t.gold:t.border),
                        color:row.source===s.id?t.goldText:t.textMuted,fontWeight:row.source===s.id?700:400}}>
                      {(()=>{const A=iconFor(s.icon);return <A size={12}/>;})()} {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
                {srcDef && srcDef.fields.map(f=>(
                  <div key={f.key} style={{display:"flex",flexDirection:"column",gap:3}}>
                    <label style={{fontSize:10,color:t.textMuted,fontFamily:t.serif}}>{f.label}</label>
                    {f.type==="text"
                      ? <input style={{...gI(t),fontSize:12}} value={row.metrics[f.key]||""} placeholder={f.hint} onChange={e=>updateMetric(idx,f.key,e.target.value)}/>
                      : <input style={{...gI(t),fontSize:12}} type="number" step="any" value={row.metrics[f.key]||""} placeholder={f.hint} onChange={e=>updateMetric(idx,f.key,e.target.value)}/>
                    }
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
          <button style={gGh(t)} onClick={onClose}>Cancel</button>
          <button style={gG(t)} onClick={handleSave}>Save metrics</button>
        </div>
      </div>
    </Modal>
  );
}
