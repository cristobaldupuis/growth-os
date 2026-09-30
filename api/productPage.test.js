// The product page import fetches URLs a caller chose, so most of what is
// asserted here is the screen, not the parse: every way a URL can name a private
// address has to be refused before a socket opens, or at the moment it does.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPublicIPv4, isPublicIPv6, isPublicAddress, checkUrl, guardedLookup, fetchGuarded, ImportError,
  extractJsonLd, findProductNodes, offerOf, parseMetaTags, parseProductPage, shopifyJsonUrl,
  parseShopifyJson, mergeProduct, importProductFromPage, fetchProductImage, sniffImageType,
  normalizeImageUrl, importSizedUrl, dedupeImages, cleanText, decodeEntities, MAX_IMAGE_CANDIDATES,
} from "./_productPage.js";

// -- Address screening -----------------------------------------------------------

test("private, loopback, link-local and reserved IPv4 ranges are not public", () => {
  for (const ip of [
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1", "192.168.1.1", "198.18.0.1",
    "198.51.100.7", "203.0.113.9", "224.0.0.1", "240.0.0.1", "255.255.255.255",
  ]) assert.equal(isPublicIPv4(ip), false, ip);
  for (const ip of ["8.8.8.8", "23.227.38.65", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1"]) {
    assert.equal(isPublicIPv4(ip), true, ip);
  }
  assert.equal(isPublicIPv4("999.1.1.1"), false);
  assert.equal(isPublicIPv4("1.2.3"), false);
});

test("IPv6 is public only in global unicast, and mapped addresses are judged by what they map to", () => {
  for (const ip of [
    "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "2001::1", "2002:7f00:1::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "64:ff9b:1::1", "::127.0.0.1",
  ]) assert.equal(isPublicIPv6(ip), false, ip);
  for (const ip of ["2606:4700::6810:84e5", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8", "64:ff9b::808:808"]) {
    assert.equal(isPublicIPv6(ip), true, ip);
  }
  assert.equal(isPublicAddress("[::1]"), false);
  assert.equal(isPublicAddress("not-an-ip"), false);
});

test("a URL is refused before any connection when it names a private target", () => {
  const refused = [
    "file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "gopher://example.com",
    "http://localhost/products/x", "http://LOCALHOST./", "http://shop.localhost/", "http://printer.local/",
    "http://metadata.google.internal/computeMetadata/v1/", "http://intranet/",
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://017700000001/",
    "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
    "http://10.0.0.5/", "https://shop.example.com:8443/products/x", "https://user:pass@shop.example.com/",
    "", "   ", "not a url",
  ];
  for (const url of refused) assert.ok(checkUrl(url).error, `should refuse ${JSON.stringify(url)}`);

  for (const url of [
    "https://shop.example.com/products/linen-throw",
    "http://shop.example.com:80/products/x",
    "https://www.example.co.uk/collections/all/products/x?variant=1",
    "https://8.8.8.8/",
  ]) assert.equal(checkUrl(url).error, undefined, url);
});

test("the socket's own lookup refuses a hostname that resolves to a private address", async () => {
  // `localhost` resolves from the hosts file, so this needs no network. It stands
  // in for the rebinding case: a public-looking name that answers with 127.0.0.1.
  const err = await new Promise(resolve => guardedLookup("localhost", {}, (e) => resolve(e)));
  assert.equal(err?.code, "EPRIVATE");
  const errAll = await new Promise(resolve => guardedLookup("localhost", { all: true }, (e) => resolve(e)));
  assert.equal(errAll?.code, "EPRIVATE");
});

test("fetchGuarded rejects a private URL with an operator-facing error and never connects", async () => {
  await assert.rejects(fetchGuarded("http://127.0.0.1:80/"), (e) => e instanceof ImportError && e.status === 400);
  await assert.rejects(fetchGuarded("http://169.254.169.254/"), /private/);
});

// -- Parsing ---------------------------------------------------------------------

const SHOPIFY_PAGE = `<!doctype html><html><head>
<title>Linen Throw &ndash; Northcove</title>
<meta property="og:title" content="Linen Throw">
<meta content="https://cdn.shopify.com/s/files/1/0001/products/throw-front.jpg?v=111" property="og:image">
<meta property='og:image:secure_url' content='https://cdn.shopify.com/s/files/1/0001/products/throw-front.jpg?v=111'>
<meta name="description" content="A stonewashed linen throw.">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"Linen Throw"},
  {"@type":"Product","name":"Linen Throw &amp; Blanket","description":"<p>Stonewashed European linen.</p><p>130 x 170 cm.</p>",
   "brand":{"@type":"Brand","name":"Northcove"},
   "image":["//cdn.shopify.com/s/files/1/0001/products/throw-front.jpg?v=111",{"@type":"ImageObject","url":"/cdn/shop/files/throw-detail.jpg"}],
   "offers":{"@type":"AggregateOffer","lowPrice":"129.00","highPrice":"149.00","priceCurrency":"CAD"}}
]}
</script>
<script type="application/ld+json">{ this is not json }</script>
</head><body></body></html>`;

test("JSON-LD is read from @graph, and a broken block does not stop the rest", () => {
  const docs = extractJsonLd(SHOPIFY_PAGE);
  assert.equal(docs.length, 1, "the broken block is skipped, not fatal");
  const nodes = findProductNodes(docs);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "Linen Throw &amp; Blanket");
});

test("a theme's control characters and trailing commas get one repair", () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Mug\n Set","offers":{"price":"24",},}</script>`;
  const [doc] = extractJsonLd(html);
  assert.equal(doc.name, "Mug  Set");
  assert.equal(offerOf(doc).price, "24");
});

test("the page is read into product fields with entities decoded and tags stripped", () => {
  const p = parseProductPage(SHOPIFY_PAGE, "https://northcove.example/products/linen-throw");
  assert.equal(p.name, "Linen Throw & Blanket");
  assert.match(p.description, /^Stonewashed European linen\.\n130 x 170 cm\.$/);
  assert.equal(p.brand, "Northcove");
  assert.equal(p.price, "129.00", "an aggregate offer reports its low price");
  assert.equal(p.currency, "CAD");
  assert.deepEqual(p.images, [
    "https://cdn.shopify.com/s/files/1/0001/products/throw-front.jpg?v=111",
    "https://northcove.example/cdn/shop/files/throw-detail.jpg",
  ], "protocol-relative and relative URLs resolve; the og:image duplicate is dropped");
  assert.deepEqual(p.sources, ["structured data", "link preview tags"]);
});

test("offers are read from a price specification and from a product group's variants", () => {
  assert.deepEqual(offerOf({ offers: { priceSpecification: { price: 19.5, priceCurrency: "USD" } } }), { price: "19.5", currency: "USD" });
  assert.deepEqual(offerOf({ "@type": "ProductGroup", hasVariant: [{ offers: {} }, { offers: [{ price: "42", priceCurrency: "GBP" }] }] }),
    { price: "42", currency: "GBP" });
  assert.deepEqual(offerOf({ name: "no offers" }), { price: "", currency: "" });
});

test("a page with only link-preview tags still yields a product", () => {
  const html = `<head><meta property="og:title" content="Ceramic Pour-Over"><meta property="og:image" content="/img/pourover.png">
    <meta property="product:price:amount" content="38.00"><meta property="product:price:currency" content="usd"></head>`;
  const p = parseProductPage(html, "https://brew.example/p/pour-over");
  assert.equal(p.name, "Ceramic Pour-Over");
  assert.equal(p.price, "38.00");
  assert.equal(p.currency, "USD");
  assert.deepEqual(p.images, ["https://brew.example/img/pourover.png"]);
  assert.deepEqual(p.sources, ["link preview tags"]);
});

test("meta tags are read whatever their attribute order and quoting", () => {
  const m = parseMetaTags(`<meta content="b" name="x"><meta name='y' content='c'><meta property=og:image content=/a.png>`);
  assert.deepEqual(m.get("x"), ["b"]);
  assert.deepEqual(m.get("y"), ["c"]);
  assert.deepEqual(m.get("og:image"), ["/a.png"]);
});

test("Shopify's product JSON is found from any /products/<handle> URL", () => {
  assert.equal(shopifyJsonUrl("https://s.example/products/linen-throw?variant=1"), "https://s.example/products/linen-throw.json");
  assert.equal(shopifyJsonUrl("https://s.example/collections/home/products/linen-throw"), "https://s.example/products/linen-throw.json");
  assert.equal(shopifyJsonUrl("https://s.example/en-ca/products/linen-throw#reviews"), "https://s.example/products/linen-throw.json");
  assert.equal(shopifyJsonUrl("https://s.example/pages/about"), null);
  assert.equal(shopifyJsonUrl("nope"), null);
});

test("Shopify's JSON is read, and merging only fills gaps", () => {
  const shopify = parseShopifyJson({ product: {
    title: "Linen Throw", body_html: "<p>Stonewashed.</p>", vendor: "Northcove",
    variants: [{ price: "129.00" }], images: [{ src: "https://cdn.shopify.com/a.jpg" }, { src: "//cdn.shopify.com/b.jpg" }],
  } }, "https://s.example/products/linen-throw");
  assert.equal(shopify.description, "Stonewashed.");
  assert.deepEqual(shopify.images, ["https://cdn.shopify.com/a.jpg", "https://cdn.shopify.com/b.jpg"]);

  const merged = mergeProduct(
    { name: "From the page", description: "", brand: "", price: "", currency: "CAD", images: ["https://cdn.shopify.com/a.jpg?v=2"], sources: ["structured data"] },
    { ...shopify, sources: ["Shopify product data"] });
  assert.equal(merged.name, "From the page", "the page's own field wins");
  assert.equal(merged.price, "129.00");
  assert.equal(merged.currency, "CAD");
  assert.deepEqual(merged.images, ["https://cdn.shopify.com/a.jpg?v=2", "https://cdn.shopify.com/b.jpg"], "a ?v= duplicate is one image");
  assert.deepEqual(merged.sources, ["structured data", "Shopify product data"]);
});

test("image URLs are normalised, resized on Shopify's CDN, and deduplicated", () => {
  assert.equal(normalizeImageUrl("data:image/png;base64,xx", "https://a.example/"), null);
  assert.equal(normalizeImageUrl("javascript:alert(1)", "https://a.example/"), null);
  assert.equal(normalizeImageUrl("img/x.png", "https://a.example/p/"), "https://a.example/p/img/x.png");
  assert.equal(importSizedUrl("https://cdn.shopify.com/s/files/x.jpg?v=1"), "https://cdn.shopify.com/s/files/x.jpg?v=1&width=1200");
  assert.equal(importSizedUrl("https://store.example/cdn/shop/files/x.jpg"), "https://store.example/cdn/shop/files/x.jpg?width=1200");
  assert.equal(importSizedUrl("https://images.example/x.jpg"), "https://images.example/x.jpg");
  assert.deepEqual(dedupeImages([
    "https://cdn.shopify.com/x.jpg?v=1", "https://cdn.shopify.com/x_1024x1024.jpg", "https://cdn.shopify.com/y.jpg",
  ]), ["https://cdn.shopify.com/x.jpg?v=1", "https://cdn.shopify.com/y.jpg"]);
});

test("text is cleaned and cut at a word", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry &#8217;s &#x2014; &bogus;"), "Tom & Jerry ’s — &bogus;");
  assert.equal(cleanText("<b>Hello</b>   world", 50), "Hello world");
  const long = cleanText("one two three four five six seven eight nine ten", 20);
  assert.ok(long.length <= 20, long);
  assert.match(long, /…$/);
});

// -- The import, orchestrated ----------------------------------------------------

const page = (html, url = "https://s.example/products/linen-throw", contentType = "text/html; charset=utf-8") =>
  ({ url, status: 200, contentType, body: Buffer.from(html) });

test("a thin page triggers Shopify's JSON, and the result is merged and capped", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith(".json")) {
      return page(JSON.stringify({ product: {
        title: "Linen Throw", body_html: "Stonewashed linen.", variants: [{ price: "129.00" }],
        images: Array.from({ length: 12 }, (_, i) => ({ src: `https://cdn.shopify.com/img-${i}.jpg` })),
      } }), url, "application/json");
    }
    return page(`<meta property="og:title" content="Linen Throw"><meta property="og:image" content="https://cdn.shopify.com/img-0.jpg">`);
  };
  const product = await importProductFromPage("https://s.example/products/linen-throw", { fetchImpl });
  assert.deepEqual(calls, ["https://s.example/products/linen-throw", "https://s.example/products/linen-throw.json"]);
  assert.equal(product.price, "129.00");
  assert.equal(product.description, "Stonewashed linen.");
  assert.equal(product.images.length, MAX_IMAGE_CANDIDATES);
  assert.ok(product.images.every(u => u.includes("width=1200")), "candidates are asked for at import size");
  assert.equal(product.url, "https://s.example/products/linen-throw");
});

test("a complete page does not make a second request", async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return page(SHOPIFY_PAGE); };
  await importProductFromPage("https://s.example/products/linen-throw", { fetchImpl });
  assert.equal(n, 1);
});

test("a failed Shopify JSON read still returns what the page said", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith(".json")) throw new ImportError("nope", 502);
    return page(`<meta property="og:title" content="Mug">`);
  };
  const product = await importProductFromPage("https://s.example/products/mug", { fetchImpl });
  assert.equal(product.name, "Mug");
});

test("a non-page and a page with no product are refused with reasons", async () => {
  await assert.rejects(
    importProductFromPage("https://s.example/x.png", { fetchImpl: async () => page("x", "https://s.example/x.png", "image/png") }),
    (e) => e.status === 415);
  await assert.rejects(
    importProductFromPage("https://s.example/about", { fetchImpl: async () => page("<p>About us</p>", "https://s.example/about") }),
    (e) => e.status === 422);
});

test("an image is accepted by what its bytes are, not by its header", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]);
  assert.equal(sniffImageType(webp), "image/webp");
  const ok = await fetchProductImage("https://cdn.example/a", {
    fetchImpl: async () => ({ url: "https://cdn.example/a", status: 200, contentType: "application/octet-stream", body: png }),
  });
  assert.equal(ok.mimeType, "image/png");
  assert.equal(Buffer.from(ok.data, "base64").length, png.length);
  await assert.rejects(fetchProductImage("https://cdn.example/b", {
    fetchImpl: async () => ({ url: "https://cdn.example/b", status: 200, contentType: "image/png", body: gif }),
  }), (e) => e.status === 415);
});
