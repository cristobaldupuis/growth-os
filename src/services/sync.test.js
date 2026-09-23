// Two writers on one workspace: this tab, and someone else — a colleague, or
// Claude through the MCP connector. Drives the real remoteState + store pair
// against a scripted api/state.js, and asserts the property that matters: the
// other writer's records are never written back out by this tab's next save.
import test from "node:test";
import assert from "node:assert/strict";
import {
  PERF_KEY, loadWorkspace, saveDoc, pullChanges, acceptRemote, baseOf, savePerfRows,
  _reset, _setTokenSource, _revisionOf,
} from "./remoteState.js";
import {
  attachRemote, detachRemote, store, onRemoteChange, onSyncNotice, syncRemote, _resetSync,
  KEY_ITEMS, KEY_SETTINGS,
} from "./store.js";

/**
 * A tiny stand-in for api/state.js holding real documents and revisions, so a
 * test can make "someone else" save between this tab's requests.
 */
function fakeServer(initial = {}) {
  const docs = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, { value: v, revision: 1 }]));
  const impl = async (_url, init) => {
    const body = JSON.parse(init.body);
    const reply = (status, payload) => ({ ok: status < 300, status, json: async () => payload });
    if (body.action === "load") return reply(200, { workspace: { id: "w" }, docs: structuredClone(docs), perfRows: [] });
    if (body.action === "docs") {
      const out = {};
      for (const [k, d] of Object.entries(docs)) if (Number(body.since[k]) !== d.revision) out[k] = structuredClone(d);
      return reply(200, { docs: out });
    }
    if (body.action === "saveDoc") {
      const cur = docs[body.key];
      if ((cur?.revision ?? 0) !== body.revision) {
        return reply(409, { error: "changed", current: cur ? structuredClone(cur) : null });
      }
      docs[body.key] = { value: body.value, revision: (cur?.revision ?? 0) + 1 };
      return reply(200, { revision: docs[body.key].revision });
    }
    return reply(400, {});
  };
  /** Someone else saves directly, as the MCP connector does. */
  impl.otherWriter = (key, mutate) => {
    const cur = docs[key];
    docs[key] = { value: mutate(structuredClone(cur?.value)), revision: (cur?.revision ?? 0) + 1 };
  };
  impl.docs = docs;
  return impl;
}

async function boot(server) {
  _reset(); _resetSync(); detachRemote();
  _setTokenSource(async () => "t");
  const { docs } = await loadWorkspace(null, server);
  attachRemote({
    perfKey: PERF_KEY,
    saveDoc: (k, v) => saveDoc(k, v, server),
    savePerfRows: (r) => savePerfRows(r, server),
    pullChanges: () => pullChanges(server),
    acceptRemote, baseOf,
  }, docs);
  const seen = {};
  onRemoteChange({ [KEY_ITEMS]: v => { seen[KEY_ITEMS] = v; }, [KEY_SETTINGS]: v => { seen[KEY_SETTINGS] = v; } });
  return seen;
}

const A = { id: "a", title: "A" };
const B = { id: "b", title: "B" };
const C = { id: "c", title: "From Claude" };

test("a save that races another writer merges instead of refusing", async () => {
  const server = fakeServer({ [KEY_ITEMS]: [A, B] });
  const seen = await boot(server);
  server.otherWriter(KEY_ITEMS, v => [...v, C]);          // Claude adds an initiative

  const result = await store.set(KEY_ITEMS, JSON.stringify([{ ...A, title: "A edited" }, B]));
  assert.equal(result.ok, true);
  assert.deepEqual(server.docs[KEY_ITEMS].value.map(x => x.title), ["A edited", "B", "From Claude"]);
  // The app was handed the merged list, so its next save keeps Claude's record.
  assert.deepEqual(seen[KEY_ITEMS].map(x => x.id), ["a", "b", "c"]);

  await store.set(KEY_ITEMS, JSON.stringify(seen[KEY_ITEMS].map(x => x.id === "b" ? { ...x, title: "B2" } : x)));
  assert.deepEqual(server.docs[KEY_ITEMS].value.map(x => x.id), ["a", "b", "c"]);
  detachRemote();
});

test("a same-record conflict is merged and announced", async () => {
  const server = fakeServer({ [KEY_ITEMS]: [A] });
  await boot(server);
  let notice = null;
  onSyncNotice(n => { notice = n; });
  server.otherWriter(KEY_ITEMS, () => [{ ...A, title: "theirs", updatedAt: "2026-09-01T00:00:00Z" }]);
  await store.set(KEY_ITEMS, JSON.stringify([{ ...A, title: "mine", updatedAt: "2026-09-02T00:00:00Z" }]));
  assert.equal(server.docs[KEY_ITEMS].value[0].title, "mine");
  assert.deepEqual(notice, { key: KEY_ITEMS, conflicts: ["a"] });
  detachRemote();
});

test("a non-record document still refuses with the reload message", async () => {
  const server = fakeServer({ [KEY_SETTINGS]: { companyName: "X" } });
  await boot(server);
  server.otherWriter(KEY_SETTINGS, v => ({ ...v, companyName: "Y" }));
  const result = await store.set(KEY_SETTINGS, JSON.stringify({ companyName: "Z" }));
  assert.equal(result.ok, false);
  assert.match(result.message, /Reload/);
  assert.equal(server.docs[KEY_SETTINGS].value.companyName, "Y", "their save was not overwritten");
  detachRemote();
});

test("a poll adopts another writer's change to an untouched document", async () => {
  const server = fakeServer({ [KEY_ITEMS]: [A], [KEY_SETTINGS]: { companyName: "X" } });
  const seen = await boot(server);
  server.otherWriter(KEY_ITEMS, v => [...v, C]);
  server.otherWriter(KEY_SETTINGS, v => ({ ...v, companyName: "Y" }));

  const adopted = await syncRemote();
  assert.deepEqual(adopted.sort(), [KEY_ITEMS, KEY_SETTINGS].sort());
  assert.deepEqual(seen[KEY_ITEMS].map(x => x.id), ["a", "c"]);
  assert.equal(seen[KEY_SETTINGS].companyName, "Y");
  assert.equal(_revisionOf(KEY_ITEMS), 2);

  // And the next local save goes out on the new revision, with no conflict.
  const r = await store.set(KEY_ITEMS, JSON.stringify([...seen[KEY_ITEMS], B]));
  assert.equal(r.ok, true);
  assert.deepEqual(server.docs[KEY_ITEMS].value.map(x => x.id), ["a", "c", "b"]);
  detachRemote();
});

test("an idle poll changes nothing", async () => {
  const server = fakeServer({ [KEY_ITEMS]: [A] });
  const seen = await boot(server);
  assert.deepEqual(await syncRemote(), []);
  assert.equal(seen[KEY_ITEMS], undefined);
  detachRemote();
});

test("polling with no remote attached is a no-op", async () => {
  _resetSync(); detachRemote();
  assert.deepEqual(await syncRemote(), []);
});
