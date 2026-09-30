// -- Reference images, sized for the wire -----------------------------------------
//
// Reference images are stored as uploaded (style references up to 1.5MB each)
// and sent with every generation. Five of them at full size is several megabytes
// of base64 — over the platform's 4.5MB function payload limit before the prompt
// is counted, so the request would fail at the edge with nothing logged. The
// model does not need 3,000px to read a palette or a label: ~1024px is what it
// works at anyway.
//
// So references are downscaled at SEND time, in the browser, and the stored
// original is left alone. Doing it here rather than at upload means references
// uploaded before this existed are covered too.
//
// JPEG over a white ground: a packshot with a transparent background would
// otherwise come out black, which is worse than white for every product.

export const REFERENCE_MAX_EDGE = 1024;
export const REFERENCE_QUALITY = 0.86;
// Under this and already small enough, the bytes are sent untouched.
export const REFERENCE_PASS_BYTES = 450 * 1024;

/** The size an image of `w` × `h` is drawn at to fit `maxEdge`. */
export function fitWithin(w, h, maxEdge) {
  const width = Math.max(1, Math.round(w || 0));
  const height = Math.max(1, Math.round(h || 0));
  if (width <= maxEdge && height <= maxEdge) return { w: width, h: height, scaled: false };
  const s = maxEdge / Math.max(width, height);
  return { w: Math.max(1, Math.round(width * s)), h: Math.max(1, Math.round(height * s)), scaled: true };
}

export const base64Bytes = (b64) => Math.floor(String(b64 || "").length * 3 / 4);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

/**
 * `{mimeType, data}` in, `{mimeType, data}` out, no larger than `maxEdge` on its
 * long side. Outside a browser (tests, server) it is the identity.
 */
export async function downscaleImage(image, { maxEdge = REFERENCE_MAX_EDGE, quality = REFERENCE_QUALITY, passBytes = REFERENCE_PASS_BYTES } = {}) {
  if (!image || !image.data) return image;
  if (typeof document === "undefined" || typeof Image === "undefined") return image;
  const img = await loadImage(`data:${image.mimeType};base64,${image.data}`);
  const { w, h, scaled } = fitWithin(img.naturalWidth, img.naturalHeight, maxEdge);
  if (!scaled && base64Bytes(image.data) <= passBytes) return image;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const url = canvas.toDataURL("image/jpeg", quality);
  return { mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
}
