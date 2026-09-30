import { postProxy, parseStructured } from "./_shared.js";
import { creativeVariantsFormat, creativeCritiqueFormat, unwrap } from "./schemas.js";
import { EFFORT, buildRequest, modelFor } from "./models.js";
import { copySpecFor, normalizeVariant } from "../creativeCopy.js";
import { formatProductBlock } from "../products.js";
import { formatVoiceBlock, formatVocBlock } from "../voc.js";

// -- Creative variants ---------------------------------------------------------
//
// The second half of the creative loop: brief -> shootable variants, each one
// carrying the naming-convention segments that make it trackable the moment it
// goes live.
//
// ## The model proposes segments; it never writes the name
//
// This call returns a `naming` object of segment VALUES, not a finished ad name.
// The name is assembled afterwards by `buildName`, which validates each value
// against the schema's controlled vocabularies. That split is the whole point:
// a convention enforced by asking a model nicely holds until the one generation
// where it doesn't, and a single malformed name silently mis-attributes every
// row it produces downstream. Enforced in code, it cannot drift.
//
// For the same reason the model is never told the initiative's trackingTag and
// never asked for one. The caller stamps the initiative segment itself. The
// operator's own spec sheet says it plainly — "never invent one" — and an
// invented tag is worse than a missing one: it looks like a tracked experiment
// and joins to nothing.
//
// ## Effort, and why there is one call per angle
//
// This used to run at LOW effort on the argument that the judgement was already
// made in the brief and this was a transformation. It is not: this is the call
// that writes every word a customer reads — the hook, the on-screen text, the
// primary text. It runs at MEDIUM now.
//
// Medium effort with the fuller variant (beats, alternative hooks, ad copy) does
// not fit one 60-second proxy call for four angles, so the call is made once per
// angle, in parallel. That also makes a failure partial rather than total: an
// angle that errors is reported and the others still land.

/** One brief angle's variants. Throws on failure; the caller decides what a
 *  partial set means. */
async function variantsForAngle({ angle, brief, initiative, brand, schema, fillable, channel, perAngle, product, voc, modelOverride }) {
  const copySpec = copySpecFor(channel);

  const segmentSpec = fillable.map(d => {
    const allowed = d.vocab
      ? "one of: " + d.vocab.join(" | ")
      : "free text, CamelCase, no spaces, no \"" + schema.delimiter + "\"";
    return `  ${d.key} (${d.label}) — ${allowed}. ${d.hint || ""}`.trimEnd();
  }).join("\n");

  const copyLines = copySpec.map(c => `  ${c.key} (${c.label}) — at most ${c.limit} characters. ${c.hint}`).join("\n");

  const brandBlock = brand ? [
    "BRAND: " + (brand.name || "unnamed"),
    "  What they sell: " + (brand.whatTheySell || "not specified"),
    "  ICP: "           + (brand.icp          || "not specified"),
    "  Why they win: "  + (brand.whyTheyWin   || "not specified"),
  ].join("\n") : "BRAND: not specified";

  const sys = [
    "You are a performance creative producer turning ONE angle of an approved creative brief into shootable ad variants for " + channel + ".",
    "",
    "Produce exactly " + perAngle + " variant(s) for the angle you are given. Each variant is one asset someone could brief a creator on tomorrow.",
    "",
    "RULES:",
    "  • Variants for this angle must differ on ONE deliberate dimension (the hook, the presenter, the format, the proof shown) so the comparison between them is readable. State that dimension in `varies`.",
    "  • `hook` is the literal first line spoken or shown, written for the first second and a half. It names a specific situation, tension or result the viewer recognises. It does not open with the brand name, a greeting, or a question the viewer can answer \"no\".",
    "  • `altHooks` are 2-4 alternative opening lines for the same body, each a different kind of opening — a customer's own words from CUSTOMER VOICE, a specific fact the brand supports, a contrarian line, a visual pattern-break described in one sentence. Hooks are the cheapest thing to test, so these are what gets tested first.",
    "  • `beats` are 3-6 beats. Each gives `time` (e.g. \"0-2s\"), `visual` (what is on screen), `voiceover` (the exact words spoken, or \"\" for none) and `onScreen` (the text overlay, or \"\"). Assume the sound is off: the on-screen text alone must carry the message. For a static format, the beats describe the frame and `voiceover` is empty.",
    "  • `copy` holds the platform's ad text fields below. Write within each limit — a line that truncates loses its end.",
    "  • `cta` is the call-to-action text as the platform would show it.",
    "  • `vocCited` lists the ids of any customer snippets whose words this variant borrows; empty if none. Never present words as a customer's unless they are a snippet, verbatim.",
    "  • Do not invent product claims, ingredients, prices, certifications or results beyond the brand brief, the PRODUCT block and the brief's `proof`. Nothing in the brief's `claimsToVerify` may appear. If a variant needs an unsupported claim to work, drop the variant.",
    "  • Every line of copy follows the BRAND VOICE.",
    "  • Every variant must set `naming` using the slot definitions below. Use the controlled vocabulary exactly as written — these values are validated and a value outside the list will be rejected.",
    "  • Set the `angle` slot and `angleSlug` to \"" + angle.slug + "\".",
    "  • Where a slot genuinely does not apply, use \"" + (schema.placeholder || "NA") + "\". Never leave a slot empty.",
    "",
    "AD COPY FIELDS (" + channel + "):",
    copyLines,
    "",
    "AD NAME SLOTS you must fill (" + channel + ", ad level):",
    segmentSpec,
    "",
    formatVoiceBlock(brand?.voice),
    "",
    "Return ONLY a JSON array of variant objects, each with these keys exactly:",
    "  angleSlug, label (short human name), varies, hook, altHooks (array), beats (array of {time, visual, voiceover, onScreen}),",
    "  copy (object with exactly the ad copy field keys above), cta, rationale (one sentence — why this variant could win),",
    "  vocCited (array), naming (object — the slot keys listed above, and only those).",
    "No markdown, no preamble, just the JSON array. If a response schema is enforced, return the list under an 'items' key; otherwise return the bare array.",
  ].join("\n");

  const otherAngles = (brief.angles || []).filter(a => a.slug !== angle.slug).map(a => `${a.slug} (${a.theory})`);

  const user = [
    "CREATIVE BRIEF",
    "  Insight: " + (brief.insight || "not stated"),
    "  Promise: " + (brief.promise || "not stated"),
    "  Proof points: " + ((brief.proof || []).join("; ") || "none supplied"),
    "  Format guidance: " + (brief.formatGuidance || "not stated"),
    "  Would falsify: " + (brief.wouldFalsify || "not stated"),
    "  Claims to verify (must NOT appear): " + ((brief.claimsToVerify || []).join("; ") || "none"),
    "",
    "THIS ANGLE:",
    `  ${angle.slug} (${angle.label}): ${angle.theory}`,
    `  Execution: ${angle.execution}`,
    `  Opens: ${angle.openingBeat}`,
    otherAngles.length ? "OTHER ANGLES IN THIS ROUND (stay distinct from them): " + otherAngles.join(" | ") : "",
    "",
    brandBlock,
    "",
    formatProductBlock(product),
    "",
    "CUSTOMER VOICE (id | words):",
    formatVocBlock(voc),
    "",
    "INITIATIVE: " + (initiative.title || "untitled") + " — " + (initiative.hypothesis || "no hypothesis recorded"),
  ].filter(line => line !== null).join("\n");

  // Sized to what was asked for: each variant — hook, alternative hooks, beats,
  // copy fields, CTA, rationale, naming segments — runs to roughly 600-700 tokens
  // of JSON.
  const maxTokens = 600 + perAngle * 700;

  const data = await postProxy({
    group:"creative", fn:"callCreativeVariants",
    // Attributed to the initiative, so the cost of producing a round of creative
    // lands in the same place as the revenue the round is being judged on.
    initiativeId: initiative?.id || null,
    body:{ ...buildRequest({ model:modelFor("creative", modelOverride), maxTokens, system:sys, effort:EFFORT.MEDIUM, cacheSystem:true,
      format:creativeVariantsFormat(fillable.map(d => d.key), copySpec.map(c => c.key)) }),
      messages:[{ role:"user", content:user }] },
  });
  return unwrap(parseStructured(data, { label: `Variants for ${angle.label || angle.slug}` }))
    .map(v => normalizeVariant({ ...v, angleSlug: v.angleSlug || angle.slug }, channel));
}

/**
 * A full variant set: `{variants, failedAngles}`. One call per angle, in
 * parallel; an angle that fails is named in `failedAngles` rather than sinking
 * the angles that succeeded. Throws only when every angle failed.
 */
export async function produceVariantSet(brief, initiative, brand, schema, opts = {}, modelOverride) {
  const perAngle = opts.perAngle || 2;
  const channel  = opts.channel || "meta";

  // Creative lives at the ad level, so the model is asked for exactly the
  // dimensions that channel's ad template consumes — no more. The initiative
  // dimension is excluded entirely: the caller stamps it from the initiative's
  // own trackingTag. See the note above.
  const adLevel = (schema.channels || []).find(c => c.id === channel)?.levels
    ?.find(l => l.key === "ad" || l.key === "message");
  const dims = new Map((schema.dimensions || []).map(d => [d.key, d]));
  const fillable = (adLevel?.template || [])
    .filter(k => k !== schema.initiativeDimension)
    .map(k => dims.get(k))
    .filter(Boolean);

  const angles = (brief.angles || []).slice(0, 4);
  if (!angles.length) throw new Error("The brief has no angles to produce variants for.");

  const settled = await Promise.allSettled(angles.map(angle => variantsForAngle({
    angle, brief, initiative, brand, schema, fillable, channel, perAngle,
    product: opts.product || null, voc: opts.voc || null, modelOverride,
  })));

  const variants = [];
  const failedAngles = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") variants.push(...s.value);
    else failedAngles.push({ slug: angles[i].slug, label: angles[i].label, error: s.reason?.message || "Could not produce variants." });
  });
  if (!variants.length && failedAngles.length) throw new Error(failedAngles[0].error);
  return { variants, failedAngles };
}

/** The variants alone — the shape the bench and older callers read. */
export async function callCreativeVariants(brief, initiative, brand, schema, opts, modelOverride) {
  return (await produceVariantSet(brief, initiative, brand, schema, opts || {}, modelOverride)).variants;
}

// -- The review pass -------------------------------------------------------------
//
// A second, cheap read of the set against a stated rubric, before anything
// ships. It scores and it SUGGESTS — a rewritten hook, tighter copy — but never
// applies: the operator decides, because a model grading its own sibling's work
// is a second opinion, not a verdict. Suggestions are held to the same claim rule
// as the variants, so a "stronger" line cannot smuggle in something unsupported.

export const CRITIQUE_RUBRIC = [
  "Stops the scroll — the first line and frame are specific and earn the next second.",
  "One promise — the variant says the brief's one thing, not three.",
  "Native — reads like the platform (a feed post, not a TV spot) and works with the sound off.",
  "Distinct — differs from its siblings on the dimension it claims to vary, not in wording only.",
  "Claim-safe — nothing beyond the brand brief, product facts and the brief's proof; nothing from claimsToVerify.",
  "In voice — sounds like the brand voice, and uses none of its banned words.",
];

export async function callCritiqueVariants(brief, variants, brand, opts = {}, modelOverride) {
  const channel = opts.channel || "meta";
  const copySpec = copySpecFor(channel);
  const list = variants || [];
  if (!list.length) return {};

  const sys = [
    "You are a performance creative strategist reviewing ad variants for " + channel + " before they ship.",
    "",
    "Score every variant from 1 to 10 against this rubric:",
    ...CRITIQUE_RUBRIC.map((r, i) => `  ${i + 1}. ${r}`),
    "",
    "RULES:",
    "  • `issues` are short and specific — name the line and what is wrong with it. Empty when there is nothing worth fixing.",
    "  • `claimRisk` names any phrase that claims more than the brand brief, product facts or the brief's proof support, and why. Empty when there is none.",
    "  • Suggest a rewrite only where it clearly raises the score: `suggestedHook` and the `suggestedCopy` fields are empty to keep what is there.",
    "  • A suggestion keeps the variant's angle and the dimension it varies, stays within each copy field's limit, and never adds a claim the variant could not already make.",
    "  • Copy fields and limits: " + copySpec.map(c => `${c.key} ≤ ${c.limit}`).join(", ") + ".",
    "",
    formatVoiceBlock(brand?.voice),
    "",
    "Return ONLY a JSON array with one object per variant: {index, score, issues, claimRisk, suggestedHook, suggestedCopy}. If a response schema is enforced, return it under an 'items' key.",
  ].join("\n");

  const user = [
    "BRIEF — promise: " + (brief?.promise || "not stated"),
    "Proof: " + ((brief?.proof || []).join("; ") || "none"),
    "Claims to verify (must not appear): " + ((brief?.claimsToVerify || []).join("; ") || "none"),
    "",
    formatProductBlock(opts.product || null),
    "",
    "VARIANTS:",
    ...list.map((v, i) => JSON.stringify({
      index: i, angle: v.angleSlug, varies: v.varies, hook: v.hook, altHooks: v.altHooks,
      beats: v.beats, copy: v.copy, cta: v.cta,
    })),
  ].join("\n");

  const data = await postProxy({
    group:"creative", fn:"callCritiqueVariants",
    initiativeId: opts.initiativeId || null,
    body:{ ...buildRequest({ model:modelFor("creative", modelOverride), maxTokens: 400 + list.length * 260, system:sys, effort:EFFORT.LOW,
      format:creativeCritiqueFormat(copySpec.map(c => c.key)) }),
      messages:[{ role:"user", content:user }] },
  });

  const byIdx = {};
  unwrap(parseStructured(data, { label: "The review pass" })).forEach(item => {
    const i = Number(item?.index);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) return;
    const suggestedCopy = {};
    copySpec.forEach(c => { const s = String(item.suggestedCopy?.[c.key] || "").trim(); if (s) suggestedCopy[c.key] = s; });
    byIdx[i] = {
      score: Math.max(1, Math.min(10, Math.round(Number(item.score) || 0))) || null,
      issues: (item.issues || []).map(String).filter(Boolean),
      claimRisk: String(item.claimRisk || "").trim(),
      suggestedHook: String(item.suggestedHook || "").trim(),
      suggestedCopy,
    };
  });
  return byIdx;
}
