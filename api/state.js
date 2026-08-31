// api/state.js — the workspace's durable state. ROADMAP Phase 2.0.
//
// ## What this replaces
//
// `localStorage`, for the state that is the client's rather than the device's.
// The forcing condition is in supabase/migrations/0005_workspace.sql and is worth
// repeating here: performance rows were capped at 5,000 with the oldest dropped
// on merge, so the one feature no competitor has was the one throwing away
// history. Everything else in this endpoint follows from wanting that fixed
// without also rewriting the app.
//
// ## Two shapes, on purpose
//
// DOCUMENTS for operator-authored state — initiatives, settings, agenda, debates,
// recommendations, creative, asset records, the usage ledger. Read whole, written
// whole, one JSONB row each, exactly the contract `store.get`/`store.set` already
// has. Bounded by how much a person types.
//
// ROWS for performance facts, because that is the collection that grows without
// anybody doing anything and the one that was being truncated.
//
// The reasoning for not normalising the rest now is in the migration header. Short
// version: every read path in src/services/ is a synchronous pure function over an
// in-memory array with 569 tests written against that shape, and normalising turns
// a storage change into an async rewrite of the app.
//
// ## Why the server holds the key instead of the browser talking to PostgREST
//
// Supabase's idiomatic path is a browser client with the publishable key, RLS
// doing the enforcing. That would work — the policies in 0005 are written for it,
// deliberately. It is not what ships here for two reasons. This project's runtime
// dependencies are react and react-dom, and every other service is reached with
// `fetch` and a header rather than a vendor client. And the proxy needs to verify
// the same token anyway to rate limit per person, so there is one auth path in
// the codebase instead of two that can disagree.
//
// RLS is still on. See the policy block in the migration for why a control the
// server also performs is worth having in the database.

import { guardEntry, guardRateLimit, clientIp } from "./_guard.js";
import {
  restBase, authHeaders, supabaseConfigured, authConfigured, authBase, publishableKey, rpc,
} from "./_supabase.js";
import { authenticate, membershipsFor, resolveWorkspace } from "./_auth.js";

// Documents are small; a portfolio of a few hundred initiatives is well under a
// megabyte of JSON. Performance rows arrive chunked (see MAX_ROWS below), so this
// bounds a chunk rather than an import.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// Rows per request. An ad-level Meta month is tens of thousands of rows, which is
// past both Vercel's body limit and the point where one failed request loses an
// unreasonable amount of work. The client chunks; each chunk is idempotent
// because the upsert is keyed on `row_key`, so a retry of a chunk that partly
// landed converges rather than duplicating.
export const MAX_ROWS = 2000;

// PostgREST's default page size. Load pages until a short page arrives.
const PAGE = 1000;

const TIMEOUT_MS = 8000;

/**
 * The document keys this endpoint will store, which are the store keys that
 * belong to the CLIENT rather than to the device.
 *
 * An allowlist rather than "any key the app sends" because this is a write path
 * reachable by anyone with a session, and an unbounded key space is an unbounded
 * table. The four excluded keys — theme, library view, rail collapsed, tour seen —
 * are per-device preferences and are correct in `localStorage`; syncing them would
 * mean collapsing someone's sidebar because a colleague collapsed theirs.
 * `gos_perf_v1` is absent because performance rows are the table below, not a
 * document.
 */
export const DOC_KEYS = new Set([
  "gos_items_v4",
  "gos_settings_v2",
  "gos_debates_v1",
  "gos_metrics_v1",
  "gos_recs_v1",
  "gos_creative_v1",
  "gos_assets_v1",
  "gos_usage_v1",
  "gos_agenda_v1",
]);

/**
 * One performance row, reduced to the facts. See the migration on why no parse.
 *
 * `rowKey` is supplied by the caller rather than recomputed here, and must be
 * `perfRowKey(row)` from src/services/performance.js. Deriving it server-side
 * would mean a second implementation of `normKey` that can drift from the one the
 * importer dedupes with — and the two disagreeing produces duplicate rows for the
 * same entity-day, which reads as real spend.
 */
export function toRow(workspaceId, r) {
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  return {
    workspace_id: workspaceId,
    row_key: String(r.rowKey || ""),
    name: String(r.name || ""),
    level: String(r.level || ""),
    channel: r.channel == null ? null : String(r.channel),
    date,
    campaign_name: String(r.campaignName || ""),
    adset_name: String(r.adsetName || ""),
    metrics: r.metrics && typeof r.metrics === "object" ? r.metrics : {},
  };
}

/** The wire shape the app reads back, matching what parsePerformanceCSV produces. */
export function fromRow(row) {
  return {
    name: row.name,
    level: row.level,
    channel: row.channel,
    date: row.date || "",
    campaignName: row.campaign_name || "",
    adsetName: row.adset_name || "",
    metrics: row.metrics || {},
  };
}

async function pgFetch(path, init = {}) {
  const res = await fetch(`${restBase()}${path}`, {
    ...init,
    headers: { ...authHeaders(), "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`postgrest ${path.split("?")[0]} returned ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
  return res;
}

// -- Actions -------------------------------------------------------------------

async function handleLoad(res, workspace) {
  const docRes = await pgFetch(
    `/workspace_docs?workspace_id=eq.${workspace.id}&select=key,value,revision`,
  );
  const docs = {};
  for (const row of await docRes.json()) {
    if (DOC_KEYS.has(row.key)) docs[row.key] = { value: row.value, revision: row.revision };
  }

  // Paged rather than fetched in one request, because the whole point of this
  // migration is that there is no longer a ceiling on how many of these there
  // are. Newest first, matching mergePerformanceRows' ordering so the app's
  // in-memory array is in the order its own code produces.
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await (await pgFetch(
      `/performance_rows?workspace_id=eq.${workspace.id}` +
      `&select=row_key,name,level,channel,date,campaign_name,adset_name,metrics` +
      `&order=date.desc.nullslast&limit=${PAGE}&offset=${offset}`,
    )).json();
    rows.push(...page.map(fromRow));
    if (page.length < PAGE) break;
  }

  res.status(200).json({
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name, role: workspace.role },
    docs,
    perfRows: rows,
  });
}

async function handleSaveDoc(req, res, workspace, user) {
  const key = String(req.body?.key || "");
  if (!DOC_KEYS.has(key)) { res.status(400).json({ error: "Unknown state key." }); return; }
  if (req.body?.value === undefined) { res.status(400).json({ error: "No value supplied." }); return; }

  const revision = Number(req.body?.revision);
  if (!Number.isInteger(revision) || revision < 0) {
    res.status(400).json({ error: "A revision is required. Send 0 to create." });
    return;
  }

  const next = await rpc("bump_workspace_doc", {
    p_workspace: workspace.id,
    p_key: key,
    p_value: req.body.value,
    p_revision: revision,
    p_user: user.id,
  });

  // NULL means the stored revision moved under us — somebody else saved first.
  // Answered as a conflict with the current state attached, so the app can
  // reconcile rather than ask the person to retype. Reporting this as a success
  // would be the failure store.js already refuses for quota errors: a save that
  // did not happen must never be reported as one.
  if (next === null || next === undefined) {
    const current = await (await pgFetch(
      `/workspace_docs?workspace_id=eq.${workspace.id}&key=eq.${encodeURIComponent(key)}&select=value,revision`,
    )).json();
    res.status(409).json({
      error: "This workspace was changed somewhere else since you loaded it.",
      current: current[0] ? { value: current[0].value, revision: current[0].revision } : null,
    });
    return;
  }

  res.status(200).json({ revision: Number(next) });
}

async function handlePerfWrite(req, res, workspace, { replace }) {
  const incoming = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!incoming) { res.status(400).json({ error: "No rows supplied." }); return; }
  if (incoming.length > MAX_ROWS) {
    res.status(413).json({ error: `Send at most ${MAX_ROWS} rows per request.`, maxRows: MAX_ROWS });
    return;
  }

  const rows = incoming.map(r => toRow(workspace.id, r)).filter(r => r.row_key && r.name && r.level);
  if (rows.length !== incoming.length) {
    res.status(400).json({ error: "Every row needs a rowKey, a name and a level." });
    return;
  }

  // A replace is the whole set changing at once — a restore from backup, or a
  // demo reset. Deleting first is correct there and wrong for a merge, where the
  // import is a chunk of a larger set and the rows it does not mention must
  // survive. Two different operations rather than a flag inside one, because
  // getting that distinction wrong deletes a client's history.
  if (replace) {
    await pgFetch(`/performance_rows?workspace_id=eq.${workspace.id}`, { method: "DELETE" });
  }

  if (rows.length) {
    await pgFetch(`/performance_rows?on_conflict=workspace_id,row_key`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  }

  const countRes = await pgFetch(
    `/performance_rows?workspace_id=eq.${workspace.id}&select=row_key`,
    { headers: { Prefer: "count=exact", Range: "0-0" } },
  );
  const total = Number(String(countRes.headers.get("content-range") || "").split("/")[1]) || null;

  res.status(200).json({ written: rows.length, total });
}

// -- Handler -------------------------------------------------------------------

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES, methods: ["GET", "POST"] })) return;

  const action = req.method === "GET"
    ? String(req.query?.action || "status")
    : String(req.body?.action || "load");

  // Answered before authentication, and without one, for the same reason
  // api/asset.js answers `status` before its configuration check: "can this
  // deployment store anything durably" is exactly the question a deployment
  // without it needs answered, and the app has to know before it decides whether
  // to run on the browser store.
  if (action === "status") {
    // The auth config travels with the status, so the app makes one request at
    // boot rather than two, and so nothing about the project is compiled into the
    // bundle. The password never passes through this function: the browser takes
    // these two values and talks to Supabase Auth directly, which keeps this
    // deployment out of the credential path entirely.
    res.status(200).json({
      configured: supabaseConfigured(),
      auth: authConfigured() ? { url: authBase(), key: publishableKey() } : null,
    });
    return;
  }

  if (!supabaseConfigured()) {
    res.status(503).json({ error: "This deployment has no durable state configured." });
    return;
  }

  const user = await authenticate(req);
  if (!user) { res.status(401).json({ error: "Sign in to load this workspace." }); return; }

  // Per user, not per IP. That is the whole point of the forcing condition this
  // closes — a shared office NAT is one identity to an IP-keyed limiter, and a
  // person on a phone is a new one every few minutes. Generous, because this
  // bounds a runaway client rather than metered spend; the tight ceilings stay
  // on the endpoints that cost money per call.
  if (await guardRateLimit(req, res, {
    key: `gos:state:${user.id}`,
    max: 600,
    limitMessage: "Too many state requests. Wait a minute and try again.",
    label: "state",
  })) return;

  let workspace;
  try {
    const memberships = await membershipsFor(user.id);
    const resolved = resolveWorkspace(memberships, req.body?.workspace || req.query?.workspace || null);
    if (resolved.error) {
      res.status(resolved.status).json({ error: resolved.error, ...(resolved.choices ? { choices: resolved.choices } : {}) });
      return;
    }
    workspace = resolved.workspace;
  } catch (err) {
    console.error("state: membership lookup failed:", err, "ip:", clientIp(req));
    res.status(503).json({ error: "Could not reach the workspace store." });
    return;
  }

  try {
    if (action === "load")        return await handleLoad(res, workspace);
    if (action === "saveDoc")     return await handleSaveDoc(req, res, workspace, user);
    if (action === "perfMerge")   return await handlePerfWrite(req, res, workspace, { replace: false });
    if (action === "perfReplace") return await handlePerfWrite(req, res, workspace, { replace: true });
    res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    // Logged with the workspace and the action, never with the payload: the
    // payload is the client's business data and logs are the one place it has no
    // reason to be.
    console.error(`state: ${action} failed for workspace ${workspace.id}:`, err);
    res.status(503).json({ error: "Could not reach the workspace store." });
  }
}
