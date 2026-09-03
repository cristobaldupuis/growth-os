// Assertion-based tests for the attribution-mapping extension of
// normalizeInitiativeRecord.  No test framework required.
// Run with: node src/services/csv.test.js
import assert from "node:assert/strict";
import { normalizeInitiativeRecord, itemToCSVRow } from "./csv.js";
// Deliberately the ACTIVE config, not a config.*.js file directly — csv.js reads
// ATTRIBUTION_CONFIG through activeConfig.js, so importing anything else here
// would assert against rules the running app does not use.
import { ATTRIBUTION_CONFIG } from "../activeConfig.js";

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

// 6. Claimed campaign/ad names — the direct attribution bridge. These join
//    imported performance rows to an initiative by exact name, so a round-trip
//    that drops them silently unlinks every campaign an initiative measures.
test("claimed campaign names survive a CSV round-trip", () => {
  const item = {
    id: "i1", initId: "NH-001", title: "Spring refresh",
    adNames: [
      { name: "Spring Sale - Prospecting", level: "campaign", channel: "meta", addedAt: "2026-08-01" },
      { name: "Static B" },
    ],
  };
  const row = itemToCSVRow(item, BRANDS);
  assert.strictEqual(row.adNames, "Spring Sale - Prospecting | Static B");
  const back = normalizeInitiativeRecord({ ...row, brandId: "Northcove Home" }, ctx);
  assert.deepStrictEqual(back.adNames.map(e => e.name), ["Spring Sale - Prospecting", "Static B"]);
});

// 7. The quiet-data-loss guard: someone exports, edits three columns in a
//    spreadsheet that drops the one it does not understand, re-imports, and every
//    claim disappears. That surfaces a month later as missing spend.
test("a blank adNames column carries existing claims through rather than clearing them", () => {
  const existing = { id: "i1", initId: "NH-001", title: "Spring refresh", adNames: [{ name: "Spring Sale - Prospecting" }] };
  const result = normalizeInitiativeRecord(
    { initId: "NH-001", title: "Spring refresh", adNames: "" },
    { ...ctx, items: [existing] }
  );
  assert.deepStrictEqual(result.adNames.map(e => e.name), ["Spring Sale - Prospecting"]);
});

// 8. Supersession edges (ROADMAP 5.8). Same class as the adNames guard, higher
//    stakes: a round-trip that drops these silently un-retracts every belief
//    someone retracted, and the record goes back to citing it as current.
test("supersession edges survive a CSV round-trip", () => {
  const item = {
    id: "i1", initId: "NH-002", title: "Discount creative, second read",
    status: "Completed",
    results: {
      keyLearning: "Discount creative underperforms on prospecting",
      outcomeClassification: "Failed",
      supersedes: ["NH-001"], contradicts: ["NH-004"], confirms: ["NH-003"],
    },
  };
  const row = itemToCSVRow(item, BRANDS);
  assert.strictEqual(row.supersedes, "NH-001");
  assert.strictEqual(row.confirms, "NH-003");
  const back = normalizeInitiativeRecord({ ...row, brandId: "Northcove Home" }, ctx);
  assert.deepStrictEqual(back.results.supersedes, ["NH-001"]);
  assert.deepStrictEqual(back.results.contradicts, ["NH-004"]);
  assert.deepStrictEqual(back.results.confirms, ["NH-003"]);
});

test("multiple edges of one kind round-trip through the pipe separator", () => {
  const item = {
    id: "i1", initId: "NH-002", title: "t", status: "Completed",
    results: { keyLearning: "x", outcomeClassification: "Success", supersedes: ["NH-001", "NH-009"] },
  };
  const row = itemToCSVRow(item, BRANDS);
  assert.strictEqual(row.supersedes, "NH-001|NH-009");
  const back = normalizeInitiativeRecord({ ...row, brandId: "Northcove Home" }, ctx);
  assert.deepStrictEqual(back.results.supersedes, ["NH-001", "NH-009"]);
});

test("a blank supersedes column carries existing edges through rather than un-retracting", () => {
  const existing = {
    id: "i1", initId: "NH-002", title: "t", status: "Completed",
    results: { keyLearning: "x", outcomeClassification: "Success", supersedes: ["NH-001"] },
  };
  const result = normalizeInitiativeRecord(
    { initId: "NH-002", title: "t", results_keyLearning: "x", supersedes: "" },
    { ...ctx, items: [existing] }
  );
  assert.deepStrictEqual(result.results.supersedes, ["NH-001"]);
});

test("a closed initiative with no edges imports with three empty arrays, not undefined", () => {
  const result = normalizeInitiativeRecord(
    { initId: "NH-007", title: "t", results_keyLearning: "x" }, ctx
  );
  assert.deepStrictEqual(result.results.supersedes, []);
  assert.deepStrictEqual(result.results.contradicts, []);
  assert.deepStrictEqual(result.results.confirms, []);
});

// 9. Durability had no line in the import mapping at all, so re-importing a
//    closed initiative silently demoted every structural learning to tactical —
//    which is what Signal reads to decide whether to discount a belief by age.
test("durability survives a re-import instead of being demoted to tactical", () => {
  const existing = {
    id: "i1", initId: "NH-002", title: "t", status: "Completed",
    results: { keyLearning: "x", outcomeClassification: "Success", durability: "structural" },
  };
  const result = normalizeInitiativeRecord(
    { initId: "NH-002", title: "t", results_keyLearning: "x" },
    { ...ctx, items: [existing] }
  );
  assert.strictEqual(result.results.durability, "structural");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
