import { PROXY_URL, AI_HEADERS, safeParseJSON, proxyError } from "./_shared.js";
import { MODELS, EFFORT, buildRequest } from "./models.js";

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
// ## Tier
//
// STRUCTURED. Unlike the brief, the judgement here is already made — the angles,
// the insight and the execution direction all arrive fixed, and this call turns
// each angle into concrete scripted variants against a schema. That is a
// transformation, and the operator reviews every variant before it is used.

export async function callCreativeVariants(brief, initiative, brand, schema, opts) {
  const perAngle = (opts && opts.perAngle) || 2;
  const channel  = (opts && opts.channel) || "meta";

  // Creative lives at the ad level, so the model is asked for exactly the
  // dimensions that channel's ad template consumes — no more. Asking for the
  // full registry would have it invent values for slots this channel does not
  // name, which is work spent producing something the builder discards.
  //
  // The initiative dimension is excluded entirely: the caller stamps it from the
  // initiative's own trackingTag. See the note above.
  const adLevel = (schema.channels || []).find(c => c.id === channel)?.levels
    ?.find(l => l.key === "ad" || l.key === "message");
  const dims = new Map((schema.dimensions || []).map(d => [d.key, d]));
  const fillable = (adLevel?.template || [])
    .filter(k => k !== schema.initiativeDimension)
    .map(k => dims.get(k))
    .filter(Boolean);

  const segmentSpec = fillable.map(d => {
    const allowed = d.vocab
      ? "one of: " + d.vocab.join(" | ")
      : "free text, CamelCase, no spaces, no \"" + schema.delimiter + "\"";
    return `  ${d.key} (${d.label}) — ${allowed}. ${d.hint || ""}`.trimEnd();
  }).join("\n");

  const brandBlock = brand ? [
    "BRAND: " + (brand.name || "unnamed"),
    "  What they sell: " + (brand.whatTheySell || "not specified"),
    "  ICP: "           + (brand.icp          || "not specified"),
    "  Why they win: "  + (brand.whyTheyWin   || "not specified"),
  ].join("\n") : "BRAND: not specified";

  const sys = [
    "You are a creative producer turning an approved creative brief into shootable ad variants.",
    "",
    "Produce exactly " + perAngle + " variant(s) per angle in the brief. Each variant is one asset someone could brief a creator on tomorrow.",
    "",
    "RULES:",
    "  • Variants within one angle must differ on ONE deliberate dimension (the hook, the presenter, the format, the proof shown) so the comparison between them is readable. State that dimension in `varies`.",
    "  • `hook` is the literal first line spoken or shown. Write the words, not a description of them.",
    "  • `script` is a short beat-by-beat, 3-5 beats, each beat one line. For static formats describe the frames instead.",
    "  • Do not invent product claims, ingredients, prices, certifications or results beyond what the brand brief and the brief's `proof` support. If a variant needs an unsupported claim to work, drop the variant.",
    "  • Every variant must set `naming` using the slot definitions below. Use the controlled vocabulary exactly as written — these values are validated and a value outside the list will be rejected.",
    "  • Set the `angle` slot to the slug of the brief angle the variant belongs to.",
    "  • Where a slot genuinely does not apply, use \"" + (schema.placeholder || "NA") + "\". Never leave a slot empty.",
    "",
    "AD NAME SLOTS you must fill (" + channel + ", ad level):",
    segmentSpec,
    "",
    "Return ONLY a JSON array of variant objects, each with these keys exactly:",
    "  angleSlug (string — the brief angle this belongs to),",
    "  label (string, short human name for this variant),",
    "  varies (string — the one dimension this variant changes versus its sibling),",
    "  hook (string — the literal opening line/frame),",
    "  script (array of strings — 3-5 beats),",
    "  cta (string),",
    "  rationale (string, one sentence — why this variant could win),",
    "  naming (object — the segment keys listed above, and only those).",
    "No markdown, no preamble, just the JSON array.",
  ].join("\n");

  const anglesBlock = (brief.angles || []).map(a =>
    `  - ${a.slug} (${a.label}): ${a.theory} | Execution: ${a.execution} | Opens: ${a.openingBeat}`
  ).join("\n") || "  (no angles in brief)";

  const user = [
    "CREATIVE BRIEF",
    "  Insight: " + (brief.insight || "not stated"),
    "  Promise: " + (brief.promise || "not stated"),
    "  Proof points: " + ((brief.proof || []).join("; ") || "none supplied"),
    "  Format guidance: " + (brief.formatGuidance || "not stated"),
    "",
    "ANGLES:",
    anglesBlock,
    "",
    brandBlock,
    "",
    "INITIATIVE: " + (initiative.title || "untitled") + " — " + (initiative.hypothesis || "no hypothesis recorded"),
  ].join("\n");

  const resp = await fetch(PROXY_URL, {
    method:"POST", headers:AI_HEADERS(),
    body:JSON.stringify({ ...buildRequest({ model:MODELS.STRUCTURED, maxTokens:3400, system:sys, effort:EFFORT.LOW }),
      messages:[{ role:"user", content:user }] }),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "The AI service returned an error.");
  const raw = data.content && data.content[0] ? data.content[0].text.trim() : "[]";
  const parsed = safeParseJSON(raw, true);
  if (!Array.isArray(parsed)) throw new Error("Creative variants returned a malformed response.");
  return parsed;
}
