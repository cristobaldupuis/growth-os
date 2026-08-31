// api/voice.js — ElevenLabs text-to-speech proxy.
//
// The fourth provider endpoint, and a separate function for the same reason
// api/image.js is separate from api/proxy.js: the contracts do not overlap. A
// text request is validated on `model`/`max_tokens`/`messages`, an image request
// on prompt and aspect, and a speech request on a script and a voice id. Folding
// any two together means loosening whichever validator loses the argument, and
// the validators ARE the security control on these endpoints.
//
// ## Why voice is its own step rather than a parameter on the video render
//
// It already was a parameter — `voiceId` goes over the wire to api/video.js and
// the provider's own TTS runs inside the render job. That works, and it stays
// working; nothing here changes it. What it cannot do is let anyone HEAR a
// script without buying a video.
//
// Speech is not free — per character it lands around 8 cents for a 28-second
// read at the quality model, which is the same order as a short standard render,
// not fractions of a cent. Measured against the SAME script, though, the gap is
// the whole argument: that read costs $0.08 to audition and $0.48 to render on
// HeyGen, or $4.20 on Fabric. So an operator who auditions before committing
// buys the wrong read at a sixth of the price, or a fifty-fifth of it if the
// clip was headed for premium. Halving again on the Flash model is available
// when the question is "which of these six hooks", not "is this the take".
//
// This endpoint exists to make that iteration affordable, and it is deliberately
// shipped BEFORE anything that consumes its audio, because the audition is where
// the value is even if no video is ever rendered from it.
//
// ## Why ElevenLabs specifically
//
// Their Avatars product would also render the talking head, but as of this
// writing it is ElevenCreative-only with no public API, so it is not reachable
// from a serverless function. The TTS API is mature and public. Building the
// voice layer on it now means that when the Avatars API does ship, the swap is a
// new adapter in api/video.js against voice identities that already exist here —
// not a re-architecture.
//
// ## What this endpoint deliberately does not do
//
// It does not persist anything. The base64 audio goes straight back to the
// browser, exactly as api/image.js returns a frame — an audition is a thing you
// listen to and discard, and the localStorage quota reasoning in DECISIONS.md
// applies to an MP3 as much as to a PNG. If a take is worth keeping it should
// go through api/asset.js into the bucket, which is a later change and a
// deliberate one.

import { guardEntry, guardRateLimit, clientIp } from "./_guard.js";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

// Models this app calls. Restricted to the three stable production models rather
// than every id the API accepts: an allowlist here is what stops a forged request
// naming an expensive or unreleased model, the same control ALLOWED_IMAGE_MODELS
// applies on the image path.
export const ALLOWED_VOICE_MODELS = new Set([
  "eleven_multilingual_v2",
  "eleven_turbo_v2_5",
  "eleven_flash_v2_5",
]);

// A script long enough to matter is a few hundred characters; an ad read is
// rarely over a thousand, and 2000 is about 2.5 minutes of speech. This is a
// spend bound, not a quality one — billing is per character, so the cap IS the
// per-request ceiling: at the quality model's rate, 2000 characters is roughly
// 44 cents, and that is the most any single call can cost.
export const MAX_SCRIPT_CHARS = 2000;

// Voice ids are opaque strings from the caller's own ElevenLabs library, so they
// cannot be allowlisted. They are bounded on shape instead: the id goes into the
// request PATH, so anything outside this class could reshape the URL.
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{16,32}$/;

// mp3_44100_128 is the default and the right one here: an audition is listened to
// in a browser, not mastered. The others are offered because a later change that
// feeds this audio to a lip-sync model may need a specific rate.
export const ALLOWED_OUTPUT_FORMATS = new Set([
  "mp3_44100_128",
  "mp3_22050_32",
  "pcm_16000",
  "pcm_24000",
]);

// A script is text. 64KB is generous for 5000 characters and refuses anything
// that is trying to be a file upload.
const MAX_BODY_BYTES = 64 * 1024;

// Above the image ceiling of 25 because iterating is the point, but nowhere near
// unbounded: per-character billing means the worst case is the character cap, not
// a typical script. At 40 requests of 2000 characters this bounds an IP at about
// $18 an hour, against roughly $3 for 40 auditions of a real 350-character ad
// read. A stolen request cannot be reshaped into a batch job, and a script that
// is all cap cannot be run forty times a minute.
const RATE_LIMIT_MAX = 40;

/**
 * Validate a speech request. Returns an error string, or null when the body is
 * acceptable.
 *
 * Exported so src/services/ai/voice.test.js can assert the client's request
 * against the REAL validator rather than a copy of it — the same discipline
 * image.test.js already follows, and the reason the two have not drifted.
 */
export function validateVoiceBody(body) {
  if (!body || typeof body !== "object") return "Request body must be an object.";

  if (typeof body.text !== "string" || !body.text.trim()) return "text is required.";
  if (body.text.length > MAX_SCRIPT_CHARS) return `text exceeds the ${MAX_SCRIPT_CHARS} character ceiling.`;

  if (typeof body.voiceId !== "string" || !VOICE_ID_PATTERN.test(body.voiceId)) {
    return "voiceId must be an ElevenLabs voice id.";
  }

  if (!ALLOWED_VOICE_MODELS.has(body.model)) return `"${body.model}" is not an allowed speech model.`;

  if (body.outputFormat !== undefined && !ALLOWED_OUTPUT_FORMATS.has(body.outputFormat)) {
    return `"${body.outputFormat}" is not an allowed output format.`;
  }

  // Voice settings are bounded rather than passed through. Every one of these is
  // a 0-1 float upstream, and an out-of-range value is a 422 from ElevenLabs
  // that would reach the operator as an opaque provider error.
  const s = body.voiceSettings;
  if (s !== undefined) {
    if (typeof s !== "object" || s === null) return "voiceSettings must be an object.";
    for (const k of ["stability", "similarityBoost", "style"]) {
      if (s[k] === undefined) continue;
      if (typeof s[k] !== "number" || s[k] < 0 || s[k] > 1) return `voiceSettings.${k} must be between 0 and 1.`;
    }
  }

  return null;
}

/** Map this app's request onto ElevenLabs' body shape. */
export function buildSpeechBody({ text, model, voiceSettings }) {
  const body = { text, model_id: model };
  if (voiceSettings) {
    body.voice_settings = {
      ...(voiceSettings.stability       !== undefined ? { stability: voiceSettings.stability } : {}),
      ...(voiceSettings.similarityBoost !== undefined ? { similarity_boost: voiceSettings.similarityBoost } : {}),
      ...(voiceSettings.style           !== undefined ? { style: voiceSettings.style } : {}),
    };
  }
  return body;
}

/**
 * Reduce ElevenLabs' voice library to what a picker needs.
 *
 * The full response carries preview URLs, sharing metadata, fine-tuning state and
 * per-voice sample lists — several KB per voice for a dropdown that needs a name
 * and an id. Trimmed here rather than in the browser so the payload is small on
 * the wire, not just small on screen.
 */
export function trimVoices(data) {
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  return voices.map((v) => ({
    voiceId:  v.voice_id,
    name:     v.name || "(unnamed)",
    category: v.category || "",
    // The single most useful label in a picker full of invented first names.
    accent:   v.labels?.accent || "",
    gender:   v.labels?.gender || "",
    preview:  v.preview_url || "",
  }));
}

const apiKey = () => process.env.ELEVENLABS_API_KEY || "";

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;

  // Own key namespace, like image and video. Auditions are meant to be frequent,
  // and a limit shared with the text proxy would mean a session spent listening
  // to reads locks the operator out of generating the next brief.
  if (await guardRateLimit(req, res, {
    key: `gos:voice:${clientIp(req)}`,
    max: RATE_LIMIT_MAX,
    limitMessage: "Voice generation limit reached. Try again later.",
    label: "Voice",
  })) return;

  if (!apiKey()) {
    return res.status(500).json({ error: "ELEVENLABS_API_KEY is not configured." });
  }

  const action = req.body?.action;
  if (action === "voices") return handleVoices(req, res);
  if (action === "speak")  return handleSpeak(req, res);
  return res.status(400).json({ error: 'action must be "speak" or "voices".' });
}

/** The caller's voice library, for the picker. */
async function handleVoices(req, res) {
  try {
    const upstream = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": apiKey() },
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error("ElevenLabs voices error", upstream.status, data?.detail?.message);
      return res.status(upstream.status).json({ error: data?.detail?.message || "Could not read the voice library." });
    }
    return res.status(200).json({ voices: trimVoices(data) });
  } catch (err) {
    console.error("Voice library error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}

/** One take. Resolves to base64 audio the browser can play directly. */
async function handleSpeak(req, res) {
  const invalid = validateVoiceBody(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const { voiceId, text, model, outputFormat = "mp3_44100_128" } = req.body;

  try {
    const upstream = await fetch(
      `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify(buildSpeechBody(req.body)),
      },
    );

    // The success path returns raw audio, not JSON — so an error has to be read
    // as text and parsed defensively. Reading it as JSON first would throw on the
    // very responses that carry the explanation.
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      let message = "";
      try { message = JSON.parse(detail)?.detail?.message || ""; } catch { /* not JSON — fall through */ }
      console.error("ElevenLabs speech error", upstream.status, message || detail.slice(0, 200));
      return res.status(upstream.status).json({
        error: message || "The speech provider rejected this request.",
      });
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).json({
      mimeType: outputFormat.startsWith("mp3") ? "audio/mpeg" : "audio/wav",
      data: audio.toString("base64"),
      model,
      voiceId,
      // Returned because billing is per character and the ledger prices on it.
      // Taken from the text actually sent rather than recomputed in the browser,
      // so the row cannot disagree with what was bought.
      characters: text.length,
    });
  } catch (err) {
    console.error("Voice proxy error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
