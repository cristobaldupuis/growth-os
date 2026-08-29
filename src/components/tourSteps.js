// Brand-neutral copy for every deployment. This ships from app logic, not
// config, so it never needs to change between clients. Each step answers the
// question the anchored view exists to answer, not what the control does.
//
// ## The order is an argument, not a site map
//
// Experiment tracking, hypothesis templates, ICE and a searchable learnings
// library are table stakes — three funded products ship all of it (see
// docs/commercial.md). A tour that walks the navigation top to bottom spends its
// first four steps on the half of this product that is not differentiated, and
// arrives at the bridge when the visitor has already decided what they are
// looking at. So the sequence runs: what you are looking at, what the portfolio
// is trying to learn, what it has learned, and then three steps on the thing
// nothing else attempts — the ad account's own names as the join key, including
// the part where it refuses to guess.
//
// `nav` switches the view; `tab` addresses a tab inside it, which is what lets
// the tour reach the attribution split and the account audit rather than telling
// the visitor where to click and hoping.
//
// The tour only ever runs in a demo workspace — it is opened on a cold visit
// under DEMO_MODE, and its replay control sits inside the demo block in the
// sidebar — which is why the first step can state plainly that the data is
// invented. If that ever stops being true, this copy is wrong before anything
// else is.
export const TOUR_STEPS = [
  {
    selector: '[data-tour="logo"]', nav: "dashboard",
    title: "What you're looking at",
    // No step count in the copy. It used to say "Four short stops" beside a
    // header rendering "1 of 5", which was defensible as "four more after this
    // one" and still read as a mistake. The header already carries the number,
    // so the prose does not need to — and now cannot go stale when a step is
    // added, which is exactly how it drifted the first time.
    body: "Three brands, every figure on every screen, and an entire ad account — all invented. This is a demonstration workspace and none of it is a real company's numbers. What isn't invented is the machinery underneath: the parser, the statistics, and every refusal you're about to see is computed live from that fabricated data rather than written down in advance.",
  },
  {
    selector: '[data-tour="northstar"]', nav: "dashboard",
    title: "One number everything ladders up to",
    body: "The dashboard answers a single question: are we on track? North Star current against target, what's driving revenue right now, and what's still in flight, all above the fold.",
  },
  {
    selector: '[data-tour="agenda-question"]', nav: "agenda",
    title: "The questions underneath the backlog",
    body: "Experiments ladder up to a question the business actually needs answered — each one stating what's held constant, what varies, and the result that would prove it wrong. Some are answered, one is parked on a dependency, and plenty of the portfolio ladders up to nothing at all, because it ran before the question was framed. This is the layer that separates a research programme from a well-organised to-do list.",
  },
  {
    selector: '[data-tour="learning-card"]', nav: "library",
    title: "What actually happened, kept",
    body: "Every closed test lands here with its real outcome and the specific thing learned, including the failures — especially the failures. Switch brands in the sidebar and the same library answers a harder question: what's proven at one brand and still missing at another.",
  },
  {
    selector: '[data-tour="performance-intro"]', nav: "performance", tab: "breakdown",
    title: "The ad names are the attribution layer",
    body: "A campaign export is already loaded. Every ad name has been parsed back through the naming convention, so a flat spend report becomes one you can pivot by angle, audience or format — and any ad whose name carries a tracking tag is joined to the experiment that ordered it. No pixel, no API integration, no tagging plan beyond the name itself.",
  },
  {
    selector: '[data-tour="attribution-split"]', nav: "performance", tab: "attribution",
    title: "And what it refuses to guess",
    body: "The same export, split four ways: joined to an experiment, untagged business-as-usual, a tag that resolves to nothing, and names that don't parse at all. Every one of those is counted and named with its spend attached. A wrong-but-plausible parse enters the analysis silently; an unparsed row gets reported — so this reads a mis-shaped name and stops, rather than guessing at an alignment.",
  },
  {
    selector: '[data-tour="account-audit"]', nav: "performance", tab: "audit",
    title: "Before any of this is installed",
    body: "Paste a prospect's ad names — names only, no spend, no contract — and this reports the convention they already follow, what each slot holds, how much parses today, and how many campaigns need mapping by hand. Load the sample account to watch it run. It reports evidence and stops short of proposing a taxonomy, because that judgement is the work being paid for.",
  },
  {
    selector: '[data-tour="signal-button"]', nav: "dashboard",
    title: "A second opinion, grounded in this data",
    body: "Signal AI runs a debate between C-Suite personas who each query this portfolio before forming an opinion, and who are built to disagree rather than to converge politely. Open it any time you want the next move pressure-tested.",
  },
];
