// Shared text renderers for AI-generated and user-entered prose. Kept out of
// citation.jsx so that file only exports components (react-refresh).
// Figures stay monospaced even inside serif prose, so a "$28k" quoted in a
// key learning lines up with the same number shown in a table. Captures an
// optional currency symbol, the digit run, and a trailing unit (%, k, x, ...).
const NUM_RE = /((?:[$£€]\s?)?\d[\d,]*(?:\.\d+)?(?:\s?[%kKxMB])?)/g;

export function renderNums(text, t, keyPrefix = "n") {
  if (text === null || text === undefined || text === "") return null;
  // `t` may be the theme or, for components that don't receive one, the
  // monospace family directly.
  const mono = typeof t === "string" ? t : t.mono;
  // split() with a single capture group puts the matches at the odd indices.
  return String(text).split(NUM_RE).map((seg, i) =>
    seg === "" ? null
    : i % 2
      ? <span key={keyPrefix + i} style={{fontFamily:mono}}>{seg}</span>
      : <span key={keyPrefix + i}>{seg}</span>
  );
}

// Parse a text block, turning [INIT-ID] tokens into clickable citation chips.
// idResolver maps an id string -> item (or null). Unknown ids render as plain
// text so a hallucinated/stale id never produces a dead link. onCite(item) opens
// the modal. Returns an array of React nodes safe to splice into a <p>.
export function renderCitedText(text, idResolver, onCite, t) {
  if (!text) return null;
  const parts = String(text).split(/(\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]$/);
    if (!m) return <span key={i}>{renderNums(part, t, "c" + i + "-")}</span>;
    const item = idResolver(m[1].trim());
    if (!item) return <span key={i}>{part}</span>;
    return (
      <button key={i} onClick={()=>onCite(item)} title={item.title}
        style={{display:"inline",padding:"0 4px",margin:"0 1px",fontSize:"0.82em",fontWeight:700,fontFamily:t.mono,
          color:t.gold,background:t.goldBg,border:"1px solid "+t.goldBorder,borderRadius:4,cursor:"pointer",lineHeight:1.4,verticalAlign:"baseline"}}>
        {item.initId || m[1].trim()}
      </button>
    );
  });
}

