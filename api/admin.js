// api/admin.js — the admin console's only backend.
//
// One endpoint with an `action` discriminator rather than five files, following
// the shape api/video.js already uses for submit/poll. These actions share a
// session check, a rate-limit bucket and a config-error path; splitting them would
// duplicate all three.
//
// ## What this is allowed to do, and what it deliberately is not
//
// It reads and writes model routing, and it asks a provider to list its own
// models so an ID can be verified rather than guessed. That is the whole surface.
//
// It notably does NOT proxy AI calls. The test bench in the console calls
// /api/proxy exactly like the app does, through the same validateBody ceilings and
// the same rate limiter. Giving the console a privileged path to the providers
// would mean the thing most likely to spend money in bulk was the one thing not
// bounded by the controls written to stop that — see the "stolen request cannot be
// reshaped into something expensive" reasoning at the top of proxy.js. A logged-in
// operator is not a reason to remove a spend ceiling.
//
// ## Rate limiting
//
// Its own bucket, `gos:admin:<ip>`, at a deliberately low ceiling. Two reasons:
// the login action is a password oracle and needs guessing to be bounded, and
// admin traffic must not be able to exhaust the app's AI rate-limit budget (or be
// exhausted by it) — the same isolation reasoning as the separate `gos:img` and
// `gos:vid` buckets in _guard.js.

import { guardEntry, guardRateLimit, clientIp } from "./_guard.js";
import { readRouting, writeRouting, routingIsDurable } from "./_routing.js";
import {
  adminConfigError, passwordMatches, sessionCookie, clearedCookie, hasValidSession,
} from "./_session.js";
import {
  MODEL_CATALOGUE, FEATURE_GROUPS, DEFAULT_ROUTING, validateRouting, resolveRouting, modelById,
} from "../src/services/ai/registry.js";

const MAX_BODY_BYTES = 32 * 1024;
// Low on purpose. A human clicking through a console does not need more, and this
// is what bounds password guessing.
const RATE_LIMIT_MAX = 40;

// Provider model-list endpoints, used only by the `listModels` action so a
// catalogue ID can be checked against what the provider actually offers. Anthropic
// IDs are confirmed by the app already calling them, so there is nothing to
// verify there; these are the two whose IDs are seeded unverified.
const MODEL_LIST_ENDPOINTS = {
  gemini: {
    url: () => `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
    keyVar: "GEMINI_API_KEY",
    // Gemini returns `models: [{name: "models/gemini-x", ...}]`.
    extract: (json) => (json?.models || []).map(m => String(m.name || "").replace(/^models\//, "")),
  },
  openai: {
    url: () => "https://api.openai.com/v1/models",
    keyVar: "OPENAI_API_KEY",
    headers: () => ({ Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }),
    extract: (json) => (json?.data || []).map(m => String(m.id)),
  },
};

/**
 * Ask a provider which models it offers.
 *
 * Returns `{ status, models }` on success or `{ status, error }` on failure,
 * rather than writing a response — both `listModels` and `verifyModel` need the
 * same fetch but answer different questions with it, and a helper that owns the
 * response object can only serve one of them.
 */
async function fetchProviderModels(provider) {
  const spec = MODEL_LIST_ENDPOINTS[provider];
  if (!spec) return { status: 400, error: `No model list is available for provider "${provider}".` };
  if (!process.env[spec.keyVar]) {
    return { status: 400, error: `${spec.keyVar} is not set, so ${provider} models cannot be listed.` };
  }
  try {
    const upstream = await fetch(spec.url(), { headers: spec.headers ? spec.headers() : {} });
    const json = await upstream.json();
    if (!upstream.ok) {
      console.error("Model list failed", provider, upstream.status, json?.error?.message);
      return { status: upstream.status, error: json?.error?.message || "Could not list models." };
    }
    return { status: 200, models: spec.extract(json).sort() };
  } catch (err) {
    console.error("Model list error", provider, err);
    return { status: 502, error: "Could not reach the provider." };
  }
}

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
  if (await guardRateLimit(req, res, {
    key: `gos:admin:${clientIp(req)}`,
    max: RATE_LIMIT_MAX,
    limitMessage: "Too many admin requests. Wait a few minutes and try again.",
    label: "Admin",
  })) return;

  const configError = adminConfigError();
  const action = req.body?.action;

  // Login is the only action reachable without a session, and it is still gated on
  // the console being configured at all.
  if (action === "login") {
    if (configError) return res.status(503).json({ error: configError });
    if (!passwordMatches(req.body?.password)) {
      // Deliberately not "wrong password" vs "no password" — one message for every
      // failure mode, so this cannot be used to probe configuration.
      return res.status(401).json({ error: "Incorrect password." });
    }
    res.setHeader("Set-Cookie", sessionCookie());
    return res.status(200).json({ ok: true });
  }

  if (action === "logout") {
    res.setHeader("Set-Cookie", clearedCookie());
    return res.status(200).json({ ok: true });
  }

  if (configError) return res.status(503).json({ error: configError });
  if (!hasValidSession(req)) return res.status(401).json({ error: "Not signed in." });

  switch (action) {
    case "getConfig": {
      // The registry travels to the console rather than being duplicated there, so
      // the picker is built from the same catalogue the proxy allowlists against
      // and the two cannot drift.
      const stored = await readRouting();
      const { routing, dropped } = resolveRouting(stored);
      return res.status(200).json({
        catalogue: MODEL_CATALOGUE,
        groups: FEATURE_GROUPS,
        defaults: DEFAULT_ROUTING,
        routing,
        // Which groups are explicitly assigned vs running on a default. Worth
        // distinguishing in the UI: "nobody has chosen" and "somebody chose the
        // same thing the default is" look identical otherwise.
        assigned: stored && typeof stored === "object" ? Object.keys(stored) : [],
        // Non-empty when a stored assignment named a model the catalogue no longer
        // has — the console should say that rather than silently showing a default.
        dropped,
        durable: routingIsDurable(),
      });
    }

    case "setRouting": {
      const invalid = validateRouting(req.body?.routing);
      if (invalid) return res.status(400).json({ error: invalid });

      // Merge over what is stored rather than replacing it, so saving one group's
      // card cannot blank the others.
      const stored = (await readRouting()) || {};
      const merged = { ...stored, ...req.body.routing };
      const result = await writeRouting(merged);
      if (!result.ok) return res.status(503).json({ error: result.message, durable: false });

      const { routing } = resolveRouting(merged);
      return res.status(200).json({ ok: true, routing, durable: true });
    }

    case "resetRouting": {
      const result = await writeRouting({});
      if (!result.ok) return res.status(503).json({ error: result.message, durable: false });
      return res.status(200).json({ ok: true, routing: { ...DEFAULT_ROUTING }, durable: true });
    }

    case "listModels": {
      const out = await fetchProviderModels(req.body?.provider);
      if (out.error) return res.status(out.status).json({ error: out.error });
      return res.status(200).json({ provider: req.body.provider, models: out.models });
    }

    case "verifyModel": {
      // The narrower question: is this specific catalogue ID actually offered? This
      // is what stops a plausible-looking model name reaching a call site — a
      // guessed ID fails here, in a console, rather than as a 404 the first time an
      // operator tries to generate something real.
      const entry = modelById(req.body?.model);
      if (!entry) return res.status(400).json({ error: `"${req.body?.model}" is not in the catalogue.` });
      if (!MODEL_LIST_ENDPOINTS[entry.provider]) {
        // Anthropic and the video providers have no list endpoint wired here. Say
        // so plainly rather than reporting an unverifiable model as verified.
        return res.status(200).json({ model: entry.id, verifiable: false });
      }
      const out = await fetchProviderModels(entry.provider);
      if (out.error) return res.status(out.status).json({ error: out.error });
      return res.status(200).json({
        model: entry.id,
        verifiable: true,
        present: out.models.includes(entry.id),
        available: out.models,
      });
    }

    default:
      return res.status(400).json({ error: "Unknown action." });
  }
}
