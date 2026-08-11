// -- What the brief is allowed to reason from ------------------------------------
//
// Two kinds of evidence go into a creative brief, and until now only one of them
// did.
//
//   CLOSED LEARNINGS — what the team wrote down when an initiative ended. Already
//   supplied, but selected by `learningsIndex.slice(0, 25)`: the first 25 of an
//   unranked array, with nothing in the output saying the other 26 existed. A
//   product that counts unparsed rows in every breakdown rather than dropping
//   them should not drop learnings quietly.
//
//   MEASURED PERFORMANCE — the per-dimension ROAS the Breakdown view already
//   computes from imported ad names. This was never passed to the brief at all,
//   which meant the app could know that `TimeSaver` returned 2.1x across four
//   initiatives and `MacroMath` returned 0.8x, and would then brief the next
//   round of creative without mentioning it.
//
// The second is the one that makes the brief hard to copy. A competitor with a
// learnings library can write "we remember what you learned"; measured return per
// creative angle requires the naming convention, the parser, and the join.
//
// ## Why this is a selection rule and not retrieval
//
// The obvious alternative is to embed the learnings and retrieve the k most
// similar. That fails in a specific way here: a "gap" in this product is defined
// by a learning being ABSENT at one retailer, and similarity search cannot see an
// absence. A deterministic, stated rule can be wrong; it cannot be silently
// wrong, because it reports what it excluded.

import { breakdownByDimension } from "./naming.js";
import { deriveRatios } from "./performance.js";

/** Dimensions a creative brief can actually act on. Deliberately not every
 *  dimension the schema carries: a brief cannot choose `channel` or `handle`,
 *  and offering them invites the model to "recommend" something that is not a
 *  creative decision. */
export const EVIDENCE_DIMENSIONS = ["angle", "theme", "format", "category"];

// The floor below which a ratio is reported but not to be reasoned from. A group
// holding one row and $180 of spend can show a 4.8x that means nothing, and a
// model given it without a marker will cite it as proof. Both thresholds have to
// clear, because they fail differently: many rows at trivial spend is a rounding
// artefact, and one row at large spend is a single ad's luck.
export const THIN_SPEND_USD = 500;
export const THIN_ROWS = 3;

/** Groups reported per dimension. Enough to show a spread, few enough that the
 *  block stays readable next to the brand brief and the learnings. */
export const MAX_GROUPS_PER_DIM = 6;

/**
 * Roll imported performance rows up along every creative-controllable dimension.
 *
 * Ratios come from `deriveRatios` over each group's summed numerator and
 * denominator — never averaged across rows, which would give a $12 ad set the
 * same weight as a $12,000 one. Same discipline as the Breakdown view, because
 * it is the same computation; this module decides what to *show the model*, not
 * how to compute it.
 */
export function buildCreativeEvidence(perfRows, schema, opts = {}) {
  const rows = perfRows || [];
  const wanted = opts.dimensions || EVIDENCE_DIMENSIONS;
  const maxGroups = opts.maxGroups || MAX_GROUPS_PER_DIM;

  const dimensions = [];
  (schema?.dimensions || []).forEach(dim => {
    if (!wanted.includes(dim.key)) return;
    const { groups, unparsed, notInTemplate } = breakdownByDimension(rows, dim.key, schema);
    if (!groups.length) return;

    const priced = groups
      .map(g => {
        const r = deriveRatios(g.metrics);
        const spend = g.metrics.spend || 0;
        return {
          value: g.value,
          rows: g.rows,
          spend,
          revenue: g.metrics.revenue || 0,
          conversions: g.metrics.conversions || 0,
          roas: r.roas,
          cpa: r.cpa,
          // Reported, not hidden. A thin group the model can see and is told to
          // discount is safer than one silently removed, because the absence of
          // an angle from the block otherwise reads as "never tested".
          thin: spend < THIN_SPEND_USD || g.rows < THIN_ROWS,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    dimensions.push({
      key: dim.key,
      label: dim.label || dim.key,
      groups: priced.slice(0, maxGroups),
      omitted: Math.max(0, priced.length - maxGroups),
      unparsed, notInTemplate,
    });
  });

  const totalSpend = rows.reduce((a, r) => a + (r.metrics?.spend || 0), 0);
  return { dimensions, totalSpend, rowCount: rows.length, hasEvidence: dimensions.length > 0 };
}

const money = (n) => "$" + Math.round(n || 0).toLocaleString();
const ratio = (n) => (n == null ? "n/a" : (Math.round(n * 100) / 100).toFixed(2) + "x");

/**
 * Render the evidence as prompt text.
 *
 * Kept separate from the computation so the operator can be shown exactly what
 * the model was told, and so the formatting can be asserted in tests without a
 * network round trip — the same split `buildImagePrompt` uses.
 */
export function formatEvidenceBlock(evidence) {
  if (!evidence || !evidence.hasEvidence) {
    return "  (no performance data imported yet — the brief cannot cite measured returns, and should say so in `evidenceGaps`)";
  }
  const lines = [];
  evidence.dimensions.forEach(dim => {
    lines.push(`  ${dim.label} (${dim.key}):`);
    dim.groups.forEach(g => {
      const flag = g.thin ? "  [THIN — below the reporting floor, not evidence]" : "";
      lines.push(
        `    ${g.value}: ${ratio(g.roas)} ROAS on ${money(g.spend)} spend, ` +
        `${g.conversions} conversions across ${g.rows} row${g.rows === 1 ? "" : "s"}${flag}`
      );
    });
    const notes = [];
    if (dim.omitted) notes.push(`${dim.omitted} smaller group${dim.omitted === 1 ? "" : "s"} not shown`);
    if (dim.unparsed) notes.push(`${dim.unparsed} row${dim.unparsed === 1 ? "" : "s"} whose name did not parse`);
    if (dim.notInTemplate) notes.push(`${dim.notInTemplate} row${dim.notInTemplate === 1 ? "" : "s"} whose template has no ${dim.label} slot`);
    if (notes.length) lines.push(`    (excluded: ${notes.join("; ")})`);
  });
  return lines.join("\n");
}

// -- Learnings selection ---------------------------------------------------------

/** How many closed learnings a brief is shown. The cap exists because the
 *  corpus grows without bound and the prompt does not; what changes here is that
 *  the cap is applied to a RANKED list and the remainder is reported. */
export const LEARNINGS_LIMIT = 25;

export const LEARNINGS_RULE =
  "same brand first, then same category, then most recently closed";

/**
 * Choose which closed learnings the brief reasons from, and say what was left out.
 *
 * The ranking is deliberately boring and deterministic: an initiative's own
 * brand is the most likely source of a transferable result, its own category
 * next, and recency last as the tie-break. Nothing here is clever — the value is
 * that it is stated, reproducible, and reports its own remainder, so a brief
 * that missed a relevant learning can be diagnosed rather than guessed at.
 *
 * Returns `{shown, excluded, total, rule}`. `excluded` is a count, not the
 * records: the caller needs to be able to say "26 of 51 learnings were not
 * shown", not to render them.
 */
export function selectLearnings(learningsIndex, initiative, opts = {}) {
  const limit = opts.limit || LEARNINGS_LIMIT;
  const all = learningsIndex || [];
  const brandId = initiative?.brandId || "default";
  const category = initiative?.category || null;

  const rank = (l) => {
    // Lower sorts first.
    if ((l.brandId || "default") === brandId && category && l.category === category) return 0;
    if ((l.brandId || "default") === brandId) return 1;
    if (category && l.category === category) return 2;
    return 3;
  };

  const sorted = [...all].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return String(b.closedDate || "").localeCompare(String(a.closedDate || ""));
  });

  return {
    shown: sorted.slice(0, limit),
    excluded: Math.max(0, sorted.length - limit),
    total: sorted.length,
    rule: LEARNINGS_RULE,
  };
}
