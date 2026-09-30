// -- Static ads: the words are drawn in code, never by the image model ---------------
//
// Key frames were storyboard material: a text-free picture of the opening beat.
// Most of what a DTC brand actually runs on Meta is static — a picture with a
// headline, a button and a logo. The image model is barred from rendering text
// (it mangles typography, and any words it invents are an unreviewed claim on an
// asset that looks finished), so a static ad could not come out of the studio.
//
// It can now, without relaxing that rule: the frame stays text-free, and the
// headline, CTA and logo are drawn over it here, in code, from the variant's own
// reviewed copy and the brand's own logo. Typography is crisp because it is real
// type; every word on the ad is a word the operator approved.
//
// This module is the pure half — formats, safe zones, line wrapping, font sizing,
// contrast — plus a renderer that takes any 2D context, so the layout is asserted
// in tests with a measuring stub rather than a browser.

// Output sizes are the platforms' recommended upload sizes. Safe zones keep the
// words and logo out of where the platform draws its own interface: Stories and
// Reels cover the top ~14% with the profile row and the bottom ~20% or more with
// the reply bar, captions and CTA, so 9:16 keeps a wide margin at both ends.
export const STATIC_FORMATS = [
  { id: "4:5",  label: "4:5 · feed",          w: 1080, h: 1350, safeTop: 0.04, safeBottom: 0.05 },
  { id: "1:1",  label: "1:1 · square",        w: 1080, h: 1080, safeTop: 0.04, safeBottom: 0.05 },
  { id: "9:16", label: "9:16 · story / reel", w: 1080, h: 1920, safeTop: 0.14, safeBottom: 0.22 },
];

export const staticFormat = (id) => STATIC_FORMATS.find(f => f.id === id) || STATIC_FORMATS[0];

export const HEADLINE_MAX_LINES = 3;
// The app's own sans, which the page has already loaded; system fallbacks keep a
// composer that runs before the web font arrives from drawing in a serif.
export const AD_FONT = "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const AD_WEIGHT = 600;

/**
 * Greedy word wrap against a measuring function. A word wider than the line on
 * its own gets a line to itself (and overflows); the caller shrinks the type
 * until that stops happening.
 */
export function wrapText(text, maxWidth, measure) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach(word => {
    const next = line ? line + " " + word : word;
    if (!line || measure(next) <= maxWidth) { line = next; return; }
    lines.push(line);
    line = word;
  });
  if (line) lines.push(line);
  return lines;
}

/** Fit `text` into `maxLines` at the largest size from `start` down to `min`. */
export function fitHeadline(text, maxWidth, measureAt, { start, min, step = 4, maxLines = HEADLINE_MAX_LINES }) {
  for (let size = start; size >= min; size -= step) {
    const lines = wrapText(text, maxWidth, s => measureAt(s, size));
    const widest = Math.max(0, ...lines.map(l => measureAt(l, size)));
    if (lines.length <= maxLines && widest <= maxWidth) return { size, lines, truncated: false };
  }
  // Still too long at the smallest size: keep what fits and say so. The studio
  // shows `truncated` rather than shipping a headline that silently lost words.
  const lines = wrapText(text, maxWidth, s => measureAt(s, min));
  if (lines.length <= maxLines) return { size: min, lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] + "…";
  while (last.length > 1 && measureAt(last, min) > maxWidth) last = last.replace(/\s*\S+…$/, "…");
  kept[maxLines - 1] = last;
  return { size: min, lines: kept, truncated: true };
}

/**
 * Where everything goes on one format. `measureAt(text, px)` returns a width in
 * pixels at the ad font's weight. Returns boxes in output pixels.
 */
export function layoutStaticAd(format, { headline, cta, hasLogo }, measureAt) {
  const W = format.w, H = format.h;
  const margin = Math.round(W * 0.065);
  const top = Math.round(H * format.safeTop) + Math.round(margin * 0.6);
  const bottom = H - Math.round(H * format.safeBottom) - Math.round(margin * 0.6);
  const maxTextW = W - margin * 2;

  const head = fitHeadline(headline, maxTextW, measureAt, {
    start: Math.round(W * 0.074), min: Math.round(W * 0.042),
  });
  const lineH = Math.round(head.size * 1.14);

  const ctaText = String(cta || "").trim();
  const ctaSize = Math.round(W * 0.034);
  const padX = Math.round(ctaSize * 0.95);
  const padY = Math.round(ctaSize * 0.6);
  const ctaBox = ctaText ? {
    text: ctaText, size: ctaSize, padX,
    w: Math.min(maxTextW, Math.round(measureAt(ctaText, ctaSize)) + padX * 2),
    h: ctaSize + padY * 2,
    x: margin,
  } : null;
  if (ctaBox) ctaBox.y = bottom - ctaBox.h;

  const gap = Math.round(W * 0.032);
  const headBottom = ctaBox ? ctaBox.y - gap : bottom;
  const headTop = headBottom - head.lines.length * lineH;

  return {
    W, H, margin,
    headline: { ...head, lineH, x: margin, top: headTop },
    cta: ctaBox,
    logo: hasLogo ? { x: margin, y: top, maxW: Math.round(W * 0.28), maxH: Math.round(W * 0.085) } : null,
    // A dark gradient behind the words, starting well above the first line so the
    // type never sits on the brightest part of the photograph.
    scrimTop: Math.max(0, headTop - Math.round(margin * 2)),
    // And a lighter one behind the logo, only when there is one.
    topScrimBottom: hasLogo ? Math.min(H, top + Math.round(W * 0.085) + margin * 2) : 0,
  };
}

/** The source rectangle that covers `W`×`H` from an image of `iw`×`ih`, centred. */
export function coverRect(iw, ih, W, H) {
  const scale = Math.max(W / iw, H / ih);
  const sw = W / scale, sh = H / scale;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
}

// WCAG relative luminance — the same arithmetic scripts/check-contrast.mjs holds
// the app to, used here to pick the CTA's text colour for any accent.
const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** White or near-black, whichever reads better on `hex`. */
export function textOn(hex) {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#111111") ? "#ffffff" : "#111111";
}

/**
 * Draw one static ad onto a 2D context sized `layout.W`×`layout.H`.
 * `image` and `logo` are anything drawImage accepts, with natural sizes given.
 */
export function renderStaticAd(ctx, layout, { image, imageW, imageH, logo, logoW, logoH, accent = "#111111" }) {
  const { W, H } = layout;
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, W, H);
  if (image && imageW && imageH) {
    const r = coverRect(imageW, imageH, W, H);
    ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
  }

  const bottomScrim = ctx.createLinearGradient(0, layout.scrimTop, 0, H);
  bottomScrim.addColorStop(0, "rgba(0,0,0,0)");
  bottomScrim.addColorStop(0.45, "rgba(0,0,0,0.45)");
  bottomScrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, layout.scrimTop, W, H - layout.scrimTop);

  if (layout.logo && logo && logoW && logoH) {
    const topScrim = ctx.createLinearGradient(0, 0, 0, layout.topScrimBottom);
    topScrim.addColorStop(0, "rgba(0,0,0,0.38)");
    topScrim.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, W, layout.topScrimBottom);
    const s = Math.min(layout.logo.maxW / logoW, layout.logo.maxH / logoH, 1.5);
    ctx.drawImage(logo, layout.logo.x, layout.logo.y, Math.round(logoW * s), Math.round(logoH * s));
  }

  const h = layout.headline;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  ctx.font = `${AD_WEIGHT} ${h.size}px ${AD_FONT}`;
  h.lines.forEach((line, i) => ctx.fillText(line, h.x, h.top + i * h.lineH));

  if (layout.cta) {
    const c = layout.cta;
    const radius = Math.round(c.h / 2);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(c.x + radius, c.y);
    ctx.arcTo(c.x + c.w, c.y, c.x + c.w, c.y + c.h, radius);
    ctx.arcTo(c.x + c.w, c.y + c.h, c.x, c.y + c.h, radius);
    ctx.arcTo(c.x, c.y + c.h, c.x, c.y, radius);
    ctx.arcTo(c.x, c.y, c.x + c.w, c.y, radius);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = textOn(accent);
    ctx.textBaseline = "middle";
    ctx.font = `${AD_WEIGHT} ${c.size}px ${AD_FONT}`;
    ctx.fillText(c.text, c.x + c.padX, c.y + c.h / 2);
  }
}
