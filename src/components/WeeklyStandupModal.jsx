import { useState } from "react";
import { Modal } from "./Modal.jsx";
import { gG, gGh, gTA, gSL } from "./styles.js";
import { brandName, fmtDate, parseD } from "../constants.js";

// -- Weekly Standup ------------------------------------------------------------
// A lightweight weekly ritual surfaced from the dashboard. It flags initiatives
// that need attention (stale running work, or closed work with no post-mortem),
// then lets the team jot a one-line status against each running initiative.
// Notes are appended to a `weeklyNotes` field on the initiative (with the date
// it was logged in `weeklyNotesAt`, which also feeds the staleness check).
const DAY = 86400000;

export function WeeklyStandupModal({ t, dk, items, brands, onCommit, onClose, showToast }) {
  const [notes, setNotes] = useState({}); // { [itemId]: "this week's note" }
  const today = new Date();

  const lastActivity = e => parseD(e.updatedAt) || parseD(e.startDate);

  const staleRunning = items.filter(e => {
    if (e.status !== "Running") return false;
    const la = lastActivity(e);
    return la && (today - la) > 7 * DAY;
  });
  // "done"/"failed" → Completed/Killed in this schema; post-mortem → results.keyLearning.
  const missingPostMortem = items.filter(e =>
    (e.status === "Completed" || e.status === "Killed") && (!e.results || !e.results.keyLearning)
  );

  const groups = [
    { reason: "No update in 7+ days", items: staleRunning },
    { reason: "Missing post-mortem",  items: missingPostMortem },
  ].filter(g => g.items.length > 0);

  const running = items.filter(e => e.status === "Running");

  const confirm = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const updated = items.map(e => {
      const note = (notes[e.id] || "").trim();
      if (e.status !== "Running" || !note) return e;
      const entry = stamp + ": " + note;
      return {
        ...e,
        weeklyNotes: e.weeklyNotes ? e.weeklyNotes + "\n" + entry : entry,
        weeklyNotesAt: stamp,
      };
    });
    onCommit(updated);
    showToast("Standup logged.", "success");
    onClose();
  };

  const reasonColor = (reason) => reason === "Missing post-mortem"
    ? { fg: dk ? "#e08080" : "#a03030", bg: dk ? "#2a1212" : "#fdf0f0", bd: dk ? "#6a2828" : "#e09090" }
    : { fg: dk ? "#e09040" : "#a04000", bg: dk ? "#3a2010" : "#fff0e0", bd: dk ? "#7a4010" : "#e09060" };

  return (
    <Modal t={t} dk={dk} onClose={onClose} title="Weekly standup" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Flagged — needs attention */}
        <div>
          <div style={gSL(t)}>Needs attention</div>
          {groups.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textMuted, fontFamily: t.serif, lineHeight: 1.6, padding: "4px 0" }}>
              Nothing flagged — every running initiative has a recent update and every closed one has a post-mortem.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {groups.map(g => {
                const c = reasonColor(g.reason);
                return (
                  <div key={g.reason}>
                    <div style={{ fontSize: 11, fontWeight:600, color: c.fg, fontFamily: t.serif, marginBottom: 6 }}>
                      {g.reason} <span style={{ color: t.textMuted, fontWeight: 500 }}>· {g.items.length}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {g.items.map(e => (
                        <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "7px 10px", background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 8 }}>
                          <span style={{ fontSize: 9.5, fontWeight:600, fontFamily: t.serif, color: c.fg, background: c.bg, border: "1px solid " + c.bd, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>
                            {g.reason}
                          </span>
                          <span style={{ fontSize: 12.5, color: t.text, fontFamily: t.serif, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                          {brands && brands.length > 1 && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: t.serif, flexShrink: 0 }}>{brandName(e.brandId || "default", brands)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status log — quick notes on running work */}
        <div>
          <div style={gSL(t)}>Status log — running initiatives</div>
          {running.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textMuted, fontFamily: t.serif, lineHeight: 1.6, padding: "4px 0" }}>
              No running initiatives right now.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto", paddingRight: 2 }}>
              {running.map(e => (
                <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, fontWeight:600, color: t.text, fontFamily: t.serif, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                    {e.updatedAt && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: t.mono, flexShrink: 0 }}>last update {fmtDate(e.updatedAt)}</span>}
                  </div>
                  <textarea
                    style={{ ...gTA(t), fontSize: 12.5, minHeight: 0 }}
                    rows={1}
                    value={notes[e.id] || ""}
                    onChange={ev => setNotes(p => ({ ...p, [e.id]: ev.target.value }))}
                    placeholder="What moved this week?"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
          <button style={gGh(t)} onClick={onClose}>Cancel</button>
          <button style={gG(t)} onClick={confirm}>Confirm focus</button>
        </div>
      </div>
    </Modal>
  );
}
