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
 * Props for an interactive card or row: its surface tints on hover.
 *
 * `accent` is accepted and ignored. It used to colour a rail that charged down
 * the card's leading edge; the rail is gone (see the interaction layer in
 * index.css) and the parameter stays so the call sites need not change.
 * `hoverBg` overrides the tint, for rows that already sit on an alt surface.
 */
export function interactive(t, accent, opts = {}) {
  const { flat = false, index = null, hoverBg = null } = opts;
  return {
    className: "gos-int" + (flat ? " gos-int-flat" : "") + (index != null ? " gos-enter" : ""),
    style: {
      "--gos-hover-bg": hoverBg || t.surfaceAlt,
      ...(index != null ? { "--gos-delay": stagger(index) } : {}),
    },
  };
}

/** Props for a stat tile: no hover state, only the staggered entry. `accent`
 *  is accepted and ignored, like `interactive`'s. */
export function tile(t, accent, index = null) {
  return {
    className: "gos-tile" + (index != null ? " gos-enter" : ""),
    style: {
      ...(index != null ? { "--gos-delay": stagger(index) } : {}),
    },
  };
}
