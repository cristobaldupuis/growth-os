// api/connectors.js — pull performance data from a platform's API.
//
// ROADMAP Phase 2 ("The Data Moat") / 5.5. One endpoint for every read
// connector, switched on `provider`, so each new platform costs a module
// (api/_<provider>.js) rather than one of the Hobby plan's twelve functions.
//
// ## What it returns, and what it deliberately does not do
//
// Performance rows in exactly the shape the CSV importer produces. The app runs
// them through the same annotate → preview → merge path an uploaded export
// takes, so a synced day and an imported day are the same fact under the same
// `perfRowKey`: re-syncing, or importing a CSV that overlaps a sync, replaces
// rather than duplicates. This endpoint does not write anything itself — the
// operator sees the preview and confirms, exactly as for a file.
//
// ## Who may call it
//
// A signed-in member or owner of a workspace, always. The platform key is
// deployment-wide and reads the client's own marketing data, so unlike the AI
// endpoints there is no anonymous fallback: a visitor to a public demo must not
// be able to pull the client's email performance. A viewer is refused because
// the only thing a sync is for is saving its rows, which a viewer cannot do.
//
// ## Credentials
//
//   KLAVIYO_PRIVATE_KEY            private API key, scopes metrics:read + flows:read
//   KLAVIYO_CONVERSION_METRIC_ID   optional; defaults to the "Placed Order" metric
//
// Shopify is listed in `status` as not yet available: see README.

import { guardEntry, guardRateLimit } from "./_guard.js";
import { authenticate, membershipsFor, resolveWorkspace } from "./_auth.js";
import { supabaseConfigured } from "./_supabase.js";
import { klaviyoConfigured, syncKlaviyo, ConnectorError, MAX_DAYS as KLAVIYO_MAX_DAYS } from "./_klaviyo.js";

const MAX_BODY_BYTES = 8 * 1024;
// Klaviyo's reporting endpoints allow a few requests a minute and a couple of
// hundred a day per account; a person clicking Sync needs far fewer.
const RATE_LIMIT_MAX = 20;
// Below the function's 30s maxDuration, leaving room for the metric lookup.
const UPSTREAM_TIMEOUT_MS = 20000;

export const PROVIDERS = {
  klaviyo: { label: "Klaviyo", configured: klaviyoConfigured, maxDays: KLAVIYO_MAX_DAYS, sync: syncKlaviyo },
};

/** What the Settings/import UI shows: which connectors exist and are set up. */
export function connectorStatus() {
  return {
    klaviyo: { label: "Klaviyo", available: true, configured: klaviyoConfigured(), maxDays: KLAVIYO_MAX_DAYS },
    shopify: { label: "Shopify", available: false, configured: false },
  };
}

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES, methods: ["GET", "POST"] })) return;

  if (req.method === "GET") {
    // Booleans only — which platforms this deployment has a key for. Answered
    // without a session so the import dialog can decide what to offer.
    res.status(200).json({ connectors: connectorStatus() });
    return;
  }

  const provider = PROVIDERS[String(req.body?.provider || "")];
  if (!provider) { res.status(400).json({ error: "Unknown provider." }); return; }
  if (!provider.configured()) {
    res.status(400).json({ error: `${provider.label} is not connected on this deployment.` });
    return;
  }
  if (!supabaseConfigured()) {
    res.status(403).json({ error: "Connectors need a signed-in workspace, and this deployment has no workspace store." });
    return;
  }

  const user = await authenticate(req);
  if (!user) { res.status(401).json({ error: "Sign in to sync from a connected platform." }); return; }

  if (await guardRateLimit(req, res, {
    key: `gos:conn:${user.id}`,
    max: RATE_LIMIT_MAX,
    limitMessage: "Too many syncs. Wait a while and try again.",
    label: "Connectors",
  })) return;

  try {
    const resolved = resolveWorkspace(await membershipsFor(user.id), req.body?.workspace || null);
    if (resolved.error) { res.status(resolved.status).json({ error: resolved.error }); return; }
    if (resolved.workspace.role === "viewer") {
      res.status(403).json({ error: "You have view-only access to this workspace, so you cannot import into it." });
      return;
    }
  } catch (err) {
    console.error("connectors: membership lookup failed:", err);
    res.status(503).json({ error: "Could not reach the workspace store." });
    return;
  }

  try {
    const result = await provider.sync({ days: req.body?.days, timeoutMs: UPSTREAM_TIMEOUT_MS });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ConnectorError) { res.status(err.status).json({ error: err.message }); return; }
    if (err?.name === "TimeoutError") { res.status(504).json({ error: `${provider.label} did not answer in time. Try a shorter range.` }); return; }
    console.error("connectors: sync failed:", err);
    res.status(502).json({ error: `Could not read from ${provider.label}.` });
  }
}
