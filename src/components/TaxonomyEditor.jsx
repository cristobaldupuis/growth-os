import { useState } from "react";
import { gG, gGh, gCd, gSl, gSL, gI } from "./styles.js";
import { Modal } from "./Modal.jsx";
import { VariableEditor } from "./VariableEditor.jsx";
import { interactive } from "./motion.js";
import {
  resolveSchema, emptyCustomVariables, upsertCustomDimension, removeCustomDimension,
  addVocabValue, removeVocabValue, validateVocabValue,
  listChannels, listLevels, templateFor, taxonomy, normKey, NA,
} from "../services/naming.js";

const TAXONOMY_MODES = [
  { key: "dimensions", label: "Dimensions" },
  { key: "templates",  label: "Templates" },
];

// -- Taxonomy editor -----------------------------------------------------------
//
// The campaign nomenclature is the thing the README argues puts this product in
// a different category from the other experiment trackers — and editing it lived
// two levels deep inside a view named after something else, at Performance →
// Taxonomy, four clicks from the dashboard. The README meanwhile said the
// convention "lives in settings", which it did as data and did not as a place
// you could go.
//
// So it moved, and this is the extraction that let it: the tab body depended on
// nothing in PerformanceView except the schema, the operator's custom layer, and
// a way to write settings back. Performance keeps a pointer to it, because that
// is where you are standing when you discover the convention is wrong.
export function TaxonomyEditor({ t, dk, settings, onSaveSettings, showToast }) {
  const schema = resolveSchema(settings);
  const [taxMode, setTaxMode] = useState("dimensions");
  // `null` = closed, `{ dimension:null }` = creating, `{ dimension }` = editing.
  const [editor, setEditor] = useState(null);
  const [valueFor, setValueFor] = useState(null);
  const [valueDraft, setValueDraft] = useState("");
  const [pendingRemove, setPendingRemove] = useState(null);
  const [convChannel, setConvChannel] = useState(listChannels(resolveSchema(settings))[0]?.id || "meta");

  // The operator's own layer on top of the schema. Writing it back through
  // settings is the whole persistence story — every reader resolves the schema
  // through `resolveSchema`, so nothing else has to be told the vocabulary grew.
  const custom = settings?.namingCustom || emptyCustomVariables();
  const saveCustom = (next, note) => {
    if (!onSaveSettings) return;
    onSaveSettings({ ...settings, namingCustom: next });
    if (note) showToast(note, "success");
  };

  return (
    <div>

          <>
            <div style={{ ...gCd(t), marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ minWidth: 0, flex: "1 1 340px" }}>
                  <div style={gSL(t)}>Active schema</div>
                  <div style={{ fontFamily: t.serif, fontSize: 16, fontWeight: 600, color: t.text }}>{schema.label}</div>
                  <div style={{ fontFamily: t.mono, fontSize: 11, color: t.textMuted, marginTop: 3 }}>
                    {schema.id} · delimiter <strong>{schema.delimiter}</strong> · placeholder <strong>{schema.placeholder || NA}</strong>
                    {schema.initiativeDimension ? ` · initiative slot "${schema.initiativeDimension}"` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    {TAXONOMY_MODES.map(m => (
                      <button key={m.key} onClick={() => setTaxMode(m.key)}
                        style={{
                          fontSize: 12, padding: "7px 12px", borderRadius: 9, cursor: "pointer", fontFamily: t.sans,
                          fontWeight: taxMode === m.key ? 600 : 500,
                          background: taxMode === m.key ? t.surfaceAlt : "transparent",
                          border: "1px solid " + (taxMode === m.key ? t.border : "transparent"),
                          color: taxMode === m.key ? t.text : t.textMuted,
                        }}>{m.label}</button>
                    ))}
                  </div>
                  {taxMode === "templates" && (
                    <select value={convChannel} onChange={e => setConvChannel(e.target.value)} style={{ ...gSl(t), width: 170 }}>
                      {listChannels(schema).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  )}
                  {onSaveSettings && (
                    <button onClick={() => setEditor({ dimension: null })} style={gG(t)}>+ Add variable</button>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: t.textSub, fontFamily: t.serif, lineHeight: 1.65, margin: "12px 0 0", maxWidth: 720 }}>
                {taxMode === "dimensions" ? (
                  <>The vocabulary comes first because it is the part that has to be agreed. A dimension is a question the
                    name answers, and a controlled one is a question with a fixed set of allowed answers — which is what
                    stops <code style={{ fontFamily: t.mono }}>Reels</code> and <code style={{ fontFamily: t.mono }}>reels</code> and{" "}
                    <code style={{ fontFamily: t.mono }}>Reel</code> from becoming three rows in a pivot that should have one.
                    Where each dimension appears is shown beside it, because the same dimension sits at different depths in
                    different channels and that is a fact about the estate, not an inconsistency. The shipped list is a
                    starting point, not the whole vocabulary — add the variables this business actually plans against, and
                    add values to a controlled list when a campaign brings something the list has never had to describe.</>
                ) : (
                  <>Two rules make positional parsing safe, and both are enforced in code rather than by discipline: a slot is
                    never omitted or reordered — an absent value is written <code style={{ fontFamily: t.mono }}>{schema.placeholder || NA}</code> —
                    and the delimiter never appears inside a value. Names are assembled by the builder, never typed, which is
                    why an export from three months ago still parses today. A custom variable is appended to the end of the
                    templates it is placed in, never inserted into the middle of one — see the Dimensions tab to add one.</>
                )}
              </p>
            </div>

            {/* Dimensions, grouped by the kind of question they settle */}
            {taxMode === "dimensions" && taxonomy(schema).map((fam, fi) => (
              <div key={fam.key} style={{ ...gCd(t), marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}>
                  <div style={{ ...gSL(t), marginBottom: 0 }}>{fam.label}</div>
                  <div style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textMuted }}>
                    {fam.dimensions.length} dimension{fam.dimensions.length !== 1 ? "s" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, flex: "1 1 260px" }}>{fam.hint}</div>
                </div>
                {fam.dimensions.map((d, di) => (
                  <div key={d.key} {...(() => { const p = interactive(t, d.isBridge ? t.gold : t.goldFill, { flat: true, index: fi + di, hoverBg: t.surfaceAlt });
                    return { className: p.className, style: { ...p.style, padding: "9px 8px 9px 12px", borderRadius: 8, borderBottom: di < fam.dimensions.length - 1 ? "1px solid " + t.borderSoft : "none" } }; })()}>
                    <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: t.text, fontFamily: t.sans }}>{d.label}</span>
                      <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textMuted }}>{d.key}</span>
                      {d.isBridge && (
                        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                          color: t.gold, border: "1px solid " + t.goldBorder, borderRadius: 4, padding: "1px 6px" }}>
                          Marketers Lab bridge
                        </span>
                      )}
                      {d.custom && (
                        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                          color: t.textSub, border: "1px solid " + t.border, borderRadius: 4, padding: "1px 6px" }}>
                          Custom
                        </span>
                      )}
                      <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted }}>
                        {d.vocab ? `${d.vocab.length} allowed values` : "free text"}
                      </span>

                      {/* Editing lives on the row it edits. A shipped dimension can
                          take new values but cannot be removed — an operator
                          deleting `geo` would orphan every name already carrying
                          it, and that is not a decision this page should offer. */}
                      {onSaveSettings && (
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {d.vocab && (
                            <button onClick={() => { setValueFor(valueFor === d.key ? null : d.key); setValueDraft(""); }}
                              style={{ ...gGh(t), fontSize: 11, padding: "3px 9px" }}>
                              {valueFor === d.key ? "Close" : "+ Value"}
                            </button>
                          )}
                          {d.custom && (
                            <>
                              <button onClick={() => setEditor({ dimension: d })} style={{ ...gGh(t), fontSize: 11, padding: "3px 9px" }}>Edit</button>
                              {/* The last native confirm() in the product. It is
                                  the app's second-most destructive action — every
                                  ad name already built from this dimension stops
                                  parsing — and it was announcing that in a dialog
                                  the browser draws, with the app's own modal
                                  pattern sitting unused two files away. */}
                              <button onClick={() => setPendingRemove(d)}
                                style={{ ...gGh(t, "sm"), color: t.warn }}>Remove</button>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, marginTop: 3 }}>{d.hint}</div>

                    {/* Adding a value is the safe half of editing a taxonomy: a
                        longer list accepts more names and invalidates none of the
                        names already built against the shorter one. */}
                    {valueFor === d.key && (() => {
                      const err = valueDraft.trim() ? validateVocabValue(valueDraft, schema, d.vocab || []) : null;
                      const commit = () => {
                        if (!valueDraft.trim() || err) return;
                        saveCustom(addVocabValue(custom, d.key, valueDraft.trim()), `"${valueDraft.trim()}" added to ${d.label}.`);
                        setValueDraft("");
                        setValueFor(null);
                      };
                      return (
                        <div style={{ marginTop: 7, maxWidth: 420 }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input value={valueDraft} onChange={e => setValueDraft(e.target.value)} autoFocus
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
                              placeholder={`New ${d.label.toLowerCase()} value`}
                              style={{ ...gI(t), fontFamily: t.mono, fontSize: 12, padding: "6px 9px" }} />
                            <button onClick={commit} disabled={!valueDraft.trim() || !!err}
                              style={{ ...gG(t), flexShrink: 0, fontSize: 11.5, padding: "5px 12px",
                                opacity: (!valueDraft.trim() || err) ? 0.45 : 1, cursor: (!valueDraft.trim() || err) ? "not-allowed" : "pointer" }}>Add</button>
                          </div>
                          <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4, fontFamily: t.sans, color: err ? t.warn : t.textMuted }}>
                            {err || "Added to this workspace only. The shipped values stay as they are, and every name already built keeps parsing."}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Where it lives. A dimension nothing uses is worth seeing as
                        much as one everything uses — it is usually a leftover. */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {d.usage.length === 0 ? (
                        <span style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans }}>In no template — defined but unused.</span>
                      ) : d.usage.map(u => (
                        <span key={u.channel + u.level} title={`Slot ${u.slot} of ${u.of}`}
                          style={{ fontFamily: t.mono, fontSize: 9.5, color: t.textSub, background: t.surfaceAlt,
                            border: "1px solid " + t.border, borderRadius: 4, padding: "1px 6px" }}>
                          {u.channelLabel} {u.levelLabel.toLowerCase()} · {u.slot}/{u.of}
                        </span>
                      ))}
                    </div>

                    {d.vocab && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                        {d.vocab.map(v => {
                          const added = (d.vocabAdded || []).some(x => normKey(x) === normKey(v));
                          return (
                            <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: t.mono, fontSize: 10,
                              color: added ? t.text : t.textSub, background: t.surfaceAlt,
                              border: "1px solid " + (added ? t.goldBorder : t.border), borderRadius: 4,
                              padding: added ? "1px 3px 1px 6px" : "1px 6px" }}>
                              {v}
                              {added && onSaveSettings && (
                                <button onClick={() => saveCustom(removeVocabValue(custom, d.key, v), `"${v}" removed from ${d.label}.`)}
                                  title={`Remove ${v} — names already built with it will stop validating`}
                                  style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 2px" }}>
                                  <span>&#10005;</span>
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Levels — one record projects into all of them at once */}
            {taxMode === "templates" && listLevels(schema, convChannel).map(level => {
              const tpl = templateFor(schema, convChannel, level.key);
              return (
                <div key={level.key} style={{ ...gCd(t), marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
                    <div style={{ ...gSL(t), marginBottom: 0 }}>{level.label} name</div>
                    <div style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textMuted }}>{tpl.length} slots</div>
                  </div>
                  <div style={{ fontFamily: t.mono, fontSize: 11.5, color: t.text, background: t.surfaceAlt, border: "1px solid " + t.border,
                    borderRadius: 9, padding: "9px 11px", wordBreak: "break-all", lineHeight: 1.7 }}>
                    {tpl.map(d => d.label).join(schema.delimiter)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 10 }}>
                    {tpl.map((d, i) => (
                      <div key={d.key} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < tpl.length - 1 ? "1px solid " + t.borderSoft : "none" }}>
                        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textMuted, width: 20, flexShrink: 0, paddingTop: 2 }}>{i + 1}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text, fontFamily: t.sans }}>{d.label}</span>
                            <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textMuted }}>{d.key}</span>
                            {d.key === schema.initiativeDimension && (
                              <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                                color: t.gold, border: "1px solid " + t.goldBorder, borderRadius: 4, padding: "1px 6px" }}>
                                Marketers Lab bridge
                              </span>
                            )}
                            {!d.vocab && (
                              <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textMuted }}>
                                free text
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, lineHeight: 1.5, marginTop: 2 }}>{d.hint}</div>
                          {d.vocab && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                              {d.vocab.map(v => (
                                <span key={v} style={{ fontFamily: t.mono, fontSize: 10, color: t.textSub, background: t.surfaceAlt,
                                  border: "1px solid " + t.border, borderRadius: 4, padding: "1px 6px" }}>{v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
      {pendingRemove && (
        <Modal t={t} dk={dk} title={"Remove " + pendingRemove.label + "?"} onClose={()=>setPendingRemove(null)}>
          <div style={{fontSize:13,color:t.textSub,fontFamily:t.serif,lineHeight:1.6,marginBottom:18}}>
            {pendingRemove.usage.length > 0
              ? <>This dimension sits in <strong style={{color:t.text}}>{pendingRemove.usage.length} template{pendingRemove.usage.length!==1?"s":""}</strong>. Every ad name already built from {pendingRemove.usage.length!==1?"them":"it"} will stop parsing, and the spend on those rows will fall out of the breakdown into the unparsed bucket.</>
              : <>This dimension is in no template, so nothing already built is affected.</>}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <button style={gGh(t)} onClick={()=>setPendingRemove(null)}>Cancel</button>
            <button style={{...gG(t),background:t.red,borderColor:t.red,color:"#fff"}}
              onClick={()=>{ saveCustom(removeCustomDimension(custom, pendingRemove.key), `${pendingRemove.label} removed from the taxonomy.`); setPendingRemove(null); }}>
              Remove dimension
            </button>
          </div>
        </Modal>
      )}

      {editor && (
        <VariableEditor t={t} dk={dk} schema={schema} dimension={editor.dimension}
          onClose={() => setEditor(null)}
          onSave={(draft, originalKey) => {
            saveCustom(
              upsertCustomDimension(custom, draft, originalKey),
              originalKey
                ? `${draft.label} updated. The builder, the parser and every breakdown use it from here.`
                : `${draft.label} added. It is now a dimension everywhere the schema is read.`
            );
            setEditor(null);
          }} />
      )}
    </div>
  );
}
