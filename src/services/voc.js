// -- Customer voice ------------------------------------------------------------------
//
// The creative brief is told that its `insight` must be a claim about the buyer,
// not the product — and until now it was given no buyer data to make one from.
// Seven brand fields describe the brand; nothing described what customers say. So
// the model wrote a plausible insight, which is the one thing a brief must not be.
//
// Customer voice closes that gap with the cheapest evidence a brand has: reviews,
// survey answers, support replies, ad comments — pasted into the brand, split into
// snippets, and quoted to the model with an id each, the same way closed learnings
// are. The brief cites the ids its insight rests on (`vocCited`), and hooks are
// written in customers' words rather than a copywriter's guess at them.
//
// ## The data contract still holds
//
// docs/data-handling.md says no person enters the workspace. A review's TEXT is
// not a person, but a pasted review often arrives with one attached — a name
// sign-off, an email, a handle. Those are stripped here, at the point of entry,
// and the count of what was stripped is reported rather than silently absorbed.
// The scrub is a backstop for honest pasting, not a licence to paste a CRM
// export: the Settings field says to paste the words only.

// Enough snippets to carry the variety of what a brand's customers say; few
// enough that the block stays small next to the brief it grounds.
export const VOC_LIMIT = 30;
export const SNIPPET_MAX = 400;
const SNIPPET_MIN = 12;

export const VOC_RULE = "most words shared with the initiative and product, then the order they were pasted";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Seven or more digits once separators are ignored — a phone number, an order
// number, a card fragment. None of them is something a brief should quote.
const PHONE_RE = /(?:\+?\d[\s().-]?){7,}\d/g;
const HANDLE_RE = /(^|[\s(])@[A-Za-z0-9_.]{2,}/g;
const URL_RE = /\bhttps?:\/\/\S+/gi;
// A trailing sign-off: "— Jane D.", "- Sarah K., Austin", "~Mike". Only at the
// END of a snippet and only after a dash or tilde, because a capitalised word
// mid-sentence is far more often a product name than a person.
const SIGNOFF_RE = /\s*[—–~-]+\s*[A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*){0,2}\.?(?:\s*,\s*[\p{L} .'-]{2,40})?\s*$/u;
// A leading attribution: "Jane D. wrote:", "Review by Mark:".
const LEADIN_RE = /^\s*(?:[Rr]eview\s+[Bb]y\s+)?[A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*){0,2}\s*(?:wrote|says|said)?\s*:\s+/u;

/** One snippet with identifiers removed. Returns `{text, scrubbed}`. */
export function scrubSnippet(raw) {
  let text = String(raw == null ? "" : raw);
  const before = text;
  text = text
    .replace(EMAIL_RE, "[email removed]")
    .replace(URL_RE, "[link removed]")
    .replace(PHONE_RE, "[number removed]")
    .replace(HANDLE_RE, "$1[handle removed]");
  text = text.replace(SIGNOFF_RE, "");
  if (/^\s*(?:[Rr]eview\s+[Bb]y\s+)?[A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*){0,2}\s*(?:wrote|says|said)\s*:/u.test(text) || /^\s*review\s+by\s+/i.test(text)) {
    text = text.replace(LEADIN_RE, "");
  }
  text = text.replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "").replace(/\s+/g, " ").trim();
  return { text, scrubbed: text !== before.replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "").replace(/\s+/g, " ").trim() };
}

/**
 * The pasted field, as snippets with stable ids.
 *
 * Blank lines separate snippets when there are any (a multi-line review stays
 * one snippet); otherwise every line is one. Ids are positional — `V1` is the
 * first snippet pasted — so a citation keeps pointing at the same words as long
 * as the field is only appended to.
 */
export function splitVoc(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return { snippets: [], scrubbedCount: 0, droppedCount: 0 };
  const parts = /\n\s*\n/.test(raw) ? raw.split(/\n\s*\n/) : raw.split("\n");
  const seen = new Set();
  const snippets = [];
  let scrubbedCount = 0, droppedCount = 0;
  parts.forEach(part => {
    const { text: clean, scrubbed } = scrubSnippet(part);
    if (clean.length < SNIPPET_MIN) { if (part.trim()) droppedCount++; return; }
    const key = clean.toLowerCase();
    if (seen.has(key)) { droppedCount++; return; }
    seen.add(key);
    if (scrubbed) scrubbedCount++;
    const bounded = clean.length > SNIPPET_MAX ? clean.slice(0, SNIPPET_MAX - 1).trimEnd() + "…" : clean;
    snippets.push({ id: "V" + (snippets.length + 1), text: bounded });
  });
  return { snippets, scrubbedCount, droppedCount };
}

const STOPWORDS = new Set(("a an and are as at be because but by for from has have i if in into is it its of on or our " +
  "so that the their them then there these they this to too was we were will with you your my me not no just very " +
  "will would can could should than when which who why how what more most less also only").split(" "));

const tokens = (s) => new Set(String(s || "").toLowerCase().match(/[\p{L}\p{N}']+/gu)?.filter(w => w.length > 2 && !STOPWORDS.has(w)) || []);

/**
 * The snippets a brief is shown, ranked by a stated rule, with the remainder
 * counted — the same discipline as selectLearnings: a deterministic rule can be
 * wrong, but it cannot be silently wrong.
 */
export function selectVoc(snippets, context = {}, opts = {}) {
  const limit = opts.limit || VOC_LIMIT;
  const all = snippets || [];
  const want = tokens([context.title, context.hypothesis, context.observation, context.category, context.productName].join(" "));
  const scored = all.map((s, i) => {
    let score = 0;
    tokens(s.text).forEach(w => { if (want.has(w)) score++; });
    return { s, i, score };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return {
    shown: scored.slice(0, limit).map(x => x.s),
    total: all.length,
    excluded: Math.max(0, all.length - limit),
    rule: VOC_RULE,
  };
}

/** The selection as prompt text. */
export function formatVocBlock(selection) {
  if (!selection || !selection.total) {
    return "  (no customer voice supplied — the insight cannot quote customers, and `evidenceGaps` should say that reviews or survey answers would sharpen it)";
  }
  const lines = selection.shown.map(s => `  [${s.id}] "${s.text}"`);
  if (selection.excluded > 0) {
    lines.push(`  (${selection.shown.length} of ${selection.total} snippets shown, selected by ${selection.rule}. Do not claim to have read the rest.)`);
  }
  return lines.join("\n");
}

/** Snippet text for the ids a brief or variant cited, in the order cited. */
export function citedSnippets(snippets, ids) {
  const byId = new Map((snippets || []).map(s => [s.id, s]));
  return (ids || []).map(id => byId.get(id)).filter(Boolean);
}

/** The brand's voice as prompt text, or a line saying there is none. */
export function formatVoiceBlock(voice) {
  const v = String(voice || "").trim();
  if (!v) return "BRAND VOICE: not specified — write plainly, in the register of the brand brief, with no hype words.";
  return "BRAND VOICE (follow it in every line of copy; words it says to avoid never appear):\n  " + v.replace(/\s*\n\s*/g, "\n  ");
}
