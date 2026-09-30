import { useState, useMemo, useEffect, useRef } from "react";
import { gG, gGh, gSL, gCd, gI, gSl } from "../components/styles.js";
import { renderProse } from "../components/text.jsx";
import { SBdg, CBdg } from "../components/badges.jsx";
import { fmtDate } from "../constants.js";
import { resolveSchema, buildNameSet, templateFor, listChannels, listLevels, suggestTrackingTag, NA } from "../services/naming.js";
import { callCreativeBrief } from "../services/ai/callCreativeBrief.js";
import { produceVariantSet, callCritiqueVariants } from "../services/ai/callCreativeVariants.js";
import { callGenerateImage, buildImagePrompt, angleAsVariant, IMAGE_ASPECTS } from "../services/ai/callGenerateImage.js";
import { productsOf, productForRound, priceLabel, MAX_PRODUCT_IMAGES } from "../services/products.js";
import { splitVoc, selectVoc } from "../services/voc.js";
import {
  currentSet, isShipped, withNewSet, withNaming, withVariantChange, withCritique, withShipped,
  shippedAdIndex, topAdsByReturn,
} from "../services/variantSets.js";
import { buildCreatorBriefHtml, buildVariantCSV } from "../services/creatorBrief.js";
import { downscaleImage } from "../services/imageResize.js";
import { StaticAdComposer } from "../components/StaticAdComposer.jsx";
import { BeatsTable, CopyFields, AltHooks, VocQuotes, CritiqueNote, SetHistory } from "../components/creativeParts.jsx";
import { modelsFor } from "../services/ai/registry.js";
import {
  callGenerateVideo, pollVideoJob, buildVideoScript, VIDEO_TIERS, VIDEO_TIER_LIST,
  estimateSpokenSeconds, estimateVideoCostUsd, VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_TIMEOUT_MS,
} from "../services/ai/callGenerateVideo.js";
// The model is not imported: callGenerateVoice defaults it, and the studio has no
// reason to name one. See the note there on why voice is not a routing group.
import { callGenerateVoice, listVoices, estimateVoiceCostUsd } from "../services/ai/callGenerateVoice.js";
import { modelFor } from "../services/ai/models.js";
import {
  callGenerateScene, pollSceneJob, buildScenePrompt, estimateSceneCostUsd,
  SCENE_ASPECTS, SCENE_DURATIONS, DEFAULT_SCENE_DURATION,
  SCENE_POLL_INTERVAL_MS, SCENE_POLL_TIMEOUT_MS,
} from "../services/ai/callGenerateScene.js";
import { mkAssetRecord, currentRoundAssets, currentAngleFrames, angleSlot, imageCostUsd, costForInitiative } from "../services/assets.js";
import { putAsset, getAssetUrl, readAssetBytes, probeDurableStorage, durableUnavailableReason } from "../services/assetStore.js";
import { buildCreativeEvidence } from "../services/creativeEvidence.js";

// Kept in step with api/image.js. Exceeding it is refused upstream rather than
// silently truncated, so the picker never offers a fourth.
const MAX_REFERENCE_IMAGES = 3;

const usd = n => "$" + n.toFixed(2);

// The image models the studio can pick between, straight from the catalogue the
// image endpoint's allowlist agrees with (see image.test.js). The label drops the
// parenthesised model name — "Nano Banana Pro" is what the picker needs to say.
const IMAGE_MODEL_OPTIONS = modelsFor("image");
const shortModelLabel = m => m.label.replace(/\s*\(.*\)\s*$/, "");
const mmss = ms => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// -- Creative Studio -----------------------------------------------------------
//
// The Brief -> Create half of the creative loop, anchored to an initiative so
// every asset it produces is born attached to a hypothesis.
//
// The design constraint that shapes this whole view: an ad name is only worth
// anything if it is correct, so the operator never types one. They edit segment
// values against controlled vocabularies and the name is assembled by
// `buildName`, which is the same function the parser round-trips against. A name
// that renders here is a name that will parse when the performance export comes
// back.

const StatBlock = ({ t, label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={gSL(t)}>{label}</div>
    <div style={{ fontSize: 13.5, lineHeight: 1.62, color: t.text, fontFamily: t.serif }}>{children}</div>
  </div>
);

export function CreativeStudio({
  t, dk, items, brands, activeBrand, settings, creative, onSaveCreative, onSaveItems, showToast,
  perfRows, assets, onSaveAssets,
}) {
  const schema   = resolveSchema(settings);
  const channels = listChannels(schema);
  const initKey  = schema.initiativeDimension;
  // Talking heads, voice auditions and scenes are a workspace setting, off by
  // default (see DEFAULT_SETTINGS.creativeVideo).
  const videoOn  = !!settings.creativeVideo;

  const brandFilter = e => activeBrand === "all" || (e.brandId || "default") === activeBrand;
  // Creative is briefed for work that is still ahead of you. A closed initiative
  // has nothing left to shoot for, so offering it here would only produce assets
  // that can never be attributed to anything.
  const eligible = useMemo(
    () => items.filter(e => (e.status === "Draft" || e.status === "Running") && brandFilter(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, activeBrand]
  );

  const [selId, setSelId]       = useState("");
  const [busy, setBusy]         = useState("");     // "" | "brief" | "variants"
  const [err, setErr]           = useState("");
  const [perAngle, setPerAngle] = useState(2);
  const [channel, setChannel]   = useState(channels[0]?.id || "meta");
  const [edits, setEdits]       = useState({});     // {variantIdx: {dimKey: value}}

  // The RECORD of every generated frame now persists (see services/assets.js);
  // what is held here is only the resolved URL used to paint it, keyed by asset
  // id. Bytes still never enter the app's JSON store — a 1024px PNG is well over
  // a megabyte base64-encoded against a ~5MB localStorage cap — but they no
  // longer vanish without trace either: services/assetStore.js writes them to
  // blob storage when the deployment has it configured, and holds them for the
  // session when it does not. Either way the provenance survives.
  const [imgUrls, setImgUrls]   = useState({});     // {assetId: objectUrl|dataUrl}
  const [imgBusy, setImgBusy]   = useState(null);   // variantIdx currently generating
  const [imgErr, setImgErr]     = useState({});     // {variantIdx: message}
  const [aspect, setAspect]     = useState("4:5");
  // Per session, not per deployment. The `image` routing group sets the default
  // for everyone; this lets one operator reach for the Pro tier on the frame
  // that will actually be shown, without repointing the group for every visitor.
  const [imgModel, setImgModel] = useState(() => modelFor("image"));
  const [promptPreview, setPromptPreview] = useState(null); // {idx, text}
  const [durableBytes, setDurableBytes] = useState(false);

  // Video keeps a URL, not bytes, and that has not changed: a rendered clip is
  // 5-50MB, and re-hosting the provider's signed link would make this app a
  // video CDN with its own egress bill and retention policy (see api/video.js).
  // What is new is that the RECORD of the render — script, tier, provider, job
  // id, cost, and the ad name it was made for — outlives the link.
  const [tierKey, setTierKey]   = useState("STANDARD");
  const [vidBusy, setVidBusy]   = useState(null);   // {idx, startedAt} while one render is in flight
  const [vidErr, setVidErr]     = useState({});     // {variantIdx: message}
  const [elapsedMs, setElapsedMs] = useState(0);

  // Auditions. Held in memory only and never written to the asset store — an
  // audition is a thing you listen to and discard, and the whole argument for it
  // is that it is cheap enough to redo rather than worth keeping. Keyed by bare
  // variant index for the same reason: unlike an asset record it is not evidence,
  // so it is cleared whenever the variant list changes rather than versioned.
  // Scenes. A generated clip is video bytes, so the same rule the talking-head
  // path already follows applies: the RECORD persists, the file does not. Held in
  // session state for playback and gone on reload, which the card says out loud
  // rather than letting the operator discover it.
  const [sceneBusy, setSceneBusy] = useState(null);  // {idx, startedAt} while one generation is in flight
  const [sceneErr, setSceneErr]   = useState({});    // {variantIdx: message}
  const [sceneUrls, setSceneUrls] = useState({});    // {variantIdx: data URL}
  const [sceneDur, setSceneDur]   = useState(DEFAULT_SCENE_DURATION);
  const [sceneAspect, setSceneAspect] = useState("9:16");
  const sceneRunId = useRef(0);

  const [voices, setVoices]     = useState([]);     // [] until the library loads, or forever if unconfigured
  const [voiceId, setVoiceId]   = useState("");
  // A HeyGen-native id, never an ElevenLabs one — see the field's own note where
  // it renders. Kept separate from `voiceId` because the two are different id
  // spaces on different providers; conflating them would silently mis-send one.
  const [heygenVoiceId, setHeygenVoiceId] = useState("");
  const [audBusy, setAudBusy]   = useState(null);   // variant idx while one take is in flight
  const [audErr, setAudErr]     = useState({});     // {variantIdx: message}
  const [auditions, setAuditions] = useState({});   // {variantIdx: {url, costUsd}}

  // Read once, lazily, and its failure is deliberately silent. A deployment with
  // no ELEVENLABS_API_KEY is a normal deployment — the endpoint says so plainly
  // when called, but an operator who has not configured voice should not be shown
  // an error for a feature they never asked for. No voices, no control.
  // Not read at all while video tools are off — nothing on screen could use it.
  useEffect(() => {
    if (!videoOn) return undefined;
    let live = true;
    listVoices()
      .then(vs => { if (!live) return; setVoices(vs); setVoiceId(cur => cur || vs[0]?.voiceId || ""); })
      .catch(() => { /* unconfigured or unreachable — the audition control stays hidden */ });
    return () => { live = false; };
  }, [videoOn]);

  // Asked once. The studio says plainly whether a frame will survive a reload
  // BEFORE the operator spends money generating it, rather than after.
  useEffect(() => { probeDurableStorage().then(setDurableBytes); }, []);

  const tier = VIDEO_TIERS[tierKey];

  // Assets used to be keyed by bare variant INDEX, which is only meaningful
  // against the variant list that produced them: regenerating variants re-pointed
  // index 0 at a different creative idea, so anything left behind was attached to
  // the wrong hypothesis. The old answer was to delete everything on every
  // regeneration — safe, and it threw away the ledger.
  //
  // Assets are versioned instead (services/assets.js `variantKey`), so a frame
  // made against brief v2's third variant carries a key brief v3 can never mint.
  // Nothing has to be deleted to stay correct: old rounds simply stop being
  // *current*, and the ledger keeps every one of them with its own cost and
  // provenance. What is cleared here is view state, not evidence.
  //
  // Bumping the video run id still stops an in-flight render from writing its
  // result into a view that has moved on; see genVideo.
  const videoRunId = useRef(0);
  const clearViewState = () => {
    videoRunId.current += 1;
    setImgErr({});
    setVidErr({});
    setVidBusy(null);
    setPromptPreview(null);
    // Index-keyed, so a new variant list would otherwise leave take 0 attached to
    // a different creative idea — the exact mis-pointing the asset store is
    // versioned to avoid.
    setAudErr({});
    setAudBusy(null);
    setAuditions({});
    sceneRunId.current += 1;
    setSceneErr({});
    setSceneBusy(null);
    setSceneUrls({});
  };

  /**
   * Audition one variant, using the render's own script.
   *
   * `buildVideoScript(variant)` rather than any voice-specific flattening: the
   * only question an audition answers is what the render will sound like, so it
   * has to be the same words. See callGenerateVoice.js.
   */
  const genAudition = async (variant, idx) => {
    const text = buildVideoScript(variant);
    if (!text || !voiceId) return;
    setAudBusy(idx);
    setAudErr(e => ({ ...e, [idx]: "" }));
    try {
      const out = await callGenerateVoice({ text, voiceId, initiativeId: selId });
      // A data URL rather than a blob URL: nothing here has a lifecycle to manage,
      // and an un-revoked blob URL per take is a leak that only shows up after a
      // long session of exactly the iteration this feature encourages.
      setAuditions(a => ({ ...a, [idx]: { url: `data:${out.mimeType};base64,${out.data}`, costUsd: out.costUsd } }));
    } catch (e) {
      setAudErr(er => ({ ...er, [idx]: e.message || "Could not generate the audition." }));
    } finally {
      setAudBusy(null);
    }
  };

  // A render outlives the view that started it. Invalidate on unmount so the
  // poll loop stops rather than running out its five minutes against a torn-down
  // tree, burning the video proxy's poll budget on a result nobody can see.
  useEffect(() => () => { videoRunId.current += 1; sceneRunId.current += 1; }, []);

  // A render takes 60-170s, so "rendering…" with no moving number reads as a
  // hang. The ticker is separate from the poll loop deliberately: polling every
  // second would burn the proxy's rate-limit budget for no new information,
  // but the elapsed clock has to move faster than the polls to look alive.
  useEffect(() => {
    if (!vidBusy) return;
    const id = setInterval(() => setElapsedMs(Date.now() - vidBusy.startedAt), 1000);
    return () => clearInterval(id);
  }, [vidBusy]);

  const sel     = items.find(e => e.id === selId) || null;
  const brand   = sel ? (brands.find(b => b.id === (sel.brandId || "default")) || brands[0]) : null;
  const record  = (creative || []).find(c => c.initiativeId === selId) || null;
  const brief   = record?.brief || null;
  // The product this round is about, and what customers say — the two inputs the
  // brief, the variants and the key frame now read (services/products.js, voc.js).
  const product = productForRound(brand, record);
  const vocSnippets = useMemo(() => splitVoc(brand?.voc || "").snippets, [brand?.voc]);
  // The set on screen, and whether its names have left the tool. A frozen set's
  // slots, copy and hooks cannot change — see services/variantSets.js.
  const set     = currentSet(record);
  const frozen  = isShipped(set);
  const variants = set ? set.variants : (record?.variants || []);
  // A set is named against the channel it was produced for, whatever the picker
  // now says — the picker chooses the NEXT set's channel. Re-deriving a shipped
  // set's names against another channel's template would change names that are
  // already live in an ad account.
  const viewChannel = set?.channel || channel;
  // Creative is produced at the ad level (message, for a channel with no ad
  // level), so that is the template the editors render.
  const adLevelKey = (schema.channels || []).find(c => c.id === viewChannel)?.levels
    ?.find(l => l.key === "ad" || l.key === "message")?.key || "ad";
  const adTemplate = templateFor(schema, viewChannel, adLevelKey);
  const [failedAngles, setFailedAngles] = useState([]);
  const [critiqueBusy, setCritiqueBusy] = useState(false);
  const [critiqueErr, setCritiqueErr] = useState("");

  // Closed initiatives are the evidence base the brief reasons from — the same
  // index the learning library and Next Plays build, kept in one shape.
  const learningsIndex = useMemo(() => items
    .filter(e => (e.status === "Completed" || e.status === "Killed") && e.results?.keyLearning)
    .map(e => ({
      id: e.id, title: e.title, learning: e.results.keyLearning,
      outcome: e.results.outcomeClassification || "Inconclusive",
      category: e.category, actualRev: e.results.actualRevenueImpact ?? null,
      closedDate: e.endDate || null,
    })), [items]);

  // The latest records, for writes that land after an await. A closure over
  // `record` from before a network call would write the record back as it was,
  // silently dropping whatever was saved in between — the variant set, then the
  // review of it, then a slot edit made while the review was running.
  const creativeRef = useRef(creative);
  useEffect(() => { creativeRef.current = creative; }, [creative]);

  /** Apply `fn(record) → patch` to the newest copy of one initiative's record.
   *  A null patch (a frozen set refusing a change) writes nothing. */
  const updateRecord = (initiativeId, fn) => {
    const all = creativeRef.current || [];
    const current = all.find(c => c.initiativeId === initiativeId) || { initiativeId };
    const patch = fn(current);
    if (!patch) return false;
    const updated = [{ ...current, ...patch }, ...all.filter(c => c.initiativeId !== initiativeId)];
    creativeRef.current = updated;
    onSaveCreative(updated);
    return true;
  };
  const saveRecord = (patch) => updateRecord(selId, () => patch);

  // Measured returns per creative dimension, from whatever performance has been
  // imported. This is the half of the evidence the brief never used to see: the
  // app could compute that one angle returned 2.1x and another 0.8x, and then
  // brief the next round without mentioning it.
  const evidence = useMemo(
    () => buildCreativeEvidence(perfRows, schema),
    [perfRows, schema]
  );

  // What customers said, ranked for this initiative and product by a stated rule
  // (services/voc.js). Recomputed per call rather than memoised: it is cheap, and
  // it has to describe the brief being generated, not the last one.
  const vocFor = () => selectVoc(vocSnippets, {
    title: sel?.title, hypothesis: sel?.hypothesis, observation: sel?.observation,
    category: sel?.category, productName: product?.name,
  });

  // The studio's own shipped ads that the ad account has judged — the words that
  // won and lost, not just the angle. Scoped to this initiative's brand.
  const shippedResults = useMemo(() => {
    const index = shippedAdIndex(creative);
    if (!index.size) return { winners: [], losers: [], judged: 0, thin: 0, shipped: 0 };
    return topAdsByReturn(perfRows, index, {
      initiativesById: new Map(items.map(e => [e.id, e])),
      brandId: sel ? (sel.brandId || "default") : null,
    });
  }, [creative, perfRows, items, sel]);

  const runBrief = async () => {
    if (!sel) return;
    setBusy("brief"); setErr("");
    try {
      const result = await callCreativeBrief(sel, brand, learningsIndex, settings, schema, undefined, {
        evidence, product, voc: vocFor(), winners: shippedResults,
      });
      // Briefs are versioned, not overwritten. The previous behaviour replaced
      // `record.brief` in place, which destroyed its `wouldFalsify` — the one
      // field that makes a creative round settle a question. An initiative's
      // prediction is frozen at launch precisely so it can be checked later; the
      // brief that justified the creative deserves the same treatment, and
      // without it there is no way to tell whether the brief behind a winning ad
      // said something different from the one currently on file.
      let version = 0;
      updateRecord(selId, (rec) => {
        version = (rec.briefVersion || 0) + 1;
        const history = [
          ...(rec.briefs || []),
          ...(rec.brief && !(rec.briefs || []).length
            // A record written before versioning existed carries only `brief`.
            // Fold it in as v1 rather than losing it.
            ? [{ version: rec.briefVersion || 1, brief: rec.brief, generatedAt: rec.generatedAt || null }]
            : []),
        ];
        return {
          brief: result,
          briefVersion: version,
          briefs: [...history, { version, brief: result, generatedAt: new Date().toISOString() }],
          // A new brief starts a new run of variant sets. The sets made against
          // earlier briefs stay in `variantSets` — shipped ones are the record of
          // what went out — and the assets made against them keep their keys.
          variants: [],
          variantsVersion: 0,
          generatedAt: new Date().toISOString(),
        };
      });
      setEdits({});
      setFailedAngles([]);
      clearViewState();
      showToast(`Creative brief v${version} generated.`, "success");
    } catch (e) { setErr(e.message || "Could not generate the brief."); }
    finally { setBusy(""); }
  };

  /** The review pass over the set on screen. Suggestions only; never applied. */
  const runCritique = async (variants, initiativeId = selId) => {
    if (!variants?.length) return;
    setCritiqueBusy(true); setCritiqueErr("");
    try {
      const byIdx = await callCritiqueVariants(brief, variants, brand, { channel, product, initiativeId });
      updateRecord(initiativeId, (rec) => withCritique(rec, { byIdx, at: new Date().toISOString() }));
    } catch (e) {
      setCritiqueErr(e.message || "The review pass did not run.");
    } finally { setCritiqueBusy(false); }
  };

  const runVariants = async () => {
    if (!sel || !brief) return;
    const initiativeId = selId;
    setBusy("variants"); setErr(""); setCritiqueErr("");
    try {
      const { variants: result, failedAngles: failed } = await produceVariantSet(brief, sel, brand, schema, {
        perAngle, channel, product, voc: vocFor(),
      });
      // A new set every time, appended — never a replacement. Bumping the version
      // is what keeps yesterday's frame from reappearing under a variant that
      // never asked for it, and appending is what keeps a shipped set's words.
      updateRecord(initiativeId, (rec) => ({
        ...withNewSet(rec, { variants: result, channel, perAngle, failedAngles: failed }),
        generatedAt: new Date().toISOString(),
      }));
      setEdits({});
      setFailedAngles(failed);
      clearViewState();
      showToast(result.length + " variants generated" + (failed.length ? `, ${failed.length} angle${failed.length === 1 ? "" : "s"} failed` : "") + ".", failed.length ? "error" : "success");
      runCritique(result, initiativeId);
    } catch (e) { setErr(e.message || "Could not generate variants."); }
    finally { setBusy(""); }
  };

  // The initiative segment is stamped from the initiative's own trackingTag,
  // never from the model. An absent tag yields the placeholder, which correctly
  // marks the asset as untracked rather than inventing a link that joins to
  // nothing.
  const tag = sel?.trackingTag ? String(sel.trackingTag).trim() : "";

  const valuesFor = (variant, idx) => {
    const values = { ...(variant.naming || {}), ...(edits[idx] || {}) };
    if (initKey) values[initKey] = tag || (schema.placeholder || NA);
    return values;
  };

  // One dimension record projects into every level of the channel at once, so
  // the campaign and ad set names are guaranteed consistent with the ad name
  // rather than being three strings typed on three different days.
  //
  // A frozen set answers from its snapshot instead: the names it shipped with are
  // the names, even if the initiative's tracking tag has changed since.
  const nameSetFor = (variant, idx) => {
    const shipped = frozen ? set?.names?.[idx] : null;
    if (shipped?.levels) {
      return listLevels(schema, viewChannel).map(l => ({ level: l.key, label: l.label, name: shipped.levels[l.key] || "", errors: [] }));
    }
    return buildNameSet(valuesFor(variant, idx), schema, viewChannel);
  };
  const nameFor    = (variant, idx) =>
    nameSetFor(variant, idx).find(n => n.level === adLevelKey) || { name: "", errors: [] };

  /** Persist one naming slot. Refused (and said so) on a frozen set. */
  const commitNaming = (idx, key, value) => {
    const ok = updateRecord(selId, rec => withNaming(rec, idx, key, value));
    setEdits(e => { const cur = { ...(e[idx] || {}) }; delete cur[key]; return { ...e, [idx]: cur }; });
    if (!ok) showToast("This set has shipped, so its names are frozen. Produce a new set to change them.", "error");
  };

  /**
   * Freeze the set on screen as its names leave the studio, and return the names
   * it froze with. The first ship validates: a set with a broken name is refused
   * rather than shipped, because a name that does not parse is spend that will
   * never find its way back. Later ships only record how the set went out again.
   */
  const ship = (via) => {
    if (!set) return null;
    if (frozen && set.names) {
      updateRecord(selId, rec => withShipped(rec, set.names, via));
      return set.names;
    }
    const names = {};
    for (let i = 0; i < variants.length; i++) {
      const levels = nameSetFor(variants[i], i);
      const ad = levels.find(n => n.level === adLevelKey);
      const errors = levels.flatMap(n => n.errors);
      if (!ad?.name || errors.length) {
        showToast(`${variants[i].label || "Variant " + (i + 1)} has a naming error — fix its slots before these names leave the studio.`, "error");
        return null;
      }
      names[i] = { ad: ad.name, levels: Object.fromEntries(levels.map(n => [n.level, n.name])) };
    }
    updateRecord(selId, rec => withShipped(rec, names, via));
    showToast("Names frozen for this set. Produce a new set to change anything.", "success");
    return names;
  };

  const download = (content, type, filename) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // The round this initiative is currently on. Every asset generated below is
  // stamped with it, which is what lets an old round stay in the ledger without
  // ever showing up under a variant it does not belong to.
  const round = {
    initiativeId: selId,
    briefVersion: record?.briefVersion || 0,
    variantsVersion: record?.variantsVersion || 0,
  };
  const roundAssets = useMemo(
    () => currentRoundAssets(assets, round),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, selId, record?.briefVersion, record?.variantsVersion]
  );
  const angleFrames = useMemo(
    () => currentAngleFrames(assets, { initiativeId: selId, briefVersion: round.briefVersion }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, selId, record?.briefVersion]
  );

  /**
   * The images a key frame is conditioned on, as base64 for the image proxy,
   * downscaled for the wire (services/imageResize.js). Product images first —
   * buildImagePrompt names them by position — then the brand's style references.
   *
   * A product whose image bytes are gone is refused rather than skipped: the
   * frame would come back showing an invented product, which is the exact thing
   * the product reference exists to stop, and the generation would still be paid for.
   */
  const loadReferences = async () => {
    const read = async (list) => (await Promise.all(list.map(async r => {
      const bytes = await readAssetBytes(r);
      return bytes ? downscaleImage(bytes) : null;
    }))).filter(Boolean);
    const productImages = (product?.images || []).slice(0, MAX_PRODUCT_IMAGES);
    const [productRefs, styleRefs] = await Promise.all([
      read(productImages),
      read((brand?.referenceImages || []).slice(0, MAX_REFERENCE_IMAGES)),
    ]);
    if (productImages.length && !productRefs.length) {
      throw new Error(`${product.name}'s images are not held in this tab any more. Fetch them again under Settings → Retailers → Products, or choose "No product" above to generate without it.`);
    }
    return { product: productRefs, style: styleRefs };
  };

  /** The prompt a frame is generated from, for a given set of references. */
  const framePrompt = (variant, refs) => buildImagePrompt(brief, variant, brand, {
    referenceCount: refs.style.length,
    productReferenceCount: refs.product.length,
    product,
  });

  const genImage = async (variant, idx) => {
    setImgBusy(idx);
    setImgErr({ ...imgErr, [idx]: "" });
    try {
      const refs = await loadReferences();
      const prompt = framePrompt(variant, refs);
      // The model is the studio's picker, which starts on whatever the `image`
      // routing group is pointed at — so repointing the group in the admin
      // console still reaches this button's default.
      // `initiativeId` is what lands this generation's cost in the spend ledger
      // against the experiment that caused it, so a round of creative can be
      // costed alongside the revenue it is being judged on.
      const img = await callGenerateImage({ prompt, model: imgModel, aspectRatio: aspect, referenceImages: [...refs.product, ...refs.style], initiativeId: selId });

      const name = nameFor(variant, idx);
      const stored = await putAsset({ mimeType: img.mimeType, data: img.data });
      const rec = mkAssetRecord({
        kind: "image",
        initiativeId: selId,
        initId: sel.initId || sel.id,
        brandId: sel.brandId || "default",
        briefVersion: round.briefVersion,
        variantsVersion: round.variantsVersion,
        variantIdx: idx,
        variantLabel: variant.label || "",
        angleSlug: variant.angleSlug || "",
        // The join key, captured at the moment of generation. Without it an asset
        // can be traced forward from the brief but never backward from the spend.
        adName: name.name || "",
        channel: viewChannel,
        model: img.model,
        prompt,
        aspect,
        mimeType: img.mimeType,
        costUsd: imageCostUsd(img.model),
        storageKey: stored.storageKey,
        bytesDurable: stored.durable,
      });
      onSaveAssets([rec, ...(assets || [])]);
      const url = await getAssetUrl(rec);
      if (url) setImgUrls(u => ({ ...u, [rec.id]: url }));
    } catch (e) {
      setImgErr({ ...imgErr, [idx]: e.message || "Could not generate an image." });
    } finally { setImgBusy(null); }
  };

  /**
   * A concept frame straight from a brief angle — the image, one click after
   * the brief, without producing variants first.
   *
   * Same prompt builder, same hard constraints and the same ledger as a variant
   * frame; what it has no claim to is an ad name. It is a picture of an angle,
   * not an asset that will run, so `adName` is recorded empty rather than
   * invented — the ledger already reads "" as "not attributable".
   */
  const genAngleFrame = async (angle, angleIdx) => {
    const slot = angleSlot(angleIdx);
    setImgBusy(slot);
    setImgErr(e => ({ ...e, [slot]: "" }));
    try {
      const refs = await loadReferences();
      const prompt = framePrompt(angleAsVariant(angle), refs);
      const img = await callGenerateImage({ prompt, model: imgModel, aspectRatio: aspect, referenceImages: [...refs.product, ...refs.style], initiativeId: selId });
      const stored = await putAsset({ mimeType: img.mimeType, data: img.data });
      const rec = mkAssetRecord({
        kind: "image",
        initiativeId: selId,
        initId: sel.initId || sel.id,
        brandId: sel.brandId || "default",
        briefVersion: round.briefVersion,
        variantsVersion: 0,
        variantIdx: slot,
        variantLabel: angle.label || "",
        angleSlug: angle.slug || "",
        adName: "",
        channel,
        model: img.model,
        prompt,
        aspect,
        mimeType: img.mimeType,
        costUsd: imageCostUsd(img.model),
        storageKey: stored.storageKey,
        bytesDurable: stored.durable,
      });
      onSaveAssets([rec, ...(assets || [])]);
      const url = await getAssetUrl(rec);
      if (url) setImgUrls(u => ({ ...u, [rec.id]: url }));
    } catch (e) {
      setImgErr(er => ({ ...er, [slot]: e.message || "Could not generate an image." }));
    } finally { setImgBusy(null); }
  };

  // Resolve URLs for assets from a previous session. A record whose bytes are
  // gone resolves to null and renders as a record without a picture, which is
  // the honest state rather than a broken image icon.
  useEffect(() => {
    let live = true;
    const pending = [...Object.values(roundAssets).map(slot => slot.image), ...Object.values(angleFrames)]
      .filter(a => a && !imgUrls[a.id]);
    if (!pending.length) return;
    Promise.all(pending.map(async a => [a.id, await getAssetUrl(a)])).then(pairs => {
      if (!live) return;
      const next = {};
      pairs.forEach(([id, url]) => { if (url) next[id] = url; });
      if (Object.keys(next).length) setImgUrls(u => ({ ...u, ...next }));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundAssets, angleFrames]);

  // The two params a render submits beyond script/aspect, resolved per provider
  // rather than passed straight through — each provider reads a different id
  // space for each, and sending the wrong one either 400s or is silently
  // ignored:
  //   voiceId   — HeyGen wants its own catalogue id (heygenVoiceId, free-typed,
  //               since this app cannot list HeyGen's imported voices); D-ID's
  //               CUSTOM_VOICE tier wants the ElevenLabs voiceId already used
  //               for auditions; Fabric has no id-based voice input at all.
  //   avatarId  — D-ID and Fabric both animate a still and read this as an
  //               image URL (brand.avatarImageUrl); HeyGen reads it as one of
  //               its own stock avatar ids, which this app never collects, so
  //               it is never sent there — an image URL in that slot is not a
  //               HeyGen avatar_id and would 400 the submit.
  const videoParamsFor = (currentTier) => {
    if (currentTier.provider === "heygen") return { voiceId: heygenVoiceId || undefined, avatarId: undefined };
    if (currentTier.provider === "did" || currentTier.provider === "fabric") {
      return { voiceId: currentTier.provider === "did" ? (voiceId || undefined) : undefined, avatarId: brand?.avatarImageUrl || undefined };
    }
    return { voiceId: undefined, avatarId: undefined };
  };

  // Submit, then poll until the provider resolves. The loop lives here rather
  // than inside pollVideoJob because the UI has to keep reporting "still
  // rendering, 1:24 elapsed" between polls — a promise that resolves in three
  // minutes with nothing in between is indistinguishable from a broken button.
  const genVideo = async (variant, idx) => {
    const startedAt = Date.now();
    const script = buildVideoScript(variant);
    // Claim a run id. Every write below is gated on still holding it, so a
    // render the operator has navigated away from resolves into nothing instead
    // of into whatever is on screen by then.
    const runId = ++videoRunId.current;
    const current = () => videoRunId.current === runId;

    setVidBusy({ idx, startedAt, status: "rendering" });
    setElapsedMs(0);
    setVidErr(e => ({ ...e, [idx]: "" }));

    // Written once the job is accepted, not when it finishes. A render that is
    // submitted is billed whether or not anyone waits for it, so the ledger has
    // to record it at submit — a record written only on success would understate
    // spend by exactly the renders that went wrong, which is the wrong direction
    // to be wrong in.
    const writeRecord = (patch) => {
      const name = nameFor(variant, idx);
      return mkAssetRecord({
        kind: "video",
        initiativeId: selId,
        initId: sel.initId || sel.id,
        brandId: sel.brandId || "default",
        briefVersion: round.briefVersion,
        variantsVersion: round.variantsVersion,
        variantIdx: idx,
        variantLabel: variant.label || "",
        angleSlug: variant.angleSlug || "",
        adName: name.name || "",
        channel,
        model: tier.provider,
        provider: tier.provider,
        prompt: script,
        aspect,
        costUsd: estimateVideoCostUsd(script, tier),
        ...patch,
      });
    };

    try {
      const { voiceId: resolvedVoiceId, avatarId: resolvedAvatarId } = videoParamsFor(tier);
      const { jobId, provider } = await callGenerateVideo({
        script, cta: variant.cta, aspectRatio: aspect, tier, initiativeId: selId,
        voiceId: resolvedVoiceId, avatarId: resolvedAvatarId,
      });
      if (!current()) return;

      for (;;) {
        await new Promise(r => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
        // Checked before the poll rather than after, so an abandoned render
        // costs at most the one sleep it was already in — no further calls
        // against the proxy's poll budget.
        if (!current()) return;

        // A slow render is not a failed one — the job is still alive on the
        // provider's side and will still be billed. So the timeout hands the
        // operator the job id and stops polling, rather than reporting an error
        // that implies nothing was spent.
        if (Date.now() - startedAt > VIDEO_POLL_TIMEOUT_MS) {
          // Stalled, not failed: the job is alive on the provider and will be
          // billed, so the record is written with the job id the operator needs
          // to collect it from the provider's own dashboard.
          onSaveAssets([writeRecord({ jobId, providerUrl: null }), ...(assets || [])]);
          setVidErr(e => ({ ...e,
            [idx]: `Still rendering after ${Math.round(VIDEO_POLL_TIMEOUT_MS / 60000)} minutes, so this stopped watching. `
                 + `The job is alive on the provider and will still be billed — job ${jobId}. It is recorded against this variant.` }));
          break;
        }

        const result = await pollVideoJob({ jobId, provider });
        if (!current()) return;
        if (result.status === "done") {
          onSaveAssets([writeRecord({
            jobId,
            providerUrl: result.url,
            durationSeconds: result.durationSeconds,
            // The clip itself is never re-hosted — see api/video.js. What
            // persists is the record; the link expires within 24-72h and the
            // operator downloads before then.
            bytesDurable: false,
          }), ...(assets || [])]);
          break;
        }
        if (result.status === "failed") {
          // The provider's own message, verbatim. A moderation refusal and a
          // bad avatar URL need different fixes, and paraphrasing them into
          // "render failed" throws away the only thing that distinguishes them.
          onSaveAssets([writeRecord({ jobId }), ...(assets || [])]);
          setVidErr(e => ({ ...e, [idx]: result.error || "The provider reported a failed render." }));
          break;
        }
      }
    } catch (e) {
      if (!current()) return;
      setVidErr(er => ({ ...er, [idx]: e.message || "Could not generate a video." }));
    } finally { if (current()) setVidBusy(null); }
  };

  /**
   * Generate one scene for a variant.
   *
   * Mirrors genVideo's discipline rather than the image path's, because a scene
   * is a long-running billed job and not a request that returns: the asset record
   * is written at SUBMIT, so a generation that stalls or fails is still
   * attributable to the hypothesis that caused the spend.
   *
   * The clip itself is held in session state and nowhere else — video bytes are
   * deliberately not durable here (see DECISIONS.md), and a Veo clip is the same
   * order of megabytes as a HeyGen render.
   */
  const genScene = async (variant, idx) => {
    if (!brief || !sel) return;
    const runId = ++sceneRunId.current;
    const current = () => sceneRunId.current === runId;
    const startedAt = Date.now();

    const prompt = buildScenePrompt(brief, variant, brand, { durationSeconds: sceneDur });
    setSceneBusy({ idx, startedAt });
    setSceneErr(e => ({ ...e, [idx]: "" }));

    const writeRecord = (patch) => {
      const name = nameFor(variant, idx);
      return mkAssetRecord({
        kind: "scene",
        initiativeId: selId,
        initId: sel.initId || sel.id,
        brandId: sel.brandId || "default",
        briefVersion: round.briefVersion,
        variantsVersion: round.variantsVersion,
        variantIdx: idx,
        variantLabel: variant.label || "",
        angleSlug: variant.angleSlug || "",
        adName: name.name || "",
        channel,
        prompt,
        aspect: sceneAspect,
        durationSeconds: sceneDur,
        ...patch,
      });
    };

    try {
      const { operationName, model, estimatedCostUsd } = await callGenerateScene({
        prompt, aspectRatio: sceneAspect, durationSeconds: sceneDur, initiativeId: selId,
      });
      if (!current()) return;

      for (;;) {
        await new Promise(r => setTimeout(r, SCENE_POLL_INTERVAL_MS));
        if (!current()) return;

        if (Date.now() - startedAt > SCENE_POLL_TIMEOUT_MS) {
          // Stalled, not failed. The job is alive on Google's side and will be
          // billed, so the record is written with the operation id needed to
          // collect it — the same call genVideo makes on its own timeout.
          onSaveAssets([writeRecord({ model, provider: "gemini", jobId: operationName, costUsd: estimatedCostUsd }), ...(assets || [])]);
          setSceneErr(e => ({ ...e,
            [idx]: `Still generating after ${Math.round(SCENE_POLL_TIMEOUT_MS / 60000)} minutes, so this stopped watching. `
                 + `The job is alive at the provider and will still be billed. It is recorded against this variant.` }));
          break;
        }

        const result = await pollSceneJob({ operationName, model });
        if (!current()) return;

        if (result.status === "done") {
          onSaveAssets([writeRecord({
            model, provider: "gemini", jobId: operationName,
            costUsd: estimatedCostUsd, mimeType: result.mimeType || "video/mp4",
            providerUrl: result.gcsUri || null,
          }), ...(assets || [])]);
          // Inline bytes are playable; a GCS URI is not reachable from a browser,
          // so it is recorded on the asset and the card says where the clip is
          // rather than rendering a player that cannot load.
          if (result.data) setSceneUrls(u => ({ ...u, [idx]: `data:${result.mimeType || "video/mp4"};base64,${result.data}` }));
          break;
        }

        if (result.status === "failed") {
          // Billed or not, the attempt is recorded: a failure with no row is how
          // a spend console quietly disagrees with an invoice.
          onSaveAssets([writeRecord({ model, provider: "gemini", jobId: operationName, costUsd: estimatedCostUsd }), ...(assets || [])]);
          setSceneErr(e => ({ ...e, [idx]: result.error || "The provider reported a failed generation." }));
          break;
        }
      }
    } catch (e) {
      if (current()) setSceneErr(er => ({ ...er, [idx]: e.message || "Could not generate the scene." }));
    } finally {
      if (current()) setSceneBusy(null);
    }
  };

  const downloadAsset = (asset, label) => {
    const url = asset && imgUrls[asset.id];
    if (!url) return;
    const ext = (asset.mimeType || "image/png").split("/")[1] || "png";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(sel.initId || sel.id)}_${(label || "variant").replace(/\s+/g, "-")}_${String(asset.aspect || "").replace(":", "x")}.${ext}`;
    a.click();
  };
  const downloadImage = (variant, idx) => downloadAsset(roundAssets[idx]?.image, variant.label);

  const assignTag = () => {
    const suggested = suggestTrackingTag(sel, schema);
    if (!suggested) { showToast("Could not derive a tracking tag for this initiative.", "error"); return; }
    onSaveItems(items.map(e => e.id === sel.id ? { ...e, trackingTag: suggested } : e));
    showToast(`Tracking tag set to ${suggested}. Every ad name here now carries it.`, "success");
  };

  // Every way a set's names leave the studio goes through `ship`, which freezes
  // the set the first time. The buttons say so before they are pressed.
  const copyNames = () => {
    const names = ship("names");
    if (!names) return;
    const lines = variants.map((v, i) => names[i]?.ad).filter(Boolean).join("\n");
    navigator.clipboard?.writeText(lines)
      .then(() => showToast(variants.length + " ad names copied.", "success"))
      .catch(() => showToast("Could not copy to clipboard.", "error"));
  };

  const stamp = () => `${(sel.initId || sel.id)}_b${record?.briefVersion || 0}s${record?.variantsVersion || 0}`;

  // Every field, every level's name — the campaign and ad set rows are what
  // someone actually needs when building the structure in the platform.
  const exportCSV = () => {
    const names = ship("csv");
    if (!names) return;
    const rows = variants.map((v, i) => ({ variant: v, values: valuesFor(v, i), levelNames: names[i]?.levels || {} }));
    download(buildVariantCSV({ rows, adTemplate, levels: listLevels(schema, viewChannel), channel: viewChannel }),
      "text/csv", `creative_${stamp()}_${viewChannel}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // The creator's copy: one printable page per variant, with the exact name to
  // deliver under. See services/creatorBrief.js.
  const exportCreatorBrief = () => {
    const names = ship("creator-brief");
    if (!names) return;
    const rows = variants.map((v, i) => ({ variant: v, adName: names[i]?.ad, levelNames: names[i]?.levels || {} }));
    const html = buildCreatorBriefHtml({
      initiative: sel, brief, set: currentSet(creativeRef.current.find(c => c.initiativeId === selId)) || set,
      rows, brand, product, channel: viewChannel, vocSnippets,
    });
    download(html, "text/html", `creator-brief_${stamp()}.html`);
  };

  /** Store a composed static ad against its variant, freeze the set, download it. */
  const exportStatic = async (variant, idx, out) => {
    const names = ship("static");
    if (!names) throw new Error("Fix this set's naming slots first — a static ad ships under its ad name.");
    const adName = names[idx]?.ad || "";
    const stored = await putAsset({ mimeType: out.mimeType, data: out.data });
    const rec = mkAssetRecord({
      kind: "static",
      initiativeId: selId,
      initId: sel.initId || sel.id,
      brandId: sel.brandId || "default",
      briefVersion: round.briefVersion,
      variantsVersion: round.variantsVersion,
      variantIdx: idx,
      variantLabel: variant.label || "",
      angleSlug: variant.angleSlug || "",
      adName,
      channel: viewChannel,
      model: "composed",
      // What was drawn, so the record says which approved words the ad carries.
      prompt: JSON.stringify({ headline: out.headline, cta: out.cta, format: out.format, frame: roundAssets[idx]?.image?.id || null }),
      aspect: out.format,
      mimeType: out.mimeType,
      costUsd: 0,
      storageKey: stored.storageKey,
      bytesDurable: stored.durable,
    });
    onSaveAssets([rec, ...(assets || [])]);
    const a = document.createElement("a");
    a.href = out.dataUrl;
    a.download = `${(adName || variant.label || "static").slice(0, 150)}_${out.format.replace(":", "x")}.jpg`;
    a.click();
  };

  /** Take the review pass's suggestion for one variant. Refused on a frozen set. */
  const applySuggestion = (idx, kind) => {
    const note = set?.critique?.byIdx?.[idx];
    if (!note) return;
    const ok = updateRecord(selId, rec => withVariantChange(rec, idx, v => kind === "hook"
      // The replaced hook becomes an alternative rather than disappearing: it
      // was approved once, and it is still a candidate to test.
      ? { ...v, hook: note.suggestedHook, altHooks: [v.hook, ...(v.altHooks || [])].filter(Boolean).slice(0, 4) }
      : { ...v, copy: { ...(v.copy || {}), ...note.suggestedCopy } }));
    if (!ok) showToast("This set has shipped, so it is frozen. Produce a new set to change it.", "error");
  };

  // Frame and model, shared by concept frames and variant frames. Rendered in
  // the variants header once variants exist, and above the angles until then,
  // so there is always exactly one copy on screen.
  const imageControls = (
    <>
      <label style={{ fontSize: 12, color: t.textSub }}>Frame</label>
      <select value={aspect} onChange={e => setAspect(e.target.value)} style={{ ...gSl(t), width: 132, padding: "6px 8px" }}>
        {IMAGE_ASPECTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
      <label style={{ fontSize: 12, color: t.textSub }}>Image model</label>
      <select value={imgModel} onChange={e => setImgModel(e.target.value)} style={{ ...gSl(t), width: 196, padding: "6px 8px" }}
        title={IMAGE_MODEL_OPTIONS.find(m => m.id === imgModel)?.blurb}>
        {IMAGE_MODEL_OPTIONS.map(m => (
          <option key={m.id} value={m.id}>
            {shortModelLabel(m)}{m.price?.perImageUsd != null ? ` · ${usd(m.price.perImageUsd)}` : ""}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 60px" }}>

      {/* Header */}
      <div data-tour="creative-studio" style={{ margin: "22px 0 18px" }}>
        <h2 style={{ fontFamily: t.serif, fontSize: 24, fontWeight: 600, margin: 0, color: t.text }}>Creative Studio</h2>
        <p style={{ fontSize: 13, color: t.textSub, margin: "6px 0 0", maxWidth: 680, lineHeight: 1.6 }}>
          Brief and produce creative against an initiative, so every asset carries the experiment it belongs to.
          Ad names are assembled from your naming convention rather than typed, which is what lets performance
          data find its way back to the hypothesis.
        </p>
      </div>

      {/* Initiative picker */}
      <div style={{ ...gCd(t), marginBottom: 18 }}>
        <div style={gSL(t)}>Initiative</div>
        {eligible.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textMuted, fontFamily: t.serif }}>
            No draft or running initiatives in this brand. Creative is briefed against work that is still ahead of you.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={selId} onChange={e => { setSelId(e.target.value); setEdits({}); setErr(""); clearViewState(); }}
              style={{ ...gSl(t), maxWidth: 460, flex: "1 1 300px" }}>
              <option value="">Select an initiative…</option>
              {eligible.map(e => (
                <option key={e.id} value={e.id}>{(e.initId ? e.initId + " · " : "") + e.title}</option>
              ))}
            </select>
            {sel && <SBdg s={sel.status} dk={dk} />}
            {sel && <CBdg cat={sel.category} cats={settings.categories || []} dk={dk} t={t} />}
          </div>
        )}

        {sel && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + t.borderSoft }}>
            <div style={{ fontSize: 13, color: t.textSub, fontFamily: t.serif, lineHeight: 1.6 }}>
              <strong style={{ color: t.text }}>Hypothesis.</strong> {sel.hypothesis || "Not recorded — the brief will be weaker without one."}
            </div>

            {/* The bridge. Without a trackingTag nothing this view produces can be
                attributed, so it is surfaced as a blocking-looking prompt rather
                than buried in the initiative editor. */}
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 10,
              background: tag ? t.tealBg : t.warnBg,
              border: "1px solid " + (tag ? t.teal : t.warnBorder),
            }}>
              {tag ? (
                <div style={{ fontSize: 12.5, color: t.text }}>
                  Tracking tag <code style={{ fontFamily: t.sans, fontWeight: 700 }}>{tag}</code> — every ad name below ends with it,
                  so performance rows carrying this tag join back to this initiative.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12.5, color: t.text, flex: "1 1 340px" }}>
                    No tracking tag set. Assets will be named <code style={{ fontFamily: t.sans }}>…{schema.delimiter}{schema.placeholder || NA}</code> and
                    will not attribute back to this initiative.
                  </div>
                  <button onClick={assignTag} style={gG(t)}>Assign {suggestTrackingTag(sel, schema)}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {err && (
        <div style={{ ...gCd(t), marginBottom: 18, borderColor: t.red, background: t.redBg }}>
          <div style={{ fontSize: 13, color: t.red }}>{err}</div>
        </div>
      )}

      {/* Brief */}
      {sel && (
        <div style={{ ...gCd(t), marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: brief ? 12 : 0 }}>
            <div style={{ ...gSL(t), marginBottom: 0 }}>Creative brief</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* The product this round sells. Its facts are what copy may claim,
                  and its images are what the key frame must show. */}
              <label style={{ fontSize: 12, color: t.textSub }} htmlFor="studio-product">Product</label>
              <select id="studio-product" value={record?.productId || (product ? product.id : "")}
                onChange={e => saveRecord({ productId: e.target.value || null })}
                style={{ ...gSl(t), width: 210, padding: "6px 8px" }}>
                {productsOf(brand).length === 0 && <option value="">None added — Settings → Retailers</option>}
                {productsOf(brand).length > 0 && <option value="none">No specific product</option>}
                {productsOf(brand).map(p => (
                  <option key={p.id} value={p.id}>{p.name}{priceLabel(p) ? " · " + priceLabel(p) : ""}</option>
                ))}
              </select>
              <button onClick={runBrief} disabled={busy === "brief"} style={{ ...(brief ? gGh(t) : gG(t)), opacity: busy === "brief" ? 0.6 : 1 }}>
                {busy === "brief" ? "Briefing…" : brief ? "Regenerate brief" : "Generate brief"}
              </button>
            </div>
          </div>

          {/* What the next brief will stand on, said before it is generated —
              an empty input is a weaker brief, and the operator can fix that first. */}
          <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.sans, marginBottom: brief ? 14 : 0, marginTop: brief ? 0 : 10, lineHeight: 1.55 }}>
            Grounded in: {product ? product.name : "no product"} · {vocSnippets.length ? `${vocSnippets.length} customer quote${vocSnippets.length === 1 ? "" : "s"}` : "no customer voice"}
            {" · "}{brand?.voice ? "brand voice" : "no brand voice"}
            {" · "}{shippedResults.winners.length ? `${shippedResults.winners.length} winning ad${shippedResults.winners.length === 1 ? "" : "s"} from this studio` : shippedResults.shipped ? "shipped ads not yet judged" : "no shipped ads yet"}
            {(!product || !vocSnippets.length || !brand?.voice) && <> — add what is missing under Settings → Retailers.</>}
          </div>

          {brief && (
            <>
              <StatBlock t={t} label="Insight">{renderProse(brief.insight)}</StatBlock>
              <VocQuotes t={t} snippets={vocSnippets} ids={brief.vocCited} label="Built on" />
              <StatBlock t={t} label="Promise">{renderProse(brief.promise)}</StatBlock>

              {(brief.proof || []).length > 0 && (
                <StatBlock t={t} label="Proof on screen">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {brief.proof.map((p, i) => <li key={i} style={{ marginBottom: 3 }}>{p}</li>)}
                  </ul>
                </StatBlock>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4, marginBottom: 8 }}>
                <div style={{ ...gSL(t), marginBottom: 0 }}>Angles to test</div>
                {variants.length === 0 && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{imageControls}</div>
                )}
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", marginBottom: 16 }}>
                {(brief.angles || []).map((a, i) => (
                  <div key={i} style={{ background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 11, padding: "12px 14px" }}>
                    <div style={{ fontFamily: t.sans, fontSize: 11, color: t.gold, fontWeight: 700, letterSpacing: "0.04em" }}>{a.slug}</div>
                    <div style={{ fontFamily: t.serif, fontSize: 14, fontWeight: 600, color: t.text, margin: "3px 0 6px" }}>{a.label}</div>
                    <div style={{ fontSize: 12.5, color: t.textSub, lineHeight: 1.55, marginBottom: 7 }}>{a.theory}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>{a.execution}</div>
                    {a.openingBeat && (
                      <div style={{ fontSize: 12, color: t.text, marginTop: 8, paddingTop: 8, borderTop: "1px solid " + t.borderSoft }}>
                        <span style={{ ...gSL(t), display: "inline", marginRight: 6 }}>First 3s</span>{a.openingBeat}
                      </div>
                    )}

                    {/* Concept frame: the image, straight from the brief. */}
                    {(() => {
                      const slot = angleSlot(i);
                      const frame = angleFrames[i] || null;
                      const url = frame ? imgUrls[frame.id] : null;
                      return (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + t.borderSoft }}>
                          {url && (
                            <img src={url} alt={"Concept frame for " + (a.label || a.slug)}
                              style={{ width: "100%", borderRadius: 8, border: "1px solid " + t.border, display: "block", marginBottom: 8 }}/>
                          )}
                          {frame && !url && (
                            <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.serif, lineHeight: 1.5, marginBottom: 8 }}>
                              Generated {fmtDate(frame.createdAt, settings)}; the image is no longer held. Regenerate to get it back.
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <button onClick={() => genAngleFrame(a, i)} disabled={imgBusy !== null}
                              style={{ ...(frame ? gGh(t) : gG(t)), padding: "5px 11px", fontSize: 11.5, opacity: imgBusy !== null ? 0.55 : 1 }}>
                              {imgBusy === slot ? "Generating…" : frame ? "Regenerate frame" : "Generate frame"}
                            </button>
                            {url && (
                              <button onClick={() => downloadAsset(frame, a.slug || a.label)} style={{ ...gGh(t), padding: "5px 9px", fontSize: 11 }}>Download</button>
                            )}
                            {frame && (
                              <span style={{ fontSize: 10.5, color: t.textMuted, fontFamily: t.sans }}>
                                {frame.aspect} · {frame.costUsd != null ? usd(frame.costUsd) : "cost not recorded"}
                              </span>
                            )}
                          </div>
                          {imgErr[slot] && (
                            <div style={{ marginTop: 7, fontSize: 11.5, color: t.red, lineHeight: 1.5 }}>{imgErr[slot]}</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>

              <StatBlock t={t} label="Format guidance">{renderProse(brief.formatGuidance)}</StatBlock>

              <div style={{ background: t.goldBg, border: "1px solid " + t.goldBorder, borderRadius: 11, padding: "12px 14px", marginBottom: 14 }}>
                <div style={gSL(t)}>What would prove this wrong</div>
                <div style={{ fontSize: 13, color: t.text, fontFamily: t.serif, lineHeight: 1.6 }}>{renderProse(brief.wouldFalsify)}</div>
              </div>

              {(brief.claimsToVerify || []).length > 0 && (
                <div style={{ background: t.warnBg, border: "1px solid " + t.warnBorder, borderRadius: 11, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={gSL(t)}>Claims to verify before this runs</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: t.text, lineHeight: 1.6 }}>
                    {brief.claimsToVerify.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {brief.evidenceGaps && (
                <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, fontStyle: "italic" }}>
                  Evidence gap: {brief.evidenceGaps}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Production ledger. What this initiative's creative has cost to make, and
          whether what is on screen will survive a reload. Both are stated before
          the generate buttons rather than discovered afterwards: a frame the
          operator believes is saved and is not is the expensive kind of surprise,
          and production cost belongs in the denominator of a product whose whole
          thesis is calibration. */}
      {brief && (() => {
        const spend = costForInitiative(assets, selId);
        if (!spend.count && durableBytes) return null;
        return (
          <div style={{ ...gCd(t), marginBottom: 14, display:"flex", gap:16, flexWrap:"wrap", alignItems:"baseline" }}>
            {spend.count > 0 && (
              <div style={{ fontSize:12, color:t.textSub, fontFamily:t.sans }}>
                <strong style={{ color:t.text, fontFamily:t.sans }}>{usd(spend.usd)}</strong> to produce{" "}
                {spend.count} asset{spend.count === 1 ? "" : "s"} for this initiative
                {spend.unpriced > 0 && (
                  <span style={{ color:t.textMuted }}>
                    {" "}· {spend.unpriced} unpriced, so the real figure is higher
                  </span>
                )}
              </div>
            )}
            {!durableBytes && (
              <div style={{ fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5, flex:"1 1 320px" }}>
                Generated frames are held for this tab only and are gone on reload — {durableUnavailableReason()}. What
                each generation was, its prompt, model, cost and ad name, is recorded either way.
              </div>
            )}
          </div>
        );
      })()}

      {/* Variants */}
      {brief && (
        <div style={{ ...gCd(t) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ ...gSL(t), marginBottom: 0 }}>Variants</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {variants.length > 0 && imageControls}
              {videoOn && (
                <>
                  <label style={{ fontSize: 12, color: t.textSub }}>Video</label>
                  <select value={tierKey} onChange={e => setTierKey(e.target.value)} style={{ ...gSl(t), width: 178, padding: "6px 8px" }}
                    title={VIDEO_TIERS[tierKey].blurb}>
                    {VIDEO_TIER_LIST.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                  </select>
                  {voices.length > 0 && (
                    <>
                      <label style={{ fontSize: 12, color: t.textSub }}>Voice</label>
                      <select value={voiceId} onChange={e => setVoiceId(e.target.value)} style={{ ...gSl(t), width: 150, padding: "6px 8px" }}
                        title={tierKey === "CUSTOM_VOICE"
                          ? "This ElevenLabs voice reads both the audition and the actual Custom voice render."
                          : "The voice an audition is read in. Auditions are not renders — nothing is kept, and Standard/Premium renders do not use it."}>
                        {voices.map(v => (
                          <option key={v.voiceId} value={v.voiceId}>
                            {v.name}{v.accent ? ` · ${v.accent}` : ""}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {/* HeyGen's own voice catalogue is a different id space from the
                      ElevenLabs picker above — an ElevenLabs voice only reaches HeyGen
                      if it was imported as a third-party voice in HeyGen's own
                      dashboard, which mints a HeyGen-native id. There is no API this
                      app can call to list those, so it is a free-text field rather
                      than a select: paste the id HeyGen's Studio shows you. Empty
                      means HeyGen's default voice, same as before this existed. */}
                  {tierKey === "STANDARD" && (
                    <>
                      <label style={{ fontSize: 12, color: t.textSub }}>HeyGen voice ID</label>
                      <input value={heygenVoiceId} onChange={e => setHeygenVoiceId(e.target.value)}
                        placeholder="optional" style={{ ...gSl(t), width: 130, padding: "6px 8px" }}
                        title="A voice id from HeyGen's own catalogue — including any ElevenLabs voice you've imported there under Integrate 3rd Party Voice. Leave blank for HeyGen's default." />
                    </>
                  )}
                </>
              )}
              <label style={{ fontSize: 12, color: t.textSub }} title="The channel the next set is written and named for. A set already produced keeps its own.">Channel</label>
              <select value={channel} onChange={e => { setChannel(e.target.value); setEdits({}); }} style={{ ...gSl(t), width: 118, padding: "6px 8px" }}>
                {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <label style={{ fontSize: 12, color: t.textSub }}>Per angle</label>
              <select value={perAngle} onChange={e => setPerAngle(Number(e.target.value))} style={{ ...gSl(t), width: 62, padding: "6px 8px" }}>
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {variants.length > 0 && <button onClick={copyNames} style={gGh(t)} title="Copies every ad name and freezes this set.">Copy names</button>}
              {variants.length > 0 && <button onClick={exportCSV} style={gGh(t)} title="Every field and every level's name. Freezes this set.">Export CSV</button>}
              {variants.length > 0 && <button onClick={exportCreatorBrief} style={gGh(t)} title="One printable page per variant, with the exact ad name to deliver under. Freezes this set.">Creator brief</button>}
              <button onClick={runVariants} disabled={busy === "variants"} style={{ ...(variants.length ? gGh(t) : gG(t)), opacity: busy === "variants" ? 0.6 : 1 }}>
                {busy === "variants" ? "Producing…" : variants.length ? "New set" : "Produce variants"}
              </button>
            </div>
          </div>

          {variants.length === 0 && (
            <div style={{ fontSize: 13, color: t.textMuted, fontFamily: t.serif }}>
              No variants yet. Producing them turns each angle above into named, shootable assets — hooks, beats with
              on-screen text, and the platform's ad copy — and a review pass scores each one before anything ships.
            </div>
          )}

          {/* The set's state, before its contents. */}
          {variants.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              {frozen ? (
                <div style={{ padding: "9px 12px", borderRadius: 10, background: t.tealBg, border: "1px solid " + t.teal, fontSize: 12.5, color: t.text, lineHeight: 1.55 }}>
                  <strong>Shipped {fmtDate(String(set.shippedAt).slice(0, 10), settings)}.</strong> This set's names, hooks and copy are frozen — they are
                  what went out, and the record of what each ad said. Produce a new set to change anything.
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: t.textMuted, fontFamily: t.serif, lineHeight: 1.55 }}>
                  Set v{set?.version || record?.variantsVersion || 1} for {viewChannel}. Edit slots and take review suggestions freely until the
                  names leave the studio — copying, exporting, a creator brief or a static ad freezes the set, so the ad name and
                  the words behind it can never drift apart.
                </div>
              )}
              {(set?.failedAngles || failedAngles).length > 0 && (
                <div style={{ fontSize: 12, color: t.warn, lineHeight: 1.5 }}>
                  No variants for {(set?.failedAngles || failedAngles).map(f => f.label || f.slug).join(", ")} — {(set?.failedAngles || failedAngles)[0].error} Produce a new set to try again.
                </div>
              )}
              {critiqueBusy && <div style={{ fontSize: 12, color: t.textSub }}>Reviewing the set…</div>}
              {critiqueErr && (
                <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
                  {critiqueErr}{" "}
                  {!frozen && <button onClick={() => runCritique(variants)} style={{ ...gGh(t), padding: "2px 8px", fontSize: 11 }}>Review again</button>}
                </div>
              )}
              {!critiqueBusy && !critiqueErr && !set?.critique && !frozen && (
                <div><button onClick={() => runCritique(variants)} style={{ ...gGh(t), padding: "4px 10px", fontSize: 11.5 }}>Review this set</button></div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            {variants.map((v, i) => {
              const nameSet = nameSetFor(v, i);
              const values  = valuesFor(v, i);
              return (
                <div key={i} style={{ border: "1px solid " + t.border, borderRadius: 12, padding: "14px 16px", background: t.surfaceAlt }}>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ fontFamily: t.serif, fontSize: 15, fontWeight: 600, color: t.text }}>{v.label}</div>
                    <div style={{ fontFamily: t.sans, fontSize:12, color: t.textMuted}}>
                      {v.angleSlug}{v.varies ? " · varies: " + v.varies : ""}
                    </div>
                  </div>

                  {v.hook && (
                    <div style={{ margin: "10px 0", padding: "10px 12px", background: t.surface, border: "1px solid " + t.borderSoft, borderRadius: 9 }}>
                      <div style={gSL(t)}>Hook</div>
                      <div style={{ fontSize: 13.5, color: t.text, fontFamily: t.serif, lineHeight: 1.5 }}>“{v.hook}”</div>
                    </div>
                  )}
                  <AltHooks t={t} variant={v} />

                  <CritiqueNote t={t} note={set?.critique?.byIdx?.[i]} frozen={frozen}
                    onUseHook={() => applySuggestion(i, "hook")} onUseCopy={() => applySuggestion(i, "copy")} />

                  <BeatsTable t={t} variant={v} />
                  <CopyFields t={t} variant={v} channel={viewChannel} />

                  {v.cta && <div style={{ fontSize: 12.5, color: t.textSub, marginBottom: 4 }}><strong style={{ color: t.text }}>CTA.</strong> {v.cta}</div>}
                  <VocQuotes t={t} snippets={vocSnippets} ids={v.vocCited} />
                  {v.rationale && <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, marginBottom: 12 }}>{v.rationale}</div>}

                  {/* Key frame. The prompt is assembled from the approved brief
                      rather than typed, and is inspectable before spending —
                      an image call is a fixed few cents, unlike a text call. */}
                  {(() => {
                    const shot = roundAssets[i]?.image || null;
                    const shotUrl = shot ? imgUrls[shot.id] : null;
                    const refCount = Math.min((brand?.referenceImages || []).length, MAX_REFERENCE_IMAGES);
                    const productCount = Math.min((product?.images || []).length, MAX_PRODUCT_IMAGES);
                    return (
                  <div style={{ margin:"12px 0", padding:"11px 12px", background:t.surface, border:"1px solid "+t.borderSoft, borderRadius:10 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:9, flexWrap:"wrap" }}>
                      <div style={{ ...gSL(t), marginBottom:0 }}>Key frame</div>
                      <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
                        <button onClick={() => setPromptPreview(promptPreview?.idx === i ? null : { idx:i, text:buildImagePrompt(brief, v, brand, { referenceCount: refCount, productReferenceCount: productCount, product }) })}
                          style={{ ...gGh(t), padding:"5px 9px", fontSize:11 }}>
                          {promptPreview?.idx === i ? "Hide prompt" : "See prompt"}
                        </button>
                        {shotUrl && (
                          <button onClick={() => downloadImage(v, i)} style={{ ...gGh(t), padding:"5px 9px", fontSize:11 }}>Download</button>
                        )}
                        <button onClick={() => genImage(v, i)} disabled={imgBusy !== null}
                          style={{ ...(shot ? gGh(t) : gG(t)), padding:"5px 11px", fontSize:11.5, opacity: imgBusy !== null ? 0.55 : 1 }}>
                          {imgBusy === i ? "Generating…" : shot ? "Regenerate" : "Generate image"}
                        </button>
                      </div>
                    </div>

                    {promptPreview?.idx === i && (
                      <pre style={{ margin:"9px 0 0", padding:"9px 10px", background:t.surfaceAlt, border:"1px solid "+t.border,
                        borderRadius:8, fontSize:11, fontFamily:t.sans, color:t.textSub, whiteSpace:"pre-wrap", lineHeight:1.5, maxHeight:210, overflowY:"auto" }}>
                        {promptPreview.text}
                      </pre>
                    )}

                    {imgErr[i] && (
                      <div style={{ marginTop:9, fontSize:11.5, color:t.red, lineHeight:1.5 }}>{imgErr[i]}</div>
                    )}

                    {shot ? (
                      <div style={{ marginTop:10 }}>
                        {shotUrl ? (
                          <img src={shotUrl} alt={"Generated key frame for " + v.label}
                            style={{ maxWidth:"100%", width:260, borderRadius:9, border:"1px solid "+t.border, display:"block" }}/>
                        ) : (
                          // The record outlived its bytes. Said plainly rather
                          // than rendered as a broken image, because the record
                          // is still worth something: it carries the prompt, the
                          // model and the ad name this frame shipped under.
                          <div style={{ width:260, padding:"14px 12px", borderRadius:9, border:"1px dashed "+t.border,
                            background:t.surfaceAlt, fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5 }}>
                            Generated {fmtDate(shot.createdAt, settings)} — the image itself is no longer held, but the prompt,
                            model and ad name are recorded. Regenerate to get the frame back.
                          </div>
                        )}
                        <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.sans, marginTop:6 }}>
                          {shot.aspect} · {shot.costUsd != null ? usd(shot.costUsd) : "cost not recorded"} ·{" "}
                          {shot.bytesDurable ? "stored" : "this session only — download to keep it"}
                        </div>
                        {shot.adName && (
                          <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.sans, marginTop:3, wordBreak:"break-all" }}>
                            {shot.adName}
                          </div>
                        )}
                      </div>
                    ) : !imgErr[i] && (
                      <div style={{ marginTop:8, fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5 }}>
                        Generates the opening beat as a single frame, grounded in this brief.
                        {productCount > 0 && ` ${product.name}'s ${productCount === 1 ? "image is" : productCount + " images are"} attached as the product itself, so the frame shows the real item.`}
                        {refCount > 0 && ` ${refCount} brand style reference${refCount === 1 ? "" : "s"} will be attached, so the frame matches the rest of the campaign.`}
                        {" "}Invented text and unverified claims are excluded by construction — a static ad's words are drawn over the
                        frame afterwards, from this variant's approved copy.
                      </div>
                    )}

                    {/* The finished static ad: this frame, the variant's approved
                        words and the brand's logo, drawn in code. */}
                    {shot && shotUrl && (
                      <StaticAdComposer t={t} frame={shot} brand={brand} cta={v.cta}
                        lines={[
                          { label: "Headline", text: v.copy?.headline || "" },
                          { label: "Hook", text: v.hook || "" },
                          ...(v.altHooks || []).map((h, k) => ({ label: "Alt hook " + (k + 1), text: h })),
                        ].filter(l => l.text)}
                        disabled={!frozen && nameFor(v, i).errors.length > 0}
                        onExport={out => exportStatic(v, i, out)} />
                    )}
                  </div>
                    );
                  })()}

                  {/* Talking-head render. Unlike the key frame, the price is not
                      fixed — it is set by how long this variant's script takes
                      to say — so both tiers are priced here before the button is
                      pressed. That comparison is the whole reason the tier
                      picker is a choice rather than a setting. */}
                  {videoOn && (() => {
                    const vidScript = buildVideoScript(v);
                    const seconds   = estimateSpokenSeconds(vidScript);
                    const job       = roundAssets[i]?.video || null;
                    const rendering = vidBusy?.idx === i;
                    // D-ID and Fabric animate a still they fetch themselves; HeyGen
                    // does not need one. Checked here, before spend, rather than
                    // left to surface as the adapter's own 400 after the operator
                    // has already clicked render.
                    const needsAvatar = (tier.provider === "did" || tier.provider === "fabric") && !brand?.avatarImageUrl;
                    if (!vidScript) return null;
                    return (
                      <div style={{ margin:"12px 0", padding:"11px 12px", background:t.surface, border:"1px solid "+t.borderSoft, borderRadius:10 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:9, flexWrap:"wrap" }}>
                          <div style={{ ...gSL(t), marginBottom:0 }}>Talking head</div>
                          <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                            {/* Deliberately to the LEFT of the render button, and
                                deliberately in the same card. The decision this
                                supports is "is this read worth rendering", so it
                                belongs next to the thing it saves you buying —
                                not in a panel of its own where it reads as a
                                separate feature. */}
                            {voices.length > 0 && (
                              <button onClick={() => genAudition(v, i)} disabled={audBusy !== null || vidBusy !== null}
                                style={{ ...gGh(t), padding:"5px 11px", fontSize:11.5, opacity: (audBusy !== null || vidBusy !== null) ? 0.55 : 1 }}
                                title="Hear this script read aloud before paying to render it.">
                                {audBusy === i ? "Reading…" : auditions[i] ? "Re-read" : "Hear it"}
                              </button>
                            )}
                            <button onClick={() => genVideo(v, i)} disabled={vidBusy !== null || needsAvatar}
                              title={needsAvatar ? `${tier.label} animates a photo it fetches itself — set an avatar image URL on this brand in Settings first.` : undefined}
                              style={{ ...(job ? gGh(t) : gG(t)), padding:"5px 11px", fontSize:11.5, opacity: (vidBusy !== null || needsAvatar) ? 0.55 : 1 }}>
                              {rendering ? "Rendering…" : job ? "Regenerate" : "Generate video"}
                            </button>
                          </div>
                        </div>

                        {needsAvatar && (
                          <div style={{ marginTop:8, fontSize:11.5, color:t.warn, lineHeight:1.5 }}>
                            {tier.label} needs an avatar image URL — it animates a still it fetches itself rather than
                            offering stock avatars. Set one on this brand under Settings → Brands, or switch to Standard.
                          </div>
                        )}

                        {/* Priced before spend, all tiers, so the difference is
                            legible rather than something you learn afterwards. */}
                        <div style={{ marginTop:8, fontSize:11, fontFamily:t.sans, color:t.textMuted, display:"flex", gap:10, flexWrap:"wrap" }}>
                          <span>~{Math.round(seconds)}s spoken</span>
                          {VIDEO_TIER_LIST.map(x => (
                            <span key={x.key} style={{ color: x.key === tierKey ? t.gold : t.textMuted, fontWeight: x.key === tierKey ? 700 : 400 }}>
                              {x.key === tierKey ? "· " : ""}{x.key.toLowerCase()} {usd(estimateVideoCostUsd(vidScript, x))}
                            </span>
                          ))}
                          {/* Shown next to the render prices rather than on its
                              own, because the number that matters is the RATIO —
                              an audition priced in isolation looks like another
                              cost, and priced beside the render it is the reason
                              to press it first. Four decimals because a take runs
                              a fraction of what a render does and $0.08 rounded
                              to cents next to $4.20 hides the argument. */}
                          {voices.length > 0 && estimateVoiceCostUsd(vidScript) !== null && (
                            <span title="Cost to hear this script read aloud, against the cost of rendering it.">
                              · audition ${estimateVoiceCostUsd(vidScript).toFixed(4)}
                            </span>
                          )}
                        </div>

                        {audErr[i] && (
                          <div style={{ marginTop:9, fontSize:11.5, color:t.red, lineHeight:1.5 }}>{audErr[i]}</div>
                        )}

                        {auditions[i] && (
                          <div style={{ marginTop:9 }}>
                            <audio src={auditions[i].url} controls style={{ width:"100%", maxWidth:320, display:"block" }} />
                            <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.sans, marginTop:5 }}>
                              audition · {usd(auditions[i].costUsd || 0).replace("$0.00", "<$0.01")} · not kept on reload
                            </div>
                          </div>
                        )}

                        {rendering && (
                          <div style={{ marginTop:9, fontSize:11.5, color:t.textSub, lineHeight:1.5 }}>
                            Rendering on {tier.label} · {mmss(elapsedMs)} elapsed. Typically 1-3 minutes.
                            Leaving this view cancels the wait, not the render.
                          </div>
                        )}

                        {vidErr[i] && (
                          <div style={{ marginTop:9, fontSize:11.5, color:t.red, lineHeight:1.5 }}>{vidErr[i]}</div>
                        )}

                        {job && (
                          <div style={{ marginTop:10 }}>
                            {job.providerUrl ? (
                              <>
                                <video src={job.providerUrl} controls playsInline
                                  style={{ maxWidth:"100%", width:260, borderRadius:9, border:"1px solid "+t.border, display:"block", background:"#000" }} />
                                <div style={{ marginTop:8, padding:"8px 10px", borderRadius:8, background:t.warnBg, border:"1px solid "+t.warnBorder }}>
                                  <div style={{ fontSize:11.5, color:t.text, lineHeight:1.5 }}>
                                    <strong>Download this now.</strong> The link is a signed provider URL that expires in 24-72 hours, and nothing
                                    here keeps a copy. Once it lapses the clip is gone and re-rendering costs {usd(job.costUsd || 0)} again.
                                  </div>
                                  <a href={job.providerUrl} target="_blank" rel="noreferrer" download
                                    style={{ ...gGh(t), padding:"5px 9px", fontSize:11, display:"inline-block", marginTop:7, textDecoration:"none" }}>
                                    Download video
                                  </a>
                                </div>
                              </>
                            ) : (
                              // The record survived the link, which is the whole
                              // point of recording at submit: the render was paid
                              // for and is still attributable, even though the
                              // provider's URL has lapsed or never arrived.
                              <div style={{ width:260, padding:"14px 12px", borderRadius:9, border:"1px dashed "+t.border,
                                background:t.surfaceAlt, fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5 }}>
                                Rendered {fmtDate(job.createdAt, settings)}{job.jobId ? ` · job ${job.jobId}` : ""}. The provider link is no
                                longer held here — collect it from the provider's dashboard, or regenerate.
                              </div>
                            )}
                            <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.sans, marginTop:6 }}>
                              {job.provider} · {job.durationSeconds ? Math.round(job.durationSeconds) + "s" : "~" + Math.round(seconds) + "s est."} · ~{usd(job.costUsd || 0)}
                            </div>
                          </div>
                        )}

                        {!job && !rendering && !vidErr[i] && (
                          <div style={{ marginTop:8, fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5 }}>
                            Reads this variant's own approved script, unchanged — the hook and beats above, nothing rewritten. The clip
                            itself is not kept here and the provider's link expires, so download what is worth keeping — but the render
                            is recorded against this variant either way.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Generated scene. The sibling of the key frame above, not of
                      the talking head: it answers "what does this hypothesis look
                      like, moving", where the render answers "what does this
                      script sound like from a person". Priced per clip because
                      the duration is asked for rather than implied by a script,
                      which is exactly why it is not a third video tier. */}
                  {videoOn && (() => {
                    const scenePrompt = buildScenePrompt(brief, v, brand, { durationSeconds: sceneDur });
                    const sceneModel  = modelFor("scene");
                    const sceneCost   = estimateSceneCostUsd(sceneModel, sceneDur);
                    const clip        = roundAssets[i]?.scene || null;
                    const generating  = sceneBusy?.idx === i;
                    if (!scenePrompt) return null;
                    return (
                      <div style={{ margin:"12px 0", padding:"11px 12px", background:t.surface, border:"1px solid "+t.borderSoft, borderRadius:10 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:9, flexWrap:"wrap" }}>
                          <div style={{ ...gSL(t), marginBottom:0 }}>Scene</div>
                          <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
                            <select value={sceneAspect} onChange={e => setSceneAspect(e.target.value)}
                              style={{ ...gSl(t), width:132, padding:"5px 7px", fontSize:11.5 }}>
                              {SCENE_ASPECTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                            </select>
                            <select value={sceneDur} onChange={e => setSceneDur(Number(e.target.value))}
                              style={{ ...gSl(t), width:72, padding:"5px 7px", fontSize:11.5 }}
                              title="Clip length. Duration times the model's rate is the price, so this is the spend control.">
                              {SCENE_DURATIONS.map(d => <option key={d} value={d}>{d}s</option>)}
                            </select>
                            <button onClick={() => genScene(v, i)} disabled={sceneBusy !== null}
                              style={{ ...(clip ? gGh(t) : gG(t)), padding:"5px 11px", fontSize:11.5, opacity: sceneBusy !== null ? 0.55 : 1 }}>
                              {generating ? "Generating…" : clip ? "Regenerate" : "Generate scene"}
                            </button>
                          </div>
                        </div>

                        {/* Priced before spend, like the render tiers above. The
                            duration select is the lever, so the number moves when
                            the operator moves it rather than after they commit. */}
                        <div style={{ marginTop:8, fontSize:11, fontFamily:t.sans, color:t.textMuted, display:"flex", gap:10, flexWrap:"wrap" }}>
                          <span>{sceneDur}s clip</span>
                          <span style={{ color:t.gold, fontWeight:700 }}>
                            · {sceneCost === null ? "unpriced" : usd(sceneCost)}
                          </span>
                          <span>{sceneModel}</span>
                        </div>

                        {generating && (
                          <div style={{ marginTop:9, fontSize:11.5, color:t.textSub, lineHeight:1.5 }}>
                            Generating · {mmss(elapsedMs)} elapsed. Typically 1-3 minutes.
                            Leaving this view cancels the wait, not the job.
                          </div>
                        )}

                        {sceneErr[i] && (
                          <div style={{ marginTop:9, fontSize:11.5, color:t.red, lineHeight:1.5 }}>{sceneErr[i]}</div>
                        )}

                        {clip && (
                          <div style={{ marginTop:10 }}>
                            {sceneUrls[i] ? (
                              <>
                                <video src={sceneUrls[i]} controls playsInline
                                  style={{ maxWidth:"100%", width:260, borderRadius:9, border:"1px solid "+t.border, display:"block", background:"#000" }} />
                                <div style={{ marginTop:8, padding:"8px 10px", borderRadius:8, background:t.warnBg, border:"1px solid "+t.warnBorder }}>
                                  <div style={{ fontSize:11.5, color:t.text, lineHeight:1.5 }}>
                                    <strong>Download this now.</strong> Clip bytes are held for this session only and are gone on reload —
                                    the same rule the talking-head render follows, and for the same reason. Regenerating costs {usd(clip.costUsd || 0)} again.
                                  </div>
                                  <a href={sceneUrls[i]} download={`${(sel.initId || sel.id)}_${(v.label || "variant").replace(/\s+/g, "-")}_scene.mp4`}
                                    style={{ ...gGh(t), padding:"5px 9px", fontSize:11, display:"inline-block", marginTop:7, textDecoration:"none" }}>
                                    Download clip
                                  </a>
                                </div>
                              </>
                            ) : (
                              // Either the bytes were never held (reload), or the
                              // provider returned a GCS URI a browser cannot open.
                              // The record survived either way, which is the point
                              // of writing it at submit.
                              <div style={{ width:260, padding:"14px 12px", borderRadius:9, border:"1px dashed "+t.border,
                                background:t.surfaceAlt, fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5 }}>
                                Generated {fmtDate(clip.createdAt, settings)}. The clip is not held here{clip.providerUrl ? ` — collect it from ${clip.providerUrl}` : ""}.
                              </div>
                            )}
                            <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.sans, marginTop:6 }}>
                              {clip.model} · {clip.durationSeconds || sceneDur}s · ~{usd(clip.costUsd || 0)}
                            </div>
                          </div>
                        )}

                        {!clip && !generating && !sceneErr[i] && (
                          <div style={{ marginTop:8, fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5 }}>
                            Builds the shot from this variant's own approved brief — the opening beat, the promise and the proof — with no
                            on-screen text, no spoken dialogue, and nothing the brief flagged as unverified. Picture only; the words come
                            from the script above.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Slot editors. Controlled dimensions render as selects so an
                      off-vocabulary value cannot be introduced by hand; the
                      initiative slot is read-only because it comes from the
                      initiative, not from this form. */}
                  <div style={{ ...gSL(t), marginTop: 6 }}>Naming slots</div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(132px,1fr))", marginBottom: 10 }}>
                    {adTemplate.map(seg => {
                      const isInit = initKey && seg.key === initKey;
                      const value = isInit ? (tag || (schema.placeholder || NA)) : (values[seg.key] || "");
                      return (
                        <div key={seg.key}>
                          <label style={{ fontSize:12, fontFamily: t.sans, color: t.textMuted, display: "block", marginBottom: 3 }}>
                            {seg.label}
                          </label>
                          {isInit ? (
                            <div style={{ ...gI(t), background: t.surfaceAlt, color: t.textMuted, fontFamily: t.sans, fontSize: 12, cursor: "not-allowed" }} title="Set from the initiative's tracking tag">
                              {value}
                            </div>
                          ) : seg.vocab ? (
                            // Saved on change: an edited slot is part of the name
                            // the moment it renders, so it has to survive a reload.
                            <select value={value} disabled={frozen} onChange={e => commitNaming(i, seg.key, e.target.value)}
                              style={{ ...gSl(t), fontSize: 12, padding: "6px 8px", opacity: frozen ? 0.7 : 1 }}>
                              {!seg.vocab.includes(value) && <option value={value}>{value || "—"}</option>}
                              {seg.vocab.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            // Free text is saved when the field is left, not per keystroke.
                            <input value={value} disabled={frozen}
                              onChange={e => setEdits({ ...edits, [i]: { ...(edits[i] || {}), [seg.key]: e.target.value } })}
                              onBlur={() => { if (edits[i] && seg.key in edits[i]) commitNaming(i, seg.key, edits[i][seg.key]); }}
                              style={{ ...gI(t), fontSize: 12, padding: "6px 8px", fontFamily: t.sans, opacity: frozen ? 0.7 : 1 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Every level of the channel, projected from the one record
                      above. Showing them together is the point: it is how you
                      see that the campaign, ad set and ad names agree. */}
                  <div style={{ display: "grid", gap: 7 }}>
                    {nameSet.map(n => (
                      <div key={n.level}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ fontFamily: t.sans, fontSize:12, color: t.textMuted, minWidth: 62 }}>
                            {n.label}
                          </div>
                          <div style={{
                            flex: 1, fontFamily: t.sans, fontSize: 11.5, wordBreak: "break-all",
                            padding: "8px 10px", borderRadius: 8, background: t.surface,
                            border: "1px solid " + (n.errors.length ? t.warnBorder : t.border), color: t.text,
                          }}>
                            {n.name}
                          </div>
                        </div>
                        {n.errors.length > 0 && (
                          <ul style={{ margin: "5px 0 0 70px", paddingLeft: 16, fontSize: 11.5, color: t.warn, lineHeight: 1.5 }}>
                            {n.errors.map((e, j) => <li key={j}>{e}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <SetHistory t={t} record={record} settings={settings} current={set} />

          {record?.generatedAt && (
            <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.sans, marginTop: 14 }}>
              Last generated {fmtDate(record.generatedAt.slice(0, 10), settings)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
