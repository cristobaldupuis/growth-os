// api/_productPage.js — read a product page into the facts and images a brief needs.
//
// The image model has never seen the product. `buildImagePrompt` described it in
// one sentence (`brand.whatTheySell`) and attached style references it was told
// not to copy, so every frame showed an invented product: good enough for a mood
// board, useless as an ad. The fix is to give the model the real thing — a
// packshot — and the cheapest place to get one is the page the brand already
// publishes for it.
//
// So this module takes a product page URL and returns what that page states
// about the product: name, price, description, brand, and the images it shows.
// Three sources, tried in the order they are trustworthy:
//
//   1. JSON-LD `Product` — structured data the brand publishes for search
//      engines. Nearly every Shopify, WooCommerce and BigCommerce theme emits it.
//   2. Open Graph / product meta tags — what a link preview reads.
//   3. Shopify's `/products/<handle>.json` — asked for only when the page left a
//      gap (fewer than two images, no price, no description), because it lists
//      every product image rather than the one the theme chose to feature.
//
// Nothing here is inferred. A field the page does not state is returned empty,
// and the operator reviews and edits every field before it is saved — the same
// posture the brief takes towards claims: what the brand says is allowed, what
// sounds plausible is not.
//
// ## This fetches URLs a caller chose, so it is written as an SSRF surface
//
// A function that fetches arbitrary URLs from inside a cloud network is the
// classic way to read a metadata endpoint or an internal service. The defences
// are in layers, and each one is there because the one before it can be dodged:
//
//   - Only http/https, only ports 80 and 443, no credentials in the URL, no
//     `localhost`/`.local`/`.internal`/single-label hostnames.
//   - An IP literal must be public (the WHATWG parser has already turned
//     `http://2130706433/` and `0x7f.1` into `127.0.0.1` by this point).
//   - A hostname is resolved INSIDE the socket's own `lookup`, and every address
//     it resolves to must be public. Checking before the fetch and then letting
//     the fetch resolve again is the DNS-rebinding hole; checking at connect time
//     is not.
//   - Redirects are followed by hand, at most three, and every hop goes through
//     all of the above again.
//   - Every response is size-capped while it streams, decompressed size
//     included, and the whole exchange shares one deadline.
//
// What comes back is data for a form, never instructions: the page's text is
// shown to the operator and, once saved, quoted to the model inside a labelled
// block like every other brand field.

import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

// Product pages carry a lot of inline script. 2.5MB takes any real theme; a page
// bigger than that is not a product page this import should be reading.
export const PAGE_MAX_BYTES = 2.5 * 1024 * 1024;
// Raw bytes per image. Base64 of 3MB is 4MB, which keeps the response under the
// platform's 4.5MB function payload limit with room for the JSON around it.
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const JSON_MAX_BYTES = 1024 * 1024;
// One deadline shared by every hop of one fetch, redirects included.
export const FETCH_TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 3;
// Candidates offered to the operator, not images kept — they pick.
export const MAX_IMAGE_CANDIDATES = 8;
export const NAME_MAX = 160;
export const DESCRIPTION_MAX = 800;
export const BRAND_MAX = 80;

export const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

// Honest, and identifiable. A site that blocks unknown agents fails the import
// with its own status code, which the operator sees; pretending to be a browser
// to get past it is not this tool's call to make.
const USER_AGENT = "MarketersLab-ProductImport/1.0 (+product page import for ad briefs)";

/** An error whose message is safe to show the operator, with the status to send. */
export class ImportError extends Error {
  constructor(message, status = 502, upstreamStatus = null) {
    super(message);
    this.name = "ImportError";
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

// -- Address screening -----------------------------------------------------------

function ipv4Octets(ip) {
  const parts = String(ip).split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(p => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? octets : null;
}

/** True only for globally routable unicast IPv4. Everything reserved is refused. */
export function isPublicIPv4(ip) {
  const o = ipv4Octets(ip);
  if (!o) return false;
  const [a, b, c] = o;
  if (a === 0) return false;                              // "this network"
  if (a === 10) return false;                             // private
  if (a === 100 && b >= 64 && b <= 127) return false;     // carrier-grade NAT
  if (a === 127) return false;                            // loopback
  if (a === 169 && b === 254) return false;               // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;      // private
  if (a === 192 && b === 0 && c === 0) return false;      // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false;      // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false;    // 6to4 relay anycast
  if (a === 192 && b === 168) return false;               // private
  if (a === 198 && (b === 18 || b === 19)) return false;  // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;   // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false;    // TEST-NET-3
  if (a >= 224) return false;                             // multicast, reserved, broadcast
  return true;
}

/** Expand an IPv6 address into eight 16-bit groups, or null if it is not one. */
function ipv6Groups(ip) {
  let s = String(ip).toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (net.isIP(s) !== 6) return null;

  // An embedded dotted quad (::ffff:1.2.3.4) becomes its two hex groups.
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const o = ipv4Octets(tail);
    if (!o) return null;
    s = s.slice(0, lastColon + 1) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }

  const [head, rest] = s.split("::");
  const headGroups = head ? head.split(":") : [];
  const restGroups = rest != null && rest !== "" ? rest.split(":") : [];
  const missing = 8 - headGroups.length - restGroups.length;
  const groups = s.includes("::")
    ? [...headGroups, ...Array(missing).fill("0"), ...restGroups]
    : headGroups;
  if (groups.length !== 8) return null;
  return groups.map(g => parseInt(g || "0", 16));
}

const embeddedV4 = (g) => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;

/** True only for global unicast IPv6 (2000::/3), minus the ranges that tunnel to
 *  an arbitrary IPv4 address or are documentation-only. */
export function isPublicIPv6(ip) {
  const g = ipv6Groups(ip);
  if (!g) return false;
  // IPv4-mapped (::ffff:a.b.c.d): judge the IPv4 address it maps to.
  if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) return isPublicIPv4(embeddedV4(g));
  // Unspecified, loopback, and the deprecated IPv4-compatible range.
  if (g.slice(0, 6).every(x => x === 0)) return false;
  // NAT64 well-known prefix: judge the IPv4 address it translates to.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) return isPublicIPv4(embeddedV4(g));
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return false;   // local-use NAT64
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;               // documentation
  if (g[0] === 0x2001 && g[1] === 0x0000) return false;               // Teredo
  if (g[0] === 0x2002) return false;                                  // 6to4
  if (g[0] === 0x0100 && g.slice(1, 4).every(x => x === 0)) return false; // discard-only
  return (g[0] & 0xe000) === 0x2000;                                  // global unicast only
}

export function isPublicAddress(ip) {
  const v = net.isIP(String(ip).replace(/^\[|\]$/g, "").split("%")[0]);
  if (v === 4) return isPublicIPv4(ip);
  if (v === 6) return isPublicIPv6(ip);
  return false;
}

/**
 * Validate a URL before anything connects to it. Returns `{url}` or `{error}`.
 *
 * Exported so the tests assert the real rules; the DNS half of the screen lives
 * in `guardedLookup`, because a hostname can only be judged once it resolves.
 */
export function checkUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return { error: "Paste a product page URL." };
  if (text.length > 2048) return { error: "That URL is too long." };
  let url;
  try { url = new URL(text); } catch { return { error: "That is not a valid URL." }; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Only http and https pages can be imported." };
  if (url.username || url.password) return { error: "URLs with a username or password in them are refused." };
  if (url.port && url.port !== "80" && url.port !== "443") return { error: "Only standard web ports are allowed." };

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) return { error: "That URL has no host." };
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) return { error: "That address is private and cannot be fetched." };
    return { url };
  }
  if (host === "localhost" || /\.(localhost|local|internal|intranet|lan|home\.arpa)$/.test(host)) {
    return { error: "That hostname is private and cannot be fetched." };
  }
  if (!host.includes(".")) return { error: "That hostname is not a public web address." };
  return { url };
}

/**
 * `lookup` for the socket itself. Every address a hostname resolves to must be
 * public, checked at connect time — so a DNS answer that changes between a
 * pre-check and the fetch (rebinding) never reaches a private address.
 */
export function guardedLookup(hostname, options, callback) {
  const opts = typeof options === "object" && options ? options : {};
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) { callback(err); return; }
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length) { callback(Object.assign(new Error("No address"), { code: "ENOTFOUND" })); return; }
    if (list.some(a => !isPublicAddress(a.address))) {
      callback(Object.assign(new Error("Refusing to connect to a private address."), { code: "EPRIVATE" }));
      return;
    }
    if (opts.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

// -- Guarded fetch ---------------------------------------------------------------

/**
 * GET one URL with the screens above. Resolves `{url, status, contentType, body}`
 * where `url` is the final URL after redirects and `body` is a Buffer.
 *
 * Built on node:http(s) rather than `fetch`, because `fetch` offers no hook into
 * the socket's address resolution — and resolving at connect time is the point.
 */
export function fetchGuarded(rawUrl, { accept = "*/*", maxBytes = PAGE_MAX_BYTES, timeoutMs = FETCH_TIMEOUT_MS, redirectsLeft = MAX_REDIRECTS, deadline } = {}) {
  const checked = checkUrl(rawUrl);
  if (checked.error) return Promise.reject(new ImportError(checked.error, 400));
  const url = checked.url;
  const until = deadline || Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const remaining = until - Date.now();
    if (remaining <= 0) { reject(new ImportError("The page took too long to respond.", 504)); return; }
    let settled = false;
    const done = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };

    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en;q=0.9, *;q=0.5",
      },
      lookup: guardedLookup,
      // A fresh socket per request, so a kept-alive connection to an earlier
      // host can never carry a request whose address was not screened.
      agent: false,
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) { done(reject, new ImportError("That page redirected too many times.", 502)); return; }
        let next;
        try { next = new URL(res.headers.location, url).href; }
        catch { done(reject, new ImportError("That page redirected somewhere invalid.", 502)); return; }
        done(resolve, fetchGuarded(next, { accept, maxBytes, timeoutMs, redirectsLeft: redirectsLeft - 1, deadline: until }));
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        const message = status === 403 || status === 401
          ? `That site refused the request (${status}). Some stores block automated reads — add the product by hand instead.`
          : `That page answered ${status}.`;
        done(reject, new ImportError(message, 502, status));
        return;
      }

      const encoding = String(res.headers["content-encoding"] || "").toLowerCase();
      let stream = res;
      if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
      else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
      else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      let total = 0;
      stream.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy();
          stream.destroy();
          done(reject, new ImportError("That response is larger than this import accepts.", 413));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => done(resolve, {
        url: url.href,
        status,
        contentType: String(res.headers["content-type"] || "").toLowerCase(),
        body: Buffer.concat(chunks),
      }));
      stream.on("error", () => done(reject, new ImportError("Could not read that response.", 502)));
    });

    const timer = setTimeout(() => {
      req.destroy();
      done(reject, new ImportError("That page took too long to respond.", 504));
    }, remaining);

    req.on("error", (err) => {
      if (err?.code === "EPRIVATE") done(reject, new ImportError("That address is private and cannot be fetched.", 400));
      else if (err?.code === "ENOTFOUND") done(reject, new ImportError("That site could not be found.", 400));
      else done(reject, new ImportError("Could not reach that page.", 502));
    });
    req.end();
  });
}

// -- Text ------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", trade: "™", reg: "®", copy: "©",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", aacute: "á", ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä",
  deg: "°", times: "×", frac12: "½", middot: "·", bull: "•",
};

export function decodeEntities(s) {
  return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named != null ? named : m;
  });
}

export function stripTags(html) {
  return String(html == null ? "" : html)
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
}

/** Plain text of at most `max` characters, cut at a word where it can be. */
export function cleanText(s, max) {
  const text = decodeEntities(stripTags(decodeEntities(s)))
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!max || text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "") + "…";
}

// -- JSON-LD -----------------------------------------------------------------------

const LD_RE = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** Every JSON-LD block on the page that parses. A theme's broken block is skipped. */
export function extractJsonLd(html) {
  const out = [];
  for (const m of String(html || "").matchAll(LD_RE)) {
    const raw = m[1]
      .replace(/^\s*<!--/, "").replace(/-->\s*$/, "")
      .replace(/^\s*(\/\/)?\s*<!\[CDATA\[/, "").replace(/(\/\/)?\s*\]\]>\s*$/, "")
      .trim();
    if (!raw) continue;
    try { out.push(JSON.parse(raw)); continue; } catch { /* one light repair below */ }
    try {
      // Raw control characters inside strings and trailing commas are the two
      // mistakes themes actually make. Anything worse is skipped, not guessed at.
      // eslint-disable-next-line no-control-regex -- raw control characters are exactly what is being repaired
      out.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1")));
    } catch { /* unparseable block — the meta tags may still carry the product */ }
  }
  return out;
}

const typeNames = (node) => {
  const t = node && node["@type"];
  const list = Array.isArray(t) ? t : t ? [t] : [];
  return list.map(x => String(x).replace(/^.*[/#]/, ""));
};

/** Product nodes anywhere in the parsed blocks, including inside `@graph` and
 *  as a page's `mainEntity`. */
export function findProductNodes(docs) {
  const found = [];
  const seen = new Set();
  const visit = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(n => visit(n, depth + 1)); return; }
    const types = typeNames(node);
    if (types.some(t => t === "Product" || t === "ProductGroup" || t === "IndividualProduct")) found.push(node);
    if (node["@graph"]) visit(node["@graph"], depth + 1);
    if (node.mainEntity) visit(node.mainEntity, depth + 1);
  };
  (docs || []).forEach(d => visit(d, 0));
  return found;
}

function firstString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) { const s = firstString(x); if (s) return s; }
    return "";
  }
  if (typeof v === "object") return firstString(v.name ?? v["@value"] ?? "");
  return "";
}

function imageUrlsOf(v) {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(imageUrlsOf);
  if (typeof v === "object") return imageUrlsOf(v.url || v.contentUrl || v.image || "");
  return [];
}

/** The price a product node states, from its offers or its first priced variant. */
export function offerOf(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 3) return { price: "", currency: "" };
  const offers = node.offers ? (Array.isArray(node.offers) ? node.offers : [node.offers]) : [];
  for (const o of offers) {
    if (!o || typeof o !== "object") continue;
    const specs = Array.isArray(o.priceSpecification) ? o.priceSpecification : o.priceSpecification ? [o.priceSpecification] : [];
    const spec = specs.find(s => s && s.price != null) || null;
    const price = o.price ?? o.lowPrice ?? spec?.price ?? o.highPrice;
    const currency = o.priceCurrency || spec?.priceCurrency || "";
    if (price != null && price !== "") return { price: String(price), currency: String(currency || "") };
    if (o.offers) {
      const inner = offerOf(o, depth + 1);
      if (inner.price) return inner;
    }
  }
  if (Array.isArray(node.hasVariant)) {
    for (const v of node.hasVariant) {
      const inner = offerOf(v, depth + 1);
      if (inner.price) return inner;
    }
  }
  return { price: "", currency: "" };
}

// -- Meta tags ---------------------------------------------------------------------

const META_RE = /<meta\b([^>]*)>/gi;
const ATTR_RE = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** `property`/`name` → every `content` it was given, in page order. */
export function parseMetaTags(html) {
  const map = new Map();
  for (const m of String(html || "").matchAll(META_RE)) {
    const attrs = {};
    for (const a of m[1].matchAll(ATTR_RE)) attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? "";
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (!key || attrs.content == null) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(decodeEntities(attrs.content));
  }
  return map;
}

// -- Images ------------------------------------------------------------------------

/** An absolute http(s) URL for an image reference on a page, or null. */
export function normalizeImageUrl(src, base) {
  const s = String(src || "").trim();
  if (!s || s.startsWith("data:")) return null;
  let u;
  try { u = new URL(s.startsWith("//") ? "https:" + s : s, base); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return u.href;
}

/** Shopify's CDN resizes on request: ask for 1200px rather than fetching a
 *  4,000px hero shot whole. Other hosts are left as the page gave them. */
export function importSizedUrl(href) {
  let u;
  try { u = new URL(href); } catch { return href; }
  if (u.hostname === "cdn.shopify.com" || u.pathname.startsWith("/cdn/shop/")) {
    u.searchParams.set("width", "1200");
    return u.href;
  }
  return href;
}

// Two URLs for the same picture: Shopify's `?v=` cache-buster, a `_1024x1024`
// size suffix, and a `width=` parameter all name one image.
const imageKey = (href) => {
  try {
    const u = new URL(href);
    return (u.hostname + u.pathname).toLowerCase().replace(/_(\d+x\d*|\d*x\d+)(?=\.[a-z]+$)/, "");
  } catch { return String(href); }
};

export function dedupeImages(urls) {
  const seen = new Set();
  const out = [];
  for (const href of urls) {
    if (!href) continue;
    const k = imageKey(href);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(href);
  }
  return out;
}

// -- The page, read ---------------------------------------------------------------

/**
 * Read one product page's HTML. Returns every field it can find and says which
 * sources it found them in; a field nothing states is an empty string.
 */
export function parseProductPage(html, pageUrl) {
  const node = findProductNodes(extractJsonLd(html))[0] || null;
  const meta = parseMetaTags(html);
  const first = (k) => (meta.get(k) || [])[0] || "";
  const titleTag = (/<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(String(html || "")) || [])[1] || "";

  const ld = node ? {
    name: firstString(node.name),
    description: firstString(node.description),
    brand: firstString(node.brand),
    images: imageUrlsOf(node.image),
    ...offerOf(node),
  } : null;

  const images = dedupeImages([
    ...(ld?.images || []),
    ...(meta.get("og:image:secure_url") || []),
    ...(meta.get("og:image") || []),
    ...(meta.get("twitter:image") || []),
  ].map(src => normalizeImageUrl(src, pageUrl)).filter(Boolean));

  return {
    name: cleanText(ld?.name || first("og:title") || first("twitter:title") || titleTag, NAME_MAX),
    description: cleanText(ld?.description || first("og:description") || first("description") || "", DESCRIPTION_MAX),
    brand: cleanText(ld?.brand || first("product:brand") || first("og:site_name") || "", BRAND_MAX),
    price: String(ld?.price || first("product:price:amount") || first("og:price:amount") || "").trim(),
    currency: String(ld?.currency || first("product:price:currency") || first("og:price:currency") || "").trim().toUpperCase(),
    images,
    sources: [...(node ? ["structured data"] : []), ...(meta.has("og:title") || meta.has("og:image") ? ["link preview tags"] : [])],
  };
}

/** Shopify's JSON for a product page, when the URL has the `/products/<handle>` shape. */
export function shopifyJsonUrl(pageUrl) {
  let u;
  try { u = new URL(pageUrl); } catch { return null; }
  const m = /\/products\/([^/?#.]+)/.exec(u.pathname);
  return m ? `${u.origin}/products/${m[1]}.json` : null;
}

export function parseShopifyJson(json, pageUrl) {
  const p = json && json.product;
  if (!p || typeof p !== "object") return null;
  const variant = Array.isArray(p.variants) ? p.variants.find(v => v && v.price != null) : null;
  return {
    name: cleanText(p.title || "", NAME_MAX),
    description: cleanText(p.body_html || "", DESCRIPTION_MAX),
    brand: cleanText(p.vendor || "", BRAND_MAX),
    price: variant ? String(variant.price) : "",
    currency: "",
    images: (Array.isArray(p.images) ? p.images : []).map(i => normalizeImageUrl(i && i.src, pageUrl)).filter(Boolean),
  };
}

/** Fill `primary`'s empty fields from `fallback`; images from both, deduplicated. */
export function mergeProduct(primary, fallback) {
  if (!fallback) return primary;
  const pick = (k) => primary[k] || fallback[k] || "";
  return {
    ...primary,
    name: pick("name"),
    description: pick("description"),
    brand: pick("brand"),
    price: pick("price"),
    currency: pick("currency"),
    images: dedupeImages([...(primary.images || []), ...(fallback.images || [])]),
    sources: [...new Set([...(primary.sources || []), ...(fallback.sources || [])])],
  };
}

/**
 * The import itself. `fetchImpl` is injectable so the tests exercise the real
 * orchestration without a network.
 */
export async function importProductFromPage(rawUrl, { fetchImpl = fetchGuarded } = {}) {
  const page = await fetchImpl(rawUrl, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", maxBytes: PAGE_MAX_BYTES });
  if (!/html|xml/.test(page.contentType || "")) {
    throw new ImportError("That URL is not a web page. Paste the product's page, not an image or file.", 415);
  }
  let product = parseProductPage(page.body.toString("utf8"), page.url);

  const jsonUrl = shopifyJsonUrl(page.url);
  if (jsonUrl && (product.images.length < 2 || !product.price || !product.description)) {
    try {
      const res = await fetchImpl(jsonUrl, { accept: "application/json", maxBytes: JSON_MAX_BYTES });
      const shopify = parseShopifyJson(JSON.parse(res.body.toString("utf8")), page.url);
      if (shopify) product = mergeProduct(product, { ...shopify, sources: ["Shopify product data"] });
    } catch { /* the page alone is still an answer */ }
  }

  if (!product.name && product.images.length === 0) {
    throw new ImportError("No product was found on that page. Check it is a single product's page, or add the product by hand.", 422);
  }
  return {
    url: page.url,
    ...product,
    images: product.images.slice(0, MAX_IMAGE_CANDIDATES).map(importSizedUrl),
  };
}

/** The image type the bytes actually are, whatever the header claimed. */
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** One image, as base64, when its bytes are a PNG, JPEG or WebP. */
export async function fetchProductImage(rawUrl, { fetchImpl = fetchGuarded } = {}) {
  const res = await fetchImpl(rawUrl, { accept: "image/webp,image/jpeg,image/png;q=0.9", maxBytes: IMAGE_MAX_BYTES });
  const type = sniffImageType(res.body);
  if (!type || !IMAGE_MIME.has(type)) {
    throw new ImportError("Only PNG, JPEG or WebP images can be imported. Save the image and upload it instead.", 415);
  }
  return { mimeType: type, data: res.body.toString("base64") };
}
