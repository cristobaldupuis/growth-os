export function Spark({vals,color,w,h}) {
  if (!vals||vals.length<2) return <span style={{fontSize:11,color:"#aaa"}}>—</span>;
  const W=w||120,H=h||28,mx=Math.max(...vals,1);
  const pts = vals.map((v,i)=>((i/(vals.length-1))*(W-4)+2).toFixed(1)+","+(H-2-((v/mx)*(H-4))).toFixed(1)).join(" ");
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      {vals.map((v,i)=>{const x=(i/(vals.length-1))*(W-4)+2,y=H-2-((v/mx)*(H-4)); return <circle key={i} cx={x} cy={y} r="2.2" fill={color}/>;})}
    </svg>
  );
}
