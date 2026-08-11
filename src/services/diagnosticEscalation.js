// -- Diagnostic escalation (ROADMAP 5.3) -----------------------------------------
//
// The naming convention captures roughly two dozen dimensions. The ad platforms
// break down on a dozen more that no name carries — realised placement against
// targeted, device, time of day, geo below the `geo` slot, and the demographic
// split that Phase 1.6's export decision deliberately leaves out (DECISIONS.md).
// When a closed initiative's actual result diverges sharply from the prediction
// frozen at launch, the missing dimension is usually one of those.
//
// This closes that gap one initiative at a time, without ingesting any of it in
// bulk: it names the single most plausible missing axis, tells the operator
// exactly what to pull ("Meta → Breakdown by Age for this campaign, this
// window"), and turns whatever they paste back into a verdict — not a table.
//
// ## The four constraints from the roadmap entry, and where each lives here
//
//   1. Fire rarely.       evaluateEscalation — gated on relative prediction
//                          error past a threshold AND a nameable candidate.
//   2. A third CSV shape.  parseBreakdownCSV — rows key on (breakdown value),
//                          not on an ad name; no shape detection needed because
//                          the operator was told which axis they pulled.
//   3. Scoped evidence.    Callers persist the result as one entry in the
//                          initiative's own `evidence` array (App.jsx), never
//                          in the performance fact rows — this is a post-mortem
//                          attachment to one initiative, not a bulk import.
//   4. A verdict, not a table. verdictFromBreakdown — one sentence, computed
//                          from concentration × underperformance, no AI call.

import { computePredictionError } from "../constants.js";
import { splitCSVLine } from "./csvLine.js";
import { normHeader, toNumber, PERF_METRIC_ALIASES } from "./performance.js";
import { listLevels, templateFor } from "./naming.js";

// Priority order: the axes a standard ad-platform breakdown export can answer
// in one pull, most commonly missing first. `age`/`gender` sort last and are
// never filtered by what the naming schema captures (see rankMissingDimensions)
// — a gender slot on an ad NAME is a targeting label, not a performance
// breakdown by the gender of who actually converted, so its presence in the
// convention says nothing about whether this axis is already visible.
export const CANDIDATE_DIMENSIONS = [
  { key:"placement",   label:"Placement",              ask:"Breakdown by Placement" },
  { key:"device",      label:"Device",                 ask:"Breakdown by Device" },
  { key:"time_of_day", label:"Time of day",            ask:"Breakdown by Time of Day" },
  { key:"geo_fine",    label:"Geography (city/region)", ask:"Breakdown by Region" },
  { key:"age",         label:"Age",                    ask:"Breakdown by Age" },
  { key:"gender",      label:"Gender",                 ask:"Breakdown by Gender" },
];

// Only these are filtered by naming-schema capture — see the comment above.
const NAMING_FILTERED = new Set(["placement","device","time_of_day","geo_fine"]);

const ERROR_THRESHOLD = 0.4;      // 40% relative miss on predicted revenue
const MIN_PREDICTED_FLOOR = 2000; // ignore tests too small for a 40% miss to mean anything

/**
 * Signed and relative prediction error for a closed initiative, or null when
 * there is no frozen prediction or no logged actual to compare it against.
 */
export function relativePredictionError(item) {
  if (!item?.results) return null;
  const err = computePredictionError(item, item.results);
  if (err.actualRevenue == null || err.predictedRevenue == null) return null;
  const base = Math.max(Math.abs(err.predictedRevenue), MIN_PREDICTED_FLOOR);
  return { ...err, relativeError: Math.abs(err.revenueDelta) / base };
}

/** Dimension keys already captured somewhere in the naming templates for the
 *  channels this initiative's claimed names actually touch. Scoped to the
 *  initiative's own channels rather than the whole schema, so the ask stays
 *  specific to what this test could plausibly be missing. */
function capturedDimensionKeys(item, schema) {
  const channels = [...new Set((item.adNames || []).map(a => a.channel).filter(Boolean))];
  const keys = new Set();
  channels.forEach(ch => {
    listLevels(schema, ch).forEach(lv => {
      templateFor(schema, ch, lv.key).forEach(d => keys.add(d.key));
    });
  });
  return keys;
}

/** Missing-dimension candidates, priority order, for one initiative. */
export function rankMissingDimensions(item, schema) {
  const captured = capturedDimensionKeys(item, schema);
  return CANDIDATE_DIMENSIONS.filter(c => !NAMING_FILTERED.has(c.key) || !captured.has(c.key));
}

/**
 * Whether this closed initiative should escalate, and to which dimension.
 * Both halves of the gate matter: an error past threshold with nothing
 * nameable to ask for is not actionable, and a nameable gap on a trivial miss
 * is noise dressed as a finding.
 */
export function evaluateEscalation(item, schema) {
  const error = relativePredictionError(item);
  if (!error || error.relativeError < ERROR_THRESHOLD) return { fires:false, error, candidates:[] };
  const candidates = rankMissingDimensions(item, schema);
  if (candidates.length === 0) return { fires:false, error, candidates:[] };
  return { fires:true, error, candidates, topCandidate:candidates[0] };
}

/** The one-line ask, scoped to a single initiative, window and axis. */
export function escalationAsk(item, candidate) {
  if (!candidate) return "";
  const claimed = (item.adNames || [])[0];
  const channel = claimed?.channel || "the ad platform";
  const entity  = claimed?.name || item.title;
  const window  = item.startDate && item.endDate ? `${item.startDate} to ${item.endDate}` : "the test window";
  return `Pull ${channel} → ${candidate.ask} for "${entity}", ${window}, and paste it below.`;
}

// -- The third CSV shape: a breakdown export ------------------------------------
//
// Rows key on (breakdown value) alone, never on an ad name — a Placement or Age
// export replaces the name axis with the breakdown axis entirely. The
// breakdown-value column's header is whatever the platform calls the axis
// ("Age", "Placement", "18-24"...), which this parser does not need to know in
// advance: the operator was already told which axis they pulled, so the first
// column that isn't a recognised metric is it.
export function parseBreakdownCSV(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["No data rows found."] };

  const rawHeaders = splitCSVLine(lines[0]);
  const headers = rawHeaders.map(normHeader);
  const metricCols = [];
  headers.forEach((h, i) => { const key = PERF_METRIC_ALIASES[h]; if (key && metricCols.every(([,idx])=>idx!==i)) metricCols.push([key, i]); });
  const metricIdx = new Set(metricCols.map(([, i]) => i));
  const valueIdx = headers.findIndex((h, i) => !metricIdx.has(i));

  const errors = [];
  if (valueIdx < 0) errors.push("No breakdown-value column found — every column looked like a metric.");
  if (metricCols.length === 0) errors.push("No recognised metric columns (spend, conversions, revenue…).");

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.every(v => !v)) continue;
    const value = valueIdx >= 0 ? (vals[valueIdx] || "").trim() : "";
    if (!value) { errors.push(`Row ${i + 1}: no breakdown value, skipped.`); continue; }
    const metrics = {};
    metricCols.forEach(([key, idx]) => { const n = toNumber(vals[idx]); if (n != null) metrics[key] = n; });
    rows.push({ value, metrics });
  }
  return { rows, errors };
}

// -- The verdict, not the table --------------------------------------------------
//
// Concentration times underperformance: a band that underperforms on 2% of
// spend cannot move the total, and a band carrying 60% of spend at the average
// rate isn't the gap either. The one that is both — enough spend to matter and
// a rate meaningfully below the mix's own average — is named directly.
const SPEND_SHARE_FLOOR = 0.15;
const UNDERPERFORM_CEILING = 0.7;

export function verdictFromBreakdown(rows, dimensionLabel) {
  const withSpend = (rows || []).filter(r => (r.metrics?.spend || 0) > 0);
  if (withSpend.length === 0) return "No spend in the pasted rows — nothing to compare.";

  const totalSpend = withSpend.reduce((s, r) => s + r.metrics.spend, 0);
  const totalRevenue = withSpend.reduce((s, r) => s + (r.metrics.revenue || 0), 0);
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const scored = withSpend.map(r => {
    const spendShare = r.metrics.spend / totalSpend;
    const roas = r.metrics.spend > 0 ? (r.metrics.revenue || 0) / r.metrics.spend : 0;
    const relRate = overallRoas > 0 ? roas / overallRoas : 1;
    return { ...r, spendShare, roas, relRate };
  });

  const worst = scored
    .filter(r => r.relRate < UNDERPERFORM_CEILING && r.spendShare >= SPEND_SHARE_FLOOR)
    .sort((a, b) => (a.relRate * a.spendShare) - (b.relRate * b.spendShare))[0];

  if (worst) {
    return `The ${worst.value} band took ${Math.round(worst.spendShare * 100)}% of spend and converted at `
      + `${Math.round(worst.relRate * 100)}% of the average rate — that is the likely gap.`;
  }
  return `Mix was even across ${dimensionLabel} — the miss is probably elsewhere.`;
}

/** Build the full evidence record a caller persists onto `item.evidence`. */
export function buildEvidenceEntry({ item, candidate, rows, pastedAt = new Date().toISOString() }) {
  return {
    id: "ev-" + Date.now(),
    dimension: candidate.key,
    dimensionLabel: candidate.label,
    ask: escalationAsk(item, candidate),
    rows,
    verdict: verdictFromBreakdown(rows, candidate.label),
    pastedAt,
  };
}
