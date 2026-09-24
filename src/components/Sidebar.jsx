import { NAV_SECTIONS } from "./navSections.js";
import {
  IconFlask, IconPanelClose, IconPanelOpen, IconRefresh,
  IconSliders, IconHelp, IconSun, IconMoon, IconSparkle,
  IconDashboard, IconTarget, IconList, IconBook, IconLineChart,
  IconInbox, IconImage, IconFileText,
} from "./icons.jsx";

// -- Sidebar navigation --------------------------------------------------------
//
// Replaces the horizontal tab strip, which had run out of room. A sidebar holds
// twelve items as comfortably as six, groups them, and carries a live count
// without cramping.
//
// The rail is chrome end to end: an icon and a plain label per destination, a
// quiet hover, and one accent for "you are here". It used to carry a two-letter
// code chip, a laboratory subtitle and a tagline per section, and three labels
// per item read as decoration rather than wayfinding. What each view answers is
// still there, in the item's tooltip.
//
// The section vocabulary and per-view descriptions live in navSections.js.

const ICONS = {
  dashboard: IconDashboard, agenda: IconTarget, initiatives: IconList, library: IconBook,
  performance: IconLineChart, triage: IconInbox, creative: IconImage, readout: IconFileText,
};

// Queues are the one kind of count that asks for action, so they get the
// accent pill; every other count is a quiet tally.
const QUEUES = new Set(["triage"]);

function NavItem({ t, item, active, count, collapsed, onClick }) {
  const Glyph = ICONS[item.icon] || IconDashboard;
  const hasCount = count != null && count > 0;
  const queue = QUEUES.has(item.key);
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label + " · " + item.blurb : item.blurb}
      className="gos-nav"
      style={{
        "--gos-hover-bg": active ? t.goldBg : t.borderSoft,
        position:"relative",
        display:"flex", alignItems:"center", gap:10, width:"100%", minHeight:34,
        textAlign:"left", justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "8px 0" : "0 10px",
        borderRadius:t.r.md, cursor:"pointer", fontFamily:t.sans, border:"none",
        background: active ? t.goldBg : "transparent",
        color: active ? t.gold : t.textSub,
      }}
    >
      <Glyph size={16}/>

      {collapsed && hasCount && (
        <span aria-hidden="true" style={{
          position:"absolute", top:5, right:9, width:6, height:6, borderRadius:"50%",
          background: queue ? t.goldFill : t.textFaint,
        }}/>
      )}

      {!collapsed && (
        <>
          <span style={{ flex:1, minWidth:0, fontSize:14, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {item.label}
          </span>
          {hasCount && (queue ? (
            <span style={{ fontSize:11.5, fontWeight:600, color:t.goldText, background:t.goldFill, borderRadius:t.r.pill, padding:"1px 7px", lineHeight:1.5 }}>{count}</span>
          ) : (
            <span style={{ fontSize:12, fontWeight:500, color: active ? t.gold : t.textMuted }}>{count}</span>
          ))}
        </>
      )}
    </button>
  );
}

// Borderless square control for the collapse toggle and the utility row.
const ghostBtn = (t) => ({
  "--gos-hover-bg": t.borderSoft,
  height:32, borderRadius:t.r.md, cursor:"pointer", background:"transparent",
  border:"none", color:t.textMuted, lineHeight:1,
  display:"flex", alignItems:"center", justifyContent:"center",
  fontFamily:t.sans, flexShrink:0,
});

export function Sidebar({
  t, dk, nav, onNav, counts, brands, activeBrand, setActiveBrand,
  demoMode, onResetDemo, onTour, onSignal, onGuide, onSettings, onToggleTheme, onClose,
  collapsed = false, onToggleCollapse,
}) {
  // Collapsed, the rail keeps every destination reachable: it drops labels,
  // not items. The brand scope and the demo controls live in the expanded rail
  // and a count becomes a dot.
  const scoped = activeBrand !== "all";
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:t.surfaceAlt, borderRight:"1px solid "+t.border, overflow:"hidden" }}>

      {/* Wordmark — also the home control, and the tour's first anchor */}
      <div style={{ padding: collapsed ? "16px 8px 8px" : "16px 12px 8px 16px",
        display:"flex", alignItems:"center", gap:8, justifyContent: collapsed ? "center" : "space-between" }}>
        <button onClick={() => { onNav("dashboard"); if (onClose) onClose(); }} title="Back to Dashboard" data-tour="logo"
          style={{ display:"flex", alignItems:"center", gap:10, padding:0, background:"transparent", border:"none", cursor:"pointer", minWidth:0, textAlign:"left" }}>
          <span style={{ width:30, height:30, borderRadius:t.r.md, background:t.goldFill, color:t.goldText, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <IconFlask size={16}/>
          </span>
          {!collapsed && (
            <span style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", lineHeight:1.25, minWidth:0 }}>
              <span style={{ fontSize:14, fontWeight:600, letterSpacing:"-0.01em", color:t.text, whiteSpace:"nowrap" }}>Marketers Lab</span>
              <span style={{ fontSize:12, color:t.textMuted, whiteSpace:"nowrap" }}>Experiment ledger</span>
            </span>
          )}
        </button>
        {!collapsed && onToggleCollapse && (
          <button onClick={onToggleCollapse} title="Collapse the sidebar" aria-label="Collapse the sidebar"
            className="gos-nav" style={{ ...ghostBtn(t), width:32 }}>
            <IconPanelClose size={15}/>
          </button>
        )}
      </div>

      {collapsed && onToggleCollapse && (
        <div style={{ padding:"4px 8px 0" }}>
          <button onClick={onToggleCollapse} title="Expand the sidebar" aria-label="Expand the sidebar"
            className="gos-nav" style={{ ...ghostBtn(t), width:"100%" }}>
            <IconPanelOpen size={15}/>
          </button>
        </div>
      )}

      {/* Scope. Sits above the nav because it filters everything the nav leads
          to; tinted only when it is actually narrowing the view. */}
      {!collapsed && brands.length > 1 && (
        <div style={{ padding:"8px 12px 4px" }}>
          <select value={activeBrand} onChange={e => setActiveBrand(e.target.value)} data-tour="brand-select"
            aria-label="Brand scope"
            style={{ fontSize:13, height:34, padding:"0 10px", borderRadius:t.r.md, width:"100%", boxSizing:"border-box",
              border:"1px solid "+(scoped ? t.goldBorder : t.border),
              background: scoped ? t.goldBg : t.surface,
              color: scoped ? t.gold : t.textSub, fontFamily:t.sans, fontWeight:500, cursor:"pointer" }}>
            <option value="all">All retailers</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {/* Sections */}
      <nav aria-label="Main" style={{ padding: collapsed ? "8px" : "8px 12px", display:"flex", flexDirection:"column", gap:16, overflowY:"auto", overflowX:"hidden", flex:1 }}>
        {NAV_SECTIONS.map(section => (
          <div key={section.id}>
            {section.label && (collapsed ? (
              <div aria-hidden="true" style={{ height:1, background:t.border, margin:"0 6px 10px" }}/>
            ) : (
              <div style={{ padding:"0 10px 6px", fontSize:12, fontWeight:500, color:t.textMuted }}>
                {section.label}
              </div>
            ))}
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              {section.items.map(item => (
                <NavItem key={item.key} t={t} item={item} active={nav === item.key} collapsed={collapsed}
                  count={counts ? counts[item.key] : null}
                  onClick={() => { onNav(item.key); if (onClose) onClose(); }} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Foot — the agent layer, demo state, and utilities */}
      <div style={{ borderTop:"1px solid "+t.border, padding: collapsed ? "10px 8px" : "12px", display:"flex", flexDirection:"column", gap:8 }}>
        <button onClick={onSignal} data-tour="signal-button"
          title={collapsed ? "Ask Signal — a second opinion, grounded in this portfolio" : "A second opinion, grounded in this portfolio"}
          aria-label="Ask Signal"
          className="gos-nav"
          style={{ "--gos-hover-bg": t.goldBg, fontSize:13, height:34, padding: collapsed ? 0 : "0 12px", borderRadius:t.r.md, cursor:"pointer", width:"100%",
            background:t.surface, border:"1px solid "+t.border, color:t.text, fontWeight:500,
            fontFamily:t.sans, display:"flex", alignItems:"center", justifyContent: collapsed ? "center" : "flex-start", gap:8 }}>
          <span style={{ color:t.gold, display:"flex" }}><IconSparkle size={15}/></span>
          {!collapsed && "Ask Signal"}
        </button>

        {!collapsed && demoMode && (
          <div style={{ display:"flex", alignItems:"center", gap:4, padding:"2px 2px 2px 10px", fontSize:12.5, color:t.textMuted }}>
            <span title="This workspace runs on seeded demo data. Nothing here is a real customer's numbers."
              style={{ display:"flex", alignItems:"center", gap:7, flex:1, whiteSpace:"nowrap" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:t.teal, flexShrink:0 }}/>
              Demo data
            </span>
            <button onClick={onTour} title="Replay the guided tour" className="gos-nav"
              style={{ ...ghostBtn(t), height:28, padding:"0 8px", fontSize:12.5, fontWeight:500 }}>
              Tour
            </button>
            <button onClick={onResetDemo} title="Reset everything to the seed portfolio" aria-label="Reset demo data" className="gos-nav"
              style={{ ...ghostBtn(t), width:28, height:28 }}>
              <IconRefresh size={14}/>
            </button>
          </div>
        )}

        <div style={{ display:"flex", gap:2, flexDirection: collapsed ? "column" : "row" }}>
          {[
            { fn:onGuide,       Icon:IconHelp,     title:"What can Marketers Lab do?" },
            { fn:onSettings,    Icon:IconSliders,  title:"Settings" },
            { fn:onToggleTheme, Icon: dk ? IconSun : IconMoon, title: dk ? "Light mode" : "Dark mode" },
          ].map(({ fn, Icon, title }) => (
            <button key={title} onClick={fn} title={title} aria-label={title} className="gos-nav"
              style={{ ...ghostBtn(t), flex: collapsed ? "none" : 1, width: collapsed ? "100%" : undefined }}>
              <Icon size={16}/>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
