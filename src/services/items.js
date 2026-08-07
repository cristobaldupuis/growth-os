// Initiative save-time bookkeeping.
//
// ## Why this exists
//
// `saveItems` used to stamp `updatedAt` with the current time on EVERY item on
// EVERY save:
//
//     const now = new Date().toISOString();
//     const stamped = d.map(item => ({ ...item, updatedAt: now }));
//
// which makes the field mean "when did anyone last press save anywhere", not
// "when did this initiative last change". That is not a cosmetic difference,
// because something reads it: WeeklyStandupModal treats `updatedAt` as the
// activity signal behind its "No update in 7+ days" group. One edit to one
// initiative re-stamped all of them, so that group was empty from the first
// save onward and the standup silently lost the half of its job that finds
// stalled work. The per-card "last update" line had the same problem.
//
// Re-stamping everything also allocated a fresh object per item per save, so
// nothing downstream could ever rely on identity to skip work.

/**
 * Structural equality for plain JSON data.
 *
 * Initiatives round-trip through `JSON.stringify` into browser storage, so they
 * only ever hold JSON-representable values and a recursive walk is sufficient.
 * Comparing serialised strings instead would be shorter and wrong: key order is
 * not guaranteed to survive an edit that spreads an object, so two structurally
 * identical items can serialise differently.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/**
 * Stamp `updatedAt` on the items that actually changed, and leave the rest
 * exactly as they were — same values AND same object identity.
 *
 * An item with no counterpart in `prev` is new, and creation counts as
 * activity: it takes `now` unless it arrived carrying its own stamp, which is
 * how a CSV import or a backup restore keeps the history it came with instead
 * of having today's date written over it.
 *
 * `now` is injectable so a test can assert on the stamp rather than on the
 * clock.
 */
export function stampUpdatedAt(next, prev, now = new Date().toISOString()) {
  const prevById = new Map((prev || []).map(i => [i.id, i]));
  return (next || []).map(item => {
    const before = prevById.get(item.id);
    if (!before) return item.updatedAt ? item : { ...item, updatedAt: now };

    // `updatedAt` is the thing being decided, so it cannot be part of the
    // comparison that decides it.
    const { updatedAt: _nextStamp, ...restNext } = item;
    const { updatedAt: _prevStamp, ...restPrev } = before;
    if (deepEqual(restNext, restPrev)) {
      // Unchanged. Return the PREVIOUS object, not a copy — this is what lets a
      // consumer memoise on identity, and it also carries the old stamp through
      // even when the caller handed us an item that had lost it.
      return before;
    }
    return { ...item, updatedAt: now };
  });
}
