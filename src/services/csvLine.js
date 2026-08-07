// One CSV line splitter, for every importer in the app.
//
// There used to be three. `services/csv.js` had a quote-aware `splitLine`
// closed over inside `parseCSV`, `services/performance.js` exported a
// functionally identical `splitCSVLine`, and `constants.js`'s weekly-metrics
// parser used a plain `line.split(",")`.
//
// That third one was the problem, and performance.js's own header comment
// already named it: every real Meta or GA4 export quotes at least one field,
// because campaign names contain commas constantly, and a naive split shifts
// every column after the first quoted cell. The weekly metrics import is
// exactly where a Meta export lands, so the broken parser was the one facing
// the input most likely to break it. Worse, the import modal read its header
// preview with the quote-aware splitter and its body with the naive one, so the
// preview could show the right columns while the rows behind it misaligned.
//
// Keeping this in its own module rather than in csv.js is a cycle constraint,
// not a taste one: csv.js imports constants.js, so constants.js cannot import
// csv.js back.

/**
 * Split one CSV line into trimmed cell values, honouring double quotes.
 *
 * A doubled quote inside a quoted field ("") is the escape for a literal quote,
 * per RFC 4180.
 *
 * Both of the implementations this replaces finished with a
 * `.replace(/^"|"$/g, "")` pass over each cell, as a defence against quotes the
 * state machine might have left behind. It cannot leave any: a quote character
 * is either a delimiter (consumed, never appended) or half of an escape pair
 * (appended deliberately). So that pass had nothing legitimate to catch and one
 * thing to break — a field ending in an escaped quote, `"say ""hi"""`, came out
 * as `say "hi` because the strip ate the closing quote the escape had just
 * earned. It is gone rather than made conditional; the parse is correct without
 * it.
 */
export function splitCSVLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
