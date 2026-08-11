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

export const store = (() => {
  const mem = {};
  const hasLS = (() => { try { localStorage.setItem("__t","1"); localStorage.removeItem("__t"); return true; } catch { return false; } })();
  const hasWS = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

  // True once any durable write has failed. Kept so the warning fires on the
  // transition rather than on every keystroke-triggered save afterwards.
  let degraded = false;

  const report = (key, err) => {
    const quota = isQuotaError(err);
    const message = quota
      ? "Storage is full, so your latest changes are only held in this tab and will be lost when you reload. Download a backup now, then remove old initiatives or restore into a fresh workspace."
      : "Changes could not be saved to this browser and are only held in this tab. Download a backup now.";
    console.error("store.set failed for " + key + ":", err);
    if (!degraded) {
      degraded = true;
      if (writeErrorHandler) writeErrorHandler({ key, quota, message, error: err });
    }
    return { ok: false, durable: false, quota, message };
  };

  return {
    /** True when writes are landing in a store that survives a reload. */
    get durable() { return (hasWS || hasLS) && !degraded; },

    async get(key) {
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
export const handleDownloadBackup = (items, settings, debates, weeklyMetrics, recs, creative, perfRows, assets, usage) => {
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
