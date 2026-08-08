// api/_routing.js — where the model-routing decision is stored.
//
// Underscore-prefixed so Vercel does not route it as a function; it is a module
// api/admin.js and api/routing.js import.
//
// ## Why Upstash and not a database
//
// This app has no database — persistence is localStorage in the browser (see
// DECISIONS.md, "localStorage over backend persistence"). That is fine for
// portfolio state, which belongs to whoever is looking at it, and completely
// wrong for routing: a model assignment made in the operator's browser has to
// apply to every visitor's session, not just the tab it was typed in.
//
// So it needs server-side storage, and the cheapest honest option is the one
// already wired up. api/_guard.js talks to Upstash over its REST API for durable
// rate limiting, using UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Reusing
// that adds no dependency, no new credential and no new failure mode to reason
// about — it is one more key in a store the deployment already trusts.
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

const ROUTING_KEY = "gos:admin:routing";

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** True when this deployment has somewhere durable to put a routing decision. */
export const routingIsDurable = () => redisConfig() !== null;

async function redisCommand(command) {
  const cfg = redisConfig();
  if (!cfg) return null;
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([command]),
  });
  if (!res.ok) throw new Error(`routing store returned ${res.status}`);
  const out = await res.json();
  return out?.[0]?.result ?? null;
}

/**
 * The stored routing, or null when nothing is stored / Redis is not configured /
 * the read failed.
 *
 * Never throws. Callers merge whatever comes back over DEFAULT_ROUTING via
 * resolveRouting, so null and a partial object are both handled by the same path
 * and neither can take the app down.
 */
export async function readRouting() {
  try {
    const raw = await redisCommand(["GET", ROUTING_KEY]);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
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
  if (!redisConfig()) {
    return {
      ok: false,
      durable: false,
      message: "No routing store is configured, so this change was not saved. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to persist model routing across requests.",
    };
  }
  try {
    await redisCommand(["SET", ROUTING_KEY, JSON.stringify(routing)]);
    return { ok: true, durable: true };
  } catch (err) {
    console.error("Could not write model routing:", err);
    return { ok: false, durable: false, message: "The routing store rejected the write. Nothing was saved." };
  }
}
