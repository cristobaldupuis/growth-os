// -- Style helpers -------------------------------------------------------------
//
// These nine one-liners were the whole shared layer, and they were treated as
// suggestions: of a hundred and seventy buttons, sixty-three were entirely
// bespoke, and of the hundred and ten that used a helper, a hundred and
// twenty-seven usages spread-overrode it inline — `{...gG(t),fontSize:11,
// padding:"5px 11px"}`. The result was around sixty distinct button padding
// pairs and thirteen border radii.
//
// The helpers now read their numbers from the token scales in constants.js
// (reachable as `t.r`, `t.fs`, `t.sp`), and take a `size` so the common override
// is a parameter rather than a spread. The originals keep their names and their
// default appearance, so nothing that already calls them has to change.

/** Button sizes. Three, because a fourth is always someone splitting a hair. */
const SIZES = {
  sm: (t) => ({ fontSize: t.fs.small,  padding: "4px 10px",  gap: 5, radius: t.r.sm }),
  md: (t) => ({ fontSize: t.fs.body,   padding: "7px 14px",  gap: 6, radius: t.r.md }),
  lg: (t) => ({ fontSize: t.fs.medium, padding: "10px 18px", gap: 7, radius: t.r.md }),
};

const base = (t, size) => {
  const s = (SIZES[size] || SIZES.md)(t);
  return {
    fontSize: s.fontSize, padding: s.padding, borderRadius: s.radius,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: s.gap, cursor: "pointer", fontFamily: t.sans, lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
};

/** Primary. Gold fill, dark ink. One per view; two means neither is primary. */
export const gG = (t, size = "md") => ({
  ...base(t, size),
  background: t.goldFill, border: "1px solid " + t.goldFill,
  color: t.goldText, fontWeight: 600,
});

/** Secondary. The default for everything that is not the one primary action. */
export const gGh = (t, size = "md") => ({
  ...base(t, size),
  background: t.surfaceAlt, border: "1px solid " + t.border,
  color: t.textSub, fontWeight: 500,
});

/** Destructive. Red ink on a quiet ground — loud enough to read as dangerous,
 *  quiet enough that it is not the brightest thing on a page of safe controls. */
export const gGd = (t, size = "md") => ({
  ...base(t, size),
  background: t.redBg, border: "1px solid " + t.red,
  color: t.red, fontWeight: 600,
});

/** Bare. A control that reads as text until you point at it. */
export const gGq = (t, size = "md") => ({
  ...base(t, size),
  background: "transparent", border: "1px solid transparent",
  color: t.textMuted, fontWeight: 500,
});

/** The disabled treatment, applied by the caller alongside `disabled`. Kept as
 *  a helper so "unavailable" looks the same everywhere instead of being 0.4,
 *  0.45, 0.5 or 0.6 depending on the file. */
export const gOff = { opacity: 0.45, cursor: "not-allowed" };

export const gI  = (t) => ({width:"100%",padding:"8px 11px",fontSize:13,fontFamily:t.sans,background:t.inputBg,border:"1px solid "+t.inputBorder,borderRadius:t.r.md,color:t.text,boxSizing:"border-box"});
export const gTA = (t) => ({...gI(t),resize:"vertical"});
export const gSl = (t) => ({...gI(t),cursor:"pointer"});
export const gSc = (t) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:t.r.lg,padding:"15px 18px",boxShadow:t.shadow});
export const gSL = (t) => ({fontSize:t.fs.micro,letterSpacing:"0.11em",textTransform:"uppercase",color:t.textMuted,marginBottom:8,fontFamily:t.mono,fontWeight:600});
export const gCd = (t) => ({background:t.surface,border:"1px solid "+t.border,borderRadius:t.r.lg,padding:"15px 18px",boxShadow:t.shadow});
