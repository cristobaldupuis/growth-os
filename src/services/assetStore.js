// -- Where the bytes go ----------------------------------------------------------
//
// The asset RECORD (services/assets.js) is small structured JSON and persists
// like every other entity in the app. The bytes are a different problem: a 1024px
// PNG is well over a megabyte base64-encoded, a rendered video is 5-50MB, and
// localStorage caps around 5MB. Writing either into the existing store would
// reproduce the silent data-loss bug store.js was rewritten to prevent, except
// this time it would take the whole portfolio down with it.
//
// So bytes go through this module, which has two backends:
//
//   SUPABASE STORAGE — durable. Active when the deployment has the server-side
//   credentials configured (see api/asset.js). Bytes survive a reload, and the
//   record's `storageKey` resolves to something.
//
//   SESSION — the current behaviour, made explicit. Bytes live in a module-level
//   Map for the tab's lifetime and are gone on reload. The RECORD still persists,
//   with `bytesDurable: false`, so the ledger keeps the provenance even when the
//   picture is gone.
//
// ## Why an adapter rather than just adding Supabase
//
// Supabase is not wired into this app at all yet — no client dependency, no
// project, and supabase/migrations/0001_init.sql still says "Not run yet —
// proposal only". Making asset storage hard-depend on it would mean nothing here
// works until Phase 5.1 lands, which is exactly backwards: the record is the
// valuable half and every day without it is provenance that cannot be recovered
// later. Env-var presence gating is the same shape this app already uses for
// Vertex vs AI Studio and for every optional provider — unset, and the feature
// degrades to a clear, stated limitation rather than a broken default.
//
// ## Why uploads go through the server and not straight to Supabase
//
// A browser-held Supabase anon key is the `VITE_GOS_SECRET` mistake again (see
// services/ai/_shared.js): a credential that ships inside the bundle is not a
// credential. Without per-user auth there is no RLS policy that makes an
// insert-capable anon key safe — anyone reading the bundle could fill the
// bucket. So the write goes through api/asset.js, which holds the service key
// server-side and is guarded on origin and rate exactly like the image and video
// proxies.

export const ASSET_PROXY_URL = "/api/asset";

/** Session-only byte store. Deliberately module-level rather than React state:
 *  a render that produces an asset and a component that displays it are not
 *  always the same tree, and the studio already learned this the hard way with
 *  index-keyed images. */
const sessionBytes = new Map();

// Null until probed. Kept so the app makes one availability call rather than one
// per generation, and so the studio can tell the operator whether what they are
// looking at will survive a reload — before they spend money generating it.
let durableAvailable = null;
let durableReason = null;

// Why durable storage is off, in the operator's terms. Each one has a different
// fix, and collapsing them into "not configured" is what sends someone to check
// env vars that are already correct.
export const DURABLE_REASONS = {
  unset:          "no Supabase credentials are set on this deployment",
  key_rejected:   "the Supabase key was rejected — check it is the secret (server-side) key, not the publishable one",
  bucket_missing: "the Supabase project is reachable but has no creative-assets bucket",
  unreachable:    "the Supabase project did not respond — it may be paused",
};

/** Ask the server whether durable storage is actually usable. Cached after the
 *  first answer; a failure is treated as unavailable, which is the safe reading —
 *  reporting durability the deployment does not have is how an operator loses
 *  work they believed was saved. */
export async function probeDurableStorage() {
  if (durableAvailable !== null) return durableAvailable;
  try {
    const resp = await fetch(ASSET_PROXY_URL + "?action=status");
    if (!resp.ok) { durableAvailable = false; durableReason = "unreachable"; return false; }
    const data = await resp.json();
    durableAvailable = !!data.configured;
    durableReason = data.configured ? null : (data.reason || "unset");
  } catch {
    durableAvailable = false;
    durableReason = "unreachable";
  }
  return durableAvailable;
}

/** True once probed and available. Synchronous, for render paths that cannot
 *  await; call probeDurableStorage() at boot so this is meaningful. */
export const isDurable = () => durableAvailable === true;

/** A sentence explaining why bytes are not being kept, or null when they are.
 *  Null before the probe resolves, so a caller renders nothing rather than
 *  guessing during the round trip. */
export const durableUnavailableReason = () =>
  durableAvailable === false ? (DURABLE_REASONS[durableReason] || DURABLE_REASONS.unset) : null;

/**
 * Store bytes and return the key the asset record should carry.
 *
 * Resolves to `{storageKey, durable}`. `durable:false` means the bytes are held
 * for this tab only — the caller records that on the asset so the UI can say so
 * rather than implying a permanence the deployment does not have.
 *
 * Never throws on a storage failure: a durable write that fails falls back to
 * session bytes. Losing the picture is bad; losing the generation the operator
 * just paid for because the bucket was misconfigured is worse.
 */
export async function putAsset({ key, mimeType, data }) {
  const storageKey = key || ("asset-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

  if (await probeDurableStorage()) {
    try {
      const resp = await fetch(ASSET_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "put", key: storageKey, mimeType, data }),
      });
      if (resp.ok) {
        const body = await resp.json();
        return { storageKey: body.key || storageKey, durable: true };
      }
      console.warn("Durable asset write failed; holding bytes for this session only.", resp.status);
    } catch (err) {
      console.warn("Durable asset write failed; holding bytes for this session only.", err);
    }
  }

  sessionBytes.set(storageKey, { mimeType, data });
  return { storageKey, durable: false };
}

/**
 * Resolve a stored asset to something an `<img src>` can use.
 *
 * Returns null when the bytes are gone — which is a normal, expected state for a
 * session-stored asset after a reload, and the caller is expected to render the
 * record with a "bytes no longer available" note rather than a broken image.
 */
export async function getAssetUrl(asset) {
  if (!asset || !asset.storageKey) return null;

  const local = sessionBytes.get(asset.storageKey);
  if (local) return `data:${local.mimeType};base64,${local.data}`;

  if (!asset.bytesDurable) return null;

  try {
    const resp = await fetch(
      ASSET_PROXY_URL + "?action=url&key=" + encodeURIComponent(asset.storageKey));
    if (!resp.ok) return null;
    const body = await resp.json();
    return body.url || null;
  } catch {
    return null;
  }
}

/**
 * Read stored bytes back as `{mimeType, data}` base64 — the shape the image
 * proxy needs for a reference image.
 *
 * Session-held bytes are returned directly. Durable ones are fetched through the
 * signed URL and re-encoded, which costs a round trip per generation; that is
 * deliberate rather than cached, because the alternative is holding every brand
 * reference in memory for the tab's lifetime and this app has already shipped
 * one bug caused by exactly that instinct. Returns null when the bytes are gone.
 */
export async function readAssetBytes(asset) {
  if (!asset || !asset.storageKey) return null;

  const local = sessionBytes.get(asset.storageKey);
  if (local) return { mimeType: local.mimeType, data: local.data };
  if (!asset.bytesDurable) return null;

  const url = await getAssetUrl(asset);
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    // Chunked because String.fromCharCode(...bigArray) blows the call stack at a
    // few hundred kilobytes, and a reference image is measured in megabytes.
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return {
      mimeType: asset.mimeType || resp.headers.get("content-type") || "image/png",
      data: btoa(binary),
    };
  } catch {
    return null;
  }
}

/** Hold bytes for this session without attempting a durable write. */
export function holdSessionBytes(key, mimeType, data) {
  sessionBytes.set(key, { mimeType, data });
  return key;
}

/** Read session-held bytes back, or null. */
export function readSessionBytes(key) {
  return sessionBytes.get(key) || null;
}

/** Test seam — resets the probe so a suite can exercise both backends. */
export const _internal = {
  resetProbe: () => { durableAvailable = null; durableReason = null; },
  setProbe: (v, reason = null) => { durableAvailable = v; durableReason = reason; },
  sessionBytes,
};
