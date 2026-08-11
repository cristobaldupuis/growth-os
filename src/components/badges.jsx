import { renderProse } from "./text.jsx";
import { SD, SL, OD, OL, catColor, TYPE_D, TYPE_L, iceScore, iceColor, FONT_SERIF } from "../constants.js";

// -- Atoms ---------------------------------------------------------------------
export function Bdg({label,color,bg,border,small}) {
  return <span style={{display:"inline-block",fontSize:small?10:11,fontWeight:600,fontFamily:FONT_SERIF,letterSpacing:"0.03em",padding:small?"1px 6px":"2px 8px",borderRadius:4,border:"1px solid "+(border||"#ccc"),background:bg||"#f5f5f0",color:color||"#666",whiteSpace:"nowrap"}}>{renderProse(label)}</span>;
}
export function SBdg({s,dk})        { const c=(dk?SD:SL)[s]||SL.Draft; return <Bdg label={s} color={c.text} bg={c.bg} border={c.border}/>; }
export function OBdg({o,dk})        { const c=(dk?OD:OL)[o]||{};        return <Bdg label={o} color={c.text} bg={c.bg} border={c.border}/>; }
// `t` is optional on the two hue-driven badges so existing call sites that only
// pass `dk` keep working; when it is supplied the chrome comes from the theme
// instead of the old hardcoded warm-brown pair.
export function CBdg({cat,cats,dk,t}) { return <Bdg label={cat} color={catColor(cat,cats,dk)} bg={t?t.surfaceAlt:(dk?"#1D2026":"#F7F5EF")} border={t?t.border:(dk?"#2C303A":"#E0DCD2")}/>; }
export function TBdg({type,dk,t}) {
  const color = (dk?TYPE_D:TYPE_L)[type]||"#888";
  return <Bdg label={type} color={color} bg={t?t.surfaceAlt:(dk?"#1D2026":"#F7F5EF")} border={t?t.border:(dk?"#2C303A":"#E0DCD2")} small/>;
}

// Previously a fixed near-black chip with #ffd700 text and a double border, in
// both themes. It ignored the palette entirely and was by some distance the
// loudest thing on any screen it appeared on — a blocker is worth flagging, but
// not worth shouting over the initiative title next to it.
export function BlockerBadge({blocker,t}) {
  if (!blocker || blocker === "None") return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,fontFamily:FONT_SERIF,
      background:t?t.warnBg:"#FDF4E3",color:t?t.warn:"#8A5A0B",border:"1px solid "+(t?t.warnBorder:"#E0C176"),borderRadius:4,
      padding:"3px 9px",letterSpacing:"0.03em",whiteSpace:"nowrap"}}>
      Blocked: {blocker}
    </span>
  );
}

// Franchise / Loonshot (ROADMAP 5.2). Unset renders nothing — an unclassified
// initiative should read as unclassified, not as a silent "Franchise" default.
export function RiskBdg({riskType,t}) {
  if (riskType!=="Franchise" && riskType!=="Loonshot") return null;
  return riskType==="Loonshot"
    ? <Bdg label="Loonshot" color={t.gold} bg={t.goldBg} border={t.goldBorder} small/>
    : <Bdg label="Franchise" color={t.textMuted} bg={t.surfaceAlt} border={t.border} small/>;
}

export function ICEChip({ice,t}) {
  const s = iceScore(ice&&ice.impact, ice&&ice.certainty, ice&&ice.ease);
  if (s===null) return <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>No ICE</span>;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:iceColor(s,t),fontFamily:t.mono,border:"1px solid "+t.border,borderRadius:4,padding:"2px 7px"}}>ICE {s}</span>;
}
