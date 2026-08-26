// Starting and watching a server-side debate.
//
// The browser's job used to be running the debate. It is now starting one and
// reading it, which is a much smaller job and a much better one: nothing on the
// page is load-bearing, so closing the tab costs nothing at all.
//
// ## What actually crosses the wire
//
// UP, once: the portfolio snapshot. The server has no access to browser storage,
// so the debate's subject matter has to travel with the request that starts it.
// Freezing it there is not a workaround — a debate whose later turns read newer
// state than its earlier ones produces a transcript that cannot be interpreted
// against any single portfolio. Same discipline as the frozen launch prediction.
//
// DOWN, repeatedly: the run's status and transcript, without the snapshot. The
// browser already has the portfolio; sending it back on every poll would make a
// two-second interval expensive for nothing.

export const DEBATE_URL = "/api/debate";

/** Every two seconds. A step is one model call, so turns land at roughly this
 *  granularity and a slower poll would make a live debate look frozen. */
export const POLL_INTERVAL_MS = 2000;

async function post(body) {
  const resp = await fetch(DEBATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `The debate service returned ${resp.status}.`);
  return data;
}

/**
 * Assemble the portfolio snapshot the server will argue about.
 *
 * Deliberately explicit about what is included rather than sending whole app
 * state: the server derives the portfolio context and the tool answers from
 * exactly these fields, and anything else would be paid for in request size on
 * every debate without ever being read.
 */
export const buildSnapshot = ({ items, settings, brands, activeBrand, weeklyMetrics, cats }) => ({
  items: items || [],
  settings: settings || {},
  brands: brands || [],
  activeBrand: activeBrand || "all",
  weeklyMetrics: weeklyMetrics || [],
  cats: cats || [],
});

/** Start a debate. Resolves to `{runId}` as soon as the run exists — not when it
 *  finishes, and not when the first turn lands. */
export async function startDebate({ snapshot, context, agents, maxTurns }) {
  const { runId } = await post({ action: "start", snapshot, context, agents, maxTurns });
  if (!runId) throw new Error("The debate service did not return a run id.");
  return runId;
}

/** Read one run's current state. */
export const fetchDebate = (runId) => post({ action: "status", runId }).then(d => d.run);

/**
 * Ask the server to restart any run whose chain broke.
 *
 * Called alongside polling, which means an operator who reopens the app repairs
 * their own stalled runs just by looking at them. Failure is ignored on purpose:
 * a sweep that does not happen leaves things exactly as they were, and the next
 * poll tries again.
 */
export const sweepDebates = () => post({ action: "sweep" }).catch(() => ({ restarted: 0 }));

/**
 * Watch a run until it reaches a terminal state.
 *
 * `onUpdate` fires on every poll so the UI can render turns as they arrive.
 * Returns a `stop` function — calling it detaches the watcher, and detaching is
 * explicitly NOT cancelling: the debate carries on server-side, which is the
 * entire point. A component unmounting must not take the work with it.
 */
export function watchDebate(runId, onUpdate, { intervalMs = POLL_INTERVAL_MS } = {}) {
  let live = true;
  let timer = null;

  const tick = async () => {
    if (!live) return;
    try {
      const run = await fetchDebate(runId);
      if (!live) return;
      onUpdate(run);
      if (run && (run.status === "done" || run.status === "failed")) return;
      // A run that is still going but has not moved may have lost its chain. The
      // sweep is cheap and idempotent — a run somebody already holds is skipped
      // by the lease rather than double-stepped.
      if (run && run.status === "running") sweepDebates();
    } catch {
      // A failed poll is not a failed debate. Keep watching; the run is on the
      // server and a transient network error here says nothing about it.
    }
    if (live) timer = setTimeout(tick, intervalMs);
  };

  tick();
  return () => { live = false; if (timer) clearTimeout(timer); };
}
