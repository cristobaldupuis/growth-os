// src/services/workspaceBoot.js — which store answers this session. Phase 2.0.
//
// One decision, made once, before anything reads state: does this session run on
// the workspace in Postgres or on the browser store the app has always used?
//
// ## The rule
//
// Remote when the deployment has it configured AND somebody is signed in.
// Nothing else. In particular it is NOT keyed on `workspaceMode`, and that is
// deliberate rather than lazy: `workspaceMode` lives inside `settings`, settings
// come out of the store, and the store is the thing being chosen. Reading it
// first would mean reading the browser copy to decide whether to read the browser
// copy, which is exactly the sort of ordering bug that shows up as a client's
// workspace loading demo data.
//
// Signing in is therefore the opt-in, and a visitor who never signs in gets the
// seeded demo out of `localStorage` exactly as before this phase existed.
//
// ## What this deliberately does not do
//
// It does not gate the app behind a sign-in wall. Whether a given deployment
// should refuse to render at all without a session is a per-deployment decision
// (the demo and a client instance want opposite answers), and it is a different
// change from moving where state lives. Recorded in ROADMAP 2.0 rather than
// assumed here.

import { loadAuthConfig, currentUser } from "./auth.js";
import { loadWorkspace, savePerfRows, saveDoc, PERF_KEY } from "./remoteState.js";
import { attachRemote, detachRemote } from "./store.js";

/**
 * Decide the backend and attach it. Resolves to a description of what happened,
 * which the app surfaces rather than acting on:
 *
 *   { mode: "local", reason }          — running on the browser store
 *   { mode: "remote", workspace }      — attached, state came from Postgres
 *
 * A remote load that FAILS resolves to local with a reason rather than throwing.
 * The alternative is an app that will not start because a network call did not
 * come back, when it has a perfectly good local copy and a banner to explain
 * itself with. What it must not do is fail silently — every path here names why.
 */
export async function bootWorkspace(deps = {}) {
  const {
    loadConfig = loadAuthConfig,
    user = currentUser,
    load = loadWorkspace,
    attach = attachRemote,
    detach = detachRemote,
  } = deps;

  let config;
  try {
    config = await loadConfig();
  } catch {
    detach();
    return { mode: "local", reason: "unreachable" };
  }

  if (!config || !config.configured || !config.auth) {
    detach();
    return { mode: "local", reason: "not-configured" };
  }

  if (!user()) {
    detach();
    return { mode: "local", reason: "signed-out", canSignIn: true };
  }

  try {
    const { workspace, docs, perfRows } = await load();
    // Performance rows arrive as objects and go into the cache as the JSON string
    // `store.get` returns, so App.jsx's load effect parses one shape whichever
    // backend answered.
    attach({ perfKey: PERF_KEY, saveDoc, savePerfRows }, docs, JSON.stringify(perfRows));
    return { mode: "remote", workspace, docs, perfRows };
  } catch (err) {
    detach();
    if (err.signedOut) return { mode: "local", reason: "signed-out", canSignIn: true };
    // Several workspaces and none named. The app has to ask; until it does, the
    // browser copy is the honest thing to show.
    if (err.choices) return { mode: "local", reason: "ambiguous-workspace", choices: err.choices };
    return { mode: "local", reason: "unreachable", error: err.message };
  }
}

/**
 * A one-line explanation of why this session is not on the workspace store,
 * or null when it is.
 *
 * Kept next to the decision rather than in a view, because the four reasons need
 * four different actions from whoever reads them and a view that collapses them
 * into "offline" is how an unconfigured deployment gets mistaken for a broken one.
 */
export function bootMessage(boot) {
  if (!boot || boot.mode === "remote") return null;
  switch (boot.reason) {
    case "not-configured":
      return "This deployment has no workspace store configured, so everything is saved in this browser only.";
    case "signed-out":
      return "Sign in to load this workspace. Until you do, you are looking at the copy saved in this browser.";
    case "ambiguous-workspace":
      return "This account belongs to more than one workspace. Choose which one to open.";
    case "unreachable":
      return "The workspace store could not be reached, so you are working from the copy saved in this browser. Do not close this tab expecting changes to sync.";
    default:
      return null;
  }
}
