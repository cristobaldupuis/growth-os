// The console's visual language.
//
// Deliberately not src/components/styles.js and deliberately not the `t` theme
// object every view takes. Marketers Lab is gold, Lora serif, generous spacing — it is
// a product surface a client looks at. This is a control panel for one operator,
// and the two should not be mistakable for each other at a glance: someone who has
// this open is one click from changing what every visitor's session runs on, and
// the interface should feel like that rather than like the app with an extra tab.
//
// The practical consequence of keeping it separate is that nothing here can drift
// into the product bundle, and a restyle of either cannot break the other.
//
// Monospace throughout, tight leading, near-black. Colour is used only where it
// carries information: green for the current assignment, amber for "not durable",
// red for a failure. Nothing is coloured for decoration.

export const c = {
  bg:        "#0b0d10",
  surface:   "#14171c",
  surfaceAlt:"#1b1f26",
  border:    "#282e38",
  borderLit: "#3a424f",
  text:      "#e6e9ee",
  textSub:   "#a8b0bd",
  textMuted: "#6b7480",
  accent:    "#5ac8fa",
  ok:        "#3ddc97",
  warn:      "#f5a623",
  bad:       "#ff6b6b",
  mono:      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
};

export const page = {
  minHeight: "100vh",
  background: c.bg,
  color: c.text,
  fontFamily: c.mono,
  fontSize: 13,
  lineHeight: 1.55,
};

export const panel = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 4,
  padding: "14px 16px",
};

export const label = {
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: c.textMuted,
  fontWeight: 600,
};

export const input = {
  width: "100%",
  background: c.bg,
  color: c.text,
  border: `1px solid ${c.border}`,
  borderRadius: 3,
  padding: "7px 9px",
  fontFamily: c.mono,
  fontSize: 12.5,
  boxSizing: "border-box",
};

export const button = (kind = "default") => {
  const base = {
    fontFamily: c.mono,
    fontSize: 12,
    padding: "7px 13px",
    borderRadius: 3,
    cursor: "pointer",
    border: `1px solid ${c.borderLit}`,
    background: c.surfaceAlt,
    color: c.text,
    letterSpacing: "0.02em",
  };
  if (kind === "primary") return { ...base, background: c.accent, color: "#06212b", border: `1px solid ${c.accent}`, fontWeight: 700 };
  if (kind === "quiet")   return { ...base, background: "transparent", color: c.textSub };
  if (kind === "danger")  return { ...base, color: c.bad, border: `1px solid ${c.bad}` };
  return base;
};

export const tag = (color) => ({
  display: "inline-block",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: 2,
  border: `1px solid ${color}`,
  color,
  fontWeight: 600,
  whiteSpace: "nowrap",
});
