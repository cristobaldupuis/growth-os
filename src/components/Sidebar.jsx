import { NAV_SECTIONS } from "./navSections.js";
import { interactive } from "./motion.js";
import {
  IconFlask, IconPanelClose, IconPanelOpen, IconRefresh,
  IconSettings, IconHelp, IconSun, IconMoon, IconSparkle,
} from "./icons.jsx";

// -- Sidebar navigation --------------------------------------------------------
//
// Replaces the horizontal tab strip, which had run out of room. At six views
// plus thirteen header controls the top bar was scrolling sideways on a laptop
// and clipping on a phone, and every new view made it worse — the strip was a
// fixed budget being spent by a growing product.
//
// A sidebar is the shape that fits what this is becoming: it holds twelve items
// as comfortably as six, it groups them, it has room for a one-line description
// of what each view answers, and it can carry a live count without cramping.
//
// The section vocabulary and per-view descriptions live in navSections.js.

// Two lines, never three. The blurb used to render inline after the laboratory
// name, and at a 216px rail that is a sentence in roughly 150px of measure — it
// wrapped to two lines on every item, so seven destinations occupied the height
// of eleven and the rail read as a wall of prose rather than a list. The blurb
// still exists and still does its job; it moved to the tooltip, where it costs
// no height and is there for anyone who wants it. What has to be legible at a
// glance is the label, and that is now the thing the eye lands on.
function NavItem({ t, item, active, count, collapsed, onClick }) {
  // Collapsed, the code chip IS the item — so the label it stands for has to be
  // in the tooltip, not just the flavour. A 56px rail that only says "MS" and
  // makes you click to find out is a worse rail than no rail.
  const hint = collapsed
    ? item.label + " — " + item.lab + " · " + item.blurb
    : item.lab + " · " + item.blurb;
  const int = interactive(t, active ? t.goldFill : t.goldBorder, { flat:true, hoverBg:t.surfaceAlt });
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={hint}
      className={int.className}
      style={{
        ...int.style,
        display:"flex", alignItems:"center", gap:9, width:"100%",
        textAlign:"left", justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "7px 0" : "6px 9px",
        borderRadius:8, cursor:"pointer", fontFamily:t.sans,
        background: active ? t.surface : "transparent",
        border: "1px solid " + (active ? t.border : "transparent"),
        boxShadow: active ? t.shadow : "none",
      }}
      data-active={active ? "true" : undefined}
    >
      <span style={{
        width:20, height:20, borderRadius:6, flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:t.mono, fontSize:8.5, fontWeight:700, letterSpacing:"0.02em",
        background: active ? t.goldFill : t.surfaceAlt,
        color: active ? t.goldText : t.textMuted,
        border: "1px solid " + (active ? t.goldFill : t.border),
      }}>{item.code}</span>

      {collapsed && count != null && count > 0 && (
        <span aria-hidden="true" style={{
          position:"absolute", top:4, right:6, width:5, height:5, borderRadius:"50%",
          background:t.goldFill,
        }}/>
      )}

      {!collapsed && (
      <>
      {/* Plain label leads; the laboratory name rides in the subtitle, where it
          carries the flavour and explains the code without ever being the only
          way to find the view. */}
      <span style={{ minWidth:0, flex:1 }}>
        <span style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:13, fontWeight: active ? 600 : 500, color: active ? t.text : t.textSub, whiteSpace:"nowrap" }}>
            {item.label}
          </span>
          {count != null && count > 0 && (
            <span style={{ fontFamily:t.mono, fontSize:10, color:t.textMuted, fontWeight:600 }}>{count}</span>
          )}
        </span>
        {/* Clamped rather than merely short: a longer laboratory name in a future
            config must shorten this line, never add one. */}
        <span style={{
          display:"block", fontSize:10, lineHeight:1.35, fontFamily:t.sans, fontStyle:"italic",
          color: active ? t.gold : t.textMuted,
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
        }}>
          {item.lab}
        </span>
      </span>
      </>
      )}
    </button>
  );
}

// Small square control, used for the collapse toggle and the utility row so
// they read as one family rather than three sizes of button.
const railBtn = (t) => ({
  height:26, borderRadius:7, cursor:"pointer", background:t.surface,
  border:"1px solid "+t.border, color:t.textSub, lineHeight:1,
  display:"flex", alignItems:"center", justifyContent:"center",
  fontSize:12, fontWeight:700, fontFamily:t.sans, flexShrink:0,
  transition:"background .15s, border-color .15s, color .15s",
});

export function Sidebar({
  t, dk, nav, onNav, counts, brands, activeBrand, setActiveBrand,
  demoMode, onResetDemo, onTour, onSignal, onGuide, onSettings, onToggleTheme, onClose,
  collapsed = false, onToggleCollapse,
}) {
  // Collapsed the rail keeps every destination reachable — it drops labels, not
  // items. A collapse that hides views is a menu, and finding a view through a
  // menu is exactly the cost the sidebar was built to remove. What goes is the
  // wordmark text, the section vocabulary, the brand select and the counts,
  // each of which has somewhere else to live: the header shows the active view,
  // the brand scope moves to a tooltip on the mark, and a count becomes a dot.
  const pad = collapsed ? "12px 8px" : "12px 8px";
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:t.surfaceAlt, borderRight:"1px solid "+t.border, overflow:"hidden" }}>

      {/* Wordmark — also the home control, and the tour's first anchor */}
      <div style={{ padding: collapsed ? "14px 8px 12px" : "16px 14px 14px", borderBottom:"1px solid "+t.borderSoft,
        display:"flex", alignItems:"center", gap:8, justifyContent: collapsed ? "center" : "space-between" }}>
        {/* The mark used to be the letters "GO" beside the wordmark "GROWTH OS",
            which DECISIONS.md retired as a customer-facing name — the shell was
            the one place the rename pass never reached, and it sat in the most
            looked-at 200px of the interface for the length of every demo. The
            flask is the product's own noun: a lab is where work is expected to
            produce evidence, which is the whole claim. */}
        <button onClick={() => { onNav("dashboard"); if (onClose) onClose(); }} title="Back to Dashboard" data-tour="logo"
          style={{ display:"flex", alignItems:"center", gap:9, padding:0, background:"transparent", border:"none", cursor:"pointer", minWidth:0, textAlign:"left" }}>
          <span style={{ width:26, height:26, borderRadius:t.r.sm, background:t.goldFill, color:t.goldText, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <IconFlask size={15}/>
          </span>
          {!collapsed && (
            <span style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", lineHeight:1.2, minWidth:0 }}>
              <span style={{ fontSize:13, fontWeight:700, letterSpacing:"0.09em", color:t.text, fontFamily:t.sans, whiteSpace:"nowrap" }}>MARKETERS LAB</span>
              <span style={{ fontSize:9.5, color:t.textMuted, fontFamily:t.mono, letterSpacing:"0.09em", textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:126 }}>
                Experiment ledger
              </span>
            </span>
          )}
        </button>
        {!collapsed && onToggleCollapse && (
          <button onClick={onToggleCollapse} title="Collapse the sidebar" aria-label="Collapse the sidebar"
            style={{ ...railBtn(t), width:26 }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=t.goldBorder;e.currentTarget.style.color=t.gold;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.textSub;}}>
            <IconPanelClose size={14}/>
          </button>
        )}
      </div>

      {collapsed && onToggleCollapse && (
        <div style={{ padding:"8px 8px 0" }}>
          <button onClick={onToggleCollapse} title="Expand the sidebar" aria-label="Expand the sidebar"
            style={{ ...railBtn(t), width:"100%" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=t.goldBorder;e.currentTarget.style.color=t.gold;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.textSub;}}>
            <IconPanelOpen size={14}/>
          </button>
        </div>
      )}

      {/* Sections */}
      <nav style={{ padding:pad, display:"flex", flexDirection:"column", gap: collapsed ? 10 : 14, overflowY:"auto", overflowX:"hidden", flex:1 }}>
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            {collapsed ? (
              // The section vocabulary does not survive 56px, so the grouping is
              // carried by a rule instead of by a word. The grouping is the part
              // that matters here; the name of it is in the expanded rail.
              <div aria-hidden="true" style={{ height:1, background:t.borderSoft, margin:"0 6px 7px" }}/>
            ) : (
              <div style={{ padding:"0 9px 5px", display:"flex", alignItems:"baseline", gap:6 }}>
                <span style={{ fontFamily:t.mono, fontSize:9, letterSpacing:"0.13em", textTransform:"uppercase", color:t.textMuted, fontWeight:600 }}>
                  {section.label}
                </span>
                <span style={{ fontSize:9.5, color:t.textMuted, fontFamily:t.sans, opacity:0.8 }}>{section.hint}</span>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
              {section.items.map(item => (
                <NavItem key={item.key} t={t} item={item} active={nav === item.key} collapsed={collapsed}
                  count={counts ? counts[item.key] : null}
                  onClick={() => { onNav(item.key); if (onClose) onClose(); }} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Foot — scope, the agent layer, and utilities */}
      <div style={{ borderTop:"1px solid "+t.borderSoft, padding: collapsed ? "10px 8px" : "11px 10px", display:"flex", flexDirection:"column", gap:9 }}>
        {!collapsed && brands.length > 1 && (
          <select value={activeBrand} onChange={e => setActiveBrand(e.target.value)} data-tour="brand-select"
            style={{ fontSize:12, padding:"6px 9px", borderRadius:8, width:"100%", boxSizing:"border-box",
              border:"1px solid "+(activeBrand === "all" ? t.border : t.goldBorder),
              background: activeBrand === "all" ? t.surface : t.goldBg,
              color: activeBrand === "all" ? t.textSub : t.gold, fontFamily:t.sans, cursor:"pointer" }}>
            <option value="all">All retailers</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}

        <button onClick={onSignal} data-tour="signal-button"
          title={collapsed ? "Signal — a second opinion, grounded in this portfolio" : undefined}
          style={{ fontSize:12.5, padding: collapsed ? "8px 0" : "8px 12px", borderRadius:9, cursor:"pointer", width:"100%",
            background:t.goldFill, border:"1px solid "+t.goldFill, color:t.goldText, fontWeight:600,
            fontFamily:t.sans, display:"flex", alignItems:"center", justifyContent:"center", gap:6, boxShadow:t.shadow }}>
          <IconSparkle size={14}/>{!collapsed && "Signal"}
        </button>

        {!collapsed && demoMode && (
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span title="This workspace runs on seeded demo data. Nothing here is a real customer's numbers."
              style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, fontWeight:600, letterSpacing:"0.04em",
                color:t.textMuted, fontFamily:t.mono, background:t.surface, border:"1px solid "+t.border,
                borderRadius:20, padding:"3px 9px", whiteSpace:"nowrap", flex:1 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:t.gold, flexShrink:0 }}/>
              Demo data
            </span>
            <button onClick={onResetDemo} title="Reset everything to the seed portfolio" aria-label="Reset demo data"
              style={{ width:24, height:24, borderRadius:t.r.sm, cursor:"pointer", background:"transparent", border:"1px solid "+t.border, color:t.textMuted, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <IconRefresh size={13}/>
            </button>
            <button onClick={onTour} title="Replay the guided tour"
              style={{ height:24, padding:"0 8px", borderRadius:7, cursor:"pointer", background:"transparent", border:"1px solid "+t.border, color:t.textMuted, fontSize:10, fontWeight:600, fontFamily:t.sans, flexShrink:0 }}>
              Tour
            </button>
          </div>
        )}

        <div style={{ display:"flex", gap:6, flexDirection: collapsed ? "column" : "row" }}>
          {[
            { fn:onGuide,       Icon:IconHelp,            title:"What can Marketers Lab do?" },
            { fn:onSettings,    Icon:IconSettings,        title:"Settings" },
            { fn:onToggleTheme, Icon: dk ? IconSun : IconMoon, title: dk ? "Light mode" : "Dark mode" },
          ].map(({ fn, Icon, title }) => (
            <button key={title} onClick={fn} title={title} aria-label={title}
              style={{ ...railBtn(t), flex: collapsed ? "none" : 1, width: collapsed ? "100%" : undefined, height:28, borderRadius:t.r.sm }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=t.goldBorder;e.currentTarget.style.color=t.gold;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.textSub;}}>
              <Icon size={15}/>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
