// Brand-neutral copy for every deployment. This ships from app logic, not
// config, so it never needs to change between clients. Each step answers the
// question the anchored view exists to answer, not what the control does.
export const TOUR_STEPS = [
  {
    selector: '[data-tour="logo"]', nav: "dashboard",
    title: "Welcome to Marketers Lab",
    // No step count in the copy. It used to say "Four short stops" beside a
    // header rendering "1 of 5", which was defensible as "four more after this
    // one" and still read as a mistake. The header already carries the number,
    // so the prose does not need to — and now cannot go stale when a step is
    // added, which is exactly how it drifted the first time.
    body: "This is where a growth team keeps score: every experiment running right now, what it's expected to return, and what actually happened when it closed. A short tour, then you're on your own.",
  },
  {
    selector: '[data-tour="northstar"]', nav: "dashboard",
    title: "One number everything ladders up to",
    body: "The dashboard answers a single question: are we on track? North Star current vs. target, what's driving revenue right now, and what's still in flight, all above the fold.",
  },
  {
    selector: '[data-tour="brand-select"]', nav: "dashboard",
    title: "One portfolio, several brands",
    body: "This switches every view (dashboard, initiatives, learnings) from the blended portfolio down to a single brand's own numbers. Try one any time. Nothing here is destructive.",
  },
  {
    selector: '[data-tour="learning-card"]', nav: "library",
    title: "What actually happened, kept",
    body: "Every closed test lands here with its real outcome and the specific thing learned, including the failures. That record is what makes the next hypothesis better than a guess.",
  },
  {
    selector: '[data-tour="performance-intro"]', nav: "performance",
    title: "The ad names are the attribution layer",
    body: "Import a campaign export and every ad name is parsed back through your naming convention — a flat spend report becomes one you can pivot by audience, angle or format, and any ad whose name carries a tracking tag is joined to the initiative that ordered it. No pixel, no API integration.",
  },
  {
    selector: '[data-tour="signal-button"]', nav: "dashboard",
    title: "A second opinion, grounded in this data",
    body: "Signal AI runs a debate between C-Suite personas who argue from this exact live portfolio, not generic advice. Open it any time you want the next move pressure-tested.",
  },
];
