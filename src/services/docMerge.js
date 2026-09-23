// src/services/docMerge.js — reconcile two edits of the same workspace document.
//
// ## Why this exists
//
// api/state.js refuses a save whose revision has moved (a 409), which is what
// stops two writers silently overwriting each other. Before this module the
// app's only answer to that refusal was "reload", which throws away whatever
// the person in front of the screen had just done. That was tolerable while the
// only other writer was a colleague in another tab. It is not once the MCP
// connector exists: Claude can add an initiative while this tab is open, and
// every save the operator makes after that would be refused until they reload.
//
// ## What it merges, and what it refuses to
//
// Only documents that are arrays of records with a stable `id` — initiatives and
// learning-agenda items. For those, "what changed" has a precise answer per
// record, so two people editing DIFFERENT records never conflict at all, which
// is the overwhelmingly common case (Claude adds one; the operator edits
// another).
//
// Everything else (settings, debates, the spend ledger) returns null and the
// caller keeps the old "reload" behaviour. Guessing how to merge a settings
// object would be inventing a policy nobody chose.
//
// ## The rules, per record id
//
//   changed on one side only        → that side's version
//   changed identically on both     → that version
//   changed differently on both     → the newer `updatedAt` (local on a tie or
//                                     when either lacks one), reported as a conflict
//   deleted on one side, untouched  → deleted
//   deleted on one side, edited on  → the edit survives, reported as a conflict:
//     the other                       losing someone's work silently is worse
//                                     than a record coming back
//   new on either side              → kept
//
// Order follows the local list, with records only the remote has appended in
// the remote's order — the person looking at the screen keeps the order they see.

import { deepEqual } from "./items.js";

/** Document keys whose value is an array of `{ id, ... }` records. */
export const MERGEABLE_KEYS = new Set(["gos_items_v4", "gos_agenda_v1"]);

const isRecordList = (v) =>
  Array.isArray(v) && v.every(r => r && typeof r === "object" && !Array.isArray(r) && r.id != null);

const byId = (list) => new Map(list.map(r => [String(r.id), r]));

function newer(local, remote) {
  const l = Date.parse(local?.updatedAt || "");
  const r = Date.parse(remote?.updatedAt || "");
  if (Number.isFinite(l) && Number.isFinite(r) && r > l) return remote;
  return local;
}

/**
 * Three-way merge of record lists. Returns `{ value, conflicts }` where
 * `conflicts` lists the ids decided by a tie-break rather than cleanly, or null
 * when any input is not a list of id'd records (the caller must not merge).
 *
 * `base` is the copy both sides started from — the last value this client saw
 * the server hold. A missing base (the document did not exist) is an empty list.
 */
export function mergeRecordLists(base, local, remote) {
  const b = base == null ? [] : base;
  if (!isRecordList(b) || !isRecordList(local) || !isRecordList(remote)) return null;

  const B = byId(b), L = byId(local), R = byId(remote);
  const conflicts = [];
  const decided = new Map();   // id → record, or null for deleted

  for (const id of new Set([...B.keys(), ...L.keys(), ...R.keys()])) {
    const bv = B.get(id), lv = L.get(id), rv = R.get(id);
    const lChanged = !deepEqual(lv, bv);
    const rChanged = !deepEqual(rv, bv);

    if (!lChanged) { decided.set(id, rv ?? null); continue; }
    if (!rChanged) { decided.set(id, lv ?? null); continue; }
    if (deepEqual(lv, rv)) { decided.set(id, lv ?? null); continue; }

    // Both sides changed this record, differently.
    if (lv === undefined) { decided.set(id, rv); conflicts.push(id); continue; }  // local delete vs remote edit
    if (rv === undefined) { decided.set(id, lv); conflicts.push(id); continue; }  // remote delete vs local edit
    decided.set(id, newer(lv, rv));
    conflicts.push(id);
  }

  const value = [];
  const placed = new Set();
  for (const r of local) {
    const id = String(r.id);
    const v = decided.get(id);
    if (v) value.push(v);
    placed.add(id);
  }
  for (const r of remote) {
    const id = String(r.id);
    if (placed.has(id)) continue;
    const v = decided.get(id);
    if (v) value.push(v);
    placed.add(id);
  }
  return { value, conflicts };
}
