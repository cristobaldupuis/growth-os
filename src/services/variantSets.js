// -- Variant sets: append-only, and frozen once a name leaves the building ------------
//
// Briefs were versioned; variants were not. Regenerating replaced the set in
// place, and a new brief emptied it — so the script behind an ad name that was
// already live in an ad account could vanish, and with it the only record of what
// that ad said. Naming-slot edits were worse: held in component state, never
// saved, so a reload could change an ad name after it had been pasted into Ads
// Manager. For a product whose claim is "the ad name carries the link", the name
// and the words behind it were the least durable things in it.
//
// Two rules fix both:
//
//   1. Sets are APPEND-ONLY. Every generation is a new set in `variantSets`,
//      numbered within its brief version; nothing is ever overwritten. The record
//      still mirrors the current set in `variants`/`variantsVersion` for every
//      reader that predates sets (asset keys, the bench, the MCP tools).
//   2. A set is FROZEN the first time its names leave the tool — copied, exported,
//      put in a creator brief, or drawn onto a static ad. From then on its naming
//      slots and copy cannot change; `names` snapshots exactly what was shipped.
//      Iterating is still one click: generate a new set.
//
// The frozen sets are what make the last function here possible: `shippedAdIndex`
// joins an ad name back to the words it carried, and `topAdsByReturn` joins those
// words to what the ad account says they earned — which is the evidence a creative
// brief most needs and no generic AI ad tool can have.

import { normKey } from "./naming.js";
import { deriveRatios, ADDITIVE_METRICS } from "./performance.js";
import { THIN_SPEND_USD } from "./creativeEvidence.js";
import { beatsOf } from "./creativeCopy.js";

/** Every set on a record, including the one a pre-sets record implies. */
export function setsOf(record) {
  if (!record) return [];
  if (Array.isArray(record.variantSets)) return record.variantSets;
  if (Array.isArray(record.variants) && record.variants.length) {
    return [{
      version: record.variantsVersion || 1,
      briefVersion: record.briefVersion || 1,
      channel: null,
      generatedAt: record.generatedAt || null,
      variants: record.variants,
      critique: null,
      shippedAt: null,
      shippedVia: [],
      names: null,
      legacy: true,
    }];
  }
  return [];
}

/** The set the studio is showing: the record's current brief and variant version. */
export function currentSet(record) {
  if (!record) return null;
  // A record from before sets existed has exactly one implied set, and it is
  // by definition the current one — whatever version fields it did or did not carry.
  if (!Array.isArray(record.variantSets)) return setsOf(record)[0] || null;
  return record.variantSets.find(s => s.version === (record.variantsVersion || 0) && s.briefVersion === (record.briefVersion || 0)) || null;
}

export const isShipped = (set) => !!(set && set.shippedAt);

const replaceSet = (record, set) => {
  const sets = setsOf(record).map(s => (s.version === set.version && s.briefVersion === set.briefVersion ? set : s));
  return { variantSets: sets, variants: set.variants };
};

/** A patch appending a new set and making it current. Never touches an old one. */
export function withNewSet(record, { variants, channel, perAngle, critique = null, failedAngles = [] }, now = new Date()) {
  const briefVersion = record?.briefVersion || 0;
  // Past every set this brief already has, not just the record's counter: a
  // record from before sets existed implies a set its counter may not describe.
  const version = Math.max(
    record?.variantsVersion || 0,
    ...setsOf(record).filter(s => s.briefVersion === briefVersion).map(s => s.version || 0),
  ) + 1;
  const set = {
    version, briefVersion, channel: channel || null, perAngle: perAngle || null,
    generatedAt: now.toISOString(),
    variants: variants || [],
    critique,
    failedAngles,
    shippedAt: null, shippedVia: [], names: null,
  };
  return { variantSets: [...setsOf(record), set], variants: set.variants, variantsVersion: version };
}

/** A patch changing one variant in the current set, or null if the set is frozen. */
export function withVariantChange(record, idx, change) {
  const set = currentSet(record);
  if (!set || isShipped(set) || !set.variants[idx]) return null;
  const variants = set.variants.map((v, i) => (i === idx ? change(v) : v));
  return replaceSet(record, { ...set, variants });
}

/** A patch setting one naming slot on one variant of the current set. */
export function withNaming(record, idx, key, value) {
  return withVariantChange(record, idx, v => ({ ...v, naming: { ...(v.naming || {}), [key]: value } }));
}

/** A patch attaching the review pass's findings to the current set. */
export function withCritique(record, critique) {
  const set = currentSet(record);
  if (!set) return null;
  return replaceSet(record, { ...set, critique });
}

/**
 * A patch freezing the current set. `names` is `{variantIdx: {ad, levels}}` as
 * the studio assembled them at the moment of shipping. The FIRST freeze wins:
 * later ships add to `shippedVia` but never rewrite what was shipped.
 */
export function withShipped(record, names, via, now = new Date()) {
  const set = currentSet(record);
  if (!set) return null;
  return replaceSet(record, {
    ...set,
    shippedAt: set.shippedAt || now.toISOString(),
    shippedVia: [...new Set([...(set.shippedVia || []), via])],
    names: set.names || names,
  });
}

// -- From ad name back to the words it carried -------------------------------------

/**
 * `normKey(adName)` → what that ad said, across every frozen set of every record.
 * Only frozen sets count: an unshipped set's names were never in an ad account.
 */
export function shippedAdIndex(records) {
  const index = new Map();
  (records || []).forEach(record => {
    setsOf(record).forEach(set => {
      if (!isShipped(set) || !set.names) return;
      Object.entries(set.names).forEach(([idx, n]) => {
        const variant = set.variants[Number(idx)];
        if (!variant || !n?.ad) return;
        const key = normKey(n.ad);
        if (index.has(key)) return;
        index.set(key, {
          adName: n.ad,
          initiativeId: record.initiativeId,
          briefVersion: set.briefVersion,
          setVersion: set.version,
          variantIdx: Number(idx),
          channel: set.channel,
          variant,
          shippedAt: set.shippedAt,
        });
      });
    });
  });
  return index;
}

export const WINNERS_LIMIT = 3;
export const LOSERS_LIMIT = 2;

/**
 * The shipped ads the ad account has judged, best and worst by ROAS.
 *
 * Summed per ad name across every row (a daily export repeats a name once per
 * day), ratios recomputed from the sums, and an ad below the evidence floor is
 * counted but never ranked — the same floor the per-dimension evidence uses, for
 * the same reason: one lucky day at $40 of spend is not a winner.
 */
export function topAdsByReturn(perfRows, index, opts = {}) {
  const { initiativesById = new Map(), brandId = null, minSpend = THIN_SPEND_USD } = opts;
  const byAd = new Map();
  (perfRows || []).forEach(r => {
    const hit = index.get(normKey(r.name));
    if (!hit) return;
    if (brandId) {
      const init = initiativesById.get(hit.initiativeId);
      if (init && (init.brandId || "default") !== brandId) return;
    }
    const cur = byAd.get(hit.adName) || { ...hit, metrics: Object.fromEntries(ADDITIVE_METRICS.map(k => [k, 0])), rows: 0 };
    // Additive metrics only: a ratio column summed across days is a number with
    // no meaning, and the ratios are recomputed from the sums below.
    ADDITIVE_METRICS.forEach(k => { const n = r.metrics?.[k]; if (typeof n === "number") cur.metrics[k] += n; });
    cur.rows += 1;
    byAd.set(hit.adName, cur);
  });

  const judged = [...byAd.values()].map(a => ({ ...a, ...deriveRatios(a.metrics) }));
  const eligible = judged.filter(a => (a.metrics.spend || 0) >= minSpend && a.roas != null);
  const byRoas = [...eligible].sort((a, b) => (b.roas - a.roas) || (b.metrics.spend - a.metrics.spend));
  const winners = byRoas.slice(0, opts.limit || WINNERS_LIMIT);
  const losers = byRoas.length > winners.length
    ? byRoas.slice(winners.length).reverse().slice(0, LOSERS_LIMIT)
    : [];
  return {
    winners, losers,
    judged: judged.length,
    thin: judged.length - eligible.length,
    shipped: index.size,
  };
}

const money = (n) => "$" + Math.round(n || 0).toLocaleString();

function describeAd(a) {
  const v = a.variant || {};
  const lines = [
    `  ${a.adName} — ${a.roas.toFixed(2)}x ROAS on ${money(a.metrics.spend)} spend, ${a.metrics.conversions || 0} conversions (angle ${v.angleSlug || "unknown"})`,
    `    hook: "${v.hook || ""}"`,
  ];
  const beats = beatsOf(v).slice(0, 5).map(b => b.voiceover || b.onScreen || b.visual).filter(Boolean);
  if (beats.length) lines.push(`    beats: ${beats.map((b, i) => `${i + 1}) ${b}`).join(" ")}`);
  const copy = Object.entries(v.copy || {}).filter(([, s]) => s).map(([k, s]) => `${k}: "${s}"`);
  if (copy.length) lines.push(`    copy: ${copy.join("; ")}`);
  return lines.join("\n");
}

/** The judged ads as prompt text, with what was left out said out loud. */
export function formatWinnersBlock(result) {
  if (!result || !result.shipped) {
    return "  (no ads shipped from this studio yet — once a set's names are exported and its performance imported, the words that won will appear here)";
  }
  if (!result.winners.length) {
    return `  (${result.shipped} shipped ad${result.shipped === 1 ? "" : "s"}, ${result.judged} with performance imported, none yet above the ${money(THIN_SPEND_USD)} evidence floor — nothing here is evidence)`;
  }
  const out = ["  WON:", ...result.winners.map(describeAd)];
  if (result.losers.length) out.push("  LOST:", ...result.losers.map(describeAd));
  if (result.thin) out.push(`  (${result.thin} more shipped ad${result.thin === 1 ? "" : "s"} below the evidence floor, not ranked)`);
  return out.join("\n");
}
