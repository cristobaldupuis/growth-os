// api/_clients.js — opening a client workspace, from the admin console.
//
// Every sale used to end in the Supabase dashboard: an `insert into workspaces`,
// an invite sent by hand from Authentication → Users, then an `insert into
// workspace_members` with a user id copied out of another table. Three steps, two
// of them SQL, done by the operator for every client and every new seat on a
// client's team — and a client who forgot their password had no way back in.
//
// This module is those three steps as one action, behind the admin console's
// session:
//
//   1. create the workspace row (a taken slug is refused, not suffixed — the slug
//      is how the operator refers to the client, and a silent `acme-2` is how two
//      clients get confused);
//   2. find the owner's account, or INVITE them — Supabase emails a link that
//      lands on this app, where they set a password (see src/services/auth.js);
//   3. seat them as owner.
//
// A failure after step 1 deletes the workspace again, so a half-created client
// never appears in a list looking like a real one.
//
// Why the admin console and not the app: creating a workspace and inviting its
// owner is the implementer's job — the operator's — and the console is the
// operator's surface, behind its own password. Inside a workspace, an owner still
// manages their own team's seats from the app (api/state.js, handleMembers).

import { restBase, authBase, authHeaders, rpc } from "./_supabase.js";

const TIMEOUT_MS = 8000;

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A URL-safe slug from a client's name: "Acme & Co." → "acme-co". */
export function slugFrom(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** An error message for bad input, or null. */
export function validateClient({ name, slug, ownerEmail } = {}) {
  if (!String(name || "").trim()) return "Give the client a name.";
  if (String(name).trim().length > 80) return "Keep the name under 80 characters.";
  if (!SLUG_PATTERN.test(String(slug || ""))) return "The slug must be 2–40 lowercase letters, numbers or hyphens, starting with a letter or number.";
  if (!EMAIL_PATTERN.test(String(ownerEmail || "").trim())) return "Enter the owner's email address.";
  return null;
}

async function pg(fetchImpl, path, init = {}) {
  const res = await fetchImpl(`${restBase()}${path}`, {
    ...init,
    headers: { ...authHeaders(), "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res;
}

async function detail(res) {
  const text = await res.text().catch(() => "");
  try { const j = JSON.parse(text); return j.msg || j.message || j.error_description || j.error || text; }
  catch { return text; }
}

/** Every workspace, newest first, with how many seats each has. */
export async function listClients({ fetchImpl = fetch } = {}) {
  const [ws, members] = await Promise.all([
    pg(fetchImpl, "/workspaces?select=id,slug,name,created_at&order=created_at.desc"),
    pg(fetchImpl, "/workspace_members?select=workspace_id,role"),
  ]);
  if (!ws.ok) throw new Error(`Could not list workspaces (${ws.status}): ${await detail(ws)}`);
  if (!members.ok) throw new Error(`Could not list members (${members.status}): ${await detail(members)}`);
  const counts = new Map();
  (await members.json()).forEach(m => {
    const c = counts.get(m.workspace_id) || { seats: 0, owners: 0 };
    c.seats += 1;
    if (m.role === "owner") c.owners += 1;
    counts.set(m.workspace_id, c);
  });
  return (await ws.json()).map(w => ({ ...w, ...(counts.get(w.id) || { seats: 0, owners: 0 }) }));
}

/**
 * Ask Supabase to email an invitation that lands on `redirectTo`. Resolves to the
 * new user's id. `redirect_to` travels as a query parameter, which is where
 * Supabase Auth reads it for an invite; it must also be listed under the
 * project's Auth → URL Configuration → Redirect URLs, or Supabase falls back to
 * the project's Site URL.
 */
export async function inviteUser(email, redirectTo, { fetchImpl = fetch } = {}) {
  const qs = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
  const res = await fetchImpl(`${authBase()}/invite${qs}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Supabase would not send the invitation (${res.status}): ${await detail(res)}`);
  const body = await res.json().catch(() => ({}));
  const id = body.id || body.user?.id;
  if (!id) throw new Error("Supabase sent no user id back for the invitation.");
  return id;
}

/** Email a password-reset link that lands on `redirectTo`. */
export async function sendPasswordReset(email, redirectTo, { fetchImpl = fetch } = {}) {
  const qs = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
  const res = await fetchImpl(`${authBase()}/recover${qs}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Supabase would not send the reset email (${res.status}): ${await detail(res)}`);
}

/**
 * Create a workspace, invite or find its owner, and seat them.
 * Resolves `{workspace, owner: {email, userId, invited}}`.
 */
export async function createClient({ name, slug, ownerEmail, redirectTo }, { fetchImpl = fetch, rpcImpl = rpc } = {}) {
  const invalid = validateClient({ name, slug, ownerEmail });
  if (invalid) throw Object.assign(new Error(invalid), { status: 400 });
  const email = String(ownerEmail).trim();

  const created = await pg(fetchImpl, "/workspaces", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: String(name).trim(), slug }),
  });
  if (created.status === 409) throw Object.assign(new Error(`The slug "${slug}" is already a workspace. Pick another.`), { status: 409 });
  if (!created.ok) throw new Error(`Could not create the workspace (${created.status}): ${await detail(created)}`);
  const [workspace] = await created.json();

  // Everything after the insert either completes or takes the workspace with it.
  try {
    let userId = await rpcImpl("workspace_user_id_by_email", { p_email: email });
    const invited = !userId;
    if (!userId) userId = await inviteUser(email, redirectTo, { fetchImpl });

    const seat = await pg(fetchImpl, "/workspace_members", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ workspace_id: workspace.id, user_id: userId, role: "owner" }),
    });
    if (!seat.ok) throw new Error(`Could not seat the owner (${seat.status}): ${await detail(seat)}`);
    return { workspace, owner: { email, userId, invited } };
  } catch (err) {
    await pg(fetchImpl, `/workspaces?id=eq.${workspace.id}`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}
