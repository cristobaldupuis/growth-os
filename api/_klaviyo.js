// api/_klaviyo.js — Klaviyo flow performance, as performance rows.
//
// Underscore-prefixed so Vercel does not route it; api/connectors.js calls it.
//
// ## What it reads, and why only that
//
// The Reporting API's flow series report: one request returns every flow
// message's daily delivered / clicks / conversions / conversion value over up
// to 60 days (Klaviyo's own ceiling for a daily series). Each (message, day)
// becomes one row at the naming schema's `message` level on the `klaviyo`
// channel, with the flow name carried as `campaignName` — the same place a Meta
// export puts the campaign above an ad, so attribution by flow name works the
// way it does for a campaign.
//
// Campaign sends are NOT read yet. Klaviyo offers them only as a values report
// (one total per campaign over the whole window), not a daily series, and a
// row without a real date would sit in every date filter at once. That is a
// deliberate gap, not an oversight: see the README's connector notes.
//
// ## Source of truth for the request shape
//
// Klaviyo's official Node SDK (klaviyo-api 23.0.0, API revision 2026-07-15):
// FlowSeriesRequestDTOResourceObjectAttributes for the body, PostFlowSeries-
// ResponseDTO for the response, metricsApi for the metric lookup. Written
// against those models rather than from memory; the fixtures in
// api/klaviyo.test.js follow the same shapes.

export const KLAVIYO_API = "https://a.klaviyo.com/api";
export const KLAVIYO_REVISION = "2026-07-15";
export const MAX_DAYS = 60;          // Klaviyo: a daily series may not span more
const CONVERSION_METRIC = "Placed Order";
const METRIC_PAGES = 10;             // 200 per page; an account has far fewer

// Klaviyo statistic → the app's canonical metric. Email has no media spend, so
// `spend` is deliberately absent rather than zero: a zero would pull every
// blended ROAS toward infinity. `delivered` is the closest thing email has to
// an impression.
export const STAT_TO_METRIC = {
  delivered: "impressions",
  clicks: "clicks",
  conversions: "conversions",
  conversion_value: "revenue",
};

export const klaviyoConfigured = () => !!process.env.KLAVIYO_PRIVATE_KEY;

function headers() {
  return {
    Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
    revision: KLAVIYO_REVISION,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

/** A caller-facing error carrying Klaviyo's own explanation where it gave one. */
export class ConnectorError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

async function klaviyoFetch(url, init, fetchImpl, timeoutMs) {
  const res = await fetchImpl(url, { ...init, headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || `Klaviyo returned ${res.status}.`;
    if (res.status === 401 || res.status === 403) {
      throw new ConnectorError(`Klaviyo refused the key: ${detail} The private key needs the metrics:read and flows:read scopes.`, 502);
    }
    if (res.status === 429) {
      throw new ConnectorError("Klaviyo's reporting limit was reached (a few requests a minute). Try again shortly.", 429);
    }
    throw new ConnectorError(`Klaviyo: ${detail}`, 502);
  }
  return body;
}

/** The id of the conversion metric flow revenue is measured against. */
export async function conversionMetricId(fetchImpl = fetch, timeoutMs = 10000) {
  if (process.env.KLAVIYO_CONVERSION_METRIC_ID) return process.env.KLAVIYO_CONVERSION_METRIC_ID;
  let url = `${KLAVIYO_API}/metrics?fields[metric]=name`;
  for (let page = 0; url && page < METRIC_PAGES; page++) {
    const body = await klaviyoFetch(url, { method: "GET" }, fetchImpl, timeoutMs);
    const hit = (body.data || []).find((m) => m?.attributes?.name === CONVERSION_METRIC);
    if (hit) return hit.id;
    url = body.links?.next || null;
  }
  throw new ConnectorError(
    `This Klaviyo account has no "${CONVERSION_METRIC}" metric to measure conversions against. ` +
    "Set KLAVIYO_CONVERSION_METRIC_ID to the metric you use instead.", 400,
  );
}

/** The request body for a daily flow series over [start, end). */
export function flowSeriesBody(metricId, start, end) {
  return {
    data: {
      type: "flow-series-report",
      attributes: {
        statistics: Object.keys(STAT_TO_METRIC),
        timeframe: { start: start.toISOString(), end: end.toISOString() },
        interval: "daily",
        conversion_metric_id: metricId,
        // flow_id and flow_message_id are required by Klaviyo; the names are
        // what the rows are identified by.
        group_by: ["flow_id", "flow_message_id", "flow_name", "flow_message_name"],
      },
    },
  };
}

/**
 * Turn a flow series response into performance rows.
 *
 * Message names are not unique in Klaviyo — every flow can have an "Email 1" —
 * and the row identity is (date, channel, level, name), so two messages sharing
 * a name would overwrite each other. A name used by more than one message is
 * therefore qualified with its flow ("Welcome / Email 1"), and with a short id
 * if it is still ambiguous. Qualified names will not parse against the naming
 * schema, which is honest: they are not named to it. They still attribute by
 * direct assignment, and `renamed` says how many there were.
 *
 * Days where every figure is zero are dropped; a flow that sent nothing that
 * day has no fact to record, and sixty days of zeros per dormant flow would
 * crowd real rows out of the browser store's ceiling.
 */
export function rowsFromFlowSeries(body) {
  const attrs = body?.data?.attributes || {};
  const dates = (attrs.date_times || []).map((d) => String(d).slice(0, 10));
  const results = Array.isArray(attrs.results) ? attrs.results : [];

  const idsByName = new Map();
  for (const r of results) {
    const g = r.groupings || {};
    const name = String(g.flow_message_name || "").trim() || String(g.flow_message_id || "");
    if (!idsByName.has(name)) idsByName.set(name, new Set());
    idsByName.get(name).add(g.flow_message_id);
  }

  const used = new Set();
  let renamed = 0;
  const rows = [];
  for (const r of results) {
    const g = r.groupings || {};
    const base = String(g.flow_message_name || "").trim() || String(g.flow_message_id || "");
    let name = base;
    if (idsByName.get(base).size > 1) {
      name = `${g.flow_name || g.flow_id} / ${base}`;
      if (used.has(name)) name = `${name} #${String(g.flow_message_id).slice(-6)}`;
      renamed++;
    }
    used.add(name);

    const stats = r.statistics || {};
    dates.forEach((date, i) => {
      const metrics = {};
      for (const [stat, key] of Object.entries(STAT_TO_METRIC)) {
        const v = Array.isArray(stats[stat]) ? Number(stats[stat][i]) : NaN;
        if (Number.isFinite(v)) metrics[key] = v;
      }
      if (!Object.values(metrics).some((v) => v !== 0)) return;
      rows.push({
        name,
        level: "message",
        channel: "klaviyo",
        date,
        campaignName: String(g.flow_name || ""),
        adsetName: "",
        metrics,
      });
    });
  }
  return { rows, renamed, messages: results.length, from: dates[0] || null, to: dates[dates.length - 1] || null };
}

/** Pull `days` of daily flow performance, ending now. */
export async function syncKlaviyo({ days = 30, now = new Date(), fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const span = Math.min(Math.max(Math.floor(Number(days) || 30), 1), MAX_DAYS);
  const end = new Date(now);
  const start = new Date(end.getTime() - span * 24 * 60 * 60 * 1000);
  const metricId = await conversionMetricId(fetchImpl, timeoutMs);
  const body = await klaviyoFetch(
    `${KLAVIYO_API}/flow-series-reports`,
    { method: "POST", body: JSON.stringify(flowSeriesBody(metricId, start, end)) },
    fetchImpl, timeoutMs,
  );
  return { ...rowsFromFlowSeries(body), days: span };
}
