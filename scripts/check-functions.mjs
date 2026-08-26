// Fails if this deployment would exceed its plan's Serverless Function limit.
//
// ## Why this exists
//
// Vercel turns every non-underscore file under `api/` into its own Serverless
// Function, and the Hobby plan allows twelve per deployment. Nothing in the repo
// made that count visible, so it was tracked by nobody and discovered the only
// way it can be: a deployment that had already passed lint, tests, contrast and
// build failed at the very end with "No more than 12 Serverless Functions can be
// added to a Deployment on the Hobby plan".
//
// The function that broke it was a TEST file. `api/guard.test.js` and six
// siblings were each being deployed as a live endpoint — they export no handler,
// so they did nothing there, but they counted. Six real endpoints plus six test
// files sat at exactly twelve, which meant the repo was one file away from a
// broken deploy for weeks with no way to know.
//
// `.vercelignore` now excludes `api/*.test.js`, which takes the real count to
// seven. This script is the part that keeps it true. It is deliberately the same
// shape as `check-contrast.mjs`: a property the build cannot see, asserted in CI,
// failing loudly in the pull request rather than quietly at deploy time.
//
// ## What it does NOT do
//
// It does not stop the count from growing. Seven endpoints is a fact about the
// architecture, and the right response to needing an eighth is to add one — this
// just makes sure the ceiling is hit in a pull request, with a message that says
// what to do, instead of in a deploy that has already been merged.

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const API_DIR = join(ROOT, "api");

// Hobby allows 12. Override for a plan with a different ceiling rather than
// editing this — the number is a billing fact, not a property of the code.
const LIMIT = Number(process.env.VERCEL_FUNCTION_LIMIT || 12);
// Warn while there is still room to plan. Hitting the ceiling in the pull
// request that needs the twelfth endpoint is too late to design around.
const WARN_AT = LIMIT - 2;

/**
 * The `.vercelignore` patterns that could exclude something under `api/`.
 *
 * Deliberately a small matcher rather than a gitignore implementation: the only
 * patterns that matter here are the ones aimed at `api/`, and a dependency to
 * parse a six-line file would be worse than the thing it replaced. Supports `*`
 * within a path segment, which is what `api/*.test.js` needs. Anything more
 * exotic in that file will simply not be understood, and the count will be
 * conservative — it will over-count, and fail early, rather than under-count and
 * let a broken deploy through.
 */
function ignorePatterns() {
  const file = join(ROOT, ".vercelignore");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && !l.startsWith("!"))
    .map(p => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$"));
}

/** Every file Vercel would turn into a function, relative to the repo root. */
function routableFiles(dir, patterns, out = []) {
  for (const entry of readdirSync(dir)) {
    // Vercel's own convention: an underscore prefix means "module, not route".
    // This is why _guard.js, _adapters.js and the rest have never counted.
    if (entry.startsWith("_") || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { routableFiles(full, patterns, out); continue; }
    if (!/\.(js|mjs|ts)$/.test(entry)) continue;
    const rel = relative(ROOT, full);
    if (patterns.some(re => re.test(rel))) continue;
    out.push(rel);
  }
  return out;
}

if (!existsSync(API_DIR)) {
  console.log("No api/ directory — nothing to count.");
  process.exit(0);
}

const files = routableFiles(API_DIR, ignorePatterns()).sort();
const count = files.length;

console.log(`Serverless Functions this deployment would create: ${count} of ${LIMIT}`);
for (const f of files) console.log(`  ${f}`);

if (count > LIMIT) {
  console.error(
    `\nFAIL: ${count} functions exceeds the ${LIMIT} this plan allows, so the deployment will be ` +
    `rejected after every other check has passed.\n\n` +
    `Three ways out, cheapest first:\n` +
    `  1. If any file listed above is not a real endpoint (a test, a fixture, a helper),\n` +
    `     exclude it in .vercelignore or rename it with a leading underscore.\n` +
    `  2. Fold an endpoint into a sibling behind an \`action\` discriminator — api/admin.js,\n` +
    `     api/video.js and api/debate.js already do this. Note the tradeoff recorded at the\n` +
    `     top of api/image.js: separate endpoints exist so each keeps a tight validator, and\n` +
    `     merging two means loosening whichever one loses the argument.\n` +
    `  3. Raise the plan, then set VERCEL_FUNCTION_LIMIT to the new ceiling.\n`
  );
  process.exit(1);
}

if (count >= WARN_AT) {
  console.warn(
    `\nWARNING: ${LIMIT - count} function slot${LIMIT - count === 1 ? "" : "s"} left. ` +
    `Worth deciding how the next endpoint fits before it is written, rather than in the ` +
    `pull request that needs it.`
  );
}
