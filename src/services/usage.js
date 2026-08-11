// -- AI spend ledger -------------------------------------------------------------
//
// Every AI call this app makes already returns its own token counts — Anthropic
// sends `usage` natively and api/_adapters.js normalises Gemini's
// `usageMetadata` and OpenAI's `usage` into the same `{input_tokens,
// output_tokens}` shape. Nothing read them. So the admin console could tell you
// which model each feature group was pointed at, and nothing anywhere could tell
// you what that choice had cost.
//
// This module is the ledger. One record per call, priced at the point of use
// from the catalogue's list rates.
//
// ## Why the price is recorded, not just the tokens
//
// Rates change, and a ledger that stores only tokens has to be re-priced against
// whatever the catalogue says today — which silently restates history every time
// a provider changes a number. Storing the computed cost alongside the rate that
// produced it means a row keeps meaning what it meant. Same discipline as the
// initiative prediction snapshot: freeze the inputs to a figure you will later
// be asked to defend.
//
// ## Why `costBasis` exists
//
// Everything here is an ESTIMATE against published list rates. It is not a
// billing export, it does not know about promotional pricing, prompt-cache
// discounts, batch tiers or the free grant on a Vertex project, and it will
// diverge from the provider's invoice. Marking every row `estimate` is what
// stops the console reading as an authoritative bill. A model with no rate in
// the catalogue yields a null cost and increments an `unpriced` count rather
// than contributing zero — an unpriced call is missing information, not a free
// one, and a rollup that treats it as free is wrong in the direction that
// flatters the operator.

export const USAGE_ROW_LIMIT = 2000;

/** Cost of one text call in USD, from a catalogue entry's list rates.
 *  Returns null when the model has no published rate here. */
export function priceTextCall(price, inputTokens, outputTokens) {
  if (!price || typeof price.inUsdPerMTok !== "number" || typeof price.outUsdPerMTok !== "number") return null;
  const inCost  = ((inputTokens  || 0) / 1e6) * price.inUsdPerMTok;
  const outCost = ((outputTokens || 0) / 1e6) * price.outUsdPerMTok;
  return inCost + outCost;
}

let seq = 0;
/**
 * Build one ledger row.
 *
 * `group` and `fn` are both recorded because they answer different questions.
 * The group is what the admin console routes and what an operator changes; the
 * function is which surface actually spent the money. "Creative Direction cost
 * $12 this month" is the budgeting answer; "callCreativeVariants is 80% of it"
 * is the debugging one.
 */
export function mkUsageRow(fields) {
  const {
    group = "", fn = "", model = "", provider = "", modality = "text",
    inputTokens = null, outputTokens = null,
    costUsd = null, rate = null, costBasis = "estimate",
    initiativeId = null, ok = true, errorKind = null,
  } = fields || {};
  seq += 1;
  return {
    id: "us-" + Date.now() + "-" + seq,
    ts: new Date().toISOString(),
    group, fn, model, provider, modality,
    inputTokens, outputTokens,
    costUsd, rate, costBasis,
    // Present so a spend figure can be attributed to the experiment that caused
    // it, which is what makes production cost usable as a line in the
    // calibration denominator rather than a flat platform overhead.
    initiativeId,
    ok, errorKind,
  };
}

/** Append with a cap. Oldest rows fall off the end — same ring-buffer discipline
 *  as the performance row store, and for the same reason: a browser store is a
 *  provisional home and an unbounded log is the thing that fills it. */
export function appendUsage(rows, row, limit = USAGE_ROW_LIMIT) {
  const next = [row, ...(rows || [])];
  return next.length > limit ? next.slice(0, limit) : next;
}

const inWindow = (row, sinceISO) => !sinceISO || String(row.ts) >= sinceISO;

/**
 * Roll the ledger up along one axis.
 *
 * `by` is any row field — "group", "model", "provider", "fn", "modality". The
 * shape returned is the same in every case so one table renders all of them.
 */
export function rollupUsage(rows, by, { since = null } = {}) {
  const groups = new Map();
  let totalUsd = 0, totalCalls = 0, unpriced = 0, failed = 0;

  (rows || []).forEach(r => {
    if (!inWindow(r, since)) return;
    const key = r[by] == null || r[by] === "" ? "(unattributed)" : String(r[by]);
    const b = groups.get(key) || { key, calls: 0, usd: 0, unpriced: 0, failed: 0, inputTokens: 0, outputTokens: 0 };
    b.calls += 1;
    totalCalls += 1;
    if (!r.ok) { b.failed += 1; failed += 1; }
    if (typeof r.costUsd === "number") { b.usd += r.costUsd; totalUsd += r.costUsd; }
    else { b.unpriced += 1; unpriced += 1; }
    b.inputTokens  += r.inputTokens  || 0;
    b.outputTokens += r.outputTokens || 0;
    groups.set(key, b);
  });

  return {
    rows: [...groups.values()].sort((a, b) => b.usd - a.usd || b.calls - a.calls),
    totalUsd, totalCalls, unpriced, failed,
  };
}

/** ISO timestamp N days ago, for the console's window selector. */
export function sinceDays(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/**
 * Total spend attributable to one initiative, across every modality.
 *
 * Text, image and video all land in the same ledger, so this is the whole cost
 * of producing an experiment's creative — not just the part with a picture
 * attached.
 */
export function usageForInitiative(rows, initiativeId) {
  const mine = (rows || []).filter(r => r.initiativeId === initiativeId);
  let usd = 0, unpriced = 0;
  const byModality = {};
  mine.forEach(r => {
    if (typeof r.costUsd === "number") {
      usd += r.costUsd;
      byModality[r.modality] = (byModality[r.modality] || 0) + r.costUsd;
    } else unpriced += 1;
  });
  return { usd, unpriced, calls: mine.length, byModality };
}
