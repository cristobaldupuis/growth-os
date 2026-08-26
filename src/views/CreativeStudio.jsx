import { useState, useMemo, useEffect, useRef } from "react";
import { gG, gGh, gSL, gCd, gI, gSl } from "../components/styles.js";
import { renderProse } from "../components/text.jsx";
import { SBdg, CBdg } from "../components/badges.jsx";
import { fmtDate } from "../constants.js";
import { resolveSchema, buildNameSet, templateFor, listChannels, listLevels, suggestTrackingTag, NA } from "../services/naming.js";
import { callCreativeBrief } from "../services/ai/callCreativeBrief.js";
import { callCreativeVariants } from "../services/ai/callCreativeVariants.js";
import { callGenerateImage, buildImagePrompt, IMAGE_ASPECTS } from "../services/ai/callGenerateImage.js";
import {
  callGenerateVideo, pollVideoJob, buildVideoScript, VIDEO_TIERS, VIDEO_TIER_LIST,
  estimateSpokenSeconds, estimateVideoCostUsd, VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_TIMEOUT_MS,
} from "../services/ai/callGenerateVideo.js";
import { mkAssetRecord, currentRoundAssets, imageCostUsd, costForInitiative } from "../services/assets.js";
import { putAsset, getAssetUrl, readAssetBytes, probeDurableStorage, durableUnavailableReason } from "../services/assetStore.js";
import { buildCreativeEvidence } from "../services/creativeEvidence.js";

// Kept in step with api/image.js. Exceeding it is refused upstream rather than
// silently truncated, so the picker never offers a fourth.
const MAX_REFERENCE_IMAGES = 3;

const usd = n => "$" + n.toFixed(2);
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
  };

  // A render outlives the view that started it. Invalidate on unmount so the
  // poll loop stops rather than running out its five minutes against a torn-down
  // tree, burning the video proxy's poll budget on a result nobody can see.
  useEffect(() => () => { videoRunId.current += 1; }, []);

  // A render takes 60-170s, so "rendering…" with no moving number reads as a
  // hang. The ticker is separate from the poll loop deliberately: polling every
  // second would burn the proxy's rate-limit budget for no new information,
  // but the elapsed clock has to move faster than the polls to look alive.
  useEffect(() => {
    if (!vidBusy) return;
    const id = setInterval(() => setElapsedMs(Date.now() - vidBusy.startedAt), 1000);
    return () => clearInterval(id);
  }, [vidBusy]);

  // Creative is produced at the ad level (message, for a channel with no ad
  // level), so that is the template the editors render.
  const adLevelKey = (schema.channels || []).find(c => c.id === channel)?.levels
    ?.find(l => l.key === "ad" || l.key === "message")?.key || "ad";
  const adTemplate = templateFor(schema, channel, adLevelKey);

  const sel     = items.find(e => e.id === selId) || null;
  const brand   = sel ? (brands.find(b => b.id === (sel.brandId || "default")) || brands[0]) : null;
  const record  = (creative || []).find(c => c.initiativeId === selId) || null;
  const brief   = record?.brief || null;

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

  const saveRecord = (patch) => {
    const rest = (creative || []).filter(c => c.initiativeId !== selId);
    onSaveCreative([{ ...(record || { initiativeId: selId }), ...patch, generatedAt: new Date().toISOString() }, ...rest]);
  };

  // Measured returns per creative dimension, from whatever performance has been
  // imported. This is the half of the evidence the brief never used to see: the
  // app could compute that one angle returned 2.1x and another 0.8x, and then
  // brief the next round without mentioning it.
  const evidence = useMemo(
    () => buildCreativeEvidence(perfRows, schema),
    [perfRows, schema]
  );

  const runBrief = async () => {
    if (!sel) return;
    setBusy("brief"); setErr("");
    try {
      const result = await callCreativeBrief(sel, brand, learningsIndex, settings, schema, undefined, { evidence });
      // Briefs are versioned, not overwritten. The previous behaviour replaced
      // `record.brief` in place, which destroyed its `wouldFalsify` — the one
      // field that makes a creative round settle a question. An initiative's
      // prediction is frozen at launch precisely so it can be checked later; the
      // brief that justified the creative deserves the same treatment, and
      // without it there is no way to tell whether the brief behind a winning ad
      // said something different from the one currently on file.
      const nextBriefVersion = (record?.briefVersion || 0) + 1;
      const history = [
        ...(record?.briefs || []),
        ...(record?.brief && !(record?.briefs || []).length
          // A record written before versioning existed carries only `brief`.
          // Fold it in as v1 rather than losing it.
          ? [{ version: record.briefVersion || 1, brief: record.brief, generatedAt: record.generatedAt || null }]
          : []),
      ];
      saveRecord({
        brief: result,
        briefVersion: nextBriefVersion,
        briefs: [...history, { version: nextBriefVersion, brief: result, generatedAt: new Date().toISOString() }],
        // A new brief invalidates the variants it was going to produce, so the
        // variant generation resets — but the assets already made against the
        // old pair keep their key and stay in the ledger.
        variants: [],
        variantsVersion: 0,
      });
      setEdits({});
      clearViewState();
      showToast(`Creative brief v${nextBriefVersion} generated.`, "success");
    } catch (e) { setErr(e.message || "Could not generate the brief."); }
    finally { setBusy(""); }
  };

  const runVariants = async () => {
    if (!sel || !brief) return;
    setBusy("variants"); setErr("");
    try {
      const result = await callCreativeVariants(brief, sel, brand, schema, { perAngle, channel });
      // Bumping the version is what keeps yesterday's frame from reappearing
      // under a variant that never asked for it — the old assets keep the old
      // key rather than being deleted to make the indices safe.
      saveRecord({ brief, variants: result, variantsVersion: (record?.variantsVersion || 0) + 1 });
      setEdits({});
      clearViewState();
      showToast(result.length + " variants generated.", "success");
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
  const nameSetFor = (variant, idx) => buildNameSet(valuesFor(variant, idx), schema, channel);
  const nameFor    = (variant, idx) =>
    nameSetFor(variant, idx).find(n => n.level === adLevelKey) || { name: "", errors: [] };

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

  /** Brand reference images, resolved to base64 for the image proxy. Absent when
   *  the brand has none, which is the ordinary case before anyone uploads one. */
  const loadReferences = async () => {
    const refs = (brand?.referenceImages || []).slice(0, MAX_REFERENCE_IMAGES);
    if (!refs.length) return [];
    const resolved = await Promise.all(refs.map(readAssetBytes));
    // A reference whose bytes are gone is skipped rather than failing the
    // generation — a missing style reference degrades the frame, it does not
    // invalidate the brief behind it.
    return resolved.filter(Boolean);
  };

  const genImage = async (variant, idx) => {
    setImgBusy(idx);
    setImgErr({ ...imgErr, [idx]: "" });
    try {
      const references = await loadReferences();
      const prompt = buildImagePrompt(brief, variant, brand, { referenceCount: references.length });
      // No explicit model: the `image` feature group decides, so repointing image
      // generation in the admin console reaches this button. It defaults to
      // IMAGE_MODELS.FAST, which is what this call passed before routing existed.
      // `initiativeId` is what lands this generation's cost in the spend ledger
      // against the experiment that caused it, so a round of creative can be
      // costed alongside the revenue it is being judged on.
      const img = await callGenerateImage({ prompt, aspectRatio: aspect, referenceImages: references, initiativeId: selId });

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
      setImgErr({ ...imgErr, [idx]: e.message || "Could not generate an image." });
    } finally { setImgBusy(null); }
  };

  // Resolve URLs for assets from a previous session. A record whose bytes are
  // gone resolves to null and renders as a record without a picture, which is
  // the honest state rather than a broken image icon.
  useEffect(() => {
    let live = true;
    const pending = Object.values(roundAssets)
      .map(slot => slot.image)
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
  }, [roundAssets]);

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
      const { jobId, provider } = await callGenerateVideo({ script, cta: variant.cta, aspectRatio: aspect, tier, initiativeId: selId });
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

  const downloadImage = (variant, idx) => {
    const asset = roundAssets[idx]?.image;
    const url = asset && imgUrls[asset.id];
    if (!url) return;
    const ext = (asset.mimeType || "image/png").split("/")[1] || "png";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(sel.initId || sel.id)}_${(variant.label || "variant").replace(/\s+/g, "-")}_${String(asset.aspect || "").replace(":", "x")}.${ext}`;
    a.click();
  };

  const assignTag = () => {
    const suggested = suggestTrackingTag(sel, schema);
    if (!suggested) { showToast("Could not derive a tracking tag for this initiative.", "error"); return; }
    onSaveItems(items.map(e => e.id === sel.id ? { ...e, trackingTag: suggested } : e));
    showToast(`Tracking tag set to ${suggested}. Every ad name here now carries it.`, "success");
  };

  const variants = record?.variants || [];

  const copyNames = () => {
    const lines = variants.map((v, i) => nameFor(v, i).name).join("\n");
    navigator.clipboard?.writeText(lines)
      .then(() => showToast(variants.length + " ad names copied.", "success"))
      .catch(() => showToast("Could not copy to clipboard.", "error"));
  };

  // Exports every level's name, not just the ad's — the campaign and ad set rows
  // are what someone actually needs when building the structure in the platform.
  const exportCSV = () => {
    const levels = listLevels(schema, channel);
    const cols = [
      "label", "angleSlug", "varies", "hook", "cta",
      ...adTemplate.map(d => d.key),
      ...levels.map(l => l.key + "Name"),
    ];
    const esc = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = variants.map((v, i) => {
      const values = valuesFor(v, i);
      const set = nameSetFor(v, i);
      return [
        v.label, v.angleSlug, v.varies, v.hook, v.cta,
        ...adTemplate.map(d => values[d.key] || ""),
        ...levels.map(l => set.find(s => s.level === l.key)?.name || ""),
      ].map(esc).join(",");
    });
    const csv = [cols.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creative_${(sel.initId || sel.id)}_${channel}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 60px" }}>

      {/* Header */}
      <div style={{ margin: "22px 0 18px" }}>
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
                  Tracking tag <code style={{ fontFamily: t.mono, fontWeight: 700 }}>{tag}</code> — every ad name below ends with it,
                  so performance rows carrying this tag join back to this initiative.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12.5, color: t.text, flex: "1 1 340px" }}>
                    No tracking tag set. Assets will be named <code style={{ fontFamily: t.mono }}>…{schema.delimiter}{schema.placeholder || NA}</code> and
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: brief ? 16 : 0 }}>
            <div style={{ ...gSL(t), marginBottom: 0 }}>Creative brief</div>
            <button onClick={runBrief} disabled={busy === "brief"} style={{ ...(brief ? gGh(t) : gG(t)), opacity: busy === "brief" ? 0.6 : 1 }}>
              {busy === "brief" ? "Briefing…" : brief ? "Regenerate brief" : "Generate brief"}
            </button>
          </div>

          {brief && (
            <>
              <StatBlock t={t} label="Insight">{renderProse(brief.insight)}</StatBlock>
              <StatBlock t={t} label="Promise">{renderProse(brief.promise)}</StatBlock>

              {(brief.proof || []).length > 0 && (
                <StatBlock t={t} label="Proof on screen">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {brief.proof.map((p, i) => <li key={i} style={{ marginBottom: 3 }}>{p}</li>)}
                  </ul>
                </StatBlock>
              )}

              <div style={{ ...gSL(t), marginTop: 4 }}>Angles to test</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", marginBottom: 16 }}>
                {(brief.angles || []).map((a, i) => (
                  <div key={i} style={{ background: t.surfaceAlt, border: "1px solid " + t.border, borderRadius: 11, padding: "12px 14px" }}>
                    <div style={{ fontFamily: t.mono, fontSize: 11, color: t.gold, fontWeight: 700, letterSpacing: "0.04em" }}>{a.slug}</div>
                    <div style={{ fontFamily: t.serif, fontSize: 14, fontWeight: 600, color: t.text, margin: "3px 0 6px" }}>{a.label}</div>
                    <div style={{ fontSize: 12.5, color: t.textSub, lineHeight: 1.55, marginBottom: 7 }}>{a.theory}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>{a.execution}</div>
                    {a.openingBeat && (
                      <div style={{ fontSize: 12, color: t.text, marginTop: 8, paddingTop: 8, borderTop: "1px solid " + t.borderSoft }}>
                        <span style={{ ...gSL(t), display: "inline", marginRight: 6 }}>First 3s</span>{a.openingBeat}
                      </div>
                    )}
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
                <strong style={{ color:t.text, fontFamily:t.mono }}>{usd(spend.usd)}</strong> to produce{" "}
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
              <label style={{ fontSize: 12, color: t.textSub }}>Frame</label>
              <select value={aspect} onChange={e => setAspect(e.target.value)} style={{ ...gSl(t), width: 132, padding: "6px 8px" }}>
                {IMAGE_ASPECTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <label style={{ fontSize: 12, color: t.textSub }}>Video</label>
              <select value={tierKey} onChange={e => setTierKey(e.target.value)} style={{ ...gSl(t), width: 178, padding: "6px 8px" }}
                title={VIDEO_TIERS[tierKey].blurb}>
                {VIDEO_TIER_LIST.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
              <label style={{ fontSize: 12, color: t.textSub }}>Channel</label>
              <select value={channel} onChange={e => { setChannel(e.target.value); setEdits({}); }} style={{ ...gSl(t), width: 118, padding: "6px 8px" }}>
                {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <label style={{ fontSize: 12, color: t.textSub }}>Per angle</label>
              <select value={perAngle} onChange={e => setPerAngle(Number(e.target.value))} style={{ ...gSl(t), width: 62, padding: "6px 8px" }}>
                {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {variants.length > 0 && <button onClick={copyNames} style={gGh(t)}>Copy names</button>}
              {variants.length > 0 && <button onClick={exportCSV} style={gGh(t)}>Export CSV</button>}
              <button onClick={runVariants} disabled={busy === "variants"} style={{ ...(variants.length ? gGh(t) : gG(t)), opacity: busy === "variants" ? 0.6 : 1 }}>
                {busy === "variants" ? "Producing…" : variants.length ? "Regenerate" : "Produce variants"}
              </button>
            </div>
          </div>

          {variants.length === 0 && (
            <div style={{ fontSize: 13, color: t.textMuted, fontFamily: t.serif }}>
              No variants yet. Producing them turns each angle above into named, shootable assets.
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
                    <div style={{ fontFamily: t.mono, fontSize: 10.5, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {v.angleSlug}{v.varies ? " · varies: " + v.varies : ""}
                    </div>
                  </div>

                  {v.hook && (
                    <div style={{ margin: "10px 0", padding: "10px 12px", background: t.surface, border: "1px solid " + t.borderSoft, borderRadius: 9 }}>
                      <div style={gSL(t)}>Hook</div>
                      <div style={{ fontSize: 13.5, color: t.text, fontFamily: t.serif, lineHeight: 1.5 }}>“{v.hook}”</div>
                    </div>
                  )}

                  {(v.script || []).length > 0 && (
                    <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 12.5, color: t.textSub, lineHeight: 1.6 }}>
                      {v.script.map((b, j) => <li key={j} style={{ marginBottom: 2 }}>{b}</li>)}
                    </ol>
                  )}

                  {v.cta && <div style={{ fontSize: 12.5, color: t.textSub, marginBottom: 4 }}><strong style={{ color: t.text }}>CTA.</strong> {v.cta}</div>}
                  {v.rationale && <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, marginBottom: 12 }}>{v.rationale}</div>}

                  {/* Key frame. The prompt is assembled from the approved brief
                      rather than typed, and is inspectable before spending —
                      an image call is a fixed few cents, unlike a text call. */}
                  {(() => {
                    const shot = roundAssets[i]?.image || null;
                    const shotUrl = shot ? imgUrls[shot.id] : null;
                    const refCount = Math.min((brand?.referenceImages || []).length, MAX_REFERENCE_IMAGES);
                    return (
                  <div style={{ margin:"12px 0", padding:"11px 12px", background:t.surface, border:"1px solid "+t.borderSoft, borderRadius:10 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:9, flexWrap:"wrap" }}>
                      <div style={{ ...gSL(t), marginBottom:0 }}>Key frame</div>
                      <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
                        <button onClick={() => setPromptPreview(promptPreview?.idx === i ? null : { idx:i, text:buildImagePrompt(brief, v, brand, { referenceCount: refCount }) })}
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
                        borderRadius:8, fontSize:11, fontFamily:t.mono, color:t.textSub, whiteSpace:"pre-wrap", lineHeight:1.5, maxHeight:210, overflowY:"auto" }}>
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
                        <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.mono, marginTop:6 }}>
                          {shot.aspect} · {shot.costUsd != null ? usd(shot.costUsd) : "cost not recorded"} ·{" "}
                          {shot.bytesDurable ? "stored" : "this session only — download to keep it"}
                        </div>
                        {shot.adName && (
                          <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.mono, marginTop:3, wordBreak:"break-all" }}>
                            {shot.adName}
                          </div>
                        )}
                      </div>
                    ) : !imgErr[i] && (
                      <div style={{ marginTop:8, fontSize:11.5, color:t.textMuted, fontFamily:t.serif, lineHeight:1.5 }}>
                        Generates the opening beat as a single frame, grounded in this brief. Text and unverified claims are
                        excluded from the image by construction — copy belongs in the ad tool, where it gets reviewed.
                        {refCount > 0 && ` ${refCount} brand reference image${refCount === 1 ? "" : "s"} will be attached, so the frame matches the rest of the campaign.`}
                      </div>
                    )}
                  </div>
                    );
                  })()}

                  {/* Talking-head render. Unlike the key frame, the price is not
                      fixed — it is set by how long this variant's script takes
                      to say — so both tiers are priced here before the button is
                      pressed. That comparison is the whole reason the tier
                      picker is a choice rather than a setting. */}
                  {(() => {
                    const vidScript = buildVideoScript(v);
                    const seconds   = estimateSpokenSeconds(vidScript);
                    const job       = roundAssets[i]?.video || null;
                    const rendering = vidBusy?.idx === i;
                    if (!vidScript) return null;
                    return (
                      <div style={{ margin:"12px 0", padding:"11px 12px", background:t.surface, border:"1px solid "+t.borderSoft, borderRadius:10 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:9, flexWrap:"wrap" }}>
                          <div style={{ ...gSL(t), marginBottom:0 }}>Talking head</div>
                          <button onClick={() => genVideo(v, i)} disabled={vidBusy !== null}
                            style={{ ...(job ? gGh(t) : gG(t)), padding:"5px 11px", fontSize:11.5, opacity: vidBusy !== null ? 0.55 : 1 }}>
                            {rendering ? "Rendering…" : job ? "Regenerate" : "Generate video"}
                          </button>
                        </div>

                        {/* Priced before spend, both tiers, so the difference is
                            legible rather than something you learn afterwards. */}
                        <div style={{ marginTop:8, fontSize:11, fontFamily:t.mono, color:t.textMuted, display:"flex", gap:10, flexWrap:"wrap" }}>
                          <span>~{Math.round(seconds)}s spoken</span>
                          {VIDEO_TIER_LIST.map(x => (
                            <span key={x.key} style={{ color: x.key === tierKey ? t.gold : t.textMuted, fontWeight: x.key === tierKey ? 700 : 400 }}>
                              {x.key === tierKey ? "· " : ""}{x.key.toLowerCase()} {usd(estimateVideoCostUsd(vidScript, x))}
                            </span>
                          ))}
                        </div>

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
                            <div style={{ fontSize:10.5, color:t.textMuted, fontFamily:t.mono, marginTop:6 }}>
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
                          <label style={{ fontSize: 10, fontFamily: t.mono, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
                            {seg.label}
                          </label>
                          {isInit ? (
                            <div style={{ ...gI(t), background: t.surfaceAlt, color: t.textMuted, fontFamily: t.mono, fontSize: 12, cursor: "not-allowed" }} title="Set from the initiative's tracking tag">
                              {value}
                            </div>
                          ) : seg.vocab ? (
                            <select value={value} onChange={e => setEdits({ ...edits, [i]: { ...(edits[i] || {}), [seg.key]: e.target.value } })}
                              style={{ ...gSl(t), fontSize: 12, padding: "6px 8px" }}>
                              {!seg.vocab.includes(value) && <option value={value}>{value || "—"}</option>}
                              {seg.vocab.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input value={value} onChange={e => setEdits({ ...edits, [i]: { ...(edits[i] || {}), [seg.key]: e.target.value } })}
                              style={{ ...gI(t), fontSize: 12, padding: "6px 8px", fontFamily: t.mono }} />
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
                          <div style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: "0.09em", textTransform: "uppercase", color: t.textMuted, minWidth: 62 }}>
                            {n.label}
                          </div>
                          <div style={{
                            flex: 1, fontFamily: t.mono, fontSize: 11.5, wordBreak: "break-all",
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

          {record?.generatedAt && (
            <div style={{ fontSize: 11, color: t.textMuted, fontFamily: t.mono, marginTop: 14 }}>
              Last generated {fmtDate(record.generatedAt.slice(0, 10))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
