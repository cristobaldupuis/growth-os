// -- The tour still points at things that exist --------------------------------
//
// A tour step is a selector written in one file and an attribute written in
// another, with nothing between them. Rename an anchor and the step does not
// throw — `useTargetRect` polls for forty frames, gives up, and the card falls
// back to the middle of the screen with no spotlight. The tour keeps "working",
// it just stops pointing at anything, and the first person to notice is whoever
// is being demoed to.
//
// So the anchors are checked statically, and so are the two properties the copy
// depends on: that a step's `nav` is a real view, and that a `tab` is only used
// where the view actually has tabs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { TOUR_STEPS } from "./tourSteps.js";
import { ROUTABLE } from "../services/route.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const sourceFiles = (dir) => readdirSync(dir).flatMap(entry => {
  const full = join(dir, entry);
  if (statSync(full).isDirectory()) return sourceFiles(full);
  return /\.(jsx?|css)$/.test(entry) && !entry.endsWith(".test.js") ? [full] : [];
});

const ALL_SOURCE = sourceFiles(SRC).map(f => readFileSync(f, "utf8")).join("\n");

test("every tour step anchors to a data-tour attribute that exists in the source", () => {
  TOUR_STEPS.forEach((step, i) => {
    const match = /^\[data-tour="([^"]+)"\]$/.exec(step.selector);
    assert.ok(match, `step ${i + 1} ("${step.title}") uses a selector this check cannot verify: ${step.selector}`);
    assert.ok(ALL_SOURCE.includes(`data-tour="${match[1]}"`),
      `step ${i + 1} ("${step.title}") points at data-tour="${match[1]}", which no component renders`);
  });
});

test("every tour step navigates to a real view", () => {
  TOUR_STEPS.forEach((step, i) => {
    assert.ok(step.nav, `step ${i + 1} has no nav, so it shows wherever the visitor already was`);
    assert.ok(ROUTABLE.includes(step.nav),
      `step ${i + 1} navigates to "${step.nav}", which is not a routable view`);
  });
});

test("only tabbed views carry a tab", () => {
  // Performance is the one view with addressable tabs. A `tab` on any other step
  // would be silently ignored, which is the same class of failure as a dead
  // anchor: nothing breaks, the step just lands somewhere else.
  TOUR_STEPS.filter(s => s.tab).forEach((step, i) => {
    assert.equal(step.nav, "performance",
      `step ${i + 1} sets a tab on "${step.nav}", which has none`);
  });
});

test("the tour reaches the differentiated half of the product", () => {
  // The pitch is never the Library (docs/commercial.md). If a future edit trims
  // the tour back to the ledger, this is the line that should fail.
  const tabs = TOUR_STEPS.filter(s => s.nav === "performance").map(s => s.tab);
  assert.ok(tabs.includes("attribution"), "the four-way split is the argument; the tour has to show it");
  assert.ok(tabs.includes("audit"), "the account audit is what runs before anything is installed");
});

test("step copy is present and readable at the card's size", () => {
  TOUR_STEPS.forEach((step, i) => {
    assert.ok(step.title && step.body, `step ${i + 1} is missing title or body`);
    // The card is 320px wide and scrolls past roughly this much; a step that
    // needs scrolling to reach its own Next button is a step to cut down.
    assert.ok(step.body.length < 480,
      `step ${i + 1} ("${step.title}") is ${step.body.length} characters — too long for the card`);
  });
});
