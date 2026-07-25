// Shared text renderers for AI-generated and user-entered prose. Kept out of
// citation.jsx so that file only exports components (react-refresh).
//
// Numeral rule: a figure is set in the mono face only when it stands entirely
// alone as a figure, which means Est/Actual values, the outcome tile counts,
// dates, and standalone table cells. Those are styled at their own call sites,
// where the whole element is a number and nothing else. Prose never switches
// font mid-sentence, whatever shape the number takes ($28k, 80%, 0.3pp, 2.1x),
// so there is deliberately no numeral handling in this file.

// Em dashes read as a machine tell, and a lot of the prose on screen arrives
// from the model or from pasted notes. Normalise on the way out so no display
// path has to remember: a dash between clauses becomes a comma, a dangling one
// is dropped, and stacked punctuation is collapsed. En dashes are left alone,
// they carry numeric ranges like $80-$300 written as $80–$300.
const DASH_RE = /\s*[—―]\s*/g;

export function deEmDash(text) {
  if (text === null || text === undefined) return text;
  return String(text)
    .replace(DASH_RE, ", ")
    .replace(/([,;:.!?])\s*,\s*/g, "$1 ")
    .replace(/^\s*,\s*/, "")
    .replace(/\s*,\s*$/, "")
    .replace(/[ \t]{2,}/g, " ");
}

// Every run of display prose goes through here. It returns a plain string, so
// the text simply inherits whatever face its container sets.
export function renderProse(text) {
  if (text === null || text === undefined || text === "") return null;
  return deEmDash(text);
}

// Parse a text block, turning [INIT-ID] tokens into clickable citation chips.
// idResolver maps an id string -> item (or null). Unknown ids render as plain
// text so a hallucinated/stale id never produces a dead link. onCite(item) opens
// the modal. Returns an array of React nodes safe to splice into a <p>.
// The chip keeps the mono face: it is a discrete object with a border around it,
// not a number sitting in a sentence.
export function renderCitedText(text, idResolver, onCite, t) {
  if (!text) return null;
  const parts = String(text).split(/(\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]$/);
    if (!m) return <span key={i}>{renderProse(part)}</span>;
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
