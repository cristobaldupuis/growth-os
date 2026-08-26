// api/_routing.js — where the model-routing decision is stored.
//
// Underscore-prefixed so Vercel does not route it as a function; it is a module
// api/admin.js and api/routing.js import.
//
// ## Why the server stores this at all
//
// The rest of this app persists to localStorage in the browser (see DECISIONS.md,
// "localStorage over backend persistence"). That is fine for portfolio state,
// which belongs to whoever is looking at it, and completely wrong for routing: a
// model assignment made in the operator's browser has to apply to every visitor's
// session, not just the tab it was typed in.
//
// ## Why Supabase and not the Upstash this used to assume
//
// This was written against Upstash Redis because at the time that was the only
// durable store the deployment had. It was never configured, while Supabase was —
// api/asset.js has been writing generated frames to a bucket since Phase 5. So
// this module described itself as durable while every save silently failed.
//
// Routing is a single row read once per page load. That is not a workload with a
// Redis-shaped answer, and running a second managed datastore for it is one more
// account, one more bill, and one more thing to be quietly unset. See
// api/_supabase.js.
//
// ## Why this fails soft where the rate limiter fails closed
//
// _guard.js fails *closed* when Redis is unreachable, because an unbounded proxy
// in front of a metered API is worse than a brief outage. The opposite is true
// here. If routing cannot be read, the correct behaviour is to serve the
// committed defaults in registry.js — those are a known-good configuration that
// shipped, so falling back to them degrades the deployment to "what the last
// deploy chose" rather than taking every AI feature offline. A read failure is
// logged and returns null.
//
// Writes are the case that must not be quiet. `writeRouting` reports
// `durable:false` when there is nowhere to persist, and api/admin.js passes that
// through to the console so it can say the save did not stick. Reporting a
// successful save that evaporates on the next request is exactly the class of bug
// store.js was rewritten to stop doing in the browser; it would be no better here.

import { supabaseConfigured, readConfig, writeConfig } from "./_supabase.js";

const ROUTING_KEY = "routing";

/** True when this deployment has somewhere durable to put a routing decision. */
export const routingIsDurable = () => supabaseConfigured();

/**
 * The stored routing, or null when nothing is stored / Supabase is not
 * configured / the read failed.
 *
 * Never throws. Callers merge whatever comes back over DEFAULT_ROUTING via
 * resolveRouting, so null and a partial object are both handled by the same path
 * and neither can take the app down.
 */
export async function readRouting() {
  if (!supabaseConfigured()) return null;
  try {
    return await readConfig(ROUTING_KEY);
  } catch (err) {
    // Deliberately soft — see the header. The defaults are a shipped
    // configuration, so serving them is a degradation rather than a failure.
    console.error("Could not read model routing; falling back to defaults:", err);
    return null;
  }
}

/**
 * Persist a routing object. Resolves to `{ ok, durable, message? }`.
 *
 * `durable:false` means the value went nowhere and the caller must say so rather
 * than reporting a save.
 */
export async function writeRouting(routing) {
  if (!supabaseConfigured()) {
    return {
      ok: false,
      durable: false,
      message: "No routing store is configured, so this change was not saved. Set SUPABASE_URL and SUPABASE_SECRET_KEY, and run supabase/migrations/0003_runtime.sql, to persist model routing across requests.",
    };
  }
  try {
    await writeConfig(ROUTING_KEY, routing);
    return { ok: true, durable: true };
  } catch (err) {
    console.error("Could not write model routing:", err);
    return {
      ok: false,
      durable: false,
      message: "The routing store rejected the write. Nothing was saved — check that supabase/migrations/0003_runtime.sql has been applied.",
    };
  }
}
