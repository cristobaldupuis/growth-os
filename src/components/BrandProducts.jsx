import { useEffect, useState } from "react";
import { gG, gGh, gI } from "./styles.js";
import { getAssetUrl, isDurable, durableUnavailableReason } from "../services/assetStore.js";
import { importProductPage, keepProductImage } from "../services/productImport.js";
import { mkProduct, productsOf, priceLabel, MAX_PRODUCTS_PER_BRAND, MAX_PRODUCT_IMAGES } from "../services/products.js";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

const label = (t) => ({ fontSize: 10, color: t.textMuted, fontFamily: t.sans, display: "block", marginBottom: 5, letterSpacing: "0.05em" });
const small = (t) => ({ fontSize: 10.5, color: t.textMuted, fontFamily: t.serif, lineHeight: 1.5 });

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = () => reject(new Error("Could not read that file."));
  reader.readAsDataURL(file);
});

/**
 * A brand's products: what the image model is shown and what copy may claim.
 *
 * Two ways in. IMPORT reads the product's own page (the structured data every
 * store publishes for search engines) and shows what it found for review —
 * nothing is saved until the operator has seen every field and picked the
 * images. BY HAND is the same record typed in, for a store that blocks automated
 * reads or a product that has no page yet.
 */
export function BrandProducts({ t, brand, onChange }) {
  const products = productsOf(brand);
  const [urls, setUrls] = useState({});
  const [pageUrl, setPageUrl] = useState("");
  const [busy, setBusy] = useState("");          // "" | "import" | "save" | "manual" | product id (refetch)
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null);      // an imported product under review
  const [manual, setManual] = useState(null);    // {name, price, currency, description, url, files:[]}

  const keys = products.flatMap(p => (p.images || []).map(i => i.storageKey));
  useEffect(() => {
    let live = true;
    Promise.all(products.flatMap(p => p.images || []).map(async i => [i.storageKey, await getAssetUrl(i)])).then(pairs => {
      if (!live) return;
      const next = {};
      pairs.forEach(([k, u]) => { if (u) next[k] = u; });
      setUrls(next);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(keys)]);

  const full = products.length >= MAX_PRODUCTS_PER_BRAND;

  const runImport = async () => {
    setErr("");
    setBusy("import");
    try {
      const found = await importProductPage(pageUrl.trim());
      setDraft({
        url: found.url,
        name: found.name || "",
        price: found.price || "",
        currency: found.currency || "",
        description: found.description || "",
        sources: found.sources || [],
        candidates: found.images || [],
        picked: (found.images || []).slice(0, MAX_PRODUCT_IMAGES),
      });
    } catch (e) {
      setErr(e.message || "Could not read that page.");
    } finally { setBusy(""); }
  };

  const togglePick = (src) => setDraft(d => {
    const has = d.picked.includes(src);
    const picked = has ? d.picked.filter(x => x !== src) : [...d.picked, src].slice(-MAX_PRODUCT_IMAGES);
    return { ...d, picked };
  });

  const saveDraft = async () => {
    if (!draft) return;
    setErr("");
    setBusy("save");
    try {
      // One at a time: each is a server round trip that fetches from the brand's
      // CDN, and a failure on the second should keep the first rather than lose both.
      const images = [];
      for (const src of draft.picked) {
        try { images.push(await keepProductImage({ sourceUrl: src, name: draft.name })); }
        catch (e) { setErr(`One image could not be kept: ${e.message || "unreadable"}. The product was saved without it.`); }
      }
      onChange([...products, mkProduct({ ...draft, images, source: "page" })]);
      setDraft(null);
      setPageUrl("");
    } finally { setBusy(""); }
  };

  const saveManual = async () => {
    if (!manual?.name?.trim()) { setErr("A product needs a name."); return; }
    setErr("");
    setBusy("manual");
    try {
      const images = [];
      for (const file of (manual.files || []).slice(0, MAX_PRODUCT_IMAGES)) {
        if (!IMAGE_TYPES.includes(file.type)) { setErr("Product images must be PNG, JPEG or WebP."); continue; }
        if (file.size > MAX_UPLOAD_BYTES) { setErr(`${file.name} is over ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`); continue; }
        images.push(await keepProductImage({ image: { mimeType: file.type, data: await readFile(file) }, name: file.name }));
      }
      onChange([...products, mkProduct({ ...manual, images, source: "manual" })]);
      setManual(null);
    } catch (e) {
      setErr(e.message || "Could not add that product.");
    } finally { setBusy(""); }
  };

  // Bytes held for the session only are gone after a reload. An imported image
  // still knows where it came from, so it can be fetched again in one click
  // rather than re-importing the product and retyping its edits.
  const refetch = async (p) => {
    setErr("");
    setBusy(p.id);
    try {
      const images = [];
      for (const img of p.images || []) {
        if (urls[img.storageKey] || !img.sourceUrl) { images.push(img); continue; }
        images.push(await keepProductImage({ sourceUrl: img.sourceUrl, name: img.name }));
      }
      onChange(products.map(x => x.id === p.id ? { ...x, images } : x));
    } catch (e) {
      setErr(e.message || "Could not fetch the images again.");
    } finally { setBusy(""); }
  };

  const remove = (id) => onChange(products.filter(p => p.id !== id));

  const field = (value, onValue, placeholder, extra = {}) => (
    <input style={{ ...gI(t), fontSize: 11, ...extra }} value={value} placeholder={placeholder} onChange={e => onValue(e.target.value)} />
  );

  return (
    <div style={{ borderTop: "1px solid " + t.borderSoft, paddingTop: 9, marginTop: 2 }}>
      <label style={label(t)}>PRODUCTS ({products.length}/{MAX_PRODUCTS_PER_BRAND})</label>

      {products.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 9 }}>
          {products.map(p => {
            const missing = (p.images || []).some(i => !urls[i.storageKey]);
            return (
              <div key={p.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "8px 9px", background: t.surface, border: "1px solid " + t.border, borderRadius: 8 }}>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  {(p.images || []).length === 0 && (
                    <div style={{ width: 52, height: 52, borderRadius: 6, border: "1px dashed " + t.border, fontSize: 9, color: t.textMuted, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>no image</div>
                  )}
                  {(p.images || []).map(i => urls[i.storageKey] ? (
                    <img key={i.storageKey} src={urls[i.storageKey]} alt={p.name}
                      style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, border: "1px solid " + t.border, display: "block", background: "#fff" }} />
                  ) : (
                    <div key={i.storageKey} style={{ width: 52, height: 52, borderRadius: 6, border: "1px dashed " + t.border, fontSize: 9, color: t.textMuted, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 3, lineHeight: 1.25 }}>
                      bytes not held
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: t.textSub, fontFamily: t.sans }}>
                    {priceLabel(p) || "no price"} · {p.source === "page" ? "from its page" : "added by hand"}
                    {p.url && <> · <a href={p.url} target="_blank" rel="noreferrer" style={{ color: t.textSub }}>page</a></>}
                  </div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, marginTop: 3, maxHeight: 32, overflow: "hidden" }}>{p.description}</div>
                  )}
                  {missing && (p.images || []).some(i => i.sourceUrl) && (
                    <button onClick={() => refetch(p)} disabled={!!busy} style={{ ...gGh(t), padding: "3px 8px", fontSize: 10.5, marginTop: 5 }}>
                      {busy === p.id ? "Fetching…" : "Fetch images again"}
                    </button>
                  )}
                </div>
                <button onClick={() => remove(p.id)} aria-label={"Remove product " + p.name}
                  style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 13, padding: "0 3px" }}>&#10005;</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Import from the product's own page. */}
      {!draft && !manual && !full && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...gI(t), fontSize: 11, flex: "1 1 260px" }} value={pageUrl} onChange={e => setPageUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && pageUrl.trim()) runImport(); }}
            placeholder="https://yourstore.com/products/…" aria-label="Product page URL" />
          <button onClick={runImport} disabled={!pageUrl.trim() || !!busy} style={{ ...gG(t), padding: "5px 11px", fontSize: 11.5, opacity: !pageUrl.trim() || busy ? 0.6 : 1 }}>
            {busy === "import" ? "Reading page…" : "Import from page"}
          </button>
          <button onClick={() => { setErr(""); setManual({ name: "", price: "", currency: "", description: "", url: "", files: [] }); }}
            style={{ ...gGh(t), padding: "5px 10px", fontSize: 11 }}>Add by hand</button>
        </div>
      )}

      {/* Review what the page said before anything is kept. */}
      {draft && (
        <div style={{ padding: "10px 11px", background: t.surface, border: "1px solid " + t.border, borderRadius: 8, display: "grid", gap: 7 }}>
          <div style={{ ...small(t) }}>
            Read from {draft.sources.length ? draft.sources.join(" and ") : "the page"}. Check every field — what is saved here is what copy is allowed to claim about this product.
          </div>
          <div className="gos-grid-2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
            {field(draft.name, v => setDraft(d => ({ ...d, name: v })), "Product name")}
            {field(draft.price, v => setDraft(d => ({ ...d, price: v })), "Price")}
            {field(draft.currency, v => setDraft(d => ({ ...d, currency: v.toUpperCase() })), "Currency")}
          </div>
          <textarea style={{ ...gI(t), fontSize: 11, minHeight: 64, resize: "vertical" }} value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description" />
          <div>
            <div style={{ ...label(t), marginBottom: 4 }}>PICK UP TO {MAX_PRODUCT_IMAGES} IMAGES — THE CLEAREST SHOTS OF THE PRODUCT ITSELF</div>
            {draft.candidates.length === 0 ? (
              <div style={small(t)}>The page listed no images. Save the product and add images by hand, or upload them as a separate product.</div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {draft.candidates.map(src => {
                  const on = draft.picked.includes(src);
                  return (
                    <button key={src} onClick={() => togglePick(src)} aria-pressed={on}
                      style={{ padding: 0, borderRadius: 7, cursor: "pointer", border: "2px solid " + (on ? t.gold : t.border), background: "#fff", position: "relative" }}>
                      <img src={src} alt="" referrerPolicy="no-referrer" style={{ width: 70, height: 70, objectFit: "contain", display: "block", borderRadius: 5 }} />
                      {on && <span style={{ position: "absolute", top: 3, right: 3, background: t.gold, color: "#fff", borderRadius: 9, fontSize: 9, padding: "1px 5px", fontFamily: t.sans }}>{draft.picked.indexOf(src) + 1}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => setDraft(null)} style={{ ...gGh(t), padding: "5px 10px", fontSize: 11 }}>Cancel</button>
            <button onClick={saveDraft} disabled={!draft.name.trim() || !!busy} style={{ ...gG(t), padding: "5px 11px", fontSize: 11.5, opacity: !draft.name.trim() || busy ? 0.6 : 1 }}>
              {busy === "save" ? "Saving images…" : "Add product"}
            </button>
          </div>
        </div>
      )}

      {manual && (
        <div style={{ padding: "10px 11px", background: t.surface, border: "1px solid " + t.border, borderRadius: 8, display: "grid", gap: 7 }}>
          <div className="gos-grid-2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
            {field(manual.name, v => setManual(m => ({ ...m, name: v })), "Product name")}
            {field(manual.price, v => setManual(m => ({ ...m, price: v })), "Price")}
            {field(manual.currency, v => setManual(m => ({ ...m, currency: v.toUpperCase() })), "Currency")}
          </div>
          <textarea style={{ ...gI(t), fontSize: 11, minHeight: 56, resize: "vertical" }} value={manual.description}
            onChange={e => setManual(m => ({ ...m, description: e.target.value }))} placeholder="What the product is and what it does — only what the brand can stand behind" />
          {field(manual.url, v => setManual(m => ({ ...m, url: v })), "Product page URL (optional)")}
          <label style={{ fontSize: 11, color: t.textSub, fontFamily: t.sans }}>
            Images (up to {MAX_PRODUCT_IMAGES}, packshots work best):{" "}
            <input type="file" multiple accept={IMAGE_TYPES.join(",")}
              onChange={e => setManual(m => ({ ...m, files: [...(e.target.files || [])].slice(0, MAX_PRODUCT_IMAGES) }))} />
          </label>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => setManual(null)} style={{ ...gGh(t), padding: "5px 10px", fontSize: 11 }}>Cancel</button>
            <button onClick={saveManual} disabled={!!busy} style={{ ...gG(t), padding: "5px 11px", fontSize: 11.5, opacity: busy ? 0.6 : 1 }}>
              {busy === "manual" ? "Saving…" : "Add product"}
            </button>
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 7, fontSize: 11, color: t.red, lineHeight: 1.5 }}>{err}</div>}
      <div style={{ ...small(t), marginTop: 7 }}>
        Product images are sent to the image model as the product itself — it is told to keep the shape, colours and label exactly —
        and the facts above are the only product claims ad copy may make.
        {!isDurable() && ` Images are held for this tab only — ${durableUnavailableReason()}; imported ones can be fetched again after a reload.`}
      </div>
    </div>
  );
}
