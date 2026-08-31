// api/video.js — talking-head avatar video proxy (HeyGen / D-ID / VEED Fabric)
//
// Third provider family, same reasoning as api/image.js for why this is its
// own endpoint rather than a branch in api/proxy.js: the request shape and the
// spend-per-call are both different in kind from a text call, so the tight
// validation that protects the Anthropic path would either have to loosen or
// duplicate. A new provider family gets a new endpoint with its own contract.
//
// ## Why this is submit/poll, not one call
//
// Every avatar provider renders as a background job — HeyGen and D-ID both
// return a job id immediately and require polling a status endpoint, typically
// 60-170 seconds before a render completes (see DECISIONS.md). There is no
// provider here that returns a finished video synchronously the way Gemini
// image generation does. So this endpoint has two actions, `submit` and
// `poll`, and the browser drives the poll loop — the alternative (holding a
// serverless function open for minutes) exceeds Vercel's execution limits and
// is the same shape of problem Phase 3's background-execution-engine roadmap
// item exists to solve for the Signal debate.
//
// ## Why cost bounds here are tighter than the image proxy's
//
// An image is a fixed few cents. A video is priced per second of output, which
// means per word of script: a 30-second read is ~$0.51 on the standard tier and
// ~$4.50 on premium (see DECISIONS.md pricing notes). That is an order of
// magnitude more per generation than an image, and unlike an image it has no
// fixed ceiling — the cost scales with a caller-supplied script. So in addition to the
// image proxy's controls (origin allowlist, per-IP rate limit, prompt length
// cap), this endpoint bounds SCRIPT length directly, since script length is
// the one variable that scales spend linearly for every provider.
//
// ## What this endpoint deliberately does not do
//
// It does not re-host the finished video. Providers return a short-lived
// signed URL (HeyGen and D-ID both expire theirs within 24-72h); this proxy
// passes that URL straight back rather than downloading and storing the file
// itself. Two reasons: a rendered video is 5-50MB, an order of magnitude past
// what browser storage should ever hold (see the image proxy's identical
// reasoning, scaled up); and re-hosting would make this app a video CDN with
// its own egress cost and retention policy, which is a Phase-5.3-fact-table
// / real-storage problem, not something to back into via a generation proxy.
// The operator downloads the clip themselves before the provider's link
// expires — same pattern as the image path's session-only base64.

import { VIDEO_TIERS, estimateVideoCostUsd } from "../src/services/ai/callGenerateVideo.js";
import { guardEntry, guardRateLimit, rateLimitIdentity } from "./_guard.js";

export const ALLOWED_PROVIDERS = new Set(["heygen", "did", "fabric"]);

/** Reverse the tier -> provider mapping so the endpoint can price a submit
 *  without the client having to send a rate it could tamper with. Returns null
 *  for a provider that is reachable but not a named tier (D-ID), in which case
 *  no estimate is offered rather than a wrong one. */
function tierForProvider(provider) {
  return Object.values(VIDEO_TIERS).find(t => t.provider === provider) || null;
}

// ~150 words, which is ~60s of speech at the estimator's 150wpm, which is ~$9
// on the premium tier. This is the cap that bounds the worst case of a single
// submit; see SUBMIT_RATE_LIMIT_MAX for what it bounds in aggregate. Raising it
// raises both, and video.test.js pins the relationship so that cannot happen
// silently.
export const MAX_SCRIPT_CHARS = 900;
export const MAX_BODY_BYTES = 16 * 1024;
export const ALLOWED_ASPECTS = new Set(["9:16", "4:5", "1:1", "16:9"]);

// Far below the image proxy's ceiling, for the reason above: each unbounded
// submit is a dollar-plus, not a few cents.
//
// Worked through at the real rates rather than guessed: MAX_SCRIPT_CHARS caps a
// script at roughly 150 words, which is about 60 seconds of speech, which on the
// premium tier ($0.15/sec) is ~$9 a clip. Twelve of those is ~$108/hour/IP —
// materially worse than the "$15-20" this comment used to claim, because that
// figure predated the premium tier existing. It is bounded and it is survivable
// for a single-operator deployment, but it is not a number to carry into Phase 4
// unrevisited, and it is the reason the fail-closed branch in _guard.js is not
// negotiable.
const SUBMIT_RATE_LIMIT_MAX = 12;
// Polling costs the provider nothing extra and the proxy very little; bounded
// generously so a normal 60-170s render (6-20 polls at the client's suggested
// 8s interval) never gets throttled mid-job.
const POLL_RATE_LIMIT_MAX = 120;

/** Returns an error string, or null. Exported so the request-shape test asserts
 *  against the real rule, same convention as validateImageBody. */
export function validateSubmitBody(body) {
  if (!body || typeof body !== "object") return "Malformed request body.";
  if (!ALLOWED_PROVIDERS.has(body.provider)) return "Unsupported video provider.";
  if (typeof body.script !== "string" || body.script.trim().length === 0) return "script must be a non-empty string.";
  if (body.script.length > MAX_SCRIPT_CHARS) return `script exceeds the ${MAX_SCRIPT_CHARS} character cap.`;
  if (body.aspectRatio != null && !ALLOWED_ASPECTS.has(body.aspectRatio)) return "Unsupported aspect ratio.";
  if (body.avatarId != null && typeof body.avatarId !== "string") return "avatarId must be a string.";
  if (body.voiceId != null && typeof body.voiceId !== "string") return "voiceId must be a string.";
  return null;
}

export function validatePollBody(body) {
  if (!body || typeof body !== "object") return "Malformed request body.";
  if (!ALLOWED_PROVIDERS.has(body.provider)) return "Unsupported video provider.";
  if (typeof body.jobId !== "string" || body.jobId.trim().length === 0) return "jobId must be a non-empty string.";
  return null;
}

// -- Provider adapters -----------------------------------------------------
//
// Each adapter has exactly two jobs: submit(script, opts) -> jobId, and
// poll(jobId) -> {status, url?, durationSeconds?, error?}. Nothing upstream of
// this file knows a provider-specific field name or endpoint shape — that is
// the whole point of keeping "which provider" a request parameter (see
// callGenerateVideo.js) rather than a compile-time choice. Adding a fourth
// provider is adding a fourth adapter, not touching call sites.
//
// Endpoint paths and payload shapes below reflect each provider's documented
// API as of mid-2026 and should be re-verified against current docs before
// relying on them in production — avatar-provider APIs move faster than this
// module will.

const FAL_QUEUE = "https://queue.fal.run";
const FABRIC_BASE_ENDPOINT = "veed/fabric-1.0";
const FABRIC_TEXT_ENDPOINT = "veed/fabric-1.0/text";

/** fal reports errors in more than one shape depending on where it failed —
 *  a top-level `detail` for request rejections, a `error.message` for model
 *  failures. Read both rather than showing "undefined" to an operator. */
function falError(data) {
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map(d => d?.msg).filter(Boolean).join("; ");
  return data?.error?.message || data?.error || null;
}

const adapters = {
  heygen: {
    async submit({ script, avatarId, voiceId, aspectRatio }) {
      const apiKey = process.env.HEYGEN_API_KEY;
      if (!apiKey) throw Object.assign(new Error("HeyGen is not configured on this deployment."), { status: 500 });
      const dimension = aspectRatio === "16:9" ? { width: 1280, height: 720 }
        : aspectRatio === "1:1" ? { width: 720, height: 720 }
        : { width: 720, height: 1280 }; // 9:16 / 4:5 both default portrait; refine per-provider if needed
      const resp = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({
          video_inputs: [{
            character: avatarId ? { type: "avatar", avatar_id: avatarId } : { type: "avatar", avatar_id: "default" },
            voice: { type: "text", input_text: script, voice_id: voiceId || undefined },
          }],
          dimension,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.message || "HeyGen submit failed."), { status: resp.status });
      return data?.data?.video_id;
    },
    async poll(jobId) {
      const apiKey = process.env.HEYGEN_API_KEY;
      // See the note on the D-ID poll below: a poll outlives its submit, so the
      // key is re-checked rather than assumed from the submit that started the job.
      if (!apiKey) throw Object.assign(new Error("HeyGen is not configured on this deployment."), { status: 500 });
      const resp = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`, {
        headers: { "X-Api-Key": apiKey },
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.message || "HeyGen status check failed."), { status: resp.status });
      const status = data?.data?.status; // "pending" | "processing" | "completed" | "failed"
      if (status === "completed") return { status: "done", url: data.data.video_url, durationSeconds: data.data.duration };
      if (status === "failed") return { status: "failed", error: data?.data?.error?.message || "Render failed." };
      return { status: "processing" };
    },
  },

  // D-ID. Implemented and reachable, but not surfaced as a tier — see the note
  // beside VIDEO_TIERS in callGenerateVideo.js for why (it currently prices
  // above HeyGen without being better).
  //
  // Two corrections from the first draft, both of which would have failed on
  // the first real call:
  //   • `source_url` is required, not optional. D-ID has no stock avatar
  //     library; /talks animates an image you give it. Sending `undefined`
  //     yields a 400 that reads like a malformed request rather than a missing
  //     avatar, so it is caught here with a message that names the cause.
  //   • DID_API_KEY must hold the ALREADY base64-encoded `email:key` pair, not
  //     the raw key from the Studio. `Basic ${apiKey}` is correct only under
  //     that assumption; encoding here as well would double-encode a correctly
  //     stored value. This is the single most common D-ID 401 and it is
  //     documented in the README rather than guessed at at runtime.
  did: {
    async submit({ script, avatarId, voiceId }) {
      const apiKey = process.env.DID_API_KEY;
      if (!apiKey) throw Object.assign(new Error("D-ID is not configured on this deployment."), { status: 500 });
      if (!avatarId) {
        throw Object.assign(new Error("D-ID renders animate a still image, so they need an avatar image URL."), { status: 400 });
      }
      const resp = await fetch("https://api.d-id.com/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` },
        body: JSON.stringify({
          source_url: avatarId, // D-ID takes an avatar image URL, not an id
          script: {
            type: "text",
            input: script,
            // Omit `provider` entirely to take D-ID's default voice. An explicit
            // provider block with an undefined voice_id is rejected, so the
            // spread is load-bearing rather than tidiness.
            ...(voiceId ? { provider: { type: "microsoft", voice_id: voiceId } } : {}),
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.description || data?.message || "D-ID submit failed."), { status: resp.status });
      return data?.id;
    },
    async poll(jobId) {
      const apiKey = process.env.DID_API_KEY;
      // Checked here as well as in submit. A poll can outlive the submit that
      // created it — the browser drives the loop for minutes — so a key removed
      // or a function cold-starting into a different env would otherwise send
      // `Basic undefined` and surface D-ID's 401 as if the render had failed.
      if (!apiKey) throw Object.assign(new Error("D-ID is not configured on this deployment."), { status: 500 });
      const resp = await fetch(`https://api.d-id.com/talks/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Basic ${apiKey}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.description || data?.message || "D-ID status check failed."), { status: resp.status });
      // "created" | "started" | "done" | "error" | "rejected". `rejected` is a
      // moderation refusal rather than a render fault — a distinct outcome, and
      // one the operator can act on, so it is not folded into "processing".
      const status = data?.status;
      if (status === "done") return { status: "done", url: data.result_url, durationSeconds: data.duration };
      if (status === "error" || status === "rejected") {
        return { status: "failed", error: data?.error?.description || data?.error?.kind || "Render failed." };
      }
      return { status: "processing" };
    },
  },

  // VEED Fabric 1.0, reached through fal.ai rather than through VEED.
  //
  // The first draft of this adapter posted to `api.veed.io/v1/fabric/generate`
  // with a bearer token. That endpoint does not exist. Fabric 1.0 is
  // distributed through fal.ai's inference queue, and the shape is different in
  // three ways that all matter:
  //
  //   1. Two endpoints, not one. The headline `veed/fabric-1.0` model is
  //      image + AUDIO -> video: it lip-syncs a still to an audio file you
  //      supply, and has no idea what a script is. The script-native variant is
  //      a separate sub-endpoint, `veed/fabric-1.0/text`, which runs VEED's own
  //      TTS over the text. This app only ever has a script, so it is the /text
  //      endpoint or nothing — posting a script to the base model would fail
  //      validation on a missing audio_url.
  //   2. `image_url` is required. Fabric animates a still; there is no stock
  //      avatar library to fall back on the way HeyGen has. A submit with no
  //      avatar image cannot succeed, so it is rejected here with a message
  //      that says why rather than passed through to a 422.
  //   3. Auth is `Authorization: Key <token>` — fal's own scheme, not Bearer.
  //
  // Async is fal's queue: submit returns a request_id, and status and result
  // are two different GETs. Note the URL asymmetry — submissions go to the
  // sub-endpoint path, but queue lookups drop the sub-path and address the base
  // app id. That is fal's documented behaviour for models with variants and is
  // the single likeliest thing here to break if they change it.
  fabric: {
    async submit({ script, avatarId, voiceId }) {
      const apiKey = process.env.VEED_API_KEY;
      if (!apiKey) throw Object.assign(new Error("VEED Fabric is not configured on this deployment."), { status: 500 });
      if (!avatarId) {
        throw Object.assign(
          new Error("Premium renders animate a still image, so they need an avatar image URL. Add one, or use the standard tier."),
          { status: 400 }
        );
      }
      const resp = await fetch(`${FAL_QUEUE}/${FABRIC_TEXT_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
        body: JSON.stringify({
          image_url: avatarId,
          text: script,
          // 720p, matching VIDEO_TIERS.PREMIUM.costPerSecond ($0.15/sec). Fabric
          // also offers 480p at $0.08 — if that ever becomes the premium tier's
          // rate, this constant and that one move together or the estimate lies.
          resolution: "720p",
          // Fabric's voice control is a free-text description ("confident male,
          // mid-20s"), not an id from a catalogue. Passing the app's voiceId
          // through works because it is operator-typed either way.
          ...(voiceId ? { voice: voiceId } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(falError(data) || "Fabric submit failed."), { status: resp.status });
      return data?.request_id;
    },
    async poll(jobId) {
      const apiKey = process.env.VEED_API_KEY;
      if (!apiKey) throw Object.assign(new Error("VEED Fabric is not configured on this deployment."), { status: 500 });
      const auth = { Authorization: `Key ${apiKey}` };
      const id = encodeURIComponent(jobId);

      const statusResp = await fetch(`${FAL_QUEUE}/${FABRIC_BASE_ENDPOINT}/requests/${id}/status`, { headers: auth });
      const statusData = await statusResp.json();
      if (!statusResp.ok) throw Object.assign(new Error(falError(statusData) || "Fabric status check failed."), { status: statusResp.status });

      // fal's queue states are IN_QUEUE / IN_PROGRESS / COMPLETED. There is no
      // FAILED state: a job that errored still reports COMPLETED and surfaces
      // the failure when the result is fetched, which is why the result fetch
      // below distinguishes an error payload rather than assuming success.
      if (statusData?.status !== "COMPLETED") return { status: "processing" };

      const resultResp = await fetch(`${FAL_QUEUE}/${FABRIC_BASE_ENDPOINT}/requests/${id}`, { headers: auth });
      const result = await resultResp.json();
      if (!resultResp.ok) return { status: "failed", error: falError(result) || "Render failed." };

      const url = result?.video?.url;
      if (!url) return { status: "failed", error: falError(result) || "Fabric completed without returning a video." };
      // fal does not report output duration for this model; the client falls
      // back to its own spoken-length estimate rather than showing a blank.
      return { status: "done", url, durationSeconds: null };
    },
  },
};

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;

  // Which bucket and which ceiling applies is decided by the action, so this
  // has to resolve between the entry checks and the rate limit — a submit costs
  // a dollar-plus and a poll costs nothing, and they must not share a budget.
  const action = req.body?.action;
  if (action !== "submit" && action !== "poll") return res.status(400).json({ error: "action must be \"submit\" or \"poll\"." });

  const who = await rateLimitIdentity(req);
  if (who.error) { res.status(401).json({ error: who.error }); return; }
  if (await guardRateLimit(req, res, {
    key: `gos:vid:${action}:${who.id}`,
    max: action === "submit" ? SUBMIT_RATE_LIMIT_MAX : POLL_RATE_LIMIT_MAX,
    limitMessage: "Video generation limit reached. Try again later.",
    label: "Video",
  })) return;

  const adapter = adapters[req.body?.provider];

  if (action === "submit") {
    const invalid = validateSubmitBody(req.body);
    if (invalid) return res.status(400).json({ error: invalid });
    try {
      const jobId = await adapter.submit(req.body);
      if (!jobId) return res.status(502).json({ error: "Provider did not return a job id." });
      // Computed with the client's own estimator, imported rather than
      // reimplemented. The point is not that the server needs the number — it
      // is that there is one formula, so the figure the operator was shown
      // before clicking cannot silently disagree with the figure logged against
      // the job they actually bought.
      const tier = tierForProvider(req.body.provider);
      const estimatedCostUsd = tier ? estimateVideoCostUsd(req.body.script, tier) : null;
      return res.status(200).json({ jobId, provider: req.body.provider, estimatedCostUsd });
    } catch (err) {
      console.error("Video submit failed", req.body.provider, err.status, err.message);
      return res.status(err.status || 502).json({ error: err.message || "Video submit failed." });
    }
  }

  // action === "poll"
  const invalid = validatePollBody(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const result = await adapter.poll(req.body.jobId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Video poll failed", req.body.provider, err.status, err.message);
    return res.status(err.status || 502).json({ error: err.message || "Video status check failed." });
  }
}
