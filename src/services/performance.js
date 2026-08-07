// -- Campaign-level performance ingestion --------------------------------------
//
// The nomenclature engine has been write-only since it shipped: `naming.js`
// assembles names, the Creative Studio hands them to the operator, and nothing
// ever read one back. This module closes that loop. It takes a campaign-level
// export from an ad platform, parses each entity name through the same schema
// that built it, and joins the resulting facts to initiatives on `trackingTag`.
//
// ## Why this is a second shape rather than a wider weekly-metrics parser
//
// The weekly contract is `{date, brand, source, metrics:{}}` — one row per week
// per brand per source. A campaign export is one row per entity per day, and its
// dimensions are not columns at all: they are positions inside a string. Forcing
// it into the weekly shape would either lose the name (and with it every
// dimension) or turn `brand` into a name field it isn't. So the importer detects
// which of the two shapes a file is and routes it, and the two stores stay
// separate. `detectCsvShape` is the whole of that seam.
//
// This is a deliberately provisional home for the data. DECISIONS.md records
// that the real campaign fact model needs Postgres, and that is still true: the
// row cap below exists because localStorage caps around 5MB and a full month of
// ad-level Meta data does not fit. What ships here is the read path — parse,
// attribute, pivot — proven against real exports, so the migration later moves
// storage without re-deriving any of the logic.
//
// ## What this module refuses to do
//
// Guess. A row whose name does not parse against the selected (channel, level)
// is kept and counted as unparsed rather than dropped or force-aligned, for the
// reason `parseName` gives: a wrong-but-plausible parse enters the analysis
// silently, while an unparsed row is visible in every total that reports it.

import {
  parseName, identifyName, matchNamesToInitiatives, normKey,
  listChannels, listLevels,
} from "./naming.js";

/** Rows held in localStorage. Above this the browser store is the wrong home. */
export const PERF_ROW_LIMIT = 5000;

// -- Header vocabulary ---------------------------------------------------------
//
// Normalised so that "Amount spent (USD)", "amount_spent" and "Amount Spent"
// are the same header. Parenthesised qualifiers are dropped wholesale because
// every platform uses them for units and currency, which are noise here:
// "CPM (cost per 1,000 impressions)" and "CPM" mean the same column.

export const normHeader = (h) => String(h == null ? "" : h)
  .trim().replace(/^"|"$/g, "")
  .toLowerCase()
  .replace(/\([^)]*\)/g, " ")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

/**
 * Entity-name columns, mapped to the schema level they name.
 *
 * The level comes from the header rather than from the string, which is what
 * lets parsing be deterministic: `parseName` is told which template to use
 * instead of having to work it out. A Meta ad-level export carries all three
 * columns, and the finest-grained one present is the row's identity — the ad
 * name is the one that carries the initiative slot.
 */
export const NAME_COLUMNS = {
  ad_name: "ad", ad: "ad", ads: "ad", name: "ad", creative_name: "ad",
  ad_set_name: "adset", adset_name: "adset", ad_set: "adset", adset: "adset",
  ad_group_name: "adgroup", adgroup_name: "adgroup", ad_group: "adgroup", adgroup: "adgroup",
  campaign_name: "campaign", campaign: "campaign",
  flow_name: "flow", flow: "flow",
  message_name: "message", message: "message",
};

/** Finest grain first — the row's identity is the most specific name it has. */
const LEVEL_PRECEDENCE = ["ad", "message", "adset", "adgroup", "campaign", "flow"];

export const DATE_COLUMNS = new Set([
  "date", "day", "reporting_starts", "week", "week_start", "month", "period", "report_date",
]);

/**
 * Metric columns, mapped to canonical keys.
 *
 * Deliberately the same canonical names the weekly contract uses (`spend`,
 * `revenue`, `conversions`) so a figure means the same thing in both stores and
 * a later fact table does not have to reconcile two vocabularies.
 */
export const PERF_METRIC_ALIASES = {
  spend: "spend", cost: "spend", amount_spent: "spend", total_spend: "spend", ad_spend: "spend",
  impressions: "impressions", impr: "impressions", impressions_served: "impressions",
  reach: "reach", frequency: "frequency",
  clicks: "clicks", link_clicks: "clicks", clicks_all: "clicks",
  conversions: "conversions", purchases: "conversions", results: "conversions",
  transactions: "conversions", total_conversions: "conversions", website_purchases: "conversions",
  revenue: "revenue", conv_value: "revenue", conversion_value: "revenue",
  purchases_conversion_value: "revenue", website_purchases_conversion_value: "revenue",
  total_conversion_value: "revenue", purchase_conversion_value: "revenue",
  cpm: "cpm", ctr: "ctr", cpc: "cpc", avg_cpc: "cpc", cost_per_click: "cpc",
  cpa: "cpa", cost_per_purchase: "cpa", cost_per_result: "cpa", cost_per_conversion: "cpa",
  roas: "roas", purchase_roas: "roas", return_on_ad_spend: "roas",
};

/**
 * Metrics that sum, and metrics that do not.
 *
 * ROAS, CPM, CTR, CPC and CPA are ratios. Adding a column of them produces a
 * number with no meaning, and averaging them unweighted produces one that looks
 * meaningful and is wrong — an ad set that spent $12 gets the same vote as one
 * that spent $12,000. So only the additive metrics are carried into a rollup,
 * and every ratio is recomputed from the summed numerator and denominator.
 */
export const ADDITIVE_METRICS = ["spend", "impressions", "clicks", "conversions", "revenue", "reach"];

/** Ratios derived from a summed bucket. Null whenever the denominator is zero. */
export function deriveRatios(m) {
  const d = (num, den, scale = 1) => (den > 0 ? (num / den) * scale : null);
  return {
    roas: d(m.revenue || 0, m.spend || 0),
    cpa:  d(m.spend || 0, m.conversions || 0),
    cpc:  d(m.spend || 0, m.clicks || 0),
    cpm:  d(m.spend || 0, m.impressions || 0, 1000),
    ctr:  d(m.clicks || 0, m.impressions || 0, 100),
    cvr:  d(m.conversions || 0, m.clicks || 0, 100),
  };
}

// -- CSV reading ---------------------------------------------------------------
//
// Quote-aware, unlike the weekly parser's plain `split(",")`. Every real Meta
// export quotes at least one field — campaign names contain commas constantly —
// and a naive split shifts every column after the first one that does, which is
// the same class of silent mis-attribution the naming convention exists to
// prevent.

export function splitCSVLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out.map(v => v.replace(/^"|"$/g, "").trim());
}

/** Strip currency symbols, thousands separators and percent signs. */
export const toNumber = (raw) => {
  if (raw == null || raw === "") return null;
  const cleaned = String(raw).replace(/[$£€,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};

/**
 * ISO-normalise a date cell, or "" when there isn't one.
 *
 * An export with no date column is a lifetime rollup, which is a legitimate
 * thing to import — it just cannot be trended. That case returns "" rather than
 * inventing today's date, because a fabricated date would silently join a
 * lifetime total onto whatever week it landed in.
 */
export const toISODate = (raw) => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  const d = new Date(s + (/\d{2}:\d{2}/.test(s) ? "" : "T12:00:00"));
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
};

// -- Shape detection -----------------------------------------------------------

/**
 * Which of the two importable shapes a file is.
 *
 * The test is the presence of an entity-name column, not the absence of `brand`
 * — a Meta export often carries an account column that alias-maps to `brand`,
 * so "has no brand" would misclassify it. Having a name to parse is the thing
 * that makes a file campaign-level, and it is also exactly the thing that makes
 * this module able to do anything with it.
 */
export function detectCsvShape(headers) {
  const norm = (headers || []).map(normHeader);
  const nameCols = norm.filter(h => NAME_COLUMNS[h]);
  if (nameCols.length === 0) return { shape: "weekly", levels: [], reason: "No entity-name column found." };
  const levels = [...new Set(nameCols.map(h => NAME_COLUMNS[h]))];
  return {
    shape: "performance",
    levels,
    reason: `Entity name column${nameCols.length > 1 ? "s" : ""} present: ${nameCols.join(", ")}.`,
  };
}

// -- Parsing -------------------------------------------------------------------

/**
 * Parse a campaign-level export into performance rows.
 *
 * `ctx.channel` is the schema channel the operator says the file came from.
 * Passing it makes parsing deterministic — `parseName` against a known template
 * rather than `identifyName` guessing between templates that happen to share a
 * slot count. `channel: "auto"` falls back to identification and reports rows it
 * cannot resolve unambiguously, which is the honest answer rather than picking
 * the first candidate.
 *
 * Every row is returned, parsed or not. `parsed:false` rows carry `parseErrors`
 * and are counted in `stats.unparsed`; nothing is silently discarded, because a
 * total that quietly excludes a third of spend is worse than one that admits it.
 */
export function parsePerformanceCSV(text, schema, ctx = {}) {
  const channel = ctx.channel || "auto";
  const lines = String(text || "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["File appears empty or has no data rows."], stats: emptyStats() };

  const rawHeaders = splitCSVLine(lines[0]);
  const headers = rawHeaders.map(normHeader);
  const detected = detectCsvShape(rawHeaders);
  if (detected.shape !== "performance") {
    return { rows: [], errors: ["No ad, ad set, ad group or campaign name column found — this does not look like a campaign-level export."], stats: emptyStats() };
  }

  // Column index by role. The identity column is the finest level present.
  const nameCols = {};
  headers.forEach((h, i) => { const lvl = NAME_COLUMNS[h]; if (lvl && nameCols[lvl] === undefined) nameCols[lvl] = i; });
  const identityLevel = LEVEL_PRECEDENCE.find(l => nameCols[l] !== undefined);
  const dateIdx = headers.findIndex(h => DATE_COLUMNS.has(h));

  const metricCols = [];
  headers.forEach((h, i) => { const key = PERF_METRIC_ALIASES[h]; if (key) metricCols.push([key, i]); });

  const errors = [];
  if (metricCols.length === 0) errors.push("No recognised metric columns (spend, impressions, clicks, conversions, revenue). Rows will import with no figures attached.");

  const validLevels = new Set(
    channel === "auto"
      ? listChannels(schema).flatMap(c => c.levels.map(l => l.key))
      : listLevels(schema, channel).map(l => l.key)
  );
  if (!validLevels.has(identityLevel)) {
    errors.push(`The selected channel has no "${identityLevel}" level, so these names cannot be parsed against it. Pick the channel this export came from.`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.every(v => !v)) continue;

    const name = (vals[nameCols[identityLevel]] || "").trim();
    if (!name) { errors.push(`Row ${i + 1}: no ${identityLevel} name, skipped.`); continue; }

    const metrics = {};
    metricCols.forEach(([key, idx]) => {
      const n = toNumber(vals[idx]);
      // First column wins for a repeated canonical key: Meta exports both
      // "Purchases" and "Results", and the more specific header sorts first in
      // the file often enough that overwriting would silently prefer the vaguer.
      if (n != null && metrics[key] === undefined) metrics[key] = n;
    });

    const row = {
      name,
      level: identityLevel,
      channel: channel === "auto" ? null : channel,
      date: dateIdx >= 0 ? toISODate(vals[dateIdx]) : "",
      campaignName: nameCols.campaign !== undefined ? (vals[nameCols.campaign] || "") : "",
      adsetName: nameCols.adset !== undefined ? (vals[nameCols.adset] || "")
               : nameCols.adgroup !== undefined ? (vals[nameCols.adgroup] || "") : "",
      metrics,
    };
    rows.push(annotateRow(row, schema));
  }

  return { rows, errors, stats: statsFor(rows), detected, identityLevel };
}

/**
 * Attach parse results to one row: its dimension values, or why it has none.
 *
 * Split out from the CSV loop so API-sourced rows later take the identical path
 * — the same discipline the weekly contract uses, where the normalisation is the
 * asset and the producers are interchangeable.
 */
export function annotateRow(row, schema) {
  if (row.channel) {
    const res = parseName(row.name, schema, { channel: row.channel, level: row.level });
    return res.ok
      ? { ...row, parsed: true, values: res.values, parseErrors: [] }
      : { ...row, parsed: false, values: {}, parseErrors: res.errors };
  }
  const { candidates, ambiguous, resolved } = identifyName(row.name, schema);
  if (resolved) return { ...row, parsed: true, channel: resolved.channel, level: resolved.level, values: resolved.values, parseErrors: [] };
  return {
    ...row, parsed: false, values: {},
    parseErrors: [ambiguous
      ? `Matches ${candidates.length} templates (${candidates.map(c => c.channel + "/" + c.level).join(", ")}) — pick the channel this export came from rather than detecting it.`
      : "Does not match any template in the naming schema."],
  };
}

const emptyStats = () => ({ total: 0, parsed: 0, unparsed: 0, spend: 0, conversions: 0, unparsedSpend: 0 });

export function statsFor(rows) {
  return (rows || []).reduce((acc, r) => {
    acc.total += 1;
    if (r.parsed) acc.parsed += 1; else { acc.unparsed += 1; acc.unparsedSpend += r.metrics?.spend || 0; }
    acc.spend += r.metrics?.spend || 0;
    acc.conversions += r.metrics?.conversions || 0;
    return acc;
  }, emptyStats());
}

// -- Merging and storage -------------------------------------------------------

/**
 * Identity of a fact row. Re-importing the same export must replace rather than
 * double-count, and a platform can only report one figure per entity per day.
 */
export const perfRowKey = (r) => [r.date || "-", r.channel || "-", r.level, normKey(r.name)].join("|");

/**
 * Merge incoming rows over existing ones, newest first, capped.
 *
 * The cap drops the OLDEST rows and reports how many, rather than refusing the
 * import or truncating quietly. A browser store is the wrong home for a year of
 * ad-level facts and the honest response is to say which data was let go, not
 * to pretend the ceiling isn't there — see DECISIONS.md on why the durable fix
 * is a Postgres fact table rather than a bigger JSON blob.
 */
export function mergePerformanceRows(existing, incoming, limit = PERF_ROW_LIMIT) {
  const byKey = new Map();
  (existing || []).forEach(r => byKey.set(perfRowKey(r), r));
  (incoming || []).forEach(r => byKey.set(perfRowKey(r), r));
  const all = Array.from(byKey.values()).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const kept = all.slice(0, limit);
  return { rows: kept, dropped: all.length - kept.length, replaced: (existing || []).length + (incoming || []).length - all.length };
}

// -- The initiative bridge -----------------------------------------------------

/**
 * Resolve performance rows onto initiatives through the naming convention.
 *
 * Delegates the actual tag→initiative decision to `matchNamesToInitiatives`, on
 * the unique name set rather than per row: a month of daily data repeats the
 * same thirty names thousands of times, and the join is a property of the name,
 * not of the day. The three-way split it returns is preserved exactly —
 * `untagged` is business-as-usual spend and `unmatched` is a broken link — and
 * carried through to the rollup so both stay countable.
 */
export function attachInitiatives(rows, items, schema) {
  const byChannelLevel = new Map();
  (rows || []).forEach(r => {
    if (!r.parsed) return;
    const k = r.channel + "|" + r.level;
    if (!byChannelLevel.has(k)) byChannelLevel.set(k, { ctx: { channel: r.channel, level: r.level }, names: new Set() });
    byChannelLevel.get(k).names.add(r.name);
  });

  // name -> {status, trackingTag, initiative}
  const index = new Map();
  byChannelLevel.forEach(({ ctx, names }) => {
    const { matched, unmatched, untagged } = matchNamesToInitiatives([...names], items, schema, ctx);
    matched.forEach(m => index.set(m.name, { status: "matched", trackingTag: m.trackingTag, initiative: m.initiative }));
    unmatched.forEach(u => index.set(u.name, { status: "unmatched", trackingTag: u.trackingTag, initiative: null }));
    untagged.forEach(n => index.set(n, { status: "untagged", trackingTag: null, initiative: null }));
  });

  const attached = (rows || []).map(r => {
    const hit = r.parsed ? index.get(r.name) : null;
    return { ...r, attribution: hit ? hit.status : "unparsed", trackingTag: hit?.trackingTag || null, initiativeId: hit?.initiative?.id || null };
  });

  const counts = attached.reduce((a, r) => { a[r.attribution] = (a[r.attribution] || 0) + 1; return a; }, {});
  const spend = attached.reduce((a, r) => { a[r.attribution] = (a[r.attribution] || 0) + (r.metrics?.spend || 0); return a; }, {});
  return { rows: attached, counts, spend };
}

/**
 * Sum every additive metric per initiative, plus recomputed ratios.
 *
 * This is what turns the Test Validity panel's hand-entered counts into measured
 * ones: an initiative's real spend and conversions are whatever its ad names
 * carried, and nobody had to type them.
 */
export function rollupByInitiative(rows, items, schema) {
  const { rows: attached, counts, spend } = attachInitiatives(rows, items, schema);
  const groups = new Map();

  attached.forEach(r => {
    if (r.attribution !== "matched" || !r.initiativeId) return;
    const g = groups.get(r.initiativeId) || {
      initiativeId: r.initiativeId,
      initiative: (items || []).find(i => i.id === r.initiativeId) || null,
      trackingTag: r.trackingTag, rows: 0, names: new Set(), metrics: {},
      firstDate: null, lastDate: null,
    };
    g.rows += 1;
    g.names.add(r.name);
    ADDITIVE_METRICS.forEach(k => { const v = r.metrics?.[k]; if (typeof v === "number") g.metrics[k] = (g.metrics[k] || 0) + v; });
    if (r.date) {
      if (!g.firstDate || r.date < g.firstDate) g.firstDate = r.date;
      if (!g.lastDate  || r.date > g.lastDate)  g.lastDate  = r.date;
    }
    groups.set(r.initiativeId, g);
  });

  const list = Array.from(groups.values())
    .map(g => ({ ...g, names: [...g.names], ratios: deriveRatios(g.metrics) }))
    .sort((a, b) => (b.metrics.spend || 0) - (a.metrics.spend || 0));

  return { groups: list, counts, spend, rows: attached };
}

/**
 * Every dimension that at least one row in the set actually carries.
 *
 * Drives the breakdown view's dimension picker. Offering all 24 registry
 * dimensions when the imported file only populates eleven of them would make
 * most choices render an empty pivot, which reads as a broken view rather than
 * as "that dimension is not in this template".
 */
export function availableDimensions(rows, schema) {
  const present = new Set();
  (rows || []).forEach(r => { if (r.parsed) Object.keys(r.values || {}).forEach(k => present.add(k)); });
  return (schema.dimensions || []).filter(d => present.has(d.key));
}

/**
 * The dimension to open a breakdown on: the one that actually splits this data.
 *
 * Registry order would land on `channel`, which is a single bar in any export
 * pulled from one platform — a first screen that shows nothing and teaches the
 * operator that the view is empty. Ranking by distinct value count opens on the
 * pivot with something to compare, which is the entire point of the view.
 * `initiative` is skipped as a default because the Attribution tab answers that
 * question better; it stays selectable.
 */
export function defaultDimension(rows, schema) {
  const dims = availableDimensions(rows, schema);
  if (dims.length === 0) return null;
  const distinct = (key) => {
    const seen = new Set();
    (rows || []).forEach(r => { if (r.parsed && r.values?.[key] != null) seen.add(normKey(r.values[key])); });
    return seen.size;
  };
  const ranked = dims
    .filter(d => d.key !== schema.initiativeDimension)
    .map(d => ({ d, n: distinct(d.key) }))
    .sort((a, b) => b.n - a.n);
  return (ranked[0] && ranked[0].n > 1 ? ranked[0].d : dims[0]);
}
