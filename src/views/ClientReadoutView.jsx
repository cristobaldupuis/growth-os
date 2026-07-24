import { useMemo, useState } from "react";
import { brandName, iceScore, fmtCur, fmtDate, parseD } from "../constants.js";
import { gG, gGh, gCd, gSL } from "../components/styles.js";
import { OBdg, CBdg, ICEChip } from "../components/badges.jsx";

// ── Helpers ────────────────────────────────────────────────────────────────────

function normBrandId(id, brands) {
  return (!id || id === "default") ? (brands[0] && brands[0].id || "default") : id;
}

function brandFilter(item, activeBrand, brands) {
  return activeBrand === "all" || normBrandId(item.brandId, brands) === normBrandId(activeBrand, brands);
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
    lines.push("WEEKLY METRICS — " + weekLabel);
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

function buildLearnedText(learned) {
  if (learned.length === 0) return "WHAT WE LEARNED THIS PERIOD\n\nNo completed or closed initiatives with learnings in the last 30 days.";
  const lines = ["WHAT WE LEARNED THIS PERIOD", ""];
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
          <div style={{ fontSize: 11, color: t.gold, fontFamily: t.sans, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>{settings.northStarMetric}</div>
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
            <div style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.sans, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.hero ? t.gold : t.text, fontFamily: t.serif, letterSpacing: "-0.02em", lineHeight: 1 }}>{k.value}</div>
            {k.sub && k.sub !== " " && <div style={{ fontSize: 10, color: t.textMuted, fontFamily: t.sans, marginTop: 5 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Weekly metrics */}
      {latestWeek && weekKpis.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontFamily: t.sans, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Weekly metrics — {weekLabel}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {weekKpis.map(k => (
              <div key={k.label} style={{ background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 8, padding: "9px 13px", minWidth: 90 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.sans, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.gold, fontFamily: t.mono, letterSpacing: "-0.01em", lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!latestWeek && (
        <div style={{ fontSize: 12, color: t.textMuted, fontFamily: t.sans, fontStyle: "italic" }}>No weekly metrics logged yet.</div>
      )}
    </Section>
  );
}

// ── Section 2: Learned ────────────────────────────────────────────────────────

function LearnedSection({ t, dk, learned, onCopy }) {
  const outcomeColor = (o, dk) => {
    const map = {
      Jackpot:      dk ? "#60d080" : "#1a7a48",
      Success:      dk ? "#50c898" : "#1a6a50",
      Failed:       dk ? "#e07070" : "#a03030",
      Inconclusive: dk ? "#d0a838" : "#8a6010",
    };
    return map[o] || (dk ? "#a0a080" : "#666");
  };

  return (
    <Section t={t} dk={dk} title="What we learned this period" onCopy={onCopy}>
      {learned.length === 0 ? (
        <div style={{ padding: "18px 12px", textAlign: "center", border: "1px dashed " + t.border, borderRadius: 8, color: t.textMuted, fontFamily: t.sans, fontSize: 12 }}>
          No completed or closed initiatives with learnings in the last 30 days.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {learned.map(item => (
            <div key={item.id} style={{ background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 10, padding: "13px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, fontFamily: t.sans, lineHeight: 1.3, flex: 1, minWidth: 0 }}>{item.title}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <OBdg o={item.results?.outcomeClassification} dk={dk} />
                  {item.endDate && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: t.mono }}>{fmtDate(item.endDate)}</span>}
                </div>
              </div>
              {item.results?.keyLearning && (
                <div style={{ fontSize: 12.5, color: t.textSub, fontFamily: t.sans, lineHeight: 1.55 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.sans, marginRight: 6 }}>Learning</span>
                  {item.results.keyLearning}
                </div>
              )}
              {item.results?.decisionMade && (
                <div style={{ fontSize: 12, color: t.textSub, fontFamily: t.sans, lineHeight: 1.5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.sans, marginRight: 6 }}>Decision</span>
                  {item.results.decisionMade}
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
        <div style={{ padding: "18px 12px", textAlign: "center", border: "1px dashed " + t.border, borderRadius: 8, color: t.textMuted, fontFamily: t.sans, fontSize: 12 }}>
          No initiatives currently running.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {running.map(item => {
            const ice = iceScore(item.ice?.impact, item.ice?.certainty, item.ice?.ease);
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, fontFamily: t.sans, lineHeight: 1.3, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <CBdg cat={item.category} cats={cats} dk={dk} />
                    <ICEChip ice={item.ice} t={t} />
                    {item.startDate && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: t.mono }}>Started {fmtDate(item.startDate)}</span>}
                  </div>
                  {item.successMetric && (
                    <div style={{ fontSize: 11.5, color: t.textSub, fontFamily: t.sans, lineHeight: 1.5, marginTop: 5 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.sans, marginRight: 5 }}>Success metric</span>
                      {item.successMetric}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 9.5, color: t.textMuted, fontFamily: t.sans, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>Est. impact</div>
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
        <div style={{ padding: "18px 12px", textAlign: "center", border: "1px dashed " + t.border, borderRadius: 8, color: t.textMuted, fontFamily: t.sans, fontSize: 12 }}>
          No draft initiatives in pipeline.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {next.map(item => {
            const ice = iceScore(item.ice?.impact, item.ice?.certainty, item.ice?.ease);
            const hyp = item.hypothesis ? (item.hypothesis.length > 120 ? item.hypothesis.slice(0, 120) + "…" : item.hypothesis) : null;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, fontFamily: t.sans, lineHeight: 1.3, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <CBdg cat={item.category} cats={cats} dk={dk} />
                    <ICEChip ice={item.ice} t={t} />
                  </div>
                  {hyp && (
                    <div style={{ fontSize: 11.5, color: t.textSub, fontFamily: t.sans, lineHeight: 1.5, marginTop: 5 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textMuted, fontFamily: t.sans, marginRight: 5 }}>Hypothesis</span>
                      {hyp}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 9.5, color: t.textMuted, fontFamily: t.sans, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>Est. impact</div>
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

  // Section 2 — learnings in last 30 days
  const learned = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let closed = items.filter(e =>
      (e.status === "Completed" || e.status === "Killed") &&
      e.results?.keyLearning
    );
    // Try date-filtered first; fall back to all with learnings if empty
    const dated = closed.filter(e => {
      const d = parseD(e.endDate) || parseD(e.results?.endDate);
      return d && d >= cutoff;
    });
    const pool = dated.length > 0 ? dated : closed;
    return [...pool]
      .sort((a, b) => {
        const da = parseD(a.endDate) || parseD(a.results?.endDate) || new Date(0);
        const db = parseD(b.endDate) || parseD(b.results?.endDate) || new Date(0);
        return db - da;
      })
      .slice(0, 5);
  }, [items]);

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
    try { navigator.clipboard.writeText(text); } catch {}
  };

  const scorecardText = buildScorecardText(dash, latestWeek, weekLabel, brands, activeBrand, settings);
  const learnedText   = buildLearnedText(learned);
  const runningText   = buildRunningText(running);
  const nextText      = buildNextText(next);

  const fullText = [
    "GROWTH OS CLIENT READOUT",
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
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: t.gold, fontFamily: t.sans, fontWeight: 700, marginBottom: 4 }}>Client Readout</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: t.text, fontFamily: t.sans, lineHeight: 1.2 }}>
            Weekly summary — {activeBrand === "all" ? "All brands" : brandName(activeBrand, brands)}
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, fontFamily: t.sans, marginTop: 3 }}>
            Read-only view. Use "Copy section" buttons or copy the full readout to share with clients.
          </div>
        </div>
        <button onClick={() => copyText(fullText)} style={{ ...gG(t), fontSize: 12, padding: "7px 14px", flexShrink: 0 }}>
          Copy full readout
        </button>
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
