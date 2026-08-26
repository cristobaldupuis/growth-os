// Does spend actually reach the ledger?
//
// The bug: services/usage.js opens by saying "text, image and video all land in
// the same ledger", `usageForInitiative` returns a `byModality` breakdown, and the
// admin spend console reads KEY_USAGE — but only `postProxy` ever recorded a row,
// and postProxy is the TEXT path. Image and video costs were written to asset
// records instead, which the spend console does not read.
//
// So the console showed every fraction-of-a-cent text call and none of the
// four-cent frames or dollar-plus renders. It was not slightly incomplete; it was
// reporting the cheap half of the bill as the whole of it, in the direction that
// flatters. These tests assert the rows exist rather than trusting the comment.

import test from "node:test";
import assert from "node:assert/strict";
import { onUsage } from "./_shared.js";
import { callGenerateImage } from "./callGenerateImage.js";
import { callGenerateVideo, VIDEO_TIERS } from "./callGenerateVideo.js";
import { IMAGE_COST_USD } from "../assets.js";
import { usageForInitiative } from "../usage.js";

/** Run `fn` with fetch stubbed to `respond`, collecting every ledger row. */
async function collect(respond, fn) {
  const rows = [];
  onUsage(r => rows.push(r));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => respond(JSON.parse(opts.body));
  try { await fn(); } catch { /* the throw is often the case under test */ }
  finally { globalThis.fetch = realFetch; onUsage(null); }
  return rows;
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

// -- Image ---------------------------------------------------------------------

test("a generated image lands in the ledger at its catalogue rate", async () => {
  const rows = await collect(
    () => ok({ mimeType: "image/png", data: "aGk=" }),
    () => callGenerateImage({ prompt: "a frame", initiativeId: "e01" }),
  );
  assert.equal(rows.length, 1, "an image generation must produce exactly one ledger row");
  assert.equal(rows[0].modality, "image");
  assert.equal(rows[0].group, "image");
  assert.equal(rows[0].initiativeId, "e01");
  assert.equal(rows[0].costUsd, IMAGE_COST_USD["gemini-2.5-flash-image"]);
});

test("a refused image records the attempt with no cost", async () => {
  // A failed generation costs nothing, but attempts-with-no-cost is how an
  // operator notices the image proxy is misconfigured.
  const rows = await collect(
    () => ({ ok: false, status: 422, json: async () => ({ error: "declined" }) }),
    () => callGenerateImage({ prompt: "a frame", initiativeId: "e01" }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].costUsd, null, "a failure must not be priced as a success");
  assert.equal(rows[0].errorKind, "http_422");
});

test("an unpriced image model yields null rather than zero", async () => {
  // Zero would quietly understate the rollup. Null is visibly missing.
  const rows = await collect(
    () => ok({ mimeType: "image/png", data: "aGk=" }),
    () => callGenerateImage({ prompt: "x", model: "gemini-3-pro-image-preview", initiativeId: "e01" }),
  );
  assert.equal(rows[0].costUsd, IMAGE_COST_USD["gemini-3-pro-image-preview"]);
});

// -- Video ---------------------------------------------------------------------

test("a submitted render lands in the ledger before it finishes", async () => {
  // Recorded at submit, not completion: a submitted render is billed whether or
  // not anyone waits for it, so recording on success would understate spend by
  // exactly the renders that went wrong.
  const rows = await collect(
    () => ok({ jobId: "job_1", provider: "heygen", estimatedCostUsd: 0.51 }),
    () => callGenerateVideo({ script: "a thirty second read", tier: VIDEO_TIERS.STANDARD, initiativeId: "e01" }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].modality, "video");
  assert.equal(rows[0].costUsd, 0.51, "the proxy's own figure is preferred so one formula prices the job");
  assert.equal(rows[0].initiativeId, "e01");
});

test("a render falls back to the local estimate when the proxy cannot price it", async () => {
  const rows = await collect(
    () => ok({ jobId: "job_1", provider: "heygen" }),
    () => callGenerateVideo({ script: "a thirty second read", tier: VIDEO_TIERS.STANDARD, initiativeId: "e01" }),
  );
  assert.equal(typeof rows[0].costUsd, "number");
  assert.ok(rows[0].costUsd > 0);
});

test("a rejected submit records the attempt with no cost", async () => {
  const rows = await collect(
    () => ({ ok: false, status: 400, json: async () => ({ error: "needs an avatar image URL" }) }),
    () => callGenerateVideo({ script: "x", tier: VIDEO_TIERS.PREMIUM, initiativeId: "e01" }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].costUsd, null);
});

// -- The claim the module header makes ----------------------------------------

test("one initiative's spend adds up across all three modalities", async () => {
  const rows = [];
  onUsage(r => rows.push(r));
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ok({ mimeType: "image/png", data: "aGk=" });
    await callGenerateImage({ prompt: "frame", initiativeId: "e01" });
    globalThis.fetch = async () => ok({ jobId: "j", provider: "heygen", estimatedCostUsd: 0.51 });
    await callGenerateVideo({ script: "read", tier: VIDEO_TIERS.STANDARD, initiativeId: "e01" });
  } finally { globalThis.fetch = realFetch; onUsage(null); }

  const mine = usageForInitiative(rows, "e01");
  assert.equal(mine.calls, 2);
  assert.equal(mine.byModality.image, 0.04);
  assert.equal(mine.byModality.video, 0.51);
  // The whole point: the console can now cost a round of creative, not just the
  // text that briefed it.
  assert.equal(Math.round(mine.usd * 100) / 100, 0.55);
});

test("recording never breaks the call it is measuring", async () => {
  // Bookkeeping wrapped around the thing the user actually asked for.
  onUsage(() => { throw new Error("ledger is broken"); });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ok({ mimeType: "image/png", data: "aGk=" });
  try {
    const img = await callGenerateImage({ prompt: "frame", initiativeId: "e01" });
    assert.equal(img.data, "aGk=", "a broken ledger must not fail a working generation");
  } finally { globalThis.fetch = realFetch; onUsage(null); }
});
