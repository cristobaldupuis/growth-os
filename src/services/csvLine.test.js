import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCSVLine } from "./csvLine.js";
import { parseMetricsCSV } from "../constants.js";

test("a plain line splits on commas", () => {
  assert.deepEqual(splitCSVLine("a,b,c"), ["a", "b", "c"]);
});

test("a comma inside quotes is data, not a separator", () => {
  assert.deepEqual(splitCSVLine('a,"b,c",d'), ["a", "b,c", "d"]);
});

test("a doubled quote inside a quoted field is a literal quote", () => {
  assert.deepEqual(splitCSVLine('a,"say ""hi""",c'), ["a", 'say "hi"', "c"]);
});

test("surrounding whitespace is trimmed but inner spacing is kept", () => {
  assert.deepEqual(splitCSVLine(' a , b c '), ["a", "b c"]);
});

test("empty cells survive as empty strings", () => {
  assert.deepEqual(splitCSVLine("a,,c"), ["a", "", "c"]);
  assert.deepEqual(splitCSVLine("a,b,"), ["a", "b", ""]);
});

// -- The regression -----------------------------------------------------------
//
// The weekly-metrics parser used a plain `split(",")`. A Meta export quotes any
// field containing a comma, and campaign names contain them constantly, so the
// first quoted cell shifted every column to its right by one — silently, with
// the wrong numbers landing under the right headers.

test("a quoted comma in a notes cell no longer shifts the columns after it", () => {
  const csv = [
    "date,brand,source,revenue,notes,conversions",
    '2026-05-18,default,meta,42000,"Scaled UGC, then killed it",310',
  ].join("\n");

  const { rows, errors } = parseMetricsCSV(csv);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-05-18");
  assert.equal(rows[0].brand, "default");
  assert.equal(rows[0].source, "meta");
  assert.equal(rows[0].metrics.revenue, 42000);
  assert.equal(rows[0].metrics.notes, "Scaled UGC, then killed it");
  // The one that used to break: `conversions` sat after the quoted cell, so a
  // naive split read the tail of the note into it and dropped the number.
  assert.equal(rows[0].metrics.conversions, 310);
});

test("a quoted header is read as a header, not as a quoted string", () => {
  const csv = [
    '"date","Amount Spent","Total Revenue"',
    "2026-05-18,1200,4800",
  ].join("\n");

  const { rows } = parseMetricsCSV(csv);
  assert.equal(rows.length, 1);
  // Both headers alias onto canonical keys, which only works if the quotes and
  // the internal space were both handled.
  assert.equal(rows[0].metrics.spend, 1200);
  assert.equal(rows[0].metrics.revenue, 4800);
});

test("currency and percent formatting still parses to numbers", () => {
  const csv = [
    "date,revenue,return_rate",
    '2026-05-18,"$42,000",8.1%',
  ].join("\n");

  const { rows } = parseMetricsCSV(csv);
  assert.equal(rows[0].metrics.revenue, 42000);
  assert.equal(rows[0].metrics.return_rate, 8.1);
});
