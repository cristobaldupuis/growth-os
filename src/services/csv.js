import { brandName, generateInitId, INIT_TYPES, STATUSES, withRunningSnapshot } from "../constants.js";
import { ATTRIBUTION_CONFIG } from "../activeConfig.js";

export const CSV_COLS = [
  "initId","title","initType","category","status","brandId","owner",
  "hypothesis","primaryMetric","killCriteria","startDate","endDate",
  "measurementMetric","measurementScope","trackingTag",
  "sampleSize","duration","ice_impact","ice_certainty","ice_ease",
  "revenueImpact","spendCost","resourceCost","notes",
  "results_actualOutcome","results_keyLearning","results_outcomeClassification",
  "results_decisionMade","results_outcomeCertainty","results_actualRevenueImpact",
  "results_actualSpendCost","results_actualResourceCost",
  // Prediction ledger — the frozen launch commitment. Carried through CSV so a
  // round-trip (export -> edit -> re-import) never drops the calibration record.
  "snapshot_ice_impact","snapshot_ice_certainty","snapshot_ice_ease",
  "snapshot_revenueImpact","snapshot_date",
];

export const itemToCSVRow = (item, brands) => ({
  initId:           item.initId || "",
  title:            item.title || "",
  initType:         item.initType || "",
  category:         item.category || "",
  status:           item.status || "",
  brandId:          brandName(item.brandId || "default", brands),
  owner:            item.owner || "",
  hypothesis:       item.hypothesis || "",
  primaryMetric:    item.primaryMetric || "",
  killCriteria:     item.killCriteria || "",
  startDate:        item.startDate || "",
  endDate:          item.endDate || "",
  measurementMetric: item.measurementMetric || "",
  measurementScope:  item.measurementScope || "",
  trackingTag:       item.trackingTag || "",
  sampleSize:       item.sampleSize || "",
  duration:         item.duration || "",
  ice_impact:       item.ice?.impact ?? "",
  ice_certainty:    item.ice?.certainty ?? "",
  ice_ease:         item.ice?.ease ?? "",
  revenueImpact:    item.revenueImpact ?? "",
  spendCost:        item.spendCost ?? "",
  resourceCost:     item.resourceCost ?? "",
  notes:            item.notes || "",
  results_actualOutcome:          item.results?.actualOutcome || "",
  results_keyLearning:            item.results?.keyLearning || "",
  results_outcomeClassification:  item.results?.outcomeClassification || "",
  results_decisionMade:           item.results?.decisionMade || "",
  results_outcomeCertainty:       item.results?.outcomeCertainty ?? "",
  results_actualRevenueImpact:    item.results?.actualRevenueImpact ?? "",
  results_actualSpendCost:        item.results?.actualSpendCost ?? "",
  results_actualResourceCost:     item.results?.actualResourceCost ?? "",
  snapshot_ice_impact:       item.predictionSnapshot?.ice?.impact ?? "",
  snapshot_ice_certainty:    item.predictionSnapshot?.ice?.certainty ?? "",
  snapshot_ice_ease:         item.predictionSnapshot?.ice?.ease ?? "",
  snapshot_revenueImpact:    item.predictionSnapshot?.revenueImpact ?? "",
  snapshot_date:             item.predictionSnapshot?.snapshotDate || "",
});

export const escapeCSV = (v) => {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const downloadCSV = (rows, filename) => {
  const header = CSV_COLS.join(",");
  const body = rows.map(r => CSV_COLS.map(c => escapeCSV(r[c])).join(",")).join("\n");
  const csv = header + "\n" + body;
  const encoded = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  const a = document.createElement("a"); a.href = encoded; a.download = filename; a.click();
};

export const normaliseDate = (raw) => {
  if (!raw) return "";
  const s = raw.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D/YYYY or MM/DD/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return slash[3] + "-" + slash[1].padStart(2,"0") + "-" + slash[2].padStart(2,"0");
  // D-M-YYYY
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return dash[3] + "-" + dash[2].padStart(2,"0") + "-" + dash[1].padStart(2,"0");
  return "";  // unparseable — drop it and flag
};

export const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const splitLine = (line) => {
    const result = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    result.push(cur.trim()); return result;
  };
  const headers = splitLine(lines[0]).map(h => h.replace(/\s*\*\s*$/, "").trim());
  const rows = lines.slice(1).map(l => {
    const vals = splitLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return obj;
  }).filter(r => r.title || r.initId);
  return { headers, rows };
};

// -- Ingestion contract --------------------------------------------------------
// THE SEAM between data sources and the app's internal initiative shape.
//
// Every data producer — CSV import today, a Shopify/GA4 API adapter tomorrow —
// converts its raw input into a NEUTRAL RECORD (`rec`) using the field names
// below, then calls normalizeInitiativeRecord() to get a valid initiative.
// This means adding an API integration later is a thin adapter (raw feed -> rec),
// NOT a rewrite of the merge/validation/snapshot logic, which lives here once.
//
// THE CONTRACT — field names a producer must emit on `rec` (all optional except
// when noted; missing fields fall back to an existing record or sensible default):
//   Identity:    initId, title, initType, category, status, brandId (brand NAME), owner
//   Spec:        hypothesis, primaryMetric, killCriteria, startDate, endDate,
//                sampleSize, duration, notes
//   Attribution: measurementMetric, measurementScope, trackingTag
//   ICE:         ice_impact, ice_certainty, ice_ease   (1-10)
//   Economics:   revenueImpact, spendCost, resourceCost
//   Results:     results_keyLearning (presence = closed with results),
//                results_actualOutcome, results_outcomeClassification,
//                results_decisionMade, results_outcomeCertainty,
//                results_actualRevenueImpact, results_actualSpendCost,
//                results_actualResourceCost
//   Ledger:      snapshot_ice_impact, snapshot_ice_certainty, snapshot_ice_ease,
//                snapshot_revenueImpact, snapshot_date
//
// ctx = { items, brands, cats, idPrefix, idx, sd, ed }
//   sd/ed are pre-normalised dates (producers own date parsing for their format);
//   idPrefix tags the generated id by source (e.g. "csv", "shopify").
export function normalizeInitiativeRecord(rec, ctx, attributionConfig = ATTRIBUTION_CONFIG) {
  const { items, brands, cats, idPrefix = "imp", idx = 0, sd = "", ed = "" } = ctx;
  const r = { ...(rec || {}) };
  const clamp = (v, lo, hi) => { const n = parseInt(v); return isNaN(n) ? lo : Math.min(hi, Math.max(lo, n)); };
  const numOrNull = (v) => (v !== "" && v !== undefined && v !== null) ? (parseInt(v) || 0) : null;

  // Attribution enrichment: mutate the record copy before normalisation reads it.
  // idMappings first (direct field-to-ID); patterns as fallback (regex extraction).
  if (attributionConfig) {
    for (const mapping of (attributionConfig.idMappings || [])) {
      if (r[mapping.sourceField]) r[mapping.initiativeIdField] = r[mapping.sourceField];
    }
    for (const pattern of (attributionConfig.patterns || [])) {
      if (!r[pattern.sourceField]) continue;
      try {
        const re = new RegExp(pattern.regex);
        const match = re.exec(r[pattern.sourceField]);
        if (match && match[pattern.captureGroup] !== undefined) r[pattern.target] = match[pattern.captureGroup];
      } catch (e) {
        console.warn(`[attribution] skipping malformed pattern "${pattern.name}": ${e.message}`);
      }
    }
  }

  const existingById = r.initId ? items.find(e => e.initId === r.initId.trim()) : null;
  const isUpdate = !!existingById;
  const matchedBrand = brands.find(b => b.name.trim().toLowerCase() === (r.brandId||"").trim().toLowerCase());
  const resolvedBrandId = matchedBrand ? matchedBrand.id : (existingById?.brandId || "default");

  const hasSnapshotCols = (
    r.snapshot_date ||
    (r.snapshot_revenueImpact !== "" && r.snapshot_revenueImpact !== undefined) ||
    (r.snapshot_ice_impact !== "" && r.snapshot_ice_impact !== undefined) ||
    (r.snapshot_ice_certainty !== "" && r.snapshot_ice_certainty !== undefined) ||
    (r.snapshot_ice_ease !== "" && r.snapshot_ice_ease !== undefined)
  );

  const item = {
    id:     existingById ? existingById.id     : idPrefix + "-" + Date.now() + "-" + idx,
    initId: existingById ? existingById.initId : (r.initId?.trim() || generateInitId(resolvedBrandId, brands, items)),
    title:  r.title || existingById?.title || "",
    initType: INIT_TYPES.includes(r.initType) ? r.initType : (existingById?.initType || "A/B Test"),
    category: r.category || existingById?.category || cats[0] || "",
    status:   STATUSES.includes(r.status)   ? r.status   : (existingById?.status   || "Draft"),
    brandId:  resolvedBrandId,
    owner:    r.owner    !== undefined ? r.owner    : (existingById?.owner    || ""),
    hypothesis:    r.hypothesis    || existingById?.hypothesis    || "",
    primaryMetric: r.primaryMetric || existingById?.primaryMetric || "",
    killCriteria:  r.killCriteria  || existingById?.killCriteria  || "",
    measurementMetric: r.measurementMetric || existingById?.measurementMetric || "",
    measurementScope:  r.measurementScope  || existingById?.measurementScope  || "",
    trackingTag:       r.trackingTag       || existingById?.trackingTag       || "",
    startDate: sd || existingById?.startDate || "",
    endDate:   ed || existingById?.endDate   || "",
    sampleSize: r.sampleSize || existingById?.sampleSize || "",
    duration:   r.duration   || existingById?.duration   || "",
    ice: {
      impact:    clamp(r.ice_impact,    1, 10) || existingById?.ice?.impact    || 5,
      certainty: clamp(r.ice_certainty, 1, 10) || existingById?.ice?.certainty || 5,
      ease:      clamp(r.ice_ease,      1, 10) || existingById?.ice?.ease      || 5,
    },
    revenueImpact: r.revenueImpact !== "" && r.revenueImpact !== undefined ? (parseInt(r.revenueImpact) || 0) : (existingById?.revenueImpact || 0),
    spendCost:     r.spendCost     !== "" && r.spendCost     !== undefined ? (parseInt(r.spendCost)     || 0) : (existingById?.spendCost     || 0),
    resourceCost:  r.resourceCost  !== "" && r.resourceCost  !== undefined ? (parseInt(r.resourceCost)  || 0) : (existingById?.resourceCost  || 0),
    notes: r.notes || existingById?.notes || "",
    linkedIds: existingById?.linkedIds || [],
    createdAt: existingById?.createdAt || new Date().toISOString().slice(0, 10),
    testValidity: existingById?.testValidity || null,
    results: r.results_keyLearning ? {
      actualOutcome: r.results_actualOutcome || "",
      keyLearning:   r.results_keyLearning,
      outcomeClassification: ["Jackpot","Success","Failed","Inconclusive"].includes(r.results_outcomeClassification)
        ? r.results_outcomeClassification : "Inconclusive",
      decisionMade: r.results_decisionMade || "",
      outcomeCertainty: parseInt(r.results_outcomeCertainty) || 75,
      actualRevenueImpact: numOrNull(r.results_actualRevenueImpact),
      actualSpendCost:     numOrNull(r.results_actualSpendCost),
      actualResourceCost:  numOrNull(r.results_actualResourceCost),
    } : (existingById?.results || null),
    _isUpdate: isUpdate,
    _source: idPrefix,
    // Restore frozen snapshot from explicit cols, else carry existing, else none.
    predictionSnapshot: hasSnapshotCols ? {
      ice: {
        impact:    clamp(r.snapshot_ice_impact,    1, 10) || existingById?.predictionSnapshot?.ice?.impact    || 5,
        certainty: clamp(r.snapshot_ice_certainty, 1, 10) || existingById?.predictionSnapshot?.ice?.certainty || 5,
        ease:      clamp(r.snapshot_ice_ease,      1, 10) || existingById?.predictionSnapshot?.ice?.ease      || 5,
      },
      revenueImpact: r.snapshot_revenueImpact !== "" && r.snapshot_revenueImpact !== undefined ? (parseInt(r.snapshot_revenueImpact) || 0)
                      : (existingById?.predictionSnapshot?.revenueImpact || 0),
      snapshotDate: r.snapshot_date || existingById?.predictionSnapshot?.snapshotDate || new Date().toISOString().slice(0,10),
    } : (existingById?.predictionSnapshot || undefined),
  };
  // If this record lands as Running and still has no snapshot, freeze one now.
  return withRunningSnapshot(item, item.status);
}
