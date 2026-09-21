// scripts/check-supabase.mjs — has every live migration actually been run?
//
// ## Why this exists
//
// Migrations in this repo are pasted into the Supabase SQL editor by hand
// (see README.md) — there is no `supabase db push` step CI runs, so "the file
// is in the repo" and "the objects exist in the project" can drift silently.
// api/_guard.js's rate limiter already demonstrates the failure mode: it fails
// CLOSED and reads as "AI is temporarily unavailable" with no mention of a
// missing table. This script answers the question directly, against the real
// project, instead of waiting to find out from a 503 in production.
//
// ## What it checks, and how
//
// One request to PostgREST's own root (`GET /rest/v1/`) returns an OpenAPI
// document listing every table and RPC function the connecting key can see —
// tables as `/name`, functions as `/rpc/name`. That single response is
// compared against the inventory below, taken directly from each migration
// file's own `create table` / `create function` statements. The one thing
// PostgREST's root cannot answer is the storage bucket 0002_assets.sql
// creates (Storage is a separate API), so that one check reuses
// `bucketReachable` from api/asset.js rather than a second implementation.
//
// This is a live network check against a real project, unlike
// check-contrast.mjs and check-functions.mjs, which are pure static analysis.
// It is deliberately NOT part of `npm run verify` for that reason — CI has no
// Supabase credentials and shouldn't need them to lint, test or build — and is
// run by hand, whenever "did I actually apply that migration" is the question.
//
// ## Credentials
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY (or the pre-rename
// SUPABASE_SERVICE_KEY) from the environment, exactly as api/_supabase.js
// does. If they are already exported, nothing else is needed. Otherwise this
// looks for `.env.local` then `.env` in the repo root — the files `vercel env
// pull` writes — and fills in only the variables not already set, without
// pulling in a dotenv dependency for a few KEY=VALUE lines.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function loadDotEnv(file) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SECRET_KEY (or the older SUPABASE_SERVICE_KEY).\n" +
    "Export them, or run `vercel env pull .env.local` in the repo root first.",
  );
  process.exit(1);
}

const restBase = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const authHeaders = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` };

// -- The inventory, one group per migration file --------------------------
//
// Kept in sync BY HAND with each migration's own `create table` / `create
// function` statements — there is no schema-introspection tool doing this
// automatically, so a migration that adds an object without a line here is a
// gap this script will not catch. The 0002 bucket is listed separately: its
// tables are proposals and deliberately not checked.

const MIGRATIONS = [
  {
    file: "0003_runtime.sql",
    tables: ["app_config", "rate_limit_counters"],
    functions: ["increment_rate_limit"],
  },
  {
    file: "0004_debate_runs.sql",
    tables: ["debate_runs"],
    functions: ["claim_debate_step", "sweep_stalled_debates"],
  },
  {
    file: "0005_workspace.sql",
    tables: ["workspaces", "workspace_members", "workspace_docs", "performance_rows"],
    functions: ["is_workspace_member", "bump_workspace_doc"],
  },
  {
    file: "0006_mcp.sql",
    tables: ["oauth_clients", "oauth_codes", "oauth_tokens"],
    functions: [],
  },
  {
    file: "0007_performance_aggregation.sql",
    tables: [],
    functions: ["performance_summary"],
  },
];

async function fetchOpenApiPaths() {
  let res;
  try {
    res = await fetch(`${restBase}/`, { headers: authHeaders, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw new Error(`Could not reach ${SUPABASE_URL} — check SUPABASE_URL is right and the project is not paused. (${err.message})`);
  }
  if (!res.ok) {
    throw new Error(`PostgREST root returned ${res.status} — check SUPABASE_URL and the secret key.`);
  }
  const doc = await res.json();
  return new Set(Object.keys(doc.paths || {}));
}

async function checkBucket() {
  // Duplicated rather than imported from api/asset.js's `authHeaders`/
  // `secretKey` (those read from api/_supabase.js, which this script
  // deliberately does not import — see the header on why credentials are
  // resolved here instead), but the actual probe logic is reused as-is.
  const { bucketReachable, BUCKET } = await import("../api/asset.js");
  const result = await bucketReachable();
  return { name: BUCKET, ...result };
}

function line(ok, kind, name, extra = "") {
  const mark = ok ? "  ok" : "MISSING";
  console.log(`  ${mark.padEnd(7)} ${kind.padEnd(9)} ${name}${extra}`);
}

async function main() {
  console.log(`Supabase check — ${SUPABASE_URL}\n`);

  let paths;
  try {
    paths = await fetchOpenApiPaths();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let missing = 0;
  let total = 0;

  for (const m of MIGRATIONS) {
    console.log(m.file);
    for (const t of m.tables) {
      total++;
      const ok = paths.has(`/${t}`);
      if (!ok) missing++;
      line(ok, "table", t, ok ? "" : `  — run supabase/migrations/${m.file}`);
    }
    for (const f of m.functions) {
      total++;
      const ok = paths.has(`/rpc/${f}`);
      if (!ok) missing++;
      line(ok, "function", f, ok ? "" : `  — run supabase/migrations/${m.file}`);
    }
    console.log("");
  }

  console.log("0002_assets.sql (storage bucket only — its tables are proposals, not run)");
  total++;
  const bucket = await checkBucket();
  if (!bucket.ok) missing++;
  line(bucket.ok, "bucket", bucket.name, bucket.ok ? "" : `  — reason: ${bucket.reason}. See the statement at the bottom of 0002_assets.sql.`);
  console.log("");

  if (missing) {
    console.error(`FAIL: ${missing} of ${total} expected objects are missing. Run the migrations named above.`);
    process.exit(1);
  }
  console.log(`All ${total} expected objects are present.`);
}

main();
