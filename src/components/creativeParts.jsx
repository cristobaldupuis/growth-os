import { useState } from "react";
import { gGh, gSL } from "./styles.js";
import { beatsOf, copySpecFor, copyFlags } from "../services/creativeCopy.js";
import { citedSnippets } from "../services/voc.js";
import { setsOf, isShipped } from "../services/variantSets.js";
import { fmtDate } from "../constants.js";

// The smaller pieces of a variant card in Creative Studio, kept out of the view
// so the view stays about orchestration: generating, freezing, and shipping.

const cell = (t) => ({ padding: "6px 8px", borderTop: "1px solid " + t.borderSoft, verticalAlign: "top", fontSize: 12, lineHeight: 1.5 });

/** Beats as a table: time, what is seen, what is said, what is written. */
export function BeatsTable({ t, variant }) {
  const beats = beatsOf(variant);
  if (!beats.length) return null;
  const hasStructure = beats.some(b => b.time || b.visual || b.onScreen);
  if (!hasStructure) {
    return (
      <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 12.5, color: t.textSub, lineHeight: 1.6 }}>
        {beats.map((b, j) => <li key={j} style={{ marginBottom: 2 }}>{b.voiceover}</li>)}
      </ol>
    );
  }
  return (
    <div style={{ overflowX: "auto", margin: "0 0 10px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", color: t.textSub, fontFamily: t.sans }}>
        <thead>
          <tr>{["Time", "On screen", "Voiceover", "Text on screen"].map(h => (
            <th key={h} style={{ ...cell(t), borderTop: "none", textAlign: "left", fontSize: 11, color: t.textMuted, fontWeight: 600 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {beats.map((b, j) => (
            <tr key={j}>
              <td style={{ ...cell(t), whiteSpace: "nowrap", color: t.textMuted }}>{b.time}</td>
              <td style={cell(t)}>{b.visual}</td>
              <td style={{ ...cell(t), color: t.text }}>{b.voiceover}</td>
              <td style={{ ...cell(t), color: t.text, fontWeight: 500 }}>{b.onScreen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The platform's ad-copy fields with their length against where they truncate. */
export function CopyFields({ t, variant, channel }) {
  const copy = variant?.copy || {};
  const spec = copySpecFor(channel).filter(c => copy[c.key]);
  if (!spec.length) return null;
  const over = new Set(copyFlags(copy, channel).map(f => f.key));
  return (
    <div style={{ margin: "0 0 10px", padding: "9px 11px", background: t.surface, border: "1px solid " + t.borderSoft, borderRadius: 9 }}>
      <div style={gSL(t)}>Ad copy</div>
      {spec.map(c => (
        <div key={c.key} style={{ display: "grid", gridTemplateColumns: "104px 1fr auto", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans }} title={c.hint}>{c.label}</div>
          <div style={{ fontSize: 12.5, color: t.text, lineHeight: 1.5 }}>{copy[c.key]}</div>
          <div style={{ fontSize: 10.5, fontFamily: t.sans, color: over.has(c.key) ? t.warn : t.textMuted }}
            title={over.has(c.key) ? `Over the ${c.limit} characters most placements show before truncating.` : undefined}>
            {copy[c.key].length}/{c.limit}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The alternative openings, for the creator to shoot and the account to test. */
export function AltHooks({ t, variant }) {
  if (!(variant?.altHooks || []).length) return null;
  return (
    <div style={{ margin: "-4px 0 10px", fontSize: 12, color: t.textSub, lineHeight: 1.55 }}>
      <span style={{ ...gSL(t), display: "inline", marginRight: 6 }}>Also test</span>
      {variant.altHooks.map((h, i) => <span key={i}>{i > 0 && <span style={{ color: t.textMuted }}> · </span>}“{h}”</span>)}
    </div>
  );
}

/** Customer snippets a brief or variant borrowed from, quoted. */
export function VocQuotes({ t, snippets, ids, label = "From customers" }) {
  const quotes = citedSnippets(snippets, ids);
  if (!quotes.length) return null;
  return (
    <div style={{ margin: "0 0 10px", fontSize: 12, color: t.textSub, lineHeight: 1.55 }}>
      <span style={{ ...gSL(t), display: "inline", marginRight: 6 }}>{label}</span>
      {quotes.map((q, i) => (
        <span key={q.id} title={q.id}>{i > 0 && <span style={{ color: t.textMuted }}> · </span>}<em>“{q.text.length > 140 ? q.text.slice(0, 139) + "…" : q.text}”</em></span>
      ))}
    </div>
  );
}

/**
 * The review pass's read of one variant. Suggestions are offered, never applied:
 * the buttons are how the operator takes one, and a frozen set offers none.
 */
export function CritiqueNote({ t, note, frozen, onUseHook, onUseCopy }) {
  if (!note) return null;
  const tone = note.score >= 8 ? t.teal : note.score >= 6 ? t.gold : t.warn;
  const hasCopy = Object.keys(note.suggestedCopy || {}).length > 0;
  return (
    <div style={{ margin: "0 0 10px", padding: "9px 11px", background: t.surface, border: "1px solid " + t.borderSoft, borderRadius: 9 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={gSL(t)}>Review</div>
        {note.score != null && <strong style={{ fontFamily: t.sans, fontSize: 12.5, color: tone }}>{note.score}/10</strong>}
      </div>
      {note.issues.length > 0 && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
          {note.issues.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      {note.claimRisk && (
        <div style={{ marginTop: 5, fontSize: 12, color: t.warn, lineHeight: 1.5 }}><strong>Claim risk.</strong> {note.claimRisk}</div>
      )}
      {note.suggestedHook && (
        <div style={{ marginTop: 6, fontSize: 12, color: t.text, lineHeight: 1.5 }}>
          Suggested hook: “{note.suggestedHook}”
          {!frozen && <button onClick={onUseHook} style={{ ...gGh(t), padding: "2px 8px", fontSize: 10.5, marginLeft: 8 }}>Use it</button>}
        </div>
      )}
      {hasCopy && (
        <div style={{ marginTop: 6, fontSize: 12, color: t.text, lineHeight: 1.5 }}>
          Suggested copy: {Object.entries(note.suggestedCopy).map(([k, v]) => <span key={k}><span style={{ color: t.textMuted }}>{k}</span> “{v}” </span>)}
          {!frozen && <button onClick={onUseCopy} style={{ ...gGh(t), padding: "2px 8px", fontSize: 10.5, marginLeft: 4 }}>Use it</button>}
        </div>
      )}
      {!note.issues.length && !note.claimRisk && !note.suggestedHook && !hasCopy && (
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>Nothing to change.</div>
      )}
    </div>
  );
}

const VIA_LABEL = { names: "copied names", csv: "CSV", "creator-brief": "creator brief", static: "static ad" };

/**
 * Every set this initiative has produced, newest first, with what each one
 * shipped. Read-only: a frozen set is the record of what went out, and an
 * unshipped old one is superseded, not editable.
 */
export function SetHistory({ t, record, settings, current }) {
  const [open, setOpen] = useState(null);
  const sets = [...setsOf(record)].reverse().filter(s => !(current && s.version === current.version && s.briefVersion === current.briefVersion));
  if (!sets.length) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid " + t.borderSoft }}>
      <div style={gSL(t)}>Earlier sets</div>
      <div style={{ display: "grid", gap: 6 }}>
        {sets.map(s => {
          const key = s.briefVersion + "." + s.version;
          return (
            <div key={key} style={{ fontSize: 12, color: t.textSub }}>
              <button onClick={() => setOpen(open === key ? null : key)} style={{ ...gGh(t), padding: "3px 8px", fontSize: 11, marginRight: 8 }}>
                {open === key ? "Hide" : "Show"}
              </button>
              Brief v{s.briefVersion} · set v{s.version} · {s.variants.length} variant{s.variants.length === 1 ? "" : "s"}
              {s.channel ? " · " + s.channel : ""}
              {s.generatedAt ? " · " + fmtDate(String(s.generatedAt).slice(0, 10), settings) : ""}
              {isShipped(s)
                ? <strong style={{ color: t.teal, marginLeft: 6 }}>shipped {fmtDate(String(s.shippedAt).slice(0, 10), settings)} via {(s.shippedVia || []).map(v => VIA_LABEL[v] || v).join(", ")}</strong>
                : <span style={{ color: t.textMuted, marginLeft: 6 }}>not shipped</span>}
              {open === key && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
                  {s.variants.map((v, i) => (
                    <li key={i}>
                      <strong style={{ color: t.text }}>{v.label}</strong> — “{v.hook}”
                      {s.names?.[i]?.ad && <div style={{ fontFamily: t.sans, fontSize: 11, color: t.textMuted, wordBreak: "break-all" }}>{s.names[i].ad}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
