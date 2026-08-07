// -- Interaction helpers -------------------------------------------------------
//
// The CSS lives in index.css; this is the seam that hands it colour and keeps
// every list in the app behaving the same way. The rule it encodes:
//
//   At rest, a surface is calm. On hover it earns its accent.
//
// Before this, three views had three different hover behaviours (the register
// cards recoloured their border inline, Next Plays swapped its background,
// Triage painted a permanent strip and did nothing on hover at all) and the
// other four had none. Pointing at something told you something different on
// every page, which is the same failure as the palette: an effect that is not
// applied consistently carries no meaning.
//
// `--gos-delay` is capped at ten steps deliberately. An uncapped stagger on a
// hundred-row import means the last row lands two and a half seconds after the
// first, and a list that is still assembling itself reads as slow, not as
// polished.

const STAGGER_MS = 26;
const STAGGER_CAP = 10;

/** Entry delay for the i-th item in a list, capped so long lists still snap. */
export const stagger = (i) => `${Math.min(i || 0, STAGGER_CAP) * STAGGER_MS}ms`;

/**
 * Props for an interactive card: lifts, and charges an accent rail down its
 * leading edge on hover.
 *
 * `accent` is the semantic colour this row means — urgency in Triage, outcome
 * in the Library, gold where the only thing being said is "this is clickable".
 * Omit it and there is simply no rail; the fallback is transparent rather than
 * a guessed colour.
 */
export function interactive(t, accent, opts = {}) {
  const { flat = false, index = null, hoverBg = null } = opts;
  return {
    className: "gos-int" + (flat ? " gos-int-flat" : "") + (index != null ? " gos-enter" : ""),
    style: {
      "--gos-accent": accent || "transparent",
      "--gos-spark": t.spark,
      ...(hoverBg ? { "--gos-hover-bg": hoverBg } : {}),
      ...(index != null ? { "--gos-delay": stagger(index) } : {}),
    },
  };
}

/** Props for a stat tile: lifts, and draws an accent underline in from the left. */
export function tile(t, accent, index = null) {
  return {
    className: "gos-tile" + (index != null ? " gos-enter" : ""),
    style: {
      "--gos-accent": accent || t.goldFill,
      ...(index != null ? { "--gos-delay": stagger(index) } : {}),
    },
  };
}
