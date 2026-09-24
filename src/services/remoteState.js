// src/services/remoteState.js — the store's remote backend. ROADMAP Phase 2.0.
//
// Speaks to api/state.js on behalf of `store.js`, which keeps its existing
// `get`/`set` shape. Everything specific to talking over a network — the access
// token, document revisions, chunking a large import — lives here so that the
// rest of the app keeps treating persistence as a key and a JSON string.
//
// ## Revisions are held here, not by the caller
//
// api/state.js refuses a write whose revision has moved (see bump_workspace_doc),
// which is what stops two people in the same workspace silently overwriting each
// other. The app should not have to thread a revision through every `saveItems`
// call to get that, so the revision map is loaded with the workspace and bumped
// on each successful write. A caller only ever sees the refusal.
//
// ## Why performance rows go a different way
//
// They are rows in a table rather than a document, so a save is an upsert keyed
// on `perfRowKey` — the same identity `mergePerformanceRows` dedupes with, which
// is what makes re-importing an overlapping export replace rather than duplicate.
// They are also the one collection large enough to need chunking.

import { perfRowKey } from "./performance.js";
import { accessToken } from "./auth.js";
import { KEY_PERF } from "./store.js";
import { MERGEABLE_KEYS, mergeDoc } from "./docMerge.js";

/**
 * The one key that lives in the rows table rather than as a document.
 *
 * Re-exported from `store.js` rather than written out again: two string literals
 * for the same key drift, and the failure mode is that performance rows quietly
 * start being saved as a document — reintroducing the whole-blob write this phase
 * exists to remove.
 */
export const PERF_KEY = KEY_PERF;

// Matches MAX_ROWS in api/state.js. Kept as a separate constant rather than
// fetched, because a client that guesses high fails a whole chunk on a 413 and a
// client that guesses low only makes more requests.
export const CHUNK = 2000;

let revisions = new Map();   // doc key → revision last seen from the server
// doc key → the parsed value the server held at that revision. The common
// ancestor for a three-way merge (see docMerge.js): without it, "the remote
// has an item this tab lacks" cannot be told apart from "this tab deleted it".
let bases = new Map();
let workspace = null;

// Attempts at a save that keeps losing the race. Each retry re-merges against
// the newest copy, so three only runs out under sustained concurrent writing.
const SAVE_ATTEMPTS = 3;

// Indirected so a test can supply a token without a browser session. Production
// never replaces it; `accessToken` is the only real source.
let tokenSource = accessToken;

export const currentWorkspace = () => workspace;

/** Test seams. */
export function _reset() { revisions = new Map(); bases = new Map(); workspace = null; tokenSource = accessToken; }
export function _setTokenSource(fn) { tokenSource = fn; }
export const _revisionOf = (key) => revisions.get(key);

/** The value the server held at the revision this client last saw. */
export const baseOf = (key) => bases.get(key);

async function call(body, fetchImpl = fetch) {
  const token = await tokenSource(fetchImpl);
  if (!token) {
    const err = new Error("Signed out.");
    err.signedOut = true;
    throw err;
  }
  // Every call after the load names the workspace it is for. Without it, an
  // account seated in more than one workspace is ambiguous to api/state.js on
  // every save, and each one is refused with a 400.
  const scoped = workspace?.id && body.workspace === undefined ? { ...body, workspace: workspace.id } : body;
  const res = await fetchImpl("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(scoped),
  });
  const parsed = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const err = new Error(parsed.error || "Signed out.");
    err.signedOut = true;
    throw err;
  }
  if (res.status === 409) {
    const err = new Error(parsed.error || "Changed elsewhere.");
    err.conflict = true;
    err.current = parsed.current || null;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(parsed.error || `The workspace store returned ${res.status}.`);
    err.status = res.status;
    err.choices = parsed.choices || null;
    err.readOnly = !!parsed.readOnly;
    throw err;
  }
  return parsed;
}

/**
 * Load the whole workspace in one request.
 *
 * Returns `{ workspace, docs, perfRows }` where `docs` maps a store key to its
 * JSON STRING — the shape `store.get` already returns — so App.jsx's load effect
 * does not have to care which backend answered.
 */
export async function loadWorkspace(name = null, fetchImpl = fetch) {
  // Explicit `workspace` (possibly null) so a reload never inherits the one
  // this module happened to have open before.
  workspace = null;
  const body = await call({ action: "load", workspace: name || undefined }, fetchImpl);
  workspace = body.workspace || null;
  revisions = new Map();
  bases = new Map();

  const docs = {};
  for (const [key, entry] of Object.entries(body.docs || {})) {
    revisions.set(key, entry.revision);
    bases.set(key, entry.value);
    // Stringified here because the store's contract is a string and every caller
    // in App.jsx parses one. Converting at the boundary keeps that true rather
    // than making half the app handle two shapes.
    docs[key] = JSON.stringify(entry.value);
  }

  return { workspace, workspaces: body.workspaces || [], docs, perfRows: body.perfRows || [] };
}

/**
 * Write one document. Resolves to `{ ok, revision, merged, conflicts }`.
 *
 * When someone else saved first, a record-list document (see MERGEABLE_KEYS)
 * is merged three ways against their copy and the save retried. `merged` is
 * then the JSON string actually stored — the caller MUST adopt it, or its next
 * save would write the other person's records back out — and `conflicts` lists
 * record ids settled by a tie-break. `merged` is null when nothing was merged.
 *
 * Any other conflict still rejects, because the caller has to do something
 * about it — reload — and a return value is easier to ignore than a throw.
 * `revision: 0` on a key never seen means "create".
 */
export async function saveDoc(key, jsonString, fetchImpl = fetch) {
  let value = JSON.parse(jsonString);
  let mergedAny = false;
  const conflicts = [];
  let lastErr = null;

  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    try {
      const body = await call({
        action: "saveDoc",
        key,
        value,
        revision: revisions.get(key) ?? 0,
      }, fetchImpl);
      revisions.set(key, body.revision);
      bases.set(key, value);
      return { ok: true, revision: body.revision, merged: mergedAny ? JSON.stringify(value) : null, conflicts };
    } catch (err) {
      if (!err.conflict || !MERGEABLE_KEYS.has(key) || !err.current) throw err;
      const result = mergeDoc(key, bases.get(key), value, err.current.value);
      if (!result) throw err;
      revisions.set(key, err.current.revision);
      bases.set(key, err.current.value);
      value = result.value;
      conflicts.push(...result.conflicts.filter(id => !conflicts.includes(id)));
      mergedAny = true;
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * The documents someone else has changed since this client last saw them, as
 * `{ key: { value, revision } }`. Does NOT advance the revision or base — the
 * caller decides whether it can take each one (see `acceptRemote`), because
 * taking a revision without taking its value is how a save would overwrite it.
 */
export async function pullChanges(fetchImpl = fetch) {
  const body = await call({ action: "docs", since: Object.fromEntries(revisions) }, fetchImpl);
  return body.docs || {};
}

/** The open workspace's members: `{ members, canManage, you }`. */
export const listMembers = (fetchImpl = fetch) => call({ action: "members" }, fetchImpl);
export const addMember = (email, role, fetchImpl = fetch) => call({ action: "memberAdd", email, role }, fetchImpl);
export const setMemberRole = (userId, role, fetchImpl = fetch) => call({ action: "memberRole", userId, role }, fetchImpl);
export const removeMember = (userId, fetchImpl = fetch) => call({ action: "memberRemove", userId }, fetchImpl);

/** Record that this client now holds `value` at `revision` for `key`. */
export function acceptRemote(key, value, revision) {
  revisions.set(key, revision);
  bases.set(key, value);
}

/**
 * Write the whole performance set.
 *
 * The caller has already merged in memory (`mergePerformanceRows`), so this is a
 * replace — done as stage-then-commit (see handlePerfStage in api/state.js).
 * Every chunk is upserted under one batch the server issues on the first chunk,
 * and only the final `perfCommit` deletes the rows the batch did not rewrite.
 * A chunk that fails leaves the old rows in place alongside whatever new ones
 * landed, so a failed save can no longer shrink the table; the failure still
 * propagates, and `store.set` still reports `durable:false`.
 *
 * Sending nothing is still a replace — stage nothing, commit, and the table is
 * empty — because "the set is now empty" is a real state: it is what Reset Demo
 * produces.
 */
export async function savePerfRows(rows, fetchImpl = fetch) {
  const all = (rows || []).map(r => ({
    rowKey: perfRowKey(r),
    name: r.name,
    level: r.level,
    channel: r.channel,
    date: r.date,
    campaignName: r.campaignName,
    adsetName: r.adsetName,
    metrics: r.metrics,
  }));

  const chunks = [];
  for (let i = 0; i < all.length; i += CHUNK) chunks.push(all.slice(i, i + CHUNK));
  if (!chunks.length) chunks.push([]);

  let batch = null;
  for (const chunk of chunks) {
    const body = await call({ action: "perfStage", rows: chunk, ...(batch ? { batch } : {}) }, fetchImpl);
    batch = body.batch;
  }
  const done = await call({ action: "perfCommit", batch }, fetchImpl);
  return { ok: true, total: done.total ?? null };
}

/**
 * Upload a browser workspace into an empty remote one, once.
 *
 * The migration path for an operator who has been running on `localStorage` and
 * has just signed in. Refuses when the remote workspace already holds documents,
 * because "merge two divergent copies of a portfolio" is not a thing this can do
 * correctly without asking a person which one is right — and the wrong answer
 * loses a quarter of experiment history.
 */
export async function uploadInitial(localDocs, localPerfRows, fetchImpl = fetch) {
  const existing = await loadWorkspace(null, fetchImpl);
  const hasRemote = Object.keys(existing.docs).length > 0 || existing.perfRows.length > 0;
  if (hasRemote) return { uploaded: false, reason: "remote-not-empty", remote: existing };

  for (const [key, jsonString] of Object.entries(localDocs)) {
    if (jsonString) await saveDoc(key, jsonString, fetchImpl);
  }
  if (localPerfRows && localPerfRows.length) await savePerfRows(localPerfRows, fetchImpl);

  return { uploaded: true, docs: Object.keys(localDocs).length, perfRows: (localPerfRows || []).length };
}
