// Tests for the aggregates-only contract.
// Run with: node --test src/services/dataSafety.test.js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyHeader, scanHeaders, piiNotice, stripPersonalFields, isAllowedDimension,
  resolveWorkspaceMode, isLiveWorkspace, backupStatus, BACKUP_STALE_DAYS,
} from "./dataSafety.js";
import { parsePerformanceCSV } from "./performance.js";
import { DEFAULT_NAMING_SCHEMA } from "./naming.js";

// -- Classification ------------------------------------------------------------

test("catches the personal columns a platform export actually ships", () => {
  const cases = [
    ["Email", "email"], ["Customer Email", "email"], ["email_address", "email"],
    ["Phone Number", "phone"], ["First Name", "name"], ["Last name", "name"],
    ["Address Line 1", "address"], ["Zip Code", "address"], ["Postal Code", "address"],
    ["Klaviyo ID", "identity"], ["Shopify Customer ID", "identity"],
    ["IP Address", "device"], ["IDFA", "device"], ["Date of Birth", "birth"],
    ["Latitude", "geo"],
  ];
  cases.forEach(([header, kind]) => {
    const hit = classifyHeader(header);
    assert.ok(hit, `${header} should be classified`);
    assert.equal(hit.kind, kind, `${header} → ${kind}`);
  });
});

test("aggregate dimensions that read like personal data are allowed through", () => {
  // Meta's Age and Gender breakdown columns describe a cohort, not a person, and
  // 5.3's on-demand demographic pull depends on them being importable.
  ["Age", "Gender", "Country", "City", "Region", "Placement", "Impression device"]
    .forEach(h => {
      assert.equal(classifyHeader(h), null, `${h} should not be blocked`);
      assert.ok(isAllowedDimension(h));
    });
});

test("ordinary metric columns are untouched", () => {
  ["Ad name", "Amount spent (USD)", "Purchases", "Impressions", "Reporting starts"]
    .forEach(h => assert.equal(classifyHeader(h), null, `${h} should pass`));
});

// -- Scanning ------------------------------------------------------------------

test("a scan reports position as well as kind", () => {
  const scan = scanHeaders(["Ad name", "Email", "Amount spent", "Phone"]);
  assert.equal(scan.clean, false);
  assert.equal(scan.blocked.length, 2);
  assert.deepEqual([...scan.indexes].sort(), [1, 3]);
  assert.deepEqual(scan.kinds.sort(), ["email", "phone"]);
});

test("a clean header row says so", () => {
  const scan = scanHeaders(["Ad name", "Amount spent", "Purchases"]);
  assert.equal(scan.clean, true);
  assert.equal(piiNotice(scan), "");
});

test("the notice names the columns and does not claim the file was cleaned", () => {
  const notice = piiNotice(scanHeaders(["Email", "Ad name"]));
  assert.match(notice, /"Email"/);
  assert.match(notice, /not imported/);
  // The product cannot delete the operator's download, and saying it can is the
  // one failure mode a reassuring message would introduce.
  assert.match(notice, /delete it/);
});

// -- The importer honours the contract in fact, not only in intent -------------

test("a performance export carrying personal columns imports without them", () => {
  const csv = [
    "Ad name,Email,First name,Amount spent (USD),Purchases",
    "Meta_Col_EmmaBrune_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NA,someone@example.com,Someone,100,4",
  ].join("\n");
  const { rows } = parsePerformanceCSV(csv, DEFAULT_NAMING_SCHEMA, { channel: "meta" });
  assert.equal(rows.length, 1);
  const serialised = JSON.stringify(rows[0]);
  assert.equal(serialised.includes("example.com"), false);
  assert.equal(serialised.includes("Someone"), false);
  assert.equal(rows[0].metrics.spend, 100);
});

// -- Connector rows ------------------------------------------------------------

test("stripping a record removes personal keys and reports them", () => {
  const { record, removed } = stripPersonalFields({
    campaign_name: "Klaviyo_Flow_Welcome", email: "a@b.co", revenue: 1200, customer_id: "cus_1",
  });
  assert.deepEqual(Object.keys(record).sort(), ["campaign_name", "revenue"]);
  assert.deepEqual(removed.map(r => r.kind).sort(), ["email", "identity"]);
});

test("a clean record survives stripping unchanged", () => {
  const input = { campaign_name: "X", spend: 10 };
  const { record, removed } = stripPersonalFields(input);
  assert.deepEqual(record, input);
  assert.equal(removed.length, 0);
});

// -- Workspace mode ------------------------------------------------------------

test("mode defaults from the build flag and is overridable", () => {
  assert.equal(resolveWorkspaceMode({}, true), "demo");
  assert.equal(resolveWorkspaceMode({}, false), "live");
  // The demo build deployed for a client who then imports their own account:
  // the flag is stale and the operator's setting is the answer.
  assert.equal(resolveWorkspaceMode({ workspaceMode: "live" }, true), "live");
  assert.equal(isLiveWorkspace({ workspaceMode: "live" }, true), true);
  assert.equal(isLiveWorkspace({ workspaceMode: "demo" }, false), false);
});

// -- Backup age ----------------------------------------------------------------

test("an empty workspace is not nagged for a backup", () => {
  assert.equal(backupStatus(null, { hasData: false, live: true }).due, false);
});

test("a live workspace that has never backed up is due immediately", () => {
  // The case the old fourteen-day check stayed silent for, which was the one
  // case that mattered.
  const s = backupStatus(null, { hasData: true, live: true });
  assert.equal(s.due, true);
  assert.equal(s.never, true);
  // A demo has a reset button, so silence is right there.
  assert.equal(backupStatus(null, { hasData: true, live: false }).due, false);
});

test("live goes stale on the weekly cadence, demo on the fortnightly one", () => {
  const now = new Date("2026-08-10T00:00:00Z");
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  assert.equal(backupStatus(daysAgo(1), { now, live: true }).due, false);
  assert.equal(backupStatus(daysAgo(BACKUP_STALE_DAYS.live - 1), { now, live: true }).due, false);
  assert.equal(backupStatus(daysAgo(BACKUP_STALE_DAYS.live), { now, live: true }).due, true);
  assert.equal(backupStatus(daysAgo(BACKUP_STALE_DAYS.live), { now, live: false }).due, false);
  assert.equal(backupStatus(daysAgo(BACKUP_STALE_DAYS.demo), { now, live: false }).due, true);
  assert.equal(backupStatus(daysAgo(30), { now, live: true }).days, 30);
});

test("an unparseable backup timestamp is treated as no backup", () => {
  assert.equal(backupStatus("not a date", { hasData: true, live: true }).never, true);
});
