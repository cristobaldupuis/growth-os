// -- One list of what to test next ---------------------------------------------------
//
// Three features each proposed experiments, in three places, in three shapes:
//
//   NEXT PLAYS   — a weekly slate on the dashboard, stored as batches in `recs`.
//   SIGNAL AI    — a debate's synthesis, three initiatives on the debate record.
//   LIBRARY      — the synthesis's "DO NEXT" section: prose on the Library page,
//                  gone when you navigated away.
//
// A client shown all three asks the obvious question — which one do I trust? —
// and the honest answer is that they are three readings of the same evidence. So
// they now land in ONE list that says where each idea came from, and when two
// sources converge on the same idea it is shown once, credited to both, which is
// the most useful signal the three ever produced and one that was invisible while
// they lived apart.
//
// Nothing here generates anything. The engines are unchanged; this module reads
// what they already stored (the library's ideas are now stored as a `recs` batch
// with `source: "library"`), merges, and leaves every decision to the operator.

export const IDEA_SOURCES = {
  "next-plays": { label: "Next Plays", blurb: "The weekly slate, from closed learnings and the portfolio" },
  debate:       { label: "Signal AI",  blurb: "A C-suite debate's synthesis" },
  library:      { label: "Library",    blurb: "The learning synthesis's Do Next" },
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Next Plays batches only — the slate logic (week state, diffs) reads these. */
export const nextPlaysBatches = (recs) => (recs || []).filter(b => !b.source || b.source === "next-plays");

/**
 * The DO NEXT section of a library synthesis, as ideas. Each line is written as
 * `[Retailer] → [Action] → [Why]`; a line that does not follow the format is
 * still kept, whole, as the idea's title rather than dropped.
 */
export function parseDoNext(text, limit = 5) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex(l => /^\s*(?:#+\s*|\*\*)?\s*DO NEXT\b/i.test(l));
  if (start === -1) return [];
  const out = [];
  for (const raw of lines.slice(start + 1)) {
    // The next all-caps heading ends the section (a model sometimes adds one), and
    // so does a rule — the app appends one above its "this was cut off" note.
    if (/^\s*(?:#+\s*)?[A-Z][A-Z ]{3,}:?\s*$/.test(raw) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) break;
    const line = raw.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
    if (!/[\p{L}\p{N}]/u.test(line)) continue;
    const parts = line.split(/\s*(?:→|->)\s*/).map(p => p.replace(/^\[|\]$/g, "").trim()).filter(Boolean);
    if (parts.length >= 3) out.push({ retailer: parts[0], title: parts[1], why: parts.slice(2).join(" — ") });
    else if (parts.length === 2) out.push({ retailer: "", title: parts[0], why: parts[1] });
    else out.push({ retailer: "", title: line, why: "" });
    if (out.length >= limit) break;
  }
  return out;
}

// callSynthesizeLearnings appends this when the answer hit its length limit.
const CUT_OFF = /was cut off at the response length limit/;

/**
 * A synthesis's ideas as a `recs` batch, or null when it proposed none. When the
 * answer was cut off, DO NEXT is its last section, so its last line is the one
 * the cut went through: it is dropped rather than offered as half an idea.
 */
export function libraryBatch(text, now = new Date()) {
  const ideas = parseDoNext(text);
  if (CUT_OFF.test(String(text || ""))) ideas.pop();
  if (!ideas.length) return null;
  const id = "lib-" + now.getTime();
  return {
    id, source: "library", generatedAt: now.toISOString(),
    recommendations: ideas.map((p, i) => ({
      id: `${id}-${i}`, title: p.title, rationale: p.why, brandTarget: p.retailer,
      status: "pending", source: "library",
    })),
  };
}

// How many batches of each kind the store keeps. Next Plays keeps its history
// (the week-over-week diff reads it); a library synthesis supersedes the last, so
// only a few are kept, and one can never push a Next Plays slate out.
export const KEEP_BATCHES = { "next-plays": 10, library: 3 };

/** `recs` with `batch` added first, each kind capped at its own limit. */
export function addBatch(recs, batch, keep = KEEP_BATCHES) {
  const seen = { "next-plays": 0, library: 0 };
  return [batch, ...(recs || [])].filter(b => {
    const kind = b.source === "library" ? "library" : "next-plays";
    seen[kind] += 1;
    return seen[kind] <= keep[kind];
  });
}

const latestOf = (batches) => [...batches].sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))[0] || null;

/**
 * Every open idea, newest first. An idea is open when nobody has drafted or
 * dismissed it and no initiative already carries its title. Only the LATEST
 * Next Plays slate and the latest library synthesis contribute — an older slate
 * was superseded, not left pending — and the three most recent debates.
 */
export function mergeIdeas({ recs, debates, items }, { debatesLimit = 3 } = {}) {
  const taken = new Set((items || []).map(i => norm(i.title)).filter(Boolean));
  const ideas = [];

  const fromBatch = (batch, source) => {
    if (!batch) return;
    (batch.recommendations || []).forEach(r => {
      if (r.status && r.status !== "pending") return;
      ideas.push({
        key: `${source}:${batch.id}:${r.id}`, source,
        title: r.title, why: r.rationale || r.confidenceRationale || "",
        brand: r.brandTarget || "", category: r.category || "", ice: r.ice || null,
        at: batch.generatedAt || null,
        ref: { batchId: batch.id, recId: r.id },
      });
    });
  };
  fromBatch(latestOf(nextPlaysBatches(recs)), "next-plays");
  fromBatch(latestOf((recs || []).filter(b => b.source === "library")), "library");

  [...(debates || [])]
    .filter(d => Array.isArray(d.results) && d.results.length)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, debatesLimit)
    .forEach(d => {
      const dismissed = new Set(d.dismissedIdeas || []);
      d.results.forEach((idea, idx) => {
        if (dismissed.has(idx)) return;
        ideas.push({
          key: `debate:${d.id}:${idx}`, source: "debate",
          title: idea.title, why: idea.csoRationale || idea.hypothesis || "",
          brand: "", category: idea.category || "", ice: idea.ice || null,
          at: d.date || null,
          ref: { debateId: d.id, idx, idea },
        });
      });
    });

  // One row per idea. Where two sources proposed the same thing, the first (the
  // newest) keeps the row and the others are credited on it.
  const byTitle = new Map();
  ideas
    .filter(i => i.title && !taken.has(norm(i.title)))
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .forEach(i => {
      const k = norm(i.title);
      const hit = byTitle.get(k);
      if (hit) { if (!hit.alsoFrom.includes(i.source) && i.source !== hit.source) hit.alsoFrom.push(i.source); return; }
      byTitle.set(k, { ...i, alsoFrom: [] });
    });
  return [...byTitle.values()];
}

/**
 * The brand an idea names, or null. Exact names first (any case). Models writing
 * `[Retailer] → …` often shorten "Northcove Home" to "Northcove", so a short form
 * that starts exactly one brand's name counts — never a guess between two — and
 * a longer form ("Peak Season Co") takes the most specific brand it starts with.
 */
export function matchBrand(brands, name) {
  const want = norm(name);
  if (!want) return null;
  const list = (brands || []).map(b => ({ b, n: norm(b.name) })).filter(x => x.n);
  const exact = list.find(x => x.n === want);
  if (exact) return exact.b;
  const shortForm = list.filter(x => x.n.startsWith(want + " "));
  if (shortForm.length === 1) return shortForm[0].b;
  const longForm = list.filter(x => want.startsWith(x.n + " ")).sort((a, b) => b.n.length - a.n.length);
  return shortForm.length === 0 && longForm.length ? longForm[0].b : null;
}

/** Open ideas counted by source, for the list's header. */
export function countBySource(ideas) {
  const counts = { "next-plays": 0, debate: 0, library: 0 };
  (ideas || []).forEach(i => { counts[i.source] = (counts[i.source] || 0) + 1; });
  return counts;
}
