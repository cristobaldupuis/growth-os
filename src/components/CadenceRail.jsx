import { CADENCE_STATES } from "../services/cadence.js";

// -- Cadence rail --------------------------------------------------------------
//
// A week-per-bar strip. Height encodes the weight of the state, colour encodes
// which state, and the three decision weeks (shipped / read / killed) carry a
// mark so the eye finds them without reading colour.
//
// Colour alone never distinguishes shipped from killed here — those two are the
// pair a reader most needs to tell apart, and roughly one man in twelve cannot
// separate the red from the green reliably. The mark plus the per-bar title
// carry the same information twice.
//
// `expanded` doubles the height rather than revealing new bars, so the hover
// state is a magnification of the same data and nothing is hidden until you
// hover. A row that only becomes legible on hover is a row that is illegible
// when scanning, which is the job the list actually has to do.

const COLOR = (t) => ({
  idle:    t.borderSoft,
  running: t.gold,
  read:    t.textSub,
  shipped: t.teal,
  killed:  t.red,
  overdue: t.warn,
});

export function CadenceRail({ rail, t, expanded, windowLabel }) {
  if (!rail || rail.length === 0) return null;
  const colors = COLOR(t);
  const maxH = expanded ? 26 : 14;

  return (
    <span
      title={windowLabel ? "Weekly cadence · " + windowLabel : "Weekly cadence"}
      style={{
        display:"inline-flex", alignItems:"flex-end", gap:2, height:maxH,
        transition:"height .18s ease",
      }}
    >
      {rail.map(w => {
        const spec = CADENCE_STATES[w.state] || CADENCE_STATES.idle;
        const h = Math.max(3, Math.round(maxH * spec.weight));
        return (
          <span key={w.index} title={w.iso + " · " + spec.label}
            style={{ position:"relative", display:"block", width:expanded ? 5 : 4, height:h,
              borderRadius:1.5, background:colors[w.state] || colors.idle,
              transition:"height .18s ease, width .18s ease" }}>
            {spec.mark && (
              <span style={{ position:"absolute", left:"50%", top:-4, transform:"translateX(-50%)",
                width:3, height:3, borderRadius:"50%", background:t.text }}/>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Legend for the rail, shown once above a grouped list rather than per row. */
export function CadenceLegend({ t }) {
  const colors = COLOR(t);
  const entries = [["running","Running"],["shipped","Shipped"],["read","Read"],["killed","Killed"],["overdue","Overdue"],["idle","Idle"]];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:11, flexWrap:"wrap" }}>
      {entries.map(([k, label]) => (
        <span key={k} style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
          <span style={{ width:4, height:Math.max(3, Math.round(12 * CADENCE_STATES[k].weight)),
            borderRadius:1.5, background:colors[k] }}/>
          <span style={{ fontSize:10, color:t.textMuted, fontFamily:t.mono }}>{label}</span>
        </span>
      ))}
    </span>
  );
}
