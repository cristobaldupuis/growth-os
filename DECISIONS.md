# Growth OS — Decision Log

Architecture decisions worth remembering. The bar for this file is a real tradeoff, not a feature shipped. Bug fixes, refactors, and routine builds don't belong here.

---

## localStorage over backend persistence (Postgres / Supabase)

**Decision:** All state persists in `localStorage` under versioned keys, with a memory fallback for sandboxed environments. No database, no backend persistence layer.

**Why:** The storage abstraction (`store.get` / `store.set`) is backend-agnostic by design. Migrating to Postgres is a layer swap when the trigger arrives — not a rewrite. The operational overhead of a real backend (connection strings per deployment, database migrations, auth, row-level policy) is not justified before there are clients generating the pain that demands it. Supabase account exists and RLS is the planned path; the decision is timing, not direction.

**Forcing condition:** A client explicitly objects to browser-local data, or data volume exceeds what localStorage can handle reliably at realistic initiative counts.

---

## Config-first per-client deployment (no multi-tenant auth)

**Decision:** Client context (brands, categories, agents, templates, seed data) lives in `config.js`, isolated from app logic. Each client gets a separate Vercel project with a `config.js` swap. No authentication layer, no shared database.

**Why:** Multi-tenant auth adds a meaningful infrastructure surface before there are multiple clients to justify it. The config-first model keeps deployments independent and debuggable, eliminates cross-client data risk entirely, and reduces onboarding to a single file change plus a Vercel project. The tradeoff is manual overhead at scale (4+ clients), at which point the trigger for a proper multi-tenant migration becomes obvious.

**Forcing condition:** Managing per-client config swaps and Vercel projects becomes operationally painful. The migration path is Supabase with Row-Level Security; the `store` abstraction means app logic doesn't change.

---

## Serverless proxy with shared secret (not per-client auth)

**Decision:** All Anthropic API calls route through `api/proxy.js` on Vercel. The proxy validates a shared secret header (`x-gos-secret`), applies per-IP rate limiting at 50 requests/hour, and locks CORS to the production domain. One secret per deployment.

**Why:** Removes the API key from the browser entirely, which is the primary security requirement. Per-client credential isolation is a Phase 2 item — the shared secret model is a valid demo and early-client scaffold. Rate limiting protects against runaway calls during testing or demo sessions.

**Forcing condition:** A live client's token needs to be isolated from other deployments, or the per-IP rate limit proves too restrictive under real usage.

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

## Repo kept private until paying clients establish the moat

**Decision:** The repository is public, but the defensible value — prompts, agent personas, and methodology — is embedded in the codebase rather than abstracted into protected IP. The decision is to accept this and compete on relationships and process once clients exist, rather than attempt to protect the approach through obscurity.

**Why:** The code scaffolding is not the moat. The prompt engineering, the debate agent design, and the methodology encoded in the ICE scoring and learnings structure are harder to replicate without the same iteration history, but they are visible in the source. Keeping the repo private while pre-revenue adds friction without meaningful protection; going public is reasonable for a project that also serves as a professional artifact.

**Note to revisit:** If the prompts become the primary product (i.e. the system is productised and sold on the quality of its AI reasoning), moving prompts to a private layer becomes worth the complexity.
