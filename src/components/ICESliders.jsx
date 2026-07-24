import { iceScore, iceColor } from "../constants.js";

export function ICESliders({ice,onChange,t}) {
  const dims = [
    {key:"impact",    label:"Impact",    hint:"How big is the upside? 1=negligible, 10=game-changing"},
    {key:"certainty", label:"Certainty", hint:"How confident is the team the hypothesis is right? 1=gut feel, 10=strong evidence"},
    {key:"ease",      label:"Ease",      hint:"How easy to execute? 1=months of work, 10=days to ship"},
  ];
  const score = iceScore(ice&&ice.impact, ice&&ice.certainty, ice&&ice.ease);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {dims.map(d=>(
        <div key={d.key}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,color:t.textSub,fontFamily:t.serif}}>{d.label}</span>
            <span style={{fontSize:12,fontWeight:700,color:t.gold,fontFamily:t.mono}}>{(ice&&ice[d.key])||0}</span>
          </div>
          <input type="range" min={1} max={10} step={1} value={(ice&&ice[d.key])||5}
            onChange={e=>onChange({...ice,[d.key]:parseInt(e.target.value)})} style={{width:"100%"}}/>
          <div style={{fontSize:11,color:t.textMuted,fontFamily:t.serif,marginTop:2}}>{d.hint}</div>
        </div>
      ))}
      <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:4,borderTop:"1px solid "+t.border}}>
        <span style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>ICE Score:</span>
        <span style={{fontSize:18,fontWeight:700,fontFamily:t.mono,color:score!==null?iceColor(score,t):t.textMuted}}>{score!==null?score:"—"}</span>
        <span style={{fontSize:11,color:t.textMuted,fontFamily:t.mono}}>/100</span>
      </div>
    </div>
  );
}
