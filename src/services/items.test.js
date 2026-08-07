import { test } from "node:test";
import assert from "node:assert/strict";
import { stampUpdatedAt } from "./items.js";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-06-01T00:00:00.000Z";

const item = (over = {}) => ({
  id: "e1", initId: "NH-001", title: "Welcome series", status: "Running",
  ice: { impact: 5, certainty: 5, ease: 5 }, adNames: [], revenueImpact: 0,
  updatedAt: T0, ...over,
});

test("an untouched item keeps its old stamp", () => {
  const prev = [item()];
  const [out] = stampUpdatedAt([item()], prev, T1);
  assert.equal(out.updatedAt, T0);
});

test("an untouched item keeps its identity, so memoisation downstream can hold", () => {
  const prev = [item()];
  const [out] = stampUpdatedAt([item()], prev, T1);
  assert.equal(out, prev[0]);
});

test("a changed item takes the new stamp", () => {
  const [out] = stampUpdatedAt([item({ title: "Welcome series v2" })], [item()], T1);
  assert.equal(out.updatedAt, T1);
});

test("a nested change counts as a change", () => {
  const [out] = stampUpdatedAt(
    [item({ ice: { impact: 9, certainty: 5, ease: 5 } })], [item()], T1);
  assert.equal(out.updatedAt, T1);
});

test("a change inside an array of objects counts as a change", () => {
  const before = item({ adNames: [{ name: "a", level: "ad", channel: "", addedAt: "" }] });
  const after  = item({ adNames: [{ name: "b", level: "ad", channel: "", addedAt: "" }] });
  const [out] = stampUpdatedAt([after], [before], T1);
  assert.equal(out.updatedAt, T1);
});

// The regression this module exists for. Editing one initiative used to
// re-stamp every other one, which emptied the Weekly Standup's stale-work group.
test("editing one initiative does not re-stamp its neighbours", () => {
  const prev = [item(), item({ id: "e2", initId: "NH-002", title: "SMS win-back" })];
  const next = [item({ title: "Welcome series v2" }), item({ id: "e2", initId: "NH-002", title: "SMS win-back" })];
  const out = stampUpdatedAt(next, prev, T1);
  assert.equal(out[0].updatedAt, T1, "the edited one moves");
  assert.equal(out[1].updatedAt, T0, "the untouched one does not");
});

test("a brand new item is stamped, because creation is activity", () => {
  const fresh = { id: "e9", title: "New idea" };
  const [out] = stampUpdatedAt([fresh], [], T1);
  assert.equal(out.updatedAt, T1);
});

test("an imported item keeps the stamp it arrived with", () => {
  const imported = { id: "e9", title: "From CSV", updatedAt: T0 };
  const [out] = stampUpdatedAt([imported], [], T1);
  assert.equal(out.updatedAt, T0);
});

test("key order is not treated as a change", () => {
  const before = { id: "e1", title: "A", status: "Draft", updatedAt: T0 };
  const after  = { status: "Draft", title: "A", id: "e1", updatedAt: T0 };
  const [out] = stampUpdatedAt([after], [before], T1);
  assert.equal(out.updatedAt, T0);
});

test("a deleted item simply does not appear in the result", () => {
  const prev = [item(), item({ id: "e2" })];
  const out = stampUpdatedAt([item()], prev, T1);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "e1");
});
