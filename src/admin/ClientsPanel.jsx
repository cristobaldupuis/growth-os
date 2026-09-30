import { useEffect, useState } from "react";
import { c, panel, label, input, button, tag } from "./theme.js";
import * as api from "./adminApi.js";

// Clients: open a workspace for a new client and invite its owner in one step,
// and send a password reset when someone is locked out. See api/_clients.js for
// why this lives in the console rather than in the app or the Supabase dashboard.

const slugFrom = (name) => String(name || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

export function ClientsPanel() {
  const [clients, setClients] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ name: "", slug: "", ownerEmail: "", slugTouched: false });
  const [resetEmail, setResetEmail] = useState("");

  const load = () => api.listClients().then(r => setClients(r.clients || [])).catch(e => setErr(e.message));

  useEffect(() => {
    let alive = true;
    api.listClients()
      .then(r => { if (alive) setClients(r.clients || []); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy("create"); setErr(""); setNote("");
    try {
      const out = await api.createClient({ name: form.name.trim(), slug: form.slug, ownerEmail: form.ownerEmail.trim() });
      setNote(out.owner.invited
        ? `${out.workspace.name} is open. ${out.owner.email} has been emailed an invitation — the link lands on the app, where they set a password and arrive in the workspace.`
        : `${out.workspace.name} is open and ${out.owner.email} (an existing account) is its owner. They will see it the next time they sign in.`);
      setForm({ name: "", slug: "", ownerEmail: "", slugTouched: false });
      await load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(""); }
  };

  const reset = async (e) => {
    e.preventDefault();
    setBusy("reset"); setErr(""); setNote("");
    try {
      await api.sendPasswordReset(resetEmail.trim());
      setNote(`If ${resetEmail.trim()} has an account, a reset link is on its way. It lands on the app, where they choose a new password.`);
      setResetEmail("");
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(""); }
  };

  const setName = (name) => setForm(f => ({ ...f, name, slug: f.slugTouched ? f.slug : slugFrom(name) }));

  return (
    <div>
      {err && <div style={{ ...panel, borderColor: c.bad, marginBottom: 14, color: c.bad, fontSize: 12, lineHeight: 1.5 }}>{err}</div>}
      {note && <div style={{ ...panel, borderColor: c.ok, marginBottom: 14, color: c.ok, fontSize: 12, lineHeight: 1.5 }}>{note}</div>}

      <form onSubmit={create} style={{ ...panel, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Add a client</div>
        <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6, marginBottom: 14 }}>
          Creates the workspace, invites its owner by email if they have no account yet, and seats them as owner. The
          invitation lands on this app, where they set a password. Add the app's URL under Supabase → Authentication →
          URL Configuration → Redirect URLs once, or the link falls back to the project's Site URL.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            <div style={{ ...label, marginBottom: 5 }}>Client name</div>
            <input style={input} value={form.name} onChange={e => setName(e.target.value)} placeholder="Acme Home" required />
          </label>
          <label>
            <div style={{ ...label, marginBottom: 5 }}>Slug</div>
            <input style={input} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase(), slugTouched: true }))}
              placeholder="acme-home" pattern="[a-z0-9][a-z0-9-]{1,39}" required />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <div style={{ ...label, marginBottom: 5 }}>Owner's email</div>
            <input style={input} type="email" value={form.ownerEmail} onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))}
              placeholder="growth-lead@acme.com" required />
          </label>
        </div>
        <button type="submit" disabled={busy === "create"} style={{ ...button("primary"), marginTop: 14, opacity: busy === "create" ? 0.6 : 1 }}>
          {busy === "create" ? "Creating…" : "Create workspace and invite"}
        </button>
      </form>

      <div style={{ ...panel, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Workspaces</div>
        {clients === null && !err && <div style={{ fontSize: 12, color: c.textMuted }}>Loading…</div>}
        {clients && clients.length === 0 && <div style={{ fontSize: 12, color: c.textMuted }}>None yet.</div>}
        {clients && clients.map(w => (
          <div key={w.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: `1px solid ${c.border}`, fontSize: 12.5 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{w.name}</div>
              <div style={{ ...label, marginTop: 2 }}>{w.slug} · created {String(w.created_at || "").slice(0, 10)}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={tag(c.textMuted)}>{w.seats} seat{w.seats === 1 ? "" : "s"}</span>
              {w.owners === 0 && <span style={tag(c.warn)}>no owner</span>}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={reset} style={panel}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Locked out</div>
        <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6, marginBottom: 10 }}>
          Emails a password-reset link. People can also request one themselves from the app's sign-in form.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...input, flex: 1 }} type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="person@client.com" required />
          <button type="submit" disabled={busy === "reset"} style={{ ...button("quiet"), opacity: busy === "reset" ? 0.6 : 1 }}>
            {busy === "reset" ? "Sending…" : "Send reset link"}
          </button>
        </div>
      </form>
    </div>
  );
}
