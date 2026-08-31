import { useState } from "react";
import { Modal } from "./Modal.jsx";
import { gG, gGh, gI, gSL } from "./styles.js";
import { signIn, signOut, currentUser } from "../services/auth.js";
import { uploadInitial } from "../services/remoteState.js";

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
// Sign anyone up, reset a password, or invite a colleague. Those are Supabase's
// dashboard, and putting them here would mean this app holding a flow it does not
// own for a user table it does not manage. An operator provisions members once,
// per client, in the same sitting they create the workspace row.

export function WorkspacePanel({ t, dk, boot, onClose, onReload, collectLocal }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const user = currentUser();
  const remote = boot && boot.mode === "remote";

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

      {!user && (
        <form onSubmit={submit}>
          <div style={gSL(t)}>Email</div>
          <input type="email" required autoComplete="username" value={email}
            onChange={e=>setEmail(e.target.value)} style={{...gI(t),marginBottom:12}} />
          <div style={gSL(t)}>Password</div>
          <input type="password" required autoComplete="current-password" value={password}
            onChange={e=>setPassword(e.target.value)} style={{...gI(t),marginBottom:16}} />
          <button type="submit" disabled={busy} style={gG(t)} onMouseOver={e=>Object.assign(e.currentTarget.style,gGh(t))} onMouseOut={e=>Object.assign(e.currentTarget.style,gG(t))}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}

      {user && (
        <div>
          <div style={gSL(t)}>Signed in as</div>
          <div style={{fontSize:13,color:t.text,fontFamily:t.mono,marginBottom:16}}>{user.email || user.id}</div>

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
