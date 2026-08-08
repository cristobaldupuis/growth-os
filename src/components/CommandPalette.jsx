import { useEffect, useMemo, useRef, useState } from "react";
import { NAV_SECTIONS } from "./navSections.js";
import { useDialog } from "./useDialog.js";
import { IconSearch, IconArrowRight } from "./icons.jsx";
import { SL, SD } from "../constants.js";

// -- Command palette -----------------------------------------------------------
//
// There was no global search and no keyboard shortcut of any kind. To find an
// initiative you had to already know which of seven views it lived in, navigate
// there, and filter — so the most frequent question the interface has to answer,
// "where is the thing I am thinking of", was answered with navigation.
//
// Search existed in exactly two places and both were scoped: keyword search
// inside the Library (closed initiatives only) and a typeahead inside the
// linked-initiative picker (which cannot navigate anywhere).
//
// This is one component over data already in memory. It searches initiative
// titles, ids and hypotheses, learnings, and the nav destinations themselves,
// and it is the only keyboard-first surface in the app — arrow keys, Enter,
// Escape, with the active row tracked through `aria-activedescendant` so it is
// announced rather than merely highlighted.

const MAX_RESULTS = 8;

function score(needle, item) {
  // Ranking is deliberately blunt: an id or title prefix beats a title
  // substring, which beats a hit anywhere in the hypothesis. Anything cleverer
  // is unjustifiable on a corpus this size and harder to predict, and a search
  // whose ordering you cannot predict is one you stop trusting.
  const q = needle.toLowerCase();
  const id = (item.initId || "").toLowerCase();
  const title = (item.title || "").toLowerCase();
  if (id.startsWith(q)) return 100;
  if (title.startsWith(q)) return 90;
  if (id.includes(q)) return 70;
  if (title.includes(q)) return 60;
  if ((item.hypothesis || "").toLowerCase().includes(q)) return 30;
  if ((item.results?.keyLearning || "").toLowerCase().includes(q)) return 25;
  return 0;
}

export function CommandPalette({ t, dk, items, onClose, onOpenInitiative, onNavigate, onAction }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);
  const panelRef = useDialog({ onClose });
  const listboxId = "cmdk-list";

  const results = useMemo(() => {
    const navItems = NAV_SECTIONS.flatMap(s => s.items).map(i => ({
      kind: "nav", key: "nav-" + i.key, label: i.label, sub: i.blurb, target: i.key,
    }));
    const actions = [
      { kind:"action", key:"act-new",     label:"New initiative",  sub:"start from a template or blank", target:"new" },
      { kind:"action", key:"act-capture", label:"Quick capture",   sub:"paste an idea, AI structures it", target:"capture" },
      { kind:"action", key:"act-signal",  label:"Open Signal",     sub:"C-suite debate on this portfolio", target:"signal" },
      { kind:"action", key:"act-settings",label:"Settings",        sub:"brands, north star, naming, backup", target:"settings" },
    ];

    if (!q.trim()) {
      // The empty state is the shortcut list, not a blank box: a palette that
      // shows nothing until you type teaches nothing about what it can do.
      return [...navItems.slice(0, 5), ...actions.slice(0, 3)];
    }

    const needle = q.trim().toLowerCase();
    const matchedItems = items
      .map(e => ({ e, s: score(needle, e) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map(({ e }) => ({
        kind: "initiative", key: e.id, label: e.title, sub: e.initId || "",
        status: e.status, target: e.id,
      }));

    const matchedNav = [...navItems, ...actions]
      .filter(n => n.label.toLowerCase().includes(needle) || (n.sub || "").toLowerCase().includes(needle));

    return [...matchedItems, ...matchedNav].slice(0, 12);
  }, [q, items]);

  // Reset the cursor whenever the query changes underneath it, so Enter never
  // fires on a row that has scrolled out from under the highlight. Done during
  // render rather than in an effect — React's documented pattern for state
  // derived from other state, and the same one GuideDrawer uses: it lands
  // before paint, so there is no frame showing the old selection.
  const [lastQ, setLastQ] = useState(q);
  if (lastQ !== q) { setLastQ(q); setActive(0); }

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keep the active row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (r) => {
    if (!r) return;
    if (r.kind === "initiative") onOpenInitiative(r.target);
    else if (r.kind === "nav")   onNavigate(r.target);
    else                          onAction(r.target);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[active]); }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:dk?"rgba(0,0,0,0.6)":"rgba(20,18,10,0.35)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"12vh 16px 16px"}}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Search and commands" tabIndex={-1}
        style={{width:"100%",maxWidth:560,background:t.surface,border:"1px solid "+t.border,borderRadius:t.r.lg,boxShadow:t.shadowHi,overflow:"hidden",outline:"none"}}>

        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid "+t.borderSoft}}>
          <span style={{color:t.textMuted}}><IconSearch size={16}/></span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKeyDown}
            role="combobox" aria-expanded="true" aria-controls={listboxId} aria-autocomplete="list"
            aria-activedescendant={results[active] ? "cmdk-opt-" + active : undefined}
            aria-label="Search initiatives and commands"
            placeholder="Search initiatives, learnings, or jump to a view…"
            style={{flex:1,border:"none",outline:"none",background:"transparent",color:t.text,fontSize:15,fontFamily:t.sans}}/>
          <kbd style={{fontSize:10,fontFamily:t.mono,color:t.textMuted,border:"1px solid "+t.border,borderRadius:t.r.xs,padding:"2px 6px"}}>esc</kbd>
        </div>

        <div ref={listRef} id={listboxId} role="listbox" aria-label="Results"
          style={{maxHeight:"46vh",overflowY:"auto",padding:6}}>
          {results.length === 0 && (
            <div style={{padding:"22px 14px",textAlign:"center",color:t.textMuted,fontSize:13,fontFamily:t.sans}}>
              Nothing matches “{q}”.
            </div>
          )}
          {results.map((r, i) => {
            const on = i === active;
            const sc = r.status ? (dk ? SD : SL)[r.status] : null;
            return (
              <div key={r.key} id={"cmdk-opt-" + i} data-idx={i} role="option" aria-selected={on}
                onMouseMove={() => setActive(i)} onClick={() => run(r)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",borderRadius:t.r.sm,cursor:"pointer",
                  background:on?t.surfaceAlt:"transparent"}}>
                <span style={{fontSize:9,fontFamily:t.mono,letterSpacing:"0.08em",textTransform:"uppercase",color:t.textMuted,minWidth:52,flexShrink:0}}>
                  {r.kind === "initiative" ? (r.sub || "exp") : r.kind === "nav" ? "go to" : "do"}
                </span>
                <span style={{flex:1,minWidth:0,fontSize:13,color:t.text,fontFamily:t.sans,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {r.label}
                  {r.kind !== "initiative" && r.sub && (
                    <span style={{color:t.textMuted,fontSize:11.5,marginLeft:8}}>{r.sub}</span>
                  )}
                </span>
                {sc && (
                  <span style={{fontSize:9.5,fontWeight:600,color:sc.text,background:sc.bg,border:"1px solid "+sc.border,borderRadius:t.r.xs,padding:"1px 6px",flexShrink:0}}>
                    {r.status}
                  </span>
                )}
                {on && <span style={{color:t.textMuted,flexShrink:0}}><IconArrowRight size={13}/></span>}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:14,padding:"8px 16px",borderTop:"1px solid "+t.borderSoft,background:t.surfaceAlt,fontSize:10.5,color:t.textMuted,fontFamily:t.mono}}>
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
