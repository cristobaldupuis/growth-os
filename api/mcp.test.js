// Tests for api/mcp.js and api/_mcpTools.js — the JSON-RPC message shaping
// and the tool catalogue's own contract. Only the branches that never touch
// PostgREST are exercised here, matching this codebase's existing test depth
// (see api/state.test.js's header): `tools/call` against a real tool would
// need a network double this suite does not otherwise use, but the gate
// checks inside `callTool` — unknown tool, insufficient scope — run and throw
// before any fetch happens, so those are real coverage, not a stub.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, isNotification, rpcError, rpcResult } from "./mcp.js";
import { TOOLS, callTool, ToolError, ALLOWED_PATCH_KEYS } from "./_mcpTools.js";

const ctx = (scope = "read write") => ({ userId: "u1", workspaceId: "w1", role: "member", scope });

// -- JSON-RPC envelope shape ---------------------------------------------------

test("rpcResult and rpcError are well-formed JSON-RPC 2.0 envelopes", () => {
  assert.deepEqual(rpcResult(1, { ok: true }), { jsonrpc: "2.0", id: 1, result: { ok: true } });
  assert.deepEqual(rpcError(1, -32601, "nope"), { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "nope" } });
});

test("rpcError never sends undefined as the id", () => {
  assert.equal(rpcError(undefined, -32600, "bad").id, null);
});

test("isNotification is true only when id is genuinely absent", () => {
  assert.equal(isNotification({ method: "notifications/initialized" }), true);
  assert.equal(isNotification({ method: "ping", id: 0 }), false); // 0 is a real id
  assert.equal(isNotification({ method: "ping", id: null }), false); // explicit null id is still a request
  assert.equal(isNotification({ method: "ping", id: "abc" }), false);
});

// -- dispatch: the network-free methods ---------------------------------------

test("initialize echoes a supported protocol version", async () => {
  const res = await dispatch(ctx(), { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assert.equal(res.result.protocolVersion, "2025-03-26");
  assert.deepEqual(res.result.capabilities, { tools: {} });
  assert.equal(res.result.serverInfo.name, "marketers-lab");
});

test("initialize falls back to the current version rather than echoing an unknown one", async () => {
  const res = await dispatch(ctx(), { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(res.result.protocolVersion, "2025-06-18");
});

test("ping returns an empty result", async () => {
  const res = await dispatch(ctx(), { jsonrpc: "2.0", id: 2, method: "ping" });
  assert.deepEqual(res.result, {});
});

test("tools/list enumerates the whole catalogue with a name, description and schema", async () => {
  const res = await dispatch(ctx(), { jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.equal(res.result.tools.length, TOOLS.length);
  for (const t of res.result.tools) {
    assert.equal(typeof t.name, "string");
    assert.equal(typeof t.description, "string");
    assert.equal(t.inputSchema.type, "object");
  }
});

test("an unknown method is a JSON-RPC Method not found error", async () => {
  const res = await dispatch(ctx(), { jsonrpc: "2.0", id: 4, method: "not/a/method" });
  assert.equal(res.error.code, -32601);
});

test("tools/call against an unknown tool name reports isError without touching the network", async () => {
  const res = await dispatch(ctx(), { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "not_a_real_tool", arguments: {} } });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unknown tool/);
});

test("tools/call against a write tool on a read-only connection is refused before it runs", async () => {
  const res = await dispatch(ctx("read"), { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "create_initiative", arguments: {} } });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /read-only/);
});

// -- The tool catalogue itself --------------------------------------------------

test("every tool name is unique", () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test("every tool declares a read or write scope", () => {
  for (const t of TOOLS) assert.ok(["read", "write"].includes(t.scope), t.name);
});

test("the two mutating tools are the only ones scoped to write", () => {
  const writeTools = TOOLS.filter((t) => t.scope === "write").map((t) => t.name).sort();
  assert.deepEqual(writeTools, ["create_initiative", "update_initiative"]);
});

test("no tool reaches an ad platform — the catalogue is the ledger, nothing else", () => {
  // A cheap but real regression guard: if this ever fails, someone added a
  // tool whose name suggests it mutates Meta/Google Ads directly, which is
  // exactly what DECISIONS.md's proposal-gate rule forbids a direct call to.
  for (const t of TOOLS) {
    assert.doesNotMatch(t.name.toLowerCase(), /meta|google_ads|campaign_budget|pause_ad|publish/);
  }
});

// -- callTool: the gates that run before any handler does ---------------------

test("callTool refuses an unknown tool", async () => {
  await assert.rejects(() => callTool(ctx(), "does_not_exist", {}), ToolError);
});

test("callTool refuses a write tool on a read-only connection", async () => {
  await assert.rejects(() => callTool(ctx("read"), "update_initiative", { id: "x", patch: {} }), /read-only/);
});

test("callTool lets a read tool through on a read-only connection's scope gate", async () => {
  // Only the gate is under test — it must NOT throw for a read tool on a
  // read-only connection. It will go on to fail on the network call this test
  // environment has none of, which is a different, expected failure and
  // proves the gate did not stop it.
  await assert.rejects(() => callTool(ctx("read"), "whoami", {}), (err) => !(err instanceof ToolError));
});

test("update_initiative's schema names exactly the keys the handler allows", () => {
  const tool = TOOLS.find((t) => t.name === "update_initiative");
  for (const key of ALLOWED_PATCH_KEYS) assert.match(tool.inputSchema.properties.patch.description, new RegExp(key));
});

// -- Viewer role (0008_viewer_role.sql) ------------------------------------------

test("callTool refuses a write tool to a viewer even on a write-scoped token", async () => {
  // A member demoted to viewer after connecting still holds a write-scoped token
  // until it expires; the role read on this call is what decides.
  const viewer = { ...ctx("read write"), role: "viewer" };
  await assert.rejects(() => callTool(viewer, "update_initiative", { id: "x", patch: {} }), /view-only/);
  await assert.rejects(() => callTool(viewer, "create_initiative", {}), /view-only/);
});

test("a viewer's token is capped at read scope when it is minted", async () => {
  const { scopeForRole } = await import("./_oauth.js");
  assert.equal(scopeForRole("read write", "viewer"), "read");
  assert.equal(scopeForRole("read write", "member"), "read write");
  assert.equal(scopeForRole("read write", "owner"), "read write");
});
