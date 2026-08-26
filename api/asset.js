// api/asset.js — durable blob storage for generated creative (Supabase Storage)
//
// Fourth endpoint, same reasoning as api/image.js and api/video.js for why this
// is not a branch inside an existing one: the request shape is different in kind
// (an opaque blob and a key, not a model and a prompt), and the tight validation
// that protects the other paths would have to loosen to accommodate it.
//
// ## Why the write goes through here rather than from the browser
//
// A Supabase anon key held in the bundle is the `VITE_GOS_SECRET` mistake this
// codebase already made once (see services/ai/_shared.js). Anon keys are safe
// only behind row-level security tied to an authenticated user, and this app has
// no per-user auth yet — so an insert-capable key in the bundle means anyone who
// opens devtools can fill the operator's bucket. The service key stays here, and
// this endpoint authorises the same way every other one does: on origin, with a
// per-IP rate limit, and on the shape of what it will accept.
//
// ## Why it degrades instead of failing
//
// Unset the env vars and `?action=status` answers `{configured:false}`. The
// client then holds bytes for the session and marks the asset record
// `bytesDurable: false` — the provenance still persists, only the picture is
// transient. That is the current behaviour of the app, made explicit and
// reportable rather than implicit. A deployment with no Supabase project is not
// broken; it is a deployment whose generated frames must be downloaded before
// reload, and it now says so.
//
// ## What this endpoint deliberately does not do
//
// It does not stream, resize, transcode, or re-host a provider's video. A
// rendered clip is 5-50MB and re-hosting it would make this app a video CDN with
// its own egress bill and retention policy — the same reasoning as api/video.js,
// which passes the provider's short-lived signed URL straight back. What lands
// here is what the app generated and can afford to keep: image bytes, and any
// blob the operator explicitly chooses to preserve.

import { guardEntry, guardRateLimit, clientIp } from "./_guard.js";

export const BUCKET = process.env.SUPABASE_ASSET_BUCKET || "creative-assets";

// A 4:5 PNG from the Pro image model runs a few megabytes base64-encoded. 12MB
// of body allows that with headroom while staying well under what a serverless
// function can hold without trouble; a video-sized upload is refused rather than
// half-accepted.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

// Writes are bounded per IP per hour like every other spend-adjacent endpoint.
// Storage is cheap enough that this is an abuse control rather than a cost one —
// what it actually prevents is an unauthenticated bucket-filling script.
const RATE_LIMIT_MAX = 120;

// Long enough for an operator to look at a gallery and download what matters,
// short enough that a leaked URL is not a permanent handle on the bucket.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/webp",
]);

// Keys are minted by the client but never trusted as a path. Anything outside
// this shape is refused rather than sanitised: a key containing `..` or a slash
// is either a bug or an attempt to write outside the bucket prefix, and quietly
// rewriting it would turn the second case into a silent success.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// Credentials and the REST helpers live in api/_supabase.js, which is also what
// the routing store and the rate limiter now use. Re-exported here because
// asset.test.js and the storage paths below address them by these names.
export { secretKey, supabaseConfigured } from "./_supabase.js";
import { supabaseConfigured, authHeaders } from "./_supabase.js";

const storageBase = () => process.env.SUPABASE_URL.replace(/\/+$/, "") + "/storage/v1";

// Bounded, because this runs at app boot and a hung probe would hold up the
// answer to a question whose safe default is already "no". A timeout reads as
// unreachable, which is the conservative direction.
const PROBE_TIMEOUT_MS = 4000;

/**
 * Can this deployment actually store a byte right now?
 *
 * Lists the bucket with a zero-width window — the cheapest call that
 * distinguishes "project paused", "bucket missing" and "key rejected" from a
 * working setup, without transferring anything. Failure reasons are returned
 * rather than logged and swallowed, because each one has a different fix and an
 * operator staring at "not configured" with two env vars visibly set deserves
 * to be told which.
 */
export async function bucketReachable() {
  try {
    const resp = await fetch(`${storageBase()}/object/list/${BUCKET}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1 }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 401 || resp.status === 403) return { ok: false, reason: "key_rejected" };
    if (resp.status === 404) return { ok: false, reason: "bucket_missing" };
    // A paused Supabase project answers 5xx or refuses the connection outright.
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Returns an error string, or null when acceptable. */
export function validatePut(body) {
  if (!body || typeof body !== "object") return "Body must be a JSON object.";
  if (!KEY_PATTERN.test(String(body.key || ""))) {
    return "Invalid asset key. Keys are alphanumeric with dots, dashes and underscores, and cannot contain path separators.";
  }
  if (!ALLOWED_MIME.has(body.mimeType)) {
    return "Unsupported media type. This endpoint stores still images only.";
  }
  if (typeof body.data !== "string" || body.data.length === 0) {
    return "Missing base64 `data`.";
  }
  return null;
}

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES, methods: ["GET", "POST"] })) return;

  const action = req.method === "GET"
    ? String(req.query?.action || "status")
    : String(req.body?.action || "put");

  // Answered before the configuration check, because "is durable storage
  // available" is exactly the question a deployment without it needs answered.
  //
  // This REACHES the bucket rather than only reading env vars, and the
  // difference matters: a project that is paused, deleted, or missing this
  // bucket has both variables set and still cannot store anything. Answering
  // from configuration alone would let the studio tell an operator their frames
  // are being kept, right up until they reload and find they were not — which
  // is precisely the failure this whole module exists to prevent. Reporting
  // durability a deployment does not have is worse than reporting none.
  if (action === "status") {
    if (!supabaseConfigured()) { res.status(200).json({ configured: false, bucket: null, reason: "unset" }); return; }
    const reachable = await bucketReachable();
    res.status(200).json({
      configured: reachable.ok,
      bucket: reachable.ok ? BUCKET : null,
      // Named rather than collapsed into a boolean, because "you have not set
      // this up" and "your project is paused" need different fixes.
      ...(reachable.ok ? {} : { reason: reachable.reason }),
    });
    return;
  }

  if (!supabaseConfigured()) {
    res.status(503).json({
      error: "Durable asset storage is not configured for this deployment. "
           + "Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_KEY to enable it.",
    });
    return;
  }

  if (action === "url") {
    const key = String(req.query?.key || "");
    if (!KEY_PATTERN.test(key)) { res.status(400).json({ error: "Invalid asset key." }); return; }
    try {
      const signed = await fetch(`${storageBase()}/object/sign/${BUCKET}/${key}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
      });
      if (!signed.ok) {
        // A missing object is the ordinary case for an asset whose record
        // outlived its bytes, so it is a 404 rather than a 500 and the client
        // renders the record without a picture.
        res.status(signed.status === 400 || signed.status === 404 ? 404 : 502)
           .json({ error: "Asset not available." });
        return;
      }
      const body = await signed.json();
      // Supabase returns a path relative to /storage/v1, not an absolute URL.
      res.status(200).json({ url: storageBase() + body.signedURL });
    } catch (err) {
      console.error("asset sign failed:", err);
      res.status(502).json({ error: "Could not sign the asset URL." });
    }
    return;
  }

  if (action !== "put") { res.status(400).json({ error: "Unknown action." }); return; }

  const invalid = validatePut(req.body);
  if (invalid) { res.status(400).json({ error: invalid }); return; }

  if (await guardRateLimit(req, res, {
    key: "gos:asset:" + clientIp(req),
    max: RATE_LIMIT_MAX,
    limitMessage: "Too many asset uploads from this address. Wait a while and try again.",
    label: "Asset storage",
  })) return;

  try {
    const bytes = Buffer.from(req.body.data, "base64");
    const upload = await fetch(`${storageBase()}/object/${BUCKET}/${req.body.key}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": req.body.mimeType,
        // Overwrite rather than 409 on a repeat key. Keys carry a timestamp and a
        // random suffix, so a collision is a retry of the same write, and failing
        // it would lose a generation the operator already paid for.
        "x-upsert": "true",
      },
      body: bytes,
    });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => "");
      console.error("asset upload failed:", upload.status, detail);
      res.status(502).json({ error: "Could not store the asset." });
      return;
    }
    res.status(200).json({ key: req.body.key });
  } catch (err) {
    console.error("asset upload failed:", err);
    res.status(502).json({ error: "Could not store the asset." });
  }
}
