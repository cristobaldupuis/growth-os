import { useState, useMemo, useEffect } from "react";
import { c, panel, label, button } from "./theme.js";
import { KEY_USAGE, store } from "../services/store.js";
import { rollupUsage, sinceDays } from "../services/usage.js";
import { FEATURE_GROUPS } from "../services/ai/registry.js";

// -- Spend -----------------------------------------------------------------------
//
// The console could already say which model each feature group was pointed at,
// and nothing anywhere could say what that choice had cost. Every proxy response
// has carried its own token counts the whole time — Anthropic returns `usage`
// natively and api/_adapters.js normalises Gemini's and OpenAI's into the same
// shape — they were simply discarded. services/ai/_shared.js now records them;
// this panel reads them back.
//
// ## Why this reads localStorage rather than an endpoint
//
// The routing this console edits is server-side because it has to be shared by
// every visitor. Spend is not: it is a record of what THIS operator's browser
// spent, and this is a single-operator console on the same origin as the app.
// A server-side ledger would mean an ingest endpoint, a store, and a retention
// policy for data whose only consumer is the person who generated it — Phase
// 5.3's fact-table problem, not this panel's. What it costs is honesty about the
// scope, which the footer states plainly.
//
// ## What the figures are and are not
//
// Estimates against published list rates, priced at the point of use and frozen
// onto each row. Not an invoice: no promotional pricing (Sonnet 5's $2/$10 runs
// through 2026-08-31 against a $3/$15 list), no prompt-cache discount, no
// negotiated rate, no free Vertex grant. Unpriced calls are counted separately
// rather than treated as free, because a rollup that silently reads an unknown
// rate as zero is wrong in the direction that flatters the operator.

const WINDOWS = [
  { key: "7",   label: "7 days",  days: 7 },
  { key: "30",  label: "30 days", days: 30 },
  { key: "90",  label: "90 days", days: 90 },
  { key: "all", label: "All",     days: null },
];

const AXES = [
  { key: "group",    label: "Feature group" },
  { key: "model",    label: "Model" },
  { key: "provider", label: "Provider" },
  { key: "fn",       label: "Call site" },
];

const usd = (n) => "$" + (n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2));
const num = (n) => (n || 0).toLocaleString();

/** Group keys render as their human label; everything else renders as-is. */
const displayKey = (axis, key) =>
  axis === "group" ? (FEATURE_GROUPS[key]?.label || key) : key;

function Bar({ pct }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: c.border, marginTop: 5, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: c.accent }} />
    </div>
  );
}

export function SpendPanel() {
  const [rows, setRows] = useState([]);
  const [windowKey, setWindowKey] = useState("30");
  const [axis, setAxis] = useState("group");
  const [loaded, setLoaded] = useState(false);

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

  const since = useMemo(() => {
    const w = WINDOWS.find((x) => x.key === windowKey);
    return w?.days ? sinceDays(w.days) : null;
  }, [windowKey]);

  const roll = useMemo(() => rollupUsage(rows, axis, { since }), [rows, axis, since]);
  const max = roll.rows.reduce((m, r) => Math.max(m, r.usd), 0);

  if (!loaded) return <div style={{ ...panel, color: c.textMuted, fontSize: 12 }}>Reading the ledger…</div>;

  if (rows.length === 0) {
    return (
      <div style={{ ...panel, fontSize: 12, color: c.textMuted, lineHeight: 1.6 }}>
        <div style={{ color: c.text, fontWeight: 600, marginBottom: 6 }}>No AI calls recorded yet</div>
        Spend is recorded per call from this browser, so the ledger fills as the app is used. If you have been using the
        app in a different browser or on another machine, that usage is in that browser's ledger rather than this one —
        see the note below.
      </div>
    );
  }

  return (
    <>
      <div style={{ ...panel, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={label}>Window</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {WINDOWS.map((w) => (
                <button key={w.key} onClick={() => setWindowKey(w.key)}
                  style={button(windowKey === w.key ? "primary" : "quiet")}>{w.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={label}>Break down by</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {AXES.map((a) => (
                <button key={a.key} onClick={() => setAxis(a.key)}
                  style={button(axis === a.key ? "primary" : "quiet")}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={label}>Estimated spend</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.text, fontVariantNumeric: "tabular-nums" }}>{usd(roll.totalUsd)}</div>
          </div>
          <div>
            <div style={label}>Calls</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.text, fontVariantNumeric: "tabular-nums" }}>{num(roll.totalCalls)}</div>
          </div>
          {roll.unpriced > 0 && (
            <div>
              <div style={label}>Unpriced</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.warn, fontVariantNumeric: "tabular-nums" }}>{num(roll.unpriced)}</div>
            </div>
          )}
          {roll.failed > 0 && (
            <div>
              <div style={label}>Failed</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.bad, fontVariantNumeric: "tabular-nums" }}>{num(roll.failed)}</div>
            </div>
          )}
          {/* The share of billable prompt input served from cache.
              Worth a tile of its own because it is the only way to tell from
              inside the product whether prompt caching is doing anything — the
              question that went unanswered long enough for six call sites to set
              `cacheSystem: true` and buy nothing. Null (no reporting provider)
              renders nothing rather than a misleading 0%. */}
          {roll.cacheHitRate !== null && (
            <div>
              <div style={label}>Prompt cache</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: roll.cacheHitRate > 0 ? c.ok : c.textMuted, fontVariantNumeric: "tabular-nums" }}>
                {Math.round(roll.cacheHitRate * 100)}%
              </div>
            </div>
          )}
        </div>

        {roll.unpriced > 0 && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: c.textMuted, lineHeight: 1.55 }}>
            {num(roll.unpriced)} call{roll.unpriced === 1 ? " has" : "s have"} no published rate in the catalogue, so
            {" "}{roll.unpriced === 1 ? "it is" : "they are"} excluded from the total rather than counted as free — the
            real figure is higher than the one above. Every unverified model id ships without a price; add one in
            <code style={{ fontFamily: c.mono }}> registry.js</code> once you have confirmed the id
            against the provider's own model list.
          </div>
        )}
      </div>

      <div style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) repeat(4, minmax(58px,0.6fr))", gap: 10,
          paddingBottom: 7, borderBottom: `1px solid ${c.border}` }}>
          {[AXES.find((a) => a.key === axis).label, "Spend", "Calls", "In", "Out"].map((h, i) => (
            <div key={h} style={{ ...label, textAlign: i === 0 ? "left" : "right" }}>{h}</div>
          ))}
        </div>

        {roll.rows.map((r) => (
          <div key={r.key} style={{ padding: "9px 0", borderBottom: `1px solid ${c.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) repeat(4, minmax(58px,0.6fr))", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontSize: 12.5, color: c.text, fontWeight: 600, wordBreak: "break-word" }}>
                {displayKey(axis, r.key)}
                {r.unpriced > 0 && (
                  <span style={{ fontSize: 10.5, color: c.textMuted, fontWeight: 400, marginLeft: 6 }}>
                    {r.unpriced} unpriced
                  </span>
                )}
                {r.failed > 0 && (
                  <span style={{ fontSize: 10.5, color: c.bad, fontWeight: 400, marginLeft: 6 }}>
                    {r.failed} failed
                  </span>
                )}
              </div>
              {[usd(r.usd), num(r.calls), num(r.inputTokens), num(r.outputTokens)].map((v, i) => (
                <div key={i} style={{ textAlign: "right", fontSize: 12, color: i === 0 ? c.text : c.textMuted,
                  fontFamily: c.mono, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              ))}
            </div>
            <Bar pct={max > 0 ? (r.usd / max) * 100 : 0} />
          </div>
        ))}

        <div style={{ paddingTop: 11, fontSize: 11, color: c.textMuted, lineHeight: 1.6 }}>
          Estimates against published list rates, frozen onto each row at the moment of the call so a later catalogue
          change does not restate history. Not an invoice: promotional pricing, prompt-cache discounts, batch tiers and
          negotiated rates are not modelled, and a Vertex-billed deployment is priced here at Developer API rates.
          Reconcile against the provider's own billing export before quoting a number to anyone.
          <br /><br />
          This ledger is per-browser. It records what this machine spent through the proxy — usage from another browser,
          another machine, or a different operator is not in it. Making spend account-wide needs a server-side store,
          which is the same Phase 5.3 problem as the performance fact table.
        </div>
      </div>
    </>
  );
}
