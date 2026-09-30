// -- Products: the thing the ad is actually selling ------------------------------
//
// A brand used to be seven text fields. The creative brief reasoned about "what
// they sell" from one sentence, and the image model drew a product from that
// sentence — so every generated frame showed an invented product. A product
// record fixes both halves:
//
//   - its IMAGES go to the image model as a product reference, sent before the
//     style references, with an instruction to keep the product exactly as shown
//     (see buildImagePrompt);
//   - its FACTS — name, price, description — go to the brief and the variants as
//     the product claims copy is allowed to make, next to the brand brief.
//
// A product is usually imported from its own page (api/_productPage.js reads the
// structured data the store already publishes for search engines) and always
// reviewed before it is saved. Bytes go through assetStore like every other image;
// only storage keys live here, for the same quota reason as brand references.
//
// Products hang off the brand rather than the initiative because the same bottle
// appears in many experiments; the creative record names which product a round is
// about (`record.productId`).

export const MAX_PRODUCTS_PER_BRAND = 12;
// Sent with every frame, so capped like style references are: two views (front
// and detail, or product and product-in-hand) carry the object; a third adds cost
// on every generation for little the model can use.
export const MAX_PRODUCT_IMAGES = 2;
export const PRODUCT_DESCRIPTION_MAX = 800;

const clip = (s, n) => {
  const t = String(s == null ? "" : s).trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/** A new product record. Unknown fields are dropped; text is bounded. */
export function mkProduct(fields = {}, now = new Date()) {
  return {
    id: fields.id || "prod-" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
    name: clip(fields.name, 160),
    price: clip(fields.price, 24),
    currency: clip(fields.currency, 8).toUpperCase(),
    description: clip(fields.description, PRODUCT_DESCRIPTION_MAX),
    url: clip(fields.url, 2048),
    source: fields.source === "page" ? "page" : "manual",
    images: (fields.images || []).slice(0, MAX_PRODUCT_IMAGES),
    importedAt: fields.importedAt || now.toISOString(),
  };
}

export const productsOf = (brand) => (brand && Array.isArray(brand.products) ? brand.products : []);

export function productById(brand, id) {
  if (!id) return null;
  return productsOf(brand).find(p => p.id === id) || null;
}

/**
 * The product a creative round is about. An explicit choice wins; with none
 * made, a brand with exactly one product uses it — the common single-SKU case
 * should not need a click — and a brand with several uses none rather than
 * guessing which one the hypothesis meant.
 */
export function productForRound(brand, record) {
  if (record && record.productId === "none") return null;
  const chosen = productById(brand, record && record.productId);
  if (chosen) return chosen;
  const all = productsOf(brand);
  return all.length === 1 ? all[0] : null;
}

/** A price as the page stated it, with its currency when one was given. */
export function priceLabel(product) {
  if (!product || !product.price) return "";
  return product.currency ? `${product.price} ${product.currency}` : String(product.price);
}

/**
 * The product as prompt text. Quoted as the brand's own statement about it —
 * which is what it is, since it came from the product page and was reviewed —
 * so the model may use these facts in copy and must not add to them.
 */
export function formatProductBlock(product) {
  if (!product) return "PRODUCT: none selected — write about the brand's range, and do not name a price or a specific product feature that the brand brief does not state.";
  const lines = [
    "PRODUCT (the brand's own product page — these facts may be used in copy; nothing beyond them may be claimed about the product):",
    "  Name: " + (product.name || "not stated"),
  ];
  const price = priceLabel(product);
  lines.push("  Price: " + (price || "not stated — do not quote one"));
  if (product.description) lines.push("  Description: " + product.description.replace(/\s*\n\s*/g, " / "));
  if (product.url) lines.push("  Page: " + product.url);
  return lines.join("\n");
}
