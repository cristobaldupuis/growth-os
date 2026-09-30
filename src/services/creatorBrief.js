// -- The handoff: what a creator or designer is actually sent ----------------------
//
// The studio's only export was a CSV of labels, hooks, CTAs and names — and not
// the beats, which are what a creator shoots from. So the real handoff happened
// in a doc someone retyped, and the retyping is where the ad name got changed and
// the claim nobody verified got added back.
//
// Two exports now, both built from the frozen set so they say exactly what was
// shipped:
//
//   buildCreatorBriefHtml — one printable page per variant: the exact ad name to
//     deliver under, the hook and alternatives, beats with on-screen text, the
//     copy, the claims NOT to make, and the customer quotes the variant borrows
//     from. Self-contained HTML (print it to PDF, or send it as a file) because a
//     creator should not need a login to read their brief.
//   buildVariantCSV — every field, for Ads Manager and spreadsheets.
//
// Everything in both is escaped: the text came from a model, and a creator brief
// is a file someone opens.

import { beatsOf, copySpecFor } from "./creativeCopy.js";
import { priceLabel } from "./products.js";
import { citedSnippets } from "./voc.js";

export const esc = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const para = (label, value) => value ? `<p><span class="k">${esc(label)}</span> ${esc(value)}</p>` : "";

/**
 * @param rows  [{variant, adName, levelNames:{label:name}}] in set order
 */
export function buildCreatorBriefHtml({ initiative, brief, set, rows, brand, product, channel, vocSnippets, generatedAt = new Date() }) {
  const copySpec = copySpecFor(channel);
  const title = `Creator brief — ${initiative?.title || "untitled"}${initiative?.initId ? " (" + initiative.initId + ")" : ""}`;
  const dontSay = [
    ...(brief?.claimsToVerify || []),
    "Any result, number, ingredient, certification or comparison that is not written in this brief",
  ];

  const header = `
    <header>
      <h1>${esc(title)}</h1>
      <p class="meta">${esc(brand?.name || "")}${product ? " · " + esc(product.name) + (priceLabel(product) ? " · " + esc(priceLabel(product)) : "") : ""}
        · ${esc(channel)} · brief v${esc(set?.briefVersion ?? "")}, set v${esc(set?.version ?? "")}
        · ${esc(generatedAt.toISOString().slice(0, 10))}</p>
    </header>
    <section class="round">
      <h2>The round</h2>
      ${para("Insight", brief?.insight)}
      ${para("Promise", brief?.promise)}
      ${(brief?.proof || []).length ? `<p><span class="k">Show on screen</span></p><ul>${brief.proof.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      ${para("Format", brief?.formatGuidance)}
      ${brand?.voice ? `<p><span class="k">Voice</span></p><p class="voice">${esc(brand.voice).replace(/\n/g, "<br>")}</p>` : ""}
      <div class="dont"><span class="k">Do not say or show</span><ul>${dontSay.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>
      ${product?.url ? `<p class="meta">Product page: ${esc(product.url)}</p>` : ""}
    </section>`;

  const variantPages = (rows || []).map(({ variant: v, adName, levelNames }, i) => {
    const beats = beatsOf(v);
    const quotes = citedSnippets(vocSnippets, v.vocCited);
    return `
    <section class="variant">
      <h2>${i + 1}. ${esc(v.label || "Variant")}</h2>
      <p class="meta">Angle ${esc(v.angleSlug || "")}${v.varies ? " · varies: " + esc(v.varies) : ""}</p>
      <div class="name"><span class="k">Deliver under exactly this ad name</span><code>${esc(adName || "(no name — fix the naming slots before shipping)")}</code>
        ${Object.entries(levelNames || {}).filter(([, n]) => n && n !== adName).map(([lvl, n]) => `<div class="lvl">${esc(lvl)}: <code>${esc(n)}</code></div>`).join("")}
      </div>
      <p><span class="k">Hook</span> “${esc(v.hook)}”</p>
      ${(v.altHooks || []).length ? `<p><span class="k">Also shoot these openings</span></p><ol class="alts">${v.altHooks.map(h => `<li>“${esc(h)}”</li>`).join("")}</ol>` : ""}
      ${beats.length ? `<table><thead><tr><th>Time</th><th>On screen</th><th>Voiceover</th><th>Text on screen</th></tr></thead><tbody>
        ${beats.map(b => `<tr><td>${esc(b.time)}</td><td>${esc(b.visual)}</td><td>${esc(b.voiceover)}</td><td>${esc(b.onScreen)}</td></tr>`).join("")}
      </tbody></table>` : ""}
      ${copySpec.some(c => v.copy?.[c.key]) ? `<p><span class="k">Ad copy</span></p><dl>${copySpec.filter(c => v.copy?.[c.key]).map(c => `<dt>${esc(c.label)}</dt><dd>${esc(v.copy[c.key])}</dd>`).join("")}</dl>` : ""}
      ${para("Call to action", v.cta)}
      ${quotes.length ? `<p><span class="k">What customers actually said</span></p><ul class="quotes">${quotes.map(q => `<li>${esc(q.text)}</li>`).join("")}</ul>` : ""}
      ${para("Why this could win", v.rationale)}
    </section>`;
  }).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a;max-width:820px;margin:32px auto;padding:0 20px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:0 0 8px}
  .meta{color:#666;font-size:12.5px;margin:0 0 6px}
  .k{font-weight:600;display:inline-block;margin-right:4px}
  section{border-top:1px solid #ddd;padding-top:18px;margin-top:22px}
  .variant{page-break-before:always}
  .name{background:#f6f4ee;border:1px solid #e3dccb;border-radius:8px;padding:10px 12px;margin:10px 0}
  .name code{display:block;font:12.5px/1.4 ui-monospace,Menlo,monospace;word-break:break-all;margin-top:4px}
  .name .lvl{font-size:12px;color:#555;margin-top:6px}
  .dont{background:#fff4f2;border:1px solid #f2c7bf;border-radius:8px;padding:10px 12px;margin:10px 0}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#fafafa;font-weight:600}
  dl{display:grid;grid-template-columns:130px 1fr;gap:4px 10px;margin:6px 0}
  dt{font-weight:600;color:#444} dd{margin:0}
  .quotes li{font-style:italic;color:#333}
  .voice{white-space:normal;color:#333}
  @media print{body{margin:0}section{break-inside:avoid-page}}
</style></head>
<body>${header}${variantPages}
<footer class="meta" style="margin-top:28px">Names in this brief are frozen. Delivering under a different name disconnects the ad's results from the experiment it was made for.</footer>
</body></html>`;
}

const csvCell = (v) => {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Every field of a set as CSV. `rows` are `[{variant, values, levelNames}]`
 * where `values` are the resolved naming slots and `levelNames` maps a level key
 * to its assembled name.
 */
export function buildVariantCSV({ rows, adTemplate, levels, channel }) {
  const copySpec = copySpecFor(channel);
  const cols = [
    "label", "angleSlug", "varies", "hook", "altHooks",
    ...copySpec.map(c => c.key),
    "cta", "beats", "rationale", "vocCited",
    ...adTemplate.map(d => d.key),
    ...levels.map(l => l.key + "Name"),
  ];
  const lines = (rows || []).map(({ variant: v, values, levelNames }) => [
    v.label, v.angleSlug, v.varies, v.hook, (v.altHooks || []).join(" | "),
    ...copySpec.map(c => v.copy?.[c.key] || ""),
    v.cta,
    beatsOf(v).map(b => [b.time, b.visual, b.voiceover && `VO: ${b.voiceover}`, b.onScreen && `TEXT: ${b.onScreen}`].filter(Boolean).join(" — ")).join(" || "),
    v.rationale, (v.vocCited || []).join(" "),
    ...adTemplate.map(d => values?.[d.key] || ""),
    ...levels.map(l => levelNames?.[l.key] || ""),
  ].map(csvCell).join(","));
  return [cols.join(","), ...lines].join("\n");
}
