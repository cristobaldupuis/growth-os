import test from "node:test";
import assert from "node:assert/strict";
import { bootWorkspace, bootMessage } from "./workspaceBoot.js";

const configured = { configured: true, auth: { url: "https://p/auth/v1", key: "k" } };

/** Records attach/detach so a test can assert which store the session got. */
function spies(overrides = {}) {
  const calls = { attached: null, detached: 0 };
  return {
    calls,
    deps: {
      loadConfig: async () => configured,
      user: () => ({ id: "u1" }),
      load: async () => ({ workspace: { id: "w1", slug: "acme" }, docs: { k: "[]" }, perfRows: [{ name: "n" }] }),
      attach: (backend, docs, perfJson) => { calls.attached = { backend, docs, perfJson }; },
      detach: () => { calls.detached += 1; },
      ...overrides,
    },
  };
}

test("configured and signed in runs on the workspace store", async () => {
  const { calls, deps } = spies();
  const boot = await bootWorkspace(deps);
  assert.equal(boot.mode, "remote");
  assert.equal(boot.workspace.slug, "acme");
  assert.equal(calls.attached.docs.k, "[]");
  // Rows are cached as the JSON string store.get returns, so the load effect
  // parses one shape whichever backend answered.
  assert.deepEqual(JSON.parse(calls.attached.perfJson), [{ name: "n" }]);
});

test("a deployment with no Supabase stays on the browser store", async () => {
  const { calls, deps } = spies({ loadConfig: async () => ({ configured: false, auth: null }) });
  const boot = await bootWorkspace(deps);
  assert.equal(boot.mode, "local");
  assert.equal(boot.reason, "not-configured");
  assert.equal(calls.attached, null);
  assert.ok(calls.detached > 0);
});

test("a signed-out visitor gets the browser store and an offer to sign in", async () => {
  // This is the demo path, and it must keep working exactly as it did.
  const { calls, deps } = spies({ user: () => null });
  const boot = await bootWorkspace(deps);
  assert.equal(boot.mode, "local");
  assert.equal(boot.reason, "signed-out");
  assert.equal(boot.canSignIn, true);
  assert.equal(calls.attached, null);
});

test("the decision never reads settings, because settings come from the store", async () => {
  // Keying on workspaceMode would mean reading the browser copy to decide whether
  // to read the browser copy. The signature is the assertion: nothing here is
  // handed any settings.
  const { deps } = spies();
  const boot = await bootWorkspace(deps);
  assert.equal(boot.mode, "remote");
});

test("a failed remote load falls back rather than refusing to start", async () => {
  const { calls, deps } = spies({ load: async () => { throw new Error("gateway"); } });
  const boot = await bootWorkspace(deps);
  assert.equal(boot.mode, "local");
  assert.equal(boot.reason, "unreachable");
  assert.equal(boot.error, "gateway");
  assert.equal(calls.attached, null);
});

test("an expired session during boot reads as signed out, not as an outage", async () => {
  const { deps } = spies({ load: async () => { const e = new Error("x"); e.signedOut = true; throw e; } });
  const boot = await bootWorkspace(deps);
  assert.equal(boot.reason, "signed-out");
});

test("several workspaces and none named is surfaced with the choices", async () => {
  const choices = [{ id: "w1", slug: "acme" }, { id: "w2", slug: "beta" }];
  const { deps } = spies({ load: async () => { const e = new Error("pick"); e.choices = choices; throw e; } });
  const boot = await bootWorkspace(deps);
  assert.equal(boot.reason, "ambiguous-workspace");
  assert.deepEqual(boot.choices, choices);
});

test("an unreachable config endpoint does not stop the app booting", async () => {
  const { deps } = spies({ loadConfig: async () => { throw new Error("ECONNREFUSED"); } });
  const boot = await bootWorkspace(deps);
  assert.equal(boot.mode, "local");
  assert.equal(boot.reason, "unreachable");
});

test("every local reason says something specific, and remote says nothing", async () => {
  // Collapsing these into "offline" is how an unconfigured deployment gets
  // mistaken for a broken one.
  const seen = new Set();
  for (const reason of ["not-configured", "signed-out", "ambiguous-workspace", "unreachable"]) {
    const msg = bootMessage({ mode: "local", reason });
    assert.ok(msg && msg.length > 20, reason);
    assert.equal(seen.has(msg), false, "reasons must not share a message");
    seen.add(msg);
  }
  assert.equal(bootMessage({ mode: "remote", workspace: {} }), null);
  assert.equal(bootMessage(null), null);
});
