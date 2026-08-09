# Growth OS — Decision Log

Architecture decisions worth remembering. The bar for this file is a real tradeoff, not a feature shipped. Bug fixes, refactors, and routine builds don't belong here.

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

**Why:** The alternative was requiring every brand to define `northStar`, which reads cleaner (no fallback branches, one code path) but fails the one property this config layer exists to guarantee: `config.js`, which predates per-brand North Star entirely, would need every one of its brands retrofitted before it built or ran again. That inverts the actual dependency — the generic config is the one deployment nothing else should be able to break, and a client-specific feature should never be able to reach back and impose a requirement on it. Optional-with-fallback means `config.js`'s three brands resolve to the portfolio figure exactly as they did before this existed, with zero edits, while `config.csc.js` opts in per brand. That is the same shape as the `activeConfig.js` decision above: backward compatibility with the generic config is the constraint every config-shape change gets measured against, not a nice-to-have.

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

**Decision:** Which model serves which feature is data, held in `src/services/ai/registry.js` and overridable at runtime from an admin console. Features are switched in six groups — `capture`, `analysis`, `debate`, `creative`, `image`, `video` — not individually. Each group declares a capability floor (`requires`) that is enforced both in the console's picker and server-side in `validateRouting` before anything is persisted. `api/proxy.js` derives its model allowlist from the same catalogue rather than keeping a second list.

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
