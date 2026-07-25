export function FR({label,t,children}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <label style={{fontSize:12,color:t.textMuted,fontFamily:t.serif}}>{label}</label>
      {children}
    </div>
  );
}
