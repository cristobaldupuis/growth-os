import { useState, useEffect, useCallback } from "react";
import { c, page, panel, label, input, button, tag } from "./theme.js";
import * as api from "./adminApi.js";
import { BenchPanel } from "./BenchPanel.jsx";
import { SpendPanel } from "./SpendPanel.jsx";
import { CostModelPanel } from "./CostModelPanel.jsx";

// The admin console.
//
// Two screens behind a password: what each feature group runs on, and a bench that
// runs one group's real prompt through several models at once so the assignment is
// made from evidence rather than from a model's reputation.
//
// It shares nothing with the app but the service layer. No styles.js, no `t` theme,
// no views — see theme.js for why that separation is deliberate rather than
// incidental.

function Field({ children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...label, marginBottom: 5 }}>{children}</div>
      {hint && <div style={{ fontSize: 11.5, color: c.textMuted, marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

function Login({ onSignedIn }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api.login(password); onSignedIn(); }
    catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ ...panel, width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Marketers Lab · model console</div>
        <div style={{ fontSize: 11.5, color: c.textMuted, marginBottom: 18, lineHeight: 1.5 }}>
          Operator access. This is not the app — changes here affect what every session runs on.
        </div>
        <Field>Password</Field>
        <input
          style={input} type="password" value={password} autoFocus
          onChange={(e) => setPassword(e.target.value)} placeholder="ADMIN_PASSWORD"
        />
        {err && (
          <div style={{ marginTop: 12, fontSize: 12, color: c.bad, lineHeight: 1.5 }}>{err}</div>
        )}
        <button type="submit" disabled={busy || !password} style={{ ...button("primary"), marginTop: 16, width: "100%", opacity: busy || !password ? 0.5 : 1 }}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/** One feature group: what it runs on, what that covers, and what else it could run on. */
function GroupCard({ groupKey, group, catalogue, current, isDefault, defaultId, onSave, saving }) {
  const [pending, setPending] = useState(current);
  const [verify, setVerify] = useState(null);

  // Re-sync when a save changes what this card is showing, without an effect.
  // Render-phase reset is React's documented pattern for state derived from props,
  // and it is what GuideDrawer in App.jsx already uses for the same reason: it
  // happens before paint, so there is no intermediate frame showing the stale
  // selection, and it does not cost the extra render an effect would.
  const [lastCurrent, setLastCurrent] = useState(current);
  if (lastCurrent !== current) {
    setLastCurrent(current);
    setPending(current);
    setVerify(null);
  }

  // Only models that can actually do this group's job. The filtering happens in the
  // registry so this list and the server's validation cannot disagree.
  const eligible = catalogue.filter((m) => {
    if (m.modality !== group.modality) return false;
    return Object.entries(group.requires || {}).every(([cap, want]) => !want || m.caps?.[cap] === true);
  });
  const dirty = pending !== current;
  const chosen = catalogue.find((m) => m.id === pending);

  const runVerify = async () => {
    setVerify({ state: "busy" });
    try {
      const r = await api.verifyModel(pending);
      setVerify(r.verifiable
        ? { state: r.present ? "ok" : "missing", available: r.available }
        : { state: "n/a" });
    } catch (e) { setVerify({ state: "error", message: e.message }); }
  };

  return (
    <div style={{ ...panel, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{group.label}</div>
          <div style={{ ...label, marginTop: 3 }}>{groupKey} · {group.modality}</div>
        </div>
        <span style={tag(isDefault ? c.textMuted : c.ok)}>{isDefault ? "default" : "assigned"}</span>
      </div>

      <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6, marginBottom: 12 }}>{group.optimiseFor}</div>

      {/* What moves when this changes. A group-level switch is only reviewable if
          its blast radius is visible at the moment of switching. */}
      <div style={{ ...label, marginBottom: 5 }}>Covers {group.calls.length} call{group.calls.length === 1 ? "" : "s"}</div>
      <ul style={{ margin: "0 0 14px", padding: 0, listStyle: "none" }}>
        {group.calls.map((call) => (
          <li key={call.fn} style={{ fontSize: 11.5, color: c.textMuted, padding: "2px 0", lineHeight: 1.5 }}>
            <span style={{ color: c.textSub }}>{call.fn}</span> — {call.surface}
          </li>
        ))}
      </ul>

      <div style={{ ...label, marginBottom: 5 }}>Model</div>
      <select
        style={{ ...input, cursor: "pointer" }} value={pending}
        onChange={(e) => { setPending(e.target.value); setVerify(null); }}
      >
        {eligible.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} {m.id === defaultId ? "(default)" : ""}
          </option>
        ))}
      </select>

      {chosen && (
        <div style={{ fontSize: 11.5, color: c.textMuted, marginTop: 7, lineHeight: 1.5 }}>
          <code style={{ color: c.textSub }}>{chosen.id}</code> · {chosen.provider}
          {chosen.blurb ? ` — ${chosen.blurb}` : ""}
          {chosen.unverified && (
            <span style={{ color: c.warn }}> · this model id has not been confirmed against the provider</span>
          )}
        </div>
      )}

      {/* Models the catalogue holds but this group cannot use. Shown because "why
          isn't Haiku in this list" is the obvious question, and the answer is a
          capability rather than an oversight. */}
      {eligible.length < catalogue.filter((m) => m.modality === group.modality).length && (
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 7, lineHeight: 1.5 }}>
          Excluded here: {catalogue
            .filter((m) => m.modality === group.modality && !eligible.includes(m))
            .map((m) => `${m.label} (needs ${Object.entries(group.requires || {})
              .filter(([cap, want]) => want && m.caps?.[cap] !== true).map(([cap]) => cap).join(", ")})`)
            .join("; ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button
          style={{ ...button(dirty ? "primary" : "default"), opacity: dirty && !saving ? 1 : 0.45, cursor: dirty && !saving ? "pointer" : "default" }}
          disabled={!dirty || saving} onClick={() => onSave(groupKey, pending)}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
        {dirty && (
          <button style={button("quiet")} onClick={() => setPending(current)}>Cancel</button>
        )}
        {chosen && chosen.provider !== "anthropic" && chosen.modality === "text" && (
          <button style={button("quiet")} onClick={runVerify}>Verify id</button>
        )}
        {verify?.state === "busy"    && <span style={{ fontSize: 11.5, color: c.textMuted }}>Asking the provider…</span>}
        {verify?.state === "ok"      && <span style={{ fontSize: 11.5, color: c.ok }}>Provider confirms this id.</span>}
        {verify?.state === "missing" && <span style={{ fontSize: 11.5, color: c.bad }}>Provider does not list this id.</span>}
        {verify?.state === "n/a"     && <span style={{ fontSize: 11.5, color: c.textMuted }}>No list endpoint for this provider.</span>}
        {verify?.state === "error"   && <span style={{ fontSize: 11.5, color: c.bad }}>{verify.message}</span>}
      </div>

      {verify?.state === "missing" && verify.available?.length > 0 && (
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.6, maxHeight: 90, overflowY: "auto" }}>
          Provider offers: {verify.available.slice(0, 40).join(", ")}
          {verify.available.length > 40 ? ` … +${verify.available.length - 40} more` : ""}
        </div>
      )}
    </div>
  );
}

function RoutingPanel({ config, reload }) {
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const save = async (groupKey, modelId) => {
    setSaving(groupKey); setErr(""); setNote("");
    try {
      await api.setRouting({ [groupKey]: modelId });
      setNote(`${config.groups[groupKey].label} now runs on ${modelId}.`);
      await reload();
    } catch (e) { setErr(e.message); }
    finally { setSaving(null); }
  };

  const reset = async () => {
    setSaving("__all"); setErr(""); setNote("");
    try { await api.resetRouting(); setNote("Every group is back to its committed default."); await reload(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(null); }
  };

  return (
    <div>
      {/* Durability is stated up front rather than discovered when a save vanishes.
          Without a routing store this console is read-only in practice. */}
      {!config.durable && (
        <div style={{ ...panel, borderColor: c.warn, marginBottom: 14 }}>
          <div style={{ color: c.warn, fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>No routing store configured</div>
          <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6 }}>
            Set <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code> to persist model
            routing. Until then every group runs on the defaults committed in <code>registry.js</code> and saving
            here will fail rather than appear to work.
          </div>
        </div>
      )}

      {config.dropped?.length > 0 && (
        <div style={{ ...panel, borderColor: c.warn, marginBottom: 14 }}>
          <div style={{ color: c.warn, fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>Stale assignment ignored</div>
          <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.6 }}>
            {config.dropped.join(", ")} referenced a model the catalogue no longer has, so
            {config.dropped.length === 1 ? " it is" : " they are"} running on the default. Re-save to clear this.
          </div>
        </div>
      )}

      {err  && <div style={{ ...panel, borderColor: c.bad, marginBottom: 14, color: c.bad, fontSize: 12 }}>{err}</div>}
      {note && <div style={{ ...panel, borderColor: c.ok, marginBottom: 14, color: c.ok, fontSize: 12 }}>{note}</div>}

      {Object.entries(config.groups).map(([key, group]) => (
        <GroupCard
          key={key} groupKey={key} group={group} catalogue={config.catalogue}
          current={config.routing[key]} defaultId={config.defaults[key]}
          isDefault={!config.assigned.includes(key)}
          onSave={save} saving={saving === key}
        />
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button style={button("danger")} disabled={saving === "__all"} onClick={reset}>
          {saving === "__all" ? "Resetting…" : "Reset all to defaults"}
        </button>
      </div>
    </div>
  );
}

export default function AdminApp() {
  // "unknown" until getConfig answers — the session lives in an HttpOnly cookie, so
  // the only way to know whether we are signed in is to ask.
  const [auth, setAuth] = useState("unknown");
  const [config, setConfig] = useState(null);
  const [tab, setTab] = useState("routing");
  const [err, setErr] = useState("");

  const apply = useCallback((cfg) => { setConfig(cfg); setAuth("in"); setErr(""); }, []);
  const fail = useCallback((e) => {
    setAuth("out");
    // A 401 is the ordinary "you are not signed in yet" path on a cold load, so it
    // shows the login form without an error above it. Anything else is worth
    // surfacing — a missing env var, an unreachable function.
    setErr(e.status === 401 ? "" : e.message);
  }, []);

  /** Re-read config after a save. Not called from an effect — see the mount effect. */
  const reload = useCallback(() => api.getConfig().then(apply).catch(fail), [apply, fail]);

  useEffect(() => {
    // Promise callbacks rather than an awaited call in the effect body: state is set
    // when the external read resolves, which is the shape the react-hooks rule wants
    // and, more usefully, gives somewhere to hang the unmount guard so a resolution
    // after teardown does not set state on a gone tree.
    let alive = true;
    api.getConfig()
      .then((cfg) => { if (alive) apply(cfg); })
      .catch((e) => { if (alive) fail(e); });
    return () => { alive = false; };
  }, [apply, fail]);

  if (auth === "unknown") {
    return <div style={{ ...page, padding: 24, color: c.textMuted }}>Loading…</div>;
  }
  if (auth === "out") {
    return (
      <>
        {err && (
          <div style={{ ...page, minHeight: 0, padding: "14px 20px 0" }}>
            <div style={{ ...panel, borderColor: c.bad, color: c.bad, fontSize: 12, maxWidth: 560, margin: "0 auto" }}>{err}</div>
          </div>
        )}
        <Login onSignedIn={reload} />
      </>
    );
  }

  return (
    <div style={{ ...page, padding: "0 0 60px" }}>
      <header style={{ borderBottom: `1px solid ${c.border}`, padding: "14px 20px", display: "flex",
        justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap",
        position: "sticky", top: 0, background: c.bg, zIndex: 5 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Marketers Lab · model console</div>
          <div style={{ ...label, marginTop: 2 }}>
            {config.durable ? "routing persisted" : "routing not persisted"} · {Object.keys(config.groups).length} groups
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["routing", "Routing"], ["bench", "Test bench"], ["spend", "Spend"], ["cost", "Cost model"]].map(([key, name]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ ...button(tab === key ? "primary" : "quiet") }}>
              {name}
            </button>
          ))}
          <a href="/" style={{ ...button("quiet"), textDecoration: "none" }}>Open app</a>
          <button style={button("quiet")} onClick={async () => { await api.logout(); setAuth("out"); setConfig(null); }}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: "0 auto", padding: "18px 20px" }}>
        {tab === "routing" ? <RoutingPanel config={config} reload={reload} />
          : tab === "bench" ? <BenchPanel config={config} />
          : tab === "spend" ? <SpendPanel />
          : <CostModelPanel />}
      </main>
    </div>
  );
}
