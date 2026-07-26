export function CBar({pct,t}) {
  const col = pct>=80?t.gold:pct>=60?t.warn:t.red;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{flex:1,height:4,background:t.border,borderRadius:2}}>
        <div style={{width:pct+"%",height:"100%",borderRadius:2,background:col}}/>
      </div>
      <span style={{fontSize:12,color:t.textMuted,minWidth:32,textAlign:"right"}}>{pct}%</span>
    </div>
  );
}
