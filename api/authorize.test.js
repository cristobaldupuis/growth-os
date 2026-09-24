// The MCP authorize step, driven end to end against a scripted Supabase.
//
// What it proves is the consent gate: signing in yields a consent prompt, not
// a code; a code is minted only on an explicit "allow"; "deny" goes back to
// the client as access_denied; and a viewer is never offered or granted
// `write`. Plus the page itself: it names the destination, and it warns when
// a client borrows a known vendor's name but redirects elsewhere.
//
// Run with: node --test api/authorize.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://db.example.test";
process.env.SUPABASE_SECRET_KEY = "sk";

const handler = (await import("./oauth.js")).default;
const { impersonationWarning, describeRedirect } = await import("./_oauth.js");

const CLIENT = { client_id: "mcp_client_x", client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "https://evil.example/cb"] };

/** Stand-in for Supabase: auth, membership, clients, codes, the rate limiter. */
function supabase({ role = "member" } = {}) {
  const inserted = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.includes("/rpc/increment_rate_limit")) return reply(1);
    if (u.includes("/auth/v1/user")) return reply({ id: "u1", email: "a@b.test" });
    if (u.includes("/workspace_members")) return reply([{ workspace_id: "w1", role, workspaces: { slug: "acme", name: "Acme" } }]);
    if (u.includes("/oauth_clients")) return reply([CLIENT]);
    if (u.includes("/oauth_codes") && init.method === "POST") { inserted.push(JSON.parse(init.body)); return reply(null, 201); }
    return reply({ message: "unexpected " + u }, 500);
  };
  return { fetchImpl, inserted };
}

function mockRes() {
  return {
    statusCode: null, body: null, headers: {}, raw: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end(t) { this.raw = t; return this; },
  };
}

let ip = 0;
async function authorize(body, sb) {
  const real = globalThis.fetch;
  globalThis.fetch = sb.fetchImpl;
  const res = mockRes();
  try {
    await handler({
      method: "POST",
      query: { action: "authorize" },
      headers: { host: "lab.example.test", "x-forwarded-for": `10.7.0.${++ip}` },
      body: {
        client_id: CLIENT.client_id,
        redirect_uri: CLIENT.redirect_uris[0],
        code_challenge: "c".repeat(43),
        code_challenge_method: "S256",
        supabase_access_token: "a.b.c",
        scope: "read write",
        state: "st",
        ...body,
      },
    }, res);
  } finally {
    globalThis.fetch = real;
  }
  return res;
}

test("signing in yields a consent prompt, and no code", async () => {
  const sb = supabase();
  const res = await authorize({}, sb);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.needsConsent, true);
  assert.deepEqual(res.body.workspace, { id: "w1", name: "Acme", slug: "acme" });
  assert.equal(res.body.scope, "read write");
  assert.equal(res.body.redirect, undefined);
  assert.equal(sb.inserted.length, 0);
});

test("only an explicit allow mints a code", async () => {
  const sb = supabase();
  const res = await authorize({ decision: "allow" }, sb);
  assert.equal(sb.inserted.length, 1);
  const to = new URL(res.body.redirect);
  assert.equal(to.origin + to.pathname, CLIENT.redirect_uris[0]);
  assert.match(to.searchParams.get("code"), /^mcp_code_/);
  assert.equal(to.searchParams.get("state"), "st");
});

test("deny returns access_denied to the client and mints nothing", async () => {
  const sb = supabase();
  const res = await authorize({ decision: "deny" }, sb);
  const to = new URL(res.body.redirect);
  assert.equal(to.searchParams.get("error"), "access_denied");
  assert.equal(to.searchParams.get("code"), null);
  assert.equal(sb.inserted.length, 0);
});

test("a viewer is shown, and granted, read only", async () => {
  const sb = supabase({ role: "viewer" });
  assert.equal((await authorize({}, sb)).body.scope, "read");
  await authorize({ decision: "allow" }, sb);
  assert.equal(sb.inserted[0].scope, "read");
});

test("the page names the destination and flags a borrowed name", async () => {
  const sb = supabase();
  const real = globalThis.fetch;
  globalThis.fetch = sb.fetchImpl;
  const page = async (redirect) => {
    const res = mockRes();
    await handler({
      method: "GET",
      query: { action: "authorize", client_id: CLIENT.client_id, redirect_uri: redirect, response_type: "code", code_challenge: "c".repeat(43), code_challenge_method: "S256" },
      headers: { host: "lab.example.test", "x-forwarded-for": `10.7.1.${++ip}` },
    }, res);
    return res.raw;
  };
  try {
    const honest = await page(CLIENT.redirect_uris[0]);
    assert.match(honest, /Access will be sent to/);
    assert.match(honest, /claude\.ai/);
    assert.doesNotMatch(honest, /class="warn"/);

    const spoof = await page(CLIENT.redirect_uris[1]);
    assert.match(spoof, /evil\.example/);
    assert.match(spoof, /class="warn"/);
    assert.match(spoof, /not a Claude address/);
  } finally {
    globalThis.fetch = real;
  }
});

test("impersonation: vendor domains, subdomain tricks and loopback", () => {
  assert.equal(impersonationWarning("Claude", "https://claude.ai/cb"), null);
  assert.equal(impersonationWarning("Claude", "https://app.claude.com/cb"), null);
  assert.equal(impersonationWarning("Claude Code", "http://localhost:4312/cb"), null);
  assert.equal(impersonationWarning("My own script", "https://me.example/cb"), null);
  assert.ok(impersonationWarning("Claude", "https://claude.ai.evil.example/cb"));
  assert.ok(impersonationWarning("claude desktop", "https://notclaude.ai/cb"));
  assert.ok(impersonationWarning("ChatGPT connector", "https://evil.example/cb"));
  assert.deepEqual(describeRedirect("http://127.0.0.1:9000/cb"), { host: "127.0.0.1:9000", loopback: true });
});
