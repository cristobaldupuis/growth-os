import { useState, useMemo } from "react";
import { gG, gGh, gI, gSl, gSL, gCd } from "./styles.js";
import { interactive } from "./motion.js";
import {
  buildNameSet, channelDimensions, listChannels, listLevels, DIMENSION_FAMILIES,
  adNamesOf, adNameEntry, assignedNameIndex, normKey, NA,
} from "../services/naming.js";

// -- Name builder --------------------------------------------------------------
//
// The write end of the convention, as a page rather than as a side effect.
//
// It existed before, twice, and neither time as a thing you could go to. The
// Creative Studio assembles names, but only as a consequence of generating
// variants against an initiative — so getting one name for one campaign meant
// producing a creative brief you did not want. And the Convention tab described
// the templates without letting you fill one in. The gap between "here is the
// grammar" and "here is a sentence" was left for the operator to cross in their
// head, which is precisely the crossing the convention exists to remove.
//
// Two design commitments, both inherited from naming.js rather than invented
// here:
//
//   One record, every level. You fill in dimensions once and the campaign, ad
//   set and ad names fall out together, guaranteed consistent because they are
//   projections of the same values rather than three strings typed on three
//   different days. Editing per level would ask for `geo` twice on Meta, and the
//   second answer is not a second decision — it is the same decision restated
//   with a chance to contradict itself.
//
//   The name is never typed. Every field is a control: a select where the
//   dimension is controlled, an input where it is genuinely open-ended. A name
//   that renders here is a name that will parse when the export comes back,
//   because the same function that builds it is the one the parser round-trips
//   against.
//
// The assignment step at the bottom is the other half of the user's problem. A
// built name is only worth something once the initiative claims it, and claiming
// is what makes an import find its way home — see the two-bridges note in
// naming.js for why assignment is a separate mechanism from the tag slot rather
// than a redundant one.

/** One dimension's editor. Controlled vocabulary becomes a select, by design. */
function Field({ t, dim, value, onChange, placeholder, locked, lockNote }) {
  const isNA = normKey(value) === normKey(placeholder);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text, fontFamily: t.sans }}>{dim.label}</span>
        <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.textMuted }}>
          {(dim.levels || []).map(l => l.label).join(" · ")}
        </span>
      </div>

      {locked ? (
        <div style={{ ...gI(t), fontFamily: t.mono, background: t.surfaceAlt, color: isNA ? t.textMuted : t.text,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
          <span style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted, flexShrink: 0 }}>
            stamped
          </span>
        </div>
      ) : dim.vocab ? (
        <select value={dim.vocab.some(v => normKey(v) === normKey(value)) ? value : placeholder}
          onChange={e => onChange(e.target.value)}
          style={{ ...gSl(t), fontFamily: t.mono, color: isNA ? t.textMuted : t.text }}>
          {!dim.vocab.some(v => normKey(v) === normKey(placeholder)) && <option value={placeholder}>{placeholder} — not applicable</option>}
          {dim.vocab.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...gI(t), fontFamily: t.mono, color: isNA ? t.textMuted : t.text }} />
      )}

      <div style={{ fontSize: 10.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.45, marginTop: 4 }}>
        {locked ? lockNote : dim.hint}
      </div>
    </div>
  );
}

export function NameBuilder({ t, schema, items, initiativeId, onInitiative, onAssign, showToast }) {
  const channels = listChannels(schema);
  const ph = schema.placeholder || NA;
  const initKey = schema.initiativeDimension;

  const [channel, setChannel] = useState(channels[0]?.id || "");
  const [values, setValues]   = useState({});

  const dims   = useMemo(() => channelDimensions(schema, channel), [schema, channel]);
  const levels = useMemo(() => listLevels(schema, channel), [schema, channel]);

  const sel = (items || []).find(i => i.id === initiativeId) || null;
  const tag = sel?.trackingTag ? String(sel.trackingTag).trim() : "";

  // The channel dimension is a fact about the channel you picked, not a question
  // to ask twice — so it is derived from the picker rather than stored, which
  // also means it cannot go stale when the picker changes. Choosing a channel
  // clears any hand-set value so the derived one takes over again.
  const chDefault = useMemo(() => {
    const d = dims.find(x => x.key === "channel");
    const label = channels.find(c => c.id === channel)?.label;
    if (!d || !label) return null;
    return (d.vocab || []).find(v => normKey(v) === normKey(label)) || null;
  }, [dims, channels, channel]);

  const pickChannel = (id) => {
    setChannel(id);
    setValues(prev => { const next = { ...prev }; delete next.channel; return next; });
  };

  // The initiative slot is stamped from the selected initiative, never typed —
  // the same rule the Creative Studio follows. A hand-typed tag that resolves to
  // nothing is the single most common broken link in the Attribution tab, and
  // the only reliable fix is to never offer the keyboard.
  const valueOf = (key) => {
    if (initKey && key === initKey) return tag || ph;
    if (values[key] != null) return values[key];
    if (key === "channel" && chDefault) return chDefault;
    return ph;
  };

  // Not memoised, deliberately: this is a loop over ~20 dimensions and a handful
  // of string joins, and memoising it would only move the cost into dependency
  // tracking on a value that changes on almost every keystroke anyway.
  const effective = {};
  dims.forEach(d => { effective[d.key] = valueOf(d.key); });

  const nameSet = buildNameSet(effective, schema, channel);

  const assignedIndex = useMemo(() => assignedNameIndex(items), [items]);
  const myNames = useMemo(() => adNamesOf(sel), [sel]);

  const set = (key, v) => setValues(prev => ({ ...prev, [key]: v }));

  const copy = (text, note) => {
    navigator.clipboard?.writeText(text)
      .then(() => showToast(note, "success"))
      .catch(() => showToast("Could not copy to clipboard.", "error"));
  };

  const assign = (level, name) => {
    if (!sel) return;
    const owner = assignedIndex.get(normKey(name));
    if (owner && owner.initiative.id !== sel.id) {
      showToast(`That name is already claimed by ${owner.initiative.initId || owner.initiative.title}. One name, one initiative.`, "error");
      return;
    }
    if (owner) { showToast("Already assigned to this initiative.", "success"); return; }
    onAssign(sel.id, [...myNames, adNameEntry({ name, level: level.key, channel, addedAt: new Date().toISOString().slice(0, 10) })]);
    showToast(`${level.label} name assigned. Imported rows carrying it now roll up to ${sel.initId || sel.title}.`, "success");
  };

  const unassign = (name) => {
    if (!sel) return;
    onAssign(sel.id, myNames.filter(e => normKey(e.name) !== normKey(name)));
    showToast("Assignment removed.", "success");
  };

  // Grouped for the same reason the taxonomy is: twenty fields in registry order
  // is a form, six labelled groups of three is a decision you can work through.
  const grouped = useMemo(() => {
    const byFamily = new Map();
    dims.forEach(d => {
      if (!byFamily.has(d.family)) byFamily.set(d.family, []);
      byFamily.get(d.family).push(d);
    });
    return DIMENSION_FAMILIES
      .filter(f => byFamily.has(f.key))
      .map(f => ({ ...f, dimensions: byFamily.get(f.key) }));
  }, [dims]);

  const allNames = nameSet.map(n => n.name).join("\n");
  const anyErrors = nameSet.some(n => n.errors.length > 0);

  return (
    <>
      {/* Channel and initiative — the two choices everything below depends on */}
      <div style={{ ...gCd(t), marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 150 }}>
            <div style={gSL(t)}>Channel</div>
            <select value={channel} onChange={e => pickChannel(e.target.value)} style={{ ...gSl(t), width: 170 }}>
              {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <div style={gSL(t)}>Assign to initiative</div>
            <select value={initiativeId || ""} onChange={e => onInitiative(e.target.value)} style={{ ...gSl(t), width: "100%" }}>
              <option value="">Not assigned — build a name only</option>
              {(items || []).map(i => (
                <option key={i.id} value={i.id}>{(i.initId ? i.initId + " · " : "") + (i.title || "Untitled")}</option>
              ))}
            </select>
          </div>
        </div>

        {initKey && (
          <div style={{
            marginTop: 12, padding: "9px 12px", borderRadius: 10,
            background: sel ? (tag ? t.tealBg : t.warnBg) : t.surfaceAlt,
            border: "1px solid " + (sel ? (tag ? t.teal : t.warnBorder) : t.border),
            fontSize: 12.5, color: t.text, fontFamily: t.sans, lineHeight: 1.55,
          }}>
            {!sel ? (
              <>No initiative selected, so the {initKey} slot is written <code style={{ fontFamily: t.mono }}>{ph}</code>. The
                names below will still be valid — they just measure as business-as-usual spend rather than as an experiment.</>
            ) : tag ? (
              <>The {initKey} slot is stamped <code style={{ fontFamily: t.mono, fontWeight: 700 }}>{tag}</code>. Every name
                built here carries it, so performance rows join back to this initiative without anyone assigning anything.</>
            ) : (
              <>This initiative has no tracking tag, so the {initKey} slot is written <code style={{ fontFamily: t.mono }}>{ph}</code>.
                Set one in the initiative editor, or assign the finished names below — either path attributes the spend.</>
            )}
          </div>
        )}
      </div>

      {/* The record. One set of values, projected into every level. */}
      {grouped.map((f, fi) => (
        <div key={f.key} {...(() => { const p = interactive(t, t.goldFill, { flat: true, index: fi });
          return { className: p.className, style: { ...p.style, ...gCd(t), marginBottom: 12 } }; })()}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 11 }}>
            <div style={{ ...gSL(t), marginBottom: 0 }}>{f.label}</div>
            <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, flex: "1 1 240px" }}>{f.hint}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
            {f.dimensions.map(d => (
              <Field key={d.key} t={t} dim={d}
                value={valueOf(d.key)}
                onChange={v => set(d.key, v)}
                placeholder={ph}
                locked={d.key === initKey}
                lockNote={sel ? "Stamped from the selected initiative — never typed, so it can never resolve to nothing."
                              : "Stamped from the selected initiative. Nothing selected, so this stays at the placeholder."} />
            ))}
          </div>
        </div>
      ))}

      {/* The output */}
      <div style={{ ...gCd(t), marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 11 }}>
          <div style={{ ...gSL(t), marginBottom: 0 }}>Names</div>
          <button onClick={() => copy(allNames, "All " + nameSet.length + " names copied.")} style={gGh(t)}>Copy all</button>
        </div>

        {nameSet.map((n, ni) => {
          const owner = assignedIndex.get(normKey(n.name));
          const mine = owner && sel && owner.initiative.id === sel.id;
          return (
            <div key={n.level} {...(() => { const p = interactive(t, n.errors.length ? t.warn : t.goldFill, { flat: true, index: ni, hoverBg: t.surfaceAlt });
              return { className: p.className, style: { ...p.style, padding: "10px 8px 10px 12px", borderRadius: 9, borderBottom: ni < nameSet.length - 1 ? "1px solid " + t.borderSoft : "none" } }; })()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.text, fontFamily: t.sans }}>{n.label}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => copy(n.name, n.label + " name copied.")} style={{ ...gGh(t), fontSize: 11, padding: "4px 10px" }}>Copy</button>
                  {sel && (mine
                    ? <button onClick={() => unassign(n.name)} style={{ ...gGh(t), fontSize: 11, padding: "4px 10px", color: t.warn }}>Unassign</button>
                    : <button onClick={() => assign(levels[ni] || { key: n.level, label: n.label }, n.name)}
                        disabled={n.errors.length > 0}
                        title={n.errors.length ? "Fix the errors below before assigning — an invalid name cannot be parsed back." : "Claim this name for the selected initiative"}
                        style={{ ...gG(t), fontSize: 11, padding: "4px 10px", opacity: n.errors.length ? 0.45 : 1, cursor: n.errors.length ? "not-allowed" : "pointer" }}>
                        Assign
                      </button>)}
                </div>
              </div>
              <div style={{ fontFamily: t.mono, fontSize: 12, color: t.text, background: t.surfaceAlt, border: "1px solid " + t.border,
                borderRadius: 8, padding: "8px 10px", wordBreak: "break-all", lineHeight: 1.6 }}>
                {n.name}
              </div>
              {owner && !mine && (
                <div style={{ fontSize: 11, color: t.warn, fontFamily: t.sans, marginTop: 5, lineHeight: 1.45 }}>
                  Already claimed by {owner.initiative.initId || owner.initiative.title}.
                </div>
              )}
              {n.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: t.warn, fontFamily: t.sans, marginTop: 5, lineHeight: 1.45 }}>{e}</div>
              ))}
            </div>
          );
        })}

        <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.55, marginTop: 10 }}>
          {anyErrors
            ? "Names with errors are shown so you can see what is wrong, not so you can use them. They will not parse on the way back."
            : "Paste these into the platform as they are. Every one of them round-trips through the parser that reads your performance export."}
        </div>
      </div>

      {/* What this initiative already claims */}
      {sel && (
        <div style={gCd(t)}>
          <div style={{ ...gSL(t), marginBottom: 9 }}>Claimed by {sel.initId || sel.title}</div>
          {myNames.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textSub, fontFamily: t.serif, lineHeight: 1.6 }}>
              Nothing claimed yet. Assigning a name here is what makes an imported row roll up to this initiative even
              when the name was created in Ads Manager and never followed this convention — the string is the join.
            </div>
          ) : (
            myNames.map(e => (
              <div key={e.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline",
                padding: "7px 0", borderBottom: "1px solid " + t.borderSoft, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <div style={{ fontFamily: t.mono, fontSize: 11.5, color: t.text, wordBreak: "break-all" }}>{e.name}</div>
                  <div style={{ fontFamily: t.mono, fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                    {[e.channel, e.level, e.addedAt].filter(Boolean).join(" · ") || "imported"}
                  </div>
                </div>
                <button onClick={() => unassign(e.name)} style={{ ...gGh(t), fontSize: 11, padding: "4px 10px" }}>Remove</button>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
