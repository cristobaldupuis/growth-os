// End-to-end request-shape test for every AI feature.
//
// The unit tests in models.test.js prove the *builder* is correct. This file
// proves the ten actual call sites are, which is a different claim: a call site
// can spread a correct builder result and then override a field, pass the wrong
// tier, or exceed the proxy's ceiling, and nothing else in the pipeline notices.
//
// It works by stubbing `fetch`, invoking each exported call function with
// plausible arguments, capturing the body it would have sent, and running that
// body through the *real* `validateBody` from api/proxy.js — not a copy, so the
// two cannot drift apart.
//
// This is the check that would have caught the Haiku thinking/effort bug at the
// call-site level as well as in the helper.
//
// Run with: node src/services/ai/requests.test.js
import assert from "node:assert/strict";
import { validateBody, ALLOWED_MODELS } from "../../../api/proxy.js";
import { capabilitiesFor, modelFor } from "./models.js";
import { GROUP_KEYS, FEATURE_GROUPS, DEFAULT_ROUTING } from "./registry.js";

import { callExpandHypothesis } from "./callExpandHypothesis.js";
import { callQuickCapture } from "./callQuickCapture.js";
import { callSuggestICE } from "./callSuggestICE.js";
import { callSynthesizeLearnings } from "./callSynthesizeLearnings.js";
import { callAskLibrary } from "./callAskLibrary.js";
import { callGenerateCandidates } from "./callGenerateCandidates.js";
import { callExpandRecommendation } from "./callExpandRecommendation.js";
import { callDebateSynthesis } from "./callDebateSynthesis.js";
import { callCreativeBrief } from "./callCreativeBrief.js";
import { callCreativeVariants } from "./callCreativeVariants.js";
import { DEFAULT_NAMING_SCHEMA } from "../naming.js";

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log("  PASS " + name); passed++; })
    .catch((err) => { console.error("  FAIL " + name + "\n        " + err.message); failed++; });
}

// A minimal but realistic settings object — these calls interpolate it into the
// system prompt, so it has to have the fields they read.
const SETTINGS = {
  companyName: "Test Co", businessModel: "Multi-retailer DTC",
  northStarMetric: "Portfolio Revenue", northStarCurrent: "$1.1M/mo", northStarTarget: "$1.4M/mo",
  categories: ["Conversion", "Retention"],
  brands: [{ id: "default", name: "Test Brand" }],
  agents: [
    { id: "cmo", label: "CMO", icon: "📣", lens: "brand", blindspot: "unit economics" },
    { id: "cfo", label: "CFO", icon: "📊", lens: "margin", blindspot: "LTV" },
  ],
};
const ITEM = {
  id: "e1", initId: "TB-001", title: "Test initiative", category: "Conversion",
  initType: "A/B Test", hypothesis: "We believe that X will result in Y for Z, because W.",
  observation: "Observed a drop.", successMetric: "CVR",
  ice: { impact: 7, certainty: 6, ease: 5 }, revenueImpact: 10000, status: "Draft",
  results: { keyLearning: "Learned something", outcomeClassification: "Success", actualRevenueImpact: 9000 },
};

// The creative loop reads a brand brief and, for variants, an already-approved
// brief object. Both are interpolated into the system prompt, so they need the
// fields those call sites actually read.
const BRAND = {
  id: "default", name: "Test Brand",
  whatTheySell: "Premium widgets, $80-$300 AOV", categories: "Widgets, Gifting",
  icp: "Women 28-48, considered purchase", whyTheyWin: "Design-led",
  relationship: "Own DTC brand", constraint: "Rising CAC on paid social",
};
const BRIEF = {
  insight: "Buyers distrust before-and-after imagery.",
  promise: "See the product used unedited.",
  proof: ["single unbroken take", "no post-production"],
  formatGuidance: "Vertical, 25-35s, captions burned in.",
  angles: [
    { slug:"TimeSaver", label:"Time saver", theory:"They buy back minutes.", execution:"Handheld, morning setting.", openingBeat:"Presenter checks the clock." },
    { slug:"MacroMath", label:"Macro math", theory:"They buy the numbers.", execution:"On-screen macro overlay.", openingBeat:"Label held to camera." },
  ],
};

/** Stub fetch, run `fn`, return every request body it attempted to send. */
async function capture(fn) {
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body));
    // Shape-valid empty response so the caller's parsing doesn't throw before we
    // have what we need. Individual callers differ in what they expect back, so
    // a rejection after capture is fine and is swallowed below.
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "[]" }] }),
    };
  };
  try { await fn(); } catch { /* parsing the stub response is not what's under test */ }
  finally { globalThis.fetch = realFetch; }
  return bodies;
}

function assertValid(body, label) {
  const err = validateBody(body);
  assert.equal(err, null, `${label}: proxy would reject this request — ${err}`);

  // The proxy checks cost and shape. These assertions cover model capability,
  // which the proxy deliberately does not police (it is Anthropic's contract,
  // not ours) but which is just as fatal at runtime.
  assert.ok(ALLOWED_MODELS.has(body.model), `${label}: ${body.model} is not in the proxy allowlist`);
  const caps = capabilitiesFor(body.model);
  if (!caps.adaptiveThinking) {
    assert.equal(body.thinking, undefined, `${label}: ${body.model} does not support a thinking parameter`);
  }
  if (!caps.effort) {
    assert.ok(!body.output_config || body.output_config.effort === undefined,
      `${label}: ${body.model} rejects output_config.effort`);
  }
}

// The debate synthesis reads live tool output, so it needs a stub that answers
// the three queries it makes.
const PORTFOLIO_TOOLS = { execute: () => ({}) };
const TRANSCRIPT = [{ icon: "📣", label: "CMO", text: "We should invest." },
                    { icon: "📊", label: "CFO", text: "Show me payback first." }];

const CASES = [
  ["Quick Capture",           () => callQuickCapture("rough idea about checkout", SETTINGS, SETTINGS.categories, ["A/B Test", "Campaign"])],
  ["Hypothesis Expansion",    () => callExpandHypothesis("rough hypothesis text", "A title", SETTINGS, "")],
  ["ICE Assist",              () => callSuggestICE(ITEM, SETTINGS, "")],
  // Neither of these takes a brands argument — both were being passed one, which
  // was harmless while the extra positional went nowhere and became a real bug the
  // moment the last parameter meant something (it arrived as `modelOverride` and
  // an array is not a model id). Left as a two- and three-argument call to match
  // the actual signatures and the real call sites in LearningLibrary.jsx.
  ["Learning Synthesis",      () => callSynthesizeLearnings([ITEM], SETTINGS)],
  ["Ask the Library",         () => callAskLibrary("what worked?", [ITEM], SETTINGS)],
  ["Next Plays — candidates", () => callGenerateCandidates("portfolio ctx", [{ id: "e1", title: "t" }], SETTINGS, SETTINGS.categories)],
  ["Next Plays — expansion",  () => callExpandRecommendation({ title: "t", category: "Conversion", rationale: "r" }, "portfolio ctx", [], SETTINGS)],
  ["Debate synthesis",        () => callDebateSynthesis("portfolio ctx", "user ctx", TRANSCRIPT, SETTINGS.categories, SETTINGS, PORTFOLIO_TOOLS)],
  ["Creative brief",          () => callCreativeBrief(ITEM, BRAND, [{ id:"e1", title:"t", learning:"l", outcome:"Success", category:"Conversion" }], SETTINGS, DEFAULT_NAMING_SCHEMA)],
  ["Creative variants",       () => callCreativeVariants(BRIEF, ITEM, BRAND, DEFAULT_NAMING_SCHEMA, { perAngle: 2 })],
];

console.log("Request shapes accepted by the proxy:\n");

for (const [label, invoke] of CASES) {
  await test(label, async () => {
    const bodies = await capture(invoke);
    assert.ok(bodies.length > 0, `${label}: made no request at all — the call site may have thrown early`);
    bodies.forEach((b, i) => assertValid(b, `${label}[${i}]`));
  });
}

await test("no call site exceeds the proxy max_tokens ceiling", async () => {
  for (const [label, invoke] of CASES) {
    for (const b of await capture(invoke)) {
      assert.ok(b.max_tokens <= 4000, `${label} requests ${b.max_tokens} tokens, over the proxy ceiling`);
    }
  }
});

// -- Group routing -------------------------------------------------------------
//
// The above proves each call site sends a *legal* request. These prove it sends the
// request the routing asked for, which is a separate claim and the one the admin
// console depends on. A call site that kept its old MODELS literal would pass every
// test before this point and silently ignore the console forever.

/** Which group each call site is supposed to draw its model from. */
const GROUP_OF = {
  "Quick Capture": "capture",
  "Hypothesis Expansion": "capture",
  "ICE Assist": "capture",
  "Learning Synthesis": "analysis",
  "Ask the Library": "analysis",
  "Next Plays — candidates": "analysis",
  "Next Plays — expansion": "analysis",
  "Debate synthesis": "debate",
  "Creative brief": "creative",
  "Creative variants": "creative",
};

await test("every call site sends its own group's routed model", async () => {
  for (const [label, invoke] of CASES) {
    const group = GROUP_OF[label];
    assert.ok(group, `${label} is not mapped to a group in this test — add it`);
    for (const b of await capture(invoke)) {
      assert.equal(b.model, modelFor(group),
        `${label} should send the model routed to "${group}"`);
    }
  }
});

await test("every text group is covered by at least one call site here", async () => {
  // Stops a group being added to the registry with no test exercising it.
  const covered = new Set(Object.values(GROUP_OF));
  for (const key of GROUP_KEYS) {
    if (FEATURE_GROUPS[key].modality !== "text") continue;
    assert.ok(covered.has(key), `no case in this file exercises the "${key}" group`);
  }
});

await test("an explicit override reaches the wire", async () => {
  // The mechanism the test bench runs on. Asserted against a model that is not any
  // group's default, so a call site ignoring the override cannot coincidentally
  // produce the expected value.
  const OVERRIDE = "claude-opus-5";
  assert.ok(!Object.values(DEFAULT_ROUTING).includes(OVERRIDE),
    "pick an override that is not already a default, or this test proves nothing");

  const OVERRIDING_CASES = [
    ["Quick Capture",        (m) => callQuickCapture("rough idea", SETTINGS, SETTINGS.categories, ["A/B Test"], m)],
    ["Hypothesis Expansion", (m) => callExpandHypothesis("rough", "A title", SETTINGS, "", m)],
    ["ICE Assist",           (m) => callSuggestICE(ITEM, SETTINGS, "", m)],
    ["Learning Synthesis",   (m) => callSynthesizeLearnings([ITEM], SETTINGS, m)],
    ["Ask the Library",      (m) => callAskLibrary("what worked?", [ITEM], SETTINGS, m)],
    ["Next Plays — candidates", (m) => callGenerateCandidates("ctx", [{ id:"e1", title:"t" }], SETTINGS, SETTINGS.categories, m)],
    ["Next Plays — expansion",  (m) => callExpandRecommendation({ title:"t", category:"Conversion", rationale:"r" }, "ctx", [], SETTINGS, m)],
    ["Debate synthesis",     (m) => callDebateSynthesis("ctx", "user ctx", TRANSCRIPT, SETTINGS.categories, SETTINGS, PORTFOLIO_TOOLS, m)],
    ["Creative brief",       (m) => callCreativeBrief(ITEM, BRAND, [], SETTINGS, DEFAULT_NAMING_SCHEMA, m)],
    ["Creative variants",    (m) => callCreativeVariants(BRIEF, ITEM, BRAND, DEFAULT_NAMING_SCHEMA, { perAngle: 2 }, m)],
  ];

  for (const [label, invoke] of OVERRIDING_CASES) {
    const bodies = await capture(() => invoke(OVERRIDE));
    assert.ok(bodies.length > 0, `${label}: made no request`);
    for (const b of bodies) {
      assert.equal(b.model, OVERRIDE, `${label} ignored its modelOverride`);
      // The override must still produce a legal request — a reach model has
      // different capabilities, and buildRequest has to honour those rather than
      // carrying over the default tier's parameter set.
      assertValid(b, `${label} (overridden)`);
    }
  }
});

await test("an override of the wrong type throws rather than reaching the wire", async () => {
  // The stale-argument case this guard exists for: a caller passing an extra
  // positional that lands in modelOverride. Better a loud throw than an array
  // arriving at the proxy as a model id.
  await assert.rejects(
    async () => callSynthesizeLearnings([ITEM], SETTINGS, SETTINGS.brands),
    /must be a model id string/
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
