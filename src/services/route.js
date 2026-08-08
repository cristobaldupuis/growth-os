// -- Routing -------------------------------------------------------------------
//
// The app had none. `nav` was React state and nothing else, so: the browser
// Back button left the application entirely, a refresh always landed on the
// dashboard and lost your place, nothing could be linked — you could not send a
// colleague a URL for initiative NH-003 — and every pageview Vercel Analytics
// recorded was `/`, which meant there was no data at all on which views were
// actually used.
//
// ## Why the hash and not the History API
//
// DECISIONS.md ("Modular React with no router") keeps `/admin` a separate build
// entry rather than a route, and that stays true: the console must not ship
// inside the client bundle. A hash router needs no server rewrites, no router
// dependency, and cannot collide with the two real HTML entry points, so it
// buys the addressability without touching the decision that produced the split.
//
// ## Shape
//
//   #/dashboard                     a view
//   #/initiatives                   a view
//   #/performance/builder           a view with a tab
//   #/i/e-1730000000000             an initiative, opened at its detail view
//   #/i/e-1730000000000/edit        the same initiative, in the editor
//
// Initiative ids are opaque and already URL-safe (`e-<timestamp>`, `csv-…`,
// `cop-…`), so they are used directly. `initId` (NH-003) would read better and
// is deliberately not used: it is user-editable and not guaranteed unique across
// brands, and a link that silently resolves to the wrong experiment is worse
// than an ugly one.

/** Views that are addressable by name. Anything else falls back to dashboard. */
export const ROUTABLE = [
  "dashboard", "initiatives", "library", "performance",
  "triage", "creative", "readout",
];

const PERF_TABS = ["breakdown", "attribution", "builder", "taxonomy"];

/**
 * Parse a location hash into app state.
 * Returns `{nav, selId, tab}` — `selId` and `tab` are null when not addressed.
 */
export function parseHash(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "").trim();
  if (!raw) return { nav: "dashboard", selId: null, tab: null };

  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);

  // `#/new` is written (so the URL is honest while you are in the editor and
  // Back leaves it correctly) but deliberately not restored: an unsaved draft
  // exists only in this tab's memory, so reopening the link later would present
  // an empty form dressed as a resumed one. It resolves to the list the draft
  // would have joined.
  if (parts[0] === "new") return { nav: "initiatives", selId: null, tab: null };

  if (parts[0] === "i" && parts[1]) {
    return {
      nav: parts[2] === "edit" ? "form" : "detail",
      selId: parts[1],
      tab: null,
    };
  }

  if (ROUTABLE.includes(parts[0])) {
    const tab = parts[0] === "performance" && PERF_TABS.includes(parts[1]) ? parts[1] : null;
    return { nav: parts[0], selId: null, tab };
  }

  return { nav: "dashboard", selId: null, tab: null };
}

/**
 * Build the hash for a piece of app state. Returns "" for states that are
 * deliberately not addressable — a brand-new unsaved initiative has no id, so
 * there is nothing to link to and pretending otherwise would produce a URL that
 * resolves to an empty editor.
 */
export function formatHash({ nav, selId, tab }) {
  if (nav === "detail" && selId) return "#/i/" + encodeURIComponent(selId);
  if (nav === "form")            return selId ? "#/i/" + encodeURIComponent(selId) + "/edit" : "#/new";
  if (nav === "performance" && tab && PERF_TABS.includes(tab)) return "#/performance/" + tab;
  if (ROUTABLE.includes(nav))    return "#/" + nav;
  return "";
}

/** Document title per view, so tab-switching and history are legible. */
export function titleFor(nav, item) {
  const NAMES = {
    dashboard:"Dashboard", initiatives:"Initiatives", library:"Library",
    performance:"Performance", triage:"Triage", creative:"Creative",
    readout:"Summary", detail:"Initiative", form:"Edit initiative",
  };
  if ((nav === "detail" || nav === "form") && item?.title) {
    const id = item.initId ? item.initId + " · " : "";
    return id + item.title + " · Marketers Lab";
  }
  return (NAMES[nav] || "Marketers Lab") + " · Marketers Lab";
}
