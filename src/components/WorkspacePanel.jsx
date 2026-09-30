import { useState, useEffect } from "react";
import { Modal } from "./Modal.jsx";
import { gG, gGh, gI, gSL } from "./styles.js";
import { signIn, signOut, currentUser, requestPasswordReset, updatePassword } from "../services/auth.js";
import { uploadInitial, listMembers, addMember, setMemberRole, removeMember } from "../services/remoteState.js";
import { chooseWorkspace } from "../services/workspaceBoot.js";

// -- Workspace and sign-in -----------------------------------------------------
//
// ROADMAP Phase 2.0. Three jobs, all of which are about telling the operator
// which store they are actually looking at:
//
//   SIGN IN     — the opt-in that moves this session's state to Postgres.
//   STATUS      — which workspace is open, and on which store.
//   FIRST SYNC  — upload a browser workspace into an empty remote one, once.
//
// ## Why the first sync is a button rather than something that just happens
//
// Because it can only be done safely when the remote workspace is EMPTY, and
// only a person can tell the difference between "I am moving this workspace to
// the server" and "I have opened someone else's workspace on my laptop". The
// upload refuses on a non-empty remote (see uploadInitial), so the worst case is
// a refusal rather than two portfolios merged into one — but a refusal the
// operator did not ask for is still a confusing thing to be shown, so they ask.
//
// ## What this panel will not do
//
// Sign anyone up or send an invitation. Opening a client's workspace and inviting
// its owner is the operator's job and lives in the admin console (api/_clients.js),
// behind the operator's own password, rather than in a panel every user can open.
//
// It does offer "Forgot your password?", which it used to refuse: that flow is the
// user's own, Supabase runs it end to end, and without it the only way back into a
// client's workspace was an email to the operator. The link lands on this app,
// where SetPasswordModal below finishes it.
//
// What it does manage is SEATS — who is in this workspace and in which role —
// because that table is this app's own (0005_workspace.sql). An owner adds
// someone who already has an account, changes a role, or removes a seat; a
// person with no account yet is pointed at Supabase to create one. The same
// line, drawn where the data changes owner.
//
// ## Which workspace
//
// An account seated in several workspaces picks one here, and the choice is
// remembered per browser (see chooseWorkspace). Switching reloads, for the same
// reason signing in does: every store read happened at boot.

const ROLE_HELP = {
  owner:  "Owner — edits everything and manages members",
  member: "Member — edits everything",
  viewer: "Viewer — sees everything, changes nothing",
};

function Members({ t, onError }) {
  const [state, setState] = useState(null);   // { members, canManage, you }
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listMembers().then(s => { if (live) setState(s); }).catch(err => { if (live) onError(err.message); });
    return () => { live = false; };
  }, [onError]);

  const run = async (fn) => {
    setBusy(true); onError(null);
    try { setState(await fn()); return true; }
    catch (err) { onError(err.message); return false; }
    finally { setBusy(false); }
  };

  if (!state) return <div style={{fontSize:12.5,color:t.textMuted,fontFamily:t.sans,marginBottom:16}}>Loading members…</div>;

  const cell = { fontSize:12.5, color:t.text, fontFamily:t.sans };
  return (
    <div style={{marginBottom:18}}>
      <div style={gSL(t)}>Members</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
        {state.members.map(m => (
          <div key={m.user_id} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{...cell,flex:"1 1 180px",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",fontFamily:t.mono}}>
              {m.email}{m.user_id === state.you ? " (you)" : ""}
            </span>
            {state.canManage ? (
              <>
                <select aria-label={`Role for ${m.email}`} value={m.role} disabled={busy}
                  onChange={e => run(() => setMemberRole(m.user_id, e.target.value))}
                  style={{...gI(t),width:"auto",padding:"4px 8px",fontSize:12}}>
                  {Object.keys(ROLE_HELP).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" disabled={busy} aria-label={`Remove ${m.email}`}
                  onClick={() => { if (window.confirm(`Remove ${m.email} from this workspace?`)) run(() => removeMember(m.user_id)); }}
                  style={{...gG(t),background:"transparent",color:t.textMuted,border:"1px solid "+t.border,padding:"4px 10px",fontSize:12}}>
                  Remove
                </button>
              </>
            ) : <span style={{...cell,color:t.textMuted}}>{m.role}</span>}
          </div>
        ))}
      </div>
      {state.canManage && (
        <form onSubmit={async e => { e.preventDefault(); if (await run(() => addMember(email.trim(), role))) setEmail(""); }}
          style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input type="email" required placeholder="colleague@company.com" aria-label="Email of the person to add"
            value={email} onChange={e=>setEmail(e.target.value)} style={{...gI(t),flex:"1 1 180px",minWidth:0}} />
          <select aria-label="Role for the new member" value={role} onChange={e=>setRole(e.target.value)}
            style={{...gI(t),width:"auto",padding:"6px 8px",fontSize:12}}>
            {Object.keys(ROLE_HELP).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" disabled={busy} style={gG(t)}>{busy ? "Working…" : "Add"}</button>
          <div style={{flexBasis:"100%",fontSize:11.5,color:t.textMuted,fontFamily:t.sans,lineHeight:1.5}}>
            {ROLE_HELP[role]}. They need an account on this deployment first.
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * The last step of an invitation or a password reset: the link has already signed
 * the person in (src/services/auth.js, consumeAuthRedirect), and they choose the
 * password they will use from now on.
 */
export function SetPasswordModal({ t, dk, type, email, onDone, onClose }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const invited = type === "invite";

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true); setError(null);
    try { await updatePassword(password); onDone(); }
    catch (err) { setError(err.message || "Could not set the password."); setBusy(false); }
  };

  return (
    <Modal t={t} dk={dk} onClose={onClose} title={invited ? "Welcome — choose a password" : "Choose a new password"}>
      <form onSubmit={submit}>
        <div style={{fontSize:13,color:t.textSub,fontFamily:t.sans,lineHeight:1.55,marginBottom:14}}>
          {invited
            ? <>You have been invited to a workspace{email ? <> as <strong style={{color:t.text}}>{email}</strong></> : null}. Choose the password you will sign in with.</>
            : <>Signed in{email ? <> as <strong style={{color:t.text}}>{email}</strong></> : null} from your reset link. Choose a new password.</>}
        </div>
        {error && <div role="alert" style={{marginBottom:12,fontSize:12.5,color:t.red,lineHeight:1.5}}>{error}</div>}
        <div style={gSL(t)}>New password</div>
        <input type="password" required minLength={8} autoComplete="new-password" value={password}
          onChange={e=>setPassword(e.target.value)} style={{...gI(t),marginBottom:12}} />
        <div style={gSL(t)}>Confirm</div>
        <input type="password" required minLength={8} autoComplete="new-password" value={confirm}
          onChange={e=>setConfirm(e.target.value)} style={{...gI(t),marginBottom:16}} />
        <button type="submit" disabled={busy} style={gG(t)}>{busy ? "Saving…" : "Set password"}</button>
      </form>
    </Modal>
  );
}

export function WorkspacePanel({ t, dk, boot, onClose, onReload, collectLocal }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const user = currentUser();
  const remote = boot && boot.mode === "remote";
  const choices = boot?.reason === "ambiguous-workspace" ? (boot.choices || [])
    : remote && (boot.workspaces || []).length > 1 ? boot.workspaces : [];
  const open = async (id) => { setBusy(true); chooseWorkspace(id); await onReload(); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(email.trim(), password);
      setPassword("");
      // The reload is the point: state was read from the browser at boot and has
      // to be re-read from the workspace now that there is a session for it. It
      // also discards anything queued after this line, which is why there is no
      // success toast here — the reloaded strip saying "Saving to <workspace>" is
      // the confirmation, and it is a more durable one than a toast.
      await onReload();
    } catch (err) {
      setError(err.message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  // Same message whether or not the address has an account, so this form cannot
  // be used to find out who is a client.
  const sendReset = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await requestPasswordReset(email.trim(), window.location.origin + window.location.pathname);
      setResetSent(true);
    } catch (err) {
      // Rate limits and misconfiguration are worth showing; "no such user" is
      // never reported by Supabase here, so nothing leaks through this path.
      setError(err.message || "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  };

  const out = async () => {
    setBusy(true);
    await signOut();
    await onReload();   // reloads; nothing after this runs
  };

  const upload = async () => {
    setBusy(true); setError(null);
    try {
      const { docs, perfRows } = collectLocal();
      const result = await uploadInitial(docs, perfRows);
      if (!result.uploaded) {
        setError("That workspace already has data in it, so nothing was uploaded. Sign in on the machine that holds the copy you want to keep, or start from a backup file.");
      } else {
        await onReload();   // reloads; nothing after this runs
      }
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal t={t} dk={dk} onClose={onClose} title="Workspace">
      {/* Where state is going, said plainly and first. The whole reason this panel
          exists is that "saved" means two different things depending on the answer. */}
      <div style={{marginBottom:18}}>
        <div style={gSL(t)}>Saving to</div>
        <div style={{fontSize:13,color:t.text,fontFamily:t.sans,lineHeight:1.5}}>
          {remote
            ? <>The workspace store — <strong>{boot.workspace?.name || boot.workspace?.slug || "this workspace"}</strong>. Changes are on the server and available on any machine you sign in from.</>
            : <>This browser only. Changes live on this device and are lost if its storage is cleared.</>}
        </div>
      </div>

      {error && (
        <div role="alert" style={{marginBottom:14,padding:"9px 11px",borderRadius:t.r.md,background:dk?"rgba(180,60,50,0.16)":"rgba(180,60,50,0.08)",border:"1px solid "+t.border,fontSize:12.5,color:t.text,lineHeight:1.5}}>
          {error}
        </div>
      )}

      {user && choices.length > 0 && (
        <div style={{marginBottom:18}}>
          <div style={gSL(t)}>{remote ? "Switch workspace" : "Choose a workspace"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {choices.map(c => {
              const current = remote && c.id === boot.workspace?.id;
              return (
                <button key={c.id} type="button" disabled={busy || current} onClick={() => open(c.id)}
                  style={{...gG(t),textAlign:"left",background:current?t.surfaceAlt:"transparent",color:t.text,border:"1px solid "+t.border}}>
                  {c.name || c.slug || c.id}{c.role ? ` · ${c.role}` : ""}{current ? " · open" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {user && remote && <Members t={t} onError={setError} />}

      {!user && !forgot && (
        <form onSubmit={submit}>
          <div style={gSL(t)}>Email</div>
          <input type="email" required autoComplete="username" value={email}
            onChange={e=>setEmail(e.target.value)} style={{...gI(t),marginBottom:12}} />
          <div style={gSL(t)}>Password</div>
          <input type="password" required autoComplete="current-password" value={password}
            onChange={e=>setPassword(e.target.value)} style={{...gI(t),marginBottom:16}} />
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <button type="submit" disabled={busy} style={gG(t)} onMouseOver={e=>Object.assign(e.currentTarget.style,gGh(t))} onMouseOut={e=>Object.assign(e.currentTarget.style,gG(t))}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" onClick={()=>{ setForgot(true); setError(null); setResetSent(false); }}
              style={{background:"none",border:"none",padding:0,color:t.textSub,fontSize:12.5,cursor:"pointer",textDecoration:"underline"}}>
              Forgot your password?
            </button>
          </div>
        </form>
      )}

      {!user && forgot && (
        <form onSubmit={sendReset}>
          {resetSent ? (
            <div style={{fontSize:13,color:t.text,fontFamily:t.sans,lineHeight:1.55,marginBottom:14}}>
              If <strong>{email.trim()}</strong> has an account here, a reset link is on its way. It brings you back to this
              page to choose a new password.
            </div>
          ) : (
            <>
              <div style={{fontSize:12.5,color:t.textSub,fontFamily:t.sans,lineHeight:1.55,marginBottom:12}}>
                We will email a link that brings you back here to choose a new password.
              </div>
              <div style={gSL(t)}>Email</div>
              <input type="email" required autoComplete="username" value={email}
                onChange={e=>setEmail(e.target.value)} style={{...gI(t),marginBottom:16}} />
            </>
          )}
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            {!resetSent && <button type="submit" disabled={busy} style={gG(t)}>{busy ? "Sending…" : "Send reset link"}</button>}
            <button type="button" onClick={()=>{ setForgot(false); setError(null); }}
              style={{background:"none",border:"none",padding:0,color:t.textSub,fontSize:12.5,cursor:"pointer",textDecoration:"underline"}}>
              Back to sign in
            </button>
          </div>
        </form>
      )}

      {user && (
        <div>
          <div style={gSL(t)}>Signed in as</div>
          <div style={{fontSize:13,color:t.text,fontFamily:t.sans,marginBottom:16}}>{user.email || user.id}</div>

          {/* Offered only when there is a session but this session is still
              reading the browser — which is exactly the "I have just signed in on
              the machine that holds the data" case the upload exists for. */}
          {!remote && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,color:t.textMuted,fontFamily:t.sans,lineHeight:1.5,marginBottom:9}}>
                This browser holds a workspace that is not on the server. If this is the copy to keep, upload it once — it will refuse if the workspace already has data in it.
              </div>
              <button type="button" onClick={upload} disabled={busy} style={gG(t)}>
                {busy ? "Uploading…" : "Upload this browser's workspace"}
              </button>
            </div>
          )}

          <button type="button" onClick={out} disabled={busy}
            style={{...gG(t),background:"transparent",color:t.textMuted,border:"1px solid "+t.border}}>
            Sign out
          </button>
        </div>
      )}
    </Modal>
  );
}
