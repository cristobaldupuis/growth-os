import { useMemo, useState } from "react";
import { brandName, iceScore, fmtCur, fmtDate, parseD, somM, eomM } from "../constants.js";
import { gG, gGh, gCd, gSL } from "../components/styles.js";
import { OBdg, CBdg, ICEChip } from "../components/badges.jsx";
import { renderProse } from "../components/text.jsx";

// ── Helpers ────────────────────────────────────────────────────────────────────

function normBrandId(id, brands) {
  return (!id || id === "default") ? (brands[0] && brands[0].id || "default") : id;
}

function brandFilter(item, activeBrand, brands) {
  return activeBrand === "all" || normBrandId(item.brandId, brands) === normBrandId(activeBrand, brands);
}

// A closed initiative's close date — endDate first, falling back to a date
// recorded on results, matching how the rest of the app treats "when this closed".
function closeDateOf(e) {
  return parseD(e.endDate) || parseD(e.results?.endDate);
}

function CopyBtn({ t, onClick, label = "Copy section" }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    onClick();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handle} style={{ ...gGh(t), fontSize: 11, padding: "3px 10px", flexShrink: 0 }}>
      {copied ? "Copied" : label}
    </button>
  );
}

// ── Plain-text builders ────────────────────────────────────────────────────────

function buildScorecardText(dash, latestWeek, weekLabel, brands, activeBrand, settings) {
  const retailer = activeBrand === "all" ? "All brands" : brandName(activeBrand, brands);
  const lines = [
    "SCORECARD",
    "Brand / portfolio: " + retailer,
    "North star: " + (settings.northStarMetric || "—") + "  Current: " + (settings.northStarCurrent || "—") + "  Target: " + (settings.northStarTarget || "—"),
    "",
    "Projected impact from completed work: " + fmtCur(dash.revImpacted) + (dash.revImpactedProjected ? " (includes projected estimates)" : ""),
    "Revenue at risk / in-flight: " + fmtCur(dash.revAtRisk),
    dash.winRate !== null ? "Win rate: " + dash.winRate + "% (" + dash.wins + " of " + dash.closed + " closed)" : null,
    "Experiments: " + dash.running + " running / " + dash.completed + " completed / " + dash.pipeline + " in pipeline",
    dash.avgIce !== null ? "Average ICE score: " + dash.avgIce : null,
  ].filter(Boolean);

  if (latestWeek) {
    lines.push("");
    lines.push("WEEKLY METRICS · " + weekLabel);
    const m = latestWeek.metrics || {};
    if (m.revenue != null)     lines.push("Revenue: " + fmtCur(m.revenue));
    if (m.sessions != null)    lines.push("Sessions: " + m.sessions.toLocaleString());
    if (m.traffic != null && m.sessions == null) lines.push("Sessions: " + m.traffic.toLocaleString());
    if (m.conversions != null) lines.push("Conversions: " + m.conversions.toLocaleString());
    if (m.aov != null)         lines.push("AOV: " + fmtCur(m.aov));
    if (m.cac != null)         lines.push("CAC: " + fmtCur(m.cac));
  }

  return lines.join("\n");
}

function buildLearnedText(learned, isFallback, rangeLabel) {
  if (learned.length === 0) return "WHAT WE LEARNED THIS PERIOD\n\nNo completed or closed initiatives with learnings yet.";
  const lines = isFallback
    ? ["WHAT WE LEARNED THIS PERIOD", "", "There are no learnings available for " + rangeLabel + ". Here are the 5 most recent initiatives available.", ""]
    : ["WHAT WE LEARNED THIS PERIOD · " + rangeLabel, ""];
  learned.forEach((item, i) => {
    lines.push((i + 1) + ". " + item.title);
    lines.push("Outcome: " + (item.results?.outcomeClassification || "—"));
    if (item.results?.keyLearning) lines.push("Learning: " + item.results.keyLearning);
    if (item.results?.decisionMade) lines.push("Decision: " + item.results.decisionMade);
    if (item.endDate) lines.push("Closed: " + fmtDate(item.endDate));
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

function buildRunningText(running) {
  if (running.length === 0) return "WHAT'S RUNNING NOW\n\nNo initiatives currently running.";
  const lines = ["WHAT'S RUNNING NOW", ""];
  running.forEach((item, i) => {
    const ice = iceScore(item.ice?.impact, item.ice?.certainty, item.ice?.ease);
    lines.push((i + 1) + ". " + item.title);
    lines.push("Category: " + item.category + "  ICE: " + (ice !== null ? ice : "—") + "  Est. impact: " + fmtCur(item.revenueImpact));
    if (item.startDate) lines.push("Started: " + fmtDate(item.startDate));
    if (item.successMetric) lines.push("Success metric: " + item.successMetric);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

function buildNextText(next) {
  if (next.length === 0) return "WHAT'S NEXT\n\nNo draft initiatives in pipeline.";
  const lines = ["WHAT'S NEXT", ""];
  next.forEach((item, i) => {
    const ice = iceScore(item.ice?.impact, item.ice?.certainty, item.ice?.ease);
    const hyp = item.hypothesis ? (item.hypothesis.length > 120 ? item.hypothesis.slice(0, 120) + "…" : item.hypothesis) : null;
    lines.push((i + 1) + ". " + item.title);
    lines.push("Category: " + item.category + "  ICE: " + (ice !== null ? ice : "—") + "  Est. impact: " + fmtCur(item.revenueImpact));
    if (hyp) lines.push("Hypothesis: " + hyp);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ t, dk, title, onCopy, children }) {
  return (
    <div style={{ ...gCd(t, dk), display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ ...gSL(t), marginBottom: 0 }}>{title}</div>
        <CopyBtn t={t} onClick={onCopy} />
      </div>
      {children}
    </div>
  );
}

// ── Section 1: Scorecard ───────────────────────────────────────────────────────

function ScorecardSection({ t, dk, dash, weeklyMetrics, brands, activeBrand, settings, onCopy }) {
  const { latestWeek, weekLabel } = useMemo(() => {
    if (!weeklyMetrics || weeklyMetrics.length === 0) return { latestWeek: null, weekLabel: "" };
    const sorted = [...weeklyMetrics].sort((a, b) => b.date.localeCompare(a.date));
    const entries = activeBrand === "all"
      ? sorted
      : sorted.filter(m => {
          const mid = normBrandId(m.brand, brands);
          return mid === normBrandId(activeBrand, brands);
        });
    const latest = entries[0] || null;
    return {
      latestWeek: latest,
      weekLabel: latest ? fmtDate(latest.date) : "",
    };
  }, [weeklyMetrics, activeBrand, brands]);

  const kpis = [
    { label: "Projected impact", value: fmtCur(dash.revImpacted), sub: dash.revImpactedProjected ? "includes estimates" : "from completed", hero: true },
    { label: "Revenue at risk", value: fmtCur(dash.revAtRisk), sub: "running now" },
    { label: "Win rate", value: dash.winRate !== null ? dash.winRate + "%" : "—", sub: dash.wins + "/" + dash.closed + " closed" },
    { label: "Running / Done / Pipeline", value: dash.running + " / " + dash.completed + " / " + dash.pipeline, sub: " " },
    dash.avgIce !== null ? { label: "Avg ICE", value: dash.avgIce, sub: "all initiatives" } : null,
  ].filter(Boolean);

  const m = latestWeek?.metrics || {};
  const weekKpis = latestWeek ? [
    m.revenue     != null ? { label: "Revenue",     value: fmtCur(m.revenue) }          : null,
    (m.sessions ?? m.traffic) != null ? { label: "Sessions",    value: (m.sessions ?? m.traffic).toLocaleString() } : null,
    m.conversions != null ? { label: "Conversions", value: m.conversions.toLocaleString() } : null,
    m.aov         != null ? { label: "AOV",         value: fmtCur(m.aov) }               : null,
    m.cac         != null ? { label: "CAC",         value: fmtCur(m.cac) }               : null,
  ].filter(Boolean) : [];

  return (
    <Section t={t} dk={dk} title="Scorecard" onCopy={onCopy}>
      {/* North star strip */}
      {settings.northStarMetric && (
        <div style={{ display: "flex", gap: 20, padding: "10px 14px", background: t.goldBg, border: "1px solid " + t.goldBorder, borderRadius: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: t.gold, fontFamily: t.mono, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>{settings.northStarMetric}</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: t.textMuted, fontFamily: t.mono }}>Current <strong style={{ color: t.gold }}>{settings.northStarCurrent || "—"}</strong></span>
            <span style={{ fontSize: 11, color: t.textMuted, fontFamily: t.mono }}>&#8594; Target <strong style={{ color: t.text }}>{settings.northStarTarget || "—"}</strong></span>
          </div>
        </div>
      )}

      {/* Portfolio KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 8 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.hero ? t.goldBg : t.surfaceAlt, border: "1px solid " + (k.hero ? t.goldBorder : t.border), borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.mono, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.hero ? t.gold : t.text, fontFamily: t.mono, letterSpacing: "-0.02em", lineHeight: 1 }}>{k.value}</div>
            {k.sub && k.sub !== " " && <div style={{ fontSize: 10, color: t.textMuted, fontFamily: t.serif, marginTop: 5 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Weekly metrics */}
      {latestWeek && weekKpis.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontFamily: t.mono, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Weekly metrics · {weekLabel}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {weekKpis.map(k => (
              <div key={k.label} style={{ background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 8, padding: "9px 13px", minWidth: 90 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.mono, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.gold, fontFamily: t.mono, letterSpacing: "-0.01em", lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!latestWeek && (
        <div style={{ fontSize: 12, color: t.textMuted, fontFamily: t.serif, fontStyle: "italic" }}>No weekly metrics logged yet.</div>
      )}
    </Section>
  );
}

// ── Section 2: Learned ────────────────────────────────────────────────────────

function LearnedSection({ t, dk, learned, isFallback, rangeLabel, onCopy }) {
  const _outcomeColor = (o) => {
    const map = {
      Jackpot:      t.teal,
      Success:      t.teal,
      Failed:       t.red,
      Inconclusive: t.warn,
    };
    return map[o] || (t.textMuted);
  };

  return (
    <Section t={t} dk={dk} title="What we learned this period" onCopy={onCopy}>
      <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.serif, marginTop: -8 }}>{rangeLabel}</div>

      {/* Fallback notice — deliberately its own banner, not a caption swap, so
          data from outside the selected range can never be mistaken for
          in-range results at a glance. */}
      {isFallback && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 8, background: t.warnBg, border: "1px solid " + t.warnBorder }}>
          <span style={{ color: t.warn, fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>&#9888;</span>
          <span style={{ fontSize: 12, color: t.warn, fontFamily: t.sans, lineHeight: 1.5, fontWeight: 600 }}>
            There are no learnings available for these dates. Here are the 5 most recent initiatives available.
          </span>
        </div>
      )}

      {learned.length === 0 ? (
        <div style={{ padding: "18px 12px", textAlign: "center", border: "1px dashed " + t.border, borderRadius: 8, color: t.textMuted, fontFamily: t.serif, fontSize: 12 }}>
          No completed or closed initiatives with learnings yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {learned.map(item => (
            <div key={item.id} style={{
              background: isFallback ? t.surface : t.surfaceAlt,
              border: isFallback ? "1px dashed " + t.textMuted : "1px solid " + t.border,
              borderRadius: 10, padding: "13px 16px", display: "flex", flexDirection: "column", gap: 7,
              opacity: isFallback ? 0.85 : 1,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, fontFamily: t.sans, lineHeight: 1.3, flex: 1, minWidth: 0 }}>{item.title}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {isFallback && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.warn, fontFamily: t.mono, padding: "2px 6px", border: "1px solid " + t.warnBorder, borderRadius: 4 }}>Prior period</span>}
                  <OBdg o={item.results?.outcomeClassification} dk={dk} />
                  {item.endDate && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: t.mono }}>{fmtDate(item.endDate)}</span>}
                </div>
              </div>
              {item.results?.keyLearning && (
                <div style={{ fontSize: 12.5, color: t.textSub, fontFamily: t.sans, lineHeight: 1.55 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.mono, marginRight: 6 }}>Learning</span>
                  {renderProse(item.results.keyLearning)}
                </div>
              )}
              {item.results?.decisionMade && (
                <div style={{ fontSize: 12, color: t.textSub, fontFamily: t.sans, lineHeight: 1.5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.mono, marginRight: 6 }}>Decision</span>
                  {renderProse(item.results.decisionMade)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Section 3: Running ────────────────────────────────────────────────────────

function RunningSection({ t, dk, running, cats, onCopy }) {
  return (
    <Section t={t} dk={dk} title="What's running now" onCopy={onCopy}>
      {running.length === 0 ? (
        <div style={{ padding: "18px 12px", textAlign: "center", border: "1px dashed " + t.border, borderRadius: 8, color: t.textMuted, fontFamily: t.serif, fontSize: 12 }}>
          No initiatives currently running.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {running.map(item => {
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, fontFamily: t.sans, lineHeight: 1.3, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <CBdg cat={item.category} cats={cats} dk={dk} t={t}/>
                    <ICEChip ice={item.ice} t={t} />
                    {item.startDate && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: t.mono }}>Started {fmtDate(item.startDate)}</span>}
                  </div>
                  {item.successMetric && (
                    <div style={{ fontSize: 11.5, color: t.textSub, fontFamily: t.sans, lineHeight: 1.5, marginTop: 5 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.mono, marginRight: 5 }}>Success metric</span>
                      {item.successMetric}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 9.5, color: t.textMuted, fontFamily: t.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>Est. impact</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: t.gold, fontFamily: t.mono, letterSpacing: "-0.01em" }}>{fmtCur(item.revenueImpact)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── Section 4: Next ───────────────────────────────────────────────────────────

function NextSection({ t, dk, next, cats, onCopy }) {
  return (
    <Section t={t} dk={dk} title="What's next" onCopy={onCopy}>
      {next.length === 0 ? (
        <div style={{ padding: "18px 12px", textAlign: "center", border: "1px dashed " + t.border, borderRadius: 8, color: t.textMuted, fontFamily: t.serif, fontSize: 12 }}>
          No draft initiatives in pipeline.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {next.map(item => {
            const hyp = item.hypothesis ? (item.hypothesis.length > 120 ? item.hypothesis.slice(0, 120) + "…" : item.hypothesis) : null;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, fontFamily: t.sans, lineHeight: 1.3, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <CBdg cat={item.category} cats={cats} dk={dk} t={t}/>
                    <ICEChip ice={item.ice} t={t} />
                  </div>
                  {hyp && (
                    <div style={{ fontSize: 11.5, color: t.textSub, fontFamily: t.sans, lineHeight: 1.5, marginTop: 5 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.mono, marginRight: 5 }}>Hypothesis</span>
                      {hyp}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 9.5, color: t.textMuted, fontFamily: t.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>Est. impact</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: t.gold, fontFamily: t.mono, letterSpacing: "-0.01em" }}>{fmtCur(item.revenueImpact)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function ClientReadoutView({ t, dk, dash, items, brands, activeBrand, cats, weeklyMetrics, settings }) {
  // Derive sorted weekly metrics for scorecard
  const { latestWeek, weekLabel } = useMemo(() => {
    if (!weeklyMetrics || weeklyMetrics.length === 0) return { latestWeek: null, weekLabel: "" };
    const sorted = [...weeklyMetrics].sort((a, b) => b.date.localeCompare(a.date));
    const entries = activeBrand === "all"
      ? sorted
      : sorted.filter(m => normBrandId(m.brand, brands) === normBrandId(activeBrand, brands));
    const latest = entries[0] || null;
    return { latestWeek: latest, weekLabel: latest ? fmtDate(latest.date) : "" };
  }, [weeklyMetrics, activeBrand, brands]);

  // Section 2 — learnings in the selected date range, defaulting to the
  // current calendar month. Mirrors the Dashboard's own range picker (This
  // month / Last month / Custom) rather than the old fixed 30-day lookback.
  const [dRange, setDRange] = useState("thisMonth");
  const [cFrom,  setCFrom]  = useState("");
  const [cTo,    setCTo]    = useState("");

  const bounds = useMemo(() => {
    const now = new Date();
    if (dRange === "lastMonth") { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from: somM(lm), to: eomM(lm) }; }
    if (dRange === "custom" && cFrom && cTo) return { from: new Date(cFrom + "T00:00:00"), to: new Date(cTo + "T23:59:59") };
    return { from: somM(now), to: eomM(now) };
  }, [dRange, cFrom, cTo]);

  const rangeLabel = useMemo(() => {
    const fmt = (d) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
    return fmt(bounds.from) + " – " + fmt(bounds.to);
  }, [bounds]);

  const closedWithLearnings = useMemo(() => items.filter(e =>
    (e.status === "Completed" || e.status === "Killed") && e.results?.keyLearning
  ), [items]);

  // In-range results are the normal path. Only when the selected range has
  // nothing do we fall back to the most recent prior initiatives — and that
  // fallback is flagged so the UI can never present it as "this period" data.
  const learnedInRange = useMemo(() =>
    closedWithLearnings
      .filter(e => { const d = closeDateOf(e); return d && d >= bounds.from && d <= bounds.to; })
      .sort((a, b) => closeDateOf(b) - closeDateOf(a))
      .slice(0, 5),
    [closedWithLearnings, bounds]
  );

  const learnedFallback = useMemo(() => {
    if (learnedInRange.length > 0) return [];
    return closedWithLearnings
      .filter(e => { const d = closeDateOf(e); return d && d < bounds.from; })
      .sort((a, b) => closeDateOf(b) - closeDateOf(a))
      .slice(0, 5);
  }, [closedWithLearnings, bounds, learnedInRange.length]);

  const isFallback = learnedInRange.length === 0 && learnedFallback.length > 0;
  const learned = isFallback ? learnedFallback : learnedInRange;

  // Section 3 — running
  const running = useMemo(() =>
    [...items.filter(e => e.status === "Running" && brandFilter(e, activeBrand, brands))]
      .sort((a, b) => {
        const sa = iceScore(a.ice?.impact, a.ice?.certainty, a.ice?.ease) ?? -1;
        const sb = iceScore(b.ice?.impact, b.ice?.certainty, b.ice?.ease) ?? -1;
        return sb - sa;
      })
      .slice(0, 8),
    [items, activeBrand, brands]
  );

  // Section 4 — next / draft
  const next = useMemo(() =>
    [...items.filter(e => e.status === "Draft" && brandFilter(e, activeBrand, brands))]
      .sort((a, b) => {
        const sa = iceScore(a.ice?.impact, a.ice?.certainty, a.ice?.ease) ?? -1;
        const sb = iceScore(b.ice?.impact, b.ice?.certainty, b.ice?.ease) ?? -1;
        return sb - sa;
      })
      .slice(0, 5),
    [items, activeBrand, brands]
  );

  // Copy helpers
  const copyText = (text) => {
    // Clipboard access is denied in some embedded/insecure contexts; the
    // readout is still on screen to copy by hand, so this is not worth an alert.
    try { navigator.clipboard.writeText(text); } catch (err) { console.warn("Clipboard write blocked:", err); }
  };

  const scorecardText = buildScorecardText(dash, latestWeek, weekLabel, brands, activeBrand, settings);
  const learnedText   = buildLearnedText(learned, isFallback, rangeLabel);
  const runningText   = buildRunningText(running);
  const nextText      = buildNextText(next);

  const fullText = [
    "GROWTH OS SUMMARY",
    "Generated: " + new Date().toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }),
    "Portfolio: " + (activeBrand === "all" ? "All brands" : brandName(activeBrand, brands)),
    "",
    scorecardText,
    "",
    learnedText,
    "",
    runningText,
    "",
    nextText,
  ].join("\n");

  return (
    // The 900px measure is deliberate — this view is a document meant to be read
    // and copied into a client email, not a dashboard to be scanned, and long
    // prose lines at full width are hard to read. It was left-aligned though,
    // which on a wide monitor reads as a layout bug rather than a choice, so it
    // is now centred in whatever width it is given.
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: t.gold, fontFamily: t.mono, fontWeight: 700, marginBottom: 4 }}>Summary</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: t.text, fontFamily: t.sans, lineHeight: 1.2 }}>
            Weekly summary · {activeBrand === "all" ? "All brands" : brandName(activeBrand, brands)}
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, fontFamily: t.serif, marginTop: 3 }}>
            Read-only view. Use "Copy section" buttons or copy the full summary to share with clients.
          </div>
        </div>
        <button onClick={() => copyText(fullText)} style={{ ...gG(t), fontSize: 12, padding: "7px 14px", flexShrink: 0 }}>
          Copy full summary
        </button>
      </div>

      {/* Date range — scopes the "What we learned" section below to a specific
          window, defaulting to the current calendar month. */}
      <div style={{ ...gCd(t, dk), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ ...gSL(t), marginBottom: 0 }}>Learnings date range</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 2, background: t.surfaceAlt, padding: 3, borderRadius: 9, border: "1px solid " + t.border }}>
            {[["thisMonth", "This month"], ["lastMonth", "Last month"], ["custom", "Custom"]].map(([v, l]) => (
              <button key={v} onClick={() => setDRange(v)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: t.sans, fontWeight: dRange === v ? 600 : 500, background: dRange === v ? t.gold : "transparent", border: "none", color: dRange === v ? t.goldText : t.textSub }}>{l}</button>
            ))}
          </div>
          {dRange === "custom" && <>
            <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} style={{ fontSize: 12, padding: "6px 9px", borderRadius: 9, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontFamily: t.mono }} />
            <span style={{ color: t.textMuted, fontSize: 12 }}>to</span>
            <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} style={{ fontSize: 12, padding: "6px 9px", borderRadius: 9, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontFamily: t.mono }} />
          </>}
        </div>
      </div>

      <ScorecardSection
        t={t} dk={dk} dash={dash}
        weeklyMetrics={weeklyMetrics}
        brands={brands}
        activeBrand={activeBrand}
        settings={settings}
        onCopy={() => copyText(scorecardText)}
      />

      <LearnedSection
        t={t} dk={dk}
        learned={learned}
        isFallback={isFallback}
        rangeLabel={rangeLabel}
        onCopy={() => copyText(learnedText)}
      />

      <RunningSection
        t={t} dk={dk}
        running={running}
        cats={cats}
        onCopy={() => copyText(runningText)}
      />

      <NextSection
        t={t} dk={dk}
        next={next}
        cats={cats}
        onCopy={() => copyText(nextText)}
      />
    </div>
  );
}
