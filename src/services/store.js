export const KEY_ITEMS    = "gos_items_v4";
export const KEY_SETTINGS = "gos_settings_v2";
export const KEY_THEME    = "gos_theme_v1";
export const KEY_DEBATES  = "gos_debates_v1";
export const KEY_METRICS  = "gos_metrics_v1";
export const KEY_RECS     = "gos_recs_v1";

// Storage helper — works in Claude artifacts (window.storage), StackBlitz (localStorage), or memory
export const store = (() => {
  const mem = {};
  const hasLS = (() => { try { localStorage.setItem("__t","1"); localStorage.removeItem("__t"); return true; } catch { return false; } })();
  const hasWS = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
  return {
    async get(key) {
      if (hasWS) { try { return await window.storage.get(key); } catch {} }
      if (hasLS) { try { const v = localStorage.getItem(key); return v ? { value: v } : null; } catch {} }
      return mem[key] ? { value: mem[key] } : null;
    },
    async set(key, value) {
      if (hasWS) { try { await window.storage.set(key, value); return; } catch {} }
      if (hasLS) { try { localStorage.setItem(key, value); return; } catch {} }
      mem[key] = value;
    },
  };
})();

export const handleDownloadBackup = (items, settings, debates, weeklyMetrics, recs) => {
  const payload = {
    _meta: {
      format: "growth-os-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      company: settings.companyName || "Growth OS",
    },
    items,
    settings,
    debates,
    weeklyMetrics,
    recs,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,10);
  const slug  = (settings.companyName || "GrowthOS").replace(/\s+/g,"_");
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
        showToast("This file doesn't look like a Growth OS backup. Restore cancelled.", "error");
        return;
      }
      const counts = {
        items: Array.isArray(parsed.items) ? parsed.items.length : 0,
        debates: Array.isArray(parsed.debates) ? parsed.debates.length : 0,
        metrics: Array.isArray(parsed.weeklyMetrics) ? parsed.weeklyMetrics.length : 0,
        recs: Array.isArray(parsed.recs) ? parsed.recs.length : 0,
      };
      const stamp = parsed._meta?.exportedAt
        ? new Date(parsed._meta.exportedAt).toLocaleString()
        : "unknown date";
      setRestorePayload({ parsed, counts, stamp });
    } catch (err) {
      showToast("Couldn't read that backup file — it may be corrupted.", "error");
      console.error("Restore error:", err);
    }
  };
  reader.readAsText(file);
};
