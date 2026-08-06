import { useState, useMemo } from "react";
import { gG, gGh, gSL, gCd, gI, gSl } from "../components/styles.js";
import { renderProse } from "../components/text.jsx";
import { SBdg, CBdg } from "../components/badges.jsx";
import { fmtDate } from "../constants.js";
import { resolveSchema, buildName, initiativeSegment, suggestTrackingTag, NA } from "../services/naming.js";
import { callCreativeBrief } from "../services/ai/callCreativeBrief.js";
import { callCreativeVariants } from "../services/ai/callCreativeVariants.js";

// -- Creative Studio -----------------------------------------------------------
//
// The Brief -> Create half of the creative loop, anchored to an initiative so
// every asset it produces is born attached to a hypothesis.
//
// The design constraint that shapes this whole view: an ad name is only worth
// anything if it is correct, so the operator never types one. They edit segment
// values against controlled vocabularies and the name is assembled by
// `buildName`, which is the same function the parser round-trips against. A name
// that renders here is a name that will parse when the performance export comes
// back.

const StatBlock = ({ t, label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={gSL(t)}>{label}</div>
    <div style={{ fontSize: 13.5, lineHeight: 1.62, color: t.text, fontFamily: t.serif }}>{children}</div>
  </div>
);

export function CreativeStudio({
  t, dk, items, brands, activeBrand, settings, creative, onSaveCreative, onSaveItems, showToast,
}) {
  const schema = resolveSchema(settings);
  const initSeg = initiativeSegment(schema);

  const brandFilter = e => activeBrand === "all" || (e.brandId || "default") === activeBrand;
  // Creative is briefed for work that is still ahead of you. A closed initiative
  // has nothing left to shoot for, so offering it here would only produce assets
  // that can never be attributed to anything.
  const eligible = useMemo(
    () => items.filter(e => (e.status === "Draft" || e.status === "Running") && brandFilter(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, activeBrand]
  );

  const [selId, setSelId]       = useState("");
  const [busy, setBusy]         = useState("");     // "" | "brief" | "variants"
  const [err, setErr]           = useState("");
  const [perAngle, setPerAngle] = useState(2);
  const [edits, setEdits]       = useState({});     // {variantIdx: {segKey: value}}

  const sel     = items.find(e => e.id === selId) || null;
  const brand   = sel ? (brands.find(b => b.id === (sel.brandId || "default")) || brands[0]) : null;
  const record  = (creative || []).find(c => c.initiativeId === selId) || null;
  const brief   = record?.brief || null;

  // Closed initiatives are the evidence base the brief reasons from — the same
  // index the learning library and Next Plays build, kept in one shape.
  const learningsIndex = useMemo(() => items
    .filter(e => (e.status === "Completed" || e.status === "Killed") && e.results?.keyLearning)
    .map(e => ({
      id: e.id, title: e.title, learning: e.results.keyLearning,
      outcome: e.results.outcomeClassification || "Inconclusive",
      category: e.category, actualRev: e.results.actualRevenueImpact ?? null,
      closedDate: e.endDate || null,
    })), [items]);

  const saveRecord = (patch) => {
    const rest = (creative || []).filter(c => c.initiativeId !== selId);
    onSaveCreative([{ ...(record || { initiativeId: selId }), ...patch, generatedAt: new Date().toISOString() }, ...rest]);
  };

  const runBrief = async () => {
    if (!sel) return;
    setBusy("brief"); setErr("");
    try {
      const result = await callCreativeBrief(sel, brand, learningsIndex, settings, schema);
      saveRecord({ brief: result, variants: [] });
      setEdits({});
      showToast("Creative brief generated.", "success");
    } catch (e) { setErr(e.message || "Could not generate the brief."); }
    finally { setBusy(""); }
  };

  const runVariants = async () => {
    if (!sel || !brief) return;
    setBusy("variants"); setErr("");
    try {
      const result = await callCreativeVariants(brief, sel, brand, schema, { perAngle });
      saveRecord({ brief, variants: result });
      setEdits({});
      showToast(result.length + " variants generated.", "success");
    } catch (e) { setErr(e.message || "Could not generate variants."); }
    finally { setBusy(""); }
  };

  // The initiative segment is stamped from the initiative's own trackingTag,
  // never from the model. An absent tag yields the placeholder, which correctly
  // marks the asset as untracked rather than inventing a link that joins to
  // nothing.
  const tag = sel?.trackingTag ? String(sel.trackingTag).trim() : "";
  const nameFor = (variant, idx) => {
    const values = { ...(variant.naming || {}), ...(edits[idx] || {}) };
    if (initSeg) values[initSeg.key] = tag || (schema.placeholder || NA);
    return buildName(values, schema);
  };

  const assignTag = () => {
    const suggested = suggestTrackingTag(sel, schema);
    if (!suggested) { showToast("Could not derive a tracking tag for this initiative.", "error"); return; }
    onSaveItems(items.map(e => e.id === sel.id ? { ...e, trackingTag: suggested } : e));
    showToast(`Tracking tag set to ${suggested}. Every ad name here now carries it.`, "success");
  };

  const variants = record?.variants || [];

  const copyNames = () => {
    const lines = variants.map((v, i) => nameFor(v, i).name).join("\n");
    navigator.clipboard?.writeText(lines)
      .then(() => showToast(variants.length + " ad names copied.", "success"))
      .catch(() => showToast("Could not copy to clipboard.", "error"));
  };

  const exportCSV = () => {
    const cols = ["label", "angleSlug", "varies", "hook", "cta", ...schema.segments.map(s => s.key), "adName"];
    const esc = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = variants.map((v, i) => {
      const { name } = nameFor(v, i);
      const values = { ...(v.naming || {}), ...(edits[i] || {}) };
      if (initSeg) values[initSeg.key] = tag || (schema.placeholder || NA);
      return [v.label, v.angleSlug, v.varies, v.hook, v.cta, ...schema.segments.map(s => values[s.key] || ""), name].map(esc).join(",");
    });
    const csv = [cols.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creative_${(sel.initId || sel.id)}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 60px" }}>

      {/* Header */}
      <div style={{ margin: "22px 0 18px" }}>
        <h2 style={{ fontFamily: t.serif, fontSize: 24, fontWeight: 600, margin: 0, color: t.text }}>Creative Studio</h2>
        <p style={{ fontSize: 13, color: t.textSub, margin: "6px 0 0", maxWidth: 680, lineHeight: 1.6 }}>
          Brief and produce creative against an initiative, so every asset carries the experiment it belongs to.
          Ad names are assembled from your naming convention rather than typed, which is what lets performance
          data find its way back to the hypothesis.
        </p>
      </div>

      {/* Initiative picker */}
      <div style={{ ...gCd(t), marginBottom: 18 }}>
        <div style={gSL(t)}>Initiative</div>
        {eligible.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textMuted, fontFamily: t.serif }}>
            No draft or running initiatives in this brand. Creative is briefed against work that is still ahead of you.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={selId} onChange={e => { setSelId(e.target.value); setEdits({}); setErr(""); }}
              style={{ ...gSl(t), maxWidth: 460, flex: "1 1 300px" }}>
              <option value="">Select an initiative…</option>
              {eligible.map(e => (
                <option key={e.id} value={e.id}>{(e.initId ? e.initId + " · " : "") + e.title}</option>
              ))}
            </select>
            {sel && <SBdg s={sel.status} dk={dk} />}
            {sel && <CBdg cat={sel.category} cats={settings.categories || []} dk={dk} t={t} />}
          </div>
        )}

        {sel && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + t.borderSoft }}>
            <div style={{ fontSize: 13, color: t.textSub, fontFamily: t.serif, lineHeight: 1.6 }}>
              <strong style={{ color: t.text }}>Hypothesis.</strong> {sel.hypothesis || "Not recorded — the brief will be weaker without one."}
            </div>

            {/* The bridge. Without a trackingTag nothing this view produces can be
                attributed, so it is surfaced as a blocking-looking prompt rather
                than buried in the initiative editor. */}
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 10,
              background: tag ? t.tealBg : t.warnBg,
              border: "1px solid " + (tag ? t.teal : t.warnBorder),
            }}>
              {tag ? (
                <div style={{ fontSize: 12.5, color: t.text }}>
                  Tracking tag <code style={{ fontFamily: t.mono, fontWeight: 700 }}>{tag}</code> — every ad name below ends with it,
                  so performance rows carrying this tag join back to this initiative.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12.5, color: t.text, flex: "1 1 340px" }}>
                    No tracking tag set. Assets will be named <code style={{ fontFamily: t.mono }}>…{schema.delimiter}{schema.placeholder || NA}</code> and
                    will not attribute back to this initiative.
                  </div>
                  <button onClick={assignTag} style={gG(t)}>Assign {suggestTrackingTag(sel, schema)}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {err && (
        <div style={{ ...gCd(t), marginBottom: 18, borderColor: t.red, background: t.redBg }}>
          <div style={{ fontSize: 13, color: t.red }}>{err}</div>
        </div>
      )}

      {/* Brief */}
      {sel && (
        <div style={{ ...gCd(t), marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: brief ? 16 : 0 }}>
            <div style={{ ...gSL(t), marginBottom: 0 }}>Creative brief</div>
            <button onClick={runBrief} disabled={busy === "brief"} style={{ ...(brief ? gGh(t) : gG(t)), opacity: busy === "brief" ? 0.6 : 1 }}>
              {busy === "brief" ? "Briefing…" : brief ? "Regenerate brief" : "Generate brief"}
            </button>
          </div>

          {brief && (
            <>
              <StatBlock t={t} label="Insight">{renderProse(brief.insight)}</StatBlock>
              <StatBlock t={t} label="Promise">{renderProse(brief.promise)}</StatBlock>

              {(brief.proof || []).length > 0 && (
                <StatBlock t={t} label="Proof on screen">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {brief.proof.map((p, i) => <li key={i} style={{ marginBottom: 3 }}>{p}</li>)}
                  </ul>
                </StatBlock>
              )}

              <div style={{ ...gSL(t), marginTop: 4 }}>Angles to test</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", marginBottom: 16 }}>
                {(brief.angles || []).map((a, i) => (
                  <div key={i} style={{ background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 11, padding: "12px 14px" }}>
                    <div style={{ fontFamily: t.mono, fontSize: 11, color: t.gold, fontWeight: 700, letterSpacing: "0.04em" }}>{a.slug}</div>
                    <div style={{ fontFamily: t.serif, fontSize: 14, fontWeight: 600, color: t.text, margin: "3px 0 6px" }}>{a.label}</div>
                    <div style={{ fontSize: 12.5, color: t.textSub, lineHeight: 1.55, marginBottom: 7 }}>{a.theory}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>{a.execution}</div>
                    {a.openingBeat && (
                      <div style={{ fontSize: 12, color: t.text, marginTop: 8, paddingTop: 8, borderTop: "1px solid " + t.borderSoft }}>
                        <span style={{ ...gSL(t), display: "inline", marginRight: 6 }}>First 3s</span>{a.openingBeat}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <StatBlock t={t} label="Format guidance">{renderProse(brief.formatGuidance)}</StatBlock>

              <div style={{ background: t.goldBg, border: "1px solid " + t.goldBorder, borderRadius: 11, padding: "12px 14px", marginBottom: 14 }}>
                <div style={gSL(t)}>What would prove this wrong</div>
                <div style={{ fontSize: 13, color: t.text, fontFamily: t.serif, lineHeight: 1.6 }}>{renderProse(brief.wouldFalsify)}</div>
              </div>

              {(brief.claimsToVerify || []).length > 0 && (
                <div style={{ background: t.warnBg, border: "1px solid " + t.warnBorder, borderRadius: 11, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={gSL(t)}>Claims to verify before this runs</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: t.text, lineHeight: 1.6 }}>
                    {brief.claimsToVerify.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {brief.evidenceGaps && (
                <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, fontStyle: "italic" }}>
                  Evidence gap: {brief.evidenceGaps}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Variants */}
      {brief && (
        <div style={{ ...gCd(t) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ ...gSL(t), marginBottom: 0 }}>Variants</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: t.textSub }}>Per angle</label>
              <select value={perAngle} onChange={e => setPerAngle(Number(e.target.value))} style={{ ...gSl(t), width: 62, padding: "6px 8px" }}>
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {variants.length > 0 && <button onClick={copyNames} style={gGh(t)}>Copy names</button>}
              {variants.length > 0 && <button onClick={exportCSV} style={gGh(t)}>Export CSV</button>}
              <button onClick={runVariants} disabled={busy === "variants"} style={{ ...(variants.length ? gGh(t) : gG(t)), opacity: busy === "variants" ? 0.6 : 1 }}>
                {busy === "variants" ? "Producing…" : variants.length ? "Regenerate" : "Produce variants"}
              </button>
            </div>
          </div>

          {variants.length === 0 && (
            <div style={{ fontSize: 13, color: t.textMuted, fontFamily: t.serif }}>
              No variants yet. Producing them turns each angle above into named, shootable assets.
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            {variants.map((v, i) => {
              const { name, errors } = nameFor(v, i);
              const values = { ...(v.naming || {}), ...(edits[i] || {}) };
              return (
                <div key={i} style={{ border: "1px solid " + t.border, borderRadius: 12, padding: "14px 16px", background: t.surfaceAlt }}>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ fontFamily: t.serif, fontSize: 15, fontWeight: 600, color: t.text }}>{v.label}</div>
                    <div style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {v.angleSlug}{v.varies ? " · varies: " + v.varies : ""}
                    </div>
                  </div>

                  {v.hook && (
                    <div style={{ margin: "10px 0", padding: "10px 12px", background: t.surface, border: "1px solid " + t.borderSoft, borderRadius: 9 }}>
                      <div style={gSL(t)}>Hook</div>
                      <div style={{ fontSize: 13.5, color: t.text, fontFamily: t.serif, lineHeight: 1.5 }}>“{v.hook}”</div>
                    </div>
                  )}

                  {(v.script || []).length > 0 && (
                    <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 12.5, color: t.textSub, lineHeight: 1.6 }}>
                      {v.script.map((b, j) => <li key={j} style={{ marginBottom: 2 }}>{b}</li>)}
                    </ol>
                  )}

                  {v.cta && <div style={{ fontSize: 12.5, color: t.textSub, marginBottom: 4 }}><strong style={{ color: t.text }}>CTA.</strong> {v.cta}</div>}
                  {v.rationale && <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, marginBottom: 12 }}>{v.rationale}</div>}

                  {/* Segment editors. Controlled segments render as selects so an
                      off-vocabulary value cannot be introduced by hand; the
                      initiative segment is read-only because it comes from the
                      initiative, not from this form. */}
                  <div style={{ ...gSL(t), marginTop: 6 }}>Ad name</div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(132px,1fr))", marginBottom: 10 }}>
                    {schema.segments.map(seg => {
                      const isInit = initSeg && seg.key === initSeg.key;
                      const value = isInit ? (tag || (schema.placeholder || NA)) : (values[seg.key] || "");
                      return (
                        <div key={seg.key}>
                          <label style={{ fontSize: 10, fontFamily: t.mono, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
                            {seg.label}
                          </label>
                          {isInit ? (
                            <div style={{ ...gI(t), background: t.surfaceAlt, color: t.textMuted, fontFamily: t.mono, fontSize: 12, cursor: "not-allowed" }} title="Set from the initiative's tracking tag">
                              {value}
                            </div>
                          ) : seg.vocab ? (
                            <select value={value} onChange={e => setEdits({ ...edits, [i]: { ...(edits[i] || {}), [seg.key]: e.target.value } })}
                              style={{ ...gSl(t), fontSize: 12, padding: "6px 8px" }}>
                              {!seg.vocab.includes(value) && <option value={value}>{value || "—"}</option>}
                              {seg.vocab.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input value={value} onChange={e => setEdits({ ...edits, [i]: { ...(edits[i] || {}), [seg.key]: e.target.value } })}
                              style={{ ...gI(t), fontSize: 12, padding: "6px 8px", fontFamily: t.mono }} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{
                    fontFamily: t.mono, fontSize: 11.5, wordBreak: "break-all", padding: "9px 11px", borderRadius: 8,
                    background: t.surface, border: "1px solid " + (errors.length ? t.warnBorder : t.border), color: t.text,
                  }}>
                    {name}
                  </div>
                  {errors.length > 0 && (
                    <ul style={{ margin: "7px 0 0", paddingLeft: 18, fontSize: 11.5, color: t.warn, lineHeight: 1.5 }}>
                      {errors.map((e, j) => <li key={j}>{e}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {record?.generatedAt && (
            <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.mono, marginTop: 14 }}>
              Last generated {fmtDate(record.generatedAt.slice(0, 10))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
