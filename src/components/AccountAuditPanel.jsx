import { useState, useMemo } from "react";
import { gG, gGh, gGd, gCd, gTA } from "./styles.js";
import { auditAccount, extractNames, auditToCSV } from "../services/accountAudit.js";
import { piiNotice } from "../services/dataSafety.js";

// -- Account audit -------------------------------------------------------------
//
// The first meeting, on the prospect's own data, before anything is installed.
//
// This is the only surface in the product that runs on a corpus rather than on a
// portfolio: no metrics, no dates, no join to an initiative — just the names.
// That is deliberate and it is what makes it usable in a sales conversation. A
// prospect will export a list of ad names from Ads Manager in thirty seconds. A
// prospect will not hand over a spend export before a contract exists, and any
// demo that requires one happens after the moment it was supposed to create.
//
// The reasoning behind each figure is in src/services/accountAudit.js. What is
// decided here is the order they are read in, which follows the order the
// questions actually get asked: how much is there, is there a convention, what
// is in it, how much of it works today, and what does the part that does not
// work cost.

const pct = (n) => `${(n * 100).toFixed(n >= 0.995 || n === 0 ? 0 : 1)}%`;

export function AccountAuditPanel({ t, settings, showToast }) {
  const [text, setText] = useState("");
  const [ran, setRan] = useState(null);

  const parsed = useMemo(() => extractNames(text), [text]);
  const audit = ran;

  const run = () => {
    const { names, scan } = extractNames(text);
    if (names.length === 0) { showToast("Nothing to audit — paste ad names, one per line, or a CSV export.", "error"); return; }
    setRan(auditAccount(names, settings));
    if (!scan.clean) showToast(piiNotice(scan), "error");
  };

  const download = () => {
    const blob = new Blob([auditToCSV(audit)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `account-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  };

  const label = { fontSize: 10, color: t.textMuted, fontFamily: t.mono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 };
  const num = { fontSize: 22, fontWeight: 700, fontFamily: t.mono, color: t.text };
  const head = { fontFamily: t.serif, fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 8 };
  const prose = { fontSize: 12.5, color: t.textSub, fontFamily: t.serif, lineHeight: 1.6 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={gCd(t)}>
        <div style={head}>What is in the account today</div>
        <div style={{ ...prose, marginBottom: 12, maxWidth: 640 }}>
          Paste ad, ad set or campaign names — one per line, or a CSV export with a name column. Nothing
          is saved and nothing is imported: this reads the strings, reports what convention they follow,
          and counts how many of them the current schema can already parse. It is the first hour of an
          implementation, and it is the number the retrofit is quoted from.
        </div>
        <textarea
          style={{ ...gTA(t), fontSize: 12.5, fontFamily: t.mono, minHeight: 130 }}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA\nMeta_Col_StudioSet_R4_M_Taste_Craving_Donuts_Cinnamon_Video_LP-01\n…"} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <button style={{ ...gG(t), fontSize: 12.5 }} onClick={run} disabled={!text.trim()}>Run the audit</button>
          <label style={{ ...gGh(t), fontSize: 12.5, cursor: "pointer" }}>
            Load a file
            <input type="file" accept=".csv,.txt,.tsv" onChange={onFile} style={{ display: "none" }} />
          </label>
          {text.trim() && (
            <span style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.mono }}>
              {parsed.names.length.toLocaleString()} name{parsed.names.length === 1 ? "" : "s"}
              {parsed.source === "csv" ? ` from "${parsed.column}"` : ""}
              {!parsed.scan.clean ? " · personal columns present and ignored" : ""}
            </span>
          )}
          {audit && <button style={{ ...gGh(t), fontSize: 12.5, marginLeft: "auto" }} onClick={download}>Export CSV</button>}
        </div>
      </div>

      {audit && (
        <>
          {/* Corpus and convention */}
          <div style={gCd(t)}>
            <div style={head}>The corpus</div>
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginBottom: 14 }}>
              <div><div style={label}>Names supplied</div><div style={num}>{audit.corpus.rows.toLocaleString()}</div></div>
              <div><div style={label}>Distinct</div><div style={num}>{audit.corpus.distinct.toLocaleString()}</div></div>
              <div><div style={label}>Delimiter in use</div><div style={{ ...num, color: audit.delimiter.matchesSchema ? t.teal : t.warn }}>{audit.delimiter.unstructured ? "none" : audit.delimiter.using}</div></div>
              <div><div style={label}>Dominant shape</div><div style={num}>{audit.dominant.slots || "—"} slots</div></div>
            </div>
            <div style={{ ...prose, maxWidth: 660 }}>
              {audit.delimiter.unstructured
                ? "No delimiter splits these names consistently. This account is using free-text names, which means the taxonomy is being installed from scratch rather than mapped — every name currently running has to be claimed by hand, and the convention starts applying to new campaigns only."
                : audit.delimiter.matchesSchema
                  ? `The account uses "${audit.delimiter.using}", which is the workspace's delimiter. ${pct(audit.dominant.share)} of distinct names have ${audit.dominant.slots} slots — the higher that share, the closer this is to a mapping exercise rather than a redesign.`
                  : `The account uses "${audit.delimiter.using}" and the workspace schema uses "${audit.schema.delimiter}". Changing the workspace delimiter invalidates every name already built against it, so this is a decision rather than a setting.`}
            </div>
          </div>

          {/* Shape */}
          <div style={gCd(t)}>
            <div style={head}>Shape</div>
            <div style={{ ...prose, marginBottom: 12, maxWidth: 660 }}>
              One dominant row is a convention somebody has been following. Four rows of similar weight is
              several conventions layered over time, and the implementation includes deciding which survives.
            </div>
            {audit.histogram.slice(0, 8).map(h => (
              <div key={h.slots} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                <div style={{ width: 74, fontSize: 11.5, fontFamily: t.mono, color: t.textSub, textAlign: "right" }}>{h.slots} slots</div>
                <div style={{ flex: 1, height: 15, background: t.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${h.share * 100}%`, height: "100%", background: t.gold, opacity: h === audit.dominant ? 1 : 0.45 }} />
                </div>
                <div style={{ width: 108, fontSize: 11.5, fontFamily: t.mono, color: t.textMuted }}>{h.count.toLocaleString()} · {pct(h.share)}</div>
              </div>
            ))}
          </div>

          {/* Slots */}
          {audit.slots.length > 0 && (
            <div style={gCd(t)}>
              <div style={head}>What is in each slot</div>
              <div style={{ ...prose, marginBottom: 12, maxWidth: 660 }}>
                Across the {audit.dominant.count.toLocaleString()} names with {audit.dominant.slots} slots. The dimension named on each row is
                the one whose controlled list covers the values found — evidence for a taxonomy, not a taxonomy.
                Deciding which of these become controlled dimensions is the design work, and it is not automated.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: t.textMuted, fontFamily: t.mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      <th style={{ padding: "6px 8px" }}>Slot</th>
                      <th style={{ padding: "6px 8px" }}>Distinct</th>
                      <th style={{ padding: "6px 8px" }}>Looks like</th>
                      <th style={{ padding: "6px 8px" }}>Most common values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.slots.map(s => (
                      <tr key={s.index} style={{ borderTop: "1px solid " + t.border }}>
                        <td style={{ padding: "7px 8px", fontFamily: t.mono, color: t.textSub }}>{s.index + 1}</td>
                        <td style={{ padding: "7px 8px", fontFamily: t.mono, color: t.textSub }}>{s.distinct.toLocaleString()}</td>
                        <td style={{ padding: "7px 8px", color: s.freeText ? t.textMuted : t.text }}>
                          {s.freeText ? "free text" : s.suggestions[0] ? `${s.suggestions[0].label} · ${pct(s.suggestions[0].coverage)}` : "no vocabulary match"}
                        </td>
                        <td style={{ padding: "7px 8px", color: t.textMuted, fontFamily: t.mono, fontSize: 11 }}>
                          {s.top.slice(0, 5).map(v => v.value).join("  ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fit */}
          <div style={gCd(t)}>
            <div style={head}>How much of it parses today</div>
            <div style={{ ...prose, marginBottom: 12, maxWidth: 680 }}>
              Against the schema as it currently stands. The three failure kinds cost different amounts:
              a value the controlled list has never had to describe is one addition and the names parse;
              a wrong slot count cannot be fixed by editing a vocabulary; a space or comma inside a value
              is fixable going forward and never retroactively, because a live name cannot be renamed
              without resetting its learning phase.
            </div>
            {audit.fit.slice(0, 6).map(f => (
              <div key={f.channel + f.level} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "7px 0", borderTop: "1px solid " + t.border, flexWrap: "wrap" }}>
                <div style={{ minWidth: 170, fontSize: 12.5, color: t.text }}>{f.channelLabel} · {f.levelLabel}</div>
                <div style={{ fontFamily: t.mono, fontSize: 15, fontWeight: 700, color: f.rate > 0.5 ? t.teal : f.rate > 0 ? t.warn : t.textMuted, minWidth: 60 }}>{pct(f.rate)}</div>
                <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.mono }}>
                  {f.failures.slots.toLocaleString()} wrong slot count · {f.failures.vocab.toLocaleString()} unknown value · {f.failures.illegal.toLocaleString()} illegal character
                </div>
              </div>
            ))}
            {(audit.best?.missingVocab || []).length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + t.border }}>
                <div style={{ ...label, marginBottom: 7 }}>Values to add to the controlled lists</div>
                {audit.best.missingVocab.map(m => (
                  <div key={m.key} style={{ fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: t.text }}>{m.label}</span>
                    <span style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 11 }}> — {m.values.join(", ")}{m.total > m.values.length ? ` +${m.total - m.values.length} more` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Retrofit */}
          <div style={{ ...gCd(t), border: "1px solid " + (audit.retrofit.count ? t.warnBorder : t.border), background: audit.retrofit.count ? t.warnBg : undefined }}>
            <div style={head}>The retrofit</div>
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginBottom: 12 }}>
              <div><div style={label}>Names to map by hand</div><div style={{ ...num, color: audit.retrofit.count ? t.warn : t.teal }}>{audit.retrofit.count.toLocaleString()}</div></div>
              <div><div style={label}>Share of distinct names</div><div style={{ ...num, fontSize: 16 }}>{pct(audit.retrofit.share)}</div></div>
            </div>
            <div style={{ ...prose, maxWidth: 680 }}>
              These cannot be renamed — a campaign running in Ads Manager loses its learning phase if it is —
              so each one is registered against the initiative it belongs to instead. That is the unit of work
              in the implementation. How long one takes is yours to know; this counts them rather than guessing
              at an hourly figure.
            </div>
            {audit.retrofit.sample.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 190, overflowY: "auto", fontFamily: t.mono, fontSize: 11, color: t.textMuted, lineHeight: 1.7 }}>
                {audit.retrofit.sample.map((n, i) => <div key={i}>{n}</div>)}
                {audit.retrofit.count > audit.retrofit.sample.length && (
                  <div style={{ color: t.textSub, marginTop: 6 }}>
                    +{(audit.retrofit.count - audit.retrofit.sample.length).toLocaleString()} more — the export carries the same list.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={{ ...gGd(t), fontSize: 12 }} onClick={() => { setRan(null); setText(""); }}>Clear</button>
          </div>
        </>
      )}
    </div>
  );
}
