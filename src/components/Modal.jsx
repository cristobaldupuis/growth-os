import { useId } from "react";
import { useDialog } from "./useDialog.js";

// Every modal in the app routes through here, which is why the dialog
// semantics live in one file rather than eleven: Escape to dismiss, a focus
// trap, focus returned to whatever opened it, and the roles a screen reader
// needs to announce it as a dialog rather than as more page.
//
// `onRequestClose` is the guarded exit — scrim click, Escape, and the ✕ all go
// through it, so a caller with unsaved edits can intercept all three at once
// instead of remembering to guard each. It defaults to `onClose`.
export function Modal({ t, dk, onClose, onRequestClose, children, title, wide, labelledBy }) {
  const close = onRequestClose || onClose;
  const titleId = useId();
  const ref = useDialog({ onClose: close });

  return (
    <div style={{position:"fixed",inset:0,background:dk?"rgba(0,0,0,0.7)":"rgba(20,18,10,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)close();}}>
      <div ref={ref} role="dialog" aria-modal="true"
        aria-labelledby={labelledBy || (title ? titleId : undefined)}
        aria-label={!title && !labelledBy ? "Dialog" : undefined}
        tabIndex={-1}
        style={{background:t.surface,border:"1px solid "+t.border,borderRadius:10,padding:24,width:"100%",maxWidth:wide?560:440,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.18)",outline:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          {title&&<span id={titleId} style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif}}>{title}</span>}
          <button onClick={close} aria-label="Close dialog"
            style={{marginLeft:"auto",background:"transparent",border:"none",color:t.textMuted,cursor:"pointer",fontSize:17,lineHeight:1,padding:2}}>
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
