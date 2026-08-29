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
// Leave false for a real client deployment — they still want onboarding.
// -----------------------------------------------------------------------------
export const DEMO_MODE = false;

// -----------------------------------------------------------------------------
// COMPANY
// -----------------------------------------------------------------------------
export const COMPANY_NAME     = "Marketers Lab";
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

// Brand briefs — the context the AI features reason from, keyed by LOWERCASE
// brand name. Backfilled into any brand that has no brief fields of its own; see
// applyBrandBriefDefaults in constants.js.
//
// These used to live in constants.js, which meant standing up a new client
// required editing shared app code as well as writing a config — and that
// constants.js carried briefs for brands belonging to a deployment it otherwise
// knew nothing about. A brand's brief is a fact about that brand, so it belongs
// beside the brand.
export const BRAND_BRIEFS = {
  "northcove home": {
    whatTheySell:  "Premium home décor and lifestyle products, $80–$300 AOV",
    categories:    "Home decor, Gifting, Candles, Textiles",
    icp:           "Women 28–48, considered purchase, gifting occasions and self-treat, high design sensitivity",
    whyTheyWin:    "Strong visual brand identity, high repeat LTV, emotional purchase driver: aspiration over utility",
    relationship:  "Own DTC brand: full control over pricing, creative, and customer experience",
    constraint:    "CAC rising on paid social, creative refresh cadence is the primary ROAS lever",
  },
  "retailer 1": {
    whatTheySell:  "Mid-premium lifestyle and home accessories, $50–$200 AOV",
    categories:    "Home accessories, Gifting, Candles, Seasonal",
    icp:           "Women 25–45, deal-aware but brand-loyal, mix of gifting and self-purchase",
    whyTheyWin:    "Strong loyalty base, broad SKU range, good replenishment behaviour on consumable SKUs",
    relationship:  "Wholesale / retail partner: shared margin, limited creative control, strong buyer relationship",
    constraint:    "Margin compression from freight and promo dependency, free shipping threshold sensitivity",
  },
  "retailer 2": {
    whatTheySell:  "Accessible home and lifestyle range, $40–$150 AOV",
    categories:    "Home decor, Accessories, Seasonal, Gifting",
    icp:           "Broad female demographic 24–50, price-conscious, discovery-driven, impulse and gifting",
    whyTheyWin:    "Wide reach, high traffic volume, good basket size when cross-sell is activated",
    relationship:  "Wholesale / retail partner: high volume, lower margin, category manager relationship",
    constraint:    "Low CVR vs category benchmark, PDP experience needs improvement, limited personalisation capability",
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
    notes: "Incremental ROAS last 4W = 0.24x.",
  },
  {
    id: "e06", initId: "R1-001",
    title: "Email Welcome Series — Reduce First-Purchase Drop-off",
    initType: "Campaign",
    observation: "58% of new subscribers never place a first order, and the list currently receives nothing between signup and the next campaign send.",
    hypothesis: "A 3-email welcome series sent within 48h of signup will increase first-purchase conversion rate by 12% by building product trust before discount dependency forms.",
    successMetric: "First-purchase conversion within 30 days of signup improves by >= 12% against the pre-series baseline.",
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
    id: "e11", initId: "R2-001",
    title: "PDP Image Quality Uplift — High-Res Lifestyle Photography",
    initType: "A/B Test",
    observation: "Add-to-cart on the top 15 PDPs trails the category average by 30%, and those PDPs still carry supplier stock imagery.",
    hypothesis: "Replacing stock product images with high-resolution lifestyle photography on top 15 PDPs will increase add-to-cart rate by 10% by reducing purchase hesitation caused by poor visual trust.",
    successMetric: "Add-to-cart rate on the affected PDPs improves by >= 10% within 4 weeks of the new photography going live.",
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
    notes: "Informed by e11 learnings — trust signals matter, so friction reduction should amplify the uplift.",
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
  // RETAILER 1 (r1) — beauty/skincare DTC — 10 new
  // ===========================================================================

  {
    id: "e21", initId: "R1-002",
    title: "SMS browse-abandon trigger for PDP viewers",
    initType: "Campaign",
    observation: "41% of buyers view three or more PDPs across multiple sessions before ordering, and nothing reaches them between sessions.",
    hypothesis: "We believe a 2-hour SMS browse-abandon trigger for high-intent PDP viewers (3+ pages) will recover 6-10% of would-be lost sessions, because skincare buyers research repeatedly before committing.",
    successMetric: "Browse-abandon recovery revenue reaches 6-10% of the value of qualifying abandoned sessions.",
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
    observation: "First-purchase conversion on paid traffic is 1.1%, and not knowing which product to start with is the most common objection in pre-purchase chat.",
    hypothesis: "We believe offering a $5 sample-pack of 4 hero products to new visitors will lift first-purchase conversion by 30-40%, because the price-to-trial barrier is lower than committing to a full SKU.",
    successMetric: "First-purchase conversion on paid traffic lifts 30-40% among visitors shown the sample-pack offer.",
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
    observation: "Lifestyle content earns 2.4x the organic engagement of product-led posts, which suggests the same creative would carry in paid.",
    hypothesis: "We believe scaling lifestyle-style creative on Meta and TikTok will lower CAC by 20%, because aspirational content drives the discovery flywheel for skincare.",
    successMetric: "Blended CAC across Meta and TikTok falls 20% and holds for four consecutive weeks at scaled spend.",
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
    observation: "Email 4 has the weakest click-to-purchase rate in the nurture flow, and social proof appears nowhere in the sequence.",
    hypothesis: "We believe embedding 3 verified reviews in email 4 of the new-subscriber nurture flow will lift email-to-purchase conversion by 8-12%, because social proof at the consideration stage closes hesitant buyers.",
    successMetric: "Email-to-purchase conversion on email 4 improves 8-12% against the prior version of that email.",
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
    observation: "Paid-social CAC has risen 34% year over year, while unpaid creator mentions already drive a measurable traffic tail.",
    hypothesis: "We believe a 10-creator micro-influencer pilot (10-50k followers) will deliver lower CAC than paid social by 25%, because trust transfer in beauty is highest from creators with niche audiences.",
    successMetric: "CAC from creator-attributed traffic comes in 25% below paid-social CAC over a 60-day attribution window.",
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
    observation: "90-day repeat-purchase rate is 41%, and exit surveys cite 'no reason to come back' more often than price.",
    hypothesis: "We believe launching a 3-tier loyalty program (points + early access + creator perks) will lift repeat-purchase rate by 18-22% within 90 days, because skincare buyers respond to status mechanics over pure discount.",
    successMetric: "90-day repeat-purchase rate for the enrolled cohort reaches >= 50%.",
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
    observation: "Visitors who reach a PDP from the full catalogue convert at less than half the rate of those arriving from a curated collection.",
    hypothesis: "We believe a 7-question skin-type quiz with personalised product recs will lift add-to-cart rate by 15-20% from quiz completers, because skincare purchases are routine-dependent and reducing decision load converts.",
    successMetric: "Add-to-cart rate among quiz completers exceeds the non-completer rate by 15-20% over a four-week read.",
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
    observation: "Six hero SKUs account for 58% of repeat volume and are reordered on a 24-32 day rhythm, all of it manual.",
    hypothesis: "We believe a subscribe-and-save option on 6 hero SKUs (cleansers, serums) will lift LTV by 20-25%, because hero SKUs have demonstrated reorder cadence of 5-7 weeks.",
    successMetric: "90-day LTV for subscribers on hero SKUs exceeds one-time buyers of the same SKUs by 20-25%.",
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
    observation: "Limited drops sell through in under 48 hours to a small repeat audience, which suggests unmet appetite for access.",
    hypothesis: "We believe a 60-minute live-shopping event with a founder + 2 creators will drive $25-35k in event-window revenue, because synchronous demand creation works for skincare's experiential nature.",
    successMetric: "Event-window revenue (event plus 24h) reaches $25-35k.",
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
    observation: "Hero SKUs are out of stock a median of 9 days per quarter, and the out-of-stock PDP offers no way to register interest.",
    hypothesis: "We believe a restock-alert email program for out-of-stock SKUs will capture 60-70% of would-be-lost demand, because intent signal from OOS visitors is unusually high.",
    successMetric: "Restock-attributed revenue reaches 60-70% of the demand estimated lost per out-of-stock event.",
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
    observation: "Two prior paid-social scale attempts failed the same way — CAC held for ten days, then degraded — and neither had a creative refresh cadence.",
    hypothesis: "We believe maintaining 3 new creative variants weekly on Meta prospecting will hold CAC flat at scale, because the underlying audience-fatigue mechanic is the constraint, not creative quality itself.",
    successMetric: "Blended CAC holds flat within 10% at +40% spend for six consecutive weeks.",
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
    observation: "Returns friction is the most-cited reason for not purchasing in exit surveys, ahead of price, and the returns policy is only visible in the footer.",
    hypothesis: "We believe surfacing a 'free returns within 30 days' banner on PDPs will lift conversion by 6-10%, because returns friction is the largest stated objection in apparel buyer research.",
    successMetric: "PDP-to-cart conversion lifts 6-10% with return rate held within 1pt.",
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
    observation: "Repeat visitors browse category pages 2.3 times before converting, and the grid ranks identically for every visitor.",
    hypothesis: "We believe a personalisation engine on category pages (ML-ranked product grid based on browse signal) will lift category-page CVR by 15-20%, because the current static grid underperforms for repeat visitors with established preferences.",
    successMetric: "Category-page CVR for repeat visitors lifts >= 15% against a held-out control.",
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
    observation: "Four of the last six conversion initiatives were blocked or descoped by template constraints in the current monolith.",
    hypothesis: "We believe migrating to a headless commerce architecture in three phases will unlock CVR improvements blocked by the current monolith, because the current platform's templating system cannot support component-level personalisation or fast iteration.",
    successMetric: "Phase 1 ships the headless foundation plus two PDP templates in production, with no regression in page load or CVR.",
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
    observation: "Cart abandoners return at 12% within 7 days, and there is currently no exit-stage offer of any kind.",
    hypothesis: "We believe an exit-intent 10% code shown only to cart abandoners will recover 8-12% of would-be-lost carts, because discount-on-exit is targeted enough to avoid training the full audience to wait for a code.",
    successMetric: "Cart-recovery rate among exit-intent triggered abandoners reaches 8-12%, with no measurable shift in full-price purchase timing.",
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
    observation: "The brand has no owned short-form audience, while competitors in the category are compounding one.",
    hypothesis: "We believe a 12-week founder-led TikTok push (3 posts/week) will build attributable revenue of $15-20k by end of period, because organic reach can compound when the founder voice is differentiated.",
    successMetric: "TikTok-attributed revenue reaches $15-20k across the 12-week push.",
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
    observation: "Only 9% of apparel orders include a second item, though the range is merchandised as outfits in every other channel.",
    hypothesis: "We believe a 'complete the look' module on apparel PDPs (3 styled complements) will lift AOV by 10-15%, because outfit-thinking is native to the apparel buyer's decision frame.",
    successMetric: "AOV on PDPs with the module enabled lifts 10-15% against PDPs without it.",
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
    observation: "SMS is the only major owned channel not in use, and email list growth has been flat for two quarters.",
    hypothesis: "We believe launching an SMS marketing program (welcome series + abandoned cart + win-back) will deliver $40-50k in attributable revenue in the first 90 days, because SMS as a channel has been proven at Northcove (NH-011) and Retailer 1 (R1-002) but is not yet running at R2.",
    successMetric: "SMS-attributed revenue reaches $40-50k within 90 days of launch.",
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
// The two arrays above are an authored narrative, kept at their authored dates
// and shifted onto today's timeline at load time. The machinery that does it —
// and the derivation of the weekly figures this config never authored — lives
// in services/seedRebase.js, shared with every other config so a fix to it
// cannot land in one client and miss the other. See that file for the reasoning.

const AUTHORED_LAST_WEEK = "2026-05-18";  // most recent date in SEED_WEEKLY_METRICS_AUTHORED

export const { SEED, SEED_WEEKLY_METRICS, SEED_AD_ACCOUNT } = buildSeed({
  authoredLastWeek: AUTHORED_LAST_WEEK,
  seed: SEED_AUTHORED,
  weeklyMetrics: SEED_WEEKLY_METRICS_AUTHORED,
  adAccount: [],
});

// A client deployment starts with no seeded ad account and no captured debate:
// its performance rows come from that client's own export on day one, and a
// transcript is only worth shipping when it was produced against real data. The
// demo config authors both — see config.demo.js for the contract they follow.
export const SEED_NAMING_CUSTOM = { dimensions: [], vocabAdditions: {} };
export const SEED_DEBATES = [];
