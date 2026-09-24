// Klaviyo flow series → performance rows, and the connectors endpoint's gates.
// Fixtures follow the official SDK's models (klaviyo-api 23.0.0, revision
// 2026-07-15): results[].groupings / results[].statistics[stat][i] aligned to
// date_times[i]. No network.
//
// Run with: node --test api/klaviyo.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rowsFromFlowSeries, flowSeriesBody, conversionMetricId, syncKlaviyo, ConnectorError,
  KLAVIYO_REVISION, MAX_DAYS,
} from "./_klaviyo.js";
import { perfRowKey } from "../src/services/performance.js";

const series = (results, dates = ["2026-09-01T00:00:00+00:00", "2026-09-02T00:00:00+00:00"]) =>
  ({ data: { type: "flow-series-report", attributes: { date_times: dates, results } } });

const msg = (flow, flowName, id, name, stats) => ({
  groupings: { flow_id: flow, flow_name: flowName, flow_message_id: id, flow_message_name: name },
  statistics: stats,
});

test("each message-day becomes a klaviyo message row with the flow as its campaign", () => {
  const { rows } = rowsFromFlowSeries(series([
    msg("F1", "Welcome", "M1", "KLV_WELCOME_EMAIL1", { delivered: [100, 80], clicks: [5, 4], conversions: [1, 0], conversion_value: [50, 0] }),
  ]));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    name: "KLV_WELCOME_EMAIL1", level: "message", channel: "klaviyo", date: "2026-09-01",
    campaignName: "Welcome", adsetName: "",
    metrics: { impressions: 100, clicks: 5, conversions: 1, revenue: 50 },
  });
  assert.equal(rows[1].date, "2026-09-02");
  assert.equal(rows[0].metrics.spend, undefined, "email has no media spend, and zero would distort ROAS");
});

test("days where nothing happened are not rows", () => {
  const { rows } = rowsFromFlowSeries(series([
    msg("F1", "Winback", "M1", "Email 1", { delivered: [0, 12], clicks: [0, 1], conversions: [0, 0], conversion_value: [0, 0] }),
  ]));
  assert.deepEqual(rows.map(r => r.date), ["2026-09-02"]);
});

test("a message name shared across flows is qualified so rows cannot overwrite each other", () => {
  const stats = { delivered: [10, 0], clicks: [1, 0], conversions: [0, 0], conversion_value: [0, 0] };
  const out = rowsFromFlowSeries(series([
    msg("F1", "Welcome", "M1", "Email 1", stats),
    msg("F2", "Browse abandon", "M2", "Email 1", stats),
    msg("F3", "Winback", "M3", "Unique name", stats),
  ]));
  const names = out.rows.map(r => r.name).sort();
  assert.deepEqual(names, ["Browse abandon / Email 1", "Unique name", "Welcome / Email 1"]);
  assert.equal(out.renamed, 2);
  assert.equal(new Set(out.rows.map(perfRowKey)).size, out.rows.length, "every row has its own identity");
});

test("the request asks for a daily series with the fields Klaviyo requires", () => {
  const body = flowSeriesBody("MET1", new Date("2026-08-01T00:00:00Z"), new Date("2026-09-01T00:00:00Z"));
  assert.equal(body.data.type, "flow-series-report");
  const a = body.data.attributes;
  assert.equal(a.interval, "daily");
  assert.equal(a.conversion_metric_id, "MET1");
  assert.ok(a.group_by.includes("flow_id") && a.group_by.includes("flow_message_id"));
  assert.deepEqual(a.timeframe, { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" });
  assert.deepEqual(a.statistics.sort(), ["clicks", "conversion_value", "conversions", "delivered"]);
});

function klaviyoMock(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    for (const [match, reply] of routes) {
      if (String(url).includes(match)) {
        const r = typeof reply === "function" ? reply(calls.length) : reply;
        return { ok: (r.status ?? 200) < 300, status: r.status ?? 200, json: async () => r.body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  impl.calls = calls;
  return impl;
}

test("the conversion metric is found across pages, or taken from the environment", async () => {
  process.env.KLAVIYO_PRIVATE_KEY = "pk_test";
  const f = klaviyoMock([["/metrics", (n) => n === 1
    ? { body: { data: [{ id: "a", attributes: { name: "Opened Email" } }], links: { next: "https://a.klaviyo.com/api/metrics?page[cursor]=2" } } }
    : { body: { data: [{ id: "PO", attributes: { name: "Placed Order" } }], links: {} } }]]);
  assert.equal(await conversionMetricId(f), "PO");
  assert.equal(f.calls.length, 2);

  process.env.KLAVIYO_CONVERSION_METRIC_ID = "OVERRIDE";
  assert.equal(await conversionMetricId(klaviyoMock([])), "OVERRIDE");
  delete process.env.KLAVIYO_CONVERSION_METRIC_ID;
});

test("a sync sends Klaviyo's auth and revision headers and caps the window at 60 days", async () => {
  process.env.KLAVIYO_PRIVATE_KEY = "pk_test";
  process.env.KLAVIYO_CONVERSION_METRIC_ID = "PO";
  const f = klaviyoMock([["/flow-series-reports", { body: series([]) }]]);
  const out = await syncKlaviyo({ days: 400, now: new Date("2026-09-21T00:00:00Z"), fetchImpl: f });
  const { init } = f.calls[0];
  assert.equal(init.headers.Authorization, "Klaviyo-API-Key pk_test");
  assert.equal(init.headers.revision, KLAVIYO_REVISION);
  assert.equal(out.days, MAX_DAYS);
  const tf = JSON.parse(init.body).data.attributes.timeframe;
  assert.equal((Date.parse(tf.end) - Date.parse(tf.start)) / 86400000, MAX_DAYS);
  delete process.env.KLAVIYO_CONVERSION_METRIC_ID;
});

test("Klaviyo's refusals become messages an operator can act on", async () => {
  process.env.KLAVIYO_CONVERSION_METRIC_ID = "PO";
  const denied = klaviyoMock([["/flow-series-reports", { status: 403, body: { errors: [{ detail: "Missing scope" }] } }]]);
  await assert.rejects(() => syncKlaviyo({ fetchImpl: denied }), (e) => e instanceof ConnectorError && /flows:read/.test(e.message));
  const limited = klaviyoMock([["/flow-series-reports", { status: 429, body: {} }]]);
  await assert.rejects(() => syncKlaviyo({ fetchImpl: limited }), (e) => e.status === 429);
  delete process.env.KLAVIYO_CONVERSION_METRIC_ID;
});

// -- The endpoint ----------------------------------------------------------------

process.env.ALLOWED_ORIGINS = "https://example.test";
const handler = (await import("./connectors.js")).default;

function mockRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}

let ip = 0;
async function call(method, body, { token = null, role = "member", env = true } = {}) {
  const saved = { ...process.env };
  if (env) { process.env.SUPABASE_URL = "https://db.example.test"; process.env.SUPABASE_SECRET_KEY = "sk"; }
  process.env.KLAVIYO_PRIVATE_KEY = "pk_test";
  process.env.KLAVIYO_CONVERSION_METRIC_ID = "PO";
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const reply = (b, s = 200) => ({ ok: s < 300, status: s, json: async () => b, text: async () => "" });
    if (u.includes("/rpc/increment_rate_limit")) return reply(1);
    if (u.includes("/auth/v1/user")) return reply({ id: "u-" + role });
    if (u.includes("/workspace_members")) return reply([{ workspace_id: "w1", role, workspaces: { slug: "acme", name: "Acme" } }]);
    if (u.includes("/flow-series-reports")) return reply(series([msg("F1", "Welcome", "M1", "E1", { delivered: [5, 0], clicks: [1, 0], conversions: [0, 0], conversion_value: [0, 0] })]));
    return reply({}, 404);
  };
  const res = mockRes();
  try {
    await handler({
      method, query: {}, body,
      headers: { origin: "https://example.test", "x-forwarded-for": `10.8.0.${++ip}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    }, res);
  } finally {
    globalThis.fetch = real;
    process.env = saved;
  }
  return res;
}

test("status says which connectors this deployment has, without a session", async () => {
  const res = await call("GET");
  assert.equal(res.body.connectors.klaviyo.configured, true);
  assert.equal(res.body.connectors.shopify.available, false);
});

test("a sync needs a signed-in session: no anonymous read of the client's data", async () => {
  assert.equal((await call("POST", { provider: "klaviyo" })).statusCode, 401);
  assert.equal((await call("POST", { provider: "klaviyo" }, { env: false })).statusCode, 403);
});

test("a viewer cannot sync; a member gets rows", async () => {
  assert.equal((await call("POST", { provider: "klaviyo" }, { token: "a.b.c", role: "viewer" })).statusCode, 403);
  const ok = await call("POST", { provider: "klaviyo", days: 7 }, { token: "a.b.c" });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.rows.length, 1);
  assert.equal(ok.body.rows[0].channel, "klaviyo");
});

test("an unknown provider is refused", async () => {
  assert.equal((await call("POST", { provider: "myspace" }, { token: "a.b.c" })).statusCode, 400);
});
