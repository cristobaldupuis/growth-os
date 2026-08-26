// api/_textCall.js — making a text model call from the server.
//
// api/proxy.js does this for the BROWSER: it guards the request, validates its
// shape, then translates and dispatches it. The server-side debate worker needs
// only the last part — it built the body itself from code the browser cannot
// reach, so there is nothing to guard against and nobody to authorise.
//
// ## Why the worker does not just call /api/proxy
//
// It was the obvious first idea and it is wrong in three ways. The proxy
// authorises on Origin, which a server-to-server call does not have, so it would
// need a bypass — a second way past the control that bounds spend, which is
// exactly the thing not to add. It rate-limits per IP, and every step of a debate
// would arrive from the same Vercel egress address, so one debate would throttle
// itself against a ceiling meant for a person. And it would double the network
// hops for no gain, since both ends run in the same deployment.
//
// So the worker shares the TRANSLATION (api/_adapters.js) and skips the transport
// guard, which is the part that only exists because the browser is untrusted.
// The controls that actually bound spend are still in force and are enforced
// where they belong: the model allowlist and the token ceiling come from the same
// `validateBody` the proxy uses, called here on every body before it is sent.

import { validateBody } from "./proxy.js";
import { adapters } from "./_adapters.js";
import { modelById } from "../src/services/ai/registry.js";

/**
 * Send an Anthropic-shaped request body to whichever provider serves its model,
 * and return the response normalised back into the Anthropic shape.
 *
 * Throws on anything that is not a usable response. The debate worker turns that
 * into a failed run with the message attached, which is the only place it can be
 * seen — there is no operator watching a server-side step.
 */
export async function callText(body) {
  // The same validator the browser path uses. A worker-built body should never
  // fail it, and that is the point: if a prompt change ever pushes a request past
  // the token ceiling or names a model outside the allowlist, it fails here as a
  // clear error rather than as an upstream bill.
  const invalid = validateBody(body);
  if (invalid) throw new Error(`Refusing to send an invalid request: ${invalid}`);

  const entry = modelById(body.model);
  const adapter = adapters[entry?.provider];
  if (!adapter) throw new Error(`No provider adapter configured for model ${body.model}.`);

  const apiKey = process.env[adapter.keyVar];
  const configured = adapter.configured ? adapter.configured() : !!apiKey;
  if (!configured) {
    throw new Error(adapter.notConfiguredError ? adapter.notConfiguredError() : `${adapter.keyVar} is not configured.`);
  }

  const upstream = await fetch(adapter.endpoint(body.model), {
    method: "POST",
    headers: await adapter.headers(apiKey),
    body: JSON.stringify(adapter.toRequest(body)),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    const detail = adapter.errorOf(data) || `upstream returned ${upstream.status}`;
    console.error("Worker upstream error", entry.provider, upstream.status, detail);
    // Marked so the worker can tell a retryable failure from a permanent one: a
    // 429 or a 5xx is worth another attempt, a 400 never is.
    throw Object.assign(new Error(detail), { status: upstream.status, retryable: upstream.status === 429 || upstream.status >= 500 });
  }
  return adapter.fromResponse(data);
}
