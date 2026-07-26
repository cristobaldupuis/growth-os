# Growth OS — Decision Log

Architecture decisions worth remembering. The bar for this file is a real tradeoff, not a feature shipped. Bug fixes, refactors, and routine builds don't belong here.

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

## Config-first per-client deployment (no multi-tenant auth)

**Decision:** Client context (brands, categories, agents, templates, seed data) lives in `config.js`, isolated from app logic. Each client gets a separate Vercel project with a `config.js` swap. No authentication layer, no shared database.

**Why:** Multi-tenant auth adds a meaningful infrastructure surface before there are multiple clients to justify it. The config-first model keeps deployments independent and debuggable, eliminates cross-client data risk entirely, and reduces onboarding to a single file change plus a Vercel project. The tradeoff is manual overhead at scale (4+ clients), at which point the trigger for a proper multi-tenant migration becomes obvious.

**Forcing condition:** Managing per-client config swaps and Vercel projects becomes operationally painful. The migration path is Supabase with Row-Level Security; the `store` abstraction means app logic doesn't change.

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

---

## Gold stays the accent; the dark surfaces were the problem

**Decision:** Keep the sand/gold and serif identity rather than moving to the slate/indigo palette used in adjacent products. Fix the two things that were actually wrong: gold's contrast in light mode, and the warmth of the dark surfaces.

**Why:** The complaint that dark mode "looked brown rather than golden" was correct, but the cause was not the accent. The dark surfaces were warm browns (`#1A1916`, `#232118` — R−B of +4 and +11), so accent and surface shared a hue and the gold read as mud. The surfaces are now cool neutrals (R−B of −7 and −9) and the same gold family reads as metal. That is a two-token change, not a rebrand.

Going indigo/slate would solve the same problem by removing the thing that distinguishes this product. Slate-and-indigo is the default SaaS console look — correct for an internal ops tool, where the job is to disappear and let the operator scan. Growth OS has a different job: it is a client-facing advisory artifact, shown in meetings and screenshotted into decks, and the editorial serif-and-gold treatment is what makes it look like a considered point of view rather than another dashboard. Two products, two jobs, two palettes.

**The genuine defect:** in light mode `gold` measured 2.42:1 against white — below AA, and applied to the largest, most important figures on the dashboard. Dark mode measured 10.12:1 for the same token. The palette had clearly been tuned in dark mode only. `gold` is now an ink value that passes AA on every surface it lands on, and `goldFill` is a separate bright value used only as a background behind dark text.

**Enforcement:** `npm run check:contrast` validates all 66 themed pairings against WCAG AA and fails CI on regression. The point is that this class of bug is invisible to a build that only checks the app compiles.
