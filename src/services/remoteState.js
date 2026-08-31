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

/** Keys that live in the rows table rather than as a document. */
export const PERF_KEY = "gos_perf_v1";

// Matches MAX_ROWS in api/state.js. Kept as a separate constant rather than
// fetched, because a client that guesses high fails a whole chunk on a 413 and a
// client that guesses low only makes more requests.
export const CHUNK = 2000;

let revisions = new Map();   // doc key → revision last seen from the server
let workspace = null;

// Indirected so a test can supply a token without a browser session. Production
// never replaces it; `accessToken` is the only real source.
let tokenSource = accessToken;

export const currentWorkspace = () => workspace;

/** Test seams. */
export function _reset() { revisions = new Map(); workspace = null; tokenSource = accessToken; }
export function _setTokenSource(fn) { tokenSource = fn; }
export const _revisionOf = (key) => revisions.get(key);

async function call(body, fetchImpl = fetch) {
  const token = await tokenSource(fetchImpl);
  if (!token) {
    const err = new Error("Signed out.");
    err.signedOut = true;
    throw err;
  }
  const res = await fetchImpl("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
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
  const body = await call({ action: "load", ...(name ? { workspace: name } : {}) }, fetchImpl);
  workspace = body.workspace || null;
  revisions = new Map();

  const docs = {};
  for (const [key, entry] of Object.entries(body.docs || {})) {
    revisions.set(key, entry.revision);
    // Stringified here because the store's contract is a string and every caller
    // in App.jsx parses one. Converting at the boundary keeps that true rather
    // than making half the app handle two shapes.
    docs[key] = JSON.stringify(entry.value);
  }

  return { workspace, docs, perfRows: body.perfRows || [] };
}

/**
 * Write one document. Resolves to `{ ok, revision }`.
 *
 * A conflict rejects rather than resolving falsy, because the caller has to do
 * something about it — reload — and a return value is easier to ignore than a
 * throw. `revision: 0` on a key never seen means "create".
 */
export async function saveDoc(key, jsonString, fetchImpl = fetch) {
  const value = JSON.parse(jsonString);
  const body = await call({
    action: "saveDoc",
    key,
    value,
    revision: revisions.get(key) ?? 0,
  }, fetchImpl);
  revisions.set(key, body.revision);
  return { ok: true, revision: body.revision };
}

/**
 * Write the whole performance set.
 *
 * The caller has already merged in memory (`mergePerformanceRows`), so this is a
 * replace: the first chunk clears the table, the rest merge onto it.
 *
 * **The honest hazard.** If a later chunk fails, the table holds fewer rows than
 * it did before — the delete has happened and part of the insert has not. It is
 * not silent: the failure propagates, `store.set` reports `durable:false`, and
 * the existing banner tells the operator to download a backup, with the full set
 * still in memory for this session. A transactional version needs a staging table
 * and belongs with the fact model in Phase 5.4; pretending the window does not
 * exist would be worse than writing it down.
 *
 * Sending nothing is still a replace, because "the set is now empty" is a real
 * state — it is what Reset Demo produces.
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

  let total = 0;
  for (let i = 0; i < chunks.length; i++) {
    const body = await call({
      action: i === 0 ? "perfReplace" : "perfMerge",
      rows: chunks[i],
    }, fetchImpl);
    total = body.total ?? total;
  }
  return { ok: true, total };
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
