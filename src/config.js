// =============================================================================
// GROWTH OS — DEPLOYMENT CONFIG
// =============================================================================
// This file contains everything that changes between deployments.
// To create a new instance (e.g. for a different client):
//   1. Copy this file to config.[clientname].js
//   2. Fill in the values below
//   3. Import it in App.jsx instead of this file
//   4. Deploy
//
// App logic lives in App.jsx and never needs to change between clients.
// =============================================================================

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
    color:     "#c08820",
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
export const SEED = [
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
];
