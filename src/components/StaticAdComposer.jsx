import { useEffect, useMemo, useRef, useState } from "react";
import { gG, gGh, gSl } from "./styles.js";
import { readAssetBytes } from "../services/assetStore.js";
import {
  STATIC_FORMATS, staticFormat, layoutStaticAd, renderStaticAd, AD_FONT, AD_WEIGHT,
} from "../services/staticAd.js";

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("Could not load the image."));
  img.src = src;
});

// Bytes, not the display URL: a signed storage URL is another origin, and drawing
// it would taint the canvas so nothing could be exported from it.
async function loadAssetImage(asset) {
  const bytes = asset ? await readAssetBytes(asset) : null;
  return bytes ? loadImage(`data:${bytes.mimeType};base64,${bytes.data}`) : null;
}

/**
 * A static ad from a key frame: the frame, the variant's approved words, and the
 * brand's logo and accent, composed in the browser.
 *
 * The headline is chosen from lines already approved — the headline field, the
 * hook, the alternative hooks — rather than typed here, so every word on the
 * finished ad is one that went through the review the rest of the studio does.
 */
export function StaticAdComposer({ t, frame, lines, cta, brand, disabled, onExport }) {
  const canvasRef = useRef(null);
  const [formatId, setFormatId] = useState("4:5");
  const [lineIdx, setLineIdx] = useState(0);
  const [images, setImages] = useState({ key: null, frame: null, logo: null });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const options = useMemo(() => (lines || []).filter(l => l && l.text), [lines]);
  const headline = options[Math.min(lineIdx, Math.max(0, options.length - 1))]?.text || "";
  const format = staticFormat(formatId);
  const accent = brand?.accentColor || "#111111";
  const loadKey = (frame?.id || "") + "|" + (brand?.logo?.storageKey || "");

  useEffect(() => {
    let live = true;
    Promise.all([loadAssetImage(frame), loadAssetImage(brand?.logo || null)])
      .then(([frameImg, logoImg]) => { if (live) setImages({ key: loadKey, frame: frameImg, logo: logoImg }); })
      .catch(e => { if (live) setErr(e.message || "Could not load the frame."); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  const ready = images.key === loadKey && images.frame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    let live = true;
    // The web font has to be loaded before measuring, or the layout is computed in
    // a fallback face and the real one overflows the lines it was fitted to.
    const fontReady = document.fonts?.load ? document.fonts.load(`${AD_WEIGHT} 64px Geist`).catch(() => null) : Promise.resolve();
    fontReady.then(() => {
      if (!live) return;
      canvas.width = format.w;
      canvas.height = format.h;
      const ctx = canvas.getContext("2d");
      const measureAt = (text, px) => { ctx.font = `${AD_WEIGHT} ${px}px ${AD_FONT}`; return ctx.measureText(text).width; };
      const layout = layoutStaticAd(format, { headline, cta, hasLogo: !!images.logo }, measureAt);
      renderStaticAd(ctx, layout, {
        image: images.frame, imageW: images.frame.naturalWidth, imageH: images.frame.naturalHeight,
        logo: images.logo, logoW: images.logo?.naturalWidth, logoH: images.logo?.naturalHeight,
        accent,
      });
      setTruncated(layout.headline.truncated);
    });
    return () => { live = false; };
  }, [ready, images, format, headline, cta, accent]);

  const exportAd = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setErr("");
    try {
      // JPEG at high quality: a 1080×1920 PNG of a photograph can pass the 4.5MB
      // a serverless function accepts, and storage goes through one.
      const url = canvas.toDataURL("image/jpeg", 0.92);
      await onExport({
        mimeType: "image/jpeg",
        data: url.slice(url.indexOf(",") + 1),
        dataUrl: url,
        format: format.id,
        headline, cta,
      });
    } catch (e) {
      setErr(e.message || "Could not export the ad.");
    } finally { setBusy(false); }
  };

  if (!frame) return null;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + t.borderSoft }}>
      <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <select value={formatId} onChange={e => setFormatId(e.target.value)} style={{ ...gSl(t), width: 150, padding: "5px 7px", fontSize: 11.5 }}
          aria-label="Static ad format">
          {STATIC_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {options.length > 1 && (
          <select value={lineIdx} onChange={e => setLineIdx(Number(e.target.value))} style={{ ...gSl(t), maxWidth: 260, padding: "5px 7px", fontSize: 11.5 }}
            aria-label="Headline line">
            {options.map((o, i) => <option key={i} value={i}>{o.label}: {o.text.slice(0, 40)}{o.text.length > 40 ? "…" : ""}</option>)}
          </select>
        )}
        <button onClick={exportAd} disabled={!ready || busy || disabled}
          style={{ ...(disabled ? gGh(t) : gG(t)), padding: "5px 11px", fontSize: 11.5, opacity: !ready || busy || disabled ? 0.55 : 1 }}
          title={disabled ? "Fix the naming slots first — a static ad ships under its ad name." : "Download the finished ad and freeze this set's names."}>
          {busy ? "Exporting…" : "Download static ad"}
        </button>
      </div>
      {!ready && !err && <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.serif }}>Loading the frame{brand?.logo ? " and logo" : ""}…</div>}
      <canvas ref={canvasRef} aria-label={`Static ad preview, ${format.label}`}
        style={{ display: ready ? "block" : "none", width: 220, height: Math.round(220 * format.h / format.w), borderRadius: 8, border: "1px solid " + t.border }} />
      {ready && truncated && (
        <div style={{ marginTop: 6, fontSize: 11, color: t.warn }}>This headline does not fit in three lines at the smallest size and was cut — pick a shorter line.</div>
      )}
      {!brand?.logo && (
        <div style={{ marginTop: 6, fontSize: 11, color: t.textMuted, fontFamily: t.serif }}>No logo on this brand — add one under Settings → Retailers to place it on the ad.</div>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 11.5, color: t.red }}>{err}</div>}
    </div>
  );
}
