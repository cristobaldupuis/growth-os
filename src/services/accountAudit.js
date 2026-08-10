// -- Account audit -------------------------------------------------------------
//
// The first hour of every implementation, made into a surface instead of an
// afternoon.
//
// docs/commercial.md prices implementation at $6,000–$7,500 and says item 2 —
// "audit of the existing ad account: what is nameable, what is not" — is where
// the hours go and is consistently underestimated, 20–40 hours of them. That
// work is real, but almost none of it is judgement. It is counting: how many
// names are there, do they use a delimiter consistently, how many slots do they
// have, what values appear in each slot, how many of them will never parse and
// therefore have to be mapped by hand. A person doing that in a spreadsheet is
// doing arithmetic that this repository already knows how to do — `naming.js`
// has the parser, the vocabularies and the refusal-to-guess.
//
// So this module takes a names-only export — no metrics, no dates, no join, just
// the strings — and returns the audit. Three things follow from that:
//
//   1. **It de-risks the guarantee.** The refund promise in commercial.md covers
//      a working taxonomy in 30 days. The single largest unknown at signature is
//      how bad the account's naming actually is, and this answers it in the
//      first meeting rather than in week three.
//   2. **It is the demo.** "The honest substitute is Airtable plus a
//      spreadsheet, right up to the point where 4,000 ad names have to become
//      dimensions." Pasting a prospect's own 4,000 names in and getting the slot
//      histogram back is that point, arriving in about fifteen seconds, using
//      their data rather than a seeded portfolio.
//   3. **It prices the retrofit.** Names already running cannot be renamed
//      without resetting their learning phase, so every unparseable one is a
//      hand-assignment into `adNames`. Counting them turns "budget 20–40 hours"
//      into a number derived from the account in front of you.
//
// ## What it deliberately does not do
//
// It does not propose a schema and offer to install it. Inferring that slot 4 is
// usually a theme is arithmetic; deciding that this catalogue needs `flavor` as
// a controlled dimension and `angle` as free text is the judgement the retainer
// is paying for, and a button that pretends otherwise would produce a plausible
// taxonomy nobody chose. The audit hands over evidence. A person still designs.

import {
  normKey, resolveSchema, listChannels, listLevels, templateFor, validateValue,
} from "./naming.js";
import { NAME_COLUMNS, normHeader, LEVEL_PRECEDENCE } from "./performance.js";
import { splitCSVLine } from "./csvLine.js";
import { scanHeaders } from "./dataSafety.js";

// Ordered by how likely each is to be the intended separator when several look
// plausible. Underscore first because it survives UTMs and platform exports
// intact; hyphen is second and is also the character most likely to appear
// *inside* a value ("Back-to-School"), which is why a tie goes to underscore.
export const CANDIDATE_DELIMITERS = ["_", "|", "-", "::", "."];

// A name whose modal slot count is 1 has no convention at all. Reported as such
// rather than as a delimiter finding, because "you are not using a delimiter" is
// the answer, not "the best delimiter is underscore with 100% consistency".
const MIN_SLOTS = 2;

/**
 * Pull the names out of whatever the operator pasted.
 *
 * Two shapes, routed by the file's own first line — the same discipline
 * `detectCsvShape` uses, and for the same reason: asking "is this a CSV or a
 * list" is a question the file can answer itself, and every question the
 * operator is asked before they see a result is a chance to lose them.
 *
 * The PII scan runs here because this is the first thing a real client's data
 * touches. An ad-name export should never carry a personal column, and if this
 * one does, that is worth knowing at the point of paste rather than after the
 * account is loaded.
 */
export function extractNames(text) {
  const lines = String(text || "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { names: [], source: "empty", column: "", scan: scanHeaders([]) };

  const rawHeaders = splitCSVLine(lines[0]);
  const headers = rawHeaders.map(normHeader);
  const nameIdx = {};
  headers.forEach((h, i) => { const lvl = NAME_COLUMNS[h]; if (lvl && nameIdx[lvl] === undefined) nameIdx[lvl] = i; });
  const level = LEVEL_PRECEDENCE.find(l => nameIdx[l] !== undefined);

  if (!level) {
    // No name column, so every line is a name — including the first, which in a
    // bare list is data rather than a header.
    return {
      names: lines.map(l => l.trim()).filter(Boolean),
      source: "list", column: "", level: "",
      scan: scanHeaders([]),
    };
  }

  const idx = nameIdx[level];
  const names = [];
  for (let i = 1; i < lines.length; i++) {
    const v = (splitCSVLine(lines[i])[idx] || "").trim();
    if (v) names.push(v);
  }
  return { names, source: "csv", column: rawHeaders[idx] || "", level, scan: scanHeaders(rawHeaders) };
}

/** Distinct names, case-insensitively, with how many rows each accounted for. */
export function distinctNames(names) {
  const map = new Map();
  (names || []).forEach(raw => {
    const name = String(raw || "").trim();
    if (!name) return;
    const k = normKey(name);
    const hit = map.get(k);
    if (hit) hit.count += 1; else map.set(k, { name, count: 1 });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * How many delimiter-separated slots each name has, as a distribution.
 *
 * This single table is the most diagnostic output in the module, and it is worth
 * being explicit about why: an account with one dominant slot count has a
 * convention that somebody has been following, and the implementation is a
 * mapping exercise. An account with a flat histogram across four counts has
 * several conventions layered by staff turnover, and the implementation is a
 * negotiation about which one survives. Those are different quotes, and the
 * difference is visible before anything is designed.
 */
export function slotHistogram(names, delimiter) {
  const counts = new Map();
  (names || []).forEach(n => {
    const slots = String(n).split(delimiter).length;
    counts.set(slots, (counts.get(slots) || 0) + 1);
  });
  const total = (names || []).length || 1;
  return [...counts.entries()]
    .map(([slots, count]) => ({ slots, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.slots - b.slots);
}

/**
 * Which delimiter this account is actually using.
 *
 * Scored by the share of names sitting at the modal slot count, because that is
 * what "consistent" means operationally — not that a character appears, but that
 * it appears the same number of times in most names. A hyphen that shows up in
 * a third of names inside a value scores badly on exactly the right grounds.
 *
 * The schema's own delimiter is passed as `preferred` and wins ties. Changing a
 * workspace's delimiter invalidates every name already built against it, so a
 * coin-flip should never be the reason it changes.
 */
export function inferDelimiter(names, preferred = "_") {
  const candidates = CANDIDATE_DELIMITERS.map(delimiter => {
    const hist = slotHistogram(names, delimiter);
    const top = hist[0] || { slots: 1, count: 0, share: 0 };
    return {
      delimiter,
      dominantSlots: top.slots,
      consistency: top.slots >= MIN_SLOTS ? top.share : 0,
      shapes: hist.filter(h => h.slots >= MIN_SLOTS).length,
    };
  }).sort((a, b) =>
    b.consistency - a.consistency ||
    // Consistency ties more often than it looks like it should: a hyphen inside
    // a format value ("35s-Raw") splits every name into exactly two parts, which
    // is perfectly consistent and carries almost nothing. When two delimiters
    // are equally consistent, the one that splits into more slots is the one
    // being used as a delimiter; the other is a character inside a value.
    b.dominantSlots - a.dominantSlots ||
    (a.delimiter === preferred ? -1 : b.delimiter === preferred ? 1 : 0) ||
    CANDIDATE_DELIMITERS.indexOf(a.delimiter) - CANDIDATE_DELIMITERS.indexOf(b.delimiter)
  );
  const best = candidates[0];
  return {
    candidates,
    chosen: best && best.consistency > 0 ? best.delimiter : preferred,
    // No delimiter produced more than one slot in a majority of names. The
    // account is using free-text names and the finding is that, not a winner.
    unstructured: !best || best.consistency === 0,
  };
}

/**
 * What lives in each slot, for the names that share the dominant shape.
 *
 * Restricted to the dominant shape on purpose. Position 3 of a 9-slot name and
 * position 3 of a 12-slot name are not the same dimension, and pooling them
 * produces a vocabulary that describes nothing.
 *
 * The dimension suggestions are overlap scores against the shipped controlled
 * vocabularies, offered as evidence and labelled as a guess. A slot whose values
 * are 90% present in the `format` vocabulary is very probably format. A slot
 * with 400 distinct values across 500 names is free text, and saying so is more
 * useful than forcing a match.
 */
export function profileSlots(names, delimiter, slots, schema) {
  const rows = (names || []).filter(n => String(n).split(delimiter).length === slots).map(n => String(n).split(delimiter));
  const dims = allDimensions(schema);

  return Array.from({ length: slots }, (_, i) => {
    const values = new Map();
    rows.forEach(parts => {
      const v = (parts[i] || "").trim();
      if (!v) return;
      const k = normKey(v);
      const hit = values.get(k);
      if (hit) hit.count += 1; else values.set(k, { value: v, count: 1 });
    });
    const distinct = [...values.values()].sort((a, b) => b.count - a.count);
    const cardinality = rows.length ? distinct.length / rows.length : 0;

    const suggestions = dims
      .filter(d => d.vocab && d.vocab.length)
      .map(d => {
        const vocab = new Set(d.vocab.map(normKey));
        const matched = distinct.filter(v => vocab.has(normKey(v.value)));
        const rowsMatched = matched.reduce((s, v) => s + v.count, 0);
        return { key: d.key, label: d.label, coverage: rows.length ? rowsMatched / rows.length : 0 };
      })
      .filter(s => s.coverage >= 0.34)
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, 3);

    return {
      index: i,
      distinct: distinct.length,
      top: distinct.slice(0, 12),
      // A slot where nearly every name carries a different value is not a
      // controlled dimension somebody forgot to control; it is an id, a date or
      // a copy line. Naming that shape stops the operator trying to build a
      // vocabulary for it.
      freeText: cardinality > 0.6 && distinct.length > 12,
      suggestions,
    };
  });
}

/** Every dimension the resolved schema knows, template membership aside. */
function allDimensions(schema) {
  const seen = new Map();
  listChannels(schema).forEach(ch => ch.levels.forEach(lv => {
    templateFor(schema, ch.id, lv.key).forEach(d => { if (!seen.has(d.key)) seen.set(d.key, d); });
  }));
  return [...seen.values()];
}

/**
 * How the account fares against the schema as it stands today, per template.
 *
 * Failures are classified rather than counted together, because the three kinds
 * ask for different work and cost different money:
 *
 *   `slots`   — wrong number of segments. Unfixable by editing a vocabulary; the
 *               name has to be mapped by hand or the template has to change.
 *   `vocab`   — right shape, a value the controlled list has never had to
 *               describe. One `addVocabValue` call each, and the names parse.
 *   `illegal` — a space or a comma inside a value. Fixable going forward, not
 *               retroactively, since the live name cannot be renamed.
 *
 * An account that is 80% `vocab` failures is a good account with an incomplete
 * vocabulary and a cheap implementation. An account that is 80% `slots` failures
 * is the 40-hour end of the estimate.
 */
export function schemaFit(names, schema) {
  const templates = [];
  listChannels(schema).forEach(ch => listLevels(schema, ch.id).forEach(lv => {
    const template = templateFor(schema, ch.id, lv.key);
    if (!template.length) return;
    const result = { channel: ch.id, channelLabel: ch.label || ch.id, level: lv.key, levelLabel: lv.label || lv.key,
                     slots: template.length, parsed: 0, failures: { slots: 0, vocab: 0, illegal: 0 }, missingVocab: new Map() };
    (names || []).forEach(name => {
      const parts = String(name).split(schema.delimiter);
      if (parts.length !== template.length) { result.failures.slots += 1; return; }
      let kind = null;
      template.forEach((dim, i) => {
        const part = parts[i];
        if (normKey(part) === normKey(schema.placeholder || "NA")) return;
        const err = validateValue(dim, part, schema.delimiter);
        if (!err) return;
        // Classified from what was actually wrong rather than from the message,
        // so rewording an error string never silently rewrites an audit.
        if (/[\s,]/.test(part)) { kind = kind || "illegal"; return; }
        kind = kind || "vocab";
        const bucket = result.missingVocab.get(dim.key) || { key: dim.key, label: dim.label, values: new Set() };
        bucket.values.add(part);
        result.missingVocab.set(dim.key, bucket);
      });
      if (kind) result.failures[kind] += 1; else result.parsed += 1;
    });
    result.missingVocab = [...result.missingVocab.values()].map(b => ({ ...b, values: [...b.values].slice(0, 20), total: b.values.size }));
    result.rate = names.length ? result.parsed / names.length : 0;
    templates.push(result);
  }));
  return templates.sort((a, b) => b.parsed - a.parsed);
}

/**
 * The whole audit.
 *
 * `names` is the raw list including duplicates; everything below the corpus
 * summary runs on the distinct set, because an ad that ran for 90 days appearing
 * 90 times would otherwise weight the vocabulary by flight length rather than by
 * how many things need naming.
 */
export function auditAccount(rawNames, settings, options = {}) {
  const schema = resolveSchema(settings);
  const rows = (rawNames || []).map(n => String(n || "").trim()).filter(Boolean);
  const distinct = distinctNames(rows);
  const unique = distinct.map(d => d.name);

  const delimiter = inferDelimiter(unique, schema.delimiter);
  const chosen = options.delimiter || delimiter.chosen;
  const histogram = slotHistogram(unique, chosen);
  const dominant = histogram[0] || { slots: 0, count: 0, share: 0 };
  const slots = dominant.slots >= MIN_SLOTS ? profileSlots(unique, chosen, dominant.slots, schema) : [];
  const fit = schemaFit(unique, schema);
  const best = fit[0] || null;

  // Every distinct name the best-fitting template cannot parse is a hand
  // assignment: register the live name on the initiative rather than rename the
  // campaign. This is the number that prices the retrofit, so it is reported as
  // names — the unit of work — and never converted into an hours figure here.
  // How fast the operator maps one is theirs to know, not this module's to
  // assume.
  const retrofit = best
    ? unique.filter(n => !parsesUnder(n, schema, best))
    : unique.slice();

  return {
    corpus: { rows: rows.length, distinct: unique.length, repeated: rows.length - unique.length },
    delimiter: { ...delimiter, using: chosen, matchesSchema: chosen === schema.delimiter },
    histogram, dominant, slots,
    fit, best,
    retrofit: { count: retrofit.length, share: unique.length ? retrofit.length / unique.length : 0, sample: retrofit.slice(0, 200) },
    schema,
  };
}

function parsesUnder(name, schema, template) {
  const dims = templateFor(schema, template.channel, template.level);
  const parts = String(name).split(schema.delimiter);
  if (parts.length !== dims.length) return false;
  return dims.every((dim, i) =>
    normKey(parts[i]) === normKey(schema.placeholder || "NA") || !validateValue(dim, parts[i], schema.delimiter));
}

/**
 * The audit as a file, because the deliverable leaves the room.
 *
 * The audit is presented in a first meeting and then quoted against a week
 * later, usually by somebody who was not in the meeting. A screenshot does not
 * survive that; a CSV does.
 */
export function auditToCSV(audit) {
  const esc = (v) => {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [["section", "key", "value", "detail"]];
  const push = (...r) => out.push(r.map(esc));

  push("corpus", "rows", audit.corpus.rows, "");
  push("corpus", "distinct names", audit.corpus.distinct, "");
  push("delimiter", "inferred", audit.delimiter.using, audit.delimiter.unstructured ? "no consistent delimiter found" : "");
  push("delimiter", "matches schema", audit.delimiter.matchesSchema ? "yes" : "no", "");
  audit.histogram.forEach(h => push("shape", `${h.slots} slots`, h.count, `${(h.share * 100).toFixed(1)}% of distinct names`));
  audit.slots.forEach(s => push("slot", `position ${s.index + 1}`, s.distinct,
    s.freeText ? "free text" : (s.suggestions[0] ? `looks like ${s.suggestions[0].label} (${(s.suggestions[0].coverage * 100).toFixed(0)}%)` : "no vocabulary match")));
  audit.slots.forEach(s => s.top.forEach(v => push("slot value", `position ${s.index + 1}`, v.value, v.count)));
  audit.fit.forEach(f => push("schema fit", `${f.channelLabel}/${f.levelLabel}`, `${(f.rate * 100).toFixed(1)}%`,
    `${f.parsed} parsed, ${f.failures.slots} wrong slot count, ${f.failures.vocab} unknown value, ${f.failures.illegal} illegal character`));
  (audit.best?.missingVocab || []).forEach(m => m.values.forEach(v => push("missing vocabulary", m.label, v, "add to the controlled list")));
  push("retrofit", "names to map by hand", audit.retrofit.count, `${(audit.retrofit.share * 100).toFixed(1)}% of distinct names`);
  audit.retrofit.sample.forEach(n => push("retrofit name", "", n, ""));

  return out.map(r => r.join(",")).join("\n");
}
