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
import routingHandler from "./_routingRead.js";

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

/** Actions that change the workspace — refused for a `viewer` (0008_viewer_role.sql). */
export const WRITE_ACTIONS = new Set([
  "saveDoc", "perfMerge", "perfReplace", "perfStage", "perfCommit",
  "memberAdd", "memberRole", "memberRemove",
]);

export const ROLES = new Set(["owner", "member", "viewer"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when changing `userId` to `nextRole` (null for removal) would leave the
 * workspace with no owner. A workspace nobody can manage is only recoverable
 * from the SQL editor, so the last owner cannot demote or remove themselves.
 */
export function lastOwnerBlocked(members, userId, nextRole) {
  const target = members.find(m => m.user_id === userId);
  if (!target || target.role !== "owner" || nextRole === "owner") return false;
  return members.filter(m => m.role === "owner").length <= 1;
}

// How old a staged batch may be when it is committed. A save of the largest
// set this app holds is a few dozen chunk requests; an hour is generous, and a
// ceiling at all stops a stale or forged batch time from being used to delete
// everything imported since it.
export const BATCH_MAX_AGE_MS = 60 * 60 * 1000;

/** The batch time from a request, or null when it is missing, malformed or stale. */
export function validBatch(raw, now = Date.now()) {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t) || t > now + 5000 || now - t > BATCH_MAX_AGE_MS) return null;
  return raw;
}

/** True when this membership may not perform `action`. */
export const readOnlyRefuses = (role, action) => role === "viewer" && WRITE_ACTIONS.has(action);

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

async function handleLoad(res, workspace, memberships = []) {
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
    // Every workspace this account is seated in, for the Workspace panel's
    // switcher. Names and roles only — nothing from inside the others.
    workspaces: memberships.map(m => ({ id: m.id, slug: m.slug, name: m.name, role: m.role })),
    docs,
    perfRows: rows,
  });
}

/**
 * The documents that have moved since the caller last saw them.
 *
 * `since` maps a doc key to the revision the caller holds. Answers only the
 * keys whose stored revision differs (or that the caller has never seen), so the
 * app can poll for someone else's edits — a colleague, or Claude through the MCP
 * connector — without re-downloading the workspace and its performance rows.
 * Two reads rather than one so an idle poll moves revisions, not values.
 */
export async function handleDocs(req, res, workspace) {
  const since = req.body?.since && typeof req.body.since === "object" ? req.body.since : {};
  const revs = await (await pgFetch(
    `/workspace_docs?workspace_id=eq.${workspace.id}&select=key,revision`,
  )).json();
  const moved = revs
    .filter(r => DOC_KEYS.has(r.key) && Number(since[r.key]) !== Number(r.revision))
    .map(r => r.key);

  const docs = {};
  if (moved.length) {
    const list = moved.map(k => `"${k}"`).join(",");
    const rows = await (await pgFetch(
      `/workspace_docs?workspace_id=eq.${workspace.id}&key=in.(${encodeURIComponent(list)})&select=key,value,revision`,
    )).json();
    for (const row of rows) docs[row.key] = { value: row.value, revision: row.revision };
  }
  res.status(200).json({ docs });
}

/**
 * Stage one chunk of a whole-set replace. ROADMAP 2.0's "honest hazard".
 *
 * The old replace deleted the workspace's rows and then inserted the new set
 * chunk by chunk, so a chunk that failed left the table with FEWER rows than
 * before — history gone until the next successful save. Staging inverts the
 * order: every chunk is upserted with `imported_at` set to one server-issued
 * batch time, and nothing is deleted until `perfCommit` removes the rows older
 * than that batch. A failure anywhere before the commit leaves the old set plus
 * whatever new rows landed: too many, never too few, and the next save
 * converges. No migration needed — `imported_at` already exists.
 *
 * The first chunk sends no batch and receives one; the rest send it back.
 */
export async function handlePerfStage(req, res, workspace) {
  const batch = req.body?.batch == null ? new Date().toISOString() : validBatch(req.body.batch);
  if (!batch) { res.status(400).json({ error: "That import batch has expired. Save again." }); return; }

  const incoming = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!incoming) { res.status(400).json({ error: "No rows supplied." }); return; }
  if (incoming.length > MAX_ROWS) {
    res.status(413).json({ error: `Send at most ${MAX_ROWS} rows per request.`, maxRows: MAX_ROWS });
    return;
  }
  const rows = incoming.map(r => ({ ...toRow(workspace.id, r), imported_at: batch })).filter(r => r.row_key && r.name && r.level);
  if (rows.length !== incoming.length) {
    res.status(400).json({ error: "Every row needs a rowKey, a name and a level." });
    return;
  }
  if (rows.length) {
    await pgFetch(`/performance_rows?on_conflict=workspace_id,row_key`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  }
  res.status(200).json({ batch, written: rows.length });
}

/** Finish a staged replace: drop every row the batch did not rewrite. */
export async function handlePerfCommit(req, res, workspace) {
  const batch = validBatch(req.body?.batch);
  if (!batch) { res.status(400).json({ error: "That import batch has expired. Save again." }); return; }
  await pgFetch(
    `/performance_rows?workspace_id=eq.${workspace.id}&imported_at=lt.${encodeURIComponent(batch)}`,
    { method: "DELETE" },
  );
  const countRes = await pgFetch(
    `/performance_rows?workspace_id=eq.${workspace.id}&select=row_key`,
    { headers: { Prefer: "count=exact", Range: "0-0" } },
  );
  const total = Number(String(countRes.headers.get("content-range") || "").split("/")[1]);
  res.status(200).json({ total: Number.isFinite(total) ? total : null });
}

/**
 * The Workspace panel's Members list: read by anyone seated, changed only by an
 * owner. It manages seats in THIS app's table and nothing else — it finds
 * people who already have an account and never creates one, which stays with
 * Supabase Auth (see WorkspacePanel.jsx). The two lookups it needs read
 * auth.users and are service-role-only RPCs from 0008_viewer_role.sql.
 */
export async function handleMembers(req, res, workspace, user, action) {
  const list = async () => (await rpc("workspace_member_list", { p_workspace: workspace.id })) || [];
  const answer = async () => res.status(200).json({
    members: await list(), canManage: workspace.role === "owner", you: user.id,
  });

  if (action === "members") return answer();

  if (workspace.role !== "owner") {
    res.status(403).json({ error: "Only a workspace owner can change who is in it." });
    return;
  }
  const members = await list();
  const role = req.body?.role;

  if (action === "memberAdd") {
    const email = String(req.body?.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Enter an email address." }); return; }
    if (!ROLES.has(role)) { res.status(400).json({ error: "Pick a role." }); return; }
    const userId = await rpc("workspace_user_id_by_email", { p_email: email });
    if (!userId) {
      res.status(404).json({ error: "No account uses that email yet. Create one in Supabase under Authentication → Users (or have them sign up), then add them here." });
      return;
    }
    const existing = members.find(m => m.user_id === userId);
    if (existing) { res.status(409).json({ error: `Already in this workspace as ${existing.role}.` }); return; }
    await pgFetch("/workspace_members", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ workspace_id: workspace.id, user_id: userId, role }),
    });
    return answer();
  }

  const userId = String(req.body?.userId || "");
  if (!UUID.test(userId)) { res.status(400).json({ error: "Unknown member." }); return; }
  if (!members.some(m => m.user_id === userId)) { res.status(404).json({ error: "That person is not in this workspace." }); return; }
  const where = `/workspace_members?workspace_id=eq.${workspace.id}&user_id=eq.${userId}`;

  if (action === "memberRole") {
    if (!ROLES.has(role)) { res.status(400).json({ error: "Pick a role." }); return; }
    if (lastOwnerBlocked(members, userId, role)) {
      res.status(409).json({ error: "This is the only owner. Make someone else an owner first." });
      return;
    }
    await pgFetch(where, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ role }) });
    return answer();
  }

  if (action === "memberRemove") {
    if (lastOwnerBlocked(members, userId, null)) {
      res.status(409).json({ error: "This is the only owner. Make someone else an owner first." });
      return;
    }
    await pgFetch(where, { method: "DELETE" });
    return answer();
  }

  res.status(400).json({ error: "Unknown action." });
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

async function handlePerfSummary(req, res, workspace) {
  const body = req.body || {};
  const channel = body.channel ? String(body.channel) : null;
  const dateFrom = body.dateFrom ? String(body.dateFrom) : null;
  const dateTo = body.dateTo ? String(body.dateTo) : null;
  const datePattern = /^\\d{4}-\\d{2}-\\d{2}$/;
  if (dateFrom && !datePattern.test(dateFrom)) {
    res.status(400).json({ error: "dateFrom must be YYYY-MM-DD." });
    return;
  }
  if (dateTo && !datePattern.test(dateTo)) {
    res.status(400).json({ error: "dateTo must be YYYY-MM-DD." });
    return;
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    res.status(400).json({ error: "dateFrom must be on or before dateTo." });
    return;
  }

  const summary = await rpc("performance_summary", {
    p_workspace: workspace.id,
    p_channel: channel,
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });
  res.status(200).json({ summary });
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
  // The model-routing read used to be its own function (api/routing.js). It
  // lives behind this one now only to stay inside the Hobby plan's twelve
  // Serverless Functions; it keeps its own guard, cache header and handler, and
  // /api/routing still reaches it through the rewrite in vercel.json. Dispatched
  // before this endpoint's own guard because it is a GET-only, unauthenticated
  // read with a different body ceiling — and dispatched on the query alone, so a
  // POST here gets the routing read's own 405 rather than falling into state.
  if (req.query?.action === "routing") return routingHandler(req, res);

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

  let workspace, memberships;
  try {
    memberships = await membershipsFor(user.id);
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

  if (readOnlyRefuses(workspace.role, action)) {
    res.status(403).json({ error: "You have view-only access to this workspace, so changes are not saved.", readOnly: true });
    return;
  }

  try {
    if (action === "load")        return await handleLoad(res, workspace, memberships);
    if (action === "docs")        return await handleDocs(req, res, workspace);
    if (action === "saveDoc")     return await handleSaveDoc(req, res, workspace, user);
    if (action === "performanceSummary") return await handlePerfSummary(req, res, workspace);
    if (action === "members" || action.startsWith("member")) return await handleMembers(req, res, workspace, user, action);
    if (action === "perfStage")   return await handlePerfStage(req, res, workspace);
    if (action === "perfCommit")  return await handlePerfCommit(req, res, workspace);
    // perfMerge/perfReplace are the pre-staging protocol, kept so a tab still
    // running the previous bundle can save through a deploy.
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
