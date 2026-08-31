// -- Generated asset ledger ------------------------------------------------------
//
// Every image and video this app generates used to live in React state keyed by
// variant index, and was deliberately thrown away on reload (see the comments in
// CreativeStudio.jsx). Each of those decisions was right on its own terms — a
// base64 PNG in localStorage is the fastest way to reproduce the quota bug
// store.js was rewritten to prevent — but stacked together they meant a
// generated asset had no id, no durable link to the brief that produced it, and
// ceased to exist on reload.
//
// That breaks the loop this whole product is built on. The naming convention
// joins an ad NAME back to an initiative; it says nothing about which frame ran
// under that name, what prompt built it, which model, or what it cost. So when a
// Meta export reports that an ad returned 2.4x, the initiative and the angle are
// recoverable and the creative is not.
//
// This module separates the two halves of the problem, because they have
// different constraints:
//
//   THE RECORD is small structured JSON — a few hundred bytes. It persists like
//   every other entity in the app, and it is the half that carries the value:
//   provenance, lineage, the ad name it ships under, and the cost.
//
//   THE BYTES are megabytes and belong in blob storage. They go through
//   services/assetStore.js, which is durable when the deployment has one
//   configured and session-only when it does not.
//
// A record whose bytes are gone is still worth having. It can still tell you
// that on 4 March, brief v2 of NH-003 produced a 4:5 key frame for the TimeSaver
// angle under a named prompt at a cost of four cents, and that the ad name it
// shipped under was the one that returned 2.4x. That is the evidence a later
// round reasons from. The picture is the part you can regenerate.

/** Asset kinds. Kept as a set so a record with an unknown kind is rejected at
 *  the boundary rather than becoming a silent gap in a cost rollup. */
//
// "scene" is a third kind rather than a second flavour of "video" because
// currentRoundAssets slots by kind: a variant can legitimately have both a
// talking-head render and a generated scene, and folding them into one kind
// would make the newer silently replace the older on screen while both still
// billed. They are also priced on different axes — a render costs what its
// script takes to say, a scene costs the duration you asked for.
export const ASSET_KINDS = new Set(["image", "video", "scene"]);

// Per-generation cost, in USD, for the image models this app calls. These are
// list rates at the time of writing and are recorded as ESTIMATES — the record
// carries `costBasis: "estimate"` so a later reconciliation against a real
// billing export can overwrite them without anyone having to guess which figures
// were measured and which were assumed. An unknown model yields null rather than
// zero: zero would quietly understate a rollup, null is visibly missing.
export const IMAGE_COST_USD = {
  "gemini-2.5-flash-image": 0.04,
  "gemini-3-pro-image-preview": 0.14,
};

/** Cost of one image generation, or null when the model is not in the table. */
export function imageCostUsd(model) {
  const c = IMAGE_COST_USD[model];
  return typeof c === "number" ? c : null;
}

let seq = 0;
/** Mint an asset id. Matches the `prefix-timestamp` convention used elsewhere,
 *  with a counter because a burst of generations can land inside one millisecond
 *  and a collision here would silently merge two assets' provenance. */
export function mkAssetId() {
  seq += 1;
  return "as-" + Date.now() + "-" + seq;
}

/**
 * The stable identity of a variant slot.
 *
 * This is the fix for the bug that forced `clearGeneratedAssets` to exist. A
 * bare index is only meaningful against the variant list that produced it, so
 * regenerating variants re-pointed index 0 at a different creative idea and any
 * asset left behind was now attached to the wrong hypothesis. The old answer was
 * to delete everything on every regeneration, which is safe and also throws away
 * the ledger.
 *
 * Versioning the key instead means an asset generated against brief v2's third
 * variant keeps a key that brief v3 can never mint. Old assets stop being
 * *current* without ever becoming *wrong*, so the studio can show this round's
 * work while the ledger keeps every round's.
 */
export function variantKey({ initiativeId, briefVersion, variantsVersion, variantIdx }) {
  return [initiativeId, "b" + (briefVersion || 0), "v" + (variantsVersion || 0), String(variantIdx)].join(":");
}

/**
 * Build an asset record.
 *
 * `adName` is the field that earns this module's existence: it is the join key
 * the naming convention already uses to bring a performance row back to an
 * initiative, captured at the moment of generation. Without it an asset can be
 * traced forward from the brief but never backward from the spend.
 *
 * `prompt` and `model` are stored verbatim rather than as a reference to
 * whatever the prompt builder produces today, because the builder will change
 * and the record has to keep meaning what it meant. The same reasoning as the
 * initiative prediction snapshot: a frozen copy is the point.
 */
export function mkAssetRecord(fields) {
  const {
    kind, initiativeId, initId = null, brandId = null,
    briefVersion = 0, variantsVersion = 0, variantIdx = 0,
    variantLabel = "", angleSlug = "",
    adName = "", channel = "", model = "", prompt = "",
    aspect = "", mimeType = "", costUsd = null, costBasis = "estimate",
    storageKey = null, bytesDurable = false,
    provider = null, jobId = null, durationSeconds = null,
    providerUrl = null,
  } = fields || {};

  if (!ASSET_KINDS.has(kind)) throw new Error("Unknown asset kind: " + kind);
  if (!initiativeId) throw new Error("An asset must be attached to an initiative.");

  return {
    id: mkAssetId(),
    kind,
    initiativeId, initId, brandId,
    briefVersion, variantsVersion, variantIdx,
    variantKey: variantKey({ initiativeId, briefVersion, variantsVersion, variantIdx }),
    variantLabel, angleSlug,
    // The name this asset is intended to ship under. Empty when the variant's
    // naming did not validate, which is worth recording as-is: an asset with no
    // legal ad name is exactly the one that will never be attributable, and
    // storing "" rather than omitting the field makes that queryable.
    adName, channel,
    model, prompt, aspect, mimeType,
    costUsd, costBasis,
    storageKey, bytesDurable,
    provider, jobId, durationSeconds, providerUrl,
    createdAt: new Date().toISOString(),
  };
}

/** Every asset for one initiative, newest first. */
export function assetsForInitiative(assets, initiativeId) {
  return (assets || [])
    .filter(a => a.initiativeId === initiativeId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** The assets belonging to the current round — one brief version and one variant
 *  set — keyed by variant index for rendering. Older rounds stay in the ledger
 *  and are simply not returned here. */
export function currentRoundAssets(assets, { initiativeId, briefVersion, variantsVersion }) {
  const out = {};
  (assets || []).forEach(a => {
    if (a.initiativeId !== initiativeId) return;
    if (a.briefVersion !== briefVersion || a.variantsVersion !== variantsVersion) return;
    const slot = out[a.variantIdx] || (out[a.variantIdx] = {});
    // Newest wins per kind, so regenerating a frame replaces it on screen while
    // both remain in the ledger with their own costs.
    const prev = slot[a.kind];
    if (!prev || String(a.createdAt) > String(prev.createdAt)) slot[a.kind] = a;
  });
  return out;
}

/**
 * Production cost per initiative.
 *
 * Kept separate from the revenue figures the calibration loop already computes,
 * and returned with an explicit `unpriced` count. A rollup that silently treats
 * an unknown model's cost as zero reports a cheaper round than actually
 * happened, which is the same class of error as averaging ROAS across rows.
 */
export function costForInitiative(assets, initiativeId) {
  const mine = (assets || []).filter(a => a.initiativeId === initiativeId);
  let usd = 0, unpriced = 0;
  const byKind = {};
  mine.forEach(a => {
    if (typeof a.costUsd === "number") {
      usd += a.costUsd;
      byKind[a.kind] = (byKind[a.kind] || 0) + a.costUsd;
    } else {
      unpriced += 1;
    }
  });
  return { usd, unpriced, count: mine.length, byKind };
}

/** Cost across every initiative, for a portfolio-level read. */
export function costByInitiative(assets) {
  const ids = [...new Set((assets || []).map(a => a.initiativeId))];
  const out = {};
  ids.forEach(id => { out[id] = costForInitiative(assets, id); });
  return out;
}

/**
 * Assets whose bytes are gone but whose record survives.
 *
 * Surfaced rather than hidden, for the same reason unparsed rows are counted in
 * every breakdown: an operator who thinks they have 40 recoverable frames and
 * has 6 will find out at the worst moment.
 */
export function orphanedAssets(assets) {
  return (assets || []).filter(a => !a.bytesDurable);
}
