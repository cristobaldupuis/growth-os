// AI_HEADERS is async (it may refresh the session token first). A caller that
// forgets to await it hands fetch a Promise, which depending on the runtime
// either throws or becomes EMPTY headers: no Content-Type, so the function
// receives an unparsed text/plain body and every request fails its `action`
// check with a 400; and no Authorization, so the call is charged to an address
// instead of a person. That shipped for voice
// and scenes, so every call site is checked here rather than trusted.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../../", import.meta.url).pathname;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(js|jsx)$/.test(name) && !name.endsWith(".test.js") ? [p] : [];
  });
}

test("every AI_HEADERS() call is awaited", () => {
  const offenders = [];
  for (const f of files(SRC)) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/AI_HEADERS\(\)/.test(line) && !/await\s+AI_HEADERS\(\)/.test(line) && !/function AI_HEADERS/.test(line)) {
        offenders.push(`${f.slice(SRC.length)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

