// Fails if any themed text/background pairing drops below WCAG AA (4.5:1).
//
// This exists because the palette regressed silently once already: the light
// theme shipped with gold text at 2.42:1 on white — the headline revenue figure
// on the dashboard was the least readable element on the page — while the same
// token in dark mode measured 10.1:1. Nothing caught it, because contrast is
// invisible to a build that only checks that the app compiles.
//
// Run via `npm run check:contrast`; CI runs it on every push.
import { TL, TD, SL, SD, OL, OD, TYPE_L, TYPE_D } from "../src/constants.js";

const AA = 4.5;
// AA Large (3:1) is the bar for text at >=24px bold / >=18.66px regular.
//
// This waiver used to apply to `textMuted`, on the stated grounds that it was
// "micro-label only … decorative context rather than content". The code never
// honoured that: `textMuted` is the most-used ink in the app — the label colour
// for every form field via FR, every table header, half the Weekly Pulse cells,
// the sublabel under every stat tile — appearing at 9–11px in a hundred and
// ninety places, which is a band where AA Large does not apply at all. The
// waiver was the one place the palette was not held to the standard this file
// exists to enforce, and it was hiding a 4.05:1 pairing.
//
// `textMuted` is now checked at AA like every other ink. The waiver moved to
// `textFaint`, which is genuinely decorative — and, crucially, is checked
// against the surfaces it is allowed on rather than being exempt everywhere.
const AA_LARGE = 3;

const chan = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = (hex) => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return (
    0.2126 * chan(parseInt(n.slice(0, 2), 16)) +
    0.7152 * chan(parseInt(n.slice(2, 4), 16)) +
    0.0722 * chan(parseInt(n.slice(4, 6), 16))
  );
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};

const failures = [];
const results = [];

function check(label, fg, bg, floor = AA) {
  const ratio = contrast(fg, bg);
  const ok = ratio >= floor;
  results.push({ label, ratio, floor, ok });
  if (!ok) failures.push(`${label}: ${ratio.toFixed(2)}:1 (needs ${floor}:1) — ${fg} on ${bg}`);
}

for (const [themeName, T] of [["light", TL], ["dark", TD]]) {
  const p = (s) => `${themeName}/${s}`;
  // Body and supporting text on every surface it can land on.
  for (const surf of ["surface", "surfaceAlt", "bg"]) {
    check(p(`text on ${surf}`), T.text, T[surf]);
    check(p(`textSub on ${surf}`), T.textSub, T[surf]);
    // Muted carries real content — labels, headers, cells — at small sizes.
    check(p(`textMuted on ${surf}`), T.textMuted, T[surf]);
    // Faint is the decorative tier, and the only token allowed the large waiver.
    check(p(`textFaint on ${surf}`), T.textFaint, T[surf], AA_LARGE);
  }
  // Muted also lands on the gold panel background (north star, readout header,
  // "Ask the library"), which is a lighter surface than any of the three above.
  check(p("textMuted on goldBg"), T.textMuted, T.goldBg);
  // `gold` is an ink token: it must be readable everywhere it is set as `color`.
  // This is the specific check that the old palette failed.
  for (const surf of ["surface", "surfaceAlt", "bg", "goldBg"]) {
    check(p(`gold on ${surf}`), T.gold, T[surf]);
  }
  // `goldFill` is a background: what matters is the text sitting on top of it.
  check(p("goldText on goldFill"), T.goldText, T.goldFill);
  // Semantic states against their own tinted backgrounds and the plain surface.
  check(p("teal on surface"), T.teal, T.surface);
  check(p("teal on tealBg"), T.teal, T.tealBg);
  check(p("red on surface"), T.red, T.surface);
  check(p("red on redBg"), T.red, T.redBg);
  check(p("warn on surface"), T.warn, T.surface);
  check(p("warn on warnBg"), T.warn, T.warnBg);
}

// Status and outcome badges: each one sets its own text and background together.
for (const [themeName, S, O] of [["light", SL, OL], ["dark", SD, OD]]) {
  for (const [k, v] of Object.entries(S)) check(`${themeName}/status ${k}`, v.text, v.bg);
  for (const [k, v] of Object.entries(O)) check(`${themeName}/outcome ${k}`, v.text, v.bg);
}

// Type badges render their hue on the alt surface.
for (const [themeName, TY, T] of [["light", TYPE_L, TL], ["dark", TYPE_D, TD]]) {
  for (const [k, v] of Object.entries(TY)) check(`${themeName}/type ${k}`, v, T.surfaceAlt);
}

const worst = [...results].sort((a, b) => a.ratio - b.ratio).slice(0, 5);
console.log(`Checked ${results.length} pairings against WCAG AA.`);
console.log("Tightest five:");
for (const r of worst) {
  console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.ratio.toFixed(2)}:1  ${r.label}`);
}

if (failures.length) {
  console.error(`\n${failures.length} contrast failure(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nAll pairings pass.");
