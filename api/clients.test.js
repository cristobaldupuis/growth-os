// Opening a client workspace is three writes against two Supabase services. The
// property that matters is that it never leaves half a client behind, so the
// failure paths are asserted as carefully as the happy one.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://proj.supabase.co";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

const { slugFrom, validateClient, createClient, listClients, inviteUser } = await import("./_clients.js");

/** A fetch stub answering by URL + method, recording every call. */
function stub(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    const key = Object.keys(routes).find(k => { const [m, frag] = k.split(" "); return m === method && url.includes(frag); });
    const r = key ? routes[key] : { status: 404, body: { message: "no route" } };
    return {
      ok: r.status >= 200 && r.status < 300, status: r.status,
      json: async () => r.body, text: async () => JSON.stringify(r.body ?? {}),
    };
  };
  impl.calls = calls;
  return impl;
}

const WS = { id: "11111111-1111-1111-1111-111111111111", slug: "acme-home", name: "Acme Home" };

test("slugs are derived from names and validated", () => {
  assert.equal(slugFrom("Acme & Co. Home"), "acme-co-home");
  assert.equal(slugFrom("Café Crème"), "cafe-creme");
  assert.equal(validateClient({ name: "Acme", slug: "acme", ownerEmail: "a@b.co" }), null);
  assert.match(validateClient({ name: "", slug: "acme", ownerEmail: "a@b.co" }), /name/);
  assert.match(validateClient({ name: "Acme", slug: "-bad", ownerEmail: "a@b.co" }), /slug/);
  assert.match(validateClient({ name: "Acme", slug: "Acme", ownerEmail: "a@b.co" }), /slug/);
  assert.match(validateClient({ name: "Acme", slug: "acme", ownerEmail: "nope" }), /email/);
});

test("a new owner is invited, then seated, and the invite lands on the app", async () => {
  const fetchImpl = stub({
    "POST /rest/v1/workspaces": { status: 201, body: [WS] },
    "POST /auth/v1/invite": { status: 200, body: { id: "user-new" } },
    "POST /rest/v1/workspace_members": { status: 201, body: null },
  });
  const out = await createClient(
    { name: "Acme Home", slug: "acme-home", ownerEmail: " lead@acme.com ", redirectTo: "https://app.example/" },
    { fetchImpl, rpcImpl: async () => null },
  );
  assert.deepEqual(out.owner, { email: "lead@acme.com", userId: "user-new", invited: true });
  const invite = fetchImpl.calls.find(c => c.url.includes("/invite"));
  assert.match(invite.url, /redirect_to=https%3A%2F%2Fapp\.example%2F/);
  assert.deepEqual(invite.body, { email: "lead@acme.com" });
  const seat = fetchImpl.calls.find(c => c.url.includes("/workspace_members"));
  assert.deepEqual(seat.body, { workspace_id: WS.id, user_id: "user-new", role: "owner" });
});

test("an existing account is seated without an invitation", async () => {
  const fetchImpl = stub({
    "POST /rest/v1/workspaces": { status: 201, body: [WS] },
    "POST /rest/v1/workspace_members": { status: 201, body: null },
  });
  const out = await createClient({ name: "Acme", slug: "acme-home", ownerEmail: "lead@acme.com" },
    { fetchImpl, rpcImpl: async () => "user-old" });
  assert.equal(out.owner.invited, false);
  assert.ok(!fetchImpl.calls.some(c => c.url.includes("/invite")));
});

test("a taken slug is refused, not suffixed", async () => {
  const fetchImpl = stub({ "POST /rest/v1/workspaces": { status: 409, body: { message: "duplicate key" } } });
  await assert.rejects(createClient({ name: "Acme", slug: "acme-home", ownerEmail: "a@b.co" }, { fetchImpl, rpcImpl: async () => null }),
    (e) => e.status === 409 && /already a workspace/.test(e.message));
});

test("a failure after the workspace exists deletes it again", async () => {
  const fetchImpl = stub({
    "POST /rest/v1/workspaces": { status: 201, body: [WS] },
    "POST /auth/v1/invite": { status: 422, body: { msg: "Email rate limit exceeded" } },
    "DELETE /rest/v1/workspaces": { status: 204, body: null },
  });
  await assert.rejects(
    createClient({ name: "Acme", slug: "acme-home", ownerEmail: "a@b.co" }, { fetchImpl, rpcImpl: async () => null }),
    /rate limit/);
  const del = fetchImpl.calls.find(c => c.method === "DELETE");
  assert.ok(del, "the half-created workspace is removed");
  assert.match(del.url, new RegExp(`id=eq.${WS.id}`));
});

test("bad input never reaches Supabase", async () => {
  const fetchImpl = stub({});
  await assert.rejects(createClient({ name: "Acme", slug: "BAD SLUG", ownerEmail: "a@b.co" }, { fetchImpl }), (e) => e.status === 400);
  assert.equal(fetchImpl.calls.length, 0);
});

test("the list counts seats and flags a workspace with no owner", async () => {
  const fetchImpl = stub({
    "GET /rest/v1/workspaces": { status: 200, body: [WS, { id: "w2", slug: "empty", name: "Empty" }] },
    "GET /rest/v1/workspace_members": { status: 200, body: [
      { workspace_id: WS.id, role: "owner" }, { workspace_id: WS.id, role: "viewer" },
    ] },
  });
  const list = await listClients({ fetchImpl });
  assert.deepEqual(list.map(w => [w.slug, w.seats, w.owners]), [["acme-home", 2, 1], ["empty", 0, 0]]);
});

test("an invitation with no user id in the answer is an error, not a silent seat of nobody", async () => {
  const fetchImpl = stub({ "POST /auth/v1/invite": { status: 200, body: {} } });
  await assert.rejects(inviteUser("a@b.co", null, { fetchImpl }), /no user id/);
});
