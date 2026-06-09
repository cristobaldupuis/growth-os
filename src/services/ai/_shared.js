export const PROXY_URL    = "/api/proxy";
export const GOS_SECRET   = import.meta.env.VITE_GOS_SECRET || "";

export const AI_HEADERS = () => ({
  "Content-Type": "application/json",
  "x-gos-secret": GOS_SECRET,
});

// Legacy — kept so existing call sites that check for a key still work during transition
export const getApiKey = () => GOS_SECRET ? "proxied" : "";

// Defensive JSON extraction for LLM responses. Tries direct parse, then largest
// balanced bracket substring, then (for arrays) wraps a single object. Returns
// null on total failure so callers can show a useful error.
export function safeParseJSON(raw, expectArray) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const open  = expectArray ? "[" : "{";
  const close = expectArray ? "]" : "}";
  const start = cleaned.indexOf(open);
  const end   = cleaned.lastIndexOf(close);
  if (start !== -1 && end !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }
  if (expectArray) {
    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === "object") return [obj];
    } catch {}
  }
  return null;
}
