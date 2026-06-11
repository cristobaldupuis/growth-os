// Assertion-based tests for the attribution-mapping extension of
// normalizeInitiativeRecord.  No test framework required.
// Run with: node src/services/csv.test.js
import assert from "node:assert/strict";
import { normalizeInitiativeRecord } from "./csv.js";
import { ATTRIBUTION_CONFIG } from "../config.js";

// Minimal shared context — mirrors real call sites in the app.
const BRANDS = [
  { id: "default", name: "Northcove Home", code: "NH" },
  { id: "r1",      name: "Retailer 1",     code: "R1" },
];
const ctx = {
  items: [],
  brands: BRANDS,
  cats: ["Paid Media", "Organic", "Conversion"],
  idPrefix: "test",
  idx: 0,
  sd: "2025-01-01",
  ed: "2025-02-01",
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("  PASS", name);
    passed++;
  } catch (e) {
    console.error("  FAIL", name, "—", e.message);
    failed++;
  }
}

// 1. Clean record — no attribution fields present, output shape is unchanged.
test("clean record: title, initId, category, status preserved unchanged", () => {
  const result = normalizeInitiativeRecord(
    { initId: "NH-001", title: "Widget Test", category: "Conversion", status: "Draft" },
    ctx
  );
  assert.strictEqual(result.title, "Widget Test");
  assert.strictEqual(result.initId, "NH-001");
  assert.strictEqual(result.category, "Conversion");
  assert.strictEqual(result.status, "Draft");
  assert.strictEqual(result.trackingTag, "");
});

// 2. idMapping hit — campaign_name is a valid initiative ID; copied to initId.
test("idMapping: campaign_name value written to initId", () => {
  const result = normalizeInitiativeRecord(
    { title: "Meta Spend", campaign_name: "NH-005", category: "Paid Media" },
    ctx,
    {
      idMappings: [{ platform: "meta", sourceField: "campaign_name", initiativeIdField: "initId" }],
      patterns: [],
    }
  );
  assert.strictEqual(result.initId, "NH-005");
});

// 3. Pattern hit — legacy campaign name slug extracted into trackingTag.
test("pattern: legacy campaign slug extracted into trackingTag", () => {
  const result = normalizeInitiativeRecord(
    { title: "Retargeting Push", campaign_name: "2025_Q3_retargeting_v2", category: "Paid Media" },
    ctx,
    {
      idMappings: [],
      patterns: [
        {
          name: "legacy-campaign-slug",
          sourceField: "campaign_name",
          regex: "^\\d{4}_Q\\d_([a-z0-9-]+?)_v\\d+$",
          captureGroup: 1,
          target: "trackingTag",
        },
      ],
    }
  );
  assert.strictEqual(result.trackingTag, "retargeting");
});

// 4. Malformed regex — skipped gracefully, warning logged, record still returned.
test("malformed regex: skipped with console.warn, record returned normally", () => {
  let warnCalled = false;
  const origWarn = console.warn;
  console.warn = () => { warnCalled = true; };
  let result;
  try {
    result = normalizeInitiativeRecord(
      { title: "Bad Pattern Test", campaign_name: "2025_Q3_retargeting_v2" },
      ctx,
      {
        idMappings: [],
        patterns: [{ name: "bad-regex", sourceField: "campaign_name", regex: "[invalid", captureGroup: 1, target: "trackingTag" }],
      }
    );
  } finally {
    console.warn = origWarn;
  }
  assert.ok(result, "record should be returned even when regex is malformed");
  assert.ok(warnCalled, "console.warn must be called for the malformed pattern");
  assert.strictEqual(result.trackingTag, "", "trackingTag must not be set when pattern throws");
});

// 5. No-match fallback — record has no sourceFields from the config; default
//    ID generation runs as before, no attribution side-effects.
test("no-match fallback: initId auto-generated, trackingTag empty", () => {
  const result = normalizeInitiativeRecord(
    { title: "Organic Post", category: "Organic" },
    ctx,
    ATTRIBUTION_CONFIG
  );
  assert.ok(result.initId, "initId must be generated even when no attribution field matches");
  assert.ok(result.initId.startsWith("NH-"), "auto-generated initId uses NH prefix for default brand");
  assert.strictEqual(result.trackingTag, "");
  assert.strictEqual(result.title, "Organic Post");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
