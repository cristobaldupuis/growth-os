import { stagger } from "./motion.js";

// -- ChargeBar -----------------------------------------------------------------
//
// A magnitude bar that grows in on mount. (It used to take a "charge", a
// highlight sweeping along it while its row was hovered; that went with the
// rest of the hover animation, and `--gos-spark` below is now inert.) Lives apart from motion.js because that file exports only functions
// and this one exports only a component — mixing the two breaks Fast Refresh,
// the same reason navSections.js sits beside Sidebar.jsx.
//
// `muted` is for a zero or placeholder value: it still draws, so the row keeps
// its rhythm, but in the border colour.
export function ChargeBar({ t, pct, accent, height = 6, muted = false, index = null, track }) {
  return (
    <div className="gos-track" style={{ height, background: track || t.surfaceAlt }}>
      <div
        className="gos-fill"
        style={{
          width: Math.max(2, Math.min(100, pct || 0)) + "%",
          background: muted ? t.border : (accent || t.goldFill),
          "--gos-spark": muted ? "transparent" : t.spark,
          ...(index != null ? { "--gos-delay": stagger(index) } : {}),
        }}
      />
    </div>
  );
}
