// scripts/check-csp.mjs — does vercel.json's Content-Security-Policy still
// allow the inline code the built pages actually contain?
//
// ## Why this exists
//
// The CSP pins script-src to this origin plus a sha256 hash for each piece of
// inline code in index.html: the theme boot script that stops a flash of the
// wrong theme, and the `onload` that applies the web font without blocking
// paint. A hash is exact. Edit either by one character and the browser refuses
// to run it — silently, in production only, because Vite's dev server does not
// send the header. This runs against the BUILT pages (so it sees what Vite
// emits, not the source) and fails when a hash is missing, naming the one to add.
//
// Run after `npm run build`. Pass --print to see the hashes the pages need.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;
const PAGES = ["dist/index.html", "dist/admin.html"];

const sha = (s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

/** Every inline script body and inline event-handler value in a page. */
function inlineCode(html) {
  const found = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    found.push({ kind: "inline <script>", hash: sha(m[1]) });
  }
  for (const m of html.matchAll(/\son[a-z]+="([^"]*)"/g)) {
    found.push({ kind: "inline event handler", hash: sha(m[1]), handler: true });
  }
  return found;
}

const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const policies = vercel.headers
  .flatMap((h) => h.headers.map((x) => ({ source: h.source, ...x })))
  .filter((x) => x.key.toLowerCase() === "content-security-policy");
const pagePolicy = policies.find((p) => /script-src/.test(p.value));
if (!pagePolicy) {
  console.error("FAIL: no Content-Security-Policy with a script-src in vercel.json.");
  process.exit(1);
}

let failed = false;
for (const rel of PAGES) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) {
    console.error(`FAIL: ${rel} not found. Run \`npm run build\` first.`);
    process.exit(1);
  }
  for (const code of inlineCode(readFileSync(path, "utf8"))) {
    const ok = pagePolicy.value.includes(code.hash) && (!code.handler || pagePolicy.value.includes("'unsafe-hashes'"));
    if (process.argv.includes("--print") || !ok) console.log(`${ok ? "ok  " : "MISSING"} ${rel} ${code.kind}: ${code.hash}`);
    if (!ok) failed = true;
  }
}

if (failed) {
  console.error(
    "\nFAIL: a built page contains inline code the CSP in vercel.json does not allow, so the\n" +
    "browser will refuse to run it in production. Add the hash shown above to script-src\n" +
    "(an event handler also needs 'unsafe-hashes'), or move the code into a module.",
  );
  process.exit(1);
}
console.log("CSP allows every inline script and handler in the built pages.");
