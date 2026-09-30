// -- Product page import, client side ---------------------------------------------
//
// Two calls against api/asset.js (see api/_productPage.js for what the server
// reads and how it screens the URL):
//
//   importProductPage(url) — the page's product facts and up to eight candidate
//     images, as URLs. Nothing is stored; the operator reviews every field and
//     picks which images to keep.
//   fetchProductImage(url) — one chosen image's bytes, fetched by the server
//     because the brand's CDN will not answer a cross-origin read from here.
//
// The kept images are downscaled and stored through assetStore exactly like an
// uploaded reference, so a product added from a page and one added by hand are
// the same record.

import { AI_HEADERS, proxyError } from "./ai/_shared.js";
import { ASSET_PROXY_URL, putAsset } from "./assetStore.js";
import { downscaleImage } from "./imageResize.js";

async function post(body) {
  const resp = await fetch(ASSET_PROXY_URL, {
    method: "POST",
    headers: await AI_HEADERS(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await proxyError(resp));
  return resp.json();
}

/** `{url, name, description, brand, price, currency, images:[url], sources:[…]}`. */
export async function importProductPage(url) {
  const out = await post({ action: "importProduct", url });
  return out.product;
}

/** One image as `{mimeType, data}` (base64). */
export async function fetchProductImage(url) {
  return post({ action: "productImage", url });
}

/**
 * Fetch, downscale and store one product image. Returns the record a product
 * keeps: the storage key, whether the bytes survive a reload, and where the image
 * came from so it can be fetched again if they do not.
 */
export async function keepProductImage({ sourceUrl, image, name }) {
  const raw = image || await fetchProductImage(sourceUrl);
  // 1200px rather than the 1024px sent per frame: the stored copy is also what
  // the static-ad composer and the creator brief show.
  const sized = await downscaleImage(raw, { maxEdge: 1200, passBytes: 600 * 1024 });
  const stored = await putAsset({ mimeType: sized.mimeType, data: sized.data });
  return {
    storageKey: stored.storageKey,
    bytesDurable: stored.durable,
    mimeType: sized.mimeType,
    name: name || "",
    sourceUrl: sourceUrl || "",
    addedAt: new Date().toISOString(),
  };
}
