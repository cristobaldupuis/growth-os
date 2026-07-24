export function Modal({t,dk,onClose,children,title,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:dk?"rgba(0,0,0,0.7)":"rgba(20,18,10,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:t.surface,border:"1px solid "+t.border,borderRadius:10,padding:24,width:"100%",maxWidth:wide?560:440,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          {title&&<span style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif}}>{title}</span>}
          <button onClick={onClose} style={{marginLeft:"auto",background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",fontSize:17}}><span>&#10005;</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}
