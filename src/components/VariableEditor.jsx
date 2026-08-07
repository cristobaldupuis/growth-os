import { useState, useMemo } from "react";
import { gG, gGh, gI, gSl, gSL } from "./styles.js";
import { Modal } from "./Modal.jsx";
import {
  DIMENSION_FAMILIES, listChannels, listLevels, templateFor,
  dimensionKeyFrom, validateCustomDimension, validateVocabValue, normKey,
} from "../services/naming.js";

// -- Variable editor -----------------------------------------------------------
//
// The write end of the taxonomy. Everything else in this app reads the naming
// schema; this is the one surface that changes it.
//
// The registry ships opinionated on purpose — a controlled list is only worth
// something if somebody decided what belongs on it — but the shipped list is one
// company's answer, and the second company always has a dimension it does not
// contain. Without this page that dimension gets encoded inside the free-text
// `angle` slot, where it cannot be validated, cannot be pivoted, and cannot be
// found again. A variable added here is a first-class dimension: the builder
// renders a control for it, the parser reads it out of every imported row, the
// breakdown pivots on it, and the creative prompts ask the model to fill it.
//
// Two decisions worth stating, because both are refusals:
//
//   Placement is opt-in, per (channel, level). A variable can exist and sit in
//   no template at all — that is a defined-but-unused dimension, which the
//   taxonomy page already renders honestly. Defining a variable and putting it
//   into a name are different decisions and the form asks them separately.
//
//   A placed variable is appended to the end of its template, never inserted.
//   Inserting mid-string keeps the slot count correct and shifts every value
//   after the insertion point one dimension to the left — names that parse
//   cleanly into wrong answers. Appending makes an older name fail the
//   slot-count check instead, which is loud, counted and reported. The panel at
//   the bottom of this form says so before the operator saves, with the count.

const TYPES = [
  { key: "controlled", label: "Controlled list", hint: "A fixed set of allowed answers. Validated on the way in and on the way back, so a pivot on it can never split one value across three spellings." },
  { key: "free",       label: "Free text",       hint: "Anything the operator types. Reserve it for genuinely open-ended fields — every free-text dimension accumulates typos and splits its own totals." },
];

const FAMILY_CHOICES = DIMENSION_FAMILIES.filter(f => f.key !== "bridge");

/** Chip with a remove affordance. Used for the draft vocabulary. */
function ValueChip({ t, value, onRemove }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: t.mono, fontSize: 11,
      color: t.text, background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 5, padding: "3px 5px 3px 8px" }}>
      {value}
      <button onClick={onRemove} title={`Remove ${value}`}
        style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 2px" }}>
        <span>&#10005;</span>
      </button>
    </span>
  );
}

/**
 * @param dimension  the custom dimension being edited, or null to create one
 * @param schema     the resolved schema, custom variables already merged in
 * @param onSave     receives a normalised draft; the caller persists the overlay
 */
export function VariableEditor({ t, dk, schema, dimension, onSave, onClose }) {
  const editing = !!dimension;
  const originalKey = editing ? dimension.key : null;

  const [label, setLabel]   = useState(dimension?.label || "");
  const [key, setKey]       = useState(dimension?.key || "");
  const [keyTouched, setKeyTouched] = useState(editing);
  const [family, setFamily] = useState(dimension?.family || "other");
  const [hint, setHint]     = useState(dimension?.hint || "");
  const [type, setType]     = useState(dimension && !dimension.vocab ? "free" : "controlled");
  const [vocab, setVocab]   = useState(dimension?.vocab || []);
  const [draftValue, setDraftValue] = useState("");
  const [placements, setPlacements] = useState(dimension?.placements || []);

  const controlled = type === "controlled";

  const draft = { key, label, hint, family, controlled, vocab, placements };
  const { ok, errors } = validateCustomDimension(draft, schema, { originalKey });

  const valueError = draftValue.trim() ? validateVocabValue(draftValue, schema, vocab) : null;

  // The key is a derived field until the operator disagrees with the derivation,
  // at which point it stops chasing the label. Retyping the label should not
  // silently rewrite a key somebody deliberately chose.
  const setLabelAndKey = (v) => {
    setLabel(v);
    if (!keyTouched) setKey(dimensionKeyFrom(v));
  };

  const addValue = () => {
    const v = draftValue.trim();
    if (!v || valueError) return;
    setVocab(prev => [...prev, v]);
    setDraftValue("");
  };

  const isPlaced = (channelId, levelKey) => placements.some(p => p.channel === channelId && p.level === levelKey);
  const togglePlacement = (channelId, levelKey) => setPlacements(prev =>
    prev.some(p => p.channel === channelId && p.level === levelKey)
      ? prev.filter(p => !(p.channel === channelId && p.level === levelKey))
      : [...prev, { channel: channelId, level: levelKey }]);

  // Only placements that are new to this variable lengthen a name. Re-saving a
  // variable that already sits in the Meta ad template changes nothing there,
  // and warning about it would train the operator to ignore the warning.
  const lengthened = useMemo(() => {
    const was = (dimension?.placements || []);
    return placements
      .filter(p => !was.some(w => w.channel === p.channel && w.level === p.level))
      .map(p => {
        const ch = listChannels(schema).find(c => c.id === p.channel);
        const lv = listLevels(schema, p.channel).find(l => l.key === p.level);
        if (!ch || !lv) return null;
        const from = templateFor(schema, p.channel, p.level).filter(d => d.key !== originalKey).length;
        return { label: `${ch.label} ${lv.label.toLowerCase()}`, from, to: from + 1 };
      })
      .filter(Boolean);
  }, [placements, dimension, schema, originalKey]);

  const removedPlacements = useMemo(() => {
    const was = (dimension?.placements || []);
    return was.filter(w => !placements.some(p => p.channel === w.channel && p.level === w.level)).length;
  }, [placements, dimension]);

  const save = () => {
    if (!ok) return;
    onSave({
      key: key.trim().toLowerCase(),
      label: label.trim(),
      hint: hint.trim(),
      family,
      vocab: controlled ? vocab : null,
      placements,
    }, originalKey);
  };

  const fieldNote = (msg, fallback) => (
    <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4, fontFamily: t.sans, color: msg ? t.warn : t.textMuted }}>
      {msg || fallback}
    </div>
  );

  return (
    <Modal t={t} dk={dk} onClose={onClose} wide title={editing ? `Edit ${dimension.label}` : "New variable"}>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={gSL(t)}>Name</div>
          <input value={label} onChange={e => setLabelAndKey(e.target.value)} placeholder="Sales region" style={gI(t)} />
          {fieldNote(errors.label, "How the field is labelled in the builder and the taxonomy.")}
        </div>
        <div>
          <div style={gSL(t)}>Key</div>
          <input value={key} onChange={e => { setKeyTouched(true); setKey(e.target.value); }}
            placeholder="sales_region" style={{ ...gI(t), fontFamily: t.mono }} />
          {fieldNote(errors.key, "The identifier templates and imports join on. Never appears inside a name.")}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={gSL(t)}>What question does it settle</div>
        <input value={hint} onChange={e => setHint(e.target.value)}
          placeholder="Which sales region owns the spend." style={gI(t)} />
        {fieldNote(null, "Shown under the field in the builder. One sentence is enough — this is what stops two people filling it in differently.")}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={gSL(t)}>Group</div>
        <select value={family} onChange={e => setFamily(e.target.value)} style={gSl(t)}>
          {FAMILY_CHOICES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        {fieldNote(null, "Presentation only — it decides which heading this sits under. Slot order comes from the templates alone.")}
      </div>

      {/* Type */}
      <div style={{ marginBottom: 14 }}>
        <div style={gSL(t)}>Answers</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {TYPES.map(x => (
            <button key={x.key} onClick={() => setType(x.key)}
              style={{
                fontSize: 12, padding: "7px 12px", borderRadius: 9, cursor: "pointer", fontFamily: t.sans,
                fontWeight: type === x.key ? 600 : 500,
                background: type === x.key ? t.surfaceAlt : "transparent",
                border: "1px solid " + (type === x.key ? t.border : "transparent"),
                color: type === x.key ? t.text : t.textMuted,
              }}>{x.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5 }}>
          {TYPES.find(x => x.key === type)?.hint}
        </div>
      </div>

      {controlled && (
        <div style={{ marginBottom: 14 }}>
          <div style={gSL(t)}>Allowed values</div>
          {vocab.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {vocab.map(v => (
                <ValueChip key={v} t={t} value={v}
                  onRemove={() => setVocab(prev => prev.filter(x => normKey(x) !== normKey(v)))} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <input value={draftValue} onChange={e => setDraftValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addValue(); } }}
              placeholder="NorthEast" style={{ ...gI(t), fontFamily: t.mono }} />
            <button onClick={addValue} disabled={!draftValue.trim() || !!valueError}
              style={{ ...gGh(t), flexShrink: 0, opacity: (!draftValue.trim() || valueError) ? 0.45 : 1,
                cursor: (!draftValue.trim() || valueError) ? "not-allowed" : "pointer" }}>Add</button>
          </div>
          {fieldNote(valueError || errors.vocab,
            "One word per value, CamelCase for multi-word. No spaces, commas or the delimiter — all three break the name downstream.")}
        </div>
      )}

      {/* Placement */}
      <div style={{ marginBottom: 14 }}>
        <div style={gSL(t)}>Where it appears</div>
        <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, marginBottom: 8 }}>
          Tick the levels whose names should carry this variable. Leave everything unticked to define it now and place
          it later — it will show in the taxonomy as defined but unused.
        </div>
        {listChannels(schema).map(ch => (
          <div key={ch.id} style={{ padding: "7px 0", borderBottom: "1px solid " + t.borderSoft }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.text, fontFamily: t.sans, marginBottom: 5 }}>{ch.label}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {listLevels(schema, ch.id).map(lv => {
                const on = isPlaced(ch.id, lv.key);
                const slots = templateFor(schema, ch.id, lv.key).filter(d => d.key !== originalKey).length;
                return (
                  <button key={lv.key} onClick={() => togglePlacement(ch.id, lv.key)}
                    title={`${lv.label} names currently carry ${slots} slots`}
                    style={{
                      fontSize: 11.5, padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontFamily: t.sans,
                      background: on ? t.goldFill : "transparent",
                      border: "1px solid " + (on ? t.goldFill : t.border),
                      color: on ? t.goldText : t.textSub,
                      fontWeight: on ? 600 : 500,
                    }}>
                    {on ? "✓ " : ""}{lv.label}
                    <span style={{ fontFamily: t.mono, fontSize: 9.5, opacity: 0.75, marginLeft: 5 }}>
                      {slots}{on ? "+1" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* The consequence, stated before the save rather than discovered after it */}
      {(lengthened.length > 0 || removedPlacements > 0) && (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: t.warnBg, border: "1px solid " + t.warnBorder,
          fontSize: 12, color: t.text, fontFamily: t.sans, lineHeight: 1.55, marginBottom: 14 }}>
          {lengthened.length > 0 && (
            <>
              <strong>This lengthens {lengthened.length} name template{lengthened.length !== 1 ? "s" : ""}.</strong>{" "}
              {lengthened.map(l => `${l.label} ${l.from} → ${l.to} slots`).join("; ")}. Names built before this change
              carry one slot fewer, so they will no longer parse — they stay in every total but drop out of the
              breakdowns until they are rebuilt. That is deliberate: the variable is appended to the end of the
              template rather than inserted into it, so an old name fails loudly instead of parsing into shifted values.
            </>
          )}
          {lengthened.length > 0 && removedPlacements > 0 && <div style={{ height: 7 }} />}
          {removedPlacements > 0 && (
            <>
              <strong>Removing {removedPlacements} placement{removedPlacements !== 1 ? "s" : ""} shortens those templates.</strong>{" "}
              Names already built with the longer form will not parse either. Removing a placement is as much a change
              to the convention as adding one.
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={onClose} style={gGh(t)}>Cancel</button>
        <button onClick={save} disabled={!ok}
          style={{ ...gG(t), opacity: ok ? 1 : 0.45, cursor: ok ? "pointer" : "not-allowed" }}>
          {editing ? "Save variable" : "Add variable"}
        </button>
      </div>
    </Modal>
  );
}
