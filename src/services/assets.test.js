import test from "node:test";
import assert from "node:assert/strict";
import {
  mkAssetRecord, variantKey, currentRoundAssets, costForInitiative,
  costByInitiative, orphanedAssets, assetsForInitiative, imageCostUsd,
} from "./assets.js";

const base = {
  kind: "image", initiativeId: "e01", initId: "NH-003", brandId: "default",
  briefVersion: 1, variantsVersion: 1, variantIdx: 0,
  adName: "Meta_Col_X_R3_F_Fitness_Gym_Pastry_Chocolate_35s-Raw_NH-003",
  model: "gemini-2.5-flash-image", costUsd: 0.04,
};

test("an asset must be attached to an initiative", () => {
  assert.throws(() => mkAssetRecord({ ...base, initiativeId: "" }), /attached to an initiative/);
});

test("an unknown asset kind is refused at the boundary", () => {
  assert.throws(() => mkAssetRecord({ ...base, kind: "audio" }), /Unknown asset kind/);
});

test("the ad name is carried on the record — it is the join key", () => {
  const a = mkAssetRecord(base);
  assert.equal(a.adName, base.adName);
  assert.equal(a.initId, "NH-003");
});

test("an asset whose variant produced no legal name records the empty string rather than omitting it", () => {
  // An asset with no legal ad name is exactly the one that will never be
  // attributable, so it has to stay queryable rather than becoming undefined.
  const a = mkAssetRecord({ ...base, adName: "" });
  assert.equal(a.adName, "");
  assert.ok("adName" in a);
});

test("ids do not collide inside one millisecond", () => {
  const ids = new Set(Array.from({ length: 50 }, () => mkAssetRecord(base).id));
  assert.equal(ids.size, 50);
});

test("versioning the variant key is what stops a regenerated round reusing a slot", () => {
  const v1 = variantKey({ initiativeId: "e01", briefVersion: 1, variantsVersion: 1, variantIdx: 0 });
  const v2 = variantKey({ initiativeId: "e01", briefVersion: 1, variantsVersion: 2, variantIdx: 0 });
  const v3 = variantKey({ initiativeId: "e01", briefVersion: 2, variantsVersion: 1, variantIdx: 0 });
  assert.notEqual(v1, v2);
  assert.notEqual(v1, v3);
  assert.equal(v1, variantKey({ initiativeId: "e01", briefVersion: 1, variantsVersion: 1, variantIdx: 0 }));
});

test("an old round stays in the ledger but is not current", () => {
  const old = mkAssetRecord({ ...base, variantsVersion: 1 });
  const now = mkAssetRecord({ ...base, variantsVersion: 2 });
  const all = [old, now];

  const current = currentRoundAssets(all, { initiativeId: "e01", briefVersion: 1, variantsVersion: 2 });
  assert.equal(current[0].image.id, now.id);
  // The old one is still recoverable — the whole point of versioning rather
  // than deleting.
  assert.equal(assetsForInitiative(all, "e01").length, 2);
});

test("regenerating a frame replaces it on screen while both stay in the ledger", async () => {
  const first = mkAssetRecord(base);
  await new Promise(r => setTimeout(r, 2));
  const second = mkAssetRecord(base);
  const current = currentRoundAssets([first, second], { initiativeId: "e01", briefVersion: 1, variantsVersion: 1 });
  assert.equal(current[0].image.id, second.id);
  assert.equal(costForInitiative([first, second], "e01").count, 2);
});

test("image and video occupy separate slots on the same variant", () => {
  const img = mkAssetRecord(base);
  const vid = mkAssetRecord({ ...base, kind: "video", costUsd: 0.51 });
  const current = currentRoundAssets([img, vid], { initiativeId: "e01", briefVersion: 1, variantsVersion: 1 });
  assert.equal(current[0].image.id, img.id);
  assert.equal(current[0].video.id, vid.id);
});

test("an unpriced asset is counted, not silently treated as free", () => {
  const priced   = mkAssetRecord({ ...base, costUsd: 0.04 });
  const unpriced = mkAssetRecord({ ...base, costUsd: null });
  const cost = costForInitiative([priced, unpriced], "e01");
  assert.equal(cost.usd, 0.04);
  assert.equal(cost.unpriced, 1);
  assert.equal(cost.count, 2);
});

test("cost splits by kind so a video round is distinguishable from a frame round", () => {
  const img = mkAssetRecord({ ...base, costUsd: 0.04 });
  const vid = mkAssetRecord({ ...base, kind: "video", costUsd: 0.51 });
  const { byKind } = costForInitiative([img, vid], "e01");
  assert.equal(byKind.image, 0.04);
  assert.equal(byKind.video, 0.51);
});

test("cost rolls up across initiatives without leaking between them", () => {
  const a = mkAssetRecord({ ...base, initiativeId: "e01", costUsd: 0.04 });
  const b = mkAssetRecord({ ...base, initiativeId: "e02", costUsd: 0.14 });
  const roll = costByInitiative([a, b]);
  assert.equal(roll.e01.usd, 0.04);
  assert.equal(roll.e02.usd, 0.14);
});

test("assets whose bytes are gone are surfaced rather than hidden", () => {
  const kept = mkAssetRecord({ ...base, bytesDurable: true });
  const lost = mkAssetRecord({ ...base, bytesDurable: false });
  const orphans = orphanedAssets([kept, lost]);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].id, lost.id);
});

test("an unknown image model has no price rather than a zero one", () => {
  assert.equal(imageCostUsd("gemini-2.5-flash-image"), 0.04);
  assert.equal(imageCostUsd("some-model-nobody-priced"), null);
});

test("the prompt and model are frozen onto the record", () => {
  // The prompt builder will change; the record has to keep meaning what it
  // meant. Same reasoning as the initiative prediction snapshot.
  const a = mkAssetRecord({ ...base, prompt: "a specific prompt", model: "gemini-3-pro-image-preview" });
  assert.equal(a.prompt, "a specific prompt");
  assert.equal(a.model, "gemini-3-pro-image-preview");
  assert.equal(a.costBasis, "estimate");
});
