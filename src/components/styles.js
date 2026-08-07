// -- Style helpers -------------------------------------------------------------
export const gG  = (t) => ({fontSize:12.5,padding:"7px 14px",borderRadius:9,background:t.goldFill,border:"1px solid "+t.goldFill,color:t.goldText,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:5,fontFamily:t.sans});
export const gGh = (t) => ({fontSize:12.5,padding:"7px 13px",borderRadius:9,background:t.surfaceAlt,border:"1px solid "+t.border,color:t.textSub,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontFamily:t.sans,fontWeight:500});
export const gI  = (t) => ({width:"100%",padding:"8px 11px",fontSize:13,fontFamily:t.sans,background:t.inputBg,border:"1px solid "+t.inputBorder,borderRadius:9,color:t.text,boxSizing:"border-box"});
export const gTA = (t) => ({...gI(t),resize:"vertical"});
export const gSl = (t) => ({...gI(t),cursor:"pointer"});
export const gSc = (t) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:14,padding:"15px 18px",boxShadow:t.shadow});
export const gSL = (t) => ({fontSize:10,letterSpacing:"0.11em",textTransform:"uppercase",color:t.textMuted,marginBottom:8,fontFamily:t.mono,fontWeight:600});
export const gCd = (t) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:14,padding:"15px 18px",boxShadow:t.shadow});
