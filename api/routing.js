// api/routing.js — which model serves which feature group.
//
// The app fetches this once at boot and hands it to applyRouting() in
// src/services/ai/models.js. Unauthenticated on purpose: it is the deployment's
// own configuration of itself, and every value in it is already visible in the
// `model` field of any AI request in the visitor's network tab. Gating it would
// protect nothing and would mean the app could not read its own settings without
// holding an admin session.
//
// What it deliberately does not return is anything else the admin endpoint knows —
// no catalogue, no capability table, no durability state, no list of which groups
// have been explicitly assigned. Just group → model id. The console gets the full
// picture from api/admin.js behind a session; this is the narrow read the app
// needs and nothing more.
//
// GET rather than POST because it is a plain read with no body — see the `methods`
// note in _guard.js for why that is an explicit opt-in rather than the default.

import { guardEntry } from "./_guard.js";
import { readRouting } from "./_routing.js";
import { resolveRouting } from "../src/services/ai/registry.js";

export default async function handler(req, res) {
  if (guardEntry(req, res, { maxBodyBytes: 1024, methods: ["GET"] })) return;

  // No rate limit. This is a single cheap read per page load that touches one
  // Redis key and cannot be made to cost anything upstream, so a limiter here
  // would only risk breaking boot for a legitimate visitor behind a shared IP.
  const stored = await readRouting();
  const { routing } = resolveRouting(stored);

  // A short cache is worth having: every visitor hits this once on load, the value
  // changes only when an operator saves in the console, and a stale minute means
  // one page load runs on the previous assignment. `must-revalidate` keeps a proxy
  // from serving it indefinitely if the function is briefly unavailable.
  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
  return res.status(200).json({ routing });
}
