// api/mcp.js — the MCP connector. ROADMAP: MCP connector (September 2026).
//
// A hand-rolled Streamable HTTP transport (the MCP spec's current remote
// transport) rather than the `@modelcontextprotocol/sdk` package. Every other
// provider this app reaches is `fetch` and a header rather than a vendor
// client (see api/_supabase.js, api/_geminiAuth.js) — this is a case where
// that habit is worth writing down as a deliberate call rather than an
// accident, because getting a WIRE PROTOCOL subtly wrong is silent breakage
// against real clients this deployment cannot single-step through here. The
// surface actually needed is small and specification-bounded (initialize,
// tools/list, tools/call, ping, one notification), so it is implemented
// directly. See DECISIONS.md.
//
// ## Why every call re-checks auth, and why there is no session state here
//
// The spec allows a server to assign an `Mcp-Session-Id` and hold state
// against it. This server does not: every one of its tools re-derives
// everything it needs from the bearer token on THIS request (see
// `verifyAccessToken` in api/_oauth.js, which itself rechecks workspace
// membership rather than trusting what was true when the token was minted).
// That statelessness is not a missing feature — it is what makes this
// function safe to run as an ordinary serverless invocation with no session
// affinity, which is the only shape Vercel offers.

import {
  verifyAccessToken, originOf, bodyTooLarge,
} from "./_oauth.js";
import { guardRateLimit } from "./_guard.js";
import { supabaseConfigured } from "./_supabase.js";
import { TOOLS, callTool, ToolError } from "./_mcpTools.js";

const MAX_BODY_BYTES = 256 * 1024;
const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26"];

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Protocol-Version");
}

export const isNotification = (msg) => msg && typeof msg === "object" && msg.id === undefined;

export function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } };
}

export function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

/** Exported for tests. The branches that never touch the network (everything
 * but a real tools/call) are exercised directly, matching this codebase's
 * existing test depth — see api/state.test.js's header. */
export async function dispatch(ctx, msg) {
  const { method, params, id } = msg;

  if (method === "initialize") {
    const requested = params && params.protocolVersion;
    const version = SUPPORTED_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION;
    return rpcResult(id, {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: { name: "marketers-lab", version: "1.0.0" },
    });
  }

  if (method === "ping") return rpcResult(id, {});

  if (method === "tools/list") {
    return rpcResult(id, {
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }

  if (method === "tools/call") {
    const name = params && params.name;
    try {
      const value = await callTool(ctx, name, params && params.arguments);
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError: false });
    } catch (err) {
      if (err instanceof ToolError) {
        return rpcResult(id, { content: [{ type: "text", text: err.message }], isError: true });
      }
      console.error(`mcp: tool "${name}" failed:`, err);
      return rpcResult(id, { content: [{ type: "text", text: "This tool failed unexpectedly. Try again." }], isError: true });
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") {
    // The Streamable HTTP spec allows GET to open a server-push stream and
    // DELETE to end a session; this server offers neither, and 405 is the
    // spec-correct answer for a capability it does not provide.
    res.status(405).json({ error: "This endpoint only accepts POST." });
    return;
  }
  if (!supabaseConfigured()) {
    res.status(503).json({ error: "This deployment has no durable state configured." });
    return;
  }
  if (bodyTooLarge(req, MAX_BODY_BYTES)) {
    res.status(413).json({ error: "Request body too large." });
    return;
  }

  const ctx = await verifyAccessToken(req);
  if (!ctx) {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource"`);
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (await guardRateLimit(req, res, {
    key: `gos:mcp:call:${ctx.userId}`,
    max: 300,
    limitMessage: "Too many MCP calls. Wait a minute and try again.",
    label: "mcp",
  })) return;

  // Batching (a JSON array of messages) was part of JSON-RPC as MCP used it
  // through the 2025-03-26 revision and was removed in 2025-06-18. Refusing
  // it outright is simpler than half-supporting a form the current spec
  // dropped, and no first-party client sends it.
  const body = req.body;
  if (Array.isArray(body)) {
    res.status(400).json(rpcError(null, -32600, "Batch requests are not supported."));
    return;
  }
  if (!body || typeof body !== "object" || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    res.status(400).json(rpcError(body && body.id, -32600, "Invalid Request."));
    return;
  }

  if (isNotification(body)) {
    // No response body for a notification — the client is not waiting on
    // one, and `notifications/initialized` is the only one this server
    // expects to receive.
    res.status(202).end();
    return;
  }

  const response = await dispatch(ctx, body);
  res.status(200).json(response);
}
