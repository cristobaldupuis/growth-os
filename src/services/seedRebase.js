// -- Demo seed rebasing and metric derivation ----------------------------------
//
// Shared by every config.*.js. This file holds the LOGIC; each config holds its
// own authored narrative and calls in. Splitting the two configs on content and
// duplicating the machinery was how it started, and the machinery below —
// roughly ninety lines of date arithmetic and metric derivation — sat
// byte-for-byte identical in both files with nothing enforcing that it stay
// that way. A fix to `withDerivedMetrics` had to be made twice or it was a bug
// in whichever client did not get it.
//
// ## Why the dates are rebased at all
//
// A config's seed arrays are an authored narrative: a portfolio mid-flight,
// with a paid-social test that fatigued and got killed, a replatform in
// dependency order, and twelve weeks of metrics that move because of those
// decisions. That story is worth keeping, and rewriting the literal dates by
// hand every few months is not a maintenance task anyone will actually do.
//
// So the dates stay as authored and get shifted at load time. The offset is
// whatever it takes to land the last authored metrics week on the most recent
// completed Monday, and every date moves by that same offset, so all the
// relative spacing the narrative depends on — this test ran three weeks, that
// one starts after its dependency closes — is preserved exactly.
//
// The symptom this fixes: the demo opened on "Last logged 68d ago ⚠️" with a
// staleness warning over a half-empty table, because the fixed dates aged past
// the freshness thresholds the dashboard checks. A prospect's first screen was
// the app complaining about its own data.

/** Most recent completed Monday, local time. */
export function mostRecentMonday(now = new Date()) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();                     // 0=Sun … 6=Sat
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

const DATE_FIELDS = ["startDate", "endDate", "createdAt", "updatedAt", "date"];

/**
 * Build the rebaser for one config's timeline.
 *
 * `authoredLastWeek` is the most recent date in that config's authored weekly
 * metrics — the anchor the whole narrative is shifted relative to. It is a
 * per-config fact, which is why this is a factory rather than a bare function:
 * the offset belongs to the timeline being rebased, not to this module.
 */
export function makeRebaser(authoredLastWeek) {
  const authored = new Date(authoredLastWeek + "T12:00:00");
  const offsetDays = Math.round((mostRecentMonday() - authored) / 86400000);

  const shiftDate = (iso) => {
    if (!iso || typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const rebaseRecord = (rec) => {
    const out = { ...rec };
    for (const f of DATE_FIELDS) if (out[f]) out[f] = shiftDate(out[f]);
    if (out.predictionSnapshot?.snapshotDate) {
      out.predictionSnapshot = { ...out.predictionSnapshot, snapshotDate: shiftDate(out.predictionSnapshot.snapshotDate) };
    }
    return out;
  };

  return { offsetDays, shiftDate, rebaseRecord };
}

// -- Derived weekly metrics ----------------------------------------------------
//
// Spend, ROAS and CVR were never authored, so the Weekly Pulse table rendered an
// em dash in three of its seven columns for every brand — half the headline
// artifact empty on first run. They are derived rather than invented: spend is
// implied by the CAC and conversions already recorded, and ROAS and CVR follow
// from spend and sessions. That keeps the demo internally consistent, so a
// prospect who checks whether revenue ÷ spend equals the stated ROAS finds that
// it does.
//
// The authored CAC values move the way the narrative needs them to (creeping up
// during the paid-social scale, dropping after it is killed) but sit at a level
// that isn't credible: $32-$56 against a $322 AOV implies a 6-11x blended ROAS,
// which no D2C operator reading the demo would believe. Scaling the whole series
// by a constant keeps every relative movement — and every note that refers to
// one — exactly as authored, while landing the level in the 2.4-4.1x band that
// a home-and-lifestyle brand at this AOV actually runs at.
export const CAC_REALISM_FACTOR = 2.6;

export function withDerivedMetrics(entry) {
  const m0 = entry.metrics || {};
  const m = m0.cac != null ? { ...m0, cac: Math.round(m0.cac * CAC_REALISM_FACTOR) } : m0;
  const spend = m.spend ?? (m.cac != null && m.conversions != null
    ? Math.round(m.cac * m.conversions) : null);
  const roas = m.roas ?? (spend && m.revenue != null
    ? Math.round((m.revenue / spend) * 100) / 100 : null);
  const cvr = m.cvr ?? (m.sessions && m.conversions != null
    ? Math.round((m.conversions / m.sessions) * 10000) / 100 : null);
  const derived = { ...m };
  if (spend != null) derived.spend = spend;
  if (roas != null) derived.roas = roas;
  if (cvr != null) derived.cvr = cvr;

  // Registrations and returns feed the Business Health guardrail tiles, which
  // otherwise sit empty on a fresh demo. Both are anchored to order volume so
  // they move with the narrative rather than sitting flat: registrations run at
  // roughly 2.6x orders (account creation is much higher up the funnel than
  // purchase), and the return rate drifts around a home-and-lifestyle-typical
  // 8% rather than being pinned to a suspiciously round number.
  if (derived.registrations == null && m.conversions != null) {
    derived.registrations = Math.round(m.conversions * 2.6);
  }
  if (derived.return_rate == null && m.conversions != null) {
    const wobble = ((m.conversions % 7) - 3) * 0.25;   // deterministic, ±0.75pp
    derived.return_rate = Math.round((8.1 + wobble) * 10) / 10;
  }
  return { ...entry, metrics: derived };
}

/**
 * The whole pipeline, which is what a config actually wants: rebase both
 * arrays onto today's timeline and derive the missing weekly figures.
 */
export function buildSeed({ authoredLastWeek, seed, weeklyMetrics }) {
  const { rebaseRecord } = makeRebaser(authoredLastWeek);
  return {
    SEED: seed.map(rebaseRecord),
    SEED_WEEKLY_METRICS: weeklyMetrics.map(rebaseRecord).map(withDerivedMetrics),
  };
}
