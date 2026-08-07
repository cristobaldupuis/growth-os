import { useState, useMemo } from "react";
import { gG, gGh, gSL, gCd, gSl, gI } from "../components/styles.js";
import { fmtCur, fmtDate } from "../constants.js";
import {
  resolveSchema, breakdownByDimension, listChannels, listLevels, templateFor, taxonomy, adNamesOf, normKey, NA,
  emptyCustomVariables, upsertCustomDimension, removeCustomDimension,
  addVocabValue, removeVocabValue, validateVocabValue,
} from "../services/naming.js";
import { interactive, tile } from "../components/motion.js";
import { ChargeBar } from "../components/ChargeBar.jsx";
import { NameBuilder } from "../components/NameBuilder.jsx";
import { VariableEditor } from "../components/VariableEditor.jsx";
import { availableDimensions, defaultDimension, rollupByInitiative, deriveRatios, ADDITIVE_METRICS, PERF_ROW_LIMIT } from "../services/performance.js";

// -- Performance -----------------------------------------------------------------
//
// The read half of the nomenclature engine. Everything before this wrote names;
// this reads them back and turns them into three answers:
//
//   Breakdown    — spend and conversions pivoted by any dimension the names carry.
//   Attribution  — which spend reached an initiative, and which links are broken.
//   Convention   — the naming schema itself, in one place you can point a client at.
//
// The Convention tab exists because the schema had no surface at all: it was
// data with an editor's worth of meaning and no page, reachable only by
// producing variants inside the Creative Studio and reading the slot editors.
// "Where is the naming convention" had no answer. It is read-only for now — the
// editor is the next item in this slice — and it says so rather than implying
// the values are typed here.
//
// Typography, same discipline as colour: the reading face (serif) is for copy
// read as sentences — the empty states, the convention explainer, the "needs a
// look" prose. Everything bolted to a control, a table row or a stat tile is
// sans, and figures are mono. Three families each doing one job reads as one
// system; three families alternating inside a single card reads as three.
//
// Colour discipline, deliberately: bars are one ink at one value. Hue carries no
// information in a magnitude chart — the row is already labelled and the length
// already encodes the number — so a per-row colour is decoration that reads as
// noise. Colour is spent only where it means something: a broken attribution
// link, and an unparsed share of spend.

const TABS = [
  { key: "breakdown",  label: "Breakdown",   blurb: "pivot spend and conversions by any dimension in the name" },
  { key: "attribution", label: "Attribution", blurb: "which spend reached an initiative, and which links are broken" },
  { key: "builder",    label: "Name builder", blurb: "compose a campaign, ad set and ad name, and claim it for an initiative" },
  { key: "taxonomy",   label: "Taxonomy",    blurb: "the controlled vocabulary every name is built and parsed against" },
];

// The Convention tab was renamed rather than replaced: same schema, read from
// the other end. It used to answer "what does a Meta ad name look like", which
// is a question about syntax, and left "what is a Theme, and where is it allowed
// to appear" — the question people actually arrive with — for the reader to
// reverse-engineer out of five template strings. So dimensions lead now, grouped
// by the kind of question they settle, each carrying every place it appears; the
// templates follow as the projection of that vocabulary rather than as the
// primary object. `taxonomy` and `dimensionUsage` both derive from the same
// registry the parser uses, so there is no second copy to drift.
const TAXONOMY_MODES = [
  { key: "dimensions", label: "Dimensions" },
  { key: "templates",  label: "Templates" },
];

const fmtNum = (n) => n == null ? "—" : Math.round(n).toLocaleString();
const fmtRatio = (n, suffix = "") => n == null ? "—" : (Math.round(n * 100) / 100).toFixed(2) + suffix;

function Empty({ t, title, body, action }) {
  return (
    <div style={{ ...gCd(t), textAlign: "center", padding: "34px 22px" }}>
      <div style={{ fontFamily: t.serif, fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 7 }}>{title}</div>
      <div style={{ fontSize: 13, color: t.textSub, fontFamily: t.serif, lineHeight: 1.65, maxWidth: 520, margin: "0 auto 16px" }}>{body}</div>
      {action}
    </div>
  );
}

export function PerformanceView({ t, dk, items, settings, perfRows, onImport, onClear, onAssignNames, onSaveSettings, showToast, initialTab, initialInitiativeId }) {
  const schema = resolveSchema(settings);
  const [tab, setTab] = useState(initialTab || "breakdown");
  const [dimKey, setDimKey] = useState("");
  const [sortBy, setSortBy] = useState("spend");
  const [convChannel, setConvChannel] = useState(listChannels(schema)[0]?.id || "meta");
  const [taxMode, setTaxMode] = useState("dimensions");
  const [builderInit, setBuilderInit] = useState(initialInitiativeId || "");
  // `null` = closed, `{ dimension:null }` = creating, `{ dimension }` = editing.
  const [editor, setEditor] = useState(null);
  const [valueFor, setValueFor] = useState(null);
  const [valueDraft, setValueDraft] = useState("");

  // The operator's own layer on top of the schema. Writing it back through
  // settings is the whole persistence story — every reader resolves the schema
  // through `resolveSchema`, so nothing else has to be told the vocabulary grew.
  const custom = settings?.namingCustom || emptyCustomVariables();
  const saveCustom = (next, note) => {
    if (!onSaveSettings) return;
    onSaveSettings({ ...settings, namingCustom: next });
    if (note) showToast(note, "success");
  };

  const rows = useMemo(() => perfRows || [], [perfRows]);
  const dims = useMemo(() => availableDimensions(rows, schema), [rows, schema]);
  // Falls back to the dimension that splits the data rather than to registry
  // order, so the view opens on a pivot with something to compare.
  const fallback = useMemo(() => defaultDimension(rows, schema), [rows, schema]);
  const dim  = dims.find(d => d.key === dimKey) || fallback;

  const roll = useMemo(() => rollupByInitiative(rows, items, schema), [rows, items, schema]);

  const breakdown = useMemo(
    () => dim ? breakdownByDimension(rows, dim.key, schema) : { groups: [], unparsed: 0, notInTemplate: 0 },
    [rows, dim, schema]
  );

  const totals = useMemo(() => {
    const m = {};
    rows.forEach(r => ADDITIVE_METRICS.forEach(k => { const v = r.metrics?.[k]; if (typeof v === "number") m[k] = (m[k] || 0) + v; }));
    return { metrics: m, ratios: deriveRatios(m) };
  }, [rows]);

  const dateRange = useMemo(() => {
    const dates = rows.map(r => r.date).filter(Boolean).sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  }, [rows]);

  const sorted = useMemo(() => {
    const g = [...breakdown.groups];
    if (sortBy === "rows") return g.sort((a, b) => b.rows - a.rows);
    return g.sort((a, b) => (b.metrics[sortBy] || 0) - (a.metrics[sortBy] || 0));
  }, [breakdown, sortBy]);

  const maxVal = sorted.reduce((m, g) => Math.max(m, sortBy === "rows" ? g.rows : (g.metrics[sortBy] || 0)), 0);

  const importBtn = <button onClick={onImport} style={{ ...gG(t), display: "inline-flex" }}>&#8645; Import performance CSV</button>;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 60px" }}>

      {/* Header */}
      <div style={{ margin: "22px 0 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: t.serif, fontSize: 24, fontWeight: 600, margin: 0, color: t.text }}>Performance</h2>
          <p style={{ fontSize: 13, color: t.textSub, margin: "6px 0 0", maxWidth: 700, lineHeight: 1.6 }}>
            Import a campaign-level export and every ad name is parsed back through your naming convention. That turns
            a flat spend report into a dimensional one, and joins the rows that carry a tracking tag to the initiative
            they belong to — no API integration involved.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {rows.length > 0 && <button onClick={onClear} style={gGh(t)}>Clear imported data</button>}
          <button onClick={onImport} style={gG(t)}>&#8645; Import CSV</button>
        </div>
      </div>

      {/* Corpus summary — what is loaded, before any tab makes a claim about it */}
      {rows.length > 0 && (
        <div style={{ ...gCd(t), marginBottom: 16, display: "flex", gap: 22, flexWrap: "wrap", alignItems: "baseline" }}>
          {[
            ["Rows", rows.length.toLocaleString()],
            ["Spend", fmtCur(Math.round(totals.metrics.spend || 0))],
            ["Conversions", fmtNum(totals.metrics.conversions)],
            ["Revenue", fmtCur(Math.round(totals.metrics.revenue || 0))],
            ["ROAS", fmtRatio(totals.ratios.roas, "x")],
            ["Window", dateRange ? `${fmtDate(dateRange.from)} → ${fmtDate(dateRange.to)}` : "no dates in file"],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={gSL(t)}>{label}</div>
              <div style={{ fontFamily: t.mono, fontSize: 15, fontWeight: 700, color: t.text, lineHeight: 1.1 }}>{value}</div>
            </div>
          ))}
          {rows.length >= PERF_ROW_LIMIT && (
            <div style={{ fontSize: 11.5, color: t.warn, fontFamily: t.sans, flexBasis: "100%", lineHeight: 1.5 }}>
              At the {PERF_ROW_LIMIT.toLocaleString()}-row browser storage ceiling. The oldest rows are dropped as new
              ones import — narrow the export's date range, or wait for the Postgres fact table.
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)} title={tb.blurb}
            style={{
              fontSize: 12.5, padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontFamily: t.sans,
              fontWeight: tab === tb.key ? 600 : 500,
              background: tab === tb.key ? t.surface : "transparent",
              border: "1px solid " + (tab === tb.key ? t.border : "transparent"),
              color: tab === tb.key ? t.text : t.textMuted,
              boxShadow: tab === tb.key ? t.shadow : "none",
            }}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- Breakdown */}
      {tab === "breakdown" && (
        rows.length === 0 ? (
          <Empty t={t}
            title="No performance data imported yet"
            body="Export a campaign, ad set or ad-level report from Meta or Google Ads and drop it in. Column order does not
                  matter and the usual export headers — Amount spent, Purchases conversion value, Impr. — are recognised
                  as they come."
            action={importBtn} />
        ) : !dim ? (
          <Empty t={t}
            title="Nothing parsed against the convention"
            body="Every name in the file failed to match a template, so there are no dimensions to pivot by. The Attribution
                  tab lists what was rejected and why — the usual cause is picking the wrong channel at import, or names
                  written before the convention existed."
            action={<button onClick={() => setTab("attribution")} style={{ ...gG(t), display: "inline-flex" }}>See what failed</button>} />
        ) : (
          <>
            <div style={{ ...gCd(t), marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={gSL(t)}>Break down by</div>
                <select value={dim.key} onChange={e => setDimKey(e.target.value)} style={{ ...gSl(t), width: 210 }}>
                  {dims.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <div style={gSL(t)}>Rank by</div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...gSl(t), width: 150 }}>
                  <option value="spend">Spend</option>
                  <option value="conversions">Conversions</option>
                  <option value="revenue">Revenue</option>
                  <option value="clicks">Clicks</option>
                  <option value="impressions">Impressions</option>
                  <option value="rows">Row count</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.55 }}>
                {dim.hint}
              </div>
            </div>

            {/* Coverage. Reported above the pivot rather than in a footnote,
                because a breakdown that quietly excludes a third of spend is
                worse than one that admits it. */}
            {(breakdown.unparsed > 0 || breakdown.notInTemplate > 0) && (
              <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 9, background: t.warnBg, border: "1px solid " + t.warnBorder,
                fontSize: 12, color: t.text, fontFamily: t.sans, lineHeight: 1.55 }}>
                Not in this pivot:{" "}
                {breakdown.unparsed > 0 && <><strong>{breakdown.unparsed}</strong> row{breakdown.unparsed !== 1 ? "s" : ""} whose name did not parse</>}
                {breakdown.unparsed > 0 && breakdown.notInTemplate > 0 && ", "}
                {breakdown.notInTemplate > 0 && <><strong>{breakdown.notInTemplate}</strong> row{breakdown.notInTemplate !== 1 ? "s" : ""} whose template has no {dim.label} slot</>}
                . They are excluded from the figures below, not from the import.
              </div>
            )}

            <div style={gCd(t)}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) repeat(5, minmax(64px,0.7fr))", gap: 10, paddingBottom: 8, borderBottom: "1px solid " + t.border }}>
                {[dim.label, "Spend", "Conv.", "Revenue", "ROAS", "CPA"].map((h, i) => (
                  <div key={h} style={{ ...gSL(t), marginBottom: 0, textAlign: i === 0 ? "left" : "right" }}>{h}</div>
                ))}
              </div>
              {sorted.map((g, gi) => {
                const r = deriveRatios(g.metrics);
                const val = sortBy === "rows" ? g.rows : (g.metrics[sortBy] || 0);
                const isPlaceholder = String(g.value).toUpperCase() === NA;
                return (
                  <div key={g.value} {...(()=>{const p=interactive(t,isPlaceholder?t.border:t.goldFill,{flat:true,index:gi,hoverBg:t.surfaceAlt});
                    return {className:p.className, style:{...p.style, padding:"11px 8px 11px 12px", borderBottom:"1px solid "+t.borderSoft, borderRadius:8}};})()}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) repeat(5, minmax(64px,0.7fr))", gap: 10, alignItems: "baseline" }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isPlaceholder ? t.textMuted : t.text, fontFamily: t.sans, wordBreak: "break-word" }}>
                          {g.value}
                        </span>
                        <span style={{ fontSize: 11, color: t.textMuted, fontFamily: t.mono, marginLeft: 7 }}>{g.rows} row{g.rows !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, color: t.text }}>{fmtCur(Math.round(g.metrics.spend || 0))}</div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, color: t.textSub }}>{fmtNum(g.metrics.conversions)}</div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, color: t.textSub }}>{fmtCur(Math.round(g.metrics.revenue || 0))}</div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, fontWeight: 600, color: t.text }}>{fmtRatio(r.roas, "x")}</div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, color: t.textSub }}>{r.cpa == null ? "—" : fmtCur(Math.round(r.cpa))}</div>
                    </div>
                    <div style={{ marginTop: 7 }}>
                      <ChargeBar t={t} pct={maxVal > 0 ? (val / maxVal) * 100 : 0} muted={isPlaceholder} index={gi} />
                    </div>
                  </div>
                );
              })}
              <div style={{ paddingTop: 10, fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.55 }}>
                ROAS and CPA are recomputed from each group's summed revenue, spend and conversions — never averaged
                across rows, which would give a $12 ad set the same weight as a $12,000 one.
              </div>
            </div>
          </>
        )
      )}

      {/* -------------------------------------------------------------- Attribution */}
      {tab === "attribution" && (
        rows.length === 0 ? (
          <Empty t={t}
            title="No performance data imported yet"
            body="Attribution needs rows to attribute. Import a campaign-level export and any ad whose name ends in an
                  initiative's tracking tag will be joined to it automatically."
            action={importBtn} />
        ) : (
          <>
            {/* The three-way split, kept three-way on purpose: untagged spend is
                normal business as usual, an unresolvable tag is a broken link. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
              {[
                { key: "matched",  label: "Attributed",  note: "joined to an initiative" },
                { key: "untagged", label: "Untagged",    note: "no tag in the name — normal for BAU spend" },
                { key: "unmatched",label: "Broken links",note: "carries a tag that resolves to nothing", alarm: true },
                { key: "unparsed", label: "Unparsed",    note: "name does not fit any template", alarm: true },
              ].map((c, ci) => {
                const n = roll.counts[c.key] || 0;
                const s = roll.spend[c.key] || 0;
                const live = c.alarm && n > 0;
                return (
                  <div key={c.key} {...(()=>{const p=tile(t,live?t.warn:t.goldFill,ci);return{className:p.className,style:{...gCd(t),...p.style,borderColor:live?t.warnBorder:t.border,background:live?t.warnBg:t.surface}};})()}>
                    <div style={gSL(t)}>{c.label}</div>
                    <div style={{ fontFamily: t.mono, fontSize: 22, fontWeight: 700, color: t.text, lineHeight: 1.1 }}>{n.toLocaleString()}</div>
                    <div style={{ fontFamily: t.mono, fontSize: 12, color: t.textSub, marginTop: 2 }}>{fmtCur(Math.round(s))} spend</div>
                    <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans, marginTop: 6, lineHeight: 1.45 }}>{c.note}</div>
                  </div>
                );
              })}
            </div>

            {/* Measured performance per initiative */}
            <div style={{ ...gCd(t), marginBottom: 14 }}>
              <div style={gSL(t)}>Measured performance by initiative</div>
              {roll.groups.length === 0 ? (
                <div style={{ fontSize: 13, color: t.textSub, fontFamily: t.serif, lineHeight: 1.6 }}>
                  Nothing joined. There are two ways a row reaches an initiative, and either is enough: the name carries
                  that initiative's tracking tag in its final slot, or the initiative has claimed the name outright.
                  Build names with the tag already in them from the Name builder; claim names that already exist in the
                  ad account from the same place.
                  {" "}
                  <button onClick={() => setTab("builder")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: t.serif, fontSize: 13, color: t.gold, textDecoration: "underline" }}>Open the name builder</button>.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) repeat(4, minmax(60px,0.7fr))", gap: 10, paddingBottom: 8, borderBottom: "1px solid " + t.border }}>
                    {["Initiative", "Spend", "Conv.", "Revenue", "ROAS"].map((h, i) => (
                      <div key={h} style={{ ...gSL(t), marginBottom: 0, textAlign: i === 0 ? "left" : "right" }}>{h}</div>
                    ))}
                  </div>
                  {roll.groups.map((g, ri) => (
                    <div key={g.initiativeId} {...(()=>{const p=interactive(t,t.goldFill,{flat:true,index:ri,hoverBg:t.surfaceAlt});
                      return {className:p.className, style:{...p.style, display:"grid", gridTemplateColumns:"minmax(0,2fr) repeat(4, minmax(60px,0.7fr))", gap:10, padding:"11px 8px 11px 12px", borderBottom:"1px solid "+t.borderSoft, alignItems:"baseline", borderRadius:8}};})()}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, fontFamily: t.sans }}>
                          {g.initiative?.initId ? g.initiative.initId + " · " : ""}{g.initiative?.title || "Unknown"}
                        </div>
                        <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.mono, marginTop: 2 }}>
                          {/* Which bridge carried this. "Claimed" is a person's
                              decision and "tag" is the convention working; a
                              rollup should be able to say which it is standing on. */}
                          {(g.via || []).map(v => v === "name" ? "claimed name" : "tracking tag").join(" + ") || "—"}
                          {g.trackingTag ? " " + g.trackingTag : ""} · {g.names.length} name{g.names.length !== 1 ? "s" : ""} · {g.rows} row{g.rows !== 1 ? "s" : ""}
                          {g.firstDate ? ` · ${fmtDate(g.firstDate)} → ${fmtDate(g.lastDate)}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, color: t.text }}>{fmtCur(Math.round(g.metrics.spend || 0))}</div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, color: t.textSub }}>{fmtNum(g.metrics.conversions)}</div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, color: t.textSub }}>{fmtCur(Math.round(g.metrics.revenue || 0))}</div>
                      <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 13, fontWeight: 600, color: t.text }}>{fmtRatio(g.ratios.roas, "x")}</div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Claimed names, and whether the data actually contains them.
                A claim that never appears in an export is silent — the rollup
                simply shows less spend than it should, and nothing anywhere says
                why. Usually it is a paste that picked up a trailing space or a
                campaign that was renamed after being claimed. Both are one-line
                fixes once you can see them, and invisible until then. */}
            {(() => {
              const claimed = (items || []).flatMap(i => adNamesOf(i).map(e => ({ ...e, item: i })));
              if (claimed.length === 0) return null;
              const seen = new Set();
              roll.rows.forEach(r => [r.name, r.adsetName, r.campaignName].forEach(n => { if (n) seen.add(normKey(n)); }));
              const missing = claimed.filter(c => !seen.has(normKey(c.name)));
              return (
                <div style={{ ...gCd(t), marginBottom: 14, ...(missing.length ? { borderColor: t.warnBorder } : {}) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ ...gSL(t), marginBottom: 0 }}>Claimed names</div>
                    <div style={{ fontFamily: t.mono, fontSize: 11, color: missing.length ? t.warn : t.textMuted }}>
                      {claimed.length - missing.length}/{claimed.length} found in this data
                    </div>
                  </div>
                  {missing.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: t.textSub, fontFamily: t.serif, lineHeight: 1.6, marginTop: 8 }}>
                      Every name an initiative claims appears in the imported rows. Nothing is being claimed into thin air.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12.5, color: t.text, fontFamily: t.serif, lineHeight: 1.6, margin: "8px 0 7px" }}>
                        <strong>{missing.length} claimed name{missing.length !== 1 ? "s do" : " does"} not appear anywhere in this import.</strong>{" "}
                        The claim is doing nothing until the string matches exactly — check for a stray space, or for a
                        campaign renamed in the platform after it was claimed here.
                      </div>
                      {missing.slice(0, 10).map(c => (
                        <div key={c.item.id + c.name} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", flexWrap: "wrap" }}>
                          <code style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textSub, wordBreak: "break-all" }}>{c.name}</code>
                          <span style={{ fontFamily: t.mono, fontSize: 10, color: t.warn }}>{c.item.initId || c.item.title}</span>
                        </div>
                      ))}
                      {missing.length > 10 && <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans, marginTop: 4 }}>…and {missing.length - 10} more.</div>}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Broken links, named. A count is not actionable; the string is. */}
            {(() => {
              const broken = [...new Map(roll.rows.filter(r => r.attribution === "unmatched").map(r => [r.name, r])).values()];
              const bad    = [...new Map(roll.rows.filter(r => r.attribution === "unparsed").map(r => [r.name, r])).values()];
              if (broken.length === 0 && bad.length === 0) return null;
              return (
                <div style={gCd(t)}>
                  <div style={gSL(t)}>Needs a look</div>
                  {broken.length > 0 && (
                    <div style={{ marginBottom: bad.length ? 14 : 0 }}>
                      <div style={{ fontSize: 12.5, color: t.text, fontFamily: t.serif, marginBottom: 7, lineHeight: 1.55 }}>
                        <strong>{broken.length} name{broken.length !== 1 ? "s" : ""} carry a tracking tag that matches no initiative.</strong>{" "}
                        Either the initiative was deleted, or the tag was typed rather than stamped.
                      </div>
                      {broken.slice(0, 12).map(r => (
                        <div key={r.name} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", flexWrap: "wrap" }}>
                          <code style={{ fontFamily: t.mono, fontSize: 11, color: t.warn, fontWeight: 700 }}>{r.trackingTag}</code>
                          <span style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textMuted, wordBreak: "break-all" }}>{r.name}</span>
                        </div>
                      ))}
                      {broken.length > 12 && <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans, marginTop: 4 }}>…and {broken.length - 12} more.</div>}
                    </div>
                  )}
                  {bad.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12.5, color: t.text, fontFamily: t.serif, marginBottom: 7, lineHeight: 1.55 }}>
                        <strong>{bad.length} name{bad.length !== 1 ? "s" : ""} did not parse.</strong>{" "}
                        These are counted in every total but contribute to no dimension — parsing refuses to guess at an
                        alignment rather than mis-attributing the row.
                      </div>
                      {bad.slice(0, 8).map(r => (
                        <div key={r.name} style={{ padding: "4px 0" }}>
                          <div style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textSub, wordBreak: "break-all" }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.45 }}>{r.parseErrors?.[0]}</div>
                        </div>
                      ))}
                      {bad.length > 8 && <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans, marginTop: 4 }}>…and {bad.length - 8} more.</div>}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )
      )}

      {/* ------------------------------------------------------------------ Builder */}
      {tab === "builder" && (
        <NameBuilder t={t} schema={schema} items={items}
          initiativeId={builderInit} onInitiative={setBuilderInit}
          onAssign={onAssignNames} showToast={showToast} />
      )}

      {/* ----------------------------------------------------------------- Taxonomy */}
      {tab === "taxonomy" && (
        <>
          <div style={{ ...gCd(t), marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ minWidth: 0, flex: "1 1 340px" }}>
                <div style={gSL(t)}>Active schema</div>
                <div style={{ fontFamily: t.serif, fontSize: 16, fontWeight: 600, color: t.text }}>{schema.label}</div>
                <div style={{ fontFamily: t.mono, fontSize: 11, color: t.textMuted, marginTop: 3 }}>
                  {schema.id} · delimiter <strong>{schema.delimiter}</strong> · placeholder <strong>{schema.placeholder || NA}</strong>
                  {schema.initiativeDimension ? ` · initiative slot "${schema.initiativeDimension}"` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {TAXONOMY_MODES.map(m => (
                    <button key={m.key} onClick={() => setTaxMode(m.key)}
                      style={{
                        fontSize: 12, padding: "7px 12px", borderRadius: 9, cursor: "pointer", fontFamily: t.sans,
                        fontWeight: taxMode === m.key ? 600 : 500,
                        background: taxMode === m.key ? t.surfaceAlt : "transparent",
                        border: "1px solid " + (taxMode === m.key ? t.border : "transparent"),
                        color: taxMode === m.key ? t.text : t.textMuted,
                      }}>{m.label}</button>
                  ))}
                </div>
                {taxMode === "templates" && (
                  <select value={convChannel} onChange={e => setConvChannel(e.target.value)} style={{ ...gSl(t), width: 170 }}>
                    {listChannels(schema).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
                {onSaveSettings && (
                  <button onClick={() => setEditor({ dimension: null })} style={gG(t)}>+ Add variable</button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: t.textSub, fontFamily: t.serif, lineHeight: 1.65, margin: "12px 0 0", maxWidth: 720 }}>
              {taxMode === "dimensions" ? (
                <>The vocabulary comes first because it is the part that has to be agreed. A dimension is a question the
                  name answers, and a controlled one is a question with a fixed set of allowed answers — which is what
                  stops <code style={{ fontFamily: t.mono }}>Reels</code> and <code style={{ fontFamily: t.mono }}>reels</code> and{" "}
                  <code style={{ fontFamily: t.mono }}>Reel</code> from becoming three rows in a pivot that should have one.
                  Where each dimension appears is shown beside it, because the same dimension sits at different depths in
                  different channels and that is a fact about the estate, not an inconsistency. The shipped list is a
                  starting point, not the whole vocabulary — add the variables this business actually plans against, and
                  add values to a controlled list when a campaign brings something the list has never had to describe.</>
              ) : (
                <>Two rules make positional parsing safe, and both are enforced in code rather than by discipline: a slot is
                  never omitted or reordered — an absent value is written <code style={{ fontFamily: t.mono }}>{schema.placeholder || NA}</code> —
                  and the delimiter never appears inside a value. Names are assembled by the builder, never typed, which is
                  why an export from three months ago still parses today. A custom variable is appended to the end of the
                  templates it is placed in, never inserted into the middle of one — see the Dimensions tab to add one.</>
              )}
            </p>
          </div>

          {/* Dimensions, grouped by the kind of question they settle */}
          {taxMode === "dimensions" && taxonomy(schema).map((fam, fi) => (
            <div key={fam.key} style={{ ...gCd(t), marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ ...gSL(t), marginBottom: 0 }}>{fam.label}</div>
                <div style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textMuted }}>
                  {fam.dimensions.length} dimension{fam.dimensions.length !== 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, flex: "1 1 260px" }}>{fam.hint}</div>
              </div>
              {fam.dimensions.map((d, di) => (
                <div key={d.key} {...(() => { const p = interactive(t, d.isBridge ? t.gold : t.goldFill, { flat: true, index: fi + di, hoverBg: t.surfaceAlt });
                  return { className: p.className, style: { ...p.style, padding: "9px 8px 9px 12px", borderRadius: 8, borderBottom: di < fam.dimensions.length - 1 ? "1px solid " + t.borderSoft : "none" } }; })()}>
                  <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.text, fontFamily: t.sans }}>{d.label}</span>
                    <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textMuted }}>{d.key}</span>
                    {d.isBridge && (
                      <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: t.gold, border: "1px solid " + t.goldBorder, borderRadius: 4, padding: "1px 6px" }}>
                        Growth OS bridge
                      </span>
                    )}
                    {d.custom && (
                      <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: t.textSub, border: "1px solid " + t.border, borderRadius: 4, padding: "1px 6px" }}>
                        Custom
                      </span>
                    )}
                    <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted }}>
                      {d.vocab ? `${d.vocab.length} allowed values` : "free text"}
                    </span>

                    {/* Editing lives on the row it edits. A shipped dimension can
                        take new values but cannot be removed — an operator
                        deleting `geo` would orphan every name already carrying
                        it, and that is not a decision this page should offer. */}
                    {onSaveSettings && (
                      <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {d.vocab && (
                          <button onClick={() => { setValueFor(valueFor === d.key ? null : d.key); setValueDraft(""); }}
                            style={{ ...gGh(t), fontSize: 11, padding: "3px 9px" }}>
                            {valueFor === d.key ? "Close" : "+ Value"}
                          </button>
                        )}
                        {d.custom && (
                          <>
                            <button onClick={() => setEditor({ dimension: d })} style={{ ...gGh(t), fontSize: 11, padding: "3px 9px" }}>Edit</button>
                            <button
                              onClick={() => {
                                const used = d.usage.length;
                                const warn = used > 0
                                  ? `Remove ${d.label}? It sits in ${used} template${used !== 1 ? "s" : ""}, and every name already built from ${used !== 1 ? "them" : "it"} will stop parsing.`
                                  : `Remove ${d.label}? It is in no template, so nothing already built is affected.`;
                                if (window.confirm(warn)) saveCustom(removeCustomDimension(custom, d.key), `${d.label} removed from the taxonomy.`);
                              }}
                              style={{ ...gGh(t), fontSize: 11, padding: "3px 9px", color: t.warn }}>Remove</button>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, marginTop: 3 }}>{d.hint}</div>

                  {/* Adding a value is the safe half of editing a taxonomy: a
                      longer list accepts more names and invalidates none of the
                      names already built against the shorter one. */}
                  {valueFor === d.key && (() => {
                    const err = valueDraft.trim() ? validateVocabValue(valueDraft, schema, d.vocab || []) : null;
                    const commit = () => {
                      if (!valueDraft.trim() || err) return;
                      saveCustom(addVocabValue(custom, d.key, valueDraft.trim()), `"${valueDraft.trim()}" added to ${d.label}.`);
                      setValueDraft("");
                      setValueFor(null);
                    };
                    return (
                      <div style={{ marginTop: 7, maxWidth: 420 }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={valueDraft} onChange={e => setValueDraft(e.target.value)} autoFocus
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
                            placeholder={`New ${d.label.toLowerCase()} value`}
                            style={{ ...gI(t), fontFamily: t.mono, fontSize: 12, padding: "6px 9px" }} />
                          <button onClick={commit} disabled={!valueDraft.trim() || !!err}
                            style={{ ...gG(t), flexShrink: 0, fontSize: 11.5, padding: "5px 12px",
                              opacity: (!valueDraft.trim() || err) ? 0.45 : 1, cursor: (!valueDraft.trim() || err) ? "not-allowed" : "pointer" }}>Add</button>
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4, fontFamily: t.sans, color: err ? t.warn : t.textMuted }}>
                          {err || "Added to this workspace only. The shipped values stay as they are, and every name already built keeps parsing."}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Where it lives. A dimension nothing uses is worth seeing as
                      much as one everything uses — it is usually a leftover. */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {d.usage.length === 0 ? (
                      <span style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans }}>In no template — defined but unused.</span>
                    ) : d.usage.map(u => (
                      <span key={u.channel + u.level} title={`Slot ${u.slot} of ${u.of}`}
                        style={{ fontFamily: t.mono, fontSize: 9.5, color: t.textSub, background: t.surfaceAlt,
                          border: "1px solid " + t.border, borderRadius: 4, padding: "1px 6px" }}>
                        {u.channelLabel} {u.levelLabel.toLowerCase()} · {u.slot}/{u.of}
                      </span>
                    ))}
                  </div>

                  {d.vocab && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                      {d.vocab.map(v => {
                        const added = (d.vocabAdded || []).some(x => normKey(x) === normKey(v));
                        return (
                          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: t.mono, fontSize: 10,
                            color: added ? t.text : t.textSub, background: t.surfaceAlt,
                            border: "1px solid " + (added ? t.goldBorder : t.border), borderRadius: 4,
                            padding: added ? "1px 3px 1px 6px" : "1px 6px" }}>
                            {v}
                            {added && onSaveSettings && (
                              <button onClick={() => saveCustom(removeVocabValue(custom, d.key, v), `"${v}" removed from ${d.label}.`)}
                                title={`Remove ${v} — names already built with it will stop validating`}
                                style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 2px" }}>
                                <span>&#10005;</span>
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Levels — one record projects into all of them at once */}
          {taxMode === "templates" && listLevels(schema, convChannel).map(level => {
            const tpl = templateFor(schema, convChannel, level.key);
            return (
              <div key={level.key} style={{ ...gCd(t), marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
                  <div style={{ ...gSL(t), marginBottom: 0 }}>{level.label} name</div>
                  <div style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textMuted }}>{tpl.length} slots</div>
                </div>
                <div style={{ fontFamily: t.mono, fontSize: 11.5, color: t.text, background: t.surfaceAlt, border: "1px solid " + t.border,
                  borderRadius: 9, padding: "9px 11px", wordBreak: "break-all", lineHeight: 1.7 }}>
                  {tpl.map(d => d.label).join(schema.delimiter)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 10 }}>
                  {tpl.map((d, i) => (
                    <div key={d.key} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < tpl.length - 1 ? "1px solid " + t.borderSoft : "none" }}>
                      <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textMuted, width: 20, flexShrink: 0, paddingTop: 2 }}>{i + 1}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text, fontFamily: t.sans }}>{d.label}</span>
                          <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textMuted }}>{d.key}</span>
                          {d.key === schema.initiativeDimension && (
                            <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                              color: t.gold, border: "1px solid " + t.goldBorder, borderRadius: 4, padding: "1px 6px" }}>
                              Growth OS bridge
                            </span>
                          )}
                          {!d.vocab && (
                            <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted }}>
                              free text
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, marginTop: 2 }}>{d.hint}</div>
                        {d.vocab && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                            {d.vocab.map(v => (
                              <span key={v} style={{ fontFamily: t.mono, fontSize: 10, color: t.textSub, background: t.surfaceAlt,
                                border: "1px solid " + t.border, borderRadius: 4, padding: "1px 6px" }}>{v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {editor && (
        <VariableEditor t={t} dk={dk} schema={schema} dimension={editor.dimension}
          onClose={() => setEditor(null)}
          onSave={(draft, originalKey) => {
            saveCustom(
              upsertCustomDimension(custom, draft, originalKey),
              originalKey
                ? `${draft.label} updated. The builder, the parser and every breakdown use it from here.`
                : `${draft.label} added. It is now a dimension everywhere the schema is read.`
            );
            setEditor(null);
          }} />
      )}
    </div>
  );
}
