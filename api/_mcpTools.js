// api/_mcpTools.js — what an MCP client can actually do to a workspace.
//
// ## Scope: the ledger, never an ad platform
//
// Every tool here reads or writes the SAME documents and rows api/state.js
// already serves the browser app — `gos_items_v4`, `gos_agenda_v1`, and
// `performance_rows` — through the identical revision-checked write path
// (`bump_workspace_doc`). There is no tool that reaches Meta, Google Ads, or
// any execution surface. DECISIONS.md's "Write access to ad platforms goes
// through a proposal gate, never a direct tool call" is about spend that is
// not reversible by editing code; writing your own initiative through Claude
// is exactly as reversible as writing it through the form in the browser,
// because it is the same table, the same person, and the same undo (edit it
// again). That boundary is why this file has no ad-platform tool and never
// will — see the DECISIONS.md entry for the MCP connector.
//
// ## Reuse over reimplementation
//
// The pre-registration gate, the kill-criteria gate and the learnings index
// (with retraction) are real product rules with real product reasoning behind
// them (see ROADMAP.md 5.1/5.2/5.8). Reimplementing a looser version here for
// convenience would mean an MCP-created initiative or an MCP-read learning
// obeys different rules than the same data read through the browser — so this
// file imports the same pure functions src/views/FormView.jsx and
// src/views/AgendaView.jsx call, rather than restating them.

import {
  validateInitiative, PROMPTS,
} from "../src/services/preregistration.js";
import { killGateBlocked } from "../src/services/killGate.js";
import { agendaRollup } from "../src/services/learningAgenda.js";
import { buildLearningsIndex } from "../src/services/portfolio.js";
import { pgFetch, scopeHas } from "./_oauth.js";
import { rpc } from "./_supabase.js";

/** Thrown for a tool-level failure the CALLER can fix (bad input, a gate not
 * cleared, not found) — surfaced as a normal (isError) tool result rather
 * than a JSON-RPC protocol error, which is what MCP clients expect a "the
 * tool ran and declined" outcome to look like. */
export class ToolError extends Error {}

const DOC_ITEMS = "gos_items_v4";
const DOC_AGENDA = "gos_agenda_v1";

// -- Document read/write, mirroring api/state.js's contract ------------------

async function readDoc(workspaceId, key) {
  const res = await pgFetch(`/workspace_docs?workspace_id=eq.${workspaceId}&key=eq.${encodeURIComponent(key)}&select=value,revision`);
  const rows = await res.json();
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row ? { value: row.value, revision: Number(row.revision) } : { value: null, revision: 0 };
}

/**
 * Read-modify-write with optimistic-concurrency retry, same shape the
 * browser's save path gets from `bump_workspace_doc` — a 409 means someone
 * else (the browser, or another MCP call) wrote first, so this re-reads and
 * reapplies `mutate` against the current value rather than clobbering it.
 */
async function writeDoc(workspaceId, key, userId, mutate) {
  const ATTEMPTS = 3;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const { value, revision } = await readDoc(workspaceId, key);
    const next = mutate(value);
    const nextRevision = await rpc("bump_workspace_doc", {
      p_workspace: workspaceId, p_key: key, p_value: next, p_revision: revision, p_user: userId,
    });
    if (nextRevision !== null && nextRevision !== undefined) return next;
  }
  throw new ToolError("The workspace changed too many times while saving this. Try again.");
}

// -- Shared trimming -----------------------------------------------------------

const summarize = (it) => ({
  id: it.id, initId: it.initId || it.id, title: it.title, status: it.status,
  category: it.category, initType: it.initType, owner: it.owner || null,
  successMetric: it.successMetric, killCriteria: it.killCriteria || null,
  agendaId: it.agendaId || null, riskType: it.riskType || null,
  startDate: it.startDate || null, endDate: it.endDate || null,
  revenueImpact: it.revenueImpact ?? null, ice: it.ice || null,
  createdAt: it.createdAt || null, updatedAt: it.updatedAt || null,
  hasLearning: !!(it.results && it.results.keyLearning),
});

function findItem(items, id) {
  const item = (items || []).find((e) => e.id === id || e.initId === id);
  if (!item) throw new ToolError(`No initiative with id "${id}".`);
  return item;
}

// -- Tools -----------------------------------------------------------------

export const ALLOWED_PATCH_KEYS = [
  "title", "hypothesis", "observation", "successMetric", "category", "initType", "owner",
  "primaryMetric", "killCriteria", "status", "riskType", "agendaId", "startDate", "endDate",
  "ice", "revenueImpact", "spendCost", "resourceCost", "notes", "blocker",
  "measurementMetric", "measurementScope", "trackingTag", "results",
];

export const TOOLS = [
  {
    name: "whoami",
    description: "The signed-in user and workspace this connection is scoped to.",
    scope: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_initiatives",
    description: "List initiatives (experiments) in this workspace, optionally filtered.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Exact status match, e.g. Draft, Running, Completed, Killed." },
        category: { type: "string" },
        q: { type: "string", description: "Case-insensitive substring match against the title." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_initiative",
    description: "The full record for one initiative, including hypothesis, results and evidence.",
    scope: "read",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "create_initiative",
    description:
      "Create a new Draft initiative. title, observation, hypothesis and successMetric are all required — " +
      "this is the same pre-registration gate the app's own form enforces, and it is not relaxed here.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        observation: { type: "string", description: PROMPTS.observation },
        hypothesis: { type: "string", description: PROMPTS.hypothesis },
        successMetric: { type: "string", description: PROMPTS.successMetric },
        category: { type: "string" },
        initType: { type: "string" },
        owner: { type: "string" },
        agendaId: { type: "string", description: "Link this initiative to an existing learning-agenda question." },
      },
      required: ["title", "observation", "hypothesis", "successMetric"],
      additionalProperties: false,
    },
  },
  {
    name: "update_initiative",
    description:
      "Patch fields on an existing initiative. Moving status to Running without killCriteria set " +
      "(in this same call or already on the record) is refused, same as the app.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        patch: {
          type: "object",
          description: `Allowed keys: ${ALLOWED_PATCH_KEYS.join(", ")}.`,
          additionalProperties: true,
        },
      },
      required: ["id", "patch"],
      additionalProperties: false,
    },
  },
  {
    name: "list_agenda",
    description: "The learning agenda — open questions and, for each, how many initiatives ladder up to it.",
    scope: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_learnings",
    description:
      "Closed initiatives with a recorded learning. Retracted learnings (superseded by a later, " +
      "contradicting result) are excluded — same rule the Learning Library and Signal AI use.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        q: { type: "string", description: "Case-insensitive substring match against the learning text or title." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_performance_summary",
    description: "Spend, conversions, revenue and derived ratios from imported performance rows. Aggregation runs in Postgres, so results cover the full matching dataset without a browser row cap.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string" },
        dateFrom: { type: "string", description: "YYYY-MM-DD, inclusive." },
        dateTo: { type: "string", description: "YYYY-MM-DD, inclusive." },
              },
      additionalProperties: false,
    },
  },
];

const HANDLERS = {
  async whoami(ctx) {
    const res = await pgFetch(`/workspaces?id=eq.${ctx.workspaceId}&select=slug,name`);
    const rows = await res.json();
    const ws = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return {
      userId: ctx.userId, workspace: ws ? { id: ctx.workspaceId, ...ws } : { id: ctx.workspaceId },
      role: ctx.role, scope: ctx.scope,
    };
  },

  async list_initiatives(ctx, args) {
    const { value: items } = await readDoc(ctx.workspaceId, DOC_ITEMS);
    const list = Array.isArray(items) ? items : [];
    const q = args.q ? String(args.q).toLowerCase() : null;
    const filtered = list.filter((it) =>
      (!args.status || it.status === args.status) &&
      (!args.category || it.category === args.category) &&
      (!q || String(it.title || "").toLowerCase().includes(q)));
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
    return { total: filtered.length, returned: Math.min(filtered.length, limit), items: filtered.slice(0, limit).map(summarize) };
  },

  async get_initiative(ctx, args) {
    const { value: items } = await readDoc(ctx.workspaceId, DOC_ITEMS);
    return findItem(items, args.id);
  },

  async create_initiative(ctx, args) {
    const form = { _new: true, title: args.title, observation: args.observation, hypothesis: args.hypothesis, successMetric: args.successMetric };
    const { missing, blocking } = validateInitiative(form);
    if (blocking) {
      throw new ToolError(`Missing required field(s): ${missing.map((m) => `${m.label} — ${PROMPTS[m.key]}`).join("; ")}`);
    }

    const record = {
      id: "e-" + Date.now(), title: args.title, hypothesis: args.hypothesis,
      observation: args.observation, successMetric: args.successMetric,
      category: args.category || "", initType: args.initType || "A/B Test", owner: args.owner || "",
      primaryMetric: "", killCriteria: "", status: "Draft", riskType: "", agendaId: args.agendaId || null,
      startDate: "", endDate: "", ice: { impact: 5, certainty: 5, ease: 5 },
      revenueImpact: 0, spendCost: 0, resourceCost: 0, linkedIds: [], results: null, evidence: [],
      createdAt: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString(), notes: "",
      brandId: "default", blocker: "None", measurementMetric: "", measurementScope: "", trackingTag: "", adNames: [],
    };

    await writeDoc(ctx.workspaceId, DOC_ITEMS, ctx.userId, (current) => [...(Array.isArray(current) ? current : []), record]);
    return record;
  },

  async update_initiative(ctx, args) {
    const patchKeys = Object.keys(args.patch || {});
    const unknown = patchKeys.filter((k) => !ALLOWED_PATCH_KEYS.includes(k));
    if (unknown.length) throw new ToolError(`Unknown patch field(s): ${unknown.join(", ")}. Allowed: ${ALLOWED_PATCH_KEYS.join(", ")}.`);

    let updated;
    await writeDoc(ctx.workspaceId, DOC_ITEMS, ctx.userId, (current) => {
      const items = Array.isArray(current) ? current : [];
      const existing = findItem(items, args.id);
      const nextStatus = args.patch.status || existing.status;
      const nextKillCriteria = "killCriteria" in args.patch ? args.patch.killCriteria : existing.killCriteria;
      if (killGateBlocked(nextStatus, existing.status, nextKillCriteria)) {
        throw new ToolError("Cannot move to Running without kill criteria. Include killCriteria in this same update.");
      }
      updated = { ...existing, ...args.patch, updatedAt: new Date().toISOString() };
      return items.map((it) => (it.id === existing.id ? updated : it));
    });
    return updated;
  },

  async list_agenda(ctx) {
    const [{ value: agenda }, { value: items }] = await Promise.all([
      readDoc(ctx.workspaceId, DOC_AGENDA), readDoc(ctx.workspaceId, DOC_ITEMS),
    ]);
    const rollup = agendaRollup(Array.isArray(agenda) ? agenda : [], Array.isArray(items) ? items : []);
    return rollup.map((a) => ({
      ...a,
      linked: (a.linked || []).map((it) => ({ id: it.id, title: it.title, status: it.status })),
    }));
  },

  async list_learnings(ctx, args) {
    const { value: items } = await readDoc(ctx.workspaceId, DOC_ITEMS);
    const learnings = buildLearningsIndex(Array.isArray(items) ? items : [], []);
    const q = args.q ? String(args.q).toLowerCase() : null;
    const filtered = learnings.filter((l) =>
      (!args.category || l.category === args.category) &&
      (!q || String(l.title || "").toLowerCase().includes(q) || String(l.learning || "").toLowerCase().includes(q)));
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
    return { total: filtered.length, returned: Math.min(filtered.length, limit), learnings: filtered.slice(0, limit) };
  },

  async get_performance_summary(ctx, args) {
    const validDate = (value) => value == null || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
    if (!validDate(args.dateFrom) || !validDate(args.dateTo)) {
      throw new ToolError("dateFrom and dateTo must be YYYY-MM-DD.");
    }
    if (args.dateFrom && args.dateTo && String(args.dateFrom) > String(args.dateTo)) {
      throw new ToolError("dateFrom must be on or before dateTo.");
    }

    return rpc("performance_summary", {
      p_workspace: ctx.workspaceId,
      p_channel: args.channel ? String(args.channel) : null,
      p_date_from: args.dateFrom ? String(args.dateFrom) : null,
      p_date_to: args.dateTo ? String(args.dateTo) : null,
    });
  },
};

/** Run one tool call. Throws ToolError for a caller-fixable failure. */
export async function callTool(ctx, name, rawArgs) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ToolError(`Unknown tool "${name}".`);
  if (!scopeHas(ctx.scope, tool.scope)) {
    throw new ToolError(
      tool.scope === "write"
        ? "This connection is read-only. Reconnect with write access to use this tool."
        : "This connection does not have read access.",
    );
  }
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  return HANDLERS[name](ctx, args);
}
