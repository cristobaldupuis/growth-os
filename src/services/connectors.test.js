import test from "node:test";
import assert from "node:assert/strict";
import { connectorStatus, syncConnector } from "./connectors.js";

const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });

test("status is null, not a throw, when the endpoint is unreachable", async () => {
  assert.equal(await connectorStatus(async () => { throw new Error("offline"); }), null);
  assert.deepEqual(await connectorStatus(reply(200, { connectors: { klaviyo: { configured: true } } })), { klaviyo: { configured: true } });
});

test("a sync posts the provider and window, and surfaces the server's reason on failure", async () => {
  let sent = null;
  const ok = async (url, init) => { sent = { url, body: JSON.parse(init.body), headers: init.headers }; return { ok: true, status: 200, json: async () => ({ rows: [] }) }; };
  await syncConnector("klaviyo", 30, ok);
  assert.equal(sent.url, "/api/connectors");
  assert.deepEqual(sent.body, { provider: "klaviyo", days: 30 });
  assert.equal(sent.headers["Content-Type"], "application/json", "headers were awaited, not a Promise");
  await assert.rejects(() => syncConnector("klaviyo", 30, reply(403, { error: "You have view-only access" })), /view-only/);
});
