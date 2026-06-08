import { brandName, DEFAULT_SETTINGS, METRIC_SOURCES } from "../constants.js";

// Compact, grounded view of the user's actual learning history. Used both for
// candidate generation and to validate sourceLearningIds during expansion.
export function buildLearningsIndex(items, brands) {
  const closed = (items||[]).filter(e =>
    (e.status==="Completed"||e.status==="Killed") && e.results && e.results.keyLearning
  );
  return closed.map(e => ({
    id: e.id,
    initId: e.initId || e.id,
    title: e.title,
    category: e.category,
    initType: e.initType,
    retailer: brandName(e.brandId, brands),
    outcome: e.results.outcomeClassification || "Inconclusive",
    learning: e.results.keyLearning,
    actualRev: e.results.actualRevenueImpact != null ? e.results.actualRevenueImpact : null,
    closedDate: e.endDate || e.createdAt || null,
    durability: e.results.durability === "structural" ? "structural" : "tactical",
    // Provenance — how trustworthy is this learning's evidence?
    //   tracked    = ran through the system with a frozen launch prediction
    //                (predictionSnapshot exists), so prediction-vs-actual is real.
    //   backfilled = imported as history with no frozen prediction; the actual is
    //                a remembered estimate. Still useful, but lower-confidence.
    // Derived automatically from the snapshot, never user-set, so it can't be faked.
    provenance: e.predictionSnapshot ? "tracked" : "backfilled",
  }));
}

// Tools the agents can call against the live portfolio

export function buildPortfolioTools(items, settings, brands, activeBrand) {
  const filter = e => activeBrand === "all" || (e.brandId||"default") === activeBrand;
  const all = items.filter(filter);
  const iceS = e => e.ice ? Math.round(((e.ice.impact||0)*(e.ice.certainty||0)*(e.ice.ease||0)/1000)*100) : 0;

  return {
    // Tool definitions sent to the API
    definitions: [
      {
        name: "get_portfolio_summary",
        description: "Get high-level portfolio statistics: running count, draft count, revenue at risk, win rate, avg ICE, north star gap.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_running_initiatives",
        description: "Get all currently running initiatives with title, category, revenue at risk, owner, and any blockers.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_category_coverage",
        description: "Get a breakdown of how many initiatives (running + draft) exist per category, revealing coverage gaps.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_win_rate_by_category",
        description: "Get historical win rate and average actual revenue impact broken down by initiative category.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_top_draft_opportunities",
        description: "Get the highest-ICE draft initiatives that are not yet running — the best uninitiated opportunities.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_failure_patterns",
        description: "Get what has failed or been killed, with key learnings, to avoid repeating mistakes.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_blocked_initiatives",
        description: "Get all initiatives currently blocked and what they are waiting on.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
      {
        name: "get_revenue_gap_analysis",
        description: "Calculate the gap between north star current and target, and how much running initiatives cover it.",
        input_schema: { type:"object", properties:{}, required:[] }
      },
    ],

    // Tool executor — called when model uses a tool
    execute(toolName) {
      const running  = all.filter(e => e.status==="Running");
      const draft    = all.filter(e => e.status==="Draft");
      const closed   = all.filter(e => e.status==="Completed"||e.status==="Killed");
      const wins     = closed.filter(e => e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success"));
      const failures = closed.filter(e => e.results&&(e.results.outcomeClassification==="Failed"||e.results.outcomeClassification==="Inconclusive"));
      const blocked  = running.filter(e => e.blocker&&e.blocker!=="None");

      switch(toolName) {
        case "get_portfolio_summary": {
          const revAtRisk = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
          const winRate   = closed.length>0?Math.round((wins.length/closed.length)*100):null;
          const iceScores = all.filter(e=>e.ice).map(iceS).filter(s=>s>0);
          const avgIce    = iceScores.length>0?Math.round(iceScores.reduce((a,b)=>a+b,0)/iceScores.length):null;
          return { running:running.length, draft:draft.length, closed:closed.length,
            revenue_at_risk:`$${revAtRisk.toLocaleString()}`, win_rate:winRate!==null?winRate+"%":"n/a",
            avg_ice:avgIce||"n/a", blocked_count:blocked.length,
            north_star:{ metric:settings.northStarMetric, current:settings.northStarCurrent, target:settings.northStarTarget }};
        }
        case "get_running_initiatives":
          return running.map(e=>({
            id:e.initId, title:e.title, category:e.category, owner:e.owner||"unassigned",
            revenue_at_risk:`$${(e.revenueImpact||0).toLocaleString()}`,
            blocker:e.blocker&&e.blocker!=="None"?e.blocker:"none",
            ice:iceS(e), end_date:e.endDate||"no end date",
          }));
        case "get_category_coverage": {
          const cats = settings.categories || DEFAULT_SETTINGS.categories;
          return cats.map(cat=>({
            category:cat,
            running:running.filter(e=>e.category===cat).length,
            draft:draft.filter(e=>e.category===cat).length,
            total:all.filter(e=>e.category===cat).length,
          })).sort((a,b)=>(b.running+b.draft)-(a.running+a.draft));
        }
        case "get_win_rate_by_category": {
          const cats = [...new Set(closed.map(e=>e.category))];
          return cats.map(cat=>{
            const catClosed = closed.filter(e=>e.category===cat);
            const catWins   = catClosed.filter(e=>e.results&&(e.results.outcomeClassification==="Jackpot"||e.results.outcomeClassification==="Success"));
            const actuals   = catClosed.filter(e=>e.results&&typeof e.results.actualRevenueImpact==="number");
            const avgActual = actuals.length>0?Math.round(actuals.reduce((s,e)=>s+(e.results.actualRevenueImpact||0),0)/actuals.length):null;
            return { category:cat, closed:catClosed.length, wins:catWins.length,
              win_rate:catClosed.length>0?Math.round((catWins.length/catClosed.length)*100)+"%":"n/a",
              avg_actual_revenue:avgActual!==null?`$${avgActual.toLocaleString()}`:"no data" };
          }).sort((a,b)=>b.closed-a.closed);
        }
        case "get_top_draft_opportunities":
          return draft.sort((a,b)=>iceS(b)-iceS(a)).slice(0,6).map(e=>({
            id:e.initId, title:e.title, category:e.category,
            ice:iceS(e), est_revenue:`$${(e.revenueImpact||0).toLocaleString()}`,
            hypothesis:(e.hypothesis||"").slice(0,120)+"…",
          }));
        case "get_failure_patterns":
          return failures.slice(0,6).map(e=>({
            title:e.title, category:e.category,
            outcome:e.results?.outcomeClassification,
            key_learning:e.results?.keyLearning||"no learning recorded",
            decision:e.results?.decisionMade||"no decision recorded",
          }));
        case "get_blocked_initiatives":
          return blocked.map(e=>({
            id:e.initId, title:e.title, category:e.category,
            blocked_by:e.blocker, revenue_at_risk:`$${(e.revenueImpact||0).toLocaleString()}`,
          }));
        case "get_revenue_gap_analysis": {
          const revAtRisk = running.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
          const draftRev  = draft.reduce((s,e)=>s+Math.max(0,e.revenueImpact||0),0);
          return {
            current:settings.northStarCurrent, target:settings.northStarTarget,
            revenue_at_risk_from_running:`$${revAtRisk.toLocaleString()}`,
            potential_from_draft_pipeline:`$${draftRev.toLocaleString()}`,
            note:"Revenue at risk = estimated impact of running initiatives. Does not account for probability of success."
          };
        }
        default: return { error:`Unknown tool: ${toolName}` };
      }
    }
  };
}

// Build a concise portfolio snapshot (still used as initial context)
export function buildPortfolioContext(items, settings, brands, activeBrand, weeklyMetrics) {
  const tools = buildPortfolioTools(items, settings, brands, activeBrand);
  const summary = tools.execute("get_portfolio_summary");
  const running = tools.execute("get_running_initiatives");
  const coverage = tools.execute("get_category_coverage");
  const topDrafts = tools.execute("get_top_draft_opportunities");

  const runStr = running.slice(0,8).map(e =>
    `  [${e.id||"?"}] "${e.title}" | ${e.category} | ${e.revenue_at_risk}${e.blocker!=="none"?" | ⚠️ "+e.blocker:""}`
  ).join("\n") || "  (none)";

  const gapCats = coverage.filter(c=>c.running===0&&c.draft===0).map(c=>c.category).join(", ");

  // Build live metrics block
  let metricsBlock = "";
  if (weeklyMetrics && weeklyMetrics.length > 0) {
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // last 5 weeks
    const recent = weeklyMetrics
      .filter(m => new Date(m.date+"T12:00:00") >= recentCutoff)
      .sort((a,b) => b.date.localeCompare(a.date));

    const latestDate = recent[0]?.date;
    const daysSinceLast = latestDate
      ? Math.floor((now - new Date(latestDate+"T12:00:00")) / 86400000)
      : null;

    const stalenessNote = daysSinceLast !== null && daysSinceLast > 10
      ? ` ⚠️ Note: metrics are ${daysSinceLast} days old — treat as directional.`
      : "";

    // Group by brand+source for latest week
    const latestByBrandSource = {};
    recent.forEach(m => {
      const key = `${m.brand}::${m.source}`;
      if (!latestByBrandSource[key]) latestByBrandSource[key] = m;
    });

    // For each brand+source, find previous week for WoW delta
    const prevByBrandSource = {};
    recent.forEach(m => {
      const key = `${m.brand}::${m.source}`;
      if (latestByBrandSource[key] && m.date < latestByBrandSource[key].date) {
        if (!prevByBrandSource[key] || m.date > prevByBrandSource[key].date) {
          prevByBrandSource[key] = m;
        }
      }
    });

    const metricsLines = Object.entries(latestByBrandSource).map(([key, latest]) => {
      const [brand, source] = key.split("::");
      const prev = prevByBrandSource[key];
      const brandLabel = brand === "default" ? (brands[0]?.name || "Portfolio") : (brands.find(b=>b.id===brand)?.name || brand);
      const srcDef = METRIC_SOURCES.find(s=>s.id===source);
      const srcLabel = srcDef ? srcDef.label : source;

      const metricParts = Object.entries(latest.metrics)
        .filter(([k]) => k !== "notes")
        .map(([k, v]) => {
          const label = k.toUpperCase();
          let delta = "";
          if (prev && prev.metrics[k] !== undefined && typeof v === "number") {
            const d = ((v - prev.metrics[k]) / Math.max(Math.abs(prev.metrics[k]), 0.01) * 100);
            delta = " (" + (d >= 0 ? "+" : "") + d.toFixed(1) + "% WoW)";
          }
          return `${label}: ${typeof v === "number" ? v.toLocaleString() : v}${delta}`;
        }).join(" | ");

      return `  [${brandLabel} · ${srcLabel}] ${latest.date}: ${metricParts}`;
    }).join("\n") || "  (none logged)";

    metricsBlock = `\nLIVE METRICS${stalenessNote}:\n${metricsLines}`;
  } else {
    metricsBlock = "\nLIVE METRICS: Not yet logged — agents should note data is manually estimated only.";
  }

  // Build brand briefs block
  const briefedBrands = (brands||[]).filter(b =>
    b.whatTheySell || b.categories || b.icp || b.whyTheyWin || b.relationship || b.constraint
  );
  const brandBriefsBlock = briefedBrands.length > 0
    ? "\nBRAND BRIEFS:\n" + briefedBrands.map(b => {
        const lines = [`  [${b.name}]`];
        if (b.whatTheySell)  lines.push(`    What they sell: ${b.whatTheySell}`);
        if (b.categories)    lines.push(`    Categories: ${b.categories}`);
        if (b.icp)           lines.push(`    ICP: ${b.icp}`);
        if (b.whyTheyWin)    lines.push(`    Why they win: ${b.whyTheyWin}`);
        if (b.relationship)  lines.push(`    Relationship: ${b.relationship}`);
        if (b.constraint)    lines.push(`    Current constraint: ${b.constraint}`);
        return lines.join("\n");
      }).join("\n")
    : "";

  return `COMPANY: ${settings.companyName} | ${settings.businessModel}
NORTH STAR: ${settings.northStarMetric} | Now: ${settings.northStarCurrent} → Target: ${settings.northStarTarget}
PORTFOLIO: ${summary.running} running | ${summary.draft} draft | ${summary.blocked_count} blocked | Win rate: ${summary.win_rate} | Avg ICE: ${summary.avg_ice}
REVENUE AT RISK: ${summary.revenue_at_risk}${brandBriefsBlock}

RUNNING:
${runStr}

TOP UNINITIATED DRAFTS (by ICE):
${topDrafts.slice(0,4).map(e=>`  [ICE ${e.ice}] "${e.title}" | ${e.category} | ${e.est_revenue}`).join("\n")||"  (none)"}

UNCOVERED CATEGORIES (zero initiatives): ${gapCats||"none"}${metricsBlock}`.trim();
}
