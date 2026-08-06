import { useEffect, useLayoutEffect, useState } from "react";
import { gG, gGh } from "./styles.js";
import { TOUR_STEPS } from "./tourSteps.js";

const MARGIN = 10;
const CARD_W = 320;

// Measures one step's target element and reports its rect (or null if it
// can't be found). Keyed by the parent on stepIndex so a step change remounts
// this fresh, so state starts at null for free with no reset inside the effect
// itself, which is what set-state-in-effect wants to see.
function useTargetRect(selector) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    let raf, cancelled = false, tries = 0;
    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(selector);
      // A `display:none` element is still in the DOM and still answers
      // getBoundingClientRect — with zeroes. Three of these anchors now live in
      // the sidebar, which is hidden below 900px, so without this check the
      // spotlight would frame a 12px box in the top-left corner instead of
      // falling through to the centered card the null branch already provides.
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      // The view this selector lives in may still be switching in (a nav
      // change triggered by this same step). Poll briefly before giving up.
      if (tries++ < 40) { raf = requestAnimationFrame(measure); }
    };
    raf = requestAnimationFrame(measure);
    const onReflow = () => { if (document.querySelector(selector)) measure(); };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener("resize", onReflow); window.removeEventListener("scroll", onReflow, true); };
  }, [selector]);
  return rect;
}

function TourSpotlight({ t, dk, stepIndex, step, isLast, onBack, onNext, onSkip, onDone }) {
  const rect = useTargetRect(step.selector);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(CARD_W, vw - MARGIN*2);
  const scrim = dk ? "rgba(0,0,0,0.55)" : "rgba(20,18,10,0.35)";

  // Prefer below the target, then above, then a centered fallback when the
  // element couldn't be found at all (e.g. selector missing at this size).
  let cardStyle;
  if (rect) {
    const roomBelow = vh - (rect.top + rect.height);
    const placeBelow = roomBelow > 190 || roomBelow >= rect.top;
    const top = placeBelow ? Math.min(rect.top + rect.height + 14, vh - 20) : undefined;
    const bottom = !placeBelow ? Math.max(vh - rect.top + 14, 20) : undefined;
    const left = Math.max(MARGIN, Math.min(rect.left, vw - cardW - MARGIN));
    cardStyle = { position:"fixed", top, bottom, left, width:cardW, zIndex:402 };
  } else {
    cardStyle = { position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:cardW, zIndex:402 };
  }

  return (
    <>
      {/* Click-blocking scrim. The spotlight cutout below is purely visual
        * (box-shadow). This full-viewport layer is what actually stops
        * interaction with the app underneath while the tour is active. */}
      <div style={{position:"fixed",inset:0,zIndex:400,background:scrim}}/>

      {rect && (
        <div style={{
          position:"fixed", top:rect.top-6, left:rect.left-6, width:rect.width+12, height:rect.height+12,
          borderRadius:12, border:"2px solid "+t.gold, boxShadow:"0 0 0 9999px "+scrim,
          zIndex:401, pointerEvents:"none",
        }}/>
      )}

      <div style={{...cardStyle, background:t.surface, border:"1px solid "+t.goldBorder, borderRadius:14, padding:"16px 18px", boxShadow:t.shadowHi}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:t.gold,fontFamily:t.mono}}>
            {stepIndex+1} of {TOUR_STEPS.length}
          </span>
          <button onClick={onSkip} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:11,fontFamily:t.sans,textDecoration:"underline",padding:0}}>
            Skip
          </button>
        </div>
        <div style={{fontSize:15,fontWeight:600,color:t.text,fontFamily:t.serif,marginBottom:6}}>{step.title}</div>
        <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.serif,lineHeight:1.55,marginBottom:14}}>{step.body}</div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          {stepIndex>0 && <button onClick={onBack} style={{...gGh(t),fontSize:12,padding:"6px 13px"}}>Back</button>}
          <button onClick={isLast?onDone:onNext} style={{...gG(t),fontSize:12,padding:"6px 14px"}}>{isLast?"Done":"Next"}</button>
        </div>
      </div>
    </>
  );
}

export function GuidedTour({ t, dk, stepIndex, currentNav, onNavigate, onNext, onBack, onSkip, onDone }) {
  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  // Switch the app to whichever view this step is anchored in. The target DOM
  // node doesn't exist until that view renders, which is what TourSpotlight's
  // retry loop (keyed fresh on stepIndex below) is waiting out.
  useEffect(() => {
    if (step.nav && step.nav !== currentNav) onNavigate(step.nav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  return (
    <TourSpotlight
      key={stepIndex}
      t={t} dk={dk} stepIndex={stepIndex} step={step} isLast={isLast}
      onBack={onBack} onNext={onNext} onSkip={onSkip} onDone={onDone}
    />
  );
}
