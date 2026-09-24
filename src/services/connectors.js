// src/services/connectors.js — the browser side of api/connectors.js.
//
// A sync returns performance rows in the CSV importer's shape; the import
// dialog annotates them against the naming schema and shows the same preview
// a file gets, so nothing is written until the operator confirms.

import { AI_HEADERS } from "./ai/_shared.js";
import { currentWorkspace } from "./remoteState.js";

export const CONNECTORS_URL = "/api/connectors";

/** `{ klaviyo: { configured, maxDays, ... }, ... }`, or null when unreachable. */
export async function connectorStatus(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(CONNECTORS_URL);
    if (!res.ok) return null;
    const body = await res.json();
    return body.connectors || null;
  } catch {
    return null;
  }
}

/**
 * Pull `days` of data from `provider`. Resolves to `{ rows, renamed, from, to,
 * days }`; rejects with the server's own explanation, which is written to be
 * shown as-is (a missing scope, a rate limit, a view-only seat).
 */
export async function syncConnector(provider, days, fetchImpl = fetch) {
  const ws = currentWorkspace();
  const res = await fetchImpl(CONNECTORS_URL, {
    method: "POST",
    headers: await AI_HEADERS(),
    body: JSON.stringify({ provider, days, ...(ws?.id ? { workspace: ws.id } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Sync failed (${res.status}).`);
  return body;
}
