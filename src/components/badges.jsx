import { renderNums } from "./text.jsx";
import { SD, SL, OD, OL, catColor, TYPE_D, TYPE_L, iceScore, iceColor, FONT_SERIF, FONT_MONO } from "../constants.js";

// -- Atoms ---------------------------------------------------------------------
export function Bdg({label,color,bg,border,small}) {
  return <span style={{display:"inline-block",fontSize:small?10:11,fontWeight:600,fontFamily:FONT_SERIF,letterSpacing:"0.03em",padding:small?"1px 6px":"2px 8px",borderRadius:4,border:"1px solid "+(border||"#ccc"),background:bg||"#f5f5f0",color:color||"#666",whiteSpace:"nowrap"}}>{renderNums(label, FONT_MONO, "bl")}</span>;
}
export function SBdg({s,dk})        { const c=(dk?SD:SL)[s]||SL.Draft; return <Bdg label={s} color={c.text} bg={c.bg} border={c.border}/>; }
export function OBdg({o,dk})        { const c=(dk?OD:OL)[o]||{};        return <Bdg label={o} color={c.text} bg={c.bg} border={c.border}/>; }
export function CBdg({cat,cats,dk}) { return <Bdg label={cat} color={catColor(cat,cats,dk)} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"}/>; }
export function TBdg({type,dk}) {
  const color = (dk?TYPE_D:TYPE_L)[type]||"#888";
  return <Bdg label={type} color={color} bg={dk?"#1e1e14":"#f8f7f2"} border={dk?"#2a2820":"#ddd8c8"} small/>;
}

export function BlockerBadge({blocker}) {
  if (!blocker || blocker === "None") return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,fontFamily:FONT_SERIF,
      background:"#1a1400",color:"#ffd700",border:"2px solid #ffd700",borderRadius:4,
      padding:"3px 9px",letterSpacing:"0.03em",whiteSpace:"nowrap",boxShadow:"0 0 0 1px #b8a000"}}>
      ⚠️ BLOCKED: {blocker}
    </span>
  );
}

export function ICEChip({ice,t}) {
  const s = iceScore(ice&&ice.impact, ice&&ice.certainty, ice&&ice.ease);
  if (s===null) return <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>No ICE</span>;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:iceColor(s,t),fontFamily:t.mono,border:"1px solid "+t.border,borderRadius:4,padding:"2px 7px"}}>ICE {s}</span>;
}
