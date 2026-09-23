import test from "node:test";
import assert from "node:assert/strict";
import { mergeRecordLists, MERGEABLE_KEYS } from "./docMerge.js";

const a = { id: "a", title: "A", updatedAt: "2026-09-01T00:00:00Z" };
const b = { id: "b", title: "B", updatedAt: "2026-09-01T00:00:00Z" };
const c = { id: "c", title: "C", updatedAt: "2026-09-01T00:00:00Z" };
const ids = (r) => r.value.map(x => x.id);

test("only initiatives and agenda items are merged", () => {
  assert.deepEqual([...MERGEABLE_KEYS].sort(), ["gos_agenda_v1", "gos_items_v4"]);
});

test("edits to different records both survive, with no conflict", () => {
  const local  = [{ ...a, title: "A local" }, b];
  const remote = [a, { ...b, title: "B remote" }];
  const r = mergeRecordLists([a, b], local, remote);
  assert.deepEqual(r.value, [{ ...a, title: "A local" }, { ...b, title: "B remote" }]);
  assert.deepEqual(r.conflicts, []);
});

test("a record added remotely (Claude via MCP) is appended, and local order kept", () => {
  const r = mergeRecordLists([a, b], [b, a], [a, b, c]);
  assert.deepEqual(ids(r), ["b", "a", "c"]);
  assert.deepEqual(r.conflicts, []);
});

test("records added on both sides are all kept", () => {
  const d = { id: "d" };
  const r = mergeRecordLists([a], [a, d], [a, c]);
  assert.deepEqual(ids(r), ["a", "d", "c"]);
});

test("a delete on one side of an untouched record is honoured", () => {
  assert.deepEqual(ids(mergeRecordLists([a, b], [a], [a, b])), ["a"]);
  assert.deepEqual(ids(mergeRecordLists([a, b], [a, b], [b])), ["b"]);
});

test("a delete against an edit keeps the edit and reports it", () => {
  const edited = { ...b, title: "B edited" };
  const r1 = mergeRecordLists([a, b], [a], [a, edited]);
  assert.deepEqual(r1.value, [a, edited]);
  assert.deepEqual(r1.conflicts, ["b"]);
  const r2 = mergeRecordLists([a, b], [a, edited], [a]);
  assert.deepEqual(r2.value, [a, edited]);
  assert.deepEqual(r2.conflicts, ["b"]);
});

test("the same record edited differently: newer updatedAt wins, reported", () => {
  const older = { ...a, title: "older", updatedAt: "2026-09-02T00:00:00Z" };
  const newer = { ...a, title: "newer", updatedAt: "2026-09-03T00:00:00Z" };
  assert.equal(mergeRecordLists([a], [older], [newer]).value[0].title, "newer");
  assert.equal(mergeRecordLists([a], [newer], [older]).value[0].title, "newer");
  assert.deepEqual(mergeRecordLists([a], [older], [newer]).conflicts, ["a"]);
});

test("without timestamps the local edit wins a tie", () => {
  const r = mergeRecordLists([{ id: "x", t: 0 }], [{ id: "x", t: 1 }], [{ id: "x", t: 2 }]);
  assert.equal(r.value[0].t, 1);
});

test("identical edits on both sides are not a conflict", () => {
  const same = { ...a, title: "same" };
  assert.deepEqual(mergeRecordLists([a], [same], [same]).conflicts, []);
});

test("key order does not count as a change (Postgres jsonb reorders keys)", () => {
  const reordered = { updatedAt: a.updatedAt, title: a.title, id: a.id };
  const r = mergeRecordLists([reordered], [a], [{ ...a, title: "remote" }]);
  assert.equal(r.value[0].title, "remote");
  assert.deepEqual(r.conflicts, []);
});

test("a missing base is an empty document", () => {
  assert.deepEqual(ids(mergeRecordLists(undefined, [a], [b])), ["a", "b"]);
});

test("anything that is not a list of id'd records is refused", () => {
  assert.equal(mergeRecordLists([], { theme: "dark" }, []), null);
  assert.equal(mergeRecordLists([], [{ title: "no id" }], []), null);
  assert.equal(mergeRecordLists([], [a], "nope"), null);
});
