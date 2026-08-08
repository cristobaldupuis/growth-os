// -- Pre-registration ----------------------------------------------------------
//
// Observation, hypothesis and success metric carried an asterisk in the editor,
// and the README called this the "structured hypothesis enforcer: every
// initiative requires three distinct fields". Save was disabled on an empty
// *title* and nothing else, so all three could be left blank — the enforcer did
// not enforce. A form that marks a field required and then accepts it empty
// teaches the operator that the discipline is optional, and the discipline is
// the product's actual claim: the frozen prediction the calibration ledger
// later compares against is only worth something if it was written down before
// the test ran.
//
// ## Why existing initiatives are flagged rather than blocked
//
// All thirty-eight seeded demo initiatives predate these fields and carry
// neither an observation nor a success metric. Hard-blocking would make every
// one of them uneditable, so the first thing a new user does — open one and
// change a date — would fail. Legacy records get the same red fields and a
// banner naming what is missing and why, and can still be saved. New ones
// cannot.
//
// Lives outside FormView.jsx so the view file exports only components, which is
// what Fast Refresh needs — the same split as navSections.js and tourSteps.js.

const REQUIRED = [
  { key:"title",         label:"Title" },
  { key:"observation",   label:"Observation" },
  { key:"hypothesis",    label:"Hypothesis" },
  { key:"successMetric", label:"Success metric" },
];

export function validateInitiative(form) {
  const missing = REQUIRED.filter(r => !String(form?.[r.key] || "").trim());
  return {
    missing,
    // A record that came in before pre-registration existed. `_new` is set by
    // mkDefault and cleared on save, so it is the only reliable "is this being
    // created right now" signal available here.
    legacy: !form?._new && missing.length > 0,
    blocking: !!form?._new && missing.length > 0,
  };
}


// Why each field is required, in the words the operator needs at the moment
// they are being told they cannot skip it. A validation message that only says
// "required" answers the wrong question — the user can see it is empty.
export const PROMPTS = {
  title:         "Name the experiment so it is recognisable in a list six months from now.",
  observation:   "What did you see in the data that made this worth doing? This is what the learning gets compared against.",
  hypothesis:    "State what you believe will happen and why. Without it there is no prediction to be wrong about.",
  successMetric: "The single number that decides this. Naming it now is what stops the result being argued afterwards.",
};
