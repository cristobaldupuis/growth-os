// =============================================================================
// GROWTH OS — DEPLOYMENT CONFIG
// =============================================================================
// This file contains everything that changes between deployments.
// To create a new instance (e.g. for a different client):
//   1. Copy this file to config.[clientname].js
//   2. Fill in the values below
//   3. Point src/activeConfig.js at config.[clientname].js instead of this file
//   4. Deploy
//
// App logic never imports a config.*.js file directly — every app-logic file
// imports from src/activeConfig.js, a one-line re-export barrel. That barrel
// is the single switch point between clients; app logic itself never needs
// to change between clients.
// =============================================================================

// -----------------------------------------------------------------------------
// DEPLOYMENT MODE
// DEMO_MODE=true skips the onboarding wizard on first visit (a cold visitor
// gets the pre-loaded seed portfolio instead of a config form) and enables
// the guided tour, the "Demo data" indicator, and the reset-demo control.
// Leave false for a real client deployment — they still want onboarding.
// -----------------------------------------------------------------------------
export const DEMO_MODE = false;

// -----------------------------------------------------------------------------
// COMPANY
// -----------------------------------------------------------------------------
export const COMPANY_NAME     = "Growth OS";
export const BUSINESS_MODEL   = "Multi-retailer growth portfolio";

// -----------------------------------------------------------------------------
// NORTH STAR
// -----------------------------------------------------------------------------
export const NORTH_STAR_METRIC  = "Portfolio Revenue";
export const NORTH_STAR_CURRENT = "$1.1M/mo";
export const NORTH_STAR_TARGET  = "$1.4M/mo";

// -----------------------------------------------------------------------------
// BRANDS / RETAILERS
// Each brand needs a unique id, display name, and optional short code
// used as the prefix for initiative IDs (e.g. "NH" → NH-001).
// The first brand in the array is treated as the primary / default.
// -----------------------------------------------------------------------------
export const BRANDS = [
  { id: "default", name: "Northcove Home",  code: "NH" },
  { id: "r1",      name: "Retailer 1",      code: "R1" },
  { id: "r2",      name: "Retailer 2",      code: "R2" },
];

// -----------------------------------------------------------------------------
// INITIATIVE CATEGORIES
// Order determines display order and colour assignment.
// -----------------------------------------------------------------------------
export const CATEGORIES = [
  "Paid Media",
  "Organic",
  "Conversion",
  "Merchandising",
  "Retention",
  "Brand",
  "Data / Analytics",
];

// -----------------------------------------------------------------------------
// AI AGENTS (Signal AI / C-Suite Debate)
// Each agent needs: id, label, icon (emoji), color (hex), lens, blindspot.
// lens      — what this agent focuses on when analysing the portfolio
// blindspot — what this agent typically underweights (used by the Moderator)
// -----------------------------------------------------------------------------
export const AGENTS = [
  {
    id:        "cmo",
    label:     "CMO",
    icon:      "📣",
    color:     "#2878a0",
    lens:      "brand narrative, paid acquisition efficiency, creative testing, channel mix, top-of-funnel demand generation, and customer perception",
    blindspot: "often underweights unit economics and margin impact of acquisition spend",
  },
  {
    id:        "cfo",
    label:     "CFO",
    icon:      "📊",
    color:     "#C9A227",
    lens:      "contribution margin, CAC payback, gross profit per order, pricing architecture, promotional discount discipline, and cash flow timing",
    blindspot: "often underweights long-term compounding of brand and LTV investments",
  },
  {
    id:        "cgo",
    label:     "CGO",
    icon:      "🚀",
    color:     "#208050",
    lens:      "customer lifetime value, cohort retention, subscription velocity, referral loops, repeat purchase rate, and omnichannel expansion",
    blindspot: "often underweights operational complexity and supply chain constraints of growth initiatives",
  },
  {
    id:        "coo",
    label:     "COO",
    icon:      "⚙️",
    color:     "#7040a0",
    lens:      "inventory velocity, fulfilment cost per order, shelf-life risk, supplier lead times, SKU rationalisation, and operational scalability",
    blindspot: "often underweights brand equity and customer experience trade-offs of operational decisions",
  },
];

// -----------------------------------------------------------------------------
// INITIATIVE TEMPLATES
// Pre-filled starting points shown in the "Start from template" modal.
// Remove or add templates relevant to your client's business model.
// -----------------------------------------------------------------------------
export const TEMPLATES = [
  {
    id:          "ab",
    label:       "A/B Test",
    icon:        "ti-test-pipe",
    initType:    "A/B Test",
    description: "Split traffic between two variants to measure conversion impact.",
    defaults: {
      hypothesis:    "We believe that [changing X] will result in [metric improvement] for [audience], because [evidence or reasoning].",
      primaryMetric: "Conversion rate on [page/flow]",
      killCriteria:  "No statistically significant improvement (p<0.05) at [n] sessions per variant within [timeframe]. Use sequential testing.",
      sampleSize:    "[n] sessions per variant",
      duration:      "[2-4] weeks",
    },
  },
  {
    id:          "channel",
    label:       "Channel Experiment",
    icon:        "ti-speakerphone",
    initType:    "Campaign",
    description: "Test a new or underinvested acquisition or retention channel.",
    defaults: {
      hypothesis:    "We believe that investing in [channel] will result in [CAC/ROAS/volume] improvement for [audience segment], because [analogues or prior signal].",
      primaryMetric: "Incremental ROAS / CAC vs current channel mix",
      killCriteria:  "ROAS below [threshold] after [$spend] at [timeframe].",
      sampleSize:    "$[budget] test spend",
      duration:      "[3-6] weeks",
    },
  },
  {
    id:          "pricing",
    label:       "Pricing / Promo",
    icon:        "ti-tag",
    initType:    "Campaign",
    description: "Test price point, discount structure, or promotional mechanic.",
    defaults: {
      hypothesis:    "We believe that [price change / promo structure] will result in [revenue / margin / conversion] improvement, because [price elasticity signal or competitive context].",
      primaryMetric: "Revenue per visitor; gross margin impact",
      killCriteria:  "No improvement in revenue per visitor after [n] orders. Gross margin must not fall below [threshold].",
      sampleSize:    "[n] orders",
      duration:      "[2-3] weeks",
    },
  },
  {
    id:          "landing",
    label:       "Landing Page / PDP",
    icon:        "ti-layout",
    initType:    "A/B Test",
    description: "Test content, layout, or trust signals on a conversion-driving page.",
    defaults: {
      hypothesis:    "We believe that [content/layout change] on [page] will result in [CVR/ATC/bounce improvement] for [traffic segment], because [friction or trust signal identified].",
      primaryMetric: "CVR on [page]; secondary: ATC rate / bounce rate",
      killCriteria:  "No CVR improvement on affected pages after [n] sessions or [timeframe] vs prior baseline.",
      sampleSize:    "[n] sessions",
      duration:      "[2-3] weeks",
    },
  },
  {
    id:          "lifecycle",
    label:       "Lifecycle / CRM",
    icon:        "ti-mail",
    initType:    "Campaign",
    description: "Test a new email, SMS, or retention flow targeting a specific segment.",
    defaults: {
      hypothesis:    "We believe that [new flow / message] sent to [segment] will result in [reactivation / retention / LTV] improvement, because [segment behaviour or prior engagement signal].",
      primaryMetric: "Reactivation rate / repeat purchase rate within [n] days",
      killCriteria:  "Response rate below [threshold] after [n] sends to [n]+ recipients.",
      sampleSize:    "[n] customers",
      duration:      "[4-6] weeks",
    },
  },
  {
    id:          "merch",
    label:       "Merch / Assortment",
    icon:        "ti-shirt",
    initType:    "Process",
    description: "Test a merchandising change — bundle, sequencing, curation, or OOS handling.",
    defaults: {
      hypothesis:    "We believe that [merchandising change] will result in [AOV / attach rate / return rate] improvement, because [customer behaviour or friction identified].",
      primaryMetric: "AOV / attach rate / return rate on affected SKUs or pages",
      killCriteria:  "No improvement vs prior 2W baseline after [n] orders or [timeframe].",
      sampleSize:    "[n] orders / [n] sessions",
      duration:      "[2-4] weeks",
    },
  },
];

// -----------------------------------------------------------------------------
// ATTRIBUTION CONFIG
// Contract for config-driven attribution mapping consumed by
// normalizeInitiativeRecord() in src/services/csv.js.
//
// idMappings  — direct field-to-ID resolution; applied first, wins over patterns.
//   platform          — source adapter identifier (informational only).
//   sourceField       — field name on the incoming raw record.
//   initiativeIdField — internal field that receives the source field's value.
//
// patterns    — regex extraction for messy legacy naming; applied as fallback.
//   name          — human label used in warning logs when the pattern is skipped.
//   sourceField   — field on the raw record to match against.
//   regex         — string compiled at runtime via new RegExp(). Never eval'd.
//   captureGroup  — 1-based index of the capture group to extract.
//   target        — internal field on the normalised record to populate.
//
// Both mechanisms enrich a copy of the raw record before normalisation runs;
// callers remain unaware of the mapping step.
// -----------------------------------------------------------------------------
export const ATTRIBUTION_CONFIG = {
  idMappings: [
    // Meta Ads campaign_name carries the initiative ID when campaigns are
    // named by initiative (e.g. a campaign named exactly "NH-005").
    {
      platform: "meta",
      sourceField: "campaign_name",
      initiativeIdField: "initId",
    },
    // GA4 custom dimension written at event time by the tagging layer.
    {
      platform: "ga4",
      sourceField: "custom_dimension_initiative",
      initiativeIdField: "initId",
    },
    // Shopify order tags used by promos tied to a named initiative.
    {
      platform: "shopify",
      sourceField: "order_tag",
      initiativeIdField: "initId",
    },
  ],
  patterns: [
    // Extract initiative tracking slug from legacy Meta campaign names:
    //   "2025_Q3_retargeting_v2"  → "retargeting"   (→ trackingTag)
    //   "2026_Q1_sms-winback_v1"  → "sms-winback"
    {
      name: "legacy-campaign-slug",
      sourceField: "campaign_name",
      regex: "^\\d{4}_Q\\d_([a-z0-9-]+?)_v\\d+$",
      captureGroup: 1,
      target: "trackingTag",
    },
    // Extract initiative ID from GA4 event_label strings:
    //   "initiative:NH-007:bedding-quiz" → "NH-007"  (→ initId)
    {
      name: "ga4-event-label-id",
      sourceField: "event_label",
      regex: "initiative:([A-Z0-9]+-\\d+):",
      captureGroup: 1,
      target: "initId",
    },
    // Extract owner name from ad-set naming convention:
    //   "NH_Priya_retention_2025Q3" → "Priya"        (→ owner)
    {
      name: "adset-owner-extraction",
      sourceField: "adset_name",
      regex: "^[A-Z0-9]+_([A-Za-z]+)_",
      captureGroup: 1,
      target: "owner",
    },
  ],
};

// -----------------------------------------------------------------------------
// SEED INITIATIVES
// Shown on first load before the user has added any data.
// Replace with real initiatives relevant to the client, or set to [] for a
// blank starting state.
//
// Required fields per initiative:
//   id, initId, title, initType, hypothesis, category, owner,
//   primaryMetric, killCriteria, status, startDate, endDate,
//   ice: { impact, certainty, ease },
//   revenueImpact, linkedIds, results (null or object), createdAt, brandId
//
// brandId must match one of the ids in BRANDS above.
// initId convention: [brand code]-[zero-padded number] e.g. NH-001
// -----------------------------------------------------------------------------
const SEED_AUTHORED = [
  {
    id: "e01", initId: "NH-001",
    title: "Widget A/B — Pause Personalization on Mobile Collection Pages",
    initType: "A/B Test",
    hypothesis: "Removing personalization widgets from paid-social mobile entry traffic to lighting and living room collections will recover CVR toward prior 4W baseline (1.85%) by eliminating load-time and rendering friction introduced in late March.",
    category: "Conversion", owner: "Site / Product",
    primaryMetric: "CVR on paid-social mobile entry",
    killCriteria: "Cell B CVR >= 1.76% = widgets confirmed as cause. Cell B flat = widen investigation.",
    status: "Running", startDate: "2026-05-12", endDate: "2026-06-07",
    ice: { impact: 9, certainty: 7, ease: 8 }, revenueImpact: 118352,
    linkedIds: ["e02","e03","e04"], results: null, createdAt: "2026-05-10",
    brandId: "default",
    notes: "Cell A: widgets on. Cell B: widgets off. Scoped to paid-social mobile only.",
  },
  {
    id: "e02", initId: "NH-002",
    title: "PDP Content Fix — Delivery Clarity, Swatches, OOS on Top 20 SKUs",
    initType: "Process",
    hypothesis: "Fixing delivery messaging, swatch clarity, and OOS display on the top 20 traffic-driving SKUs will reduce checkout abandonment and improve new-visitor CVR by 15-20% on affected PDPs.",
    category: "Merchandising", owner: "Merch + Site",
    primaryMetric: "New-visitor CVR on top 20 SKUs; care ticket volume",
    killCriteria: "No CVR improvement on affected SKUs after 2 weeks vs prior baseline.",
    status: "Running", startDate: "2026-05-12", endDate: "2026-05-26",
    ice: { impact: 7, certainty: 8, ease: 7 }, revenueImpact: 34112,
    linkedIds: ["e01","e03"], results: null, createdAt: "2026-05-10",
    brandId: "default",
    notes: "Runs parallel to widget test.",
  },
  {
    id: "e03", initId: "NH-003",
    title: "Weekly Growth Triage — Collection Health Scorecard",
    initType: "Process",
    hypothesis: "A shared weekly triage with a scored collection-page health system will reduce mean time to intervention on conversion problems by at least 50% by eliminating the five-team information silo.",
    category: "Conversion", owner: "Director of Growth",
    primaryMetric: "Mean time to intervention; scorecard adoption across 5 functions",
    killCriteria: "If triage fails to produce one owner-assigned action per week after 3 sessions, redesign.",
    status: "Running", startDate: "2026-05-12", endDate: "2026-06-30",
    ice: { impact: 6, certainty: 9, ease: 8 }, revenueImpact: 0,
    linkedIds: ["e01","e02","e04"], results: null, createdAt: "2026-05-10",
    brandId: "default",
    notes: "Monday cadence.",
  },
  {
    id: "e04", initId: "NH-004",
    title: "Mobile PDP QA Walk — New Customer Entry Products",
    initType: "Research",
    hypothesis: "A structured mobile PDP audit of new-visitor entry products will uncover rendering, load, and trust issues contributing to the 11-12x CVR gap between new visitors and returning customers.",
    category: "Conversion", owner: "Director of Growth",
    primaryMetric: "Actionable issues found per PDP; % resolved within 2 weeks",
    killCriteria: "Discovery task — output is a prioritized bug list.",
    status: "Completed", startDate: "2026-05-12", endDate: "2026-05-19",
    ice: { impact: 7, certainty: 9, ease: 9 }, revenueImpact: 0,
    linkedIds: ["e01","e02"],
    results: {
      actualOutcome: "14 actionable issues found across 12 PDPs. Swatch rendering broken on 6 lighting SKUs. Delivery messaging absent on 4 living room hero SKUs. Avg load time 5.1s.",
      keyLearning: "New visitors hit a materially degraded PDP experience independent of widgets — fixing content and load in parallel is not optional.",
      outcomeClassification: "Success",
      decisionMade: "8 of 14 issues resolved same week. Remaining 6 tracked in weekly triage.",
      outcomeCertainty: 90, actualRevenueImpact: 0,
    },
    createdAt: "2026-05-10", brandId: "default",
  },
  {
    id: "e05", initId: "NH-005",
    title: "Paid Social Spend Hold — No Budget Increase Until CVR Recovers",
    initType: "Process",
    hypothesis: "Holding paid social spend flat until new-visitor CVR recovers to >= 1.76% will improve incremental ROAS from 0.24x by stopping paid volume from flowing into a broken funnel.",
    category: "Paid Media", owner: "Paid + Director of Growth",
    primaryMetric: "Incremental ROAS; new-visitor CVR WoW",
    killCriteria: "Hold lifted when widget test resolves and CVR recovers to >= 1.76%.",
    status: "Running", startDate: "2026-05-12", endDate: "2026-06-07",
    ice: { impact: 8, certainty: 9, ease: 9 }, revenueImpact: 80000,
    linkedIds: ["e01","e06"], results: null, createdAt: "2026-05-10",
    brandId: "default",
    notes: "Incremental ROAS last 4W = 0.24x.",
  },
  {
    id: "e06", initId: "R1-001",
    title: "Email Welcome Series — Reduce First-Purchase Drop-off",
    initType: "Campaign",
    hypothesis: "A 3-email welcome series sent within 48h of signup will increase first-purchase conversion rate by 12% by building product trust before discount dependency forms.",
    category: "Retention", owner: "CRM",
    primaryMetric: "First-purchase CVR within 30 days of signup",
    killCriteria: "No improvement in first-purchase CVR vs control after 4 weeks with 2,000+ recipients.",
    status: "Running", startDate: "2026-05-01", endDate: "2026-06-15",
    ice: { impact: 7, certainty: 7, ease: 8 }, revenueImpact: 38000,
    linkedIds: [], results: null, createdAt: "2026-05-01",
    brandId: "r1",
    notes: "Retailer 1 has high signup-to-purchase drop-off (68%). Welcome series is low-cost, high-leverage.",
  },
  {
    id: "e07", initId: "NH-007",
    title: "Collection Rebuild — Top Paid-Social Landing Pages",
    initType: "A/B Test",
    hypothesis: "Rebuilding lighting and living room collection pages with in-stock priority sequencing, load-time optimization, and hero-SKU variant gap resolution will recover CVR to prior 4W baseline and support paid social scaling at ROAS above 1.5x.",
    category: "Conversion", owner: "Site / Product + Merch",
    primaryMetric: "Collection-page CVR; mobile load time; OOS rate on hero SKUs",
    killCriteria: "Scope changes if widget test Cell B is not materially better than Cell A.",
    status: "Draft", startDate: "2026-06-10", endDate: "2026-07-01",
    ice: { impact: 9, certainty: 6, ease: 5 }, revenueImpact: 118352,
    linkedIds: ["e01","e02","e04"], results: null, createdAt: "2026-05-10",
    brandId: "default",
    notes: "Second move — scope depends on widget test result.",
  },
  {
    id: "e08", initId: "NH-008",
    title: "Sitewide 15% Promo — Rejected",
    initType: "Campaign",
    hypothesis: "A sitewide 15% promotional discount will lift CVR quickly and protect topline revenue while conversion infrastructure issues are resolved.",
    category: "Merchandising", owner: "Finance",
    primaryMetric: "CVR lift; gross margin impact",
    killCriteria: "N/A — not pursuing.",
    status: "Killed", startDate: "2026-05-10", endDate: "2026-05-14",
    ice: { impact: 3, certainty: 2, ease: 8 }, revenueImpact: -118000,
    linkedIds: [],
    results: {
      actualOutcome: "Decision not to pursue. Gross profit already down $118k last 4W. Decor markdown at 23%.",
      keyLearning: "Promo compresses margin without addressing root cause — the problem is site experience, not price.",
      outcomeClassification: "Failed",
      decisionMade: "Do not pursue. Revisit only after CVR infrastructure is stable.",
      outcomeCertainty: 95, actualRevenueImpact: 0,
    },
    createdAt: "2026-05-10", brandId: "default",
  },
  {
    id: "e09", initId: "NH-009",
    title: "Paid Social +25% Scale — Rejected",
    initType: "Campaign",
    hypothesis: "Increasing paid social spend 25% into current winning audiences will accelerate new-customer growth given improving creative CTR.",
    category: "Paid Media", owner: "Paid",
    primaryMetric: "New-customer revenue; incremental ROAS",
    killCriteria: "N/A — not pursuing.",
    status: "Killed", startDate: "2026-05-10", endDate: "2026-05-14",
    ice: { impact: 4, certainty: 2, ease: 7 }, revenueImpact: -60000,
    linkedIds: ["e05"],
    results: {
      actualOutcome: "Rejected. Incremental ROAS = 0.24x. $80k spend generated $19k incremental revenue.",
      keyLearning: "Scaling volume into a broken funnel makes the problem more expensive, not better.",
      outcomeClassification: "Failed",
      decisionMade: "Hold spend. Confirm attribution methodology first.",
      outcomeCertainty: 92, actualRevenueImpact: -60000,
    },
    createdAt: "2026-05-10", brandId: "default",
  },
  {
    id: "e10", initId: "NH-010",
    title: "Homepage Hero Redesign — Premium Brand Presentation",
    initType: "A/B Test",
    hypothesis: "Redesigning the homepage hero and seasonal brand creative to feel more premium and less promotional will improve trust signals for new visitors and support conversion quality over time.",
    category: "Brand", owner: "Brand",
    primaryMetric: "New-visitor bounce rate; new-visitor CVR on brand-entry traffic",
    killCriteria: "No measurable improvement in new-visitor bounce rate or CVR after 4 weeks.",
    status: "Draft", startDate: "2026-07-01", endDate: "2026-08-01",
    ice: { impact: 5, certainty: 4, ease: 6 }, revenueImpact: 22000,
    linkedIds: ["e01","e02"], results: null, createdAt: "2026-05-10",
    brandId: "default",
    notes: "Sequenced after widget test and PDP fixes.",
  },
  {
    id: "e11", initId: "R2-001",
    title: "PDP Image Quality Uplift — High-Res Lifestyle Photography",
    initType: "A/B Test",
    hypothesis: "Replacing stock product images with high-resolution lifestyle photography on top 15 PDPs will increase add-to-cart rate by 10% by reducing purchase hesitation caused by poor visual trust.",
    category: "Conversion", owner: "Merchandising",
    primaryMetric: "Add-to-cart rate on affected PDPs",
    killCriteria: "No ATC improvement after 3 weeks with 3,000+ sessions per variant.",
    status: "Completed", startDate: "2026-04-01", endDate: "2026-05-01",
    ice: { impact: 6, certainty: 7, ease: 5 }, revenueImpact: 28000,
    spendCost: 8000, resourceCost: 4000, linkedIds: [],
    results: {
      actualOutcome: "ATC rate improved 14.2% on lifestyle-image PDPs vs control. Strongest lift on furniture category (+19%). No impact on accessories.",
      keyLearning: "High-quality lifestyle imagery materially lifts purchase intent on considered purchases — the effect is category-specific, not sitewide.",
      outcomeClassification: "Success",
      decisionMade: "Roll out to all furniture PDPs. Accessories deprioritised. Northcove team briefed for similar test.",
      outcomeCertainty: 88, actualRevenueImpact: 31000, actualSpendCost: 9200, actualResourceCost: 4500,
    },
    createdAt: "2026-04-01", brandId: "r2",
  },
  {
    id: "e12", initId: "R2-002",
    title: "Checkout Flow Simplification — Remove Optional Fields",
    initType: "A/B Test",
    hypothesis: "Removing 3 optional form fields from the checkout flow will reduce checkout abandonment by 8% by lowering cognitive load at the point of highest purchase intent.",
    category: "Conversion", owner: "Product",
    primaryMetric: "Checkout completion rate; abandonment rate",
    killCriteria: "No improvement in checkout completion rate after 2 weeks with 1,500+ checkout sessions.",
    status: "Draft", startDate: "2026-06-01", endDate: "2026-07-01",
    ice: { impact: 8, certainty: 8, ease: 7 }, revenueImpact: 52000,
    spendCost: 0, resourceCost: 6000, linkedIds: ["e11"], results: null,
    createdAt: "2026-05-10", brandId: "r2",
    notes: "Informed by e11 learnings — trust signals matter, so friction reduction should amplify the uplift.",
  },

  // ===========================================================================
  // NORTHCOVE HOME (default) — 8 new
  // ===========================================================================

  {
    id: "e13", initId: "NH-011",
    title: "SMS abandoned-cart at 30 minutes",
    initType: "Campaign",
    hypothesis: "We believe a 30-minute SMS abandoned-cart nudge for mobile checkout abandoners will recover 8-12% of carts, because urgency on mobile beats a delayed email when the buyer is still in-session.",
    category: "Retention", owner: "Priya",
    primaryMetric: "Cart recovery rate",
    killCriteria: "Opt-out rate >4% sustained over 2 weeks.",
    status: "Completed", startDate: "2026-03-04", endDate: "2026-04-01",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 22000,
    linkedIds: [], createdAt: "2026-03-01",
    brandId: "default",
    notes: "Compliance check passed with legal.",
    results: {
      actualOutcome: "Recovery rate landed at 11.2% (target 8-12%). Opt-out 1.8%. $28k recovered over 4 weeks.",
      keyLearning: "30-minute SMS window outperforms 1-hour for mobile carts. Win goes to immediacy, not message length.",
      outcomeClassification: "Success",
      decisionMade: "Make evergreen. Test 15-min window for high-AOV carts next.",
      outcomeCertainty: 85, actualRevenueImpact: 28000,
    },
  },

  {
    id: "e14", initId: "NH-012",
    title: "SMS win-back: lapsed 90-day customers",
    initType: "Campaign",
    hypothesis: "We believe a 3-message SMS win-back sequence to 90-day lapsed customers will recover 10-15% of revenue from that cohort, because a tiered incentive reactivates intent when email open rates have decayed.",
    category: "Retention", owner: "Priya",
    primaryMetric: "Reactivation revenue",
    killCriteria: "Open-equivalent <40% on message 1.",
    status: "Completed", startDate: "2026-04-08", endDate: "2026-05-06",
    ice: { impact: 7, certainty: 8, ease: 9 }, revenueImpact: 30000,
    linkedIds: ["e13"], createdAt: "2026-04-05",
    brandId: "default",
    results: {
      actualOutcome: "Recovered $34k (target $30k). Message 2 (tiered incentive) drove 64% of conversions.",
      keyLearning: "Message 2 is the workhorse in a 3-message win-back. The opener primes; the incentive converts.",
      outcomeClassification: "Jackpot",
      decisionMade: "Evergreen. Build a 180-day variant with longer interval cadence.",
      outcomeCertainty: 90, actualRevenueImpact: 34000,
    },
  },

  {
    id: "e15", initId: "NH-013",
    title: "Paid social: UGC creative scale push on Meta",
    initType: "Campaign",
    hypothesis: "We believe scaling UGC-style creative on Meta prospecting will lower CAC by 18-25%, because authentic content outperforms studio shots for home goods at the consideration stage.",
    category: "Paid Media", owner: "Diego",
    primaryMetric: "Blended CAC",
    killCriteria: "CAC >$48 sustained 10 days.",
    status: "Killed", startDate: "2026-02-10", endDate: "2026-02-26",
    ice: { impact: 9, certainty: 4, ease: 6 }, revenueImpact: 90000,
    linkedIds: [], createdAt: "2026-02-08",
    brandId: "default",
    notes: "Killed early per kill criteria.",
    results: {
      actualOutcome: "CAC climbed from $34 to $61 within 10 days. Creative fatigue hit faster than expected. Net contribution -$12k after spend.",
      keyLearning: "UGC creative fatigues fast at scale without a refresh pipeline. Need 3+ new variants weekly to sustain. Without that infrastructure, scaling UGC is scaling decline.",
      outcomeClassification: "Failed",
      decisionMade: "Pause. Build a UGC refresh pipeline (briefs + creator network + edit cadence) before re-launch. Estimated 6 weeks to stand up.",
      outcomeCertainty: 75, actualRevenueImpact: -12000,
    },
  },

  {
    id: "e16", initId: "NH-014",
    title: "Free shipping threshold: $75 vs $50",
    initType: "A/B Test",
    hypothesis: "We believe raising the free-shipping threshold from $50 to $75 will lift AOV by 15-20% with <2% conversion loss, because anchoring nudges add-on purchases for home decor where bundles are natural.",
    category: "Merchandising", owner: "Maya",
    primaryMetric: "AOV (net of returns)",
    killCriteria: "AOV drop >5% over 2 weeks OR conversion drop >3%.",
    status: "Completed", startDate: "2026-01-13", endDate: "2026-02-10",
    ice: { impact: 8, certainty: 6, ease: 9 }, revenueImpact: 60000,
    linkedIds: [], createdAt: "2026-01-10",
    brandId: "default",
    results: {
      actualOutcome: "AOV rose from $64 to $79 (+23%). Conversion dipped 1.1%. Net revenue per session +18%. n=14,200, p<0.01.",
      keyLearning: "$75 threshold is the sweet spot for home goods. Conversion loss was real but immaterial against AOV lift. Should re-test at $85 in Q3.",
      outcomeClassification: "Success",
      decisionMade: "Roll out permanently. Schedule $85 test for Q3.",
      outcomeCertainty: 90, actualRevenueImpact: 72000,
    },
  },

  {
    id: "e17", initId: "NH-015",
    title: "Post-purchase upsell: candle bundle",
    initType: "Campaign",
    hypothesis: "We believe a one-click post-purchase candle bundle offer will increase units per order by 15-20%, because momentum at checkout reduces decision friction for impulse-priced add-ons.",
    category: "Retention", owner: "Diego",
    primaryMetric: "Attach rate (% of orders adding bundle)",
    killCriteria: "Attach rate <3% after 2 weeks.",
    status: "Completed", startDate: "2026-03-15", endDate: "2026-04-12",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 45000,
    linkedIds: [], createdAt: "2026-03-12",
    brandId: "default",
    results: {
      actualOutcome: "Attach rate landed at 2.1% (modeled 5%). First-time buyers attached at 1.4%; repeat at 4.8%. Revenue contribution $18k.",
      keyLearning: "Post-purchase upsells underperform for first-time buyers — too early in the trust curve. Works materially better for repeat customers where the bundle reads as 'continuation' not 'second decision'.",
      outcomeClassification: "Inconclusive",
      decisionMade: "Limit to returning customers only. Re-test with segment gating and a wider bundle library.",
      outcomeCertainty: 75, actualRevenueImpact: 18000,
    },
  },

  {
    id: "e18", initId: "NH-016",
    title: "PDP: reviews module above the fold",
    initType: "A/B Test",
    hypothesis: "We believe surfacing the top 3 reviews above the fold on PDPs will lift conversion by 5-8%, because social proof reduces purchase hesitation for considered home purchases.",
    category: "Conversion", owner: "Maya",
    primaryMetric: "PDP-to-cart conversion rate",
    killCriteria: "CVR drop >1.5% sustained over 2 weeks.",
    status: "Completed", startDate: "2026-04-15", endDate: "2026-05-13",
    ice: { impact: 7, certainty: 7, ease: 6 }, revenueImpact: 44000,
    linkedIds: [], createdAt: "2026-04-12",
    brandId: "default",
    notes: "Clean test. n=18,400. Significance reached on day 17.",
    results: {
      actualOutcome: "PDP CVR -2.1% (control 3.4%, test 3.3%). Hit kill threshold but allowed to complete. p<0.05, n=18,400.",
      keyLearning: "The hypothesis was wrong. Reviews above the fold compete with hero imagery on home decor — buyers are visual-first, and pushing reviews up demotes the product photo that's doing the heavy lifting. The right placement is below hero, above price. Heatmaps confirmed users scrolled past the reviews to find the photo anyway.",
      outcomeClassification: "Failed",
      decisionMade: "Roll back. Schedule re-test with reviews placed below hero, above price block. Useful negative result — direction matters more than presence.",
      outcomeCertainty: 90, actualRevenueImpact: -12000,
    },
  },

  {
    id: "e19", initId: "NH-017",
    title: "Subscribe & save for consumables (candles, refills)",
    initType: "Infrastructure",
    hypothesis: "We believe launching subscribe-and-save on candles and refills will lift repeat-purchase rate by 25-30% in that category, because consumables suit subscription mechanics and our buyer has demonstrated reorder cadence of 8-10 weeks.",
    category: "Retention", owner: "Diego",
    primaryMetric: "Repeat purchase rate on consumables",
    killCriteria: "Monthly subscription churn >12%.",
    status: "Blocked", startDate: "2026-06-01", endDate: "2026-08-15",
    ice: { impact: 9, certainty: 5, ease: 3 }, revenueImpact: 120000,
    linkedIds: [], createdAt: "2026-05-15",
    brandId: "default",
    notes: "Blocked: requires inventory system upgrade to handle recurring SKU allocation. Inventory upgrade is a separate Q3 initiative not yet started.",
  },

  {
    id: "e20", initId: "NH-018",
    title: "Bedding finder quiz funnel",
    initType: "A/B Test",
    hypothesis: "We believe a 5-question guided bedding-finder quiz will increase add-to-cart rate by 12-18% on bedding category traffic, because reducing choice paralysis converts browsers who would otherwise bounce.",
    category: "Conversion", owner: "Maya",
    primaryMetric: "Add-to-cart rate on bedding category",
    killCriteria: "ATC drop >2% sustained 10 days.",
    status: "Running", startDate: "2026-05-15", endDate: "2026-06-15",
    ice: { impact: 8, certainty: 6, ease: 5 }, revenueImpact: 52000,
    linkedIds: [], createdAt: "2026-05-12",
    brandId: "default",
    notes: "Running 50/50 split. Early signal: quiz completers convert 2.1x non-completers.",
  },

  // ===========================================================================
  // RETAILER 1 (r1) — beauty/skincare DTC — 10 new
  // ===========================================================================

  {
    id: "e21", initId: "R1-002",
    title: "SMS browse-abandon trigger for PDP viewers",
    initType: "Campaign",
    hypothesis: "We believe a 2-hour SMS browse-abandon trigger for high-intent PDP viewers (3+ pages) will recover 6-10% of would-be lost sessions, because skincare buyers research repeatedly before committing.",
    category: "Retention", owner: "Sasha",
    primaryMetric: "Browse-abandon recovery revenue",
    killCriteria: "Opt-out >3% OR recovery <3%.",
    status: "Completed", startDate: "2026-03-18", endDate: "2026-04-15",
    ice: { impact: 7, certainty: 7, ease: 8 }, revenueImpact: 18000,
    linkedIds: [], createdAt: "2026-03-15",
    brandId: "r1",
    results: {
      actualOutcome: "Recovery rate 8.4% (target 6-10%). Opt-out 1.2%. $24k recovered over 4 weeks.",
      keyLearning: "Skincare buyers' multi-session research pattern is exploitable with browse-triggered SMS. 2-hour delay outperformed 30-min — gives the buyer space to think, then nudges.",
      outcomeClassification: "Success",
      decisionMade: "Make evergreen. Extend trigger to add-to-cart abandoners with same 2-hour delay.",
      outcomeCertainty: 85, actualRevenueImpact: 24000,
    },
  },

  {
    id: "e22", initId: "R1-003",
    title: "Sample-pack acquisition offer at $5",
    initType: "Campaign",
    hypothesis: "We believe offering a $5 sample-pack of 4 hero products to new visitors will lift first-purchase conversion by 30-40%, because the price-to-trial barrier is lower than committing to a full SKU.",
    category: "Paid Media", owner: "Sasha",
    primaryMetric: "First-purchase conversion rate on paid traffic",
    killCriteria: "Full-price follow-on rate <25%.",
    status: "Completed", startDate: "2026-02-01", endDate: "2026-03-15",
    ice: { impact: 7, certainty: 8, ease: 8 }, revenueImpact: 40000,
    linkedIds: [], createdAt: "2026-01-25",
    brandId: "r1",
    results: {
      actualOutcome: "First-purchase CVR rose 47% on paid. 38% of sample buyers placed a full-price order within 30 days. LTV at 60 days exceeded non-sample acquisition by $34.",
      keyLearning: "Sample acquisition outperforms discount-led acquisition for considered-purchase beauty. The $5 commitment filters tire-kickers AND demonstrates intent better than a percentage discount would.",
      outcomeClassification: "Jackpot",
      decisionMade: "Evergreen. Build a sample-pack landing page with paid traffic feed. Test $7 price ceiling in Q3.",
      outcomeCertainty: 90, actualRevenueImpact: 68000,
    },
  },

  {
    id: "e23", initId: "R1-004",
    title: "Paid social: lifestyle creative scale on Meta + TikTok",
    initType: "Campaign",
    hypothesis: "We believe scaling lifestyle-style creative on Meta and TikTok will lower CAC by 20%, because aspirational content drives the discovery flywheel for skincare.",
    category: "Paid Media", owner: "Sasha",
    primaryMetric: "Blended CAC across Meta + TikTok",
    killCriteria: "CAC >$55 sustained 10 days.",
    status: "Killed", startDate: "2026-04-20", endDate: "2026-05-08",
    ice: { impact: 8, certainty: 5, ease: 6 }, revenueImpact: 50000,
    linkedIds: ["e15"], createdAt: "2026-04-18",
    brandId: "r1",
    notes: "Killed early. Same pattern as Northcove's NH-013 — creative fatigue without refresh pipeline.",
    results: {
      actualOutcome: "CAC climbed from $38 to $58 in 12 days. CPM doubled on Meta; TikTok held longer but degraded by day 14. Net contribution -$8k.",
      keyLearning: "Same root cause as the Northcove paid-social burn: without a creative refresh pipeline (3+ new variants weekly), scaling lifestyle creative fatigues the audience within 10-14 days. The mistake was assuming TikTok would absorb the spend better than Meta — it did, but only by 4 days.",
      outcomeClassification: "Failed",
      decisionMade: "Pause until a creative ops capability stands up. Coordinate with Northcove team — this is now a portfolio-wide constraint.",
      outcomeCertainty: 80, actualRevenueImpact: -8000,
    },
  },

  {
    id: "e24", initId: "R1-005",
    title: "Email: review module embedded in nurture flow",
    initType: "Campaign",
    hypothesis: "We believe embedding 3 verified reviews in email 4 of the new-subscriber nurture flow will lift email-to-purchase conversion by 8-12%, because social proof at the consideration stage closes hesitant buyers.",
    category: "Retention", owner: "Sasha",
    primaryMetric: "Email-to-purchase conversion (email 4)",
    killCriteria: "Conversion drop on email 4 vs control.",
    status: "Completed", startDate: "2026-04-01", endDate: "2026-04-29",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 20000,
    linkedIds: [], createdAt: "2026-03-28",
    brandId: "r1",
    results: {
      actualOutcome: "Email 4 CTR +14%, purchase rate +9.2%. Total flow revenue +$19k over 4 weeks.",
      keyLearning: "Reviews work in email because the buyer is already engaged. Differs from PDP placement (where reviews compete with hero imagery) — email has no competing visual hierarchy.",
      outcomeClassification: "Success",
      decisionMade: "Roll into evergreen flow. Test review module in emails 2 and 6 next.",
      outcomeCertainty: 80, actualRevenueImpact: 19000,
    },
  },

  {
    id: "e25", initId: "R1-006",
    title: "Influencer micro-creator pilot (10 creators)",
    initType: "Campaign",
    hypothesis: "We believe a 10-creator micro-influencer pilot (10-50k followers) will deliver lower CAC than paid social by 25%, because trust transfer in beauty is highest from creators with niche audiences.",
    category: "Paid Media", owner: "Sasha",
    primaryMetric: "CAC from creator-attributed traffic",
    killCriteria: "CAC equal to or worse than paid social.",
    status: "Completed", startDate: "2026-03-10", endDate: "2026-04-21",
    ice: { impact: 7, certainty: 5, ease: 4 }, revenueImpact: 35000,
    linkedIds: [], createdAt: "2026-03-05",
    brandId: "r1",
    results: {
      actualOutcome: "Attributed revenue $12k. Of 10 creators, 3 drove 80% of revenue, 5 broke even, 2 were net negative. CAC overall $42 vs paid social $46 — marginal win.",
      keyLearning: "Creator selection is the entire ballgame. The 3 winners shared: long-form video format, organic mention pattern (not 'sponsored post' framing), and audience size 25-50k. Smaller creators underperformed; larger ones cost too much per unit.",
      outcomeClassification: "Inconclusive",
      decisionMade: "Re-pilot with 6 creators matching the winner profile only. Cut the 5-9 follower bracket entirely.",
      outcomeCertainty: 65, actualRevenueImpact: 12000,
    },
  },

  {
    id: "e26", initId: "R1-007",
    title: "Tiered loyalty program v1",
    initType: "Infrastructure",
    hypothesis: "We believe launching a 3-tier loyalty program (points + early access + creator perks) will lift repeat-purchase rate by 18-22% within 90 days, because skincare buyers respond to status mechanics over pure discount.",
    category: "Retention", owner: "Sasha",
    primaryMetric: "Repeat purchase rate (90-day cohort)",
    killCriteria: "Enrollment <15% of orders.",
    status: "Running", startDate: "2026-05-01", endDate: "2026-08-01",
    ice: { impact: 8, certainty: 6, ease: 4 }, revenueImpact: 60000,
    linkedIds: [], createdAt: "2026-04-25",
    brandId: "r1",
    notes: "Soft-launched at week 2. Enrollment at 28% so far.",
  },

  {
    id: "e27", initId: "R1-008",
    title: "Skin-type quiz product finder",
    initType: "A/B Test",
    hypothesis: "We believe a 7-question skin-type quiz with personalised product recs will lift add-to-cart rate by 15-20% from quiz completers, because skincare purchases are routine-dependent and reducing decision load converts.",
    category: "Conversion", owner: "Sasha",
    primaryMetric: "ATC rate from quiz completers",
    killCriteria: "Quiz completion <40%.",
    status: "Completed", startDate: "2026-01-20", endDate: "2026-02-24",
    ice: { impact: 7, certainty: 7, ease: 6 }, revenueImpact: 30000,
    linkedIds: [], createdAt: "2026-01-15",
    brandId: "r1",
    results: {
      actualOutcome: "Quiz completion 54%. ATC from completers 2.4x site avg. Revenue per quiz session +47%.",
      keyLearning: "Quizzes convert when the input feels diagnostic, not promotional. Question phrasing mattered — 'How does your skin feel by 3pm?' outperformed 'What's your skin type?' by 18% in completion.",
      outcomeClassification: "Success",
      decisionMade: "Make permanent. Build a routine-builder quiz as the next layer.",
      outcomeCertainty: 85, actualRevenueImpact: 38000,
    },
  },

  {
    id: "e28", initId: "R1-009",
    title: "Replenishment subscription on hero SKUs",
    initType: "Infrastructure",
    hypothesis: "We believe a subscribe-and-save option on 6 hero SKUs (cleansers, serums) will lift LTV by 20-25%, because hero SKUs have demonstrated reorder cadence of 5-7 weeks.",
    category: "Retention", owner: "Sasha",
    primaryMetric: "LTV (90-day) for subscribers vs one-time buyers",
    killCriteria: "Monthly churn >10%.",
    status: "Draft", startDate: "2026-07-01", endDate: "2026-09-30",
    ice: { impact: 8, certainty: 7, ease: 5 }, revenueImpact: 85000,
    linkedIds: ["e19"], createdAt: "2026-05-20",
    brandId: "r1",
    notes: "Draft. Can leverage learnings from Northcove subscribe-and-save once that ships.",
  },

  {
    id: "e29", initId: "R1-010",
    title: "Live-shopping event pilot (Instagram + site)",
    initType: "Campaign",
    hypothesis: "We believe a 60-minute live-shopping event with a founder + 2 creators will drive $25-35k in event-window revenue, because synchronous demand creation works for skincare's experiential nature.",
    category: "Brand", owner: "Sasha",
    primaryMetric: "Event-window revenue (event + 24h)",
    killCriteria: "Concurrent viewership <500.",
    status: "Completed", startDate: "2026-02-26", endDate: "2026-02-27",
    ice: { impact: 6, certainty: 4, ease: 3 }, revenueImpact: 25000,
    linkedIds: [], createdAt: "2026-02-15",
    brandId: "r1",
    results: {
      actualOutcome: "Peak concurrent 340. Event revenue $2.8k. 24h tail another $200. Total $3k vs $25k target.",
      keyLearning: "Live-shopping demands audience density we don't yet have. The format works for brands with established communities; for an acquisition-led brand, the room was too small to generate momentum. Production cost ($12k) far exceeded return.",
      outcomeClassification: "Failed",
      decisionMade: "Shelve format until community size doubles. Revisit Q4 with email-driven RSVP gating.",
      outcomeCertainty: 90, actualRevenueImpact: 3000,
    },
  },

  {
    id: "e30", initId: "R1-011",
    title: "Restock alerts via email for OOS SKUs",
    initType: "Infrastructure",
    hypothesis: "We believe a restock-alert email program for out-of-stock SKUs will capture 60-70% of would-be-lost demand, because intent signal from OOS visitors is unusually high.",
    category: "Conversion", owner: "Sasha",
    primaryMetric: "Restock-attributed revenue per OOS event",
    killCriteria: "Sign-up rate <8% on OOS pages.",
    status: "Completed", startDate: "2026-04-22", endDate: "2026-05-20",
    ice: { impact: 5, certainty: 8, ease: 9 }, revenueImpact: 12000,
    linkedIds: [], createdAt: "2026-04-20",
    brandId: "r1",
    results: {
      actualOutcome: "Sign-up rate 18%. Restock-to-purchase conversion 41%. $15k recovered across 4 OOS events.",
      keyLearning: "OOS demand is more capturable than expected — the buyer has already committed mentally. The send-on-restock email should include the SKU image; text-only versions underconverted by 22%.",
      outcomeClassification: "Success",
      decisionMade: "Evergreen. Build same feature for size-OOS variants on apparel-style SKUs.",
      outcomeCertainty: 85, actualRevenueImpact: 15000,
    },
  },

  // ===========================================================================
  // RETAILER 2 (r2) — apparel/accessories — 7 new
  // ===========================================================================

  {
    id: "e31", initId: "R2-003",
    title: "Paid social with weekly creative refresh discipline",
    initType: "Campaign",
    hypothesis: "We believe maintaining 3 new creative variants weekly on Meta prospecting will hold CAC flat at scale, because the underlying audience-fatigue mechanic is the constraint, not creative quality itself.",
    category: "Paid Media", owner: "Jordan",
    primaryMetric: "Blended CAC at +40% spend",
    killCriteria: "CAC drift >15% over 14 days.",
    status: "Completed", startDate: "2026-03-25", endDate: "2026-05-06",
    ice: { impact: 7, certainty: 7, ease: 5 }, revenueImpact: 40000,
    linkedIds: ["e15","e23"], createdAt: "2026-03-20",
    brandId: "r2",
    notes: "Designed in direct response to the Northcove and Retailer 1 paid-social burns — testing the inverse hypothesis: refresh cadence is the lever.",
    results: {
      actualOutcome: "Held CAC at $32-$36 across 6 weeks at +40% spend. Refresh cadence held: 18 new variants shipped. Revenue +$52k attributable.",
      keyLearning: "The earlier brand failures weren't a creative-style problem; they were a creative-ops problem. With a refresh pipeline in place, the same Meta channel scales without fatigue. The operational capability is the unlock.",
      outcomeClassification: "Success",
      decisionMade: "Codify creative-ops playbook. Share with Northcove and Retailer 1 — this is now portfolio IP.",
      outcomeCertainty: 90, actualRevenueImpact: 52000,
    },
  },

  {
    id: "e32", initId: "R2-004",
    title: "Free returns banner on PDPs",
    initType: "A/B Test",
    hypothesis: "We believe surfacing a 'free returns within 30 days' banner on PDPs will lift conversion by 6-10%, because returns friction is the largest stated objection in apparel buyer research.",
    category: "Conversion", owner: "Jordan",
    primaryMetric: "PDP-to-cart conversion",
    killCriteria: "Return rate increase >2pp.",
    status: "Completed", startDate: "2026-02-15", endDate: "2026-03-15",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 25000,
    linkedIds: [], createdAt: "2026-02-10",
    brandId: "r2",
    results: {
      actualOutcome: "CVR +7.4%. Return rate unchanged at 11.8%. Net revenue +$30k.",
      keyLearning: "Stated objection matched real friction — the banner unlocked CVR without increasing returns. The reassurance signal works without inviting the behavior.",
      outcomeClassification: "Success",
      decisionMade: "Make permanent across all PDPs. Test placement variants (header vs near-CTA) next.",
      outcomeCertainty: 85, actualRevenueImpact: 30000,
    },
  },

  {
    id: "e33", initId: "R2-005",
    title: "Personalization engine on category pages",
    initType: "Infrastructure",
    hypothesis: "We believe a personalisation engine on category pages (ML-ranked product grid based on browse signal) will lift category-page CVR by 15-20%, because the current static grid underperforms for repeat visitors with established preferences.",
    category: "Conversion", owner: "Jordan",
    primaryMetric: "Category page CVR (repeat visitors)",
    killCriteria: "CVR drop on new visitors.",
    status: "Blocked", startDate: "2026-06-15", endDate: "2026-09-01",
    ice: { impact: 9, certainty: 6, ease: 3 }, revenueImpact: 100000,
    linkedIds: ["e34"], createdAt: "2026-05-08",
    brandId: "r2",
    notes: "Blocked: depends on R2 site replatform (e34/R2-006) reaching Phase 1 milestone before personalisation engine can plug in. Earliest unblock: late July.",
  },

  {
    id: "e34", initId: "R2-006",
    title: "R2 site replatform — Phase 1 (foundation)",
    initType: "Infrastructure",
    hypothesis: "We believe migrating to a headless commerce architecture in three phases will unlock CVR improvements blocked by the current monolith, because the current platform's templating system cannot support component-level personalisation or fast iteration.",
    category: "Data / Analytics", owner: "Jordan",
    primaryMetric: "Phase 1 completion: foundation + 2 PDP templates live",
    killCriteria: "Phase 1 slips >4 weeks.",
    status: "Running", startDate: "2026-04-15", endDate: "2026-07-30",
    ice: { impact: 8, certainty: 8, ease: 2 }, revenueImpact: 0,
    linkedIds: ["e33"], createdAt: "2026-04-10",
    brandId: "r2",
    notes: "Foundational. No direct revenue impact in Phase 1; unblocks personalisation, A/B infrastructure, and content velocity downstream.",
  },

  {
    id: "e35", initId: "R2-007",
    title: "Exit-intent discount code (cart abandoners only)",
    initType: "A/B Test",
    hypothesis: "We believe an exit-intent 10% code shown only to cart abandoners will recover 8-12% of would-be-lost carts, because discount-on-exit is targeted enough to avoid training the full audience to wait for a code.",
    category: "Retention", owner: "Jordan",
    primaryMetric: "Cart-recovery rate among exit-intent triggered",
    killCriteria: "Margin compression >3% across all orders.",
    status: "Completed", startDate: "2026-03-05", endDate: "2026-04-02",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 30000,
    linkedIds: [], createdAt: "2026-03-01",
    brandId: "r2",
    results: {
      actualOutcome: "Recovery 11.2%. Net revenue +$35k. Margin compression 1.4% — within tolerance.",
      keyLearning: "Gating the offer to exit-intent + cart-abandoner only avoided training the full audience. Code usage outside the targeted trigger stayed flat, confirming the segmentation worked.",
      outcomeClassification: "Success",
      decisionMade: "Make evergreen. Test 5% code as floor to protect margin further.",
      outcomeCertainty: 85, actualRevenueImpact: 35000,
    },
  },

  {
    id: "e36", initId: "R2-008",
    title: "TikTok organic content push (founder-led)",
    initType: "Campaign",
    hypothesis: "We believe a 12-week founder-led TikTok push (3 posts/week) will build attributable revenue of $15-20k by end of period, because organic reach can compound when the founder voice is differentiated.",
    category: "Brand", owner: "Jordan",
    primaryMetric: "TikTok-attributed revenue",
    killCriteria: "Avg post views <2k after week 6.",
    status: "Completed", startDate: "2026-01-15", endDate: "2026-04-08",
    ice: { impact: 5, certainty: 3, ease: 5 }, revenueImpact: 15000,
    linkedIds: [], createdAt: "2026-01-10",
    brandId: "r2",
    results: {
      actualOutcome: "Total attributable revenue $4k. Best post hit 47k views; median 1.8k. Follower growth +1,200.",
      keyLearning: "Founder voice didn't differentiate enough to break through. The 1 hit post was an unscripted behind-the-scenes — implying the format matters more than the founder presence. Organic TikTok needs either format-fit or paid amplification.",
      outcomeClassification: "Inconclusive",
      decisionMade: "Wind down 3x/week cadence. Replace with paid TikTok via creators (the R1-006 learning applies).",
      outcomeCertainty: 65, actualRevenueImpact: 4000,
    },
  },

  {
    id: "e37", initId: "R2-009",
    title: "Complete-the-look bundling on PDPs",
    initType: "Campaign",
    hypothesis: "We believe a 'complete the look' module on apparel PDPs (3 styled complements) will lift AOV by 10-15%, because outfit-thinking is native to the apparel buyer's decision frame.",
    category: "Merchandising", owner: "Jordan",
    primaryMetric: "AOV from PDPs with module enabled",
    killCriteria: "AOV drop or attach rate <2%.",
    status: "Completed", startDate: "2026-04-10", endDate: "2026-05-08",
    ice: { impact: 7, certainty: 7, ease: 7 }, revenueImpact: 35000,
    linkedIds: [], createdAt: "2026-04-05",
    brandId: "r2",
    results: {
      actualOutcome: "AOV +13.4%. Attach rate 6.2%. Net revenue $41k.",
      keyLearning: "Outfit-thinking is the right buyer frame. Curation (stylist picks) outperformed algorithmic ('frequently bought together') by 24% — the editorial signal matters in apparel.",
      outcomeClassification: "Success",
      decisionMade: "Roll across all PDPs. Build a stylist-curated weekly refresh cadence (lightweight, 2hr/week).",
      outcomeCertainty: 85, actualRevenueImpact: 41000,
    },
  },

  {
    id: "e38", initId: "R2-010",
    title: "SMS marketing program launch",
    initType: "Infrastructure",
    hypothesis: "We believe launching an SMS marketing program (welcome series + abandoned cart + win-back) will deliver $40-50k in attributable revenue in the first 90 days, because SMS as a channel has been proven at Northcove (NH-011) and Retailer 1 (R1-002) but is not yet running at R2.",
    category: "Retention", owner: "Jordan",
    primaryMetric: "SMS-attributed revenue (90 days)",
    killCriteria: "Opt-in rate <8%.",
    status: "Draft", startDate: "2026-07-01", endDate: "2026-09-30",
    ice: { impact: 8, certainty: 7, ease: 6 }, revenueImpact: 45000,
    linkedIds: ["e13","e14","e21"], createdAt: "2026-05-20",
    brandId: "r2",
    notes: "Draft. Direct learning carry-over from NH and R1 SMS programs. The 2-hour delay window from R1-002 should apply; the tiered-incentive insight from NH-012 should inform the win-back flow.",
  },
];

const SEED_WEEKLY_METRICS_AUTHORED = [
  // Northcove Home (default) — 12 weeks
  { date: "2026-03-02", brand: "default", source: "manual", metrics: { revenue: 232000, sessions: 41000, conversions: 720, aov: 322, cac: 38, notes: "Pre-test baseline." } },
  { date: "2026-03-09", brand: "default", source: "manual", metrics: { revenue: 228000, sessions: 40500, conversions: 695, aov: 328, cac: 40, notes: "" } },
  { date: "2026-03-16", brand: "default", source: "manual", metrics: { revenue: 241000, sessions: 42200, conversions: 738, aov: 327, cac: 39, notes: "Post-upsell test live." } },
  { date: "2026-03-23", brand: "default", source: "manual", metrics: { revenue: 218000, sessions: 39800, conversions: 661, aov: 330, cac: 44, notes: "Paid CAC creep starting." } },
  { date: "2026-03-30", brand: "default", source: "manual", metrics: { revenue: 198000, sessions: 38400, conversions: 612, aov: 323, cac: 51, notes: "Paid social UGC test running hot." } },
  { date: "2026-04-06", brand: "default", source: "manual", metrics: { revenue: 245000, sessions: 41600, conversions: 749, aov: 327, cac: 41, notes: "Killed paid social test." } },
  { date: "2026-04-13", brand: "default", source: "manual", metrics: { revenue: 261000, sessions: 42100, conversions: 778, aov: 336, cac: 39, notes: "Free-ship threshold rolled to all." } },
  { date: "2026-04-20", brand: "default", source: "manual", metrics: { revenue: 274000, sessions: 42800, conversions: 802, aov: 342, cac: 38, notes: "" } },
  { date: "2026-04-27", brand: "default", source: "manual", metrics: { revenue: 281000, sessions: 43200, conversions: 815, aov: 345, cac: 37, notes: "SMS win-back live." } },
  { date: "2026-05-04", brand: "default", source: "manual", metrics: { revenue: 290000, sessions: 43800, conversions: 838, aov: 346, cac: 36, notes: "" } },
  { date: "2026-05-11", brand: "default", source: "manual", metrics: { revenue: 298000, sessions: 44400, conversions: 854, aov: 349, cac: 36, notes: "" } },
  { date: "2026-05-18", brand: "default", source: "manual", metrics: { revenue: 305000, sessions: 44900, conversions: 866, aov: 352, cac: 35, notes: "All three retention tests now evergreen." } },
  // Retailer 1 (r1) — 12 weeks
  { date: "2026-03-02", brand: "r1", source: "manual", metrics: { revenue: 142000, sessions: 28000, conversions: 410, aov: 346, cac: 42, notes: "" } },
  { date: "2026-03-09", brand: "r1", source: "manual", metrics: { revenue: 148000, sessions: 28800, conversions: 428, aov: 346, cac: 41, notes: "Sample-pack offer live." } },
  { date: "2026-03-16", brand: "r1", source: "manual", metrics: { revenue: 159000, sessions: 30200, conversions: 461, aov: 345, cac: 39, notes: "" } },
  { date: "2026-03-23", brand: "r1", source: "manual", metrics: { revenue: 162000, sessions: 30800, conversions: 471, aov: 344, cac: 39, notes: "Browse-abandon SMS live." } },
  { date: "2026-03-30", brand: "r1", source: "manual", metrics: { revenue: 165000, sessions: 31100, conversions: 478, aov: 345, cac: 38, notes: "" } },
  { date: "2026-04-06", brand: "r1", source: "manual", metrics: { revenue: 168000, sessions: 31400, conversions: 487, aov: 345, cac: 38, notes: "" } },
  { date: "2026-04-13", brand: "r1", source: "manual", metrics: { revenue: 153000, sessions: 31800, conversions: 444, aov: 345, cac: 48, notes: "Paid social lifestyle scale, CAC climbing." } },
  { date: "2026-04-20", brand: "r1", source: "manual", metrics: { revenue: 138000, sessions: 31200, conversions: 400, aov: 345, cac: 56, notes: "Paid social fatigue acute." } },
  { date: "2026-04-27", brand: "r1", source: "manual", metrics: { revenue: 142000, sessions: 30400, conversions: 412, aov: 345, cac: 49, notes: "Paid social killed." } },
  { date: "2026-05-04", brand: "r1", source: "manual", metrics: { revenue: 158000, sessions: 31000, conversions: 458, aov: 345, cac: 42, notes: "" } },
  { date: "2026-05-11", brand: "r1", source: "manual", metrics: { revenue: 167000, sessions: 31600, conversions: 484, aov: 345, cac: 40, notes: "Loyalty soft-launch." } },
  { date: "2026-05-18", brand: "r1", source: "manual", metrics: { revenue: 174000, sessions: 32200, conversions: 504, aov: 345, cac: 39, notes: "" } },
  // Retailer 2 (r2) — 12 weeks
  { date: "2026-03-02", brand: "r2", source: "manual", metrics: { revenue: 98000, sessions: 19000, conversions: 285, aov: 344, cac: 44, notes: "" } },
  { date: "2026-03-09", brand: "r2", source: "manual", metrics: { revenue: 102000, sessions: 19500, conversions: 296, aov: 345, cac: 43, notes: "Exit-intent code live." } },
  { date: "2026-03-16", brand: "r2", source: "manual", metrics: { revenue: 108000, sessions: 20100, conversions: 314, aov: 344, cac: 41, notes: "" } },
  { date: "2026-03-23", brand: "r2", source: "manual", metrics: { revenue: 112000, sessions: 20400, conversions: 326, aov: 344, cac: 40, notes: "Creative-refresh paid social cadence live." } },
  { date: "2026-03-30", brand: "r2", source: "manual", metrics: { revenue: 118000, sessions: 21000, conversions: 343, aov: 344, cac: 36, notes: "" } },
  { date: "2026-04-06", brand: "r2", source: "manual", metrics: { revenue: 121000, sessions: 21400, conversions: 352, aov: 344, cac: 35, notes: "" } },
  { date: "2026-04-13", brand: "r2", source: "manual", metrics: { revenue: 125000, sessions: 21800, conversions: 363, aov: 344, cac: 34, notes: "Complete-the-look live on top SKUs." } },
  { date: "2026-04-20", brand: "r2", source: "manual", metrics: { revenue: 132000, sessions: 22300, conversions: 384, aov: 344, cac: 33, notes: "" } },
  { date: "2026-04-27", brand: "r2", source: "manual", metrics: { revenue: 138000, sessions: 22800, conversions: 401, aov: 344, cac: 32, notes: "" } },
  { date: "2026-05-04", brand: "r2", source: "manual", metrics: { revenue: 144000, sessions: 23200, conversions: 419, aov: 344, cac: 32, notes: "" } },
  { date: "2026-05-11", brand: "r2", source: "manual", metrics: { revenue: 148000, sessions: 23600, conversions: 430, aov: 344, cac: 32, notes: "Replatform Phase 1 dev underway." } },
  { date: "2026-05-18", brand: "r2", source: "manual", metrics: { revenue: 151000, sessions: 23900, conversions: 439, aov: 344, cac: 32, notes: "" } },
];

// -- Demo timeline rebasing ----------------------------------------------------
//
// The two arrays above are an authored narrative: a portfolio mid-flight, with a
// paid-social test that fatigued and got killed, a replatform in dependency
// order, and twelve weeks of metrics that move because of those decisions. That
// story is worth keeping, and rewriting the literal dates by hand every few
// months is not a maintenance task anyone will actually do.
//
// So the dates stay as authored and get shifted at load time. The offset is
// whatever it takes to land the last authored metrics week on the most recent
// completed Monday, and every date in both arrays moves by that same offset, so
// all the relative spacing the narrative depends on — this test ran three weeks,
// that one starts after its dependency closes — is preserved exactly.
//
// The symptom this fixes: the demo opened on "Last logged 68d ago ⚠️" with a
// staleness warning over a half-empty table, because the fixed dates aged past
// the freshness thresholds the dashboard checks. A prospect's first screen was
// the app complaining about its own data.

const AUTHORED_LAST_WEEK = "2026-05-18";  // most recent date in SEED_WEEKLY_METRICS_AUTHORED

/** Most recent completed Monday, local time. */
function mostRecentMonday(now = new Date()) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();                     // 0=Sun … 6=Sat
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

const REBASE_OFFSET_DAYS = (() => {
  const authored = new Date(AUTHORED_LAST_WEEK + "T12:00:00");
  return Math.round((mostRecentMonday() - authored) / 86400000);
})();

const shiftDate = (iso) => {
  if (!iso || typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + REBASE_OFFSET_DAYS);
  return d.toISOString().slice(0, 10);
};

const DATE_FIELDS = ["startDate", "endDate", "createdAt", "updatedAt", "date"];

function rebaseRecord(rec) {
  const out = { ...rec };
  for (const f of DATE_FIELDS) if (out[f]) out[f] = shiftDate(out[f]);
  if (out.predictionSnapshot?.snapshotDate) {
    out.predictionSnapshot = { ...out.predictionSnapshot, snapshotDate: shiftDate(out.predictionSnapshot.snapshotDate) };
  }
  return out;
}

// Spend, ROAS and CVR were never authored, so the Weekly Pulse table rendered an
// em dash in three of its seven columns for every brand — half the headline
// artifact empty on first run. They are derived rather than invented: spend is
// implied by the CAC and conversions already recorded, and ROAS and CVR follow
// from spend and sessions. That keeps the demo internally consistent, so a
// prospect who checks whether revenue ÷ spend equals the stated ROAS finds that
// it does.
// The authored CAC values move the way the narrative needs them to (creeping up
// during the paid-social scale, dropping after it is killed) but sit at a level
// that isn't credible: $32-$56 against a $322 AOV implies a 6-11x blended ROAS,
// which no D2C operator reading the demo would believe. Scaling the whole series
// by a constant keeps every relative movement — and every note that refers to
// one — exactly as authored, while landing the level in the 2.4-4.1x band that
// a home-and-lifestyle brand at this AOV actually runs at.
const CAC_REALISM_FACTOR = 2.6;

function withDerivedMetrics(entry) {
  const m0 = entry.metrics || {};
  const m = m0.cac != null ? { ...m0, cac: Math.round(m0.cac * CAC_REALISM_FACTOR) } : m0;
  const spend = m.spend ?? (m.cac != null && m.conversions != null
    ? Math.round(m.cac * m.conversions) : null);
  const roas = m.roas ?? (spend && m.revenue != null
    ? Math.round((m.revenue / spend) * 100) / 100 : null);
  const cvr = m.cvr ?? (m.sessions && m.conversions != null
    ? Math.round((m.conversions / m.sessions) * 10000) / 100 : null);
  const derived = { ...m };
  if (spend != null) derived.spend = spend;
  if (roas != null) derived.roas = roas;
  if (cvr != null) derived.cvr = cvr;

  // Registrations and returns feed the Business Health guardrail tiles, which
  // otherwise sit empty on a fresh demo. Both are anchored to order volume so
  // they move with the narrative rather than sitting flat: registrations run at
  // roughly 2.6x orders (account creation is much higher up the funnel than
  // purchase), and the return rate drifts around a home-and-lifestyle-typical
  // 8% rather than being pinned to a suspiciously round number.
  if (derived.registrations == null && m.conversions != null) {
    derived.registrations = Math.round(m.conversions * 2.6);
  }
  if (derived.return_rate == null && m.conversions != null) {
    const wobble = ((m.conversions % 7) - 3) * 0.25;   // deterministic, ±0.75pp
    derived.return_rate = Math.round((8.1 + wobble) * 10) / 10;
  }
  return { ...entry, metrics: derived };
}

export const SEED = SEED_AUTHORED.map(rebaseRecord);
export const SEED_WEEKLY_METRICS = SEED_WEEKLY_METRICS_AUTHORED
  .map(rebaseRecord)
  .map(withDerivedMetrics);
