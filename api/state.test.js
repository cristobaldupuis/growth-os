import test from "node:test";
import assert from "node:assert/strict";
import { DOC_KEYS, MAX_ROWS, toRow, fromRow } from "./state.js";
import { bearerToken, resolveWorkspace } from "./_auth.js";
import { perfRowKey } from "../src/services/performance.js";

const WS = "11111111-1111-1111-1111-111111111111";

// -- The document allowlist ----------------------------------------------------

test("per-device preferences are not workspace state", () => {
  // Syncing these would collapse someone's sidebar because a colleague collapsed
  // theirs, and re-show a tour on a machine that has seen it.
  for (const key of ["gos_theme_v1", "gos_lib_view_v1", "gos_rail_v1", "gos_tour_seen_v1"]) {
    assert.equal(DOC_KEYS.has(key), false, key);
  }
});

test("performance rows are a table, not a document", () => {
  // If this key were ever allowed through the document path it would reintroduce
  // the whole-blob write this migration exists to remove.
  assert.equal(DOC_KEYS.has("gos_perf_v1"), false);
});

test("the client-owned keys are all present", () => {
  for (const key of [
    "gos_items_v4", "gos_settings_v2", "gos_debates_v1", "gos_metrics_v1",
    "gos_recs_v1", "gos_creative_v1", "gos_assets_v1", "gos_usage_v1", "gos_agenda_v1",
  ]) assert.equal(DOC_KEYS.has(key), true, key);
});

// -- Row mapping ---------------------------------------------------------------

const appRow = {
  name: "MET_PROSP_VID_UGC_Q3-hero_INIT-42",
  level: "ad",
  channel: "meta",
  date: "2026-08-01",
  campaignName: "MET_PROSP_CAMP",
  adsetName: "MET_PROSP_SET",
  metrics: { spend: 120.5, conversions: 3 },
  // Derived, and deliberately not stored — see the migration header.
  parsed: true,
  values: { channel: "MET", stage: "PROSP" },
  parseErrors: [],
};

test("a row round-trips through the wire shape", () => {
  const stored = toRow(WS, { ...appRow, rowKey: perfRowKey(appRow) });
  const back = fromRow({
    ...stored, campaign_name: stored.campaign_name, adset_name: stored.adset_name,
  });
  assert.deepEqual(back, {
    name: appRow.name, level: appRow.level, channel: appRow.channel,
    date: appRow.date, campaignName: appRow.campaignName,
    adsetName: appRow.adsetName, metrics: appRow.metrics,
  });
});

test("the derived parse is not persisted", () => {
  // The parse is a pure function of the name and the naming schema, and the
  // schema changes. A stored parse is a cached answer whose inputs moved.
  const stored = toRow(WS, { ...appRow, rowKey: perfRowKey(appRow) });
  for (const field of ["parsed", "values", "parseErrors"]) {
    assert.equal(field in stored, false, field);
  }
});

test("row_key is the caller's, so it cannot drift from the importer's dedupe key", () => {
  const key = perfRowKey(appRow);
  assert.equal(toRow(WS, { ...appRow, rowKey: key }).row_key, key);
  // Two rows that mergePerformanceRows would collapse must collide here too,
  // or a re-import duplicates the entity-day instead of replacing it.
  const sameEntity = { ...appRow, metrics: { spend: 999 } };
  assert.equal(perfRowKey(sameEntity), key);
});

test("a missing date is stored as null rather than an empty string", () => {
  // The column is `date`, and '' is not a date. Postgres would reject the insert
  // for the whole chunk, which is a failed import rather than a missing day.
  assert.equal(toRow(WS, { ...appRow, rowKey: "k", date: "" }).date, null);
  assert.equal(toRow(WS, { ...appRow, rowKey: "k", date: "not-a-date" }).date, null);
  assert.equal(toRow(WS, { ...appRow, rowKey: "k", date: "2026-08-01" }).date, "2026-08-01");
});

test("an empty read-back date becomes the empty string the app expects", () => {
  assert.equal(fromRow({ name: "n", level: "ad", channel: null, date: null, metrics: {} }).date, "");
});

test("chunking is bounded", () => {
  assert.ok(MAX_ROWS > 0 && MAX_ROWS <= 5000);
});

// -- Token shape ---------------------------------------------------------------

test("a bearer token must look like a JWT before it costs a network hop", () => {
  assert.equal(bearerToken({ headers: { authorization: "Bearer a.b.c" } }), "a.b.c");
  assert.equal(bearerToken({ headers: { authorization: "bearer a.b.c" } }), "a.b.c");
  assert.equal(bearerToken({ headers: {} }), null);
  assert.equal(bearerToken({ headers: { authorization: "Bearer nonsense" } }), null);
  assert.equal(bearerToken({ headers: { authorization: "Basic a.b.c" } }), null);
  assert.equal(bearerToken({ headers: { authorization: "Bearer " } }), null);
});

// -- Workspace resolution ------------------------------------------------------

const one = [{ id: WS, slug: "acme", name: "Acme", role: "owner" }];
const two = [...one, { id: "22222222-2222-2222-2222-222222222222", slug: "beta", name: "Beta", role: "member" }];

test("a single membership resolves without being named", () => {
  assert.equal(resolveWorkspace(one, null).workspace.id, WS);
});

test("several memberships and no choice is refused, not guessed", () => {
  // Guessing writes one client's data into another client's workspace, which is
  // the worst outcome available to this endpoint.
  const r = resolveWorkspace(two, null);
  assert.equal(r.status, 400);
  assert.equal(r.workspace, undefined);
  assert.equal(r.choices.length, 2);
});

test("a named workspace resolves by id or by slug", () => {
  assert.equal(resolveWorkspace(two, WS).workspace.slug, "acme");
  assert.equal(resolveWorkspace(two, "beta").workspace.slug, "beta");
});

test("a workspace the caller does not belong to is a 403, not a 404", () => {
  // Membership is the only thing that grants access, and the reply says the same
  // thing whether or not the workspace exists.
  const r = resolveWorkspace(one, "someone-elses");
  assert.equal(r.status, 403);
  assert.equal(r.workspace, undefined);
});

test("no memberships at all is a 403", () => {
  assert.equal(resolveWorkspace([], null).status, 403);
  assert.equal(resolveWorkspace([], "acme").status, 403);
});
