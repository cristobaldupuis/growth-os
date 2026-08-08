// api/image.js — Gemini image generation proxy ("Nano Banana")
//
// A second provider, deliberately a second endpoint rather than a branch inside
// api/proxy.js. The Anthropic proxy's `validateBody` requires `model`,
// `max_tokens` and `messages`; a Gemini image request has none of those, so
// making one function serve both would mean loosening the validation that is the
// Anthropic path's actual security control. Two endpoints, two tight contracts.
//
// ## Why the bounds here are stricter than the text proxy's
//
// Text is metered in fractions of a cent per call and the ceiling that matters
// is `max_tokens`. An image is a fixed, much larger unit of spend — roughly four
// cents each at current Gemini 2.5 Flash Image rates — and there is no
// equivalent of "ask for fewer tokens" to bound it. So the controls are on
// *count*: one image per request, a hard cap on how many can be asked for in an
// hour, and a prompt length cap. A stolen request cannot be reshaped into a
// batch job.
//
// ## What this endpoint deliberately does not do
//
// It does not persist anything. The base64 image goes straight back to the
// browser and the browser holds it in memory for the session. See
// DECISIONS.md — a 1024px PNG is well over a megabyte encoded, localStorage caps
// around 5MB, and this app has already shipped one silent data-loss bug caused
// by a full quota. Images are the fastest possible way to reproduce it.

import { guardEntry, guardRateLimit, clientIp } from "./_guard.js";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";

// Image models this app actually calls. "Nano Banana" is the community name for
// Gemini 2.5 Flash Image; the Pro tier is the Gemini 3 image preview.
export const ALLOWED_IMAGE_MODELS = new Set([
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
]);

export const MAX_PROMPT_CHARS = 4000;
export const ALLOWED_ASPECTS = new Set(["1:1", "4:5", "9:16", "16:9", "3:2", "2:3"]);
const MAX_BODY_BYTES = 64 * 1024;

// Deliberately far below the text proxy's 60/hour. At roughly four cents an
// image this is a bounded worst case of about a dollar an hour per IP.
const RATE_LIMIT_MAX = 25;

/**
 * Returns an error string, or null when acceptable.
 *
 * The client sends `{model, prompt, aspectRatio}` rather than a raw Gemini body.
 * That is the point: this endpoint builds the upstream request itself, so a
 * caller cannot smuggle through fields it does not know about — extra response
 * modalities, tool declarations, a candidate count that multiplies the bill.
 *
 * Exported so the request-shape test asserts against the real rules rather than
 * a copy that can drift.
 */
export function validateImageBody(body) {
  if (!body || typeof body !== "object") return "Malformed request body.";
  if (!ALLOWED_IMAGE_MODELS.has(body.model)) return "Unsupported image model.";
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) return "prompt must be a non-empty string.";
  if (body.prompt.length > MAX_PROMPT_CHARS) return `prompt exceeds the ${MAX_PROMPT_CHARS} character cap.`;
  if (body.aspectRatio != null && !ALLOWED_ASPECTS.has(body.aspectRatio)) return "Unsupported aspect ratio.";
  // One image per request. Bounding count is the only real cost control here,
  // since there is no token ceiling to lean on.
  if (body.count != null && body.count !== 1) return "Only one image per request.";
  return null;
}

/** Build the upstream Gemini body. Exported for the same reason as the validator. */
export function buildGeminiBody({ prompt, aspectRatio }) {
  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Both modalities are required: these models are multimodal and always
      // return a text part alongside the image. Asking for IMAGE alone is
      // rejected upstream.
      responseModalities: ["TEXT", "IMAGE"],
      candidateCount: 1,
      ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
    },
  };
}

/** Pull the first inline image out of a Gemini response, or null. */
export function extractImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const part = parts.find((p) => p?.inlineData?.data);
  if (!part) return null;
  return { mimeType: part.inlineData.mimeType || "image/png", data: part.inlineData.data };
}

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
  // Separate key namespace from the text proxy: image spend has its own, much
  // lower ceiling and must not be able to exhaust or be exhausted by text calls.
  if (await guardRateLimit(req, res, {
    key: `gos:img:${clientIp(req)}`,
    max: RATE_LIMIT_MAX,
    limitMessage: "Image generation limit reached. Try again later.",
    label: "Image",
  })) return;

  const invalid = validateImageBody(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Image generation is not configured on this deployment." });

  try {
    const upstream = await fetch(`${GEMINI_API}/${req.body.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(buildGeminiBody(req.body)),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error("Gemini error", upstream.status, data?.error?.status, data?.error?.message);
      return res.status(upstream.status).json({ error: data?.error?.message || "Upstream request failed" });
    }

    const image = extractImage(data);
    if (!image) {
      // A safety block returns 200 with no image part and a finishReason. Say so
      // plainly rather than rendering a broken frame — the operator needs to know
      // the prompt was refused, not that the feature is flaky.
      const reason = data?.candidates?.[0]?.finishReason;
      console.warn("Gemini returned no image part", reason);
      return res.status(422).json({
        error: reason === "SAFETY" || reason === "PROHIBITED_CONTENT"
          ? "The model declined this prompt. Try rewording the visual direction."
          : "No image was returned for this prompt.",
        finishReason: reason,
      });
    }
    return res.status(200).json(image);
  } catch (err) {
    console.error("Image proxy error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
