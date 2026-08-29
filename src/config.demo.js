// =============================================================================
// MARKETERS LAB — DEPLOYMENT CONFIG
//
// `icon` values name an entry in components/iconRegistry.js. They used to be
// emoji for agents (which rendered in three different illustration styles
// across operating systems and could not be themed) and `ti-*` class names for
// templates — dead references to a Tabler webfont that was removed from the
// build, so nothing had rendered them for months.
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

import { buildSeed } from "./services/seedRebase.js";

// -----------------------------------------------------------------------------
// DEPLOYMENT MODE
// DEMO_MODE=true skips the onboarding wizard on first visit (a cold visitor
// gets the pre-loaded seed portfolio instead of a config form) and enables
// the guided tour, the "Demo data" indicator, and the reset-demo control.
// -----------------------------------------------------------------------------
export const DEMO_MODE = true;

// -----------------------------------------------------------------------------
// COMPANY
// -----------------------------------------------------------------------------
export const COMPANY_NAME     = "Marketers Lab";
export const BUSINESS_MODEL   = "Multi-brand ecommerce portfolio";

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
// northStar is optional per brand — see resolveNorthStar() in constants.js.
// "current" here is a fallback only: at runtime it is superseded by the
// trailing-4-week revenue actually logged for that brand in
// SEED_WEEKLY_METRICS, so it can't drift from Weekly Pulse. It's set to match
// that derivation now so the fallback and the derived figure never disagree.
export const BRANDS = [
  { id: "default", name: "Northcove Home",  code: "NH",
    northStar: { metric: "Northcove Home Revenue",  current: "$1.2M/mo", target: "$1.5M/mo" } },
  { id: "r1",      name: "Grounds Control", code: "GC",
    northStar: { metric: "Grounds Control Revenue", current: "$641k/mo", target: "$820k/mo" } },
  { id: "r2",      name: "Peak Season",     code: "PS",
    northStar: { metric: "Peak Season Revenue",     current: "$581k/mo", target: "$750k/mo" } },
];

// Brand briefs — the context the AI features reason from, keyed by LOWERCASE
// brand name. Backfilled into any brand that has no brief fields of its own; see
// applyBrandBriefDefaults in constants.js.
//
// These used to live in constants.js, which meant this deployment's brands were
// described in shared app code rather than in the config that owns them — and
// that standing up a new client took an edit to constants.js on top of writing a
// config, contradicting activeConfig.js's promise that switching clients is a
// one-line change.
export const BRAND_BRIEFS = {
  "northcove home": {
    whatTheySell:  "Premium home décor and lifestyle products, $80–$300 AOV",
    categories:    "Home decor, Gifting, Candles, Textiles",
    icp:           "Women 28–48, considered purchase, gifting occasions and self-treat, high design sensitivity",
    whyTheyWin:    "Strong visual brand identity, high repeat LTV, emotional purchase driver: aspiration over utility",
    relationship:  "Own DTC brand: full control over pricing, creative, and customer experience",
    constraint:    "CAC rising on paid social, creative refresh cadence is the primary ROAS lever",
  },
  "grounds control": {
    whatTheySell:  "Whole-bean and ground specialty coffee, brewing equipment, and a roast subscription program, $20–$120 AOV",
    categories:    "Whole Bean, Ground Coffee, Brewing Equipment, Subscriptions",
    icp:           "Home brewing enthusiasts 25–45 graduating from pod machines to manual methods, high LTV once grind and roast preference is captured",
    whyTheyWin:    "Roast-date transparency and freshness that grocery-shelf competitors can't match; subscription cadence tuned to real reorder behaviour, not a fixed calendar",
    relationship:  "Own DTC brand; wholesale accounts (cafes, offices) are a secondary channel",
    constraint:    "Wholesale accounts close easily and inflate topline, but run at roughly half of DTC subscription margin — growth is over-indexed on the channel that doesn't compound",
  },
  "peak season": {
    whatTheySell:  "Technical outdoor apparel and gear — insulated layers, waterproof shells, packs — $70–$380 AOV",
    categories:    "Outerwear, Base/Mid Layers, Footwear, Packs & Accessories",
    icp:           "Active outdoor consumers 22–50 buying for a specific trip or season, ranging from weekend hikers to serious backcountry users, high research intensity before purchase",
    whyTheyWin:    "Category expertise — technical spec depth and honest use-case guidance that big-box retailers can't match at the point of sale",
    relationship:  "Own DTC brand",
    constraint:    "Roughly 55% of annual revenue lands in two 8-week pre-season windows (spring hiking, fall/winter); missing the inventory or paid-media timing in either window can't be recovered later in the season",
  },
};

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
    icon:      "megaphone",
    color:     "#2878a0",
    lens:      "brand narrative, paid acquisition efficiency, creative testing, channel mix, top-of-funnel demand generation, and customer perception",
    blindspot: "often underweights unit economics and margin impact of acquisition spend",
  },
  {
    id:        "cfo",
    label:     "CFO",
    icon:      "chart",
    color:     "#C9A227",
    lens:      "contribution margin, CAC payback, gross profit per order, pricing architecture, promotional discount discipline, and cash flow timing",
    blindspot: "often underweights long-term compounding of brand and LTV investments",
  },
  {
    id:        "cgo",
    label:     "CGO",
    icon:      "rocket",
    color:     "#208050",
    lens:      "customer lifetime value, cohort retention, subscription velocity, referral loops, repeat purchase rate, and omnichannel expansion",
    blindspot: "often underweights operational complexity and supply chain constraints of growth initiatives",
  },
  {
    id:        "coo",
    label:     "COO",
    icon:      "settings",
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
    icon:        "flask",
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
    icon:        "megaphone",
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
    icon:        "target",
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
    icon:        "grid",
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
    icon:        "archive",
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
    icon:        "briefcase",
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
    observation: "New-visitor CVR on paid-social mobile entry fell from 1.85% to 0.42% over the four weeks following the late-March personalization widget rollout. Desktop and organic entry were unaffected over the same window.",
    hypothesis: "Removing personalization widgets from paid-social mobile entry traffic to lighting and living room collections will recover CVR toward prior 4W baseline (1.85%) by eliminating load-time and rendering friction introduced in late March.",
    successMetric: "New-visitor CVR on paid-social mobile entry to lighting and living-room collections recovers to >= 1.76% within 3 weeks of the widgets being paused.",
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
    observation: "Care tickets mentioning delivery timing tripled quarter over quarter, and 11 of the top 20 traffic-driving SKUs show a swatch or out-of-stock display defect on mobile.",
    hypothesis: "Fixing delivery messaging, swatch clarity, and OOS display on the top 20 traffic-driving SKUs will reduce checkout abandonment and improve new-visitor CVR by 15-20% on affected PDPs.",
    successMetric: "New-visitor CVR on the top 20 SKUs improves by >= 0.4pp and delivery-related care tickets fall >= 30% within 4 weeks of ship.",
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
    observation: "The last four conversion regressions took a median of 19 days to be noticed, and each was found by a different function working from its own view.",
    hypothesis: "A shared weekly triage with a scored collection-page health system will reduce mean time to intervention on conversion problems by at least 50% by eliminating the five-team information silo.",
    successMetric: "Median time from regression to first intervention falls below 9 days, with the scorecard reviewed weekly by all five functions for 6 consecutive weeks.",
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
    observation: "New visitors convert 11-12x below returning visitors on the same PDPs — a gap too large to be explained by intent alone.",
    hypothesis: "A structured mobile PDP audit of new-visitor entry products will uncover rendering, load, and trust issues contributing to the 11-12x CVR gap between new visitors and returning customers.",
    successMetric: "The walk produces at least 12 reproducible, severity-ranked defects on new-customer entry PDPs, with >= 60% resolved within two weeks.",
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
    observation: "Incremental ROAS on paid social is 0.24x while new-visitor CVR sits at 0.42%, so every additional dollar buys traffic the funnel cannot convert.",
    hypothesis: "Holding paid social spend flat until new-visitor CVR recovers to >= 1.76% will improve incremental ROAS from 0.24x by stopping paid volume from flowing into a broken funnel.",
    successMetric: "Incremental ROAS recovers above 0.8x before any budget increase, with new-visitor CVR back to >= 1.76%.",
    category: "Paid Media", owner: "Paid + Director of Growth",
    primaryMetric: "Incremental ROAS; new-visitor CVR WoW",
    killCriteria: "Hold lifted when widget test resolves and CVR recovers to >= 1.76%.",
    status: "Running", startDate: "2026-05-12", endDate: "2026-06-07",
    ice: { impact: 8, certainty: 9, ease: 9 }, revenueImpact: 80000,
    linkedIds: ["e01","e06"], results: null, createdAt: "2026-05-10",
    brandId: "default",
    // Claimed by hand, because these campaigns predate the convention and a live
    // Meta campaign cannot be renamed without resetting its learning phase. The
    // claim is on the campaign, so every ad inside it inherits the attribution —
    // the ad names themselves are still unparseable and still attributed.
    //
    // The Q4 retargeting campaign is claimed and does not appear in the imported
    // window. That is reported as a claimed-but-absent name rather than passed
    // over: a claim that matches nothing is a broken expectation, and a total
    // that quietly excludes it is worse than one that admits it.
    adNames: [
      { name: "2026_Q1_prospecting_v2",  level: "campaign", channel: "meta", addedAt: "2026-05-11" },
      { name: "2025_Q4_retargeting_v1",  level: "campaign", channel: "meta", addedAt: "2026-05-11" },
    ],
    notes: "Incremental ROAS last 4W = 0.24x.",
  },
  {
    id: "e06", initId: "GC-001",
    title: "Email Welcome Series — Capture Grind & Roast Preference Before First Purchase",
    initType: "Campaign",
    observation: "62% of new subscribers never place a first order, and grind type is the most common pre-purchase question in support logs.",
    hypothesis: "A 3-email welcome series that asks new subscribers to specify grind type and roast intensity within 48h of signup will increase first-purchase conversion rate by 12% by resolving the single biggest decision-paralysis point for coffee first-timers before discount dependency forms.",
    successMetric: "First-purchase conversion within 30 days of signup improves from 12% to >= 17% among subscribers who complete the preference capture.",
    category: "Retention", owner: "CRM",
    primaryMetric: "First-purchase CVR within 30 days of signup",
    killCriteria: "No improvement in first-purchase CVR vs control after 4 weeks with 2,000+ recipients.",
    status: "Running", startDate: "2026-05-01", endDate: "2026-06-15",
    ice: { impact: 7, certainty: 7, ease: 8 }, revenueImpact: 38000,
    linkedIds: [], results: null, createdAt: "2026-05-01",
    brandId: "r1",
    notes: "Grounds Control has high signup-to-purchase drop-off (68%), concentrated at the grind/roast selection step. Welcome series is low-cost, high-leverage.",
  },
  {
    id: "e07", initId: "NH-007",
    title: "Collection Rebuild — Top Paid-Social Landing Pages",
    initType: "A/B Test",
    observation: "The two collection pages taking the most paid-social traffic load in 4.1s on mobile and surface out-of-stock hero SKUs in the first row.",
    hypothesis: "Rebuilding lighting and living room collection pages with in-stock priority sequencing, load-time optimization, and hero-SKU variant gap resolution will recover CVR to prior 4W baseline and support paid social scaling at ROAS above 1.5x.",
    successMetric: "Collection-page CVR on those two pages improves by >= 0.5pp, with mobile load under 2.5s and no out-of-stock SKU in the first row.",
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
    observation: "Conversion is down across every entry point while gross margin is already compressed 4pts year over year. The pressure to discount is coming from the CVR drop, not from a pricing signal.",
    hypothesis: "A sitewide 15% promotional discount will lift CVR quickly and protect topline revenue while conversion infrastructure issues are resolved.",
    successMetric: "Sitewide CVR lifts >= 0.6pp with gross margin impact held under 2pts across the promo window.",
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
    observation: "Creative CTR improved 22% over six weeks, which reads as a signal to scale — but new-visitor CVR fell over the same period.",
    hypothesis: "Increasing paid social spend 25% into current winning audiences will accelerate new-customer growth given improving creative CTR.",
    successMetric: "New-customer revenue grows >= 20% with incremental ROAS holding above 1.0x at the higher spend level.",
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
    // A genuine conflict, left in on purpose: the rejected scale proposal and
    // the spend hold that replaced it both point at the same live campaign. The
    // same spend cannot belong to two experiments, so the resolution is stable
    // rather than clever — first registration wins — and the collision is
    // surfaced for a human to settle instead of being arbitrated silently.
    adNames: [
      { name: "2026_Q1_prospecting_v2", level: "campaign", channel: "meta", addedAt: "2026-05-13" },
    ],
    createdAt: "2026-05-10", brandId: "default",
  },
  {
    id: "e10", initId: "NH-010",
    title: "Homepage Hero Redesign — Premium Brand Presentation",
    initType: "A/B Test",
    observation: "New-visitor bounce on brand-entry traffic is 68%, and the homepage hero has carried a promotional message in 9 of the last 10 weeks.",
    hypothesis: "Redesigning the homepage hero and seasonal brand creative to feel more premium and less promotional will improve trust signals for new visitors and support conversion quality over time.",
    successMetric: "New-visitor bounce on brand-entry traffic falls below 58% with no decline in new-visitor CVR.",
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
    id: "e11", initId: "PS-001",
    title: "PDP Technical Uplift — In-Action Photography & Spec Diagrams",
    initType: "A/B Test",
    observation: "Add-to-cart on technical outerwear PDPs trails the category average by 40%, and session recordings show repeated zooming on product-on-white images.",
    hypothesis: "Replacing generic product-on-white images with in-action weather photography and technical spec diagrams (waterproof rating, fill power, layering position) on top 15 PDPs will increase add-to-cart rate by 10% by reducing purchase hesitation caused by unclear performance claims.",
    successMetric: "Add-to-cart rate on the affected PDPs improves by >= 15% within 4 weeks of the new photography and spec diagrams going live.",
    category: "Conversion", owner: "Merchandising",
    primaryMetric: "Add-to-cart rate on affected PDPs",
    killCriteria: "No ATC improvement after 3 weeks with 3,000+ sessions per variant.",
    status: "Completed", startDate: "2026-04-01", endDate: "2026-05-01",
    ice: { impact: 6, certainty: 7, ease: 5 }, revenueImpact: 28000,
    spendCost: 8000, resourceCost: 4000, linkedIds: [],
    results: {
      actualOutcome: "ATC rate improved 14.2% on spec-diagram PDPs vs control. Strongest lift on outerwear category (+19%). No impact on accessories.",
      keyLearning: "Technical proof materially lifts purchase intent on considered, performance-driven purchases — the effect is category-specific, not sitewide.",
      outcomeClassification: "Success",
      decisionMade: "Roll out to all outerwear PDPs. Accessories deprioritised. Northcove team briefed for similar test.",
      outcomeCertainty: 88, actualRevenueImpact: 31000, actualSpendCost: 9200, actualResourceCost: 4500,
    },
    createdAt: "2026-04-01", brandId: "r2",
  },
  {
    id: "e12", initId: "PS-002",
    title: "Checkout Flow Simplification — Remove Optional Fields",
    initType: "A/B Test",
    observation: "Checkout abandonment is 31%, and field-level analytics put three optional fields at the largest single drop in form progression.",
    hypothesis: "Removing 3 optional form fields from the checkout flow will reduce checkout abandonment by 8% by lowering cognitive load at the point of highest purchase intent.",
    successMetric: "Checkout completion rate improves by >= 8% with no increase in failed or incomplete orders.",
    category: "Conversion", owner: "Product",
    primaryMetric: "Checkout completion rate; abandonment rate",
    killCriteria: "No improvement in checkout completion rate after 2 weeks with 1,500+ checkout sessions.",
    status: "Draft", startDate: "2026-06-01", endDate: "2026-07-01",
    ice: { impact: 8, certainty: 8, ease: 7 }, revenueImpact: 52000,
    spendCost: 0, resourceCost: 6000, linkedIds: ["e11"], results: null,
    createdAt: "2026-05-10", brandId: "r2",
    notes: "Informed by e11 learnings — technical trust signals matter, so friction reduction should amplify the uplift.",
  },

  // ===========================================================================
  // NORTHCOVE HOME (default) — 8 new
  // ===========================================================================

  {
    id: "e13", initId: "NH-011",
    title: "SMS abandoned-cart at 30 minutes",
    initType: "Campaign",
    observation: "Mobile checkout abandoners recover at less than half the rate of desktop, and the existing recovery email does not send for 60 minutes.",
    hypothesis: "We believe a 30-minute SMS abandoned-cart nudge for mobile checkout abandoners will recover 8-12% of carts, because urgency on mobile beats a delayed email when the buyer is still in-session.",
    successMetric: "Cart recovery among mobile checkout abandoners reaches 8-12%, measured against the 1-hour email as control.",
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
    observation: "Customers lapsed 90 days are 24% of the file and produced under 3% of last quarter's revenue.",
    hypothesis: "We believe a 3-message SMS win-back sequence to 90-day lapsed customers will recover 10-15% of revenue from that cohort, because a tiered incentive reactivates intent when email open rates have decayed.",
    successMetric: "Reactivation revenue from the 90-day lapsed cohort reaches 10-15% of that cohort's prior-year value within the campaign window.",
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
    observation: "UGC-style test creative outperformed studio assets by 31% on CTR in a two-week read, on a small budget.",
    hypothesis: "We believe scaling UGC-style creative on Meta prospecting will lower CAC by 18-25%, because authentic content outperforms studio shots for home goods at the consideration stage.",
    successMetric: "Blended CAC falls 18-25% and holds for four consecutive weeks at scaled spend.",
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
    observation: "AOV has been flat at $68 for three quarters against a $50 free-shipping threshold, with 41% of orders landing between $50 and $60.",
    hypothesis: "We believe raising the free-shipping threshold from $50 to $75 will lift AOV by 15-20% with <2% conversion loss, because anchoring nudges add-on purchases for home decor where bundles are natural.",
    successMetric: "AOV net of returns lifts 15-20% with conversion loss under 2pts.",
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
    observation: "Units per order sits at 1.3, and candles are the most frequent second item whenever a second item is bought at all.",
    hypothesis: "We believe a one-click post-purchase candle bundle offer will increase units per order by 15-20%, because momentum at checkout reduces decision friction for impulse-priced add-ons.",
    successMetric: "Attach rate on the post-purchase bundle reaches 15-20% of orders with no increase in returns or refunds.",
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
    observation: "PDP-to-cart conversion trails category benchmarks by 6pts, and reviews currently sit below three scroll depths on mobile.",
    hypothesis: "We believe surfacing the top 3 reviews above the fold on PDPs will lift conversion by 5-8%, because social proof reduces purchase hesitation for considered home purchases.",
    successMetric: "PDP-to-cart conversion lifts 5-8% on the treated PDPs over a four-week read.",
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
    observation: "Candles and refills are repurchased by 34% of buyers within 120 days, entirely through manual reorder.",
    hypothesis: "We believe launching subscribe-and-save on candles and refills will lift repeat-purchase rate by 25-30% in that category, because consumables suit subscription mechanics and our buyer has demonstrated reorder cadence of 8-10 weeks.",
    successMetric: "Repeat-purchase rate on consumables lifts 25-30% within one replenishment cycle of launch.",
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
    observation: "Bedding add-to-cart trails the site average by 5pts despite above-average session duration, which reads as choice paralysis rather than disinterest.",
    hypothesis: "We believe a 5-question guided bedding-finder quiz will increase add-to-cart rate by 12-18% on bedding category traffic, because reducing choice paralysis converts browsers who would otherwise bounce.",
    successMetric: "Add-to-cart rate on bedding traffic runs 12-18% higher among quiz completers than non-completers in the same period.",
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
  // GROUNDS CONTROL (r1) — specialty coffee DTC — 10 new
  // ===========================================================================

  {
    id: "e21", initId: "GC-002",
    title: "SMS browse-abandon trigger for PDP viewers",
    initType: "Campaign",
    observation: "38% of coffee buyers view three or more PDPs across multiple sessions before ordering, and nothing reaches them between sessions.",
    hypothesis: "We believe a 2-hour SMS browse-abandon trigger for high-intent PDP viewers (3+ pages) will recover 6-10% of would-be lost sessions, because coffee buyers compare origin, roast level, and grind options across multiple product pages before committing to a bag.",
    successMetric: "Browse-abandon recovery revenue reaches 6-10% of the value of qualifying abandoned sessions.",
    category: "Retention", owner: "Naomi",
    primaryMetric: "Browse-abandon recovery revenue",
    killCriteria: "Opt-out >3% OR recovery <3%.",
    status: "Completed", startDate: "2026-03-18", endDate: "2026-04-15",
    ice: { impact: 7, certainty: 7, ease: 8 }, revenueImpact: 18000,
    linkedIds: [], createdAt: "2026-03-15",
    brandId: "r1",
    results: {
      actualOutcome: "Recovery rate 8.4% (target 6-10%). Opt-out 1.2%. $24k recovered over 4 weeks.",
      keyLearning: "Coffee buyers' multi-session comparison pattern (origin vs. roast vs. grind) is exploitable with browse-triggered SMS. 2-hour delay outperformed 30-min — gives the buyer space to finish comparing, then nudges.",
      outcomeClassification: "Success",
      decisionMade: "Make evergreen. Extend trigger to add-to-cart abandoners with same 2-hour delay.",
      outcomeCertainty: 85, actualRevenueImpact: 24000,
    },
  },

  {
    id: "e22", initId: "GC-003",
    title: "Sample-pack acquisition offer at $5",
    initType: "Campaign",
    observation: "First-purchase conversion on paid traffic is 1.1%, and not knowing which roast to pick is the most common objection in pre-purchase chat.",
    hypothesis: "We believe offering a $5 sample-pack of 4 hero roasts to new visitors will lift first-purchase conversion by 30-40%, because the price-to-trial barrier is lower than committing to a full bag of an unfamiliar roast.",
    successMetric: "First-purchase conversion on paid traffic lifts 30-40% among visitors shown the sample-pack offer.",
    category: "Paid Media", owner: "Naomi",
    primaryMetric: "First-purchase conversion rate on paid traffic",
    killCriteria: "Full-price follow-on rate <25%.",
    status: "Completed", startDate: "2026-02-01", endDate: "2026-03-15",
    ice: { impact: 7, certainty: 8, ease: 8 }, revenueImpact: 40000,
    linkedIds: [], createdAt: "2026-01-25",
    brandId: "r1",
    results: {
      actualOutcome: "First-purchase CVR rose 47% on paid. 38% of sample buyers placed a full-price order within 30 days. LTV at 60 days exceeded non-sample acquisition by $34.",
      keyLearning: "Sample acquisition outperforms discount-led acquisition for considered-purchase coffee. The $5 commitment filters tire-kickers AND demonstrates real roast preference better than a percentage discount would.",
      outcomeClassification: "Jackpot",
      decisionMade: "Evergreen. Build a sample-pack landing page with paid traffic feed. Test $7 price ceiling in Q3.",
      outcomeCertainty: 90, actualRevenueImpact: 68000,
    },
    // Pre-convention launch campaign, claimed by hand at the campaign level.
    adNames: [
      { name: "GC_samplepack_launch_apr", level: "campaign", channel: "meta", addedAt: "2026-03-16" },
    ],
  },

  {
    id: "e23", initId: "GC-004",
    title: "Paid social: home-barista lifestyle creative scale on Meta + TikTok",
    initType: "Campaign",
    observation: "Aspirational brewing content earns 2.4x the organic engagement of product-led posts, which suggests the same creative would carry in paid.",
    hypothesis: "We believe scaling home-barista lifestyle creative on Meta and TikTok will lower CAC by 20%, because aspirational brewing content drives the discovery flywheel for specialty coffee.",
    successMetric: "Blended CAC across Meta and TikTok falls 20% and holds for four consecutive weeks at scaled spend.",
    category: "Paid Media", owner: "Naomi",
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
    id: "e24", initId: "GC-005",
    title: "Email: roast-date freshness proof embedded in nurture flow",
    initType: "Campaign",
    observation: "Freshness is the most-mentioned theme in five-star reviews and appears nowhere in the nurture flow.",
    hypothesis: "We believe embedding a real roast-date photo and 'roasted within 5 days of your order' proof in email 4 of the new-subscriber nurture flow will lift email-to-purchase conversion by 8-12%, because freshness transparency at the consideration stage closes buyers used to grocery-shelf coffee that has sat for months.",
    successMetric: "Email-to-purchase conversion on email 4 improves by >= 25% against the prior version of that email.",
    category: "Retention", owner: "Naomi",
    primaryMetric: "Email-to-purchase conversion (email 4)",
    killCriteria: "Conversion drop on email 4 vs control.",
    status: "Completed", startDate: "2026-04-01", endDate: "2026-04-29",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 20000,
    linkedIds: [], createdAt: "2026-03-28",
    brandId: "r1",
    results: {
      actualOutcome: "Email 4 CTR +14%, purchase rate +9.2%. Total flow revenue +$19k over 4 weeks.",
      keyLearning: "Roast-date proof works in email because the buyer is already engaged and reading for reassurance. A static freshness badge on the PDP doesn't carry the same weight — visitors skim the product photo first and the date stamp gets lost.",
      outcomeClassification: "Success",
      decisionMade: "Roll into evergreen flow. Test the roast-date proof in emails 2 and 6 next.",
      outcomeCertainty: 80, actualRevenueImpact: 19000,
    },
  },

  {
    id: "e25", initId: "GC-006",
    title: "Home-brewing micro-creator pilot (10 creators)",
    initType: "Campaign",
    observation: "Paid-social CAC has risen 34% year over year, while unpaid creator mentions already drive a measurable traffic tail.",
    hypothesis: "We believe a 10-creator micro-influencer pilot (10-50k followers, home-brewing and equipment reviewers) will deliver lower CAC than paid social by 25%, because trust transfer on brew quality is highest from creators who actually own and compare equipment.",
    successMetric: "CAC from creator-attributed traffic comes in below paid-social CAC over a 60-day attribution window.",
    category: "Paid Media", owner: "Naomi",
    primaryMetric: "CAC from creator-attributed traffic",
    killCriteria: "CAC equal to or worse than paid social.",
    status: "Completed", startDate: "2026-03-10", endDate: "2026-04-21",
    ice: { impact: 7, certainty: 5, ease: 4 }, revenueImpact: 35000,
    linkedIds: [], createdAt: "2026-03-05",
    brandId: "r1",
    results: {
      actualOutcome: "Attributed revenue $12k. Of 10 creators, 3 drove 80% of revenue, 5 broke even, 2 were net negative. CAC overall $42 vs paid social $46 — marginal win.",
      keyLearning: "Creator selection is the entire ballgame. The 3 winners shared: long-form brew-comparison video format, organic mention pattern (not 'sponsored post' framing), and audience size 25-50k. Their referrals also carried double the equipment attach rate of paid-social-acquired customers — that audience arrives already primed to buy the gear, not just the beans.",
      outcomeClassification: "Inconclusive",
      decisionMade: "Re-pilot with 6 creators matching the winner profile only. Cut the 5-9 follower bracket entirely.",
      outcomeCertainty: 65, actualRevenueImpact: 12000,
    },
  },

  {
    id: "e26", initId: "GC-007",
    title: "Tiered subscription loyalty program v1",
    initType: "Infrastructure",
    observation: "90-day subscription retention is 41%, and exit surveys cite 'no reason to stay' more often than price.",
    hypothesis: "We believe launching a 3-tier subscription loyalty program (roast credits + early access to limited-lot drops + free-bag milestones) will reduce subscription churn by 18-22% within 90 days, because churn is currently concentrated in months 2-3 once the novelty of the first bag fades, and coffee subscribers respond to discovery and status mechanics over pure discount.",
    successMetric: "90-day subscription retention for the cohort enrolled in tiers reaches >= 52%.",
    category: "Retention", owner: "Naomi",
    primaryMetric: "Subscription retention rate (90-day cohort)",
    killCriteria: "Enrollment <15% of subscribers.",
    status: "Running", startDate: "2026-05-01", endDate: "2026-08-01",
    ice: { impact: 8, certainty: 6, ease: 4 }, revenueImpact: 60000,
    linkedIds: [], createdAt: "2026-04-25",
    brandId: "r1",
    notes: "Soft-launched at week 2. Enrollment at 28% so far. DTC subscription runs at roughly double wholesale margin, so retention here matters more per-dollar than volume growth in cafe accounts.",
  },

  {
    id: "e27", initId: "GC-008",
    title: "Roast & brew-method finder quiz",
    initType: "A/B Test",
    observation: "Visitors who reach a PDP from the roast catalogue convert at less than half the rate of those arriving from a curated collection.",
    hypothesis: "We believe a 7-question quiz capturing roast intensity preference, flavor notes, and brew method (drip, pour-over, espresso, French press) with personalised product recs will lift add-to-cart rate by 15-20% from quiz completers, because coffee purchases are routine-dependent and reducing decision load converts.",
    successMetric: "Add-to-cart rate among quiz completers exceeds the non-completer rate by >= 15% over a four-week read.",
    category: "Conversion", owner: "Naomi",
    primaryMetric: "ATC rate from quiz completers",
    killCriteria: "Quiz completion <40%.",
    status: "Completed", startDate: "2026-01-20", endDate: "2026-02-24",
    ice: { impact: 7, certainty: 7, ease: 6 }, revenueImpact: 30000,
    linkedIds: [], createdAt: "2026-01-15",
    brandId: "r1",
    results: {
      actualOutcome: "Quiz completion 54%. ATC from completers 2.4x site avg. Revenue per quiz session +47%.",
      keyLearning: "Quizzes convert when the input feels diagnostic, not promotional. Question phrasing mattered — 'How does your coffee taste when it's gone wrong?' outperformed 'What's your roast preference?' by 18% in completion.",
      outcomeClassification: "Success",
      decisionMade: "Make permanent. Build a brew-routine builder as the next layer.",
      outcomeCertainty: 85, actualRevenueImpact: 38000,
    },
  },

  {
    id: "e28", initId: "GC-009",
    title: "Replenishment subscription on hero SKUs",
    initType: "Infrastructure",
    observation: "Six hero SKUs account for 58% of repeat volume and are reordered on a 24-32 day rhythm, all of it manual.",
    hypothesis: "We believe a subscribe-and-save option on 6 hero SKUs (house blend, 2 single origins, decaf) will lift LTV by 20-25%, because hero SKUs have demonstrated reorder cadence of 5-7 weeks.",
    successMetric: "90-day LTV for subscribers on hero SKUs exceeds one-time buyers of the same SKUs by 20-25%.",
    category: "Retention", owner: "Naomi",
    primaryMetric: "LTV (90-day) for subscribers vs one-time buyers",
    killCriteria: "Monthly churn >10%.",
    status: "Draft", startDate: "2026-07-01", endDate: "2026-09-30",
    ice: { impact: 8, certainty: 7, ease: 5 }, revenueImpact: 85000,
    linkedIds: ["e19"], createdAt: "2026-05-20",
    brandId: "r1",
    notes: "Draft. Can leverage learnings from Northcove subscribe-and-save once that ships. Every point of replenishment lifted here is DTC-margin revenue, worth roughly double the equivalent wholesale volume.",
  },

  {
    id: "e29", initId: "GC-010",
    title: "Live cupping event pilot (Instagram + site)",
    initType: "Campaign",
    observation: "Limited-lot drops sell through in under 48 hours to a small repeat audience, which suggests unmet appetite for access.",
    hypothesis: "We believe a 60-minute live cupping event with the founder + 2 roasters will drive $25-35k in event-window revenue, because synchronous tasting and Q&A works for coffee's sensory, expertise-driven nature.",
    successMetric: "Event-window revenue (event plus 24h) reaches $25-35k.",
    category: "Brand", owner: "Naomi",
    primaryMetric: "Event-window revenue (event + 24h)",
    killCriteria: "Concurrent viewership <500.",
    status: "Completed", startDate: "2026-02-26", endDate: "2026-02-27",
    ice: { impact: 6, certainty: 4, ease: 3 }, revenueImpact: 25000,
    linkedIds: [], createdAt: "2026-02-15",
    brandId: "r1",
    results: {
      actualOutcome: "Peak concurrent 340. Event revenue $2.8k. 24h tail another $200. Total $3k vs $25k target.",
      keyLearning: "Live cupping demands audience density we don't yet have. The format works for brands with established communities; for an acquisition-led brand, the room was too small to generate momentum. Production cost ($12k) far exceeded return.",
      outcomeClassification: "Failed",
      decisionMade: "Shelve format until community size doubles. Revisit Q4 with email-driven RSVP gating.",
      outcomeCertainty: 90, actualRevenueImpact: 3000,
    },
  },

  {
    id: "e30", initId: "GC-011",
    title: "Restock alerts via email for sold-out single-origin lots",
    initType: "Infrastructure",
    observation: "Single-origin micro-lots sell out in a median of 3 days, and the sold-out PDP offers no way to register interest.",
    hypothesis: "We believe a restock-alert email program for sold-out single-origin micro-lots will capture 60-70% of would-be-lost demand, because intent signal from visitors hitting a sold-out limited lot is unusually high.",
    successMetric: "Restock-attributed revenue reaches 60-70% of the demand estimated lost per sold-out event.",
    category: "Conversion", owner: "Naomi",
    primaryMetric: "Restock-attributed revenue per sold-out event",
    killCriteria: "Sign-up rate <8% on sold-out lot pages.",
    status: "Completed", startDate: "2026-04-22", endDate: "2026-05-20",
    ice: { impact: 5, certainty: 8, ease: 9 }, revenueImpact: 12000,
    linkedIds: [], createdAt: "2026-04-20",
    brandId: "r1",
    results: {
      actualOutcome: "Sign-up rate 18%. Restock-to-purchase conversion 41%. $15k recovered across 4 sold-out events.",
      keyLearning: "Sold-out-lot demand is more capturable than expected — the buyer has already committed mentally to that specific origin. The send-on-restock email should show the roast-date and lot photo; text-only versions underconverted by 22%.",
      outcomeClassification: "Success",
      decisionMade: "Evergreen. Build the same feature for grind-option OOS on hero blends.",
      outcomeCertainty: 85, actualRevenueImpact: 15000,
    },
  },

  // ===========================================================================
  // PEAK SEASON (r2) — outdoor apparel/gear — 7 new
  // ===========================================================================

  {
    id: "e31", initId: "PS-003",
    title: "Paid social with weekly season-synced creative refresh discipline",
    initType: "Campaign",
    observation: "Two prior paid-social scale attempts failed the same way — CAC held for ten days, then degraded — and neither had a creative refresh cadence.",
    hypothesis: "We believe maintaining 3 new weather- and season-triggered creative variants weekly on Meta prospecting will hold CAC flat at scale, because the underlying audience-fatigue mechanic is the constraint, not creative quality itself — and stale seasonal creative reads as irrelevant the moment the weather shifts.",
    successMetric: "Blended CAC holds flat within 10% at +40% spend for six consecutive weeks.",
    category: "Paid Media", owner: "Casey",
    primaryMetric: "Blended CAC at +40% spend",
    killCriteria: "CAC drift >15% over 14 days.",
    status: "Completed", startDate: "2026-03-25", endDate: "2026-05-06",
    ice: { impact: 7, certainty: 7, ease: 5 }, revenueImpact: 40000,
    linkedIds: ["e15","e23"], createdAt: "2026-03-20",
    brandId: "r2",
    notes: "Designed in direct response to the Northcove and Grounds Control paid-social burns — testing the inverse hypothesis: refresh cadence is the lever.",
    results: {
      actualOutcome: "Held CAC at $32-$36 across 6 weeks at +40% spend. Refresh cadence held: 18 new variants shipped, timed to shifting regional weather. Revenue +$52k attributable.",
      keyLearning: "The earlier brand failures weren't a creative-style problem; they were a creative-ops problem. With a refresh pipeline synced to weather and season in place, the same Meta channel scales without fatigue. The operational capability is the unlock.",
      outcomeClassification: "Success",
      decisionMade: "Codify creative-ops playbook. Share with Northcove and Grounds Control — this is now portfolio IP.",
      outcomeCertainty: 90, actualRevenueImpact: 52000,
    },
  },

  {
    id: "e32", initId: "PS-004",
    title: "Free size-exchange banner on PDPs",
    initType: "A/B Test",
    observation: "Fit uncertainty is the most-cited reason for not purchasing in exit surveys, ahead of price, and the exchange policy is only visible in the footer.",
    hypothesis: "We believe surfacing a 'free size exchange within 30 days' banner on PDPs will lift conversion by 6-10%, because fit uncertainty — not price — is the largest stated objection for technical outdoor apparel bought online.",
    successMetric: "PDP-to-cart conversion lifts 6-10% with return rate held within 1pt.",
    category: "Conversion", owner: "Casey",
    primaryMetric: "PDP-to-cart conversion",
    killCriteria: "Return rate increase >2pp.",
    status: "Completed", startDate: "2026-02-15", endDate: "2026-03-15",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 25000,
    linkedIds: [], createdAt: "2026-02-10",
    brandId: "r2",
    results: {
      actualOutcome: "CVR +7.4%. Return rate unchanged at 11.8%. Net revenue +$30k.",
      keyLearning: "Stated objection matched real friction — the banner unlocked CVR without increasing returns. The fit-confidence reassurance works without inviting the behaviour.",
      outcomeClassification: "Success",
      decisionMade: "Make permanent across all PDPs. Test placement variants (header vs near-CTA) next.",
      outcomeCertainty: 85, actualRevenueImpact: 30000,
    },
  },

  {
    id: "e33", initId: "PS-005",
    title: "Activity-based personalisation engine on category pages",
    initType: "Infrastructure",
    observation: "Repeat visitors browse category pages 2.3 times before converting, and the grid ranks identically regardless of stated activity.",
    hypothesis: "We believe a personalisation engine on category pages (ranking product grids by stated activity — day-hiking, backcountry ski, alpine climbing — and current local weather) will lift category-page CVR by 15-20%, because the current static grid treats a weekend hiker the same as an expedition mountaineer and undersells our category expertise.",
    successMetric: "Category-page CVR for repeat visitors lifts >= 8% against a held-out control.",
    category: "Conversion", owner: "Casey",
    primaryMetric: "Category page CVR (repeat visitors)",
    killCriteria: "CVR drop on new visitors.",
    status: "Blocked", startDate: "2026-06-15", endDate: "2026-09-01",
    ice: { impact: 9, certainty: 6, ease: 3 }, revenueImpact: 100000,
    linkedIds: ["e34"], createdAt: "2026-05-08",
    brandId: "r2",
    notes: "Blocked: depends on Peak Season site replatform (e34/PS-006) reaching Phase 1 milestone before personalisation engine can plug in. Earliest unblock: late July.",
  },

  {
    id: "e34", initId: "PS-006",
    title: "Peak Season site replatform — Phase 1 (foundation)",
    initType: "Infrastructure",
    observation: "Four of the last six conversion initiatives were blocked or descoped by template constraints in the current monolith.",
    hypothesis: "We believe migrating to a headless commerce architecture in three phases will unlock CVR improvements blocked by the current monolith, because the current platform's templating system cannot support component-level personalisation or fast iteration.",
    successMetric: "Phase 1 ships the headless foundation plus two PDP templates in production, with no regression in page load or CVR.",
    category: "Data / Analytics", owner: "Casey",
    primaryMetric: "Phase 1 completion: foundation + 2 PDP templates live",
    killCriteria: "Phase 1 slips >4 weeks.",
    status: "Running", startDate: "2026-04-15", endDate: "2026-07-30",
    ice: { impact: 8, certainty: 8, ease: 2 }, revenueImpact: 0,
    linkedIds: ["e33"], createdAt: "2026-04-10",
    brandId: "r2",
    notes: "Foundational. No direct revenue impact in Phase 1; unblocks personalisation, A/B infrastructure, and content velocity downstream.",
  },

  {
    id: "e35", initId: "PS-007",
    title: "Exit-intent early markdown preview (cart abandoners only)",
    initType: "A/B Test",
    observation: "Cart abandoners return at 12% within 7 days, and past-season colorways go to markdown with no controlled early access.",
    hypothesis: "We believe an exit-intent 'preview' flag offering past-season colorways 10% early, shown only to cart abandoners, will recover 8-12% of would-be-lost carts, because gating the early-markdown preview to exit-intent is targeted enough to avoid pulling forward full-price demand on current-season stock.",
    successMetric: "Cart-recovery rate among exit-intent triggered abandoners reaches 8-12%, with no measurable shift in full-price purchase timing.",
    category: "Retention", owner: "Casey",
    primaryMetric: "Cart-recovery rate among exit-intent triggered",
    killCriteria: "Margin compression >3% across all orders.",
    status: "Completed", startDate: "2026-03-05", endDate: "2026-04-02",
    ice: { impact: 6, certainty: 7, ease: 8 }, revenueImpact: 30000,
    linkedIds: [], createdAt: "2026-03-01",
    brandId: "r2",
    results: {
      actualOutcome: "Recovery 11.2%. Net revenue +$35k. Margin compression 1.4% — within tolerance.",
      keyLearning: "Gating the early-markdown preview to exit-intent + cart-abandoner only avoided training the full audience to wait for the sitewide sale. Usage outside the targeted trigger stayed flat, confirming the segmentation worked.",
      outcomeClassification: "Success",
      decisionMade: "Make evergreen ahead of every end-of-season markdown. Test a 5% floor to protect margin further.",
      outcomeCertainty: 85, actualRevenueImpact: 35000,
    },
  },

  {
    id: "e36", initId: "PS-008",
    title: "TikTok organic content push — pre-season anticipation (founder-led)",
    initType: "Campaign",
    observation: "Peak-season demand concentrates into a six-week window, and the brand enters it with no owned short-form audience.",
    hypothesis: "We believe a 12-week founder-led TikTok push (3 posts/week) building anticipation ahead of peak season (gear-testing, early access waitlist) will build attributable revenue of $15-20k by end of period, because organic reach can compound when the founder voice is differentiated and pre-season is when consideration actually starts.",
    successMetric: "TikTok-attributed revenue reaches $30k across the 12-week push.",
    category: "Brand", owner: "Casey",
    primaryMetric: "TikTok-attributed revenue",
    killCriteria: "Avg post views <2k after week 6.",
    status: "Completed", startDate: "2026-01-15", endDate: "2026-04-08",
    ice: { impact: 5, certainty: 3, ease: 5 }, revenueImpact: 15000,
    linkedIds: [], createdAt: "2026-01-10",
    brandId: "r2",
    results: {
      actualOutcome: "Total attributable revenue $4k. Best post hit 47k views; median 1.8k. Follower growth +1,200.",
      keyLearning: "Founder voice didn't differentiate enough to break through. The 1 hit post was an unscripted gear-testing failure clip — implying the format matters more than the founder presence. Organic TikTok needs either format-fit or paid amplification.",
      outcomeClassification: "Inconclusive",
      decisionMade: "Wind down 3x/week cadence. Replace with paid TikTok via creators, gated to the profile that worked elsewhere (the GC-006 learning applies).",
      outcomeCertainty: 65, actualRevenueImpact: 4000,
    },
  },

  {
    id: "e37", initId: "PS-009",
    title: "Layering-system bundle module on PDPs",
    initType: "Campaign",
    observation: "Only 9% of outerwear orders include a base or mid layer, though the layering system is how the product is designed to be worn.",
    hypothesis: "We believe a 'complete the layering system' module on outerwear PDPs (base + mid + shell complements) will lift AOV by 10-15%, because layering-system thinking is native to how a technical outdoor buyer actually plans a kit.",
    successMetric: "AOV on PDPs with the module enabled lifts 10-15% against PDPs without it.",
    category: "Merchandising", owner: "Casey",
    primaryMetric: "AOV from PDPs with module enabled",
    killCriteria: "AOV drop or attach rate <2%.",
    status: "Completed", startDate: "2026-04-10", endDate: "2026-05-08",
    ice: { impact: 7, certainty: 7, ease: 7 }, revenueImpact: 35000,
    linkedIds: [], createdAt: "2026-04-05",
    brandId: "r2",
    results: {
      actualOutcome: "AOV +13.4%. Attach rate 6.2%. Net revenue $41k.",
      keyLearning: "Layering-system thinking is the right buyer frame. Curation (gear-expert picks matched by conditions) outperformed algorithmic ('frequently bought together') by 24% — the expertise signal matters in technical outdoor.",
      outcomeClassification: "Success",
      decisionMade: "Roll across all outerwear PDPs. Build a gear-expert-curated weekly refresh cadence (lightweight, 2hr/week).",
      outcomeCertainty: 85, actualRevenueImpact: 41000,
    },
  },

  {
    id: "e38", initId: "PS-010",
    title: "SMS marketing program launch",
    initType: "Infrastructure",
    observation: "SMS is the only major owned channel not in use, and email list growth has been flat for two quarters.",
    hypothesis: "We believe launching an SMS marketing program (welcome series + abandoned cart + win-back) will deliver $40-50k in attributable revenue in the first 90 days, because SMS as a channel has been proven at Northcove (NH-011) and Grounds Control (GC-002) but is not yet running at Peak Season.",
    successMetric: "SMS-attributed revenue reaches $40-50k within 90 days of launch.",
    category: "Retention", owner: "Casey",
    primaryMetric: "SMS-attributed revenue (90 days)",
    killCriteria: "Opt-in rate <8%.",
    status: "Draft", startDate: "2026-07-01", endDate: "2026-09-30",
    ice: { impact: 8, certainty: 7, ease: 6 }, revenueImpact: 45000,
    linkedIds: ["e13","e14","e21"], createdAt: "2026-05-20",
    brandId: "r2",
    notes: "Draft. Direct learning carry-over from NH and Grounds Control SMS programs. The 2-hour delay window from GC-002 should apply; the tiered-incentive insight from NH-012 should inform the win-back flow.",
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
  // Grounds Control (r1) — 12 weeks
  { date: "2026-03-02", brand: "r1", source: "manual", metrics: { revenue: 142000, sessions: 28000, conversions: 410, aov: 346, cac: 42, notes: "" } },
  { date: "2026-03-09", brand: "r1", source: "manual", metrics: { revenue: 148000, sessions: 28800, conversions: 428, aov: 346, cac: 41, notes: "Sample-pack offer live." } },
  { date: "2026-03-16", brand: "r1", source: "manual", metrics: { revenue: 159000, sessions: 30200, conversions: 461, aov: 345, cac: 39, notes: "" } },
  { date: "2026-03-23", brand: "r1", source: "manual", metrics: { revenue: 162000, sessions: 30800, conversions: 471, aov: 344, cac: 39, notes: "Browse-abandon SMS live." } },
  { date: "2026-03-30", brand: "r1", source: "manual", metrics: { revenue: 165000, sessions: 31100, conversions: 478, aov: 345, cac: 38, notes: "" } },
  { date: "2026-04-06", brand: "r1", source: "manual", metrics: { revenue: 168000, sessions: 31400, conversions: 487, aov: 345, cac: 38, notes: "" } },
  { date: "2026-04-13", brand: "r1", source: "manual", metrics: { revenue: 153000, sessions: 31800, conversions: 444, aov: 345, cac: 48, notes: "Paid social home-barista scale, CAC climbing." } },
  { date: "2026-04-20", brand: "r1", source: "manual", metrics: { revenue: 138000, sessions: 31200, conversions: 400, aov: 345, cac: 56, notes: "Paid social fatigue acute." } },
  { date: "2026-04-27", brand: "r1", source: "manual", metrics: { revenue: 142000, sessions: 30400, conversions: 412, aov: 345, cac: 49, notes: "Paid social killed." } },
  { date: "2026-05-04", brand: "r1", source: "manual", metrics: { revenue: 158000, sessions: 31000, conversions: 458, aov: 345, cac: 42, notes: "" } },
  { date: "2026-05-11", brand: "r1", source: "manual", metrics: { revenue: 167000, sessions: 31600, conversions: 484, aov: 345, cac: 40, notes: "Subscription loyalty soft-launch." } },
  { date: "2026-05-18", brand: "r1", source: "manual", metrics: { revenue: 174000, sessions: 32200, conversions: 504, aov: 345, cac: 39, notes: "" } },
  // Peak Season (r2) — 12 weeks
  { date: "2026-03-02", brand: "r2", source: "manual", metrics: { revenue: 98000, sessions: 19000, conversions: 285, aov: 344, cac: 44, notes: "" } },
  { date: "2026-03-09", brand: "r2", source: "manual", metrics: { revenue: 102000, sessions: 19500, conversions: 296, aov: 345, cac: 43, notes: "Exit-intent markdown preview live." } },
  { date: "2026-03-16", brand: "r2", source: "manual", metrics: { revenue: 108000, sessions: 20100, conversions: 314, aov: 344, cac: 41, notes: "" } },
  { date: "2026-03-23", brand: "r2", source: "manual", metrics: { revenue: 112000, sessions: 20400, conversions: 326, aov: 344, cac: 40, notes: "Season-synced creative refresh cadence live." } },
  { date: "2026-03-30", brand: "r2", source: "manual", metrics: { revenue: 118000, sessions: 21000, conversions: 343, aov: 344, cac: 36, notes: "" } },
  { date: "2026-04-06", brand: "r2", source: "manual", metrics: { revenue: 121000, sessions: 21400, conversions: 352, aov: 344, cac: 35, notes: "" } },
  { date: "2026-04-13", brand: "r2", source: "manual", metrics: { revenue: 125000, sessions: 21800, conversions: 363, aov: 344, cac: 34, notes: "Layering-bundle module live on top SKUs." } },
  { date: "2026-04-20", brand: "r2", source: "manual", metrics: { revenue: 132000, sessions: 22300, conversions: 384, aov: 344, cac: 33, notes: "" } },
  { date: "2026-04-27", brand: "r2", source: "manual", metrics: { revenue: 138000, sessions: 22800, conversions: 401, aov: 344, cac: 32, notes: "" } },
  { date: "2026-05-04", brand: "r2", source: "manual", metrics: { revenue: 144000, sessions: 23200, conversions: 419, aov: 344, cac: 32, notes: "" } },
  { date: "2026-05-11", brand: "r2", source: "manual", metrics: { revenue: 148000, sessions: 23600, conversions: 430, aov: 344, cac: 32, notes: "Replatform Phase 1 dev underway." } },
  { date: "2026-05-18", brand: "r2", source: "manual", metrics: { revenue: 151000, sessions: 23900, conversions: 439, aov: 344, cac: 32, notes: "" } },
];

// -----------------------------------------------------------------------------
// SEED NAMING OVERLAY
//
// The shipped dimension registry in services/naming.js carries a snack-brand
// vocabulary (Pastry, Donuts, PinkSprinkle) because that is the account the
// convention was first designed against. None of it describes candles, coffee
// or technical outerwear, so this deployment extends the registry the way any
// workspace does — through `settings.namingCustom`, resolved on top of the
// shipped schema rather than forked from it.
//
// This is a vocabulary addition, not a dimension addition. A longer controlled
// list accepts more names and changes nothing about names already built; a new
// *dimension* would append a slot and break every existing name. See the
// "two kinds of addition" note in services/naming.js.
// -----------------------------------------------------------------------------
export const SEED_NAMING_CUSTOM = {
  dimensions: [],
  vocabAdditions: {
    category: ["Candles", "Textiles", "Decor", "Gifting", "WholeBean", "BrewGear", "Outerwear", "Layers"],
    flavor:   ["MediumRoast", "DarkRoast", "SingleOrigin"],
    theme:    ["Seasonal", "Technical"],
  },
};

// -----------------------------------------------------------------------------
// SEED AD ACCOUNT
//
// A fabricated campaign export, and the most important fixture in this file.
// Everything above it — the portfolio, the learnings, the calibration spread —
// is the half of the product that three funded competitors also ship. This is
// the half that nothing else attempts: an ad account whose names are the join
// key back to the experiments that ordered them.
//
// ## The rows are authored raw, and parsed at load
//
// No row here carries `parsed`, `values` or `parseErrors`. Those are computed by
// `annotateRow` against the schema resolved at load time, so a seeded row goes
// through the identical path a CSV-imported row does. A seed that shipped its
// own parse results could assert that a name parsed when the live parser
// refuses it — a demo that lies about the one thing being demonstrated.
//
// ## The defects are the demo
//
// A clean fabricated account proves nothing; anyone can invent rows that add up.
// Eight failure modes are planted deliberately, each of which the product is
// built to name rather than absorb. Every one is documented, with the figure it
// should produce, in docs/seed-demo-patterns.md §7.
//
//   1. clean parse, joined by tag slot        NH-013, GC-004, GC-006, PS-003
//   2. legacy names, joined by hand claim     NH-005, GC-003 (pre-convention)
//   3. claim inherited from a parent campaign NH-005 claims the campaign name
//   4. wrong segment count — refused          one 10-slot Meta ad name
//   5. delimiter inside a value               "Emma_Brune" → 12 slots
//   6. value outside a controlled vocabulary  theme "Cozy"
//   7. a tag that resolves to nothing         _NH-099, a broken link
//   8. untagged business-as-usual spend       _NA, correctly joins to nothing
//
// Two more live on the initiative records rather than here: one name claimed by
// two initiatives (NH-005 and NH-009 both claim the Q1 prospecting campaign),
// and a claimed name absent from the export (NH-005 claims a Q4 retargeting
// campaign that predates this window).
//
// Dates are authored on the same weekly grid as SEED_WEEKLY_METRICS and rebased
// with it, so the paid-social burn in the ad account lands on the same weeks the
// Weekly Pulse notes describe it.
// -----------------------------------------------------------------------------

// Parent entity names, referenced by the ad rows below. A real export carries
// them on every row, and they are what lets a claim on a campaign inherit down
// to every ad inside it.
const NH_PROSPECT_CANDLES = "Meta_Prospect_Candles_US_Purchase";
const NH_LEGACY_CAMPAIGN  = "2026_Q1_prospecting_v2";
const GC_PROSPECT_BEAN    = "Meta_Prospect_WholeBean_US_Purchase";
const PS_PROSPECT_OUTER   = "Meta_Prospect_Outerwear_US_Purchase";

const meta = (name, date, campaignName, adsetName, spend, conversions, revenue) => ({
  name, level: "ad", channel: "meta", date, campaignName, adsetName,
  metrics: {
    spend, conversions, revenue,
    impressions: Math.round(spend * 88),
    clicks:      Math.round(spend * 1.16),
  },
});

const klaviyo = (name, date, flowName, spend, conversions, revenue) => ({
  name, level: "message", channel: "klaviyo", date, campaignName: flowName, adsetName: "",
  metrics: { spend, conversions, revenue, impressions: Math.round(revenue * 0.4), clicks: Math.round(conversions * 9.4) },
});

const google = (name, date, campaignName, adgroupName, spend, conversions, revenue) => ({
  name, level: "ad", channel: "google", date, campaignName, adsetName: adgroupName,
  metrics: { spend, conversions, revenue, impressions: Math.round(spend * 61), clicks: Math.round(spend * 2.1) },
});

const SEED_AD_ACCOUNT_AUTHORED = [
  // -- NH-013: the UGC creative scale that was killed -------------------------
  // Three creatives over three weeks. Spend climbs, conversions do not follow,
  // and blended ROAS falls 3.2 → 1.5. This is the burn the Weekly Pulse notes
  // describe on 2026-03-30 and the kill on 2026-04-06, now visible at ad level.
  meta("Meta_Col_MayaOrtiz_R3_F_Lifestyle_CozyReset_Candles_NA_30s_NH-013",        "2026-03-23", NH_PROSPECT_CANDLES, "US_25-34_F_LAL5-Buyers_Auto", 4200, 42, 13500),
  meta("Meta_Col_DevPatel_R3_NA_DayInLife_MorningRitual_Textiles_NA_30s_NH-013",   "2026-03-23", NH_PROSPECT_CANDLES, "US_25-34_F_LAL5-Buyers_Auto", 3100, 29,  9300),
  meta("Meta_LF_ProductPack_R3_F_Product_TextureCloseUp_Decor_NA_Carousel_NH-013", "2026-03-23", NH_PROSPECT_CANDLES, "US_35-44_F_StackedInterest_Auto", 2600, 22, 7100),
  meta("Meta_Col_MayaOrtiz_R3_F_Lifestyle_CozyReset_Candles_NA_30s_NH-013",        "2026-03-30", NH_PROSPECT_CANDLES, "US_25-34_F_LAL5-Buyers_Auto", 6800, 52, 16700),
  meta("Meta_Col_DevPatel_R3_NA_DayInLife_MorningRitual_Textiles_NA_30s_NH-013",   "2026-03-30", NH_PROSPECT_CANDLES, "US_25-34_F_LAL5-Buyers_Auto", 5200, 36, 11500),
  meta("Meta_LF_ProductPack_R3_F_Product_TextureCloseUp_Decor_NA_Carousel_NH-013", "2026-03-30", NH_PROSPECT_CANDLES, "US_35-44_F_StackedInterest_Auto", 4100, 24, 7700),
  meta("Meta_Col_MayaOrtiz_R3_F_Lifestyle_CozyReset_Candles_NA_30s_NH-013",        "2026-04-06", NH_PROSPECT_CANDLES, "US_25-34_F_LAL5-Buyers_Auto", 7400, 44, 14200),
  meta("Meta_Col_DevPatel_R3_NA_DayInLife_MorningRitual_Textiles_NA_30s_NH-013",   "2026-04-06", NH_PROSPECT_CANDLES, "US_25-34_F_LAL5-Buyers_Auto", 5600, 27,  8600),
  meta("Meta_LF_ProductPack_R3_F_Product_TextureCloseUp_Decor_NA_Carousel_NH-013", "2026-04-06", NH_PROSPECT_CANDLES, "US_35-44_F_StackedInterest_Auto", 4300, 17, 5400),

  // -- Untagged business-as-usual, and one broken link ------------------------
  // Evergreen product ads carry the placeholder in the initiative slot and join
  // to nothing, which is correct: most spend is not an experiment. The Gifting
  // ad carries NH-099, an initiative that does not exist — a tag that resolves
  // to nothing is reported as a broken link rather than counted as attributed.
  meta("Meta_LF_ProductSingle_Evergreen_NA_Product_HeroSKU_Decor_NA_Static_NA",    "2026-04-13", NH_PROSPECT_CANDLES, "US_25-34_F_Broad_Auto", 5100, 39, 12900),
  meta("Meta_LF_ProductSingle_Evergreen_NA_Product_HeroSKU_Decor_NA_Static_NA",    "2026-04-20", NH_PROSPECT_CANDLES, "US_25-34_F_Broad_Auto", 5400, 44, 14600),
  meta("Meta_LF_ProductPack_Promo_F_Lifestyle_GiftEdit_Gifting_NA_Carousel_NH-099","2026-04-20", NH_PROSPECT_CANDLES, "US_25-34_F_Broad_Auto", 2900, 21,  6800),

  // -- Three names this account cannot parse, for three different reasons -----
  // All three were meant for NH-018 and none of them reach it. The product's
  // rule is that a wrong-but-plausible parse is worse than an unparsed row, so
  // each is counted, reported by failure kind, and its spend named.
  //   ten slots — the flavor segment was dropped rather than written NA
  meta("Meta_LF_ProductPack_R4_F_Lifestyle_WarmNeutrals_Candles_Static_NH-018",    "2026-04-27", NH_PROSPECT_CANDLES, "US_25-34_F_QuizAudience_Auto", 1900, 14, 4400),
  //   twelve slots — a creator's name typed with the delimiter inside it
  meta("Meta_Col_Emma_Brune_R4_F_Product_LinenHand_Textiles_NA_Static_NH-018",     "2026-04-27", NH_PROSPECT_CANDLES, "US_25-34_F_QuizAudience_Auto", 1600, 11, 3500),
  //   right shape, wrong vocabulary — "Cozy" is not a theme anybody declared
  meta("Meta_LF_ProductPack_R4_F_Cozy_WarmNeutrals_Candles_NA_Static_NH-018",      "2026-05-04", NH_PROSPECT_CANDLES, "US_25-34_F_QuizAudience_Auto", 2200, 16, 5100),

  // -- Legacy names from before the convention was installed ------------------
  // These cannot be renamed — a live Meta campaign loses its learning phase — so
  // they are claimed by hand instead. Unparseable and attributed anyway, which
  // is the whole point of having two independent bridges.
  meta("2026_Q1_prospecting_v2 — Ad 3 (linen, static)",   "2026-04-13", NH_LEGACY_CAMPAIGN, "prospecting_broad", 3800, 31, 10200),
  meta("2026_Q1_prospecting_v2 — Ad 7 (candle carousel)", "2026-04-20", NH_LEGACY_CAMPAIGN, "prospecting_broad", 3400, 26,  8700),

  // -- GC-004: the same burn, at a second brand -------------------------------
  meta("Meta_Col_JonasLee_R2_NA_Lifestyle_HomeBarista_WholeBean_MediumRoast_35s_GC-004",  "2026-04-13", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 5600, 41, 14100),
  meta("Meta_Col_JonasLee_R2_NA_DayInLife_PourOverRitual_BrewGear_NA_35s_GC-004",         "2026-04-13", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 4100, 27,  9300),
  meta("Meta_Col_JonasLee_R2_NA_Lifestyle_HomeBarista_WholeBean_MediumRoast_35s_GC-004",  "2026-04-20", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 7200, 42, 14400),
  meta("Meta_Col_JonasLee_R2_NA_DayInLife_PourOverRitual_BrewGear_NA_35s_GC-004",         "2026-04-20", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 5300, 26,  8900),
  meta("Meta_LF_ProductSingle_R2_NA_Taste_RoastDate_WholeBean_SingleOrigin_Static_GC-004","2026-04-20", GC_PROSPECT_BEAN, "US_35-44_NA_Broad_Auto",           3900, 18,  6100),
  meta("Meta_Col_JonasLee_R2_NA_Lifestyle_HomeBarista_WholeBean_MediumRoast_35s_GC-004",  "2026-04-27", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 6900, 31, 10600),
  meta("Meta_LF_ProductSingle_R2_NA_Taste_RoastDate_WholeBean_SingleOrigin_Static_GC-004","2026-04-27", GC_PROSPECT_BEAN, "US_35-44_NA_Broad_Auto",           4200, 15,  5000),

  // -- GC-006: the micro-creator pilot that worked ----------------------------
  // Same brand, same channel, same period as the burn above — and a different
  // result. Pivoting the account by `handle` is what separates them.
  meta("Meta_Col_PriyaN_R1_NA_DayInLife_FirstGrind_BrewGear_NA_25s_GC-006",   "2026-03-16", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 2100, 27, 9600),
  meta("Meta_Col_TomasR_R1_NA_Taste_RoastComparison_WholeBean_DarkRoast_25s_GC-006", "2026-03-16", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 1800, 22, 7800),
  meta("Meta_Col_PriyaN_R1_NA_DayInLife_FirstGrind_BrewGear_NA_25s_GC-006",   "2026-03-23", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 2400, 31, 10900),
  meta("Meta_Col_TomasR_R1_NA_Taste_RoastComparison_WholeBean_DarkRoast_25s_GC-006", "2026-03-23", GC_PROSPECT_BEAN, "US_25-34_NA_HomeBrewInterest_Auto", 2000, 24, 8500),

  // -- GC-003: the sample-pack launch, also pre-convention ---------------------
  meta("GC_samplepack_launch_apr — static A", "2026-03-09", "GC_samplepack_launch_apr", "broad_us", 2600, 44, 9100),
  meta("GC_samplepack_launch_apr — video B",  "2026-03-16", "GC_samplepack_launch_apr", "broad_us", 2900, 51, 10600),

  // -- PS-003: the refresh cadence that avoided both burns --------------------
  // Stable ROAS across five weeks against two brands whose scale pushes decayed
  // in three. The contrast is the portfolio's most-cited learning, and here it
  // is in spend rather than in a post-mortem field.
  meta("Meta_LF_TrailKit_Evergreen_NA_Seasonal_ShoulderSeason_Outerwear_NA_30s_PS-003",   "2026-03-23", PS_PROSPECT_OUTER, "US_25-34_NA_HikingInterest_Auto", 3200, 29, 10100),
  meta("Meta_LF_GearTest_Evergreen_NA_Technical_WaterproofProof_Outerwear_NA_30s_PS-003", "2026-03-23", PS_PROSPECT_OUTER, "US_25-34_NA_HikingInterest_Auto", 2800, 26,  9200),
  meta("Meta_LF_TrailKit_Evergreen_NA_Seasonal_ShoulderSeason_Outerwear_NA_30s_PS-003",   "2026-04-06", PS_PROSPECT_OUTER, "US_25-34_NA_HikingInterest_Auto", 3600, 33, 11600),
  meta("Meta_Col_AlexKim_R4_NA_DayInLife_TrailMorning_Layers_NA_35s_PS-003",              "2026-04-06", PS_PROSPECT_OUTER, "US_25-34_NA_HikingInterest_Auto", 2500, 24,  8400),
  meta("Meta_LF_GearTest_Evergreen_NA_Technical_WaterproofProof_Outerwear_NA_30s_PS-003", "2026-04-20", PS_PROSPECT_OUTER, "US_25-34_NA_HikingInterest_Auto", 3900, 37, 13000),
  meta("Meta_Col_AlexKim_R4_NA_DayInLife_TrailMorning_Layers_NA_35s_PS-003",              "2026-04-20", PS_PROSPECT_OUTER, "US_25-34_NA_HikingInterest_Auto", 2700, 25,  8800),
  meta("Meta_LF_TrailKit_Evergreen_NA_Seasonal_ShoulderSeason_Outerwear_NA_30s_PS-003",   "2026-05-04", PS_PROSPECT_OUTER, "US_35-44_NA_Broad_Auto",          3400, 31, 10900),
  meta("Meta_LF_GearTest_Evergreen_NA_Technical_WaterproofProof_Outerwear_NA_30s_PS-003", "2026-05-04", PS_PROSPECT_OUTER, "US_35-44_NA_Broad_Auto",          3100, 30, 10500),

  // -- A second channel, so the pivot is not a Meta-only trick -----------------
  google("Google_LF_ShoppingFeed_Evergreen_Static_BrandTerms_Outerwear_NA_NA_NA", "2026-04-20", "Google_Prospect_Outerwear_US_Purchase", "brand_terms_exact", 2200, 34, 12600),
  google("Google_LF_ShoppingFeed_Evergreen_Static_GenericTerms_Layers_NA_NA_NA",  "2026-04-20", "Google_Prospect_Outerwear_US_Purchase", "generic_nonbrand",  1900, 12,  4100),

  // -- Owned channel, same convention, same bridge ----------------------------
  klaviyo("Klaviyo_Convenience_ThirtyMinuteNudge_NA_NH-011", "2026-04-27", "Klaviyo_Retain_CartAbandon_Purchase", 0, 61, 19800),
  klaviyo("Klaviyo_Convenience_ThirtyMinuteNudge_NA_NH-011", "2026-05-04", "Klaviyo_Retain_CartAbandon_Purchase", 0, 58, 18900),
  klaviyo("Klaviyo_Convenience_BrowseNudge2h_NA_GC-002",     "2026-04-27", "Klaviyo_Retain_BrowseAbandon_Purchase", 0, 37, 12400),
  klaviyo("Klaviyo_Taste_RoastDateProof_NA_GC-005",          "2026-05-04", "Klaviyo_Retain_Nurture_Purchase",       0, 29,  9700),
];

// -- Demo timeline rebasing ----------------------------------------------------
//
// The two arrays above are an authored narrative, kept at their authored dates
// and shifted onto today's timeline at load time. The machinery that does it —
// and the derivation of the weekly figures this config never authored — lives
// in services/seedRebase.js, shared with every other config so a fix to it
// cannot land in one client and miss the other. See that file for the reasoning.

const AUTHORED_LAST_WEEK = "2026-05-18";  // most recent date in SEED_WEEKLY_METRICS_AUTHORED

// Every initiative carries an attribution socket. In a live workspace the tag is
// stamped when the record is created — `suggestTrackingTag` derives it from the
// initiative id — and the seed derives it the same way rather than authoring 38
// literals that could drift from the ids sitting beside them. Anything that
// needs a tag unlike its id sets `trackingTag` on its own record and wins here.
const withTrackingTags = (list) => list.map(it => ({ ...it, trackingTag: it.trackingTag || it.initId }));

export const { SEED, SEED_WEEKLY_METRICS, SEED_AD_ACCOUNT } = buildSeed({
  authoredLastWeek: AUTHORED_LAST_WEEK,
  seed: withTrackingTags(SEED_AUTHORED),
  weeklyMetrics: SEED_WEEKLY_METRICS_AUTHORED,
  adAccount: SEED_AD_ACCOUNT_AUTHORED,
});

// -----------------------------------------------------------------------------
// SEED DEBATES
//
// A captured Signal AI run, shown in History so the debate is readable without
// waiting ninety seconds for eight agent turns — and without a live model call
// failing in front of an audience.
//
// It stays empty until a real run is pasted in. A hand-written transcript would
// be a different kind of fiction from the rest of this file: fabricated brands
// and figures are announced as fabricated on arrival, but a transcript implied
// to be model output that was actually authored misrepresents what the system
// does. So this array holds real runs or nothing.
//
// To capture one: run a debate in the deployed app, Settings → Download backup,
// and copy one element of the `debates` array out of the JSON into this list.
// Stamp `capturedAt` and `capturedModel` on it so the demo can say which model
// produced it and when — a transcript with no provenance ages into a claim
// nobody can check.
// -----------------------------------------------------------------------------
export const SEED_DEBATES = [];
