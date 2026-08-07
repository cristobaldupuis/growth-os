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
// An image is a fixed few cents. A video is $0.35-$1.50+ for a 5-10 second
// clip depending on provider and length (see DECISIONS.md pricing notes) — an
// order of magnitude more per generation, and the cost scales with a caller-
// supplied script length rather than being fixed. So in addition to the
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

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://growth-os-iota-seven.vercel.app")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const ALLOWED_PROVIDERS = new Set(["heygen", "did", "fabric"]);

export const MAX_SCRIPT_CHARS = 900;   // ~ a 60-90s spoken script at natural pace
export const MAX_BODY_BYTES = 16 * 1024;
export const ALLOWED_ASPECTS = new Set(["9:16", "4:5", "1:1", "16:9"]);

// Far below the image proxy's ceiling, for the reason above: each unbounded
// submit is a dollar-plus, not a few cents. A bounded worst case here is
// roughly $15-20/hour/IP at the top of the per-clip cost range, still real
// money, which is why this number should be revisited before any multi-user
// deployment (Phase 4) rather than trusted as-is at scale.
const SUBMIT_RATE_LIMIT_MAX = 12;
const SUBMIT_RATE_LIMIT_WINDOW = 60 * 60 * 1000;
// Polling costs the provider nothing extra and the proxy very little; bounded
// generously so a normal 60-170s render (6-20 polls at the client's suggested
// 8s interval) never gets throttled mid-job.
const POLL_RATE_LIMIT_MAX = 120;

const memoryLog = new Map();
function memoryRateLimit(id, action, max, window) {
  const key = `${action}:${id}`;
  const now = Date.now();
  const entry = memoryLog.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > window) { entry.count = 0; entry.windowStart = now; }
  entry.count += 1;
  memoryLog.set(key, entry);
  return entry.count > max;
}

async function redisRateLimit(id, action, max, window) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const key = `gos:vid:${action}:${id}:${Math.floor(Date.now() / window)}`;
  const ttl = Math.ceil(window / 1000);
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", key], ["EXPIRE", key, ttl]]),
  });
  if (!res.ok) throw new Error(`rate-limit backend returned ${res.status}`);
  const out = await res.json();
  const count = Number(out?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("rate-limit backend returned an unreadable count");
  return count > max;
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  const referer = req.headers.referer;
  if (referer) return ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  return false;
}

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

  did: {
    async submit({ script, avatarId, voiceId }) {
      const apiKey = process.env.DID_API_KEY;
      if (!apiKey) throw Object.assign(new Error("D-ID is not configured on this deployment."), { status: 500 });
      const resp = await fetch("https://api.d-id.com/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` },
        body: JSON.stringify({
          source_url: avatarId || undefined, // D-ID takes an avatar image URL, not an id
          script: { type: "text", input: script, provider: voiceId ? { type: "microsoft", voice_id: voiceId } : undefined },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.description || "D-ID submit failed."), { status: resp.status });
      return data?.id;
    },
    async poll(jobId) {
      const apiKey = process.env.DID_API_KEY;
      const resp = await fetch(`https://api.d-id.com/talks/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Basic ${apiKey}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.description || "D-ID status check failed."), { status: resp.status });
      const status = data?.status; // "created" | "started" | "done" | "error"
      if (status === "done") return { status: "done", url: data.result_url, durationSeconds: data.duration };
      if (status === "error") return { status: "failed", error: data?.error?.description || "Render failed." };
      return { status: "processing" };
    },
  },

  fabric: {
    async submit({ script, avatarId, voiceId, aspectRatio }) {
      const apiKey = process.env.VEED_API_KEY;
      if (!apiKey) throw Object.assign(new Error("VEED Fabric is not configured on this deployment."), { status: 500 });
      const resp = await fetch("https://api.veed.io/v1/fabric/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ avatar_id: avatarId, voice_id: voiceId, script, aspect_ratio: aspectRatio }),
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.error || "Fabric submit failed."), { status: resp.status });
      return data?.job_id;
    },
    async poll(jobId) {
      const apiKey = process.env.VEED_API_KEY;
      const resp = await fetch(`https://api.veed.io/v1/fabric/jobs/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw Object.assign(new Error(data?.error || "Fabric status check failed."), { status: resp.status });
      const status = data?.status; // documented values may differ — verify against current Fabric API docs
      if (status === "completed") return { status: "done", url: data.output_url, durationSeconds: data.duration_seconds };
      if (status === "failed") return { status: "failed", error: data?.error || "Render failed." };
      return { status: "processing" };
    },
  },
};

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!originAllowed(req)) return res.status(403).json({ error: "Forbidden" });

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) return res.status(413).json({ error: "Request body too large." });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const action = req.body?.action;
  if (action !== "submit" && action !== "poll") return res.status(400).json({ error: "action must be \"submit\" or \"poll\"." });

  const limits = action === "submit"
    ? { max: SUBMIT_RATE_LIMIT_MAX, window: SUBMIT_RATE_LIMIT_WINDOW }
    : { max: POLL_RATE_LIMIT_MAX, window: SUBMIT_RATE_LIMIT_WINDOW };

  try {
    const limited = await redisRateLimit(ip, action, limits.max, limits.window);
    if (limited === null) {
      console.warn("Video rate limiting is in-memory only; set UPSTASH_REDIS_REST_URL/TOKEN for a durable limit.");
      if (memoryRateLimit(ip, action, limits.max, limits.window)) {
        return res.status(429).json({ error: "Video generation limit reached. Try again later." });
      }
    } else if (limited) {
      return res.status(429).json({ error: "Video generation limit reached. Try again later." });
    }
  } catch (err) {
    // Fail closed — more important here than on the image path, since a
    // successful submit is a dollar-plus of provider spend, not a few cents.
    console.error("Video rate limit check failed:", err);
    return res.status(503).json({ error: "Service temporarily unavailable." });
  }

  const adapter = adapters[req.body?.provider];

  if (action === "submit") {
    const invalid = validateSubmitBody(req.body);
    if (invalid) return res.status(400).json({ error: invalid });
    try {
      const jobId = await adapter.submit(req.body);
      if (!jobId) return res.status(502).json({ error: "Provider did not return a job id." });
      const estimatedCostUsd = null; // left to the client's own per-provider rate table until real per-second confirmation lands with the completed job
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
