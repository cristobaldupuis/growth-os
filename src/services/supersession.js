// -- Supersession: a learning that can be retracted (ROADMAP 5.8) --------------
//
// ## What was missing
//
// A closed initiative's learning is `results.keyLearning`, a string. The record
// around it is already better than a note — `provenance` separates a tracked
// result from a backfilled one and is derived from the prediction snapshot
// rather than typed, `durability` separates structural from tactical, and
// prediction error is computed against the frozen snapshot. What the model had
// no way to express is **one experiment contradicting another**.
//
// That is not cosmetic. `buildLearningsIndex` feeds the creative brief
// generator, Signal AI's portfolio tools and learning synthesis, and all three
// rank and cite what they are shown. So a belief that stopped being true in
// March kept being cited in June — with an experiment id attached, which makes
// it *more* persuasive than an unsourced claim, not less. "Three experiments
// support this" was computed only from the experiments that supported it; the
// one that broke it, if it ran, was a separate row saying something else.
//
// A knowledge base that can only accumulate is not neutral about being wrong.
// It is confidently wrong, at increasing volume, in a brief that a person then
// spends money against.
//
// ## The three edges, and why there are three rather than two
//
// The roadmap asks for `supersedes` / `supersededBy` plus `contradicts`. This
// module stores `supersedes`, `contradicts` and `confirms`, and derives every
// reverse edge. Two deliberate departures, both worth stating.
//
// **Only the forward edge is stored.** `supersededBy` is computed by inverting
// `supersedes` rather than written to both records. Storing both directions
// means two places that can disagree, and a pair of rows that disagree about
// whether one retracts the other is a worse state than either answer. One
// writer, one direction, everything else derived.
//
// **`confirms` exists because confidence has to come from somewhere.** The
// roadmap requires confidence "computed from the supporting and contradicting
// closed initiatives" — and named no edge that could mark a supporter. The
// alternative was to infer support from category and outcome, which asserts
// that two Successes in Retention are about the same belief; they routinely are
// not, and a confidence number built on that inference is the hand-set field
// this item exists to remove, laundered through arithmetic. `confirms` is the
// same act as `contradicts` — a person saying these two results are about one
// belief — pointed the agreeing way, and it is the only thing a person knows
// that the join cannot derive.
//
// This is the line the roadmap draws under "what not to build", and it holds:
// no hand-entered conditions, mechanism, freshness or applicability. The
// conditions a result held under are already on the parsed name, deriving them
// from the join is free and stays true, and asking a marketer to re-type them
// produces a second set of conditions that disagrees with the first.
//
// ## Identity
//
// Edges are stored as `initId` — the same identity the citation system prints
// and CSV export keys on — and not the internal `id`. An `id` is regenerated
// when a record lands in a fresh workspace through CSV import, which would turn
// every edge into a dangling reference on exactly the operation the calibration
// record is supposed to survive. `learningRef` falls back to `id` for the
// records old enough not to have an `initId`, matching what
// `buildLearningsIndex` already publishes.
//
// Unresolvable refs are dropped rather than reported. An edge to a record that
// is not in this workspace is not evidence of anything, and a partial import
// should degrade to fewer edges, never to a crash in the brief generator.

/** The identity an edge points at. Matches `buildLearningsIndex`'s `initId`. */
export const learningRef = (item) => (item && (item.initId || item.id)) || null;

export const EDGE_KINDS = ["supersedes", "contradicts", "confirms"];

/**
 * Provenance weight. `tracked` ran through the system with a frozen launch
 * prediction, so prediction-vs-actual is real; `backfilled` was imported as
 * history and its actual is a remembered estimate. The existing index already
 * calls the second lower-confidence — this is that judgement given a number, so
 * that two remembered results do not outvote one measured one.
 */
export const PROVENANCE_WEIGHT = { tracked: 1, backfilled: 0.5 };

export const provenanceOf = (item) => (item && item.predictionSnapshot) ? "tracked" : "backfilled";

/** A closed initiative carrying a learning — the only thing an edge can mean. */
export const isClosedLearning = (item) =>
  !!item &&
  (item.status === "Completed" || item.status === "Killed") &&
  !!item.results &&
  !!item.results.keyLearning;

/** Normalised edge lists off an initiative's results. Never null, never shared. */
export function edgesOf(item) {
  const r = (item && item.results) || {};
  const clean = (v) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === "string" && x.trim()))].map(s => s.trim()) : [];
  return {
    supersedes:  clean(r.supersedes),
    contradicts: clean(r.contradicts),
    confirms:    clean(r.confirms),
  };
}

/**
 * The resolved relation graph over closed learnings.
 *
 * Every edge is validated on the way in: both ends must be closed initiatives
 * carrying a learning, and an edge to itself is dropped. A draft cannot retract
 * anything — it has no result to retract with — so an edge pointing at one is
 * not a weaker claim, it is not a claim.
 *
 * Returns a Map keyed by ref. Each node carries both directions of all three
 * relations, so callers never walk the item list again.
 */
export function buildSupersessionGraph(items) {
  const nodes = new Map();
  (items || []).forEach(item => {
    if (!isClosedLearning(item)) return;
    const ref = learningRef(item);
    if (!ref || nodes.has(ref)) return;
    nodes.set(ref, {
      ref, item,
      provenance: provenanceOf(item),
      weight: PROVENANCE_WEIGHT[provenanceOf(item)],
      supersedes: [], supersededBy: [],
      contradicts: [], contradictedBy: [],
      confirms: [], confirmedBy: [],
    });
  });

  const push = (arr, v) => { if (!arr.includes(v)) arr.push(v); };

  nodes.forEach(node => {
    const e = edgesOf(node.item);
    EDGE_KINDS.forEach(kind => {
      e[kind].forEach(target => {
        if (target === node.ref) return;          // self-edge
        const to = nodes.get(target);
        if (!to) return;                          // unresolvable, or not a closed learning
        push(node[kind], target);
        if (kind === "supersedes")  push(to.supersededBy, node.ref);
        if (kind === "contradicts") push(to.contradictedBy, node.ref);
        if (kind === "confirms")    push(to.confirmedBy, node.ref);
      });
    });
  });

  return nodes;
}

/** True once anything live retracts this node. */
const isRetracted = (node, nodes) =>
  node.supersededBy.some(ref => nodes.has(ref));

/**
 * Confidence, derived and never typed.
 *
 * A hand-set confidence field is a number that was true once, which is the
 * failure this whole item exists to fix — so this reads the graph and the
 * provenance and nothing else.
 *
 * Levels rather than a percentage. Two experiments and one contradiction do not
 * produce 67% of anything, and printing a number that precise next to a belief
 * invites it to be treated as a measurement. Five states, in the order a reader
 * should care about them:
 *
 *   retracted   — something supersedes this. It leaves the citation index.
 *   contested   — a live contradiction stands against it, unresolved.
 *   established — three or more units of tracked-equivalent evidence agree.
 *   supported   — two or more.
 *   provisional — one experiment, or a pair of remembered ones. The default,
 *                 and the honest reading of a single result.
 *
 * `contested` outranks any amount of support on purpose. Averaging a
 * contradiction away is precisely how the confidently-wrong failure happens:
 * the disagreement is the finding, and a reader who sees "established" on a
 * belief another experiment broke has been told the opposite of what the record
 * says. Resolving it means someone deciding which result superseded which,
 * which is a person's call and stays one.
 *
 * Retracted evidence props nothing up: a superseded supporter is skipped when
 * summing, so a belief cannot stay `established` on the strength of two results
 * that were themselves retracted last quarter.
 */
export function confidenceOf(ref, nodes) {
  const node = nodes.get(ref);
  if (!node) return null;

  const live = (r) => { const n = nodes.get(r); return n && !isRetracted(n, nodes) ? n : null; };

  const superseders = node.supersededBy.filter(r => nodes.has(r));

  // Symmetric: asserting two results are about one belief is a claim about the
  // pair, so it counts in both directions regardless of who wrote the edge.
  const supporters = [...new Set([...node.confirms, ...node.confirmedBy])]
    .map(live).filter(Boolean);
  const contradictors = [...new Set([...node.contradicts, ...node.contradictedBy])]
    .map(live).filter(Boolean);

  // The learning is evidence for itself — one experiment, weighted by how it
  // was recorded.
  const support = node.weight + supporters.reduce((s, n) => s + n.weight, 0);
  const counter = contradictors.reduce((s, n) => s + n.weight, 0);

  let level;
  if (superseders.length > 0)      level = "retracted";
  else if (contradictors.length>0) level = "contested";
  else if (support >= 3)           level = "established";
  else if (support >= 2)           level = "supported";
  else                             level = "provisional";

  return {
    level,
    support: Math.round(support * 100) / 100,
    counter: Math.round(counter * 100) / 100,
    provenance: node.provenance,
    superseders,
    supporters:    supporters.map(n => n.ref),
    contradictors: contradictors.map(n => n.ref),
  };
}

export const CONFIDENCE_LEVELS = ["retracted", "contested", "provisional", "supported", "established"];

/** Human-facing gloss. One sentence, no hedging, no number. */
export const CONFIDENCE_NOTE = {
  retracted:   "Retracted by a later experiment. Kept on the record, withheld from citation.",
  contested:   "Another closed experiment disagrees with this and neither has been retracted.",
  provisional: "One experiment. Nothing has replicated or challenged it yet.",
  supported:   "Replicated by at least one other closed experiment.",
  established: "Replicated across enough closed experiments to argue from.",
};

/**
 * Every open contradiction in the record, as pairs.
 *
 * Two live learnings that disagree is a finding, and the highest-value thing a
 * learning agenda question can be pointed at — so it is surfaced rather than
 * silently absorbed into a confidence figure. Pairs are emitted once, ordered
 * by ref so the same disagreement does not appear twice facing opposite ways.
 * A pair where either side has been retracted is resolved, not open.
 */
export function openContradictions(items) {
  const nodes = buildSupersessionGraph(items);
  const seen = new Set();
  const out = [];
  nodes.forEach(node => {
    if (isRetracted(node, nodes)) return;
    [...new Set([...node.contradicts, ...node.contradictedBy])].forEach(otherRef => {
      const other = nodes.get(otherRef);
      if (!other || isRetracted(other, nodes)) return;
      const key = [node.ref, otherRef].sort().join("::");
      if (seen.has(key)) return;
      seen.add(key);
      const [a, b] = [node, other].sort((x, y) => x.ref.localeCompare(y.ref));
      out.push({
        key,
        a: { ref: a.ref, id: a.item.id, title: a.item.title, learning: a.item.results.keyLearning,
             category: a.item.category, provenance: a.provenance,
             closedDate: a.item.endDate || a.item.createdAt || null },
        b: { ref: b.ref, id: b.item.id, title: b.item.title, learning: b.item.results.keyLearning,
             category: b.item.category, provenance: b.provenance,
             closedDate: b.item.endDate || b.item.createdAt || null },
      });
    });
  });
  return out.sort((x, y) => x.key.localeCompare(y.key));
}

/**
 * The refs withheld from citation, and what retracted each.
 *
 * A superseded learning leaves the index rather than the record — the
 * initiative and its result stay exactly where they are. Deleting it would lose
 * the calibration signal that the team believed it, which is evidence about the
 * business in its own right.
 */
export function supersededRefs(items) {
  const nodes = buildSupersessionGraph(items);
  const out = new Map();
  nodes.forEach(node => {
    const by = node.supersededBy.filter(r => nodes.has(r));
    if (by.length > 0) out.set(node.ref, by);
  });
  return out;
}

/**
 * Set the edges on a result, from the close flow.
 *
 * Takes `{ ref: kind }` — one relation per target, because a result cannot both
 * retract and confirm the same earlier one. Returns the three arrays to merge
 * into `results`, always all three, so clearing the last edge of a kind writes
 * an empty array rather than leaving the previous value in place.
 */
export function edgesFromSelection(selection) {
  const out = { supersedes: [], contradicts: [], confirms: [] };
  Object.entries(selection || {}).forEach(([ref, kind]) => {
    if (!ref || !EDGE_KINDS.includes(kind)) return;
    if (!out[kind].includes(ref)) out[kind].push(ref);
  });
  return out;
}

/** The inverse, for re-opening the picker on an already-closed initiative. */
export function selectionFromEdges(item) {
  const e = edgesOf(item);
  const sel = {};
  EDGE_KINDS.forEach(kind => e[kind].forEach(ref => { sel[ref] = kind; }));
  return sel;
}
