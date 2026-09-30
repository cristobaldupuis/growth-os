// -- What an ad needs besides a hook ------------------------------------------------
//
// Variants used to come back as a hook, three to five script lines and a CTA —
// enough to brief a video, and missing every field Ads Manager actually asks for.
// An operator shipping a Meta ad still had to write the primary text, the headline
// and the description by hand, which is to say the model wrote the part nobody
// reads first and left the part everybody reads to whoever had five minutes.
//
// COPY_SPECS names those fields per channel, with the length each placement shows
// before it truncates. The limits are display guidance, not platform validation —
// Meta accepts a 600-character primary text and shows 125 of it — so an overlong
// field is flagged, never cut. Cutting would publish a sentence nobody wrote.
//
// Beats replace the one-line script: time, what is seen, what is said, and what is
// written on screen, because most feeds play muted and on-screen text is the
// half of the script that carries the ad for them.

export const COPY_SPECS = {
  meta: [
    { key: "primaryText", label: "Primary text", limit: 125, hint: "The line above the creative. Feed shows about 125 characters before \"See more\"." },
    { key: "headline",    label: "Headline",     limit: 40,  hint: "Bold line under the creative. Short enough not to truncate on mobile." },
    { key: "description", label: "Description",  limit: 30,  hint: "Under the headline; hidden on many placements, so nothing essential." },
  ],
  tiktok: [
    { key: "adText", label: "Ad text", limit: 100, hint: "The caption. Written like a person posted it, not a brand." },
  ],
  google: [
    { key: "headline",    label: "Headline",    limit: 30, hint: "Responsive search headline." },
    { key: "description", label: "Description", limit: 90, hint: "Responsive search description." },
  ],
  youtube: [
    { key: "headline",    label: "Headline",    limit: 40, hint: "Shown beside or under the video." },
    { key: "description", label: "Description", limit: 90, hint: "Supporting line; often truncated." },
  ],
  klaviyo: [
    { key: "subject",     label: "Subject line", limit: 50, hint: "What decides the open. Most inboxes show about 50 characters." },
    { key: "previewText", label: "Preview text", limit: 90, hint: "The line after the subject; say what the subject did not." },
  ],
};

export const copySpecFor = (channel) => COPY_SPECS[channel] || COPY_SPECS.meta;

/** Fields over their display length: `[{key, label, length, limit}]`. */
export function copyFlags(copy, channel) {
  return copySpecFor(channel)
    .map(spec => ({ ...spec, length: String((copy || {})[spec.key] || "").length }))
    .filter(f => f.length > f.limit)
    .map(({ key, label, length, limit }) => ({ key, label, length, limit }));
}

export const ALT_HOOKS_MAX = 4;

const str = (v) => (v == null ? "" : String(v)).trim();

/**
 * A variant in the shape every reader expects, whatever the model returned and
 * whenever it was generated.
 *
 * `script` is DERIVED from the beats — the spoken lines only — because the
 * talking-head render and the voice audition read `script`, and reading stage
 * directions aloud ("close-up of the jar") was what the old one-line beats made
 * them do. A variant generated before beats existed keeps its `script` as it was.
 */
export function normalizeVariant(raw, channel) {
  const v = raw && typeof raw === "object" ? raw : {};
  const hook = str(v.hook);
  const beats = Array.isArray(v.beats)
    ? v.beats.map(b => ({ time: str(b && b.time), visual: str(b && b.visual), voiceover: str(b && b.voiceover), onScreen: str(b && b.onScreen) }))
        .filter(b => b.visual || b.voiceover || b.onScreen)
    : null;
  const seen = new Set([hook.toLowerCase()]);
  const altHooks = (Array.isArray(v.altHooks) ? v.altHooks : [])
    .map(str)
    .filter(h => h && !seen.has(h.toLowerCase()) && seen.add(h.toLowerCase()))
    .slice(0, ALT_HOOKS_MAX);
  const copy = {};
  copySpecFor(channel).forEach(spec => { copy[spec.key] = str(v.copy && v.copy[spec.key]); });

  return {
    ...v,
    hook,
    altHooks,
    ...(beats ? { beats, script: beats.map(b => b.voiceover).filter(Boolean) } : { script: Array.isArray(v.script) ? v.script.map(str).filter(Boolean) : [] }),
    // A variant from before copy fields existed has none, and gets none invented.
    copy: (v.copy || beats) ? copy : {},
    cta: str(v.cta),
    vocCited: Array.isArray(v.vocCited) ? v.vocCited.map(str).filter(Boolean) : [],
    naming: v.naming && typeof v.naming === "object" ? { ...v.naming } : {},
  };
}

/** Beats to show for any variant: its own, or its legacy script lines as beats. */
export function beatsOf(variant) {
  if (Array.isArray(variant?.beats) && variant.beats.length) return variant.beats;
  return (variant?.script || []).map(line => ({ time: "", visual: "", voiceover: line, onScreen: "" }));
}

/** The line a static ad leads with: the headline written for it, else the hook. */
export function staticHeadline(variant) {
  return str(variant?.copy?.headline) || str(variant?.hook);
}
