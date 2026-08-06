// -- Campaign nomenclature -----------------------------------------------------
//
// A naming convention is the cheapest attribution layer that exists. Every ad
// platform gives you a free-text name field on every entity, and if that field
// carries a positional, controlled-vocabulary string then every performance
// export becomes a dimensional fact table without a single API integration.
// Parse the name, and "CTR by creator", "CVR by angle", "spend by funnel stage"
// are all group-bys rather than bespoke reports.
//
// The convention shipped here is the one in use at Legendary (Meta), lifted
// verbatim from the operator's spec sheet:
//
//   Channel_Handle_Asset_Campaign_Gender_Theme_Angle_Category_Flavor_Format_Initiative
//
// Two properties of that spec do the real work and are worth stating, because
// they are what make positional parsing safe at all:
//
//   1. Segments are NEVER omitted or reordered. An absent value is the literal
//      "NA". A blank would shift every downstream segment by one position and
//      silently mis-attribute the whole row — the failure mode is not a parse
//      error, it is wrong data that looks right.
//   2. The delimiter never appears inside a segment. Multi-word values are
//      CamelCase (PinkSprinkle, not Pink_Sprinkle, not pink-sprinkle).
//
// The last segment is the one that matters to Growth OS. `Initiative` carries an
// initiative's `trackingTag`, which is the attribution socket already present on
// every initiative record (see `mkDefault` in constants.js). That is the join:
// ad name -> trackingTag -> initiative. Business-as-usual ads carry "NA" and
// join to nothing, which is correct — most spend is not an experiment.
//
// The schema is data, not code. It lives in `settings.namingSchema` so an
// operator can edit vocabularies without a deploy, and so a future multi-tenant
// deployment stores one schema per tenant rather than one per build. The default
// below is the seed for that setting, not a hardcoded contract.

/** Value written into a segment that does not apply. Never blank — see above. */
export const NA = "NA";

/**
 * The shipped default schema.
 *
 * `vocab: null` marks a free-text segment. Free text is deliberately rare: every
 * free-text segment is a dimension that will accumulate typos and split its own
 * totals when pivoted (SweetRoll vs SweetRolls vs SwetRolls — all three existed
 * in the v1 sheet). Only three segments earn it:
 *
 *   - `asset`   — creator names, which are open-ended by nature.
 *   - `angle`   — the experimentation field. Constraining it would defeat its
 *                 purpose; a new test hook must not require a schema edit.
 *   - `initiative` — must match a trackingTag, which is generated per initiative.
 *
 * `role` is how app logic finds a segment without depending on its position or
 * label, so renaming "Flavor" to "Variant" for a non-food client doesn't break
 * the initiative bridge or the channel filter.
 */
export const DEFAULT_NAMING_SCHEMA = {
  id: "legendary-meta-v2",
  label: "Meta / Legendary",
  delimiter: "_",
  placeholder: NA,
  segments: [
    { key:"channel",    label:"Channel",    role:"channel",    vocab:["Meta","Google","TikTok","Amazon"],
      hint:"Platform the ad runs on." },
    { key:"handle",     label:"Handle",     role:"handle",     vocab:["LF","Col","WL"],
      hint:"LF = owned brand, Col = collaboration/influencer, WL = whitelisting/partner." },
    { key:"asset",      label:"Asset",      role:"asset",      vocab:null,
      hint:"Creator name, or asset type (ProductPack, ProductSingle, Catalog). CamelCase, no spaces." },
    // `Donuts` and `FreeSample` are not in the spec sheet's declared Campaign
    // list, but its own rows use them as launch buckets — validating against the
    // declared list alone would flag live, correct data as broken on first run.
    // The vocabulary is what is actually in use, not what was written down.
    { key:"campaign",   label:"Campaign",   role:"campaign",   vocab:["R1","R2","R3","R4","R5","Evergreen","Generic","Promo","Donuts","FreeSample"],
      hint:"Influencer round (R1–R5), evergreen bucket, or a named launch bucket. The closest key to a media campaign." },
    { key:"gender",     label:"Gender",     role:"gender",     vocab:["F","M",NA],
      hint:"Presenter gender. NA for product and non-creator ads." },
    { key:"theme",      label:"Theme",      role:"theme",      vocab:["Protein","Fitness","Family","DayInLife","Taste","Nutrition","Convenience","Lifestyle","Product"],
      hint:"Broad creative bucket. Controlled — new themes are a deliberate decision, not a typo." },
    { key:"angle",      label:"Angle",      role:"angle",      vocab:null,
      hint:"The specific test hook inside the theme (TimeSaver, Macros, Routine). This is the experimentation field." },
    { key:"category",   label:"Category",   role:"productLine",vocab:["Pastry","SweetRolls","Donuts","Chips","All"],
      hint:"Product line." },
    { key:"flavor",     label:"Flavor",     role:"variant",    vocab:["Chocolate","MilkChocolate","Strawberry","Blueberry","Cinnamon","CinnamonCrumble","BrownSugar","PinkSprinkle","VanillaGlazed","Smores","CherryCrumble","BBQ","Nacho","Varied","AllFlavors",NA],
      hint:"Specific SKU variant. NA if not variant-specific." },
    { key:"format",     label:"Format",     role:"format",     vocab:["Static","Carousel","Video","Enhanced","Static-Boost","25s","30s","35s","40s","45s","50s","60s","23s-Captions","24s-Captions","25s-Captions","30s-Captions","35s-Captions","40s-Captions","45s-Captions","50s-Captions","60s-Captions","25s-Raw","30s-Raw","35s-Raw","50s-MealStamps",NA],
      hint:"Creative format or cut length." },
    { key:"initiative", label:"Initiative", role:"initiative", vocab:null,
      hint:"The Growth OS bridge. Set to the initiative's trackingTag when this ad belongs to a tracked experiment. NA otherwise — never invent one." },
  ],
};

/** Resolve the active schema, tolerating a settings object that predates it. */
export function resolveSchema(settings) {
  const s = settings && settings.namingSchema;
  return (s && Array.isArray(s.segments) && s.segments.length > 0) ? s : DEFAULT_NAMING_SCHEMA;
}

const segRole = (schema, role) => schema.segments.find(s => s.role === role) || null;

/** The segment carrying an initiative's trackingTag, or null if this schema has none. */
export const initiativeSegment = (schema) => segRole(schema, "initiative");

// A segment value has to survive being pasted into an ad platform, exported to
// CSV, and read back positionally. That rules out the delimiter itself,
// whitespace (Meta silently trims and UTMs break), and commas.
const ILLEGAL = /[\s,]/;

/**
 * Validate one segment value against its definition.
 * Returns null when valid, or a human-readable reason when not.
 */
export function validateSegment(seg, rawValue, delimiter) {
  const value = (rawValue == null ? "" : String(rawValue)).trim();
  if (!value) return `${seg.label} is empty — write "${NA}" instead. A blank segment shifts every segment after it and mis-attributes the row.`;
  if (value.includes(delimiter)) return `${seg.label} contains the delimiter "${delimiter}". Use CamelCase for multi-word values.`;
  if (ILLEGAL.test(value)) return `${seg.label} contains a space or comma, which breaks UTMs and CSV exports.`;
  if (seg.vocab && !seg.vocab.includes(value)) {
    return `${seg.label} "${value}" is not in the controlled list (${seg.vocab.slice(0, 6).join(", ")}${seg.vocab.length > 6 ? ", …" : ""}).`;
  }
  return null;
}

/**
 * Build a name from a `{segmentKey: value}` map.
 *
 * Missing keys become the placeholder rather than throwing, because the common
 * caller is an AI-generated variant that filled in most of the schema — a
 * partial fill should produce a valid, obviously-incomplete name the operator
 * can correct, not an exception that loses the rest of the generation.
 *
 * Returns `{ name, errors }`. `errors` being non-empty does NOT mean `name` is
 * unusable; it means at least one segment is off-vocabulary and should be shown
 * to the operator before the name is pasted into an ad platform.
 */
export function buildName(values, schema) {
  const sch = schema || DEFAULT_NAMING_SCHEMA;
  const ph = sch.placeholder || NA;
  const errors = [];
  const parts = sch.segments.map(seg => {
    const raw = values && values[seg.key];
    const value = (raw == null || String(raw).trim() === "") ? ph : String(raw).trim();
    if (value !== ph) {
      const err = validateSegment(seg, value, sch.delimiter);
      if (err) errors.push(err);
    }
    return value;
  });
  return { name: parts.join(sch.delimiter), errors };
}

/**
 * Parse a name back into `{segmentKey: value}`.
 *
 * Segment-count mismatch is reported rather than guessed at. A name with the
 * wrong number of segments cannot be positionally parsed — any alignment we
 * picked would be a coin flip, and a wrong-but-plausible parse is worse than an
 * unparsed row because it enters the analysis silently. Extra trailing segments
 * are the one recoverable case (an operator appended something), so they're
 * captured in `extra` rather than discarded.
 */
export function parseName(name, schema) {
  const sch = schema || DEFAULT_NAMING_SCHEMA;
  const raw = (name == null ? "" : String(name)).trim();
  if (!raw) return { values:{}, errors:["Name is empty."], extra:[], ok:false };

  const parts = raw.split(sch.delimiter);
  const n = sch.segments.length;
  const errors = [];
  const extra = parts.length > n ? parts.slice(n) : [];

  if (parts.length < n) {
    errors.push(`Expected ${n} segments, found ${parts.length}. Missing values must be written as "${sch.placeholder || NA}" rather than omitted — this name cannot be parsed positionally.`);
    return { values:{}, errors, extra:[], ok:false };
  }
  if (extra.length > 0) {
    errors.push(`Expected ${n} segments, found ${parts.length}. The trailing ${extra.length} were not parsed.`);
  }

  const values = {};
  sch.segments.forEach((seg, i) => {
    const value = parts[i];
    values[seg.key] = value;
    const ph = sch.placeholder || NA;
    if (value !== ph) {
      const err = validateSegment(seg, value, sch.delimiter);
      if (err) errors.push(err);
    }
  });

  return { values, errors, extra, ok: errors.length === 0 };
}

/**
 * The trackingTag an ad name claims, or null when it carries the placeholder or
 * the schema has no initiative segment.
 *
 * Deliberately does not resolve the initiative itself — this module knows about
 * names, not about the portfolio. Callers join on trackingTag.
 */
export function trackingTagFromName(name, schema) {
  const sch = schema || DEFAULT_NAMING_SCHEMA;
  const seg = initiativeSegment(sch);
  if (!seg) return null;
  const { values } = parseName(name, sch);
  const value = values[seg.key];
  if (!value || value === (sch.placeholder || NA)) return null;
  return value;
}

/**
 * Resolve a list of ad names against a list of initiatives on trackingTag.
 * Returns `{ matched: [{name, trackingTag, initiative}], unmatched, untagged }`.
 *
 * `untagged` (placeholder in the initiative segment) is separated from
 * `unmatched` (a tag that resolves to nothing) on purpose: the first is normal
 * business-as-usual spend, the second is a broken link worth surfacing.
 */
export function matchNamesToInitiatives(names, items, schema) {
  const sch = schema || DEFAULT_NAMING_SCHEMA;
  const byTag = new Map();
  (items || []).forEach(it => { if (it && it.trackingTag) byTag.set(String(it.trackingTag).trim(), it); });

  const matched = [], unmatched = [], untagged = [];
  (names || []).forEach(name => {
    const tag = trackingTagFromName(name, sch);
    if (!tag) { untagged.push(name); return; }
    const initiative = byTag.get(tag);
    if (initiative) matched.push({ name, trackingTag: tag, initiative });
    else unmatched.push({ name, trackingTag: tag });
  });
  return { matched, unmatched, untagged };
}

/**
 * Derive a trackingTag for an initiative that doesn't have one.
 *
 * Uses the human-facing initId (NH-001) with the delimiter stripped, because the
 * tag has to survive being a segment in the name and the initId is already
 * unique, short, and meaningful to whoever reads the ad name in the platform UI.
 *
 * The substitute character is chosen against the schema rather than hardcoded:
 * replacing the delimiter with "-" is right for the default schema, but for a
 * schema whose delimiter IS "-" it is a no-op that would emit a tag containing
 * the delimiter — a value that silently corrupts every name built from it.
 */
export function suggestTrackingTag(item, schema) {
  const sch = schema || DEFAULT_NAMING_SCHEMA;
  const base = (item && (item.initId || item.id) || "").toString();
  const sub = sch.delimiter === "-" ? "" : "-";
  const cleaned = base.split(sch.delimiter).join(sub).replace(/[\s,]/g, "");
  return cleaned || null;
}

/**
 * Group parsed rows by one segment, summing the numeric fields present.
 *
 * This is the shape every "break performance down by X" view needs, and it is
 * intentionally a pure function over already-parsed rows: it works identically
 * on CSV-imported performance data today and on API-sourced rows later, which
 * is the same normalisation-contract discipline the weekly metrics path uses.
 *
 * `rows` are `{name, metrics:{}}`. Rows whose name fails to parse are counted in
 * `unparsed` rather than dropped silently — a breakdown that quietly excludes a
 * third of spend is worse than one that says so.
 */
export function breakdownBySegment(rows, segmentKey, schema) {
  const sch = schema || DEFAULT_NAMING_SCHEMA;
  const groups = new Map();
  let unparsed = 0;

  (rows || []).forEach(row => {
    const { values, ok } = parseName(row && row.name, sch);
    // A vocabulary warning still yields a usable value for this segment, so only
    // a structural failure (no values at all) disqualifies the row.
    const key = values[segmentKey];
    if (!key) { unparsed++; return; }
    if (!ok && Object.keys(values).length === 0) { unparsed++; return; }

    const bucket = groups.get(key) || { value:key, rows:0, metrics:{} };
    bucket.rows += 1;
    Object.entries((row && row.metrics) || {}).forEach(([k, v]) => {
      if (typeof v === "number" && !isNaN(v)) bucket.metrics[k] = (bucket.metrics[k] || 0) + v;
    });
    groups.set(key, bucket);
  });

  return { groups: Array.from(groups.values()).sort((a, b) => b.rows - a.rows), unparsed };
}
