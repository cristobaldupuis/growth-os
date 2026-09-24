import { useState } from "react";

// -- Trend ---------------------------------------------------------------------
//
// A sparkline you can read. Point at it (or focus it and use the arrow keys)
// and it marks the nearest week and reports that point to its owner through
// `onScrub`, which is how a KPI tile swaps its headline figure for the week
// under the cursor. It fills its container's width, which Spark.jsx, drawing at
// a fixed pixel width, cannot do in a fluid grid.
//
// The line is drawn in a stretched viewBox so it scales with the tile; the
// marker is an HTML element positioned in percentages on top of it, because a
// circle inside a non-uniformly stretched SVG becomes an ellipse.
//
// `points` is oldest first: [{ label, value }]. `label` is whatever the owner
// wants reported back (a date string, usually); this component never reads it.
export function Trend({ t, points, height = 32, color, onScrub, label }) {
  const [hi, setHi] = useState(null);
  const n = points ? points.length : 0;
  if (n < 2) return <div style={{ height }} />;

  const W = 120, pad = 3;
  const vals = points.map(p => p.value);
  const lo = Math.min(...vals), span = (Math.max(...vals) - lo) || 1;
  const x = (i) => (i / (n - 1)) * 100;                       // percent across
  const y = (v) => height - pad - ((v - lo) / span) * (height - pad * 2); // px down
  const line = points.map((p, i) => (x(i) / 100 * W).toFixed(2) + "," + y(p.value).toFixed(2)).join(" ");
  const ink = color || t.goldFill;

  const set = (i) => { setHi(i); if (onScrub) onScrub(i); };
  const fromPointer = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    set(Math.round(f * (n - 1)));
  };
  const onKey = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const cur = hi == null ? n - 1 : hi;
      set(Math.max(0, Math.min(n - 1, cur + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Escape") {
      set(null);
    }
  };

  return (
    <div
      role="img"
      tabIndex={0}
      aria-label={(label ? label + ": " : "") + "trend over " + n + " weeks. Use the arrow keys to read each week."}
      onPointerMove={fromPointer}
      onPointerDown={fromPointer}
      onPointerLeave={() => set(null)}
      onKeyDown={onKey}
      onBlur={() => set(null)}
      style={{ position: "relative", height, cursor: "crosshair", touchAction: "pan-y", outlineOffset: 3, borderRadius: 4 }}
    >
      <svg width="100%" height={height} viewBox={"0 0 " + W + " " + height} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
        <polyline points={line} fill="none" stroke={ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" style={{ opacity: hi == null ? 1 : 0.55, transition: "opacity .12s ease" }} />
      </svg>
      {hi != null && (
        <>
          <span aria-hidden="true" style={{
            position: "absolute", top: 0, bottom: 0, left: x(hi) + "%", width: 1,
            background: t.border, transform: "translateX(-0.5px)", pointerEvents: "none",
          }} />
          <span aria-hidden="true" style={{
            position: "absolute", left: x(hi) + "%", top: y(points[hi].value), width: 9, height: 9,
            borderRadius: "50%", background: ink, border: "2px solid " + t.surface,
            transform: "translate(-50%, -50%)", boxShadow: t.shadow, pointerEvents: "none",
          }} />
        </>
      )}
    </div>
  );
}
