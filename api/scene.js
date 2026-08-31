// api/scene.js — Veo scene generation on Vertex AI.
//
// The moving key frame. A sibling of api/image.js, not of api/video.js, and the
// distinction is the whole design: api/video.js takes an approved SCRIPT and has
// a person say it; this takes a visual DIRECTION and makes it move. Neither can
// do the other's job, which is why the registry separates them on `caps`
// (lipSync vs sceneGen) rather than leaving one `video` group that would happily
// route a talking-head render to a model with no idea what to do without a
// script.
//
// ## Why this is not a third video tier
//
// DECISIONS.md is emphatic that VIDEO_TIERS names the DECISION rather than the
// provider — "is this clip worth nine times the money". Scene generation is not
// a cheaper answer to that question, it is a different question, and its price
// is not even computed the same way: a talking head costs what its script takes
// to SAY (estimateSpokenSeconds), while a scene costs the duration you ASK for.
// Folding them into one picker would mean one of the two prices lying.
//
// ## Why Vertex rather than the Gemini Developer API
//
// Both serve Veo. They bill differently, and that is the point: the Developer
// API draws on an AI Studio balance that explicitly excludes Google Cloud
// credits, while Vertex bills the GCP project's Cloud Billing account where
// promotional and free-trial credits actually sit. api/_geminiAuth.js already
// mints the Vertex token for image generation, so reaching Veo costs no new auth
// machinery — only a different method on the same URL.
//
// Auto-detect still applies: with only GEMINI_API_KEY set this runs against the
// Developer API and works, it just does not touch your credits. See the README.
//
// ## Why submit/poll
//
// Same reason as api/video.js: a generation takes far longer than a serverless
// function may run. Veo is a long-running operation — `:predictLongRunning`
// returns an operation name, `:fetchPredictOperation` collects it — so the
// browser drives the cadence and a torn-down page costs nothing but the wait.

import { guardEntry, guardRateLimit, clientIp } from "./_guard.js";
import {
  geminiConfigured, geminiEndpoint, geminiAuthHeaders, geminiNotConfiguredError,
  VEO_SUBMIT_METHOD, VEO_POLL_METHOD,
} from "./_geminiAuth.js";
import { SCENE_MODEL_IDS } from "../src/services/ai/registry.js";

// Derived from the catalogue rather than hand-kept — the same control, and the
// same reasoning, as api/proxy.js's ALLOWED_MODELS. A scene model the console can
// select is one this endpoint can call, by construction.
export const ALLOWED_SCENE_MODELS = new Set(SCENE_MODEL_IDS);

export const MAX_PROMPT_CHARS = 4000;

// Veo renders landscape and portrait. The app briefs for 4:5 and 1:1 as well, so
// those are deliberately absent rather than passed through and silently
// reinterpreted upstream — an operator who picks a ratio the model will not
// honour should be told here, not shown a clip in the wrong shape.
export const ALLOWED_ASPECTS = new Set(["16:9", "9:16"]);

// The durations Veo accepts. This is also the per-request spend ceiling, since a
// scene costs duration x rate: 8 seconds at the dearer model's $0.40/sec is
// $3.20, and that is the most any single submit can cost.
export const ALLOWED_DURATIONS = new Set([4, 6, 8]);

export const ALLOWED_RESOLUTIONS = new Set(["720p", "1080p"]);

const MAX_BODY_BYTES = 16 * 1024;

// Worked through at the rates in the catalogue rather than guessed, the same way
// api/video.js bounds its own submits: 10 clips at the worst case above is about
// $32/hour/IP. Bounded, survivable for a single-operator deployment, and — like
// video's ceiling — not a number to carry into a multi-tenant phase unrevisited.
const SUBMIT_RATE_LIMIT_MAX = 10;
// Polling costs almost nothing; bounded generously so a 60-180s generation never
// gets throttled part-way through its own job.
const POLL_RATE_LIMIT_MAX = 120;

/**
 * Returns an error string, or null. Exported so scene.test.js asserts the
 * client's real request against the real rule — same convention as
 * validateImageBody and validateSubmitBody.
 */
export function validateSceneBody(body) {
  if (!body || typeof body !== "object") return "Malformed request body.";
  if (!ALLOWED_SCENE_MODELS.has(body.model)) return "Unsupported scene model.";

  if (typeof body.prompt !== "string" || !body.prompt.trim()) return "prompt must be a non-empty string.";
  if (body.prompt.length > MAX_PROMPT_CHARS) return `prompt exceeds the ${MAX_PROMPT_CHARS} character cap.`;

  if (body.aspectRatio != null && !ALLOWED_ASPECTS.has(body.aspectRatio)) return "Unsupported aspect ratio.";
  if (body.durationSeconds != null && !ALLOWED_DURATIONS.has(body.durationSeconds)) return "Unsupported duration.";
  if (body.resolution != null && !ALLOWED_RESOLUTIONS.has(body.resolution)) return "Unsupported resolution.";

  // Count is the real cost control here, exactly as on the image path: there is
  // no token ceiling to lean on, so a request must not be reshapeable into a
  // batch. Veo's own parameter is `sampleCount`; it is fixed at one rather than
  // accepted from the body.
  if (body.sampleCount != null && body.sampleCount !== 1) return "Only one clip per request.";
  return null;
}

export function validateScenePollBody(body) {
  if (!body || typeof body !== "object") return "Malformed request body.";
  if (!ALLOWED_SCENE_MODELS.has(body.model)) return "Unsupported scene model.";
  if (typeof body.operationName !== "string" || !body.operationName.trim()) {
    return "operationName must be a non-empty string.";
  }
  return null;
}

/**
 * Map this app's request onto Veo's instances/parameters shape.
 *
 * `generateAudio` is forced OFF, and that is a product constraint rather than a
 * cost one.
 *
 * Veo can generate its own dialogue. This app must not let it. buildImagePrompt
 * and buildVideoRequest both refuse to render anything from `claimsToVerify` —
 * the statements a brief flagged as unsupported — on the reasoning that putting
 * an unverified claim into a finished-looking asset launders an open question
 * into something that looks settled. A model inventing its own spoken dialogue
 * is that failure with no operator in the loop at all: nobody wrote the words,
 * nobody reviewed them, and they arrive sounding authoritative.
 *
 * A scene here is picture. When words are wanted, they come from an approved
 * script through api/video.js or api/voice.js, where a human has read them.
 */
export function buildVeoBody({ prompt, aspectRatio = "16:9", durationSeconds = 8, resolution = "720p" }) {
  return {
    instances: [{ prompt }],
    parameters: {
      aspectRatio,
      durationSeconds,
      resolution,
      sampleCount: 1,
      generateAudio: false,
    },
  };
}

/**
 * Pull a finished clip out of a completed operation, or null.
 *
 * Veo returns either inline base64 or a GCS URI depending on how the request was
 * made; both are read because which one arrives is not something this endpoint
 * controls, and a null return is handled by the caller as "still running".
 */
export function extractVideo(op) {
  const vids = op?.response?.videos;
  if (!Array.isArray(vids) || vids.length === 0) return null;
  const v = vids[0];
  if (v?.bytesBase64Encoded) return { mimeType: v.mimeType || "video/mp4", data: v.bytesBase64Encoded };
  if (v?.gcsUri) return { mimeType: v.mimeType || "video/mp4", gcsUri: v.gcsUri };
  return null;
}

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;

  const action = req.body?.action;
  const polling = action === "poll";

  // Separate namespaces, and separate ceilings, for the same reason api/video.js
  // splits them: a submit is dollars and a poll is nothing, so one budget for
  // both would either throttle a running job or fail to bound spend.
  if (await guardRateLimit(req, res, {
    key: polling ? `gos:scn:poll:${clientIp(req)}` : `gos:scn:submit:${clientIp(req)}`,
    max: polling ? POLL_RATE_LIMIT_MAX : SUBMIT_RATE_LIMIT_MAX,
    limitMessage: polling ? "Too many status checks. Wait a moment." : "Scene generation limit reached. Try again later.",
    label: polling ? "Scene poll" : "Scene submit",
  })) return;

  if (!geminiConfigured()) return res.status(500).json({ error: geminiNotConfiguredError() });

  if (action === "submit") return handleSubmit(req, res);
  if (polling) return handlePoll(req, res);
  return res.status(400).json({ error: 'action must be "submit" or "poll".' });
}

async function handleSubmit(req, res) {
  const invalid = validateSceneBody(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const upstream = await fetch(geminiEndpoint(req.body.model, VEO_SUBMIT_METHOD), {
      method: "POST",
      headers: await geminiAuthHeaders(),
      body: JSON.stringify(buildVeoBody(req.body)),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error("Veo submit error", upstream.status, data?.error?.status, data?.error?.message);
      return res.status(upstream.status).json({ error: data?.error?.message || "Scene generation failed." });
    }
    // The operation name is the whole result of a submit. It is also the only
    // thing that makes the spend recoverable if the browser goes away, which is
    // why it is returned rather than held server-side.
    if (!data?.name) return res.status(502).json({ error: "The provider accepted the job but returned no operation id." });
    return res.status(200).json({ operationName: data.name, model: req.body.model });
  } catch (err) {
    console.error("Scene submit error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}

async function handlePoll(req, res) {
  const invalid = validateScenePollBody(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const upstream = await fetch(geminiEndpoint(req.body.model, VEO_POLL_METHOD), {
      method: "POST",
      headers: await geminiAuthHeaders(),
      body: JSON.stringify({ operationName: req.body.operationName }),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error("Veo poll error", upstream.status, data?.error?.message);
      return res.status(upstream.status).json({ error: data?.error?.message || "Could not read the job status." });
    }

    if (!data?.done) return res.status(200).json({ status: "running" });

    // A done operation carrying an error is a FAILED render, not a transport
    // failure — 200 with a status, so the client distinguishes "the job died"
    // from "the poll did".
    if (data.error) {
      return res.status(200).json({ status: "failed", error: data.error.message || "The provider reported a failed render." });
    }

    const video = extractVideo(data);
    if (!video) {
      // Veo returns a done operation with no video when its safety filters
      // decline the prompt. Say so plainly, the same way api/image.js does for a
      // blocked frame — the operator needs to know it was refused, not that the
      // feature is flaky.
      const reason = data?.response?.raiMediaFilteredReasons?.[0];
      return res.status(200).json({
        status: "failed",
        error: reason || "The model declined this prompt. Try rewording the visual direction.",
      });
    }
    return res.status(200).json({ status: "done", ...video });
  } catch (err) {
    console.error("Scene poll error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
