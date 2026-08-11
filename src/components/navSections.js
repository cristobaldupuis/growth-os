// Navigation structure and vocabulary.
//
// Kept out of Sidebar.jsx so that file exports only components — a mixed
// component/constant module breaks Fast Refresh, which is the same reason
// tourSteps.js sits beside GuidedTour.jsx rather than inside it.
//
// ## Where the science vocabulary lives, and where it doesn't
//
// This product runs a scientific method against growth, and the interface
// should say so. The first attempt said it in the wrong place: laboratory names
// replaced the nav labels outright, so finding the initiative list meant knowing
// it was called "Register". That is a real cost — wayfinding is the one job a
// nav label cannot trade away — and it buys character that can be had for free
// somewhere else.
//
// So the split is deliberate:
//
//   `label`  — plain, and the primary thing you read. Unchanged from what
//              shipped, so nothing anyone already learned stops working.
//   `lab`    — the laboratory name, rendered underneath as a one-line subtitle.
//              Carries the flavour, explains the two-letter code, and is never
//              the only way to find anything.
//   `blurb`  — what the view answers, in a sentence. Rendered as the item's
//              tooltip rather than inline: at a 216px rail a sentence wraps to
//              two lines on every item, which made a seven-item list as tall as
//              eleven and buried the labels in prose. It is still written for
//              the reader, and it is still the copy the Guide drawer draws on —
//              it just costs no height in the rail.
//
// The heavier science vocabulary belongs to the mechanics rather than the
// furniture: kill criteria, pre-registration, what would falsify this, the
// prediction ledger. Those are terms of art that carry real meaning, and every
// one of them teaches an operator something about how the method works. A
// renamed tab teaches nothing.

export const NAV_SECTIONS = [
  {
    label: "Signal",
    hint: "Read the system",
    items: [
      { key:"dashboard",   code:"OB", label:"Dashboard",   lab:"Observatory", blurb:"the whole portfolio at a glance" },
      { key:"agenda",      code:"TH", label:"Agenda",      lab:"Thesis",      blurb:"the questions the portfolio is trying to answer" },
      { key:"initiatives", code:"RG", label:"Initiatives", lab:"Register",    blurb:"every experiment and its status" },
      { key:"library",     code:"AR", label:"Library",     lab:"Archive",     blurb:"what closed experiments taught us" },
      { key:"performance", code:"MS", label:"Performance", lab:"Microscope",  blurb:"what the ad names reveal about spend" },
    ],
  },
  {
    label: "Protocol",
    hint: "Run the method",
    items: [
      { key:"triage",   code:"QR", label:"Triage",   lab:"Quarantine", blurb:"needs a decision before it proceeds" },
      { key:"creative", code:"BN", label:"Creative", lab:"Bench",      blurb:"brief and build from a hypothesis" },
      { key:"readout",  code:"RO", label:"Summary",  lab:"Readout",    blurb:"the week, packaged for stakeholders" },
    ],
  },
];

// Destinations that are real views but not rail items. Settings is reached from
// the gear in the rail foot rather than from the section list — it is a place
// you go occasionally, and a rail item for it would sit next to seven things
// you go to daily — but it still needs a name for the header and the title.
export const OFF_RAIL = {
  settings: { key:"settings", label:"Settings", lab:null, blurb:"workspace, brands, convention, data" },
};

/** Flat lookup so other code can name a view without knowing its section. */
export const NAV_INDEX = NAV_SECTIONS.reduce((acc, s) => {
  s.items.forEach(i => { acc[i.key] = i; });
  return acc;
}, { ...OFF_RAIL });

/**
 * The plain label for a nav key, falling back to the key itself for views that
 * are not nav destinations (detail, form). Everything user-facing that has to
 * name a destination — "Back to Initiatives", the view header — uses this, so
 * the laboratory name stays decorative by construction.
 */
export const navName = (key) => NAV_INDEX[key]?.label || key;

/** The laboratory name for a nav key, or null where there isn't one. */
export const navLab = (key) => NAV_INDEX[key]?.lab || null;
