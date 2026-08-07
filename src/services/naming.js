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

// -- Families ------------------------------------------------------------------
//
// A flat registry of twenty-four dimensions is a list, not a taxonomy. It reads
// fine in code, because a reader arrives with a question ("what does `lane`
// mean") and scans to it. It reads badly on a page, because a reader arrives
// without one, and twenty-four rows of equal weight give them nowhere to start.
//
// The families answer "what kind of question does this dimension settle", which
// is the axis an operator already thinks along: where it runs, what it is for,
// who it targets, what it says, what it sells — and then the one dimension that
// is not a description of the ad at all, but a pointer back into the portfolio.
// That last family has exactly one member on purpose. The bridge is structurally
// unlike everything around it, and filing it among the descriptive dimensions
// would hide the single most important fact about the convention.
//
// Kept as a side map rather than a `family` field on each dimension, for a
// reason that matters: `resolveSchema` returns a stored custom schema verbatim,
// and a schema saved before this existed carries no family fields at all. A
// lookup keyed on dimension key groups those correctly too, and anything it does
// not recognise lands in "Other" rather than vanishing.
//
// Families are presentation and nothing else. Slot order and position come from
// the templates alone, so regrouping the taxonomy can never change what a name
// means.

export const DIMENSION_FAMILIES = [
  { key:"placement", label:"Where it runs",  hint:"Platform, surface and market — the coordinates of the buy." },
  { key:"intent",    label:"What it is for", hint:"Funnel stage, optimisation event, commercial offer. Why the money is being spent." },
  { key:"audience",  label:"Who it targets", hint:"Targeting dimensions. Present on the platforms that let you set them, NA on the ones that don't." },
  { key:"creative",  label:"What it says",   hint:"The creative itself: concept, execution, and the hook under test." },
  { key:"product",   label:"What it sells",  hint:"Product line, variant, and the launch bucket it belongs to." },
  { key:"bridge",    label:"Attribution",    hint:"The slot carrying an initiative's tracking tag. This is what joins spend back to a hypothesis." },
  { key:"other",     label:"Other",          hint:"Dimensions with no declared group — a custom variable that hasn't been filed under one, or a hand-edited schema." },
];

const FAMILY_OF = {
  channel:"placement", handle:"placement", geo:"placement", placement:"placement",
  funnel:"intent", objective:"intent", bidding:"intent", offer:"intent", cta:"intent",
  audience:"audience", age:"audience", gender:"audience",
  asset:"creative", theme:"creative", angle:"creative", concept:"creative",
  cut:"creative", talent:"creative", format:"creative", lane:"creative",
  campaign:"product", category:"product", flavor:"product",
  initiative:"bridge",
};

/**
 * The family a dimension belongs to. The schema's own `family` field wins when
 * one is present, so a custom schema can declare its own grouping; otherwise the
 * key is looked up, and an unrecognised dimension is "other" rather than dropped.
 */
export const familyOf = (dim, schema) =>
  (dim && dim.family) ||
  (schema && schema.initiativeDimension && dim && dim.key === schema.initiativeDimension ? "bridge" : null) ||
  FAMILY_OF[dim && dim.key] ||
  "other";

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
 *
 * `settings.namingCustom` is merged in last, so an operator's own variables are
 * part of every schema this app reads. That placement is the point: the builder,
 * the parser, the breakdown pivots and the AI slot prompts all resolve the
 * schema through here, so a variable added on the Taxonomy page appears in all
 * four without any of them knowing custom variables exist.
 */
export function resolveSchema(settings) {
  return applyCustomVariables(baseSchema(settings), settings && settings.namingCustom);
}

function baseSchema(settings) {
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

// -- Custom variables ----------------------------------------------------------
//
// The registry above is the vocabulary this tool ships with, and it is
// deliberately opinionated: a controlled list is only worth something if
// somebody decided what belongs on it. But no fixed list survives contact with a
// second company. An agency running three clients has a `client` dimension; a
// retailer has `store_format`; a brand launching in a new market next quarter
// needs a `region` that nobody anticipated when this file was written. The
// choice is not between a curated registry and an open one — it is between
// letting operators extend the registry inside the tool, or watching them encode
// the missing dimension inside the `angle` free-text slot, where it cannot be
// validated, cannot be pivoted, and cannot be found again.
//
// So custom variables are an *overlay*, stored beside the schema rather than
// baked into it:
//
//   { dimensions:[…], vocabAdditions:{ theme:["Sustainability"] } }
//
// Kept separate for the same reason `FAMILY_OF` is a side map: the shipped
// registry keeps improving, and a workspace that saved a full schema copy in
// March should still pick up a dimension hint rewritten in June. Merging at
// resolve time means the operator's additions and our corrections both land,
// and neither needs a migration.
//
// ## Two kinds of addition, and why one of them is dangerous
//
//   A new value on an existing controlled dimension is free. Vocabularies are
//   validated as membership tests; a longer list accepts more names and changes
//   nothing about names already built.
//
//   A new dimension placed into a template is not free. It appends a slot, and
//   every name built before it carries one fewer — so those names stop parsing.
//   That is why placement is opt-in per (channel, level), why the editor states
//   the consequence before saving, and above all why a custom dimension is
//   appended to the END of a template and can never be inserted mid-string.
//   Appending makes an old name fail the slot-count check, which is loud, gets
//   counted, and gets reported. Inserting would leave the count right and every
//   value after the insertion point shifted one dimension to the left — a name
//   that parses cleanly into wrong answers. The first is an outage; the second
//   is a quiet corruption of the analysis, which is the failure mode this whole
//   module is built to refuse.

/** Custom dimension keys are identifiers, not values: they never appear in a name. */
export const CUSTOM_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** A legal dimension key derived from a human label. */
export function dimensionKeyFrom(label) {
  const slug = String(label == null ? "" : label)
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!slug) return "";
  return CUSTOM_KEY_PATTERN.test(slug) ? slug : "v_" + slug;
}

/** The empty overlay. Also the shape a settings record starts life with. */
export const emptyCustomVariables = () => ({ dimensions: [], vocabAdditions: {} });

const uniqueValues = (list) => {
  const seen = new Set(), out = [];
  (list || []).forEach(raw => {
    const v = String(raw == null ? "" : raw).trim();
    if (!v || seen.has(normKey(v))) return;
    seen.add(normKey(v));
    out.push(v);
  });
  return out;
};

const normalisePlacements = (list) => {
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(p => {
    const channel = String((p && p.channel) || "").trim();
    const level   = String((p && p.level)   || "").trim();
    if (!channel || !level) return;
    const k = channel + "/" + level;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ channel, level });
  });
  return out;
};

/**
 * A stored custom dimension, cleaned into registry shape — or null when it is
 * too malformed to trust.
 *
 * Defensive because this data arrives from a browser store and from restored
 * backup files, neither of which this module controls. A dimension with an
 * illegal key is dropped rather than repaired: a key is what templates and
 * parsed rows join on, so guessing at one would silently re-point historical
 * data at a dimension the operator never defined.
 */
function normaliseCustomDimension(raw) {
  if (!raw) return null;
  const key = String(raw.key || "").trim().toLowerCase();
  if (!CUSTOM_KEY_PATTERN.test(key)) return null;
  const vocab = Array.isArray(raw.vocab) && raw.vocab.length > 0 ? uniqueValues(raw.vocab) : null;
  return {
    key,
    label: String(raw.label || key).trim() || key,
    vocab: vocab && vocab.length > 0 ? vocab : null,
    hint: String(raw.hint || ""),
    family: DIMENSION_FAMILIES.some(f => f.key === raw.family) ? raw.family : "other",
    custom: true,
    placements: normalisePlacements(raw.placements),
  };
}

/** True when this custom dimension is placed at (channel, level). */
export const placedAt = (dim, channelId, levelKey) =>
  (dim && dim.placements || []).some(p => p.channel === channelId && p.level === levelKey);

// One-entry memo. `resolveSchema` is called from render bodies, and several
// views hang `useMemo` on the schema it returns — a fresh object every render
// would invalidate a rollup over thousands of performance rows on every
// keystroke. Both inputs are stable between saves (the settings object only
// changes identity when it is written), so one entry serves every caller.
let overlayMemo = { base: null, custom: null, out: null };

/**
 * Merge a custom-variable overlay into a base schema.
 *
 * Returns the base object itself when there is nothing to merge, so callers can
 * keep comparing schema identity.
 */
export function applyCustomVariables(base, custom) {
  if (!base || !custom) return base;
  if (overlayMemo.base === base && overlayMemo.custom === custom) return overlayMemo.out;

  const extras    = (Array.isArray(custom.dimensions) ? custom.dimensions : []).map(normaliseCustomDimension).filter(Boolean);
  const additions = (custom.vocabAdditions && typeof custom.vocabAdditions === "object") ? custom.vocabAdditions : {};

  if (extras.length === 0 && Object.keys(additions).length === 0) {
    overlayMemo = { base, custom, out: base };
    return base;
  }

  // Extra values first. `vocabAdded` is carried through so the taxonomy page can
  // show which values came from the operator and offer to take them back out —
  // the shipped list is not theirs to remove.
  const dimensions = (base.dimensions || []).map(d => {
    const extra = uniqueValues(additions[d.key]);
    if (!d.vocab || extra.length === 0) return d;
    const known = new Set(d.vocab.map(normKey));
    const added = extra.filter(v => !known.has(normKey(v)));
    return added.length === 0 ? d : { ...d, vocab: [...d.vocab, ...added], vocabAdded: added };
  });

  // A custom key colliding with a shipped one is dropped rather than allowed to
  // shadow it. The editor rejects the collision; this guards a hand-edited or
  // restored overlay, where losing the addition beats redefining `geo`.
  const known = new Set(dimensions.map(d => d.key));
  const fresh = [];
  extras.forEach(d => {
    if (known.has(d.key)) return;
    known.add(d.key);
    fresh.push(d);
    dimensions.push(d);
  });

  const channels = (base.channels || []).map(ch => ({
    ...ch,
    levels: (ch.levels || []).map(lv => {
      const template = lv.template || [];
      const append = fresh
        .filter(d => placedAt(d, ch.id, lv.key) && !template.includes(d.key))
        .map(d => d.key);
      return append.length === 0 ? lv : { ...lv, template: [...template, ...append] };
    }),
  }));

  const out = { ...base, dimensions, channels };
  overlayMemo = { base, custom, out };
  return out;
}

// -- Editing the overlay -------------------------------------------------------
//
// Pure functions returning a new overlay, so the caller's only job is to persist
// what comes back. Nothing here mutates, and nothing here validates — validation
// is `validateCustomDimension`, which the editor runs while the operator types.

/** Add a custom dimension, or replace one. `originalKey` allows renaming a key. */
export function upsertCustomDimension(custom, dimension, originalKey) {
  const next = normaliseCustomDimension(dimension);
  if (!next) return custom || emptyCustomVariables();
  const base = { ...emptyCustomVariables(), ...(custom || {}) };
  const list = Array.isArray(base.dimensions) ? base.dimensions : [];
  const target = originalKey || next.key;
  const idx = list.findIndex(d => d && d.key === target);
  return { ...base, dimensions: idx >= 0 ? list.map((d, i) => i === idx ? next : d) : [...list, next] };
}

/** Remove a custom dimension. Shipped dimensions are not removable by design. */
export function removeCustomDimension(custom, key) {
  const base = { ...emptyCustomVariables(), ...(custom || {}) };
  return { ...base, dimensions: (base.dimensions || []).filter(d => d && d.key !== key) };
}

/** Append one value to an existing dimension's controlled vocabulary. */
export function addVocabValue(custom, dimensionKey, value) {
  const v = String(value == null ? "" : value).trim();
  const base = { ...emptyCustomVariables(), ...(custom || {}) };
  if (!v || !dimensionKey) return base;
  const additions = { ...(base.vocabAdditions || {}) };
  const list = Array.isArray(additions[dimensionKey]) ? additions[dimensionKey] : [];
  if (list.some(x => normKey(x) === normKey(v))) return base;
  additions[dimensionKey] = [...list, v];
  return { ...base, vocabAdditions: additions };
}

/** Take an operator-added value back out. Never touches the shipped list. */
export function removeVocabValue(custom, dimensionKey, value) {
  const base = { ...emptyCustomVariables(), ...(custom || {}) };
  const additions = { ...(base.vocabAdditions || {}) };
  const list = (additions[dimensionKey] || []).filter(x => normKey(x) !== normKey(value));
  if (list.length > 0) additions[dimensionKey] = list;
  else delete additions[dimensionKey];
  return { ...base, vocabAdditions: additions };
}

// -- Validating an edit --------------------------------------------------------

/**
 * Check one vocabulary value against the rules a *name* has to satisfy.
 *
 * The same constraints `validateValue` enforces when building, applied one step
 * earlier: a value carrying a space or the delimiter is not a value that can be
 * rejected later politely, because by then it is inside a name in an ad account.
 */
export function validateVocabValue(value, schema, existing) {
  const v = String(value == null ? "" : value).trim();
  if (!v) return "Write the value first.";
  const delimiter = (schema && schema.delimiter) || "_";
  if (v.includes(delimiter)) return `A value cannot contain the delimiter "${delimiter}" — it would split into two slots. Use CamelCase.`;
  if (ILLEGAL.test(v)) return "A value cannot contain a space or a comma — both break UTMs and CSV exports.";
  if ((existing || []).some(x => normKey(x) === normKey(v))) return `"${v}" is already on the list. Values are matched case-insensitively.`;
  return null;
}

/**
 * Validate a dimension draft against the schema it is about to join.
 *
 * Returns `{ ok, errors:{field:message} }` rather than throwing or returning a
 * flat list, because the editor shows each message under the control that
 * caused it — a validation summary at the bottom of a form is a message the
 * reader has to map back onto a field themselves.
 */
export function validateCustomDimension(draft, schema, options) {
  const errors = {};
  const d = draft || {};
  const originalKey = (options && options.originalKey) || null;

  if (!String(d.label || "").trim()) errors.label = "Every variable needs a name — this is what the builder labels the field.";

  const key = String(d.key || "").trim().toLowerCase();
  if (!key) errors.key = "A key is required. It is the identifier templates and imports join on.";
  else if (!CUSTOM_KEY_PATTERN.test(key)) errors.key = "Lowercase letters, digits and underscores only, starting with a letter (sales_region).";
  else if (key !== originalKey && (schema.dimensions || []).some(x => x.key === key)) {
    const clash = (schema.dimensions || []).find(x => x.key === key);
    errors.key = `"${key}" is already the key for ${clash.label}. Pick another — two dimensions sharing a key cannot be told apart in a pivot.`;
  }

  if (d.controlled) {
    const vocab = (d.vocab || []).map(v => String(v).trim()).filter(Boolean);
    if (vocab.length === 0) errors.vocab = "A controlled variable needs at least one allowed value. Switch it to free text if the answers are genuinely open-ended.";
    else {
      for (let i = 0; i < vocab.length; i++) {
        const err = validateVocabValue(vocab[i], schema, vocab.slice(0, i));
        if (err) { errors.vocab = err; break; }
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
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

// -- Taxonomy ------------------------------------------------------------------
//
// Everything above describes how a name is assembled. These describe what the
// vocabulary *is*, which is a different question and the one a new operator (or
// a client being handed the convention) asks first. Both are derived from the
// same registry and templates, so the taxonomy can never drift from the thing it
// documents — there is no second copy to keep in sync.

/**
 * Every place a dimension appears, as `{channel, channelLabel, level, levelLabel,
 * slot, of}`. `slot` is 1-based because it is read by humans counting segments in
 * a name, not by code indexing an array.
 *
 * This is the fact that makes the registry legible: `geo` reading "Meta campaign
 * slot 4, Meta ad set slot 1, Google campaign slot 4" tells an operator both that
 * the dimension is load-bearing and that it sits at different depths per level —
 * which is precisely the thing a single flat template could not express.
 */
export function dimensionUsage(schema, dimensionKey) {
  const out = [];
  listChannels(schema).forEach(ch => {
    (ch.levels || []).forEach(lv => {
      const i = (lv.template || []).indexOf(dimensionKey);
      if (i >= 0) out.push({
        channel: ch.id, channelLabel: ch.label,
        level: lv.key, levelLabel: lv.label,
        slot: i + 1, of: lv.template.length,
      });
    });
  });
  return out;
}

/**
 * The registry grouped into families, each dimension carrying its usage.
 *
 * Families with no members are dropped rather than rendered empty: a schema that
 * declares no audience dimensions should not show an "Who it targets" heading
 * over blank space, which reads as a bug rather than as an absence.
 */
export function taxonomy(schema) {
  const dims = (schema.dimensions || []).map(d => ({
    ...d,
    family: familyOf(d, schema),
    usage: dimensionUsage(schema, d.key),
    isBridge: d.key === schema.initiativeDimension,
  }));
  return DIMENSION_FAMILIES
    .map(f => ({ ...f, dimensions: dims.filter(d => d.family === f.key) }))
    .filter(f => f.dimensions.length > 0);
}

/**
 * Every dimension one channel touches, in first-appearance order across its
 * levels, each annotated with the levels that use it.
 *
 * This is the builder's field list. Editing per level would make an operator
 * type `geo` twice for Meta — once for the campaign, once for the ad set — and
 * the second one is not a second decision, it is the same decision restated with
 * a chance to contradict itself. One record, projected into every level, is the
 * property the whole module is built on; the builder just has to honour it.
 */
export function channelDimensions(schema, channelId) {
  const dims = dimensionMap(schema);
  const order = [];
  const seen = new Map();
  listLevels(schema, channelId).forEach(lv => {
    (lv.template || []).forEach(k => {
      if (!seen.has(k)) {
        const entry = { ...(dims.get(k) || { key:k, label:k, vocab:null, hint:"" }), levels: [] };
        entry.family = familyOf(entry, schema);
        entry.isBridge = k === schema.initiativeDimension;
        seen.set(k, entry);
        order.push(entry);
      }
      seen.get(k).levels.push({ key: lv.key, label: lv.label });
    });
  });
  return order;
}

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
//
// There are two bridges, and they exist for different situations.
//
//   The tag slot  — a name built here carries the initiative's trackingTag in a
//                   slot, so attribution is a property of the string itself.
//                   Scales: name a hundred ads, all hundred attribute, and the
//                   join keeps working in exports nobody has seen yet.
//
//   Assigned names — a specific campaign, ad set or ad name, recorded on the
//                   initiative by hand. Attribution is a property of the
//                   *portfolio*, not the string.
//
// The second exists because most spend an operator wants to measure was named
// before this tool was in the room. A campaign that has been running in Ads
// Manager for six weeks cannot be renamed without resetting its learning phase,
// and telling someone "rename your account and we will measure it" is telling
// them no. Registering the name they already have costs one paste and joins the
// same rows.
//
// Assigned names win over the tag slot where both apply, because one of them is
// a person pointing at a specific string and saying "this one is mine", and the
// other is a convention that could have been followed by mistake. When a human
// decision and an inferred one disagree, the human decision is the answer.
//
// Assignment matches at ANY level the export carries: register a campaign name
// and every ad row underneath it attributes, because platform exports repeat the
// campaign name on every child row. That is the behaviour the operator expects
// from "this campaign belongs to this test", and it is why the row shape keeps
// `campaignName` and `adsetName` alongside its own identity.

/** One assigned-name record, normalised. Accepts a bare string for robustness. */
export const adNameEntry = (raw) => {
  if (!raw) return null;
  if (typeof raw === "string") {
    const name = raw.trim();
    return name ? { name, level: "", channel: "", addedAt: "" } : null;
  }
  const name = String(raw.name || "").trim();
  if (!name) return null;
  return {
    name,
    level: raw.level || "",
    channel: raw.channel || "",
    addedAt: raw.addedAt || "",
  };
};

/** An initiative's assigned names, deduplicated case-insensitively. */
export function adNamesOf(item) {
  const out = [], seen = new Set();
  ((item && item.adNames) || []).forEach(raw => {
    const e = adNameEntry(raw);
    if (!e || seen.has(normKey(e.name))) return;
    seen.add(normKey(e.name));
    out.push(e);
  });
  return out;
}

/**
 * `normKey(name)` → `{initiative, entry}` across the whole portfolio.
 *
 * First registration wins a collision. Two initiatives claiming one ad name is a
 * genuine conflict — the same spend cannot belong to two experiments — and the
 * resolution is stable rather than clever, so the same import always attributes
 * the same way. `assignedNameConflicts` surfaces the collisions for the UI to
 * report; this function's job is to be deterministic, not to arbitrate.
 */
export function assignedNameIndex(items) {
  const index = new Map();
  (items || []).forEach(it => {
    adNamesOf(it).forEach(entry => {
      const k = normKey(entry.name);
      if (!index.has(k)) index.set(k, { initiative: it, entry });
    });
  });
  return index;
}

/** Names claimed by more than one initiative: `{name, initiatives:[…]}`. */
export function assignedNameConflicts(items) {
  const byName = new Map();
  (items || []).forEach(it => {
    adNamesOf(it).forEach(entry => {
      const k = normKey(entry.name);
      if (!byName.has(k)) byName.set(k, { name: entry.name, initiatives: [] });
      byName.get(k).initiatives.push(it);
    });
  });
  return [...byName.values()].filter(c => c.initiatives.length > 1);
}

/**
 * The first of a row's candidate names that is assigned to an initiative.
 *
 * Order is finest grain first: an ad registered to initiative A inside a campaign
 * registered to initiative B belongs to A. The specific claim beats the general
 * one, which is the same rule a stylesheet uses and the one an operator means.
 */
export function lookupAssignedName(candidateNames, index) {
  for (const name of candidateNames || []) {
    if (!name) continue;
    const hit = index.get(normKey(name));
    if (hit) return { ...hit, matchedName: name };
  }
  return null;
}

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
