export const KEY_ITEMS    = "gos_items_v4";
export const KEY_SETTINGS = "gos_settings_v2";
export const KEY_THEME    = "gos_theme_v1";
export const KEY_DEBATES  = "gos_debates_v1";
export const KEY_METRICS  = "gos_metrics_v1";
export const KEY_RECS     = "gos_recs_v1";
export const KEY_CREATIVE = "gos_creative_v1";
// Campaign-level performance facts, parsed against the naming schema. Separate
// from KEY_METRICS because the two shapes are genuinely different: the weekly
// contract is one row per week per brand per source, this is one row per ad
// entity per day with its dimensions living inside the name. Capped in
// services/performance.js — a browser store is a provisional home for these.
export const KEY_PERF     = "gos_perf_v1";
// Provenance records for generated creative — id, prompt, model, cost, and the
// ad name the asset ships under. Small structured JSON; the BYTES live in blob
// storage via services/assetStore.js and deliberately never come near this
// store, which is what makes persisting the record safe at all. See
// services/assets.js for why the record is worth keeping even when the bytes
// are gone.
export const KEY_ASSETS   = "gos_assets_v1";
// AI spend ledger: one row per call, priced at the point of use. Capped in
// services/usage.js — a browser store is a provisional home for these and an
// unbounded log is the thing that fills it.
export const KEY_USAGE    = "gos_usage_v1";
export const KEY_LIB_VIEW = "gos_lib_view_v1";
// Sidebar collapsed state. A layout preference, so it persists like the theme
// does — being asked to re-collapse the rail on every load is the kind of small
// friction that makes a tool feel like it is not listening.
export const KEY_RAIL     = "gos_rail_v1";
export const KEY_TOUR_SEEN = "gos_tour_seen_v1";
// Learning agenda items (ROADMAP 5.1) — the layer above initiatives. Small and
// operator-authored, so it gets no cap the way KEY_PERF does.
export const KEY_AGENDA   = "gos_agenda_v1";

// Storage helper — works in Claude artifacts (window.storage), StackBlitz
// (localStorage), or memory.
//
// The previous version caught every write error and silently fell through to the
// in-memory object. That is the worst possible failure mode for this app: once
// localStorage is full (browsers cap it around 5MB, and a portfolio with a few
// hundred initiatives plus debate transcripts gets there), every subsequent write
// throws, gets swallowed, and lands in `mem` instead. The UI shows the save
// succeeding, the data survives navigation because `mem` is still in scope, and
// then the entire session's work disappears on the next page load with no error
// ever having been shown. A client losing a quarter of experiment history that
// way is not recoverable — not the data, and not the relationship.
//
// Writes now report their outcome. `set` resolves to a result object rather than
// throwing, so call sites can surface a warning without every save needing a
// try/catch, and `onWriteError` lets the app subscribe once and toast.

let writeErrorHandler = null;
/** Register a callback fired when a durable write fails. Set once, at app init. */
export function onWriteError(fn) { writeErrorHandler = fn; }

const QUOTA_CODES = new Set([22, 1014]);
const isQuotaError = (err) =>
  err && (QUOTA_CODES.has(err.code) ||
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED");

// -- The remote backend --------------------------------------------------------
//
// Phase 2.0. When a live workspace is signed in, the CLIENT's state moves to
// Postgres and the DEVICE's preferences stay here. `attachRemote` is how the app
// says which is which without every call site learning about a second store.
//
// The split is not cosmetic. Theme, library view, rail collapsed and tour-seen
// are properties of this browser: syncing them would collapse someone's sidebar
// because a colleague collapsed theirs. Everything else belongs to the workspace
// and should be on any machine its members sign in from.

/** Keys that stay in this browser even when a workspace is attached. */
export const DEVICE_KEYS = new Set([KEY_THEME, KEY_LIB_VIEW, KEY_RAIL, KEY_TOUR_SEEN]);

let remote = null;   // { saveDoc, savePerfRows, perfKey }
let remoteCache = {};

/**
 * Route workspace state to `backend`, seeded with what the server already had.
 *
 * `docs` maps a store key to its JSON string, so `store.get` can answer from it
 * without a request per key — the whole workspace arrived in one response.
 */
export function attachRemote(backend, docs = {}, perfJson = null) {
  remote = backend;
  remoteCache = { ...docs };
  if (perfJson != null) remoteCache[backend.perfKey] = perfJson;
}

/** Return to browser-only storage — a sign-out, or a demo workspace. */
export function detachRemote() { remote = null; remoteCache = {}; }

export const remoteAttached = () => !!remote;

/** True when this key belongs to the workspace rather than to this browser. */
const isRemoteKey = (key) => !!remote && !DEVICE_KEYS.has(key);

export const store = (() => {
  const mem = {};
  const hasLS = (() => { try { localStorage.setItem("__t","1"); localStorage.removeItem("__t"); return true; } catch { return false; } })();
  const hasWS = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

  // True once any durable write has failed. Kept so the warning fires on the
  // transition rather than on every keystroke-triggered save afterwards.
  let degraded = false;

  const report = (key, err, override) => {
    const quota = isQuotaError(err);
    const message = override || (quota
      ? "Storage is full, so your latest changes are only held in this tab and will be lost when you reload. Download a backup now, then remove old initiatives or restore into a fresh workspace."
      : "Changes could not be saved to this browser and are only held in this tab. Download a backup now.");
    console.error("store.set failed for " + key + ":", err);
    if (!degraded) {
      degraded = true;
      if (writeErrorHandler) writeErrorHandler({ key, quota, message, error: err });
    }
    return { ok: false, durable: false, quota, message };
  };

  return {
    /** True when writes are landing in a store that survives a reload. */
    get durable() { return (!!remote || hasWS || hasLS) && !degraded; },

    async get(key) {
      // Answered from the workspace snapshot loaded at sign-in. Absent means the
      // server genuinely has no value for this key, which is what lets App.jsx's
      // load effect seed a fresh workspace exactly as it does a fresh browser.
      if (isRemoteKey(key)) return remoteCache[key] ? { value: remoteCache[key] } : null;
      if (hasWS) { try { return await window.storage.get(key); } catch (err) { console.warn("store.get (window.storage) failed for " + key + ":", err); } }
      if (hasLS) { try { const v = localStorage.getItem(key); return v ? { value: v } : null; } catch (err) { console.warn("store.get (localStorage) failed for " + key + ":", err); } }
      return mem[key] ? { value: mem[key] } : null;
    },

    /**
     * Persist a value. Never throws. Resolves to
     * `{ ok, durable, quota?, message? }` — `durable:false` means the value is
     * in memory only and will not survive a reload.
     */
    async set(key, value) {
      mem[key] = value;  // always keep the session copy, even on the happy path

      if (isRemoteKey(key)) {
        remoteCache[key] = value;
        try {
          if (key === remote.perfKey) await remote.savePerfRows(JSON.parse(value));
          else await remote.saveDoc(key, value);
          return { ok: true, durable: true };
        } catch (err) {
          // Three failures that need three different sentences. A conflict is
          // somebody else's save, and the fix is to reload rather than retry. A
          // signed-out session is not an error to retry either. Anything else is
          // the store being unreachable, and the answer is the same one this
          // module has always given for a write that did not land: say so, and
          // tell the operator to take a backup while the data is still in memory.
          if (err.conflict) {
            return report(key, err, "Someone else saved this workspace while you were working. Reload to pick up their changes — your unsaved edits are still in this tab until you do.");
          }
          if (err.signedOut) {
            return report(key, err, "Your session expired, so this change was not saved. Sign in again — your edits are still in this tab.");
          }
          return report(key, err, "Changes could not be saved to the workspace store and are only held in this tab. Download a backup now.");
        }
      }

      if (hasWS) {
        try { await window.storage.set(key, value); return { ok: true, durable: true }; }
        catch (err) { return report(key, err); }
      }
      if (hasLS) {
        try { localStorage.setItem(key, value); return { ok: true, durable: true }; }
        catch (err) { return report(key, err); }
      }
      // No durable backend at all (sandboxed iframe, disabled storage). This is a
      // known environment rather than a failure, so it doesn't trip the handler —
      // but it is still explicitly not durable.
      return { ok: true, durable: false };
    },
  };
})();

// `creative` and `perfRows` are optional so a caller that predates either still
// produces a valid backup; version stays 1 because a v1 restore reading a v2
// payload loses only the new key, and a v2 restore reading a v1 payload finds
// it absent and skips it. Neither direction corrupts anything, which is the bar
// a format bump would exist to protect.
export const handleDownloadBackup = (items, settings, debates, weeklyMetrics, recs, creative, perfRows, assets, usage, agenda) => {
  const payload = {
    _meta: {
      format: "growth-os-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      company: settings.companyName || "Marketers Lab",
    },
    items,
    settings,
    debates,
    weeklyMetrics,
    recs,
    creative: creative || [],
    perfRows: perfRows || [],
    // Records only. The bytes they point at are not in the backup and cannot be:
    // a portfolio's worth of generated frames would run to hundreds of megabytes
    // of base64 inside a JSON file the operator is expected to email themselves.
    // Restoring into a workspace with durable storage configured re-resolves the
    // ones still in the bucket; the rest restore as records without pictures,
    // which is the same honest state a reload produces today.
    assets: assets || [],
    usage: usage || [],
    // Optional, same reasoning as `creative`/`perfRows` above: version stays 1
    // because an old restore reading a payload with this key just skips it.
    agenda: agenda || [],
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,10);
  const slug  = (settings.companyName || "MarketersLab").replace(/\s+/g,"_");
  a.href = url;
  a.download = slug+"_backup_"+stamp+".json";
  a.click();
  URL.revokeObjectURL(url);
};

export const handleRestoreBackup = (file, showToast, setRestorePayload) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed || parsed._meta?.format !== "growth-os-backup") {
        showToast("This file doesn't look like a Marketers Lab backup. Restore cancelled.", "error");
        return;
      }
      const counts = {
        items: Array.isArray(parsed.items) ? parsed.items.length : 0,
        debates: Array.isArray(parsed.debates) ? parsed.debates.length : 0,
        metrics: Array.isArray(parsed.weeklyMetrics) ? parsed.weeklyMetrics.length : 0,
        recs: Array.isArray(parsed.recs) ? parsed.recs.length : 0,
        creative: Array.isArray(parsed.creative) ? parsed.creative.length : 0,
        perfRows: Array.isArray(parsed.perfRows) ? parsed.perfRows.length : 0,
        assets: Array.isArray(parsed.assets) ? parsed.assets.length : 0,
        usage: Array.isArray(parsed.usage) ? parsed.usage.length : 0,
        agenda: Array.isArray(parsed.agenda) ? parsed.agenda.length : 0,
      };
      const stamp = parsed._meta?.exportedAt
        ? new Date(parsed._meta.exportedAt).toLocaleString()
        : "unknown date";
      setRestorePayload({ parsed, counts, stamp });
    } catch (err) {
      showToast("Couldn't read that backup file. It may be corrupted.", "error");
      console.error("Restore error:", err);
    }
  };
  reader.readAsText(file);
};
