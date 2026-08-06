// Navigation structure and vocabulary.
//
// Kept out of Sidebar.jsx so that file exports only components — a mixed
// component/constant module breaks Fast Refresh, which is the same reason
// tourSteps.js sits beside GuidedTour.jsx rather than inside it.
//
// ## On the naming
//
// The views carry laboratory names because the product is a laboratory: it runs
// a scientific method against growth, and the vocabulary should say so rather
// than defaulting to the Dashboard/Reports/Settings triple every SaaS console
// uses.
//
// The obvious risk is being cute at the cost of being usable — nobody should
// have to learn a private vocabulary to find the initiative list. That is what
// `blurb` is for, and why it renders in the nav itself rather than in a tooltip:
// the science name is the identity, the plain sentence under it is the
// wayfinding, and you never have to guess which is which.

export const NAV_SECTIONS = [
  {
    label: "Signal",
    hint: "Read the system",
    items: [
      { key:"dashboard",   code:"OB", name:"Observatory", blurb:"The whole portfolio at a glance" },
      { key:"initiatives", code:"RG", name:"Register",    blurb:"Every experiment and its status" },
      { key:"library",     code:"AR", name:"Archive",     blurb:"What closed experiments taught us" },
    ],
  },
  {
    label: "Protocol",
    hint: "Run the method",
    items: [
      { key:"triage",   code:"QR", name:"Quarantine", blurb:"Needs a decision before it proceeds" },
      { key:"creative", code:"BN", name:"Bench",      blurb:"Brief and build creative from a hypothesis" },
      { key:"readout",  code:"RO", name:"Readout",    blurb:"The week, packaged for stakeholders" },
    ],
  },
];

/** Flat lookup so other code can name a view without knowing its section. */
export const NAV_INDEX = NAV_SECTIONS.reduce((acc, s) => {
  s.items.forEach(i => { acc[i.key] = i; });
  return acc;
}, {});

/** The label for a nav key, falling back to the key for non-nav views. */
export const navName = (key) => NAV_INDEX[key]?.name || key;
