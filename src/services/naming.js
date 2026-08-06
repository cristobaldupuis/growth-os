// -- Campaign nomenclature -----------------------------------------------------
//
// A naming convention is the cheapest attribution layer that exists. Every ad
// platform gives you a free-text name field on every entity, and if that field
// carries a positional, controlled-vocabulary string then every performance
// export becomes a dimensional fact table without a single API integration.
//
// ## Why this is a registry and not a string format
//
// The first version of this module was one flat 11-segment template. That is
// really a Meta *ad-level* name, and it cannot describe the rest of the estate:
//
//   - Entity hierarchies differ. Meta is campaign → ad set → ad; Google is
//     campaign → ad group → ad; Klaviyo is flow → message → variant. A single
//     template has nowhere to put that.
//   - Dimensions live at different levels per channel, and move over time. The
//     Eli Health spec says it outright: "Product sits at campaign level while Eli
//     sells one SKU, and moves down to ad set the day a second product launches."
//   - Some dimensions are channel-specific. Gender is a targeting dimension on
//     Meta and meaningless on Google Search.
//
// So the semantic layer and the syntactic layer are separated:
//
//   DIMENSIONS  — one channel-agnostic registry of what a thing can be described
//                 by (funnel, geo, audience, angle, offer, initiative…).
//   CHANNELS    — each with its own ordered levels.
//   TEMPLATES   — (channel, level) → an ordered list of dimension keys.
//
// One record of dimension values therefore projects into a campaign name, an ad
// set name and an ad name simultaneously, per channel, and parsing runs the same
// projection in reverse. Adding TikTok is a template, not a code change. Moving
// `product` from campaign to ad set is an edit to two arrays.
//
// ## The two rules that make positional parsing safe
//
//   1. Slots are NEVER omitted or reordered. An absent value is the placeholder
//      ("NA"). A blank shifts every following segment and silently mis-attributes
//      the row — the failure mode is not an error, it is wrong data that looks
//      right.
//   2. The delimiter never appears inside a value.
//
// ## Case
//
// The Legendary sheet uses CamelCase; the Eli Health spec mandates lowercase,
// reasoning that "mixed case creates phantom distinct values when pivoting."
// That observation is correct and the prescription is heavier than it needs to
// be. Values are stored and displayed as written, and every *comparison* —
// vocabulary validation, grouping, initiative matching — is case-insensitive. So
// `PinkSprinkle` and `pinksprinkle` never split a pivot into two rows, and
// nobody has to give up a readable convention to get that.
//
// ## The Growth OS bridge
//
// The `initiative` dimension carries an initiative's `trackingTag` — the
// attribution socket already on every initiative record. That is the join: ad
// name → trackingTag → initiative. Business-as-usual entities carry the
// placeholder and join to nothing, which is correct; most spend is not an
// experiment.

/** Value written into a slot that does not apply. Never blank — see above. */
export const NA = "NA";

/** Case-insensitive comparison key. The single place case is collapsed. */
export const normKey = (v) => String(v == null ? "" : v).trim().toLowerCase();

// -- Dimension registry --------------------------------------------------------
//
// `vocab: null` marks a free-text dimension. Free text is deliberately rare:
// every free-text dimension accumulates typos and splits its own totals when
// pivoted. Only the ones that are open-ended by nature get it — creator names,
// the experimentation field, and the initiative tag.

const DIMENSIONS = [
  { key:"channel",    label:"Channel",     vocab:["Meta","Google","YouTube","TikTok","Amazon","Klaviyo"], hint:"Platform the entity runs on." },
  { key:"handle",     label:"Handle",      vocab:["LF","Col","WL"], hint:"LF = owned brand, Col = collaboration/influencer, WL = whitelisting/partner." },
  { key:"funnel",     label:"Funnel",      vocab:["Prospect","Retarget","Retain","Brand"], hint:"Funnel stage this entity serves." },
  { key:"geo",        label:"Geo",         vocab:["US","CA","UK","EU","AU","NA"], hint:"Market. Split so geos can be compared rather than blended." },
  { key:"objective",  label:"Objective",   vocab:["Purchase","AddToCart","Lead","Traffic","Awareness","AppInstall","NA"], hint:"The conversion event optimised for." },
  { key:"bidding",    label:"Bidding",     vocab:["Auto","Value","Cost","Bid","Manual","NA"], hint:"Bid or optimisation strategy." },
  { key:"audience",   label:"Audience",    vocab:null, hint:"Targeting group. CamelCase, no spaces (StressInterest, LAL5-Buyers)." },
  { key:"age",        label:"Age",         vocab:null, hint:"Age band as a range with a hyphen (25-34), or NA." },
  { key:"gender",     label:"Gender",      vocab:["F","M",NA], hint:"Targeted or presented gender. NA where it does not apply." },
  { key:"placement",  label:"Placement",   vocab:["Feed","Stories","Reels","Search","Shopping","PMax","DemandGen","Display","Audience","NA"], hint:"Where the ad serves." },
  { key:"asset",      label:"Asset",       vocab:null, hint:"Creator name, or asset type (ProductPack, ProductSingle, Catalog). CamelCase." },
  { key:"campaign",   label:"Campaign",    vocab:["R1","R2","R3","R4","R5","Evergreen","Generic","Promo","Donuts","FreeSample"], hint:"Influencer round, evergreen bucket, or named launch bucket." },
  { key:"theme",      label:"Theme",       vocab:["Protein","Fitness","Family","DayInLife","Taste","Nutrition","Convenience","Lifestyle","Product"], hint:"Broad creative bucket. Controlled — a new theme is a decision, not a typo." },
  { key:"angle",      label:"Angle",       vocab:null, hint:"The specific test hook inside the theme. This is the experimentation field — never constrain it." },
  { key:"category",   label:"Category",    vocab:["Pastry","SweetRolls","Donuts","Chips","All"], hint:"Product line." },
  { key:"flavor",     label:"Flavor",      vocab:["Chocolate","MilkChocolate","Strawberry","Blueberry","Cinnamon","CinnamonCrumble","BrownSugar","PinkSprinkle","VanillaGlazed","Smores","CherryCrumble","BBQ","Nacho","Varied","AllFlavors",NA], hint:"Specific SKU variant." },
  { key:"concept",    label:"Concept",     vocab:null, hint:"Reusable creative concept id (UGC04). Pools variants so they reach significance together." },
  { key:"cut",        label:"Cut",         vocab:["V1","V2","V3","V4","V5",NA], hint:"Variant number within a concept." },
  { key:"talent",     label:"Talent",      vocab:["Woman","Man","Family","Expert","None",NA], hint:"Who is on screen, so creative can be read by presenter." },
  { key:"format",     label:"Format",      vocab:["Static","Carousel","Video","Enhanced","Static-Boost","25s","30s","35s","40s","45s","50s","60s","23s-Captions","24s-Captions","25s-Captions","30s-Captions","35s-Captions","40s-Captions","45s-Captions","50s-Captions","60s-Captions","25s-Raw","30s-Raw","35s-Raw","50s-MealStamps",NA], hint:"Creative format or cut length." },
  { key:"lane",       label:"Lane",        vocab:["Question","Capability","Voices","NA"], hint:"Compliance lane the claim sits in." },
  { key:"offer",      label:"Offer",       vocab:["Sub","OneTime","Bundle","FreeProduct","Discount","NA"], hint:"Commercial offer, so subscription spend is visible separately." },
  { key:"cta",        label:"CTA",         vocab:["ShopNow","LearnMore","SignUp","GetOffer","NA"], hint:"Call to action." },
  { key:"initiative", label:"Initiative",  vocab:null, hint:"The Growth OS bridge. Set to the initiative's trackingTag when this belongs to a tracked experiment. NA otherwise — never invent one." },
];

// -- Channels and their levels -------------------------------------------------
//
// The Meta ad-level template is byte-identical to the convention already in
// production, so every name built before this rewrite still parses and every
// name built after it is still pasteable into the same account.

const CHANNELS = [
  { id:"meta", label:"Meta", levels:[
    { key:"campaign", label:"Campaign", template:["channel","funnel","category","geo","objective"] },
    { key:"adset",    label:"Ad set",   template:["geo","age","gender","audience","bidding"] },
    { key:"ad",       label:"Ad",       template:["channel","handle","asset","campaign","gender","theme","angle","category","flavor","format","initiative"] },
  ]},
  { id:"google", label:"Google Ads", levels:[
    { key:"campaign", label:"Campaign", template:["channel","funnel","category","geo","objective"] },
    { key:"adgroup",  label:"Ad group", template:["audience","placement","bidding"] },
    { key:"ad",       label:"Ad",       template:["channel","handle","asset","campaign","format","angle","category","flavor","offer","initiative"] },
  ]},
  { id:"youtube", label:"YouTube", levels:[
    { key:"campaign", label:"Campaign", template:["channel","funnel","category","geo","objective"] },
    { key:"adgroup",  label:"Ad group", template:["audience","placement","bidding"] },
    { key:"ad",       label:"Ad",       template:["channel","format","concept","cut","talent","angle","lane","offer","initiative"] },
  ]},
  { id:"tiktok", label:"TikTok", levels:[
    { key:"campaign", label:"Campaign", template:["channel","funnel","category","geo","objective"] },
    { key:"adgroup",  label:"Ad group", template:["geo","age","gender","audience","bidding"] },
    { key:"ad",       label:"Ad",       template:["channel","handle","asset","campaign","theme","angle","category","format","initiative"] },
  ]},
  { id:"klaviyo", label:"Klaviyo", levels:[
    { key:"flow",    label:"Flow",    template:["channel","funnel","audience","objective"] },
    { key:"message", label:"Message", template:["channel","theme","angle","offer","initiative"] },
  ]},
];

export const DEFAULT_NAMING_SCHEMA = {
  id: "marketers-lab-v1",
  label: "Marketers Lab — cross-channel",
  delimiter: "_",
  placeholder: NA,
  dimensions: DIMENSIONS,
  channels: CHANNELS,
  initiativeDimension: "initiative",
};

// -- Schema resolution ---------------------------------------------------------

/**
 * Normalise a stored schema into the registry shape.
 *
 * Accepts the pre-rewrite flat `{segments:[…]}` form and lifts it into a
 * single-channel, single-level registry. Settings written before either shape
 * existed fall through to the default. Nothing here requires a migration — a
 * workspace saved yesterday keeps working, which is the property that lets the
 * convention evolve without a coordinated release.
 */
export function resolveSchema(settings) {
  const s = settings && settings.namingSchema;
  if (!s) return DEFAULT_NAMING_SCHEMA;
  if (Array.isArray(s.dimensions) && Array.isArray(s.channels) && s.channels.length > 0) return s;

  if (Array.isArray(s.segments) && s.segments.length > 0) {
    const initSeg = s.segments.find(seg => seg.role === "initiative");
    return {
      id: s.id || "legacy-flat",
      label: s.label || "Legacy",
      delimiter: s.delimiter || "_",
      placeholder: s.placeholder || NA,
      dimensions: s.segments.map(seg => ({ key:seg.key, label:seg.label, vocab:seg.vocab ?? null, hint:seg.hint || "" })),
      channels: [{ id:"default", label:"Default", levels:[
        { key:"ad", label:"Ad", template:s.segments.map(seg => seg.key) },
      ]}],
      initiativeDimension: initSeg ? initSeg.key : null,
    };
  }
  return DEFAULT_NAMING_SCHEMA;
}

export const listChannels = (schema) => (schema.channels || []);
export const listLevels   = (schema, channelId) =>
  (listChannels(schema).find(c => c.id === channelId)?.levels) || [];

const dimensionMap = (schema) => {
  const m = new Map();
  (schema.dimensions || []).forEach(d => m.set(d.key, d));
  return m;
};

/** The ordered dimension definitions for one (channel, level). */
export function templateFor(schema, channelId, levelKey) {
  const level = listLevels(schema, channelId).find(l => l.key === levelKey);
  if (!level) return [];
  const dims = dimensionMap(schema);
  return level.template.map(k => dims.get(k) || { key:k, label:k, vocab:null, hint:"" });
}

/** The dimension carrying an initiative's trackingTag, or null. */
export function initiativeDimension(schema) {
  const key = schema.initiativeDimension;
  if (!key) return null;
  return dimensionMap(schema).get(key) || null;
}

/** True when this level's template includes the initiative dimension. */
export const levelCarriesInitiative = (schema, channelId, levelKey) =>
  templateFor(schema, channelId, levelKey).some(d => d.key === schema.initiativeDimension);

// -- Validation ----------------------------------------------------------------

// A value has to survive being pasted into an ad platform, exported to CSV, and
// read back positionally. That rules out the delimiter, whitespace (platforms
// silently trim and UTMs break), and commas.
const ILLEGAL = /[\s,]/;

/** Validate one value against its dimension. Returns null when valid. */
export function validateValue(dim, rawValue, delimiter) {
  const value = (rawValue == null ? "" : String(rawValue)).trim();
  if (!value) return `${dim.label} is empty — write "${NA}" instead. A blank slot shifts every slot after it and mis-attributes the row.`;
  if (value.includes(delimiter)) return `${dim.label} contains the delimiter "${delimiter}". Use CamelCase for multi-word values.`;
  if (ILLEGAL.test(value)) return `${dim.label} contains a space or comma, which breaks UTMs and CSV exports.`;
  if (dim.vocab) {
    const hit = dim.vocab.some(v => normKey(v) === normKey(value));
    if (!hit) return `${dim.label} "${value}" is not in the controlled list (${dim.vocab.slice(0, 6).join(", ")}${dim.vocab.length > 6 ? ", …" : ""}).`;
  }
  return null;
}

// -- Building ------------------------------------------------------------------

/**
 * Build one level's name from a `{dimensionKey: value}` map.
 *
 * Missing keys become the placeholder rather than throwing: the common caller is
 * an AI-generated variant that filled in most of the record, and a partial fill
 * should produce a valid, obviously-incomplete name the operator can correct
 * rather than an exception that loses the rest of the generation.
 */
export function buildName(values, schema, ctx) {
  const template = templateFor(schema, ctx.channel, ctx.level);
  if (template.length === 0) return { name:"", errors:[`No template defined for ${ctx.channel} / ${ctx.level}.`] };
  const ph = schema.placeholder || NA;
  const errors = [];
  const parts = template.map(dim => {
    const raw = values && values[dim.key];
    const value = (raw == null || String(raw).trim() === "") ? ph : String(raw).trim();
    if (normKey(value) !== normKey(ph)) {
      const err = validateValue(dim, value, schema.delimiter);
      if (err) errors.push(err);
    }
    return value;
  });
  return { name: parts.join(schema.delimiter), errors };
}

/**
 * Build every level of one channel from a single dimension record.
 *
 * This is the payoff of separating dimensions from templates: one creative
 * decision produces a campaign name, an ad set name and an ad name that are
 * guaranteed consistent with each other, because they are projections of the
 * same record rather than three strings typed on three different days.
 */
export function buildNameSet(values, schema, channelId) {
  return listLevels(schema, channelId).map(level => {
    const { name, errors } = buildName(values, schema, { channel: channelId, level: level.key });
    return { level: level.key, label: level.label, name, errors };
  });
}

// -- Parsing -------------------------------------------------------------------

/**
 * Parse a name against a known (channel, level).
 *
 * A slot-count mismatch is reported rather than guessed at. Any alignment we
 * picked would be a coin flip, and a wrong-but-plausible parse is worse than an
 * unparsed row because it enters the analysis silently while the unparsed one
 * gets counted and reported.
 */
export function parseName(name, schema, ctx) {
  const template = templateFor(schema, ctx.channel, ctx.level);
  const raw = (name == null ? "" : String(name)).trim();
  if (!raw) return { values:{}, errors:["Name is empty."], extra:[], ok:false };
  if (template.length === 0) return { values:{}, errors:[`No template defined for ${ctx.channel} / ${ctx.level}.`], extra:[], ok:false };

  const parts = raw.split(schema.delimiter);
  const n = template.length;
  const errors = [];
  const extra = parts.length > n ? parts.slice(n) : [];

  if (parts.length < n) {
    errors.push(`Expected ${n} slots for ${ctx.channel}/${ctx.level}, found ${parts.length}. Missing values must be written as "${schema.placeholder || NA}" rather than omitted — this name cannot be parsed positionally.`);
    return { values:{}, errors, extra:[], ok:false };
  }
  if (extra.length > 0) errors.push(`Expected ${n} slots, found ${parts.length}. The trailing ${extra.length} were not parsed.`);

  const ph = schema.placeholder || NA;
  const values = {};
  template.forEach((dim, i) => {
    values[dim.key] = parts[i];
    if (normKey(parts[i]) !== normKey(ph)) {
      const err = validateValue(dim, parts[i], schema.delimiter);
      if (err) errors.push(err);
    }
  });
  return { values, errors, extra, ok: errors.length === 0 };
}

/**
 * Identify which (channel, level) a name belongs to when the caller does not
 * know — the normal case for a performance export, whose rows carry names but
 * not the template that produced them.
 *
 * Returns every candidate that parses cleanly. Ambiguity is reported rather than
 * resolved by picking the first: two levels with the same slot count and
 * compatible vocabularies genuinely cannot be told apart from the string alone,
 * and silently choosing one is the mis-attribution this module exists to
 * prevent. Callers that know the level should pass it and use `parseName`.
 */
export function identifyName(name, schema) {
  const candidates = [];
  listChannels(schema).forEach(ch => {
    ch.levels.forEach(lv => {
      const res = parseName(name, schema, { channel: ch.id, level: lv.key });
      if (res.ok) candidates.push({ channel: ch.id, level: lv.key, values: res.values });
    });
  });
  return { candidates, ambiguous: candidates.length > 1, resolved: candidates.length === 1 ? candidates[0] : null };
}

// -- The Growth OS bridge ------------------------------------------------------

/**
 * The trackingTag a name claims, or null when it carries the placeholder, has no
 * initiative slot, or cannot be unambiguously identified.
 *
 * Deliberately does not resolve the initiative itself — this module knows about
 * names, not about the portfolio.
 */
export function trackingTagFromName(name, schema, ctx) {
  const key = schema.initiativeDimension;
  if (!key) return null;
  let values;
  if (ctx && ctx.channel && ctx.level) {
    const res = parseName(name, schema, ctx);
    values = res.ok ? res.values : null;
  } else {
    const { resolved } = identifyName(name, schema);
    values = resolved ? resolved.values : null;
  }
  if (!values) return null;
  const value = values[key];
  if (!value || normKey(value) === normKey(schema.placeholder || NA)) return null;
  return value;
}

/**
 * Resolve names against initiatives on trackingTag.
 *
 * `untagged` (placeholder in the initiative slot) is separated from `unmatched`
 * (a tag resolving to nothing) on purpose: the first is normal business-as-usual
 * spend, the second is a broken link worth surfacing. Matching is
 * case-insensitive so a tag typed `nh-001` still finds `NH-001`.
 */
export function matchNamesToInitiatives(names, items, schema, ctx) {
  const byTag = new Map();
  (items || []).forEach(it => { if (it && it.trackingTag) byTag.set(normKey(it.trackingTag), it); });

  const matched = [], unmatched = [], untagged = [];
  (names || []).forEach(name => {
    const tag = trackingTagFromName(name, schema, ctx);
    if (!tag) { untagged.push(name); return; }
    const initiative = byTag.get(normKey(tag));
    if (initiative) matched.push({ name, trackingTag: tag, initiative });
    else unmatched.push({ name, trackingTag: tag });
  });
  return { matched, unmatched, untagged };
}

/**
 * Derive a trackingTag for an initiative that doesn't have one.
 *
 * The substitute character is chosen against the schema rather than hardcoded:
 * replacing the delimiter with "-" is right for the default, but for a schema
 * whose delimiter IS "-" it is a no-op that would emit a tag containing the
 * delimiter — a value that silently corrupts every name built from it.
 */
export function suggestTrackingTag(item, schema) {
  const sch = schema || DEFAULT_NAMING_SCHEMA;
  const base = (item && (item.initId || item.id) || "").toString();
  const sub = sch.delimiter === "-" ? "" : "-";
  const cleaned = base.split(sch.delimiter).join(sub).replace(/[\s,]/g, "");
  return cleaned || null;
}

// -- Breakdowns ----------------------------------------------------------------

/**
 * Group rows by one dimension, summing their numeric metrics.
 *
 * Pure over already-parsed rows, so it works identically on CSV-imported
 * performance data today and API-sourced rows later — the same normalisation
 * discipline the weekly metrics path uses.
 *
 * `rows` are `{name, metrics:{}, channel?, level?}`. Grouping is
 * case-insensitive, which is what stops `PinkSprinkle` and `pinksprinkle` from
 * becoming two rows in the same pivot. Rows that cannot be parsed, and rows
 * whose template lacks the requested dimension, are counted rather than dropped:
 * a breakdown that quietly excludes a third of spend is worse than one that
 * says so.
 */
export function breakdownByDimension(rows, dimensionKey, schema, ctx) {
  const groups = new Map();
  let unparsed = 0, notInTemplate = 0;

  (rows || []).forEach(row => {
    const rowCtx = (row && row.channel && row.level) ? { channel: row.channel, level: row.level } : ctx;
    let values;
    if (rowCtx && rowCtx.channel && rowCtx.level) {
      const res = parseName(row && row.name, schema, rowCtx);
      values = res.ok ? res.values : null;
    } else {
      const { resolved } = identifyName(row && row.name, schema);
      values = resolved ? resolved.values : null;
    }

    if (!values) { unparsed++; return; }
    if (!(dimensionKey in values)) { notInTemplate++; return; }

    const display = values[dimensionKey];
    const key = normKey(display);
    const bucket = groups.get(key) || { value: display, rows: 0, metrics: {} };
    bucket.rows += 1;
    Object.entries((row && row.metrics) || {}).forEach(([k, v]) => {
      if (typeof v === "number" && !isNaN(v)) bucket.metrics[k] = (bucket.metrics[k] || 0) + v;
    });
    groups.set(key, bucket);
  });

  return { groups: Array.from(groups.values()).sort((a, b) => b.rows - a.rows), unparsed, notInTemplate };
}
