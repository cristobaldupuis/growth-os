// Navigation structure and vocabulary.
//
// Kept out of Sidebar.jsx so that file exports only components — a mixed
// component/constant module breaks Fast Refresh, which is the same reason
// tourSteps.js sits beside GuidedTour.jsx rather than inside it.
//
// ## Plain names only
//
// The rail used to carry a second vocabulary: every item had a two-letter code
// chip and a laboratory subtitle (Observatory, Register, Quarantine…), and the
// two sections were headed "Signal · Read the system" and "Protocol · Run the
// method". It was meant as character and it read as decoration: three labels
// per destination, one of which you had to learn. The science vocabulary now
// lives only where it carries meaning (kill criteria, pre-registration, the
// prediction ledger), and the rail says what each view is.
//
//   `label`  — what the item is called, everywhere.
//   `icon`   — the glyph name the rail draws beside it (see Sidebar.jsx).
//   `blurb`  — what the view answers, in a sentence. The item's tooltip, and
//              the copy the command palette and the Guide drawer draw on.
//
// The first section has no heading on purpose: it is the default set of
// destinations, and a heading over it would only restate that.

export const NAV_SECTIONS = [
  {
    id: "overview",
    label: null,
    items: [
      { key:"dashboard",   icon:"dashboard",   label:"Dashboard",   blurb:"The whole portfolio at a glance" },
      { key:"agenda",      icon:"agenda",      label:"Agenda",      blurb:"The questions the portfolio is trying to answer" },
      { key:"initiatives", icon:"initiatives", label:"Initiatives", blurb:"Every experiment and its status" },
      { key:"library",     icon:"library",     label:"Library",     blurb:"What closed experiments taught us" },
      { key:"performance", icon:"performance", label:"Performance", blurb:"What the ad names reveal about spend" },
    ],
  },
  {
    id: "workflow",
    label: "Workflow",
    items: [
      { key:"triage",   icon:"triage",   label:"Triage",   blurb:"Needs a decision before it proceeds" },
      { key:"creative", icon:"creative", label:"Creative", blurb:"Brief and build from a hypothesis" },
      { key:"readout",  icon:"readout",  label:"Summary",  blurb:"The week, packaged for stakeholders" },
    ],
  },
];

// Destinations that are real views but not rail items. Settings is reached from
// the gear in the rail foot rather than from the section list — it is a place
// you go occasionally, and a rail item for it would sit next to seven things
// you go to daily — but it still needs a name for the header and the title.
export const OFF_RAIL = {
  settings: { key:"settings", label:"Settings", blurb:"Workspace, brands, convention, data" },
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
 * a destination is always named the same way.
 */
export const navName = (key) => NAV_INDEX[key]?.label || key;

/** The laboratory name for a nav key, or null where there isn't one. */
export const navLab = (key) => NAV_INDEX[key]?.lab || null;
