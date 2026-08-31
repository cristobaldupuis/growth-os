import test from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK, PERF_KEY, loadWorkspace, saveDoc, savePerfRows, uploadInitial,
  _reset, _setTokenSource, _revisionOf, currentWorkspace,
} from "./remoteState.js";
import { attachRemote, detachRemote, store, onWriteError, DEVICE_KEYS, KEY_ITEMS, KEY_THEME } from "./store.js";
import { perfRowKey } from "./performance.js";

/** A fetch stand-in that records calls and replays scripted responses. */
function mockFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers || {} });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return {
      ok: next.status === undefined || (next.status >= 200 && next.status < 300),
      status: next.status ?? 200,
      json: async () => next.body ?? {},
    };
  };
  impl.calls = calls;
  return impl;
}

function setup() {
  _reset();
  detachRemote();
  _setTokenSource(async () => "test-token");
}

const row = {
  name: "MET_PROSP_VID_INIT-42", level: "ad", channel: "meta", date: "2026-08-01",
  campaignName: "C", adsetName: "S", metrics: { spend: 10 },
};

// -- Loading -------------------------------------------------------------------

test("the whole workspace arrives in one request, docs as JSON strings", async () => {
  setup();
  const f = mockFetch([{ body: {
    workspace: { id: "w1", slug: "acme", name: "Acme", role: "owner" },
    docs: { [KEY_ITEMS]: { value: [{ id: "e1" }], revision: 7 } },
    perfRows: [row],
  } }]);

  const loaded = await loadWorkspace(null, f);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.action, "load");
  assert.equal(f.calls[0].headers.Authorization, "Bearer test-token");
  // A string, because that is the contract store.get has always had and every
  // caller in App.jsx parses one.
  assert.equal(typeof loaded.docs[KEY_ITEMS], "string");
  assert.deepEqual(JSON.parse(loaded.docs[KEY_ITEMS]), [{ id: "e1" }]);
  assert.equal(loaded.perfRows.length, 1);
  assert.equal(currentWorkspace().slug, "acme");
  assert.equal(_revisionOf(KEY_ITEMS), 7);
});

test("a save sends the revision the load reported, and takes the new one", async () => {
  setup();
  await loadWorkspace(null, mockFetch([{ body: { workspace: { id: "w1" }, docs: { [KEY_ITEMS]: { value: [], revision: 7 } }, perfRows: [] } }]));

  const f = mockFetch([{ body: { revision: 8 } }]);
  await saveDoc(KEY_ITEMS, JSON.stringify([{ id: "e2" }]), f);
  assert.equal(f.calls[0].body.revision, 7);
  assert.equal(_revisionOf(KEY_ITEMS), 8);
});

test("a key the server has never seen is created with revision 0", async () => {
  setup();
  await loadWorkspace(null, mockFetch([{ body: { workspace: { id: "w1" }, docs: {}, perfRows: [] } }]));
  const f = mockFetch([{ body: { revision: 1 } }]);
  await saveDoc(KEY_ITEMS, "[]", f);
  assert.equal(f.calls[0].body.revision, 0);
});

// -- Performance rows ----------------------------------------------------------

test("rows are keyed with the importer's own dedupe key", async () => {
  setup();
  const f = mockFetch([{ body: { total: 1 } }]);
  await savePerfRows([row], f);
  assert.equal(f.calls[0].body.rows[0].rowKey, perfRowKey(row));
});

test("the derived parse is not sent", async () => {
  setup();
  const f = mockFetch([{ body: { total: 1 } }]);
  await savePerfRows([{ ...row, parsed: true, values: { a: 1 }, parseErrors: [] }], f);
  const sent = f.calls[0].body.rows[0];
  for (const field of ["parsed", "values", "parseErrors"]) assert.equal(field in sent, false, field);
});

test("the first chunk replaces and the rest merge", async () => {
  setup();
  const many = Array.from({ length: CHUNK + 5 }, (_, i) => ({ ...row, name: `n${i}` }));
  const f = mockFetch([{ body: { total: many.length } }]);
  await savePerfRows(many, f);

  assert.equal(f.calls.length, 2);
  // Deleting once, at the start, is what makes this a replace. Deleting on every
  // chunk would leave only the last chunk in the table.
  assert.equal(f.calls[0].body.action, "perfReplace");
  assert.equal(f.calls[1].body.action, "perfMerge");
  assert.equal(f.calls[0].body.rows.length, CHUNK);
  assert.equal(f.calls[1].body.rows.length, 5);
});

test("an empty set is still a replace, because emptiness is a real state", async () => {
  setup();
  const f = mockFetch([{ body: { total: 0 } }]);
  await savePerfRows([], f);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.action, "perfReplace");
  assert.deepEqual(f.calls[0].body.rows, []);
});

// -- Failures ------------------------------------------------------------------

test("a 409 rejects as a conflict carrying the server's copy", async () => {
  setup();
  const f = mockFetch([{ status: 409, body: { error: "changed", current: { value: [], revision: 9 } } }]);
  await assert.rejects(() => saveDoc(KEY_ITEMS, "[]", f), err => {
    assert.equal(err.conflict, true);
    assert.equal(err.current.revision, 9);
    return true;
  });
});

test("a 401 rejects as signed out rather than as a generic failure", async () => {
  setup();
  const f = mockFetch([{ status: 401, body: { error: "Sign in" } }]);
  await assert.rejects(() => saveDoc(KEY_ITEMS, "[]", f), err => err.signedOut === true);
});

test("no token at all is signed out, and costs no request", async () => {
  setup();
  _setTokenSource(async () => null);
  const f = mockFetch([{ body: {} }]);
  await assert.rejects(() => saveDoc(KEY_ITEMS, "[]", f), err => err.signedOut === true);
  assert.equal(f.calls.length, 0);
});

// -- First sync ----------------------------------------------------------------

test("uploading a browser workspace into an empty remote one writes every doc", async () => {
  setup();
  const f = mockFetch([
    { body: { workspace: { id: "w1" }, docs: {}, perfRows: [] } },  // the emptiness check
    { body: { revision: 1 } },                                      // every write after
  ]);
  const result = await uploadInitial({ [KEY_ITEMS]: "[]" }, [row], f);
  assert.equal(result.uploaded, true);
  assert.equal(f.calls[1].body.action, "saveDoc");
  assert.ok(f.calls.some(c => c.body.action === "perfReplace"));
});

test("a remote workspace that already has data is never merged into", async () => {
  setup();
  // Merging two divergent copies of a portfolio needs a person to say which is
  // right, and the wrong answer loses a quarter of experiment history.
  const f = mockFetch([{ body: { workspace: { id: "w1" }, docs: { [KEY_ITEMS]: { value: [{ id: "x" }], revision: 3 } }, perfRows: [] } }]);
  const result = await uploadInitial({ [KEY_ITEMS]: "[]" }, [], f);
  assert.equal(result.uploaded, false);
  assert.equal(result.reason, "remote-not-empty");
  assert.equal(f.calls.length, 1);
});

// -- Store routing -------------------------------------------------------------

test("workspace keys go to the backend and device keys stay in the browser", async () => {
  setup();
  const wrote = [];
  attachRemote({
    perfKey: PERF_KEY,
    saveDoc: async (k, v) => wrote.push(["doc", k, v]),
    savePerfRows: async (rows) => wrote.push(["perf", rows.length]),
  }, { [KEY_ITEMS]: JSON.stringify([{ id: "seeded" }]) });

  assert.deepEqual(JSON.parse((await store.get(KEY_ITEMS)).value), [{ id: "seeded" }]);

  await store.set(KEY_ITEMS, "[]");
  await store.set(PERF_KEY, JSON.stringify([row, row]));
  await store.set(KEY_THEME, "dark");

  assert.deepEqual(wrote, [["doc", KEY_ITEMS, "[]"], ["perf", 2]]);
  // Theme never left the browser: syncing it would change a colleague's theme.
  assert.ok(DEVICE_KEYS.has(KEY_THEME));
  detachRemote();
});

test("a conflict reaches the operator as a reload instruction, not a retry", async () => {
  setup();
  let reported = null;
  onWriteError(e => { reported = e; });
  attachRemote({
    perfKey: PERF_KEY,
    saveDoc: async () => { const e = new Error("conflict"); e.conflict = true; throw e; },
    savePerfRows: async () => {},
  }, {});

  const result = await store.set(KEY_ITEMS, "[]");
  assert.equal(result.ok, false);
  assert.equal(result.durable, false);
  assert.match(result.message, /Reload/);
  assert.match(reported.message, /saved this workspace while you were working/);
  onWriteError(null);
  detachRemote();
});

test("an unreachable store is reported as a write that did not land", async () => {
  setup();
  attachRemote({
    perfKey: PERF_KEY,
    saveDoc: async () => { throw new Error("network down"); },
    savePerfRows: async () => {},
  }, {});
  const result = await store.set(KEY_ITEMS, "[]");
  assert.equal(result.ok, false);
  assert.match(result.message, /Download a backup/);
  detachRemote();
});
