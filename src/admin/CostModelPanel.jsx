import { useState, useMemo, useEffect } from "react";
import { c, panel, label, input, button } from "./theme.js";
import { KEY_USAGE, store } from "../services/store.js";
import { sinceDays } from "../services/usage.js";
import { observedGroupRates, projectMonthlyCost, marginAgainst } from "../services/costModel.js";
import { FEATURE_GROUPS, GROUP_KEYS } from "../services/ai/registry.js";

// -- Cost model --------------------------------------------------------------
//
// ROADMAP (Phase 1.8, "Next in this slice"): "README prices one debate in
// tokens. Nothing prices a workspace. At $1,500/month the margin is fine
// until somebody runs debates daily and generates video, and knowing the
// floor is also what tells you what a discount costs."
//
// This reads the same ledger SpendPanel reads and rolls it into a monthly
// projection per feature group, editable against a hypothetical pace rather
// than only the one that happened to be logged. Same per-browser caveat as
// SpendPanel: this workspace's ledger, not every workspace's.

const WINDOWS = [
  { key: "7",  label: "7 days",  days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];

const DEFAULT_PRICE = 1500;

const usd = (n) => n == null ? "—" : "$" + (Math.abs(n) < 0.01 && n !== 0 ? n.toFixed(4) : n.toFixed(2));
const round1 = (n) => Math.round((n || 0) * 10) / 10;

export function CostModelPanel() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [windowKey, setWindowKey] = useState("30");
  const [price, setPrice] = useState(DEFAULT_PRICE);
  // Scenario calls/week per group, keyed by group. null until seeded from the
  // observed pace, so the first render shows "what actually happened" rather
  // than a guess — the operator edits from there.
  const [scenario, setScenario] = useState({});

  useEffect(() => {
    let alive = true;
    store.get(KEY_USAGE)
      .then((raw) => {
        if (!alive) return;
        try { setRows(raw && raw.value ? JSON.parse(raw.value) : []); }
        catch { setRows([]); }
        setLoaded(true);
      })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const since = useMemo(() => sinceDays(WINDOWS.find((w) => w.key === windowKey).days), [windowKey]);
  const weeks = useMemo(() => WINDOWS.find((w) => w.key === windowKey).days / 7, [windowKey]);

  const rates = useMemo(
    () => observedGroupRates(rows, GROUP_KEYS, { since, weeks }),
    [rows, since, weeks]
  );

  // Reseed the scenario to the observed pace on first load and whenever the
  // window changes, but let the operator's own edits within a window stand —
  // this mirrors the GroupCard render-phase reset pattern already used in
  // AdminApp.jsx. `seededFor` starts at null, which never equals a window
  // key, so this also covers the initial seed once the ledger has loaded.
  const [seededFor, setSeededFor] = useState(null);
  if (loaded && seededFor !== windowKey) {
    setSeededFor(windowKey);
    setScenario(Object.fromEntries(GROUP_KEYS.map((g) => [g, round1(rates[g].callsPerWeek)])));
  }

  const projection = useMemo(() => projectMonthlyCost(scenario, rates), [scenario, rates]);
  const margin = useMemo(() => marginAgainst(price, projection.totalUsd), [price, projection.totalUsd]);

  const resetToObserved = () => setScenario(Object.fromEntries(GROUP_KEYS.map((g) => [g, round1(rates[g].callsPerWeek)])));

  if (!loaded) return <div style={{ ...panel, color: c.textMuted, fontSize: 12 }}>Reading the ledger…</div>;

  return (
    <>
      <div style={{ ...panel, marginBottom: 14, fontSize: 12, color: c.textSub, lineHeight: 1.6 }}>
        Projects this workspace's monthly AI spend from its own ledger: observed calls/week × observed $/call per
        feature group, held against a monthly price. A group with no priced calls in the window has no rate and is
        excluded from the total rather than assumed free — see the note below. Edit "Scenario calls/week" to model a
        heavier pace than the one actually logged.
      </div>

      <div style={{ ...panel, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={label}>Rate window</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {WINDOWS.map((w) => (
                <button key={w.key} onClick={() => setWindowKey(w.key)}
                  style={button(windowKey === w.key ? "primary" : "quiet")}>{w.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={label}>Monthly price</div>
            <input
              style={{ ...input, width: 110, marginTop: 4 }} type="number" min="0" value={price}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
            />
          </div>
          <button style={button("quiet")} onClick={resetToObserved}>Reset scenario to observed pace</button>
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) repeat(4, minmax(70px,0.8fr))", gap: 10,
          paddingBottom: 7, borderBottom: `1px solid ${c.border}` }}>
          {["Group", "Observed/wk", "$/call", "Scenario/wk", "Projected/mo"].map((h, i) => (
            <div key={h} style={{ ...label, textAlign: i === 0 ? "left" : "right" }}>{h}</div>
          ))}
        </div>

        {GROUP_KEYS.map((key) => {
          const r = rates[key];
          const proj = projection.perGroup[key];
          const unknown = proj.avgCostPerCall == null;
          return (
            <div key={key} style={{ padding: "9px 0", borderBottom: `1px solid ${c.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) repeat(4, minmax(70px,0.8fr))", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 12.5, color: c.text, fontWeight: 600 }}>{FEATURE_GROUPS[key].label}</div>
                <div style={{ textAlign: "right", fontSize: 12, color: c.textMuted, fontFamily: c.mono }}>{round1(r.callsPerWeek)}</div>
                <div style={{ textAlign: "right", fontSize: 12, color: unknown ? c.warn : c.textMuted, fontFamily: c.mono }}>
                  {unknown ? "no data" : usd(r.avgCostPerCall)}
                </div>
                <input
                  style={{ ...input, textAlign: "right", fontSize: 12, padding: "4px 6px" }}
                  type="number" min="0" step="0.5"
                  value={scenario[key] ?? 0}
                  onChange={(e) => setScenario((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))}
                />
                <div style={{ textAlign: "right", fontSize: 12.5, color: unknown && scenario[key] > 0 ? c.warn : c.text,
                  fontWeight: 600, fontFamily: c.mono }}>
                  {unknown && scenario[key] > 0 ? "unpriced" : usd(proj.projectedUsd)}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.border}`,
          display: "flex", gap: 24, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={label}>Projected monthly cost</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.text, fontVariantNumeric: "tabular-nums" }}>{usd(projection.totalUsd)}</div>
          </div>
          <div>
            <div style={label}>Margin at {usd(price)}/mo</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: margin.usd < 0 ? c.bad : c.ok }}>
              {usd(margin.usd)} {margin.pct != null ? `(${margin.pct.toFixed(0)}%)` : ""}
            </div>
          </div>
        </div>

        {projection.unknownGroups.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: c.warn, lineHeight: 1.6 }}>
            {projection.unknownGroups.map((g) => FEATURE_GROUPS[g].label).join(", ")} {projection.unknownGroups.length === 1 ? "has" : "have"} a
            scenario pace above zero but no priced calls in this window, so {projection.unknownGroups.length === 1 ? "it isn't" : "they aren't"} counted
            in the total above — the real projection is higher. Widen the window or run the group at least once to get a rate.
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: c.textMuted, lineHeight: 1.6 }}>
          Rates are this browser's own ledger, same scope and same caveats as the Spend tab: per-workspace estimates
          against published list rates, not an invoice. "Observed/wk" and "$/call" reset to what actually happened
          when the window changes; "Scenario/wk" is yours to edit and persists only for this session.
        </div>
      </div>
    </>
  );
}
