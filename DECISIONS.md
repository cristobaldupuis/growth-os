# Growth OS — Decision Log

Architecture decisions worth remembering. The bar for this file is a real tradeoff, not a feature shipped. Bug fixes, refactors, and routine builds don't belong here.

---

## A learning can be retracted, and confidence is read from the graph rather than typed

**Decision:** Closed initiatives carry three relations on `results` — `supersedes`, `contradicts`, `confirms` — set by a person in the close flow. Everything else about a learning's standing is computed on read: `supersededBy` by inverting the stored edge, and a confidence *level* by walking the graph. No confidence field is stored anywhere.

**Why the edges are the only hand-entered part:** the roadmap's own "what not to build" note is right that a structured learning record with typed conditions, mechanism, freshness and applicability is a trap — the conditions a result held under are already on the parsed name, deriving them from the join is free and stays true, and asking a marketer to re-type them produces a second set that disagrees with the first and goes stale the same way the free text did. What a join cannot derive is that two results are *about the same belief*. "Discount creative wins on prospecting" and "discount creative underperforms on prospecting" are either one belief revised or two claims about different quarters, and no amount of category matching or embedding similarity settles which. That is the one thing a person knows and the model does not, so that is the only thing a person is asked for.

**Why only the forward edge is stored:** `supersededBy` could have been written to both records. Two rows that disagree about whether one retracts the other is a worse state than either answer alone, and there is no reconciliation rule that is obviously right. One writer, one direction, everything else derived.

**Why a third edge the roadmap did not ask for:** the spec required confidence "computed from the supporting and contradicting closed initiatives" and named no edge that could mark a supporter. The alternative was inferring support from category and outcome — asserting that two Successes in Retention are about the same belief, which they routinely are not. A confidence number built on that inference is exactly the hand-set field this work exists to remove, laundered through arithmetic to look derived. `confirms` is the same act as `contradicts` pointed the agreeing way, and it stays on the right side of the line: a relation only a person knows, not a description a person re-types.

**Why levels and not a percentage:** two experiments and one contradiction do not produce 67% of anything. A number that precise next to a belief invites being treated as a measurement, and the inputs do not support it. Five states — `retracted`, `contested`, `established`, `supported`, `provisional` — with `tracked` evidence weighted 1.0 and `backfilled` 0.5, so two remembered results cannot outvote one measured one. That weighting is the existing `provenance` distinction given a number rather than a new judgement.

**Two rules that carry the argument, both deliberate:**

1. **`contested` outranks any amount of support.** Averaging a contradiction away is precisely the confidently-wrong failure mode this exists to prevent. A reader shown "established" on a belief another experiment broke has been told the opposite of what the record says. Resolving a contradiction means someone deciding which result superseded which, and that stays a person's call.
2. **Retracted evidence props nothing up.** A superseded supporter is skipped when summing, so a belief cannot stay `established` on the strength of two results that were themselves retracted last quarter.

**Why retraction removes a learning from the index and not from the record:** a retracted belief is evidence about the business — it says the team believed something, acted on it, and was wrong, which is the calibration signal the whole prediction-snapshot apparatus exists to capture. Deleting it loses that. So the initiative and its result are untouched and only citation changes. The corollary is that every arithmetic surface keeps reading the record: win rates, category rollups and coverage counts are unaffected by retraction, because retracting a belief does not un-run the experiment that produced it.

**Where the citation ban had to be enforced, which was more places than the index:** `buildLearningsIndex` was the named target, but three other paths hand learnings to a model that cites them. The Learning Library's "Ask the library" corpus and its synthesis payload now exclude retracted entries. `get_failure_patterns` and the 90-day block in `buildPortfolioContext` are prose, and there the initiative stays listed with its learning explicitly marked retracted rather than dropped — "this was tried and it failed" is still true, and removing the row would hide the attempt along with the belief.

**Forcing condition:** if operators start using `contradicts` as a permanent state rather than a queue — contradictions accumulating and never being resolved into a supersession — then `contested` has become a shrug rather than a finding, and the agenda prompt is not doing its job. Revisit whether contradictions need an explicit resolution step with its own record.

---

## Marketers Lab is an expansion of Growth OS, not a second product

**Decision:** The Marketers Lab scope — tool integrations, campaign execution, creative direction, nomenclature-driven performance analysis, and campaign↔experiment linking — is built on this codebase and this data model. No new repository, no rewrite.

**Why:** The thing that would justify a rewrite is a wrong spine, and the spine is right. `initiative → hypothesis → predictionSnapshot (frozen at launch) → results → computePredictionError → learning library` is an experiment ledger with calibration already in it, and every item on the expansion list hangs off it rather than replacing it. Two pieces of the bridge were already built before the expansion was scoped: `measurementMetric` / `measurementScope` / `trackingTag` on every initiative (`mkDefault` in constants.js, commented "attribution socket"), and the ingestion decision below that normalises every source into one contract. Discarding that to start again would cost months and buy a worse version of what exists.

**What the expansion genuinely breaks, stated up front:**

1. **localStorage.** Running campaigns means Meta and Google OAuth, which means refresh tokens, which cannot live in a browser. This is not the soft forcing condition recorded below ("a client asks where their data lives") — it is a hard one that arrives with the first write-capable connector. Supabase stops being a later phase and becomes a prerequisite.
2. **The weekly-metrics contract.** `{date, brand, source, metrics:{}}` is one row per week per brand per source. Campaign analysis needs facts at campaign/adset/ad × day with parsed nomenclature dimensions. That is a new table, not a new field — and per the note below, the JSON-blob-per-key model does not survive it.
3. **Read versus write risk.** Every connector shipped so far reads. A bad read is a wrong chart; a bad write spends money. Write access is a different risk class and gets its own gate, recorded separately below.

**Positioning:** practice-first, product-shaped. Built for the operator's own consulting use, with every schema decision made multi-tenant-safe (tenant scoping present from the first migration, RLS policies written alongside the tables) so productising later is a policy change rather than a migration. The roughly 15% additional cost now is deliberately paid to avoid a rewrite at the point of highest inconvenience.

**Forcing condition:** none for the direction. If a genuinely different data model is ever needed — an entity that cannot be expressed as an initiative, a campaign, or a fact row — revisit before adding a fourth concept.

---

## Ad naming convention is data, and it is enforced in code rather than by prompt

**Decision:** The campaign nomenclature lives in `settings.namingSchema` as a list of segment definitions with controlled vocabularies. `src/services/naming.js` owns building, parsing, and validating names against it. AI calls that produce creative return segment *values*; the name string is always assembled by `buildName`.

**Why the schema is data:** an operator changing "add SweetRolls to the category list" should not be a deploy, and a multi-tenant deployment needs one schema per tenant rather than one per build. Making it a settings field gets both. Settings saved before the field existed resolve to the shipped default through `resolveSchema` rather than requiring a migration — the same optional-with-fallback shape as the per-brand North Star, chosen for the same reason.

**Why the model never writes the name:** a convention maintained by asking a model nicely holds until the one generation where it doesn't, and a single malformed name silently mis-attributes every performance row it produces. The failure is not a parse error the operator would notice; it is wrong data that looks right. Assembling the name in code from validated segments makes that class of failure unreachable. For the same reason the model is never given the initiative's `trackingTag` and never asked to produce one — the caller stamps it. The source spec sheet says it directly: "never invent one." An invented tag is worse than an absent one, because it looks like a tracked experiment and joins to nothing.

**Why positional parsing refuses rather than guesses:** a name with the wrong segment count cannot be aligned, and any alignment picked would be a coin flip. `parseName` returns no values at all in that case. A wrong-but-plausible parse is worse than an unparsed row, because the unparsed row is counted and reported while the mis-parsed one enters the analysis silently. The same principle governs `breakdownBySegment`, which reports `unparsed` alongside the groups — a breakdown that quietly excludes a third of spend is worse than one that admits it.

**One finding worth recording:** the source spec sheet's declared Campaign vocabulary (`R1–R5, Evergreen, Generic, Promo`) does not cover its own rows, which also use `Donuts` and `FreeSample` as launch buckets. The shipped default encodes what is actually in use rather than what was written down, because validating live correct data as broken on first run is how a validation layer gets turned off.

**Forcing condition:** when a second channel with a materially different entity hierarchy is added (Google's campaign → ad group → ad, versus Meta's campaign → ad set → ad), the schema needs a level dimension so one convention can describe names at three levels. The segment list shape already accommodates it; the resolution logic does not yet.

---

## Custom naming variables are an overlay, and a placed one is appended rather than inserted

**Decision:** A company's own naming dimensions live in `settings.namingCustom`
— `{dimensions:[…], vocabAdditions:{…}}` — and are merged into the schema by
`resolveSchema` at read time. They are not written into `settings.namingSchema`.
A custom dimension placed into a template is appended to the end of it; the
editor offers no way to insert one mid-string or to reorder existing slots.

**Why an overlay and not an edit to the schema:** the shipped registry is still
being improved — a hint rewritten, a vocabulary corrected against what is
actually in use. A workspace that saved a full schema copy and then edited it
would be frozen at the version it copied, and would need a migration to receive
anything after it. Keeping the operator's additions in a separate key means both
layers move independently and neither needs one. It is the same reasoning that
made `FAMILY_OF` a side map rather than a `family` field on every dimension, and
the same optional-with-fallback shape as the per-brand North Star.

**Why appended and never inserted:** both change the slot count of names already
live in the ad account, so neither is free — but they fail in different classes.
An appended slot leaves an older name one segment short, and `parseName` refuses
a slot-count mismatch outright: the row is counted, reported as unparsed, and
excluded from breakdowns until it is rebuilt. An inserted slot leaves the count
plausible and shifts every value after the insertion point one dimension to the
left, producing a name that parses cleanly into wrong answers and enters the
analysis silently. The first is an outage the operator can see; the second is a
quiet corruption of the number they are about to make a decision on. Where those
are the two options, the loud one wins — the same rule that governs positional
parsing refusing to guess at an alignment.

**Why the vocabulary and the dimension are separate additions:** adding a value
to a controlled list is genuinely free — vocabularies are membership tests, and
a longer list accepts more names while invalidating none of the ones already
built. It is also the more common need, since "a new campaign brought a theme
the list has never had to describe" happens far more often than "this business
plans along an axis the registry does not model". Putting the safe operation one
click away on the row it applies to, and the consequential one behind a form
that states the slot-count change before it saves, matches the cost of each.

**What is deliberately not editable:** shipped dimensions cannot be removed or
renamed, and slot order cannot be changed. Removing `geo` would orphan every
name already carrying it, and reordering would rewrite the meaning of every name
in the account — neither has a safe answer that does not involve renaming live
entities, which resets their learning phase. The absence is the decision, not an
omission.

**Forcing condition:** when a deployment needs a *second* convention rather than
an extended one — an agency whose client uses a different delimiter or a
genuinely different slot order — the overlay stops being the right shape and the
schema needs to be selectable per brand rather than per workspace.

---

## One importer, two shapes, routed by the file's own headers

**Decision:** The metrics importer accepts both the weekly-brand contract and a
campaign-level ad platform export. Which one a file is gets decided by
`detectCsvShape` reading its headers, not by asking the operator to choose an
importer first. Campaign rows land in their own store (`KEY_PERF`) rather than
being coerced into `{date, brand, source, metrics:{}}`.

**Why not one widened contract:** the weekly shape is one row per week per brand
per source, and its dimensions are columns. A campaign export is one row per
entity per day, and its dimensions are not columns at all — they are positions
inside a string. Widening the weekly contract to hold it would either drop the
name (and with it every dimension the import exists to recover) or redefine
`brand` as a name field it isn't. Two shapes behind one entry point costs a
detector; one shape holding both costs the meaning of every field.

**Why detection rather than a picker:** the operator does not experience these as
two importers. They experience it as the CSV they just downloaded. Detection is
also cheap to make safe — the preview names the shape it detected, the channel
it parsed against, and how many rows parsed, all before anything is written. An
import that resolves 3 of 400 names is almost always the wrong channel, and that
is a thirty-second fix at the preview and a wrong dashboard afterwards.

**Why the level comes from the header and the channel from the operator:** a Meta
ad-level export carries campaign, ad set and ad name columns, so the header
already says which template each name was built from — the finest-grained column
present is the row's identity. The channel it can't know, so it is asked for, and
`parseName` runs against a known (channel, level) rather than `identifyName`
guessing between templates that share a slot count. Detection is still offered
and still refuses to resolve an ambiguous name, per the parsing decision above.

**What this deliberately does not fix:** the storage. Rows are capped at 5,000 in
`localStorage`, oldest dropped on merge with the count reported rather than
truncated quietly. A month of ad-level Meta data does not fit in a browser and no
amount of care makes it fit — the durable answer is the Phase 5.3 fact table.
Shipping the read path first is the point: parsing, attribution and the pivot are
proven against real exports now, so the migration later moves where rows live
without re-deriving any of the logic that reads them.

**Forcing condition:** the first operator who needs more than a few weeks of
ad-level history at once. That is Supabase, and it is the same piece of work as
the campaign fact model — not a bigger cap.

---

## Creative direction is briefed against an initiative, never standalone

**Decision:** The Creative Studio requires an initiative before it will brief anything, and only offers Draft or Running ones. Generated briefs carry `wouldFalsify` and `claimsToVerify` as required fields.

**Why:** creative generated without a hypothesis attached is the thing this product exists to replace. The value is not that a model can write ad scripts — everything can write ad scripts. It is that each round of assets is born attached to a question, carries the tracking tag that will let performance answer it, and states in advance what result would prove the direction wrong. A brief that cannot be wrong cannot teach anything, and a creative round that teaches nothing is indistinguishable from spend.

`claimsToVerify` exists because the highest-risk failure of AI-generated marketing copy is a confident unsupported product claim. The brief is instructed to route anything the brand brief does not support into that field instead of asserting it, which turns a compliance risk into a checklist the operator clears before shooting.

**Tier split, deliberately not uniform:** the brief runs on the reasoning tier and the variants on the structured tier. The brief has to decide which closed learnings genuinely bear on this hypothesis and which are superficially similar, which is evidence-weighing. The variants take fixed angles and fixed direction and turn them into scripts against a schema, which is transformation. This is the same test applied in the model-tiering decision below, not an exception to it.

**Forcing condition:** if creative production (actual asset generation, not direction) is added, the brief becomes an input to an external service and needs a stable versioned contract rather than a free-shaped object.

---

## localStorage over backend persistence (Postgres / Supabase)

**Decision:** All state persists in `localStorage` under versioned keys, with a memory fallback for sandboxed environments. No database, no backend persistence layer.

**Why:** The storage abstraction (`store.get` / `store.set`) is backend-agnostic by design. Migrating to Postgres is a layer swap when the trigger arrives — not a rewrite. The operational overhead of a real backend (connection strings per deployment, database migrations, auth, row-level policy) is not justified before there are clients generating the pain that demands it. Supabase account exists and RLS is the planned path; the decision is timing, not direction.

**Forcing condition:** A client explicitly objects to browser-local data, or data volume exceeds what localStorage can handle reliably at realistic initiative counts.

**Amendment — failure mode corrected.** The original implementation caught write errors and fell through to the in-memory object, so a full localStorage quota produced saves that appeared to succeed, survived navigation, and vanished on reload with nothing ever shown to the user. `store.set` now resolves `{ok, durable}` and reports failures through `onWriteError`, which raises a persistent banner offering an immediate backup. This does not change the decision above; it makes the decision's failure mode visible instead of silent, which is the condition under which "browser-local for now" is defensible at all.

---

## Supabase as the persistence target, not Mongo or a custom API

**Decision:** When the localStorage trigger fires, the destination is Supabase (Postgres + Row-Level Security + Auth), not MongoDB, not a hand-rolled API on top of some other store.

**Why:** The choice is really about what comes bundled, because the actual work in this migration is not storing rows — it is authentication and per-client isolation. Growth OS needs, in order: a login, hard tenant separation, and multi-device access to the same portfolio. Supabase provides auth and RLS as one system, so "this client's rows are visible only to this client's users" is a policy on a table rather than middleware to write, test, and be responsible for.

The data model also argues for Postgres. Initiatives, learnings, weekly metrics and debates are relational and get queried relationally — win rate by category, cross-brand gaps, contribution by category. Those are joins and aggregates. A document store would either denormalise them (and then need application-level consistency) or reimplement the joins in code. The existing shape is already a natural set of tables: `supabase/migrations/0001_init.sql` maps it out.

Mongo would be the right call if the schema were genuinely unstable or the write pattern were high-volume append-only. Neither describes this: the initiative shape has been stable for months, and a busy client generates tens of writes a day.

**What this costs:** the JSON-blob-per-key model in `store.js` doesn't survive contact with a relational schema — the swap is real work on the read paths, not a one-line adapter change. Budget for it accordingly rather than assuming the abstraction makes it free.

**Forcing condition:** the first client who needs a second user, a second device, or who asks where their data lives. Any one of those is the trigger; don't do it before one of them arrives.

---

## Ingestion: normalise to the weekly-metrics contract, integrate one source at a time

**Decision:** Keep CSV import as the permanent universal path, and add direct API pulls one connector at a time behind the same normalisation contract. Do not attempt a general "connect all your platforms" integration layer.

**Why:** Shopify, GA4, Meta and Google Ads are four different auth models, four rate-limit regimes, four attribution definitions, and four sets of breaking changes to track. Building all four at once means owning an integrations product, which is a different business from the one being sold. It is also the classic way a consulting tool stops shipping.

The leverage is that all four already reduce to the same internal shape — `{date, brand, source, metrics:{}}` — which the CSV importer and `METRIC_CSV_ALIASES` already implement. A direct API connector is therefore a fetch plus a field mapping into an existing contract, not new architecture. That contract is the asset; the connectors are interchangeable.

Sequence, by ratio of value to integration pain:

1. **Shopify** first. One OAuth app, a stable Admin API, and it owns the numbers that matter most (orders, revenue, AOV, returns, new vs returning). Highest value, lowest volatility.
2. **GA4** second, via the Data API. Sessions and funnel-stage CVR are what the funnel-coverage view is missing, and no other source has them.
3. **Meta and Google Ads** last, and only if a client actually asks. Spend and ROAS are already imported by CSV in about two minutes a week, both APIs change frequently, and attribution windows make the numbers argue with Shopify's in ways that need explaining. Low marginal value, high ongoing maintenance.

CSV stays regardless of how many connectors ship: it is the only path that works for a platform nobody has built a connector for, for a client whose IT won't grant API access, and for the operator pasting a number from a spreadsheet during a call.

**Forcing condition for each connector:** a client is manually exporting that specific source every week and says so. Not before.

---

## Generated images are session-only, and the second provider gets its own endpoint

**Decision:** Image generation runs through `api/image.js` — a separate serverless function from the Anthropic proxy, with its own model allowlist, its own rate-limit namespace, and a much lower ceiling. Generated images are held in React state for the session and never written to `store`. The operator downloads what is worth keeping.

**Why a second endpoint rather than a branch:** `api/proxy.js`'s `validateBody` requires `model`, `max_tokens` and `messages`. A Gemini image request has none of those. Making one function serve both would mean loosening the exact validation that *is* the Anthropic path's security control, to accommodate a request shape it will never see. Two endpoints, two tight contracts, is cheaper than one permissive one.

The client also sends `{model, prompt, aspectRatio}` rather than a provider-shaped body, and the endpoint constructs the upstream request itself. A caller therefore cannot smuggle through fields the endpoint doesn't know about — extra response modalities, tool declarations, or a `candidateCount` that multiplies the bill.

**Why the bounds are stricter than the text proxy's:** text is metered in fractions of a cent and bounded by `max_tokens`. An image is a fixed, much larger unit of spend with no equivalent dial — you cannot ask for a cheaper one. So the control is on count: one image per request, 25 per hour per IP against the text proxy's 60, and a separate Redis key namespace so image spend cannot exhaust or be exhausted by text calls.

**Why images are not persisted:** a 1024px PNG is comfortably over a megabyte base64-encoded, and `localStorage` caps around 5MB. Persisting two or three would exhaust the quota — reproducing precisely the silent data-loss failure `store.js` was rewritten to prevent, except this time it would take the entire portfolio down with it rather than one save. Session-only is not a limitation reluctantly accepted here; it is the only correct behaviour until there is somewhere else to put them.

**Forcing condition:** the first operator who needs a generated frame to survive a reload. The fix is blob storage (Supabase Storage or Vercel Blob) with the record holding a URL, not a bigger JSON blob — and it arrives with the Supabase migration rather than before it.

---

## Generated images may not carry text, and may not depict unverified claims

**Decision:** `buildImagePrompt` composes the prompt from the approved brief rather than a free-text box, and hard-codes two exclusions: no rendered text of any kind, and nothing from the brief's `claimsToVerify`.

**Why no text:** image models mangle typography, but the real problem is not aesthetic. Words a model invents become an unreviewed product claim sitting on an asset that looks finished, and the more convincing the render the less likely anyone re-reads it. Copy belongs in the ad tool, where it passes the same review as every other line.

**Why the claims exclusion:** `claimsToVerify` is the brief's list of things the creative wants to say that the brand brief does not support. Rendering one visually is the highest-risk failure mode available to AI creative — it launders an open question into something that looks settled, because it was drawn convincingly. The claims are named explicitly in the prompt as things not to imply, rather than merely omitted, since omission is not an instruction.

**Why the prompt is inspectable before generating:** an image call costs a fixed few cents where a text call costs a fraction of one, so "see prompt" is not a debugging affordance — it is the operator checking what they are about to buy.

---

## `npm test` globs rather than listing files

**Decision:** `node --test "src/**/*.test.js" "api/**/*.test.js"` replaces the hand-maintained list of 37 paths.

**Why:** the list was not wrong, it was silent. A test file has to be added in two places — written, then registered — and forgetting the second produces a file that passes when run directly and never runs in `verify` or CI. That is exactly what happened to `voice.test.js`: it shipped green, ran locally on demand, and contributed nothing to the suite until the next commit noticed the count had not moved. A test that does not run is worse than a missing one, because the repository reports coverage it does not have.

**Why this is safe rather than a widening:** the list and the filesystem were checked against each other before the swap and matched exactly — 37 files, 614 tests, no file deliberately excluded and none listed that no longer existed. The glob is the same suite today and stays the same suite when someone adds the thirty-eighth.

**The tradeoff accepted:** a glob will pick up a test file someone did not mean to run yet. That is the better failure — a WIP test that fails loudly in CI gets finished or deleted, while a real test nobody registered fails at nothing and is discovered by an outage.

## Scene generation is a separate group from video, not a third tier

**Decision:** Veo is reached through a `scene` feature group and `api/scene.js`, beside `image` rather than inside `video`. The `video` group now declares `requires: { lipSync: true }` and `scene` declares `requires: { sceneGen: true }`, so the console's two pickers cannot offer each other's models.

**Why not a third tier:** the tier decision this file already records is "is this clip worth nine times the money" — one question, two answers. Scene generation is a different question, and the giveaway is that its price is not computed the same way. A talking head costs what its script takes to *say* (`estimateSpokenSeconds`); a scene costs the duration you *ask for*. Putting both behind one picker would mean one of the two prices lying about how it was derived.

**Why `caps` rather than a new modality:** both produce video, and an operator asking what video cost this month means both — which is why `recordSceneUsage` keeps `modality: "video"` and separates on `group` instead. But `modality` alone was doing two jobs: it named the output format *and* was the only filter `modelsFor` applied. With one kind of video model in the catalogue those were the same set; with two they are not, and an empty `requires` on the video group stopped meaning "no constraint" and started meaning "a missing one". Stating both capabilities is what keeps the picker honest.

**Why Vertex specifically:** Veo is the one provider here whose bill can land on Google Cloud credits. The Developer API draws on an AI Studio balance that excludes them; Vertex bills the project's Cloud Billing account where they sit. `api/_geminiAuth.js` already minted the Vertex token for image generation, so this cost no new auth machinery — `geminiEndpoint` gained a `method` argument and nothing else changed. Auto-detect still applies: with only `GEMINI_API_KEY` set, scene generation works and simply does not touch the credits.

**Why `generateAudio` is forced off in the request rather than discouraged in the prompt:** Veo can invent its own spoken dialogue. `buildImagePrompt` and `buildVideoRequest` both refuse to render anything from `claimsToVerify` on the reasoning that an unverified claim inside a finished-looking asset launders an open question into something settled. Model-invented dialogue is that failure with no operator in the loop at all — nobody wrote the words and nobody reviewed them, and they arrive sounding authoritative. A prompt is a request; a parameter is a guarantee, so it is set in `buildVeoBody` and asserted in `scene.test.js`.

**What is not confirmed:** the per-second rates. Google's own documentation was unreachable when this shipped and secondary sources disagree by a factor of five. The catalogue figures are the most Vertex-specific available and carry `costBasis: "estimate"` like every other rate here — check them against a real invoice before trusting the pre-spend display.

## Video generation is sold as two priced tiers, not three providers

**Decision:** `VIDEO_TIERS` exposes exactly two choices — `STANDARD` (HeyGen, ~$0.017/sec) and `PREMIUM` (VEED Fabric 1.0 at 720p, $0.15/sec) — and both are priced against the actual script before the generate button is pressed. The provider id survives underneath as the wire value and the adapter-map key; it is simply not the thing the operator picks.

**Why not the provider list it started as:** the first draft exposed HeyGen / D-ID / Fabric directly, on the theory that an operator would want to A/B providers on a real script. That is the wrong unit of choice. What is actually being decided at the moment of spend is "is this clip worth nine times the money" — nobody has a view on D-ID's lip-sync model, and asking them to form one is how a picker becomes noise. Naming the tiers after the decision keeps the question answerable, and swapping the provider behind a tier stays a one-line change.

**Why D-ID is implemented but not a tier:** at August 2026 pricing it lands around $0.035/sec — above HeyGen without being visibly better. A third option nobody has a reason to pick is worse than two. The adapter stays so re-promoting it is one line if that inverts.

**Why cost is computed before submit rather than reported after:** a video's price is set by how long the script takes to say, so unlike an image it is neither fixed nor knowable from the button label. A tier picker showing two names and no numbers asks the operator to choose blind. The estimator (~150wpm, plus the beat pauses `buildVideoScript` inserts, floored at 3s) lives in `callGenerateVideo.js` and is *imported* by `api/video.js` rather than reimplemented there — one formula, so the figure shown before the click cannot drift from the figure logged against the job. It is a planning number, not a quote.

**Why VEED Fabric is reached through fal.ai:** there is no `api.veed.io` REST endpoint for Fabric — it is distributed through fal.ai's inference queue, auth is `Authorization: Key ...`, and the headline `veed/fabric-1.0` model takes image + *audio*, not a script. The script-native path is a separate sub-endpoint, `veed/fabric-1.0/text`. This app only ever has a script, so premium renders are that endpoint or nothing. `VEED_API_KEY` therefore holds a fal.ai key; it is named for the model because the model is what is being chosen.

**Why the browser drives the poll loop:** renders take 60-170 seconds. Holding a serverless function open that long exceeds Vercel's execution limit, so `api/video.js` has `submit` and `poll` actions and `CreativeStudio` owns the cadence (8s interval, 5min timeout). A timeout surfaces "still rendering, here is the job id" rather than an error — a slow render is not a failed one, and it has still been billed.

**Why video is not persisted, more strongly than images:** the same localStorage reasoning as generated images, except a rendered clip is 5-50MB rather than ~1MB, so it is not a quota risk but a certainty. Only the provider's signed URL is held, in session state, and nothing re-fetches the file into the app — re-hosting it would make this a video CDN with its own egress bill and retention policy. Provider links expire in 24-72h, so the UI says so at the point of completion rather than letting the operator discover it later.

**Forcing condition:** the same one as images, arriving sooner and harder. The first operator who needs a rendered clip to survive a reload needs blob storage; unlike images, they will hit it on their first genuinely good take rather than after a few.

**Unverified:** the D-ID and Fabric adapters are written from current provider documentation, not exercised against live credentials. Fabric's queue-lookup URLs drop the `/text` sub-path and address the base app id, which is fal's documented behaviour for models with variants and the likeliest thing here to break.

---

## Write access to ad platforms goes through a proposal gate, never a direct tool call

**Decision:** No AI path writes to Meta or Google Ads directly. Every mutation — create campaign, change budget, pause ad set — is produced as a *proposed change*, rendered as a diff against current live state, approved by a human, and then executed by a separate applier that writes an audit record. The proposer and the applier are different code paths with different credentials.

**Why:** every connector in the roadmap before this one reads. A bad read renders a wrong chart and the operator notices within a day. A bad write spends money immediately, at a rate bounded only by the account's daily cap, and is not reversible by editing the code that caused it. Those are different risk classes and collapsing them into "the agent has a tool" is how an experimentation tool becomes an incident.

The diff requirement is the substantive part, not the approval click. An approval prompt showing "Claude wants to update campaign 12345" carries no information; one showing `daily_budget: $400 → $1,200` and `status: PAUSED → ACTIVE` is a decision a human can actually make. Auto-approval is deliberately not offered at any spend level, because the threshold below which a wrong write is acceptable is not a number this system can know.

**What this costs:** the loop is slower than a direct tool call and it is more code — a proposal store, a differ against live state, an applier, an audit log. That is the intended trade. It is also the same shape that makes the feature sellable: an agency handing this to a client can show exactly what was changed, by whom, and what it was before.

**Forcing condition:** none that removes the gate. If proposal volume ever makes per-change approval impractical, the answer is batching approvals over a reviewed plan, not lowering the bar to auto-execution.

---

## Config-first per-client deployment (no multi-tenant auth)

**Decision:** Client context (brands, categories, agents, templates, seed data) lives in `config.js`, isolated from app logic. Each client gets a separate Vercel project with a `config.js` swap. No authentication layer, no shared database.

**Why:** Multi-tenant auth adds a meaningful infrastructure surface before there are multiple clients to justify it. The config-first model keeps deployments independent and debuggable, eliminates cross-client data risk entirely, and reduces onboarding to a single file change plus a Vercel project. The tradeoff is manual overhead at scale (4+ clients), at which point the trigger for a proper multi-tenant migration becomes obvious.

**Forcing condition:** Managing per-client config swaps and Vercel projects becomes operationally painful. The migration path is Supabase with Row-Level Security; the `store` abstraction means app logic doesn't change.

---

## Config indirection: a re-export barrel closes the single-file-swap gap

**Decision:** No app-logic file imports a `config.*.js` file directly. `src/App.jsx`, `src/constants.js`, `src/services/csv.js`, and `src/views/LearningLibrary.jsx` all import from `src/activeConfig.js`, a barrel that does nothing but `export * from "./config.[client].js"`. Switching which client is live is a one-line edit to that single file.

**Why:** The decision above ("Config-first per-client deployment") already claimed a single-file swap, and `config.js`'s own header comment said the same thing — but by the time a second client config existed, four separate files were importing `config.js` (or the client config) directly, each hand-edited during the last client swap. The claim was true when there was one config-importing file; it silently stopped being true as the app grew import sites, and nothing would have caught the drift except noticing the same edit four times. A barrel makes the single-file-swap property structural rather than a convention every future edit has to remember.

**Forcing condition:** None — this closes a gap in an existing decision rather than opening a new tradeoff. Revisit only if a future app-logic file has a genuine reason to bypass the active config (it shouldn't).

---

## Per-brand North Star: optional override with fallback, not a required field

**Decision:** Each entry in `BRANDS` can carry an optional `northStar: { metric, current, target }`. When a brand defines one, selecting that brand switches the dashboard's North Star card and Business Health tiles to it; when it doesn't, both fall back to the existing portfolio-level `settings.northStarMetric/Current/Target` unchanged. `current` is further overridden at runtime by a trailing-4-week revenue sum derived from that brand's own rows in `SEED_WEEKLY_METRICS` whenever any exist, in preference to either the brand's or the portfolio's hand-maintained string — a measured figure beats an authored one whenever both exist. The portfolio view's `current` is a live sum of all brands' derived figures rather than a separately maintained number; its `target` sums brand targets only when every brand defines one, and otherwise keeps the authored portfolio figure.

**Why:** The alternative was requiring every brand to define `northStar`, which reads cleaner (no fallback branches, one code path) but fails the one property this config layer exists to guarantee: `config.js`, which predates per-brand North Star entirely, would need every one of its brands retrofitted before it built or ran again. That inverts the actual dependency — the generic config is the one deployment nothing else should be able to break, and a client-specific feature should never be able to reach back and impose a requirement on it. Optional-with-fallback means `config.js`'s three brands resolve to the portfolio figure exactly as they did before this existed, with zero edits, while `config.demo.js` opts in per brand. That is the same shape as the `activeConfig.js` decision above: backward compatibility with the generic config is the constraint every config-shape change gets measured against, not a nice-to-have.

**Forcing condition:** If a third config ever needs per-brand North Star values that aren't revenue (a metric with no natural weekly-metrics derivation), the `current` override logic needs a second path; the `metric`/`target` fallback shape already accommodates it unchanged.

---

## Proxy authentication: shape and origin, not a browser-held secret

**Superseded:** the original decision here was a shared secret header (`x-gos-secret`) sourced from `VITE_GOS_SECRET`, with per-IP rate limiting at 50/hour.

**What was wrong with it:** Vite substitutes any `VITE_`-prefixed variable into the production bundle at build time. The secret was therefore a string literal in the JavaScript every visitor downloads — readable from devtools in about thirty seconds, and usable to spend the operator's Anthropic budget through the proxy. It was not a credential; it was a credential-shaped comment. The rate limit did not compensate: the counter lived in a module-level `Map`, which on Vercel is per warm Lambda instance, so it reset on every cold start and was enforced independently per concurrent instance.

**Decision:** No credential is shipped to the browser at all. `api/proxy.js` now authorises on properties the browser sets and page script cannot forge (Origin/Referer against an allowlist), and — more importantly — bounds what any accepted request can cost: model allowlist, `max_tokens` ceiling, body size limit, system-prompt length cap, streaming rejected. Rate limiting is durable and shared across instances via Upstash Redis when configured, and **fails closed** if the limiter is unreachable, because an unbounded proxy in front of a metered API is worse than a brief outage.

**Why this is enough for now and not enough later:** origin checking stops the deployed bundle being driven from another page; it does not stop `curl`. What actually caps exposure is the shape validation — a stolen request cannot be reshaped into an expensive one, and the spend ceiling per request is known. That is an acceptable position for a single-tenant demo and early client work. It is not per-user accountability.

**Forcing condition:** the first deployment holding real client data. At that point the proxy needs to verify a session token issued by the same auth that gates the app (Supabase Auth, per the persistence decision above) and rate limit per user rather than per IP. That is the same trigger as the Supabase migration and should be done in the same piece of work — the two are one change, not two.

---

## Modular React with no router or state management library

**Decision:** App logic is split across `src/views/`, `src/components/`, `src/services/`, and `src/prompts/`, with `App.jsx` as the thin orchestration layer. No React Router, no Redux, no Zustand.

**Why:** The portability and AI-assisted development workflow were prioritized over framework convention. No router means the app is embeddable in any context without path configuration. No state library means the full state shape is visible and graspable in one place, which matters when an AI tool (Claude Code) is doing mechanical refactors. Both can be added later; neither was needed to get to the current feature set.

**Forcing condition:** Navigation complexity grows to where manual view-switching in App.jsx becomes unmanageable, or shared state bugs become frequent enough to warrant a proper store.

---

## Signal AI moat is the integration, not the debate format

**Decision:** The defensible element of Signal AI is that debate output is wired to live portfolio state, producing ICE-scored trackable initiatives. This is what gets shipped and maintained. The multi-agent debate format itself is not novel and should not be pitched as the differentiator to technical evaluators.

**Why:** A C-suite debate with personas is a recognizable pattern. What is not common is grounding that debate in a live experiment portfolio, having it reason about specific gaps and fatigue patterns, and having the output land directly in the initiative backlog with pre-scored ICE. That integration is where the value sits and where copying becomes non-trivial.

---

## Cherry-pick over branch merge on modularisation attempt

**Decision:** When the first modularisation attempt (`claude/friendly-brahmagupta-I6yUV`) produced a working refactor with at least one confirmed bug (missing `onResetDemo` parameter in `SettingsModal`), the decision was to cherry-pick only the seed data commit onto a clean branch and discard the refactor commits, then redo the modularisation in a controlled Claude Code session.

**Why:** Merging a 27-file change with a confirmed bug and an unknown blast radius was higher risk than the modest delay of a clean redo. The seed data was the only content worth preserving from that branch; everything else was re-derivable.

---

## Repo will be moved private until paying clients establish the moat

**Decision:** The repository is public, but the defensible value — prompts, agent personas, and methodology — is embedded in the codebase rather than abstracted into protected IP. The decision is to accept this and compete on relationships and process once clients exist, rather than attempt to protect the approach through obscurity.

**Why:** The code scaffolding is not the moat. The prompt engineering, the debate agent design, and the methodology encoded in the ICE scoring and learnings structure are harder to replicate without the same iteration history, but they are visible in the source. Keeping the repo private while pre-revenue adds friction without meaningful protection; going public is reasonable for a project that also serves as a professional artifact.

**Note to revisit:** If the prompts become the primary product (i.e. the system is productised and sold on the quality of its AI reasoning), moving prompts to a private layer becomes worth the complexity.

---

## Model tiering: Sonnet for judgement, Haiku for transformation

**Decision:** Two model tiers, selected in `src/services/ai/models.js` by what the call has to do. `MODELS.REASONING` (Claude Sonnet 5) for anything that weighs evidence or resolves disagreement; `MODELS.STRUCTURED` (Claude Haiku 4.5) for schema-shaped rewriting of text the user already supplied. Adaptive thinking everywhere, with `effort: high` reserved for debate synthesis and candidate generation.

**Why:** The previous state was one model ID (`claude-sonnet-4-6`) repeated as a literal across eleven files — eleven edits to change generation, and eleven chances for one to drift. Beyond consolidating that, the tiering reflects a real distinction. Quick Capture, Hypothesis Expansion and ICE Assist reformat an idea the operator has already had, against a fixed schema, and the operator reviews the result before accepting it. There is no judgement in those calls to lose by running them cheaper.

Signal AI is the opposite case and the reason the tiering is not uniform. Its entire value is that the CFO persona genuinely pushes back on the CMO persona and the synthesis step resolves that tension into a defensible initiative. Run the debate on a cheaper tier and the disagreement flattens into agreement, which is exactly what the agent mandates in `config.js` exist to prevent. The same argument covers learning synthesis and candidate generation: both have to find non-obvious patterns across the whole portfolio rather than restate one.

**Also changed:** prompt caching (`cacheSystem`) on the three flows that reuse an identical system prefix within a few minutes — the debate loop, agent turns, and the parallel expansion of Next Plays candidates. Cache reads bill at roughly a tenth of input rate, so on those flows it is a real saving; elsewhere it would be a no-op and is left off.

**Note on cost figures:** Sonnet 5 uses a newer tokenizer that counts roughly 30% more tokens for the same text than Sonnet 4.6 did. The old "$0.25–0.35 per debate" estimate does not carry over. Measure before quoting a number to a client.

**Forcing condition:** if debate quality is ever observed to degrade, check the tier before the prompt — the split above is the first thing to re-examine.

**Superseded in part** by "Model routing is a group-level operator decision" below. The reasoning above about *what each class of call needs* is unchanged and is now encoded in the feature groups; what changed is that the mapping from call to model is data rather than a literal, and the unit of choice is a group rather than a tier.

---

## Model routing is a group-level operator decision, not a per-call literal

**Decision:** Which model serves which feature is data, held in `src/services/ai/registry.js` and overridable at runtime from an admin console. Features are switched in seven groups — `capture`, `analysis`, `debate`, `creative`, `image`, `video`, `scene` — not individually. Each group declares a capability floor (`requires`) that is enforced both in the console's picker and server-side in `validateRouting` before anything is persisted. `api/proxy.js` derives its model allowlist from the same catalogue rather than keeping a second list.

**Why groups rather than per-feature:** Twelve independent model choices is not a decision anyone can hold in their head, and most of them are not real choices — Quick Capture, Hypothesis Expansion and ICE Assist fail in exactly the same way (schema drift on a transformation the operator reviews anyway), so there is no useful world in which they run on different models. Grouping by what the call has to do well makes each choice defensible and gives it a stated axis to be judged on.

Grouping by *job* rather than by cost tier is the specific thing worth noting, because the two do not coincide. Ad copy and portfolio analysis were both "the expensive tier" under the old split, but the model you would pick for a hook worth testing is not obviously the one you would pick for finding a non-obvious pattern across forty closed initiatives. Separating `creative` from `analysis` is what makes that question askable at all.

**Why capability floors are enforced rather than advised:** `callAgentTurn` hands the model portfolio tools and expects it to decide what to fetch mid-turn. Point the debate group at a model without tool calling and it does not error — it argues from whatever happened to be in the prompt, which reads as a quality regression and gets blamed on the model. That failure is invisible, so the floor is structural: a tool-less model is absent from the picker and rejected by the API. Same reasoning puts `longContext` on `analysis` and `debate`.

**Cost consequence, accepted deliberately:** `callExpandRecommendation` and `callCreativeVariants` ran on Haiku as individual calls. Under group routing they inherit their group's model and default to Sonnet, so both get dearer. That is what "switch by group, not by feature" means; keeping a per-call exception would have reintroduced exactly the per-feature complexity the grouping exists to remove. Both groups can be set back to Haiku from the console. Recorded here rather than absorbed quietly — a cost increase nobody chose is worse than one they did.

**Why the store fails soft on read and loud on write:** A routing read that fails serves the committed defaults, because those are a known-good configuration that shipped — degrading to "what the last deploy chose" beats taking every AI feature offline. This is the opposite of `api/_guard.js`'s rate limiter, which fails closed, and the asymmetry is deliberate: an unbounded proxy is worse than an outage, but a missing *preference* is not. Writes report `durable:false` when there is nowhere to persist, because reporting a save that evaporates is the same class of bug `store.js` was rewritten to stop doing in the browser.

**Model ids for non-Anthropic providers are marked `unverified` until confirmed.** The Gemini and OpenAI ids are transcriptions of published names rather than strings read off this account's model list. A guessed id fails as a 404 the first time someone generates something real, so the console flags them and offers a Verify action that asks the provider for its own model list. The adapters do not change when an id does.

---

## The catalogue tracks tiers, and refuses entries that are not models

**Decision:** The OpenAI placeholder (`gpt-5.1`) is replaced by the three GPT-5.6 tiers — Sol, Terra and Luna — as separate catalogue entries; Gemini gains 3.5 Flash Lite; and Inkling, Thinking Machines' open-weights model, is reachable through an `openrouter` adapter. Gemini Spark is deliberately **not** added.

**Why three OpenAI entries rather than one:** Sol, Terra and Luna are capability tiers that advance on their own cadence, not sizes of a single model. A "GPT-5.6" entry would not be routable, and collapsing them would hide the decision the console exists to make — the price spread across the three is roughly five-fold, which is precisely the sort of tradeoff a group-level assignment is for.

**Why Spark is absent, and why that is worth writing down:** Gemini Spark is an agentic assistant product — an always-on agent reached through Gmail and Chrome, running on a Google-managed VM, plus a separate on-device Android component. It is not a model served by `generateContent`, so there is no id to put in the catalogue. Adding a plausible-looking one would put a guaranteed 404 inside the proxy's allowlist, which is the exact failure the `unverified` convention exists to prevent — and it would be a self-inflicted one, since the absence is knowable in advance rather than pending a Verify. The gap is recorded in `registry.js` next to the other Gemini entries so the next person to notice Spark missing finds the reason where they look for it.

**Why an open-weights model is worth a fourth provider:** every other text model in the catalogue is a hosted product whose behaviour can change under a fixed id. Inkling is the only entry that can be pinned to exact published weights, or moved onto our own inference, if a group's output ever needs to be reproducible — which is the plausible forcing condition for a system whose whole claim is that its recommendations are auditable. The cost of having it is small because OpenRouter's API is OpenAI-compatible: the adapter reuses both existing translations and adds one thing, an output ceiling sent under both `max_tokens` and `max_completion_tokens`. That is not defensive padding — a compatibility layer that does not recognise the newer spelling accepts the request with no ceiling at all rather than erroring, so the failure mode is an unbounded bill with no error to catch. It is named for the host rather than the model, because the key and the endpoint belong to the host; a second open-weights model served from there is a catalogue entry, not another adapter.

**Why first-party rather than a host, and why the shape decided it:** Thinking Machines serve Inkling themselves through Tinker, and Tinker publishes an **Anthropic-compatible** Messages endpoint. That is the deciding fact, ahead of provenance or price. This app speaks Anthropic Messages natively — `buildRequest()` produces it, twelve call sites read it back — so routing to Tinker crosses no translation layer: `toRequest` and `fromResponse` are the identity function. Every other non-Anthropic adapter re-expresses `tool_use` and `tool_result` in a foreign vocabulary and translates them back, which is precisely where the sharp edges are (see the Gemini id-versus-name problem). Pointing the debate group at Inkling therefore adds no new failure surface at all, which is not true of any other way of reaching the same weights.

**The caveat, and why it does not bind here:** Tinker's inference is a beta its own documentation scopes to "low internal traffic rather than large, high-throughput, user-facing deployments," with latency and throughput subject to change without notice. That is a genuine limit and it is the reason the `openrouter` adapter is kept wired with nothing routed to it. But it does not bind on this app: every AI call is click-initiated by one operator in an internal console, which is the traffic profile that sentence describes rather than the one it warns off. The forcing condition is explicit — if Growth OS ever serves these calls to clients directly, move Inkling to a production host before the throughput moves it for you. Because the weights are open and several hosts serve them, that move is the `provider` field on one catalogue entry.

**What Tinker also buys, which no host does:** it is a fine-tuning platform first — Inkling was built for it. Post-training on the portfolio and benching the resulting checkpoint against stock models in the console's existing test bench is the same key, the same endpoint and the same adapter, with a `tinker://` checkpoint path as the catalogue id instead of a model name. That is a plausible next step for a product whose claim is that its recommendations are auditable, and choosing Tinker keeps it one catalogue line away rather than a new integration.

**Forcing condition:** if a second open-weights model arrives and the two want different hosts, `openrouter` has stopped being the right unit — the adapter becomes host-per-entry and the endpoint moves into the catalogue. Not worth doing for one model.

**Forcing condition:** if a fourth or fifth group appears, or if a single group starts needing two models (a "light" and a "heavy" slot), the grouping has stopped matching the work — revisit the axis rather than adding slots. If model choice ever needs to differ per client rather than per deployment, this needs a tenant key and moves with the Supabase migration.

---

## The admin console is a separate bundle behind a server-verified password

**Decision:** The model console is a second Vite entry (`admin.html` → `src/admin/`), reachable at `/admin`, gated by `ADMIN_PASSWORD` with an HMAC-signed `HttpOnly; Secure; SameSite=Strict` session cookie. It has its own visual language and imports nothing from `src/views/`, `src/components/styles.js` or `constants.js` beyond data.

**Why a separate entry rather than a route:** There is no router (see "Modular React with no router" above), so a route would have meant a `nav` state in `App.jsx` and the console shipping inside the client bundle. A separate entry makes the exclusion structural rather than a convention every future edit has to remember — verified in the build by asserting no console-only string appears in any chunk `index.html` loads. It is also the honest answer to "this is not part of the product": a client using Growth OS should not download the control panel that decides what their session runs on.

**Why there is auth here when the app has none:** The "Config-first per-client deployment (no multi-tenant auth)" decision stands for the app — one client per deployment, their portfolio is the only thing in it, and gating a view of your own data buys nothing. The console is a different kind of surface. It changes what every visitor's session runs on, and the test bench spends real money across four providers on each run. "No auth" is defensible for the first and not for the second.

**What this explicitly does not close:** the forcing condition under "Proxy authentication" — real per-user auth on the proxy, triggered by the first deployment holding real client data. This is an operator gate on one control surface, not per-user accountability. The console notably gets **no** privileged path to the providers: the bench calls `/api/proxy` through the same `validateBody` ceilings and the same rate limiter as the app, because the thing most likely to spend in bulk should not be the one thing exempt from the controls that bound spend.

**Why a signed cookie rather than a stored session:** a session table would need the store reachable on every request, and routing persistence is already best-effort. An HMAC cookie needs no storage — the signature proves the server issued it and the embedded expiry bounds it. The tradeoff is that it cannot be revoked before it expires, which is why the TTL is twelve hours; rotating `ADMIN_SESSION_SECRET` is the revocation path.

**Forcing condition:** a second person needing console access. At that point "one shared password" stops being adequate and this should move to the same auth that gates the app, per the proxy-authentication trigger.

---

## Gold stays the accent; the dark surfaces were the problem

**Decision:** Keep the sand/gold and serif identity rather than moving to the slate/indigo palette used in adjacent products. Fix the two things that were actually wrong: gold's contrast in light mode, and the warmth of the dark surfaces.

**Why:** The complaint that dark mode "looked brown rather than golden" was correct, but the cause was not the accent. The dark surfaces were warm browns (`#1A1916`, `#232118` — R−B of +4 and +11), so accent and surface shared a hue and the gold read as mud. The surfaces are now cool neutrals (R−B of −7 and −9) and the same gold family reads as metal. That is a two-token change, not a rebrand.

Going indigo/slate would solve the same problem by removing the thing that distinguishes this product. Slate-and-indigo is the default SaaS console look — correct for an internal ops tool, where the job is to disappear and let the operator scan. Growth OS has a different job: it is a client-facing advisory artifact, shown in meetings and screenshotted into decks, and the editorial serif-and-gold treatment is what makes it look like a considered point of view rather than another dashboard. Two products, two jobs, two palettes.

**The genuine defect:** in light mode `gold` measured 2.42:1 against white — below AA, and applied to the largest, most important figures on the dashboard. Dark mode measured 10.12:1 for the same token. The palette had clearly been tuned in dark mode only. `gold` is now an ink value that passes AA on every surface it lands on, and `goldFill` is a separate bright value used only as a background behind dark text.

**Enforcement:** `npm run check:contrast` validates all 66 themed pairings against WCAG AA and fails CI on regression. The point is that this class of bug is invisible to a build that only checks the app compiles.

**Amendment — hue is not a label.** The palette was defensible and its
*application* was not: the funnel coverage map, the category chart and the type
chart each painted every bar a different hue from `CAT_L`/`TYPE_L`, so the
dashboard carried eight to thirteen simultaneous accent colours competing with
the figures beside them. Those are magnitude charts. The row is already labelled
and the bar length already encodes the number, so hue there is decoration that
costs the palette its meaning everywhere else — once thirteen colours mean
nothing, the two that do mean something stop being read. All three now draw in
one ink at one value. The category and type token tables stay, because they still
do real work on the identity badges, where a colour marks the same category
across a list rather than distinguishing one bar from its neighbour.

The funnel coverage gap notice also came out of red. A stage with no active work
is an opportunity worth a hypothesis, and this decision already reserves red for
blockers and failed outcomes — spending it on the one panel that is prompting
rather than warning made the loudest element on the dashboard the least
actionable one.

**What this is not:** a retreat toward the slate/indigo console look argued
against above. The sand-gold editorial identity is unchanged; what changed is
that it is now spent where it carries information.

**Second amendment — colour is earned on interaction, not spent at rest.** The
first amendment removed colour and left the app calmer but flatter, which was
half an answer. The real diagnosis is not that there was too much colour, it is
that it was *on all the time*: eight hues held at full saturation on a dashboard
nobody was pointing at, so none of them could mean "look here".

So the colour came back, on a trigger. Every list row, card and stat tile in the
app is inert at rest and answers the pointer: an accent rail charges down its
leading edge, the magnitude bar it owns brightens and takes a travelling
specular highlight, the tile lifts and draws an underline. At any moment the
only saturated thing on screen is the thing under the cursor, which makes the
colour informative — it is now telling you where you are, which is a fact, and
not what category a row belongs to, which the label already said.

The rail's colour is the one thing about a row worth saying in colour, and it
differs by surface because the surfaces mean different things: urgency in
Triage, status in the Register, outcome in the Library, plain gold in
Performance where the only claim is "this is interactive".

**Why this is one primitive and not seven implementations.** Before it, three
views had three different hover behaviours and four had none — the Register
recoloured its border inline, Next Plays swapped its background, Triage painted
a permanent strip and did nothing on hover at all. Pointing at something meant
something different on every page, which is the same failure as the palette one
level up: an effect applied inconsistently carries no meaning. It now lives in
`index.css` plus `components/motion.js`, and a view opts in rather than
inventing.

**Triage's strips specifically.** They were the visible symptom — permanently
painted 3px children that no other view had, which made that page read as a
different product from the ones either side of it. They are now the shared
primitive, so Triage stopped being the exception without losing the signal:
urgency is still legible at rest from the tag and the ordering, and the colour
is what the pointer buys you.

**Constraints this had to respect:** no colour is defined in `index.css` — every
value arrives through a custom property set inline from a token, so the palette
stays in one place and a row with no accent gets no rail rather than a guessed
one. The charge sweep runs only while hovered; an animation that plays on its
own is the always-on mistake one dimension over. And under
`prefers-reduced-motion` every duration collapses to zero, so each effect
degrades to an instant state change rather than vanishing — hover still
communicates, it just stops moving.

---

## Two bridges into the portfolio: the tag slot, and names claimed by hand

**Decision:** An imported performance row reaches an initiative one of two ways,
and either alone is sufficient. It can carry the initiative's `trackingTag` in
the naming convention's initiative slot, which is what `naming.js` has always
done. Or the initiative can *claim* a campaign, ad set or ad name outright —
stored on the record as `adNames: [{name, level, channel, addedAt}]`, matched on
the exact string. `attachInitiatives` tries the claim first and falls back to the
tag, recording which one won as `attributionVia`.

**Why a second mechanism rather than a better first one:** the tag slot only
works on names this tool built. Most spend an operator wants to measure was named
before this tool was in the room, and cannot be renamed — editing a live Meta
campaign's name resets its learning phase, so "rename your account and we will
measure it" is a way of saying no. Claiming costs one paste and joins the same
rows. It is the difference between measuring an account as it is and asking for
an account to be rebuilt before it can be measured.

**Why the claim runs before parsing rather than after:** a legacy name parses
against nothing, so gating attribution on a successful parse would exclude
exactly the rows this exists to rescue. Those rows stay `parsed:false` — they
still contribute to no dimensional breakdown, which is honest, because their
names genuinely carry no dimensions — and they attribute anyway. Coverage and
correctness are separate claims and the code keeps them separate.

**Why a claim outranks the tag when they disagree:** one of them is a person
pointing at a specific string and saying "this one is mine", and the other is a
convention that could have been followed by accident. When a human decision and
an inferred one conflict, the human decision is the answer. For the same reason
claims match finest-grain-first: an ad claimed by A inside a campaign claimed by
B belongs to A.

**Why a claim matches at any level:** platform exports repeat the campaign and ad
set name on every child row, so claiming a campaign claims every ad underneath it
without anyone enumerating them. That is what "this campaign belongs to this
test" already means to the person saying it.

**The failure mode this introduces, and what answers it:** a claim that never
appears in an export is silent — the rollup simply shows less spend than it
should and nothing says why. Usually it is a paste that picked up a trailing
space, or a campaign renamed after being claimed. So the Attribution tab reports
claimed-but-absent names by name, on the same principle as `unparsed`: a total
that quietly excludes spend is worse than one that admits it. The CSV round-trip
follows from the same worry — a blank `adNames` column carries existing claims
through rather than clearing them, because a spreadsheet that drops a column it
does not understand should not silently unlink every campaign an initiative
measures.

**Forcing condition:** claims are exact-string today. Platform-side renames break
them, and the durable fix is the platform's own entity ID, which only an API
integration can supply. When that lands, `adNames` gains an optional `entityId`
and the string becomes the fallback rather than the key.

---

## The convention gets a taxonomy view and a builder, because a grammar is not a sentence

**Decision:** The Performance view's Convention tab is now Taxonomy, leading with
the dimension registry grouped into families (`DIMENSION_FAMILIES` in
`naming.js`) with each dimension showing every template position it occupies;
the per-channel templates remain as a second mode. A new Name builder tab
composes one dimension record into every level of a channel at once and can
assign the result to an initiative.

**Why the taxonomy leads:** the tab used to answer "what does a Meta ad name look
like", which is a question about syntax. The question people actually arrive with
is "what is a Theme, and where is it allowed to appear" — and that was
reverse-engineerable only by reading five template strings side by side. Twenty-
four dimensions in registry order is a list; six labelled groups of three or four
is something a person can work through and agree to. Families are presentation
only: slot order comes from templates alone, so regrouping can never change what
a name means.

**Why families are a side lookup, not a field on each dimension:** `resolveSchema`
returns a stored custom schema verbatim, and a schema saved before this existed
carries no family fields. A lookup keyed on dimension key groups those correctly
too, and anything unrecognised lands in "Other" rather than vanishing.

**Why the builder is its own surface:** it existed twice before and neither time
as somewhere you could go. The Creative Studio assembles names, but only as a
consequence of generating variants — so getting one name for one campaign meant
producing a creative brief nobody asked for. The Convention tab described the
templates without letting you fill one in. The gap between "here is the grammar"
and "here is a sentence" was left for the operator to cross in their head, which
is the crossing the convention exists to remove.

**Why the initiative editor links rather than embeds:** composing a new name is a
different job from claiming an existing one. The editor does the second, because
pasting a name you already have belongs next to the other attribution fields; the
first is a link that saves the initiative first, so the builder opens with a
record that exists and can actually be claimed against.

---

## The product is Marketers Lab; Growth OS is the repository

**Decision:** The public product name is **Marketers Lab**. `Growth OS` is retired
as a customer-facing name and kept only as the repository and internal project
name. The visual identity stays sand-gold editorial; the Biosphere prototype's
green/oklch palette and its invented vocabulary (Observatory, Quarantine,
Vivarium, Microscope) are not adopted. The scientific vocabulary that *is*
adopted is the standard one already in the data model — observation, hypothesis,
prediction, evidence, learning — because those words need no glossary.

**Why now rather than later:** the switching cost is currently zero and only ever
rises. There are no customers, no invoices, no inbound links that matter, and no
one has the old name in their vocabulary. Every month this stays open, the same
decision costs more to make. ROADMAP listed it as an open question on the grounds
that both positions are coherent; they are, which is exactly why it will not
resolve itself by being deferred.

**Why not Growth OS:** "OS" has become a suffix rather than a claim — it now
signals category ambition instead of describing anything. It is also the wrong
promise. An operating system is what you run your work *on*; this is a thing that
remembers what your experiments taught you. "Growth" pairs it with the job title
of the buyer at a company large enough to have one, which is a segment above the
ICP. `marketerslab.com` is already held.

**Why "Lab" is the right noun:** it names the loop rather than the software. The
product's actual claim is that marketing work should produce evidence, and a lab
is where that is the normal expectation rather than an aspiration. It also
survives the feature list changing underneath it, which "OS" does not — an OS is
measured by how much it covers, and coverage is the trap this product has to
avoid.

**Why the Biosphere vocabulary is rejected despite being better writing:** the
product's pitch is that it removes a translation step between what a marketer did
and what the organisation learned. Inventing six words the buyer has to learn
first adds a translation step back. Named concepts are worth their cost when they
carry a meaning no existing word does; Quarantine and Vivarium are more evocative
than Draft and Running, not more precise.

**What this costs:** a rename pass across README, the app shell, the config
defaults and the deployment. Cheap today, and the point of the entry is that it
is never cheaper than today.

**Forcing condition:** a trademark conflict, or a client relationship where the
existing name has real equity. Neither exists now. If Marketers Lab proves
unclearable, the fallback is a new name — not a reversion to Growth OS, which
this entry rejects on its merits rather than on availability.

---

## The laboratory names live in the rail, not the header

**Decision:** The Biosphere vocabulary (Observatory, Register, Archive,
Microscope, Quarantine, Bench, Readout) stays as a one-line subtitle under each
sidebar item and appears nowhere else. It was also rendered beside the view
title in the page header; that instance is removed.

**Why this is not a reversal of the entry above.** "The product is Marketers
Lab; Growth OS is the repository" rejects the Biosphere vocabulary *as
nomenclature* — as the words a buyer has to learn in order to find the
initiative list. That rejection holds and is what produced the split in
`navSections.js`: `label` is plain and is the thing you read and click, `lab` is
flavour that is never the only way to find anything. The rail subtitle earns its
place by doing one job the plain label cannot: it explains the two-letter code
on the item, which is otherwise a monogram with no referent — and in the
collapsed rail, the code *is* the item.

**Why the header instance goes.** It explained nothing. The header already
names the view directly above it, so a second uppercase label beside it competed
for the same glance and told the reader something they had just read, in a word
they would have to learn. The rail version is a gloss on a code; the header
version was a synonym for a word already on screen.

**The record was in conflict.** The entry above said the vocabulary was "not
adopted" while the shipped UI adopted it in two places, and `navSections.js`
carried a long defence of a position DECISIONS.md contradicted. Two written
records disagreeing is how a codebase loses the ability to answer "why is this
like this", which is the only thing this file is for. This entry settles it.

---

## Money and dates are workspace settings

**Decision:** `settings.currency` and `settings.locale`, applied once at load
through `setNumberFormat` and read by the shared formatters from module state.
One `fmtCur`, one `fmtDate`, plus `fmtCurFine` and `fmtCurFull` for the dense
and the prose cases.

**Why:** there were four currency formatters and they disagreed on the same
number — `$2,400,000` rendered as "$2.4M" on the dashboard, "$2400k" in Triage
(a local copy with no millions branch), "$2400k" again in the funnel map (a
third copy, with a decimal the others lacked), and "$2,400,000" in the AI
context. Triage also had its own `fmtDate` that dropped the year. All four
hardcoded a dollar sign and `en-CA`, in a product whose central artifact is a
revenue claim a client forwards to their board: a UK brand read its own numbers
in dollars.

**Why module state rather than arguments:** the formatters are called at roughly
a hundred and forty sites. Threading a currency through all of them to serve a
deployment setting is the wrong trade, and the codebase already has this exact
shape in `applyRouting` for model assignments, for the same reason.

**What this costs:** the formatters are impure — a call before `setNumberFormat`
resolves uses the default. Every one of them runs during render, long after the
settings effect has fired on mount, and the default is a correct answer rather
than a broken one, so the failure mode is a US-dollar figure for one frame in a
workspace that has not finished loading.

---

## `textMuted` is content and is held to AA

**Decision:** `TL.textMuted` darkens from `#74716A` to `#6A675F`, and
`check-contrast.mjs` checks it at 4.5:1 like every other ink. A new `textFaint`
token carries the AA-Large waiver.

**Why:** the waiver was written on the claim that muted was "micro-label only …
decorative context rather than content", and the code never honoured it.
`textMuted` is the most-used ink in the app — 395 usages against 129 for
`textSub` — and it is the label colour for every form field via `FR`, every
table header, half the cells in Weekly Pulse, and the sublabel under every stat
tile, at 9–11px in a hundred and ninety places. AA Large applies at ≥18.66px
regular or ≥24px bold; none of those qualify. The pairing measured 4.05:1 on
`bg`.

A contrast gate with an exemption for the token that does most of the work is a
gate that reports what it was told rather than what is true. The waiver now
names a token that is actually decorative, and is checked against the surfaces
that token is allowed on.
## Performance exports are ad-level with no breakdowns, and demographics are fetched on demand

**Decision:** The supported export is campaign + ad set + ad names at ad-level
grain, with no platform breakdowns. Demographic splits are not ingested in bulk;
they are requested per-question by the diagnostic escalation in ROADMAP 5.3.

**Why ad-level and not campaign-level:** the `initiative` slot exists in exactly
two templates — `ad` on all four ad channels, and `message` on Klaviyo. Campaign
names are `channel_funnel_category_geo_objective`, with no bridge segment. A
campaign-level export therefore parses cleanly and attributes to nothing, which
the importer would correctly report as 100% untagged — a true statement that
looks exactly like a broken product. Including the campaign and ad set name
columns in the same ad-level export costs no extra rows, because
`LEVEL_PRECEDENCE` takes the ad name as the row's identity and the coarser names
ride along.

**Why no demographic breakdowns, strongest reason first:**

1. **The schema already has `age` and `gender`, and they mean the opposite
   thing.** The named slots record what was *targeted* — an input, a decision
   somebody made. A platform breakdown reports who was *reached* — an output.
   Ingesting both produces two columns named gender with contradictory semantics
   and rollups that silently blend them. This is a correctness problem, not a
   volume one, and it would surface months later as numbers nobody can explain.
2. **It is the one thing that breaks the volume argument.** Age × gender is
   roughly a 21× row multiplier: ~6k rows/month/client becomes ~126k, ~1.5M/year.
   That is where "Postgres will not notice" stops being true and retention policy
   stops being deferrable.
3. **It is where the DPA obligation lives.** Campaign-level spend and revenue is
   business data. Demographic breakdowns are what make a processor agreement
   genuinely necessary rather than boilerplate.

**What this deliberately gives up, and why the loss is smaller than it looks:**
the named slots cannot tell you who actually responded. That limit is getting
worse, not better — under Advantage+ and broad targeting, which is now the
default, nobody sets age or gender at all, so `age` reads `Broad` and carries no
information. The answer is not to ingest the breakdown by default; it is that
this gap is precisely what ROADMAP 5.3 exists to close, one question at a time.
If a demographic split matters to a hypothesis in advance, the disciplined path
is a separate ad set with `age`/`gender` in its name, which flows through the
ledger as structure rather than arriving as an unattributable report.

**Forcing condition:** a client whose analysis genuinely requires standing
demographic data — at which point it lands in `initiative_evidence` with its own
retention and consent posture, not in the main fact table.

---

## The `gender`/`talent` collision is not fixable in place — it needs a schema version

**Decision:** Meta's ad-level `gender` slot stays where it is, despite being
semantically wrong. The fix is deferred to the schema-versioning work that the
campaign fact model (ROADMAP 5.4) makes possible.

**The defect, which is real:** `gender` means two unrelated things depending on
level. In Meta's ad set template it is targeting; in Meta's *ad* template it is
who appears on screen. The dimension's own hint admits this — "Targeted or
presented gender" — and one field with two meanings blends under any rollup that
crosses levels. Worse, the same fact is filed under different names across
channels: Meta's ad template calls the on-screen presenter `gender`, YouTube's
calls it `talent` with a richer vocabulary (`Woman/Man/Family/Expert/None`). So
"how do ads featuring a woman perform" is unanswerable cross-channel — the data
is there, under two names.

**Why the obvious fix is worse than the defect.** Swapping slot 5 of Meta's ad
template from `gender` to `talent` changes that slot's vocabulary from `[F, M,
NA]` to `[Woman, Man, Family, Expert, None, NA]`. `validateValue` then rejects
`F`, `parseName` sets `ok: false`, and `identifyName` returns no candidate — so
every Meta ad name ever built under the current convention stops being
identifiable and drops out of attribution entirely. That is silent
mis-attribution of an account's whole history, which is the exact failure
`naming.js` was written to prevent, and it breaks the invariant stated at the top
of the templates: every name built before the rewrite still parses.

Users who have saved a custom schema are insulated, because `baseSchema` returns
a stored schema verbatim. Everyone on the default — the demo, and every new
client — is not.

**Why not a superset vocabulary as a bridge:** letting `talent` accept `F`
alongside `Woman` keeps old names parsing, but `normKey("F") !== normKey("Woman")`,
so the pivot splits into two rows for one fact. That trades a loud failure for a
quiet one, which is the wrong direction.

**What was done instead, now:** `age` gained a controlled vocabulary — it was
free text against fixed platform buckets, so `25-34`, `25_34` and `25-34yo` each
split the same band. That change is a tightening and carries the same class of
risk in principle, but the blast radius was checked and is nil: one ad-set-shaped
name exists in the codebase and its value is in the vocabulary. `dimensionCoverage`
was added so a caller can tell a partial rollup from an empty one — `age` and
`gender` sit in Meta's and TikTok's templates and in neither Google's nor
YouTube's, so a demographic breakdown across a mixed portfolio is a Meta + TikTok
number wearing a portfolio label. The figure was never wrong; the caption was, and
now the caption is derivable.

**Forcing condition:** the fact model landing with `raw_name` and a schema version
stamped on every row. Reparse-on-version-change is what makes a vocabulary
correction safe, because the old names are re-read under the schema that built
them. Until that exists, this defect is cheaper than its fix.

---

## Gemini auth: additive Vertex path via env-var presence, not a replacement

**Decision:** Gemini calls (text proxy and image generation) can authenticate two ways: the existing `GEMINI_API_KEY` against the AI Studio Developer API, or a Vertex AI service-account flow that activates once `GCP_PROJECT_ID`, `GCP_LOCATION` and `GOOGLE_APPLICATION_CREDENTIALS` are all set. Vertex is opt-in by env-var presence, or an explicit `GEMINI_AUTH_MODE=vertex|aistudio` override — nothing about a default, key-only deployment changes. `api/_geminiAuth.js` is the one place that decides which mode is active and mints the token Vertex needs; `api/_adapters.js`, `api/image.js` and `api/admin.js` all call through it rather than each growing its own copy of the same detection logic.

**Why two modes instead of migrating outright:** they are not interchangeable — the Developer API and Vertex answer to different billing pools. As of March 2026, Google Cloud Billing credits (including the free trial) are explicitly excluded from Developer API / AI Studio usage; they apply only to Vertex. A deployment sitting on real Cloud credits gets nothing from them through a plain `GEMINI_API_KEY`, which is the entire reason this exists. But not every deployment has a GCP project with Vertex enabled, and a hard cutover would break every one of them for a billing concern specific to some. Env-var presence is the same shape this app already uses to gate every other optional provider (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `HEYGEN_API_KEY` …) — unset, and the feature degrades to a clear "not configured" error, never a broken default.

**Why a service-account JWT hand-rolled with `node:crypto` rather than `google-auth-library`:** every other provider in this app — Anthropic, OpenAI, OpenRouter, HeyGen, VEED, D-ID, and AI-Studio Gemini itself — authenticates with one static key in one header, with zero OAuth2 machinery anywhere in the codebase. Vertex's token exchange is one well-documented, unchanging flow (RS256-sign a claim set, POST it to `oauth2.googleapis.com/token`), which `node:crypto` covers completely. Pulling in `google-auth-library` for exactly one call site would add a dependency, and its transitive tree, to a project that currently has three runtime dependencies total.

**Why the admin console's Gemini model-listing stayed AI-Studio-only:** Verify/listModels calls Google's ListModels endpoint to confirm a catalogue id is real. Vertex has no equivalent wired here — the publisher-models list shape wasn't something this change could verify against a real Vertex account, and a guessed endpoint returning silently-wrong data is worse than the honest "listing isn't wired up for Vertex yet" the console shows instead. The gate that decides whether Gemini is configured *at all* does account for Vertex, so a Vertex-only deployment is never told it has no Gemini credentials when it does.

**Forcing condition:** none expected soon — Google's May 2026 rebrand of Vertex AI to "Gemini Enterprise Agent Platform" changed the console name only; the `aiplatform.googleapis.com` endpoints and this auth flow are unaffected. Revisit if a future change touches the API surface itself, not just what the console calls it.

---

## The licence is proprietary, and the repository being private was never the control

**Decision:** `LICENSE` is an all-rights-reserved proprietary notice. Clients get a right to use a deployed instance under their services agreement; nobody gets a licence to the source. The repository is already private, and this is the other half of the same protection rather than a substitute for it.

**Why the two are not the same thing:** the earlier entry in this file recorded a decision to move the repo private "until paying clients establish the moat", and that has happened. Private controls *who sees it*. The licence controls *what a person who has seen it may do*, and MIT's answer was: anything at all, including ship a competing product, with no obligation beyond keeping a copyright line. Everyone who gets access legitimately — a contractor, an evaluating client's engineer, a technical due-diligence reader, a future employee — leaves with a permanent, irrevocable grant to the campaign nomenclature engine that `docs/commercial.md` names as the only genuinely differentiated part of the product. That is a strange thing to attach to an asset being sold at $6,000 plus $1,500/month.

**Why not a source-available licence (BUSL, PolyForm, Elastic 2.0):** those solve the problem of distributing source publicly while restricting commercial use. This source is not distributed publicly and there is no plan for it to be. A licence written for a distribution model this project does not have would be borrowed sophistication — more text, more explaining, and no more protection than "no licence is granted."

**What this does not change:** the moat argument stands exactly where DECISIONS.md already put it. The prompts, the taxonomy judgement and the operating cadence are the practice, and the practice is not copyable from a repository. This closes a gap that was free to close; it does not promote the code to being the defensible layer.

**Forcing condition:** a decision to open-source part of the codebase as distribution — the parser as a standalone library, say, to make the convention an industry standard. That is a real strategy and it would want PolyForm or Apache-2.0 on that package specifically, not a reversion here.

---

## The workspace mode is data, not the build flag

**Decision:** `settings.workspaceMode` (`demo` | `live`) is workspace state, defaulted from the config's `DEMO_MODE` and overridable in Settings. Demo mode keeps every behaviour it has: seeded portfolio, tour on first visit, one-click reseed. A live workspace loses the reseed entirely — it is not rendered, not confirmed — and is held to a seven-day backup reminder instead of fourteen.

**Why they are two questions:** `DEMO_MODE` is a build-time constant answering "should a cold visitor be skipped past onboarding and shown a tour". Whether the data in this browser is a client's real account is a different question, and the case that separates them is the intended first-client path: a demo build is deployed, a prospect becomes a client, and their account is imported into the workspace that is already running. At that moment the build flag says demo and the data says otherwise, and the flag is the one thing that cannot know.

**Why the reseed is removed rather than guarded:** the product's own rule, from the interface audit, is that a destructive action names what it destroys and offers an undo. This one replaces an entire client portfolio with a seeded one and there is no undo — the seed *is* the overwrite. A dialog is the right guard for a destructive action whose target is on screen; the right number of clicks between a live workspace and reseeding it is none.

**What this deliberately does not do:** it does not gate anything behind the mode that would make the demo less complete. The demo is the sales asset and the reason `DEMO_MODE` exists; a demo degraded to protect a live workspace would trade the thing that works today for the thing that might.

---

## The workspace holds aggregates about ad entities, and never people

**Decision:** a stated, enforced and tested contract: no email address, phone number, person's name, postal address, customer or profile id, device or advertising id, IP address, or date of birth enters the store. Age, gender, country, city, region and placement are explicitly allowed as audience cohorts on a breakdown row. Enforced at two points — a header scan every CSV importer runs and reports from, and `stripPersonalFields` as the chokepoint for any producer of rows that is not a CSV importer. Written up for a prospect in `docs/data-handling.md`.

**Why now, and why as code:** both importers already read only the columns they recognise, so an export containing an email column has never actually written one. That is an accident of how they were written rather than a property anyone stated, it is invisible from outside the source, and it is exactly the kind of accident the first connector written in a hurry does not inherit. The moment real client data arrives is the moment the difference between "never happened to" and "cannot" starts to matter.

**Why this line specifically:** three separate things are true only because of it. `localStorage` on an operator's laptop is a defensible home for campaign aggregates and an indefensible one for a customer list — the persistence decision and the data decision are the same decision. Every AI prompt is built from what is in the store, so no prompt carries personal data, which keeps the model providers out of a DPA argument rather than inside one with mitigations. And a security review gets a one-sentence answer that ends the conversation instead of starting it.

**The consequence worth naming:** this is also the answer for a regulated vertical. A health or finance prospect whose marketing questions are answerable from campaign aggregates is servable as-is under a contract saying regulated personal data never enters the workspace. A prospect who needs individual-level data in the tool is not a customer for this architecture, and saying so is cheaper than widening the contract and acquiring the compliance programme that comes with it.

**Why the notice tells the operator their file is still on disk:** the product can drop a column; it cannot delete an export sitting in a downloads folder. A message that stops at "not imported" implies a cleanliness that does not exist, and the operator is the only one who can finish the job.

**Forcing condition:** a client requirement for individual-level data — a customer-cohort analysis that genuinely needs profiles. That is not a widening of this rule, it is a different product with a different hosting and contractual posture, and it should be priced and decided as one.

---

## Reading a test result is an action, and it is counted

**Decision:** the Test Validity panel derives a reading window from sample size and expected weekly traffic, and does not display the result until it opens. Reading early is always available, one click, never blocked — and every reading is recorded on the initiative. The significance threshold is corrected for the number of readings taken, using Pocock's flat sequential boundary, and both verdicts are shown when they disagree.

**The problem, stated precisely:** an operator opens a running test on Tuesday and sees 91%, on Thursday and sees 94%, the next Monday and sees 95.2%, and calls a winner. Every individual computation was correct. The conclusion is far weaker than 95% confidence, because the decision rule was never "test once at the end" — it was "keep looking until it crosses", and that rule crosses a 5% threshold much more often than 5% of the time on pure noise. This is the most common way a marketing A/B test produces a false winner and nothing about the third reading looks different from a legitimate one. A product that sells decision quality and renders a confidence figure on demand, with no notion of how many times it has been asked, is participating in the error.

**Why looking early is allowed:** blocking is stricter and worse. An operator who cannot see their own numbers exports the CSV and computes them in a spreadsheet, where there is no counter at all and no correction. The discipline has to survive being optional or it gets routed around. Making the reading an act is what turns the number of looks into something knowable, and knowing it is the only reason the threshold can be right.

**Why a flat Pocock boundary rather than O'Brien-Fleming:** O'Brien-Fleming is better when the looks are planned in advance and the early ones are meant to be near-impossible to cross. Here the looks are unplanned by definition — that is the behaviour being corrected — so a boundary that does not depend on which look this is out of how many is the honest one. K=1 is 1.96 by construction, so a test read once is corrected by nothing.

**Why the constants are solved rather than quoted:** the module ships a table, and a table is only as good as what produced it. `testValidity.test.js` re-derives two of the boundaries on every CI run by propagating the density of the partial sum through the non-crossing region and bisecting, and asserts the shipped values still match; the K≤5 column agrees with the published 1977 values to three decimals, which is the external check on the solver. Quoting five constants from memory into a file that decides whether a client kills a campaign was not a defensible way to write this.

**Why observed sessions outrank the calendar:** the date is a forecast from an estimate of weekly traffic; the sessions are what the statistics consume. The state that matters most is the one a calendar alone gets wrong — a test past its planned end date on half the expected traffic, which reads as finished and is not. It has its own name in the panel, and reading it is called reading it short.

**Forcing condition:** measured spend and conversions reaching the panel from the ad names (ROADMAP 1.6, "feed measured figures into Test Validity"). The counts are hand-entered today, which means the reading window is a discipline the operator can decline by not typing anything. When the figures arrive from the import, the window becomes a fact about the test rather than a claim about it.

---

## A generated asset gets an identity; the bytes are a separate, weaker promise

**Decision:** Every generated frame and render now produces a persisted **record** — id, initiative, brief version, prompt, model, aspect, cost, and the ad name it ships under (`src/services/assets.js`, `KEY_ASSETS`). The **bytes** go through a separate adapter (`src/services/assetStore.js`) that writes to Supabase Storage when the deployment has credentials configured and holds them for the tab when it does not. The record persists in every case; `bytesDurable` says which happened.

**The problem this fixes.** Images lived in React state keyed by bare variant index, videos held a provider URL that expires in 24–72h, and `clearGeneratedAssets()` wiped both on any initiative switch or variant regeneration. Each of those decisions was correct on its own terms — a base64 PNG in localStorage is the fastest way to reproduce the quota bug `store.js` was rewritten to prevent — and stacked together they meant a generated asset had no id, no durable link to the brief that produced it, and ceased to exist on reload. So the loop closed at `name → initiative` and never at `asset → initiative`: when an export reported that an ad returned 2.4x, the initiative and the angle were recoverable and the creative was not. "Every asset is born attached to a hypothesis" was true for about thirty minutes.

**Why the split, rather than persisting both or neither.** They have different constraints and different value. The record is a few hundred bytes of structured JSON and is the half that carries the evidence: it can still say that on 4 March, brief v2 of NH-003 produced a 4:5 key frame for the TimeSaver angle under a named prompt at four cents, and that the ad name it shipped under was the one that returned 2.4x. The picture is the regenerable half. Making the record wait for blob storage would have meant nothing worked until Phase 5.1 landed — exactly backwards, because every day without a record is provenance that cannot be reconstructed later, while a missing frame can be generated again.

**Why versioned keys rather than deletion.** `variantKey` folds brief version and variants version into the key, so an asset made against brief v2's third variant carries a key brief v3 can never mint. Old rounds stop being *current* without ever becoming *wrong*, which is what `clearGeneratedAssets` was actually protecting against — it just paid for that safety by destroying the ledger. Nothing has to be deleted to stay correct now.

**Why the upload goes through `api/asset.js` rather than straight to Supabase.** A browser-held anon key with insert rights is the `VITE_GOS_SECRET` mistake again (see the credential note in `services/ai/_shared.js`). Anon keys are safe behind row-level security tied to an authenticated user; this app has no per-user auth, so an insert-capable key in the bundle means anyone who opens devtools can fill the operator's bucket. The service key stays server-side and the endpoint authorises on origin and rate like every other proxy here.

**Why env-var presence gating.** Same shape as the Vertex path and every optional provider: unset, and the feature degrades to a stated limitation rather than a broken default. The studio asks once at boot and says plainly whether a frame will survive a reload **before** the operator spends money generating it.

**What is deliberately still not durable:** video bytes. A rendered clip is 5–50MB and re-hosting it would make this app a video CDN with its own egress bill and retention policy — the same reasoning `api/video.js` already records. The record of the render persists, including its cost and job id; the clip does not.

**Forcing condition:** the first client whose generated creative has to be handed over as a deliverable. Session-only bytes are survivable for an operator who downloads as they go and not for a client expecting an asset library.

---

## The creative brief reasons from measured returns, and says what it was not shown

**Decision:** `callCreativeBrief` now receives a per-dimension performance block built from imported ad names (`src/services/creativeEvidence.js`), and selects closed learnings by a stated ranking rule that reports its own remainder. The brief returns `evidenceConsidered` recording both.

**The two problems, which were opposite.** The brief truncated learnings at `learningsIndex.slice(0, 25)` — the first 25 of an unranked array, with nothing anywhere saying the other 26 existed — while `callSynthesizeLearnings` passed *every* learning with no cap and would eventually fail on context length instead. A product that counts unparsed rows in every breakdown rather than dropping them should not drop learnings quietly in either direction. Both now rank, cap, and state the excluded count in the prompt itself, so a model shown 25 of 51 can qualify its claim rather than writing as though it read the corpus.

**Why measured performance is the bigger half.** `breakdownByDimension` has been able to compute that one angle returned 2.1x and another 0.8x since the nomenclature engine shipped, and the brief never saw it. That is the piece a competitor cannot copy: a learnings library supports "we remember what you learned", which three funded products already say; measured return per creative angle requires the naming convention, the parser that refuses to guess, and the join. The prompt is told that measured performance outranks a written learning when they disagree — a learning is what somebody concluded, the table is what the account did.

**Why a selection rule and not retrieval.** The obvious alternative is to embed the learnings and retrieve the *k* most similar. It fails here for a specific reason: a "gap" in this product is defined by a learning being *absent* at one retailer, and similarity search cannot see an absence. A deterministic rule — same brand, then same category, then recency — can be wrong; it cannot be *silently* wrong, because it reports what it excluded and can be diagnosed afterwards.

**Why thin groups are shown and flagged rather than filtered out.** A group holding one row and $180 of spend can show a 4.8x that means nothing. Removing it looks safer and is not: the absence of an angle from the block reads as "never tested", which is a different and equally wrong conclusion. It is reported with a `[THIN]` marker and the prompt is told that a thin group's ratio is not evidence and that the honest move is to route it to `evidenceGaps` as something worth testing properly.

**Forcing condition:** a portfolio where the ranked 25 still misses learnings an operator expected to see. The rule is stated precisely so that complaint is diagnosable; if it arrives, the fix is a better rule, not a switch to retrieval.

---

## Briefs are versioned, because a brief that can be overwritten cannot be checked

**Decision:** `saveRecord` appends to a `briefs[]` history rather than replacing `record.brief`. Records written before versioning fold in as v1 rather than being lost.

**Why:** the previous behaviour destroyed the prior brief's `wouldFalsify` on every regeneration — the one field that makes a creative round settle a question rather than just produce assets. An initiative's prediction is frozen at launch precisely so it can be checked against the outcome later; the brief that justified the creative deserves the same treatment. Without it there is no way to tell whether the brief behind a winning ad said something different from the one currently on file, which makes the whole falsifiability discipline decorative at the creative layer.

---

## AI spend is recorded per call, priced at the point of use, and scoped to one browser

**Decision:** `postProxy` in `services/ai/_shared.js` wraps every text call, records a ledger row (`services/usage.js`, `KEY_USAGE`) with tokens, model, feature group, call site and computed cost, and the admin console renders rollups by group, model, provider and call site.

**Why it was possible all along:** every proxy response already carried its token counts — Anthropic returns `usage` natively and `api/_adapters.js` normalises Gemini's `usageMetadata` and OpenAI's `usage` into the same shape. They were simply discarded. The console could say which model served which feature group and nothing could say what that choice cost.

**Why recording lives in one helper rather than at twelve call sites.** The fetch/ok-check/parse/error-check preamble was copy-pasted into all twelve; a thirteenth copy is where drift starts, and a call site that forgets to record is invisible in the console rather than obviously broken. Folding it into one function removed the duplication and made recording unavoidable in the same edit.

**Why the rate is stored with the figure.** A ledger holding only tokens has to be re-priced against whatever the catalogue says today, which silently restates history every time a provider changes a number. Freezing the rate onto the row is the same discipline as the prediction snapshot: preserve the inputs to a figure you will later be asked to defend.

**Why an unknown rate is `null` and never `0`.** An unpriced call is missing information, not a free one. Counting it as zero produces a cheaper total than actually happened — wrong in the direction that flatters the operator, which is the direction this codebase consistently refuses (see the unparsed-row handling in every breakdown). Every unverified model id in the catalogue therefore ships with no price at all: a rate attached to an id that may not exist is a guess on top of a guess.

**Why per-browser, and why that is stated in the UI.** The routing this console edits is server-side because every visitor shares it. Spend is not: it is a record of what this operator's browser spent, and a server-side ledger would mean an ingest endpoint, a store, and a retention policy for data whose only consumer is the person who generated it. That is the same Phase 5.3 fact-table problem, not this panel's. The cost is honesty about the scope, which the panel's footer states rather than implying a completeness it does not have.

**What these figures are not:** an invoice. No promotional pricing (Sonnet 5's $2/$10 runs against a $3/$15 list through 2026-08-31), no prompt-cache discount, no batch tier, no negotiated rate, and a Vertex-billed deployment is priced here at Developer API rates. Every row is stamped `costBasis: "estimate"` so a later reconciliation against a real billing export can overwrite it without anyone having to guess which figures were measured.

**Forcing condition:** a second operator, or a client asking what their own workspace cost to run. Either makes the per-browser scope wrong rather than merely partial, and both land with the same Supabase migration the performance fact table needs.

---

## Phase 5.1–5.3: the learning agenda, the kill-criteria gate, and diagnostic escalation

**Decision:** All three shipped as scoped in ROADMAP.md's "Shipped" notes under each section, with three deliberate departures from the prose worth recording here rather than only there.

**Backward test design is deterministic, not an AI call.** ROADMAP 5.1 describes deriving what to hold constant, what to vary, sample size and a falsifying result from a named question. Every other AI-assisted flow in this app (`callExpandRecommendation`, ICE Assist) grounds itself in real portfolio evidence — win rates, cited past learnings, actual revenue — and is explicit that a low-evidence answer must say so rather than default to a confident middle score. An agenda question has no evidence yet by construction: it is the thing nothing has been run against. Asking a model to invent hold-constant/vary/sample-size for it would be producing exactly the confident-sounding filler the rest of the app's AI discipline exists to refuse. `seedInitiativeFromAgenda` instead carries the operator's own structured fields — written when they named the question — forward verbatim into the seeded initiative. If a real corpus of answered agenda items accumulates, deriving *general* test-design guidance from that corpus would be evidence-grounded in the way the current AI calls are; deriving it from a single unanswered question would not be, no matter which model runs it.

**Kill-line progress is elapsed-vs-planned-window, not an evaluation of the criteria.** Kill criteria stay free text on purpose — the value of the field, per FormView's own placeholder, is that an operator writes the actual stop condition for *this* test rather than filling in a template. Structuring it into machine-checkable fields (metric, threshold, comparator) would be a second, larger feature with its own UI and its own failure modes, and it isn't what "shows live distance to its kill line" requires: every Running initiative already carries a start/end window, and most kill criteria are phrased against exactly that window ("after 2 weeks", "by the time this ends"). Elapsed/planned is the honest proxy available without inventing a field the operator has to keep in sync with the one they actually wrote.

**The breakdown paste-back is a sibling parser, not a literal third branch of `detectCsvShape`.** ROADMAP 5.3 says `detectCsvShape` needs a third branch. `detectCsvShape` exists to *route* an arbitrary uploaded file between the weekly and campaign-level importers when the operator hasn't said which it is. The diagnostic-escalation paste-back has no such ambiguity to resolve — the panel already told the operator exactly which axis to pull, so the shape is known before a single row is read. Overloading the shared routing function with a case that never needs routing would have added a branch every future caller of `detectCsvShape` has to reason about for no benefit. `parseBreakdownCSV` in `services/diagnosticEscalation.js` is the third shape's parser; it just isn't reached through the first function's dispatch.

**Forcing condition for revisiting the deterministic choices above:** enough closed initiatives with recorded evidence (`item.evidence`) that a genuinely evidence-grounded backward-design assist, or a data-driven (rather than naming-schema-proxy) dimension ranking, becomes possible. Neither exists on day one of either feature.

---

## The per-workspace cost model is built from the ledger, not from assumed call volumes

**Decision:** `/admin → Cost model` (`src/services/costModel.js`, `src/admin/CostModelPanel.jsx`) projects a monthly AI spend figure from the same per-call ledger `usage.js` already writes: observed calls/week and observed $/call, per feature group, over an operator-chosen window, multiplied out to a month and held against an editable price.

**Why the rate is read from the ledger instead of hand-typed per group.** A plausible-looking constant ("a debate costs about $0.30") is exactly the confident-sounding filler the rest of this app's AI discipline refuses to produce from no evidence — see the backward-test-design note above. It would also go stale silently the first time an operator repoints a group in the routing console, since the projection would keep citing the old model's price. Reading `usd / pricedCalls` out of the actual ledger means the number is always priced against whatever is actually running.

**Why an unpriced group is reported as unknown rather than folded into the total as zero.** Same rule `usage.js` already applies to a single row: a group with a scenario pace above zero but no priced calls in the window is missing information, not free to run. `projectMonthlyCost` excludes it from `totalUsd` and returns it in `unknownGroups`, and the panel says so next to the number rather than only in a footnote — a total that quietly omits video and calls itself the projection is wrong in the direction that flatters the operator.

**Why "scenario calls/week" is editable and separate from "observed calls/week."** The observed pace is what this browser's ledger actually logged, which is usually the operator's own testing rather than a client's real cadence. The floor commercial.md asks for — "the margin is fine until somebody runs debates daily and generates video" — is a question about a pace that hasn't happened yet, so the model has to be able to represent a pace that hasn't happened yet. The scenario seeds from the observed pace (so the default view is "what actually happened") and is free to edit from there; it resets to the observed pace whenever the rate window changes, on the same render-phase-reset pattern `GroupCard` already uses for its own pending/current state, so there's no `useEffect` calling `setState` on mount.

**Scope, same as `usage.js`'s own admission:** per-browser, estimate-only, list rates. A workspace deployed per client (per the config-first multi-tenancy decision above) means one browser's ledger is one client's real usage, which is what makes the projection meaningful rather than a mix of everyone's testing — but it is still this operator's browser specifically, not an account-wide read. Same Phase 5.3/Supabase forcing condition as the spend ledger it's built on.

**Forcing condition:** a second operator on the same workspace, or the Supabase migration landing and making a server-side ledger cheap — either turns "per-browser" from an accepted scope into a wrong one.

---

## A debate is saved from its first turn, because the transcript is the asset

**Decision:** `services/debateRun.js` models a Signal AI debate as a record that exists before the first call and is written after every turn. `CopilotPanel` holds the run in a local variable rather than component state and saves through on each update; `App.jsx` upserts by id. A run left unfinished is re-labelled on load and can be synthesised from History without re-debating.

**What was wrong.** `runDebate` wrapped the whole loop — up to 8 agent turns, each with up to 4 tool round-trips, plus a moderator call between turns and a synthesis — in one try/catch, and called `onSaveDebate` only after synthesis returned. So a rate limit on turn seven, a dropped connection, or a malformed synthesis discarded 25 to 48 reasoning-model calls that had already been billed. The synthesis error even told the operator to "open this debate in History to keep the transcript", which was impossible: the throw happened before the only line that saved anything. `callAgentTurn` had the same shape at a smaller scale, throwing on its tool-iteration limit and taking the whole debate with it; it now withholds the tools on the final iteration, which forces a text answer instead.

**Why the record is minted before any work happens.** An id is what every later update addresses. A record that only gets an identity once it succeeds cannot be updated on the way there, which was precisely the old failure — there was no row to append a turn to, so turns lived in a local array that a throw discarded.

**Why the save handler had to change too.** `onSaveDebate={debate => saveDebates([debate, ...debates].slice(0,20))}` closed over the `debates` array from the render that created it. Saving once at the end hid that; saving twenty times would have prepended to the same stale list twenty times, scattering one debate through History as a dozen partial copies. `saveDebateRun` takes a functional update and `upsertRun` replaces by id.

**What "survives leaving the page" does and does not mean.** Closing the panel, switching views, navigating away: fully supported, and the loop keeps running and keeps writing because it depends on nothing still mounted. Escape-to-close was re-enabled for the same reason — it was disabled only because closing used to be destructive. Closing the tab or reloading: the loop dies with the page, because a browser tab is not a job runner. What that leaves is a run marked `running` with every completed turn intact, which `reconcileOnLoad` re-labels as awaiting synthesis so it can be finished in one call instead of paid for again. Genuine unattended continuation needs the loop to run somewhere that outlives the page.

**Forcing condition:** the background-execution engine in ROADMAP Phase 3. This module is the state model that work would drive — the statuses already distinguish "executing" from "has turns, needs synthesis", which is the distinction a server-side runner would write.

---

## Caching is placed where the repetition actually is, and the ledger reports whether it worked

**Decision:** `buildRequest` gains `cacheMessages`, which marks the last content block of the last message as a cache breakpoint; the debate's portfolio snapshot moves from the first user message into the system prompt; and every ledger row records `cacheReadTokens` / `cacheWriteTokens`, priced at their own multipliers and rolled up as a cache hit rate in the spend console.

**Why the existing `cacheSystem` was buying nothing.** Caching is a prefix match and a breakpoint below the model's minimum cacheable prefix is silently ignored. Measured, this app's system prompts run 250-1,000 tokens against a 1,024-token minimum on Sonnet 5 — so `cacheSystem: true`, set at six call sites, was a no-op at all of them. Nothing failed and nothing logged. Meanwhile the content that genuinely repeats — the portfolio snapshot, the tool definitions, the growing transcript — lived in `messages`, where no breakpoint was ever placed, and was re-billed in full on every one of a debate's 25 to 48 calls.

**Why the portfolio snapshot moved into the system prompt.** It is identical on every turn, so it belongs with the stable content rather than inside the conversation that grows; every agent now sees it directly rather than only the opening one inheriting it through the transcript; and it carries the prefix over the cacheable minimum, which is what makes the system breakpoint real. The per-agent persona is ordered after it so the shared portion of the prefix stays shared across agents.

**Why the cache counts are recorded separately rather than folded into `inputTokens`.** They bill at different rates — a read at roughly a tenth of input, a write at roughly 1.25x — so folding them in would misprice every cached call in both directions. Recorded as null rather than 0 on providers that do not report them, so "this provider cannot tell us" stays distinguishable from "nothing was cached", and the hit rate is null rather than 0% when nothing reported at all.

**Why the hit rate is surfaced in the console.** It is the only way to answer "is prompt caching doing anything" from inside the product, and the absence of that answer is why six call sites could claim caching for as long as they did.

**Forcing condition:** a group routed to a model whose provider reports cache usage in a different shape. The adapters normalise the Anthropic `usage` shape today and the non-Anthropic ones carry `cacheMinTokens: Infinity`, so no breakpoint is ever built for them — that stays true only while none of them ships prompt caching worth using.

---

## Structured outputs where the provider supports them, prompt-and-parse everywhere else

**Decision:** `services/ai/schemas.js` holds a JSON schema per structured call site, emitted as `output_config.format` when the routed model declares `structuredOutputs`. `safeParseJSON` and the prompts' shape descriptions stay exactly as they were.

**Why both.** The schema removes the failure class rather than recovering from it: `safeParseJSON`'s markdown-fence stripping, balanced-bracket hunting and single-object wrapping are three recoveries from one root cause, which is that the model was asked for JSON in prose and answered in prose. But structured outputs are Anthropic-only here, and the console's model picker offers Gemini, OpenAI and Inkling — so deleting the prompt text would turn every non-Anthropic routing into a trap. The capability table decides which path a request takes, the same way it already decides `thinking` and `effort`.

**Why list-returning calls return `{items: [...]}`.** Structured outputs constrain a root object, not a root array. `unwrap()` reads both that and the bare array a non-schema model returns, so no call site has to know which model served it, and it returns `[]` rather than null for anything unreadable — callers iterate immediately, and null would move a clear parse failure into an unrelated `TypeError` one frame later.

**Why `additionalProperties: false` and enums on the scored fields.** A key nobody reads is a key somebody eventually reads by accident. The candidate `confidence` field is constrained to the three strings `App.jsx` ranks on, because anything else silently scores 0 and sorts to the bottom with no visible cause.

**Forcing condition:** a second provider shipping a compatible schema parameter. At that point `structuredOutputs` stops being a proxy for "is Anthropic" and the adapter needs to translate the format rather than the capability table suppressing it.

---

## The catalogue's `price` is what a call costs us, not what a client is charged

**Decision:** `MODEL_CATALOGUE.price` carries the provider's published rate and nothing else. Claude Sonnet 5 corrected from $3/$15 to $2/$10.

**Why the correction mattered.** The entry described $3/$15 as list with $2/$10 as a promotion expiring 2026-08-31. That is not what the pricing page says, and while it stood every Sonnet row in the ledger overstated spend by half — in the direction that would have made a cost-model projection look worse than reality, which is the opposite of the error `usage.js` is otherwise careful to avoid.

**Why the distinction is worth stating.** There are two numbers and only one belongs in a model catalogue. Platform cost is an input to "what did this feature spend"; a client rate includes margin and is a commercial decision. Keeping the second out of this table means the two can move independently — a rate card is a multiplier over this, applied elsewhere, not an edit to it.

**Forcing condition:** the first deployment that bills a client per unit of AI work rather than per engagement. That needs a rate card object with its own owner; it does not need this table to start lying.

---

## One datastore, and it is Supabase

**Decision:** durable rate limiting and model routing move from Upstash Redis to Supabase Postgres, alongside the asset bytes already stored there. `api/_supabase.js` is the single accessor; `supabase/migrations/0003_runtime.sql` creates the two tables and the atomic counter function, and unlike 0001/0002 it is meant to be run. `UPSTASH_*` is no longer read.

**What was actually wrong.** Upstash was chosen when it was the only durable store the deployment had, and it was then never configured — while Supabase was, for blob storage, in Phase 5. So two controls described themselves as durable while running degraded in production: the rate limiter fell back to a module-level `Map`, which on Vercel is per warm Lambda instance and resets on cold start (so "250 per hour" was really "250 per instance per warm period" — not a limit at all in front of a metered API), and every routing save failed. The console did say so, to its credit; the limiter said nothing but a `console.warn` nobody reads.

**Why one store rather than two.** Neither job is Redis-shaped. Routing is a single row read once per page load. Rate limiting is a counter, and Postgres increments one atomically in a single `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement. A second managed datastore for a single-operator app is one more account, one more bill, and — as this episode demonstrates — one more thing that can be quietly unset while the code claims otherwise.

**Why the increment must be one statement.** The obvious two-step, SELECT then UPDATE, loses increments under exactly the concurrency a rate limiter exists to bound: two instances reading 249 simultaneously both write 250. The window is encoded into the key (`gos:rl:<ip>:<window index>`), carried over from the Redis implementation, so a new window is a new row and there is no reset logic to race on.

**Why RLS with no policies.** Both runtime tables deny every request carrying the anon/publishable key; only the server-side secret key, which never leaves `api/`, can touch them. A rate-limit counter a browser can reset is not a rate limit, and a routing row a visitor can write lets them repoint every AI feature in the app at the dearest model in the catalogue.

**Why raw REST rather than `@supabase/supabase-js`.** This project's runtime dependencies are react and react-dom. Every other provider is reached with `fetch` and a header — `api/_geminiAuth.js` mints RS256 JWTs with `node:crypto` rather than pull in google-auth-library. PostgREST is an HTTP API; a client library would add a dependency to serverless functions to save a fetch call.

**Not BigQuery.** BigQuery is an analytics warehouse — columnar, batch-oriented, priced per byte scanned. Every read this app makes is a point lookup on a handful of rows on a request path someone is waiting on, which is the workload BigQuery is worst at. It becomes the right tool if cross-client performance-fact analysis ever arrives at a volume Postgres struggles with; that is a different question from where application state lives, and Postgres would still hold the state.

**Forcing condition:** the ledger and portfolio state moving server-side (Phase 5.3 / the 0001 and 0002 migrations). At that point this is no longer "two tables for runtime controls" and the schema deserves a proper review rather than being extended a table at a time.

---

## Debates run on the server, one model call per invocation

**Decision:** the Signal AI debate loop moves out of the browser into `api/debate.js`, a state machine over a `debate_runs` row. Each serverless invocation advances a run by exactly one model call and dispatches the next; the browser starts a run with a portfolio snapshot and then only polls. `supabase/migrations/0004_debate_runs.sql` is live and must be applied.

**Why "resume it later" was not good enough.** The previous change made a lost debate non-destructive: every turn was saved, and an unfinished one could be synthesised in a single call rather than re-run for twenty-five. That was a real fix and it is still the fallback. But the honest limit stood — the loop *was* the page, so closing the tab stopped the work — and "you can pick it up afterwards" is a materially weaker promise than "it kept going" for the feature that takes several minutes and is the product's centrepiece.

**Why one model call per step, not one agent turn.** A turn can make up to five calls (four tool round-trips then the answer). Five sequential reasoning-model calls is exactly the shape of thing that passes a local test and times out in production; a single call is bounded by the model's own latency, which is the only bound actually available. It also means the unit of work is the same size regardless of how tool-happy an agent is.

**Why the snapshot is frozen at start.** The server cannot reach the operator's browser storage, so the portfolio has to travel with the request. Freezing it is not a workaround: a debate whose later turns read newer state than its earlier ones produces a transcript that cannot be interpreted against any single portfolio. Same discipline as the frozen launch prediction.

**Why there is a lease.** Two things can legitimately try to advance one run — the chain, and the sweeper that restarts broken chains. Without a lease both do, and the debate forks: two invocations appending to one history, each unaware of the other, both billed. `claim_debate_step` takes it in one statement for the same reason `increment_rate_limit` is one statement.

**Why the sweeper is client-driven rather than a cron.** Chains break, and a run whose chain broke sits at `running` with nothing driving it — the exact failure this endpoint exists to remove, reintroduced by its own mechanism. The client asks for a sweep while it polls, so an operator who reopens the app repairs their own stalled runs by looking at them. That also avoids a scheduled-function dependency, which the Hobby plan does not offer at a useful interval.

**Why `step` is authorised on an HMAC rather than an origin.** A server-to-server call has no Origin header to check. The token is an HMAC of the run id keyed by the Supabase secret — a value that already must be present for any of this to work and that never leaves the server. Without it, `step` would be an unauthenticated way to make this deployment spend a reasoning model's budget in a loop.

**Why the worker does not call `/api/proxy`.** It was the obvious first idea and it is wrong three times over: the proxy authorises on Origin, so it would need a bypass — a second way past the control that bounds spend; it rate-limits per IP, and every step would arrive from the same egress address, so one debate would throttle itself against a ceiling meant for a person; and it doubles the hops for nothing. `api/_textCall.js` shares the provider *translation* and skips only the transport guard, which exists because the browser is untrusted. The model allowlist and token ceiling still apply — it calls the proxy's own `validateBody` on every body.

**Forcing condition:** a second feature needing background execution (Next Plays across a large portfolio is the likely one). At that point the run table, the lease and the chain are a general job runner wearing a debate's name, and should be extracted before a third caller copies them.

---

## The demo ships an ad account, and it is authored to break the parser

**Decision:** `config.demo.js` seeds a fabricated campaign export — 44 rows across Meta, Google and Klaviyo — loaded into Performance on first visit and restored by both reset controls. The rows are authored **raw**, with no parse results, and are annotated at load through `annotateRow` against the schema resolved from live settings. Eight parse and attribution failure modes are planted deliberately, documented with their expected figures in `docs/seed-demo-patterns.md` §7.

**Why the demo needed this at all.** `perfRows` initialised to `[]` and no seed initiative carried an `adNames` claim, so on a cold load the bridge — the parser, the four-way split, the dimension pivot, the whole differentiated half of the product — had nothing in it. The tour said *"Import a campaign export and every ad name is parsed back through your naming convention"*, which describes the moat while showing the commodity. A visitor who opened the link unaccompanied got a well-built experiment tracker, which is the one thing the positioning documents insist this is not. The seeded ledger was carrying a demo whose thesis lived behind a file picker.

**Why the rows carry no parse results.** A config authoring `parsed: true` and a `values` map would be asserting an outcome the parser is supposed to produce. The moment a vocabulary changed, the seed would claim a name parsed that the live parser refuses — a demo lying about the exact behaviour being demonstrated. Annotating at load costs one map over 44 rows and buys the property that every figure on the page (parse rate, unparsed spend, the split) is computed by the same code a client's CSV goes through. Edit a vocabulary in Settings → Taxonomy and the numbers move.

**Why the defects are the point.** A clean fabricated account demonstrates nothing; anyone can invent rows that add up, and an audience with operating experience reads tidy fixtures as fixtures. What cannot be faked cheaply is knowing which eight things go wrong in a real account — a dropped slot, a delimiter inside a creator's name, a theme nobody declared, a tag pointing at a deleted initiative, two initiatives claiming one campaign — and having a considered answer to each. The fabricated data is honest about being fabricated precisely because it was built to fail.

**Why a naming overlay rather than editing the shipped registry.** The shipped vocabulary is a snack brand's (Pastry, Donuts, PinkSprinkle); the demo's brands sell candles, coffee and technical outerwear. Widening the registry in `naming.js` would push one deployment's product taxonomy into shared app code. `SEED_NAMING_CUSTOM` goes through `settings.namingCustom` — the same overlay any workspace uses — so the demo exercises the extension mechanism instead of bypassing it. It adds vocabulary only; a custom *dimension* would append a slot and break every name already built.

**Why the seeded debate stays empty.** The same array seeds Signal AI history, and it holds real captured runs or nothing. Fabricated brands and figures are announced as fabricated on arrival; a transcript implied to be model output that was actually written by hand misrepresents what the system does, which is a different and worse class of fiction. A captured run carries the model and date that produced it.

**What this exposed.** `assignedNameConflicts` had been computed since the claim bridge shipped and was never rendered — one name claimed by two initiatives resolved first-wins with nobody told, which is precisely the quiet-corruption failure the naming module is built to refuse. It now reports in Attribution → Needs a look. The planted conflict found a real gap rather than decorating one.

**The agenda is authored; the model outputs are not seeded at all.** The same commit seeds six learning-agenda questions, and that is legitimate for a reason worth stating: an agenda question is operator judgement, which is why `seedInitiativeFromAgenda` derives an experiment from one deterministically rather than through a model. Fabricating a question is fabricating a person's opinion, which the demo announces. Fabricating a debate transcript, a creative brief or a Next Plays batch would be fabricating *the system's* output, which it cannot announce without undermining the thing being shown. So those surfaces stay empty until real runs are captured and stamped with the model and date that produced them.

**The audit sample is a second, deliberately worse corpus.** The seeded ad account follows the convention because this tool built it. `SAMPLE_ACCOUNT_NAMES` is an account as found — a different delimiter, five slot shapes, 0% parse, 100% needing manual mapping. One detail is kept rather than fixed: the audit reads slot 3 as "Age · 80.8%" because `Broad` sits in that vocabulary, and the slot is plainly an audience slot. Leaving a confident wrong suggestion in the sample is the most direct demonstration available of why the audit reports coverage and refuses to propose a taxonomy — a tool that auto-assigned that slot would have been silently wrong in a client's first week.

**Forcing condition:** the first real client export going through this path. At that point the seeded account is a fixture competing with real data for the same view, and it should move behind the workspace-mode switch that already distinguishes demo from live — a live workspace should never seed it.

---

## Workspace state moves to Postgres as documents, and only the facts become rows

**Decision:** Phase 2.0 re-backs `store.js` with Supabase Postgres for a signed-in workspace. Operator-authored state — initiatives, settings, agenda, debates, recommendations, creative, asset records, the usage ledger — is one JSONB **document per store key**. Performance facts become a real **table** with no cap. Device preferences (theme, library view, rail, tour-seen) stay in `localStorage`. The normalisation drafted in `0001_init.sql` is deliberately not done.

**What forced it, and it was not a client.** The soft trigger recorded elsewhere in this file was "the first client who needs a second user, a second device, or who asks where their data is stored." None of those arrived. What did was `PERF_ROW_LIMIT = 5000` in `services/performance.js`: browser storage caps around 5MB, so the importer dropped the oldest rows on every merge and reported the count. The campaign↔experiment bridge is the part of this product no competitor has and the part that ingests the most rows, and it was throwing away the history the whole thesis rests on. "Every experiment should make the next one smarter" is not a claim a store that forgets can support.

**Why documents rather than the relational schema already drafted.** Because normalising is not a storage change. Every read path in `src/services/` — `portfolio.js`, `performance.js`, `items.js`, `learningAgenda.js` — is a synchronous pure function over an in-memory array, and the test suite is written against that shape. Turning those into SQL converts a synchronous codebase into an async one and rewrites most of the suite, in the same change that first points the app at a network it has never depended on. That is two risky changes wearing one name, and the second one is not the one that fixes the data loss.

The split is therefore by what actually grows: a person types initiatives and settings, and a platform export generates performance rows by the tens of thousands. Documents for the first, a table for the second. Phase 5.4 then adds typed dimensions and `GROUP BY` reads on top of a table that already holds real history, which is a better starting position than the one it would have had.

**Why facts are stored and the parse is not.** `performance_rows` keeps the name, level, date and metrics, and not `parsed`/`values`/`parseErrors`. Those are a pure function of the name and the naming schema, and the schema changes — a dimension is appended, a vocabulary value added, a delimiter corrected. A stored parse is a cached answer whose inputs moved, and stale-but-plausible dimensions are exactly what `parseName` refuses to produce at import time. Deriving on read costs one pass and can never be stale. It is also the precondition 5.4 names for its reparse job, obtained here for free.

**Why a revision on every document.** Auth makes a workspace multi-user for the first time, and a whole-document write is last-write-wins: two people editing initiatives means one silently loses their work. `bump_workspace_doc` refuses a write whose revision moved and the endpoint answers 409 with the server's copy. This is the same rule as everywhere else in this codebase — refuse rather than guess, and never report a save that did not happen as one.

**Why the boot decision cannot read settings.** Which store answers is decided by `services/workspaceBoot.js` before a single `store.get`, on exactly two facts: is a workspace store configured, and is somebody signed in. It is deliberately not keyed on `settings.workspaceMode`, because settings come out of the store being chosen — reading it first means reading the browser copy to decide whether to read the browser copy. Signing in is the opt-in, which is also what leaves the demo untouched.

**Why no sign-in wall.** Whether a deployment should refuse to render without a session is a per-deployment decision and the demo and a client instance want opposite answers. Moving where state lives and gating who may see the app are two changes; only one of them was needed to stop losing rows.

**Why the publishable key is served rather than bundled.** `api/state.js` hands the app the project URL and publishable key at boot, the way `api/routing.js` already serves model routing. There is no `VITE_SUPABASE_*`. The key is genuinely publishable — RLS protects the rows — so this is not the mistake recorded above about the `VITE_`-prefixed shared secret. It is that a credential compiled into a build artefact is rotated by a redeploy and one served from configuration is rotated by changing configuration. The password never touches this deployment: the browser talks to Supabase Auth directly.

**Why tokens are checked against `/auth/v1/user`.** A Supabase access token is a JWT and could be verified locally with the project's JWT secret and no network hop. Local verification cannot see revocation — a signed-out session, a deleted user and a revoked refresh token all still carry a valid signature until expiry. For a surface that reads and writes a client's entire workspace, "this was valid when issued" is the wrong question. The hop is cached for sixty seconds, so it is paid once per burst.

**The hazard that is written down rather than hidden:** a performance replace deletes then inserts in chunks, so a chunk that fails leaves fewer rows than it found. It is reported, not silent, and the full set is still in memory for that session. A transactional version needs a staging table and belongs with the fact model in 5.4.

**Forcing condition:** the first read path that genuinely needs to query rather than scan — a rollup over more history than a browser should hold in memory, or a cross-workspace question. That is Phase 5.4, and it is where documents start costing more than they save. Until then, the arrays are in memory and the functions over them are pure and tested.

---

## The proxy's rate-limit identity is a person, not an address

**Decision:** `rateLimitIdentity` in `api/_guard.js` keys every metered bucket on the caller's Supabase user id when a session is present, and on the forwarded IP when it is not. Applied to all five call sites: text, image, video, debate start, debate poll.

**Why the IP was never right.** It attributes nothing to a person, and it is wrong in both directions at once. A client's growth team behind one office NAT is a single bucket, so the fourth person to open the app is rate limited by their colleagues' work. The same person on a phone gets a fresh bucket every time the network hands them a different address, so the ceiling does not hold at all. Neither failure is visible from inside the limiter, which is why both survived this long.

**Why an unverifiable token is refused rather than ignored.** A caller presenting a bearer token that does not verify gets a 401, not a quiet demotion to the IP bucket. Silently downgrading would make an expired session look like an anonymous visitor — the call succeeds, spends money, and lands in the wrong bucket — and it would let anyone shed a full user bucket by mangling their own token. Presenting a credential is a claim; a claim that fails is an error, not an absence. A caller who presents nothing is making no claim and is treated exactly as before, which is what leaves the demo working.

**Why this shipped with the migration rather than after it.** ROADMAP 2.1 already said so: the token has to come from somewhere. Building the session for state and then keying spend on IP for another phase would mean the app knowing who someone is everywhere except the one place that costs money.

**Forcing condition:** a deployment where anonymous access is not wanted at all. At that point the fallback becomes a refusal and this becomes a gate, which is the sign-in wall deliberately not built here.
