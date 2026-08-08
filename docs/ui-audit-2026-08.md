# UI / UX / usability audit — August 2026

> **Status: remediated, August 2026.** All twenty recommendations below are
> shipped. Eighteen landed in the first pass; Settings-as-a-page (with the
> taxonomy editor moving into it) and the seed backfill followed in a second.
> See ROADMAP Phase 1.7 for the list and DECISIONS.md for the entries this work
> produced.
>
> A third pass, prompted by looking at the running dashboard rather than the
> code, caught what a screenshot catches and a grep does not: two panels on one
> screen disagreeing about the currency symbol, a stacked bar whose two most
> important segments were the same colour, and one panel alive to the pointer
> while the one under it was inert.
>
> The findings are left as written rather than edited into the past tense. An
> audit that gets rewritten once it is fixed stops being evidence of what was
> wrong, and the *why* below is the part worth keeping.

Third audit pass. The first two (Phase 1.5, July 2026) were about *correctness*:
metrics that were wrong, contrast that failed, a credential in the bundle, saves
that silently vanished. Those are closed and the app is materially better for it.

This pass is about *standard*. The question is not "does it work" but "does it
read as a product a growth lead would pay $X/mo for, next to the tools they
already use". The comparison set is Stripe Dashboard, Twilio Console, Linear,
Vercel — the software this buyer has open in adjacent tabs all day, and against
which every interface they touch is silently graded.

Method: read every view, component, and shared style module; measured token
drift, contrast, and glyph usage with scripts; walked the cold-visitor path,
the weekly-operator path, and the client-meeting path. `npm run lint` is clean
and all 261 tests pass, so nothing below is a regression — it is the gap between
working and finished.

The findings are ordered by what a buyer notices first, not by effort.

---

## Tier 1 — Credibility. Noticed in the first sixty seconds.

### 1.1 The product has three names, and the client-facing export uses the retired one

`DECISIONS.md:586` is unambiguous: the product is **Marketers Lab**, `Growth OS`
is retired as a customer-facing name, and the cost of the decision is "a rename
pass across README, the app shell, the config defaults and the deployment."
README and the config defaults were done. The app shell was not.

What is actually on screen in a single session:

| Surface | Says | Where |
|---|---|---|
| Sidebar wordmark + logo mark | `GO` / **GROWTH OS** / "Experimentation engine" | `src/components/Sidebar.jsx:126–131` |
| View header subtitle | Marketers Lab | `src/App.jsx:1460` (via `settings.companyName`) |
| Client readout, copy-to-clipboard | **GROWTH OS SUMMARY** | `src/views/ClientReadoutView.jsx:461` |
| Initiatives CSV export filename | `GrowthOS_export_2026-08-08.csv` | `src/App.jsx:1473` |
| Guide drawer, onboarding, tour | Marketers Lab | `src/App.jsx:274, 463, 498` |

The third row is the expensive one. That block is the artifact the operator
pastes into a client email — the single highest-stakes string in the product —
and it carries a name the decision log retired on its merits. The first row is
the one a prospect stares at for the whole demo: the top-left corner of the app,
the most-looked-at 200px on any screen.

No shipped software survives this. Stripe is Stripe in the nav, in the invoice
PDF, and in the CSV filename.

**Fix:** one pass over the four call sites. The wordmark needs a real mark, not
`GO` — the two letters are an abbreviation of the retired name.

### 1.2 The nav vocabulary contradicts the decision that rejected it

`DECISIONS.md:590` rejects the Biosphere prototype's invented vocabulary
(Observatory, Quarantine, Vivarium, Microscope) with a good argument: the
product's pitch is that it *removes* a translation step, and inventing six words
the buyer must learn adds one back.

`src/components/navSections.js:41–54` ships Observatory, Register, Archive,
Microscope, Quarantine, Bench and Readout as a subtitle under every nav item,
and `App.jsx:1454` renders the same word as an uppercase mono label beside the
view title in the header. The file carries a long comment defending this as a
deliberate split (plain label leads, lab name is flavour) — which is a coherent
position, and better than the original mistake of replacing the labels outright.

But two records now disagree in writing, and the UI implements the one that was
rejected. Either amend `DECISIONS.md` to record that the flavour layer was
re-adopted in a subordinate position and why, or drop the `lab` field. Leaving
both is how a codebase stops being able to answer "why is this like this".

**Recommendation:** keep the vocabulary in the rail subtitle (it explains the
two-letter code, which otherwise explains nothing), drop it from the view header
(where it competes with the view title for the same glance and explains nothing
at all), and amend the decision entry.

### 1.3 The favicon belongs to another product

`public/favicon.svg` is a purple lightning bolt — `#863bff` fill, `#47bfff`
accents, gradient blur filters. Nothing in this palette is in this app. It is
starter-template residue from the same family as the Vite boilerplate
`index.css` that Phase 1.5 already removed (which had "a purple accent palette").

`public/icons.svg` is worse and unreferenced: a symbol sprite containing
**Bluesky, Discord, GitHub, documentation and social icons** at `#aa3bff`, from
an unrelated template. It is shipped to `dist/` and served.

The browser tab is the most persistent brand impression a web product has — it
is on screen the entire time the app is open, and it is what the user hunts for
when they have twelve tabs. A purple bolt from a different product is the single
cheapest credibility loss in the codebase.

**Fix:** draw a gold mark from the existing palette (a filled square with the
lab mark, or the `◆` already used as the app's motif). Delete `public/icons.svg`.

### 1.4 There is no URL routing at all

`nav` is React state (`src/App.jsx:510`). There is no router, no `pushState`, no
`document.title` update, no hash. Confirmed: zero matches for `history`,
`pushState`, `location`, or any router dependency in `package.json`.

Consequences, all of which a buyer hits within a day:

- **Browser Back leaves the app.** The only back affordance is the in-app "Back
  to Initiatives" button, and it only exists on detail/form.
- **Nothing is linkable.** You cannot send a colleague a link to initiative
  NH-003, or to the Performance → Taxonomy tab. In a tool whose whole promise is
  shared institutional memory, the memory has no addresses.
- **Refresh always lands on Dashboard**, losing your place mid-task.
- **Vercel Analytics sees one page.** Every pageview in the product is `/`, so
  there is no data on which views are used — which is exactly the data that
  should be driving the roadmap.

Stripe, Twilio, Linear and Vercel are all URL-addressable to the object level.
This is the largest single gap in the audit and it is not a large change: a
`hashchange` listener plus `nav`/`selId` serialised into the hash would cover
90% of the value in an afternoon, without adding a router dependency or
disturbing the "no router" decision (`DECISIONS.md:400`) that keeps `/admin` a
separate entry point.

### 1.5 Emoji are the icon system

788 symbol/emoji glyphs across `src/`. The concentration matters more than the
count:

| Surface | Glyphs |
|---|---|
| `views/CopilotPanel.jsx` — **Signal, the flagship differentiator** | 🎙 🎯 🏃 💡 💰 📈 📊 📋 🔧 🗂 🗺 🧠 ✅ ❌ |
| `constants.js` — metric source icons | ✏️ Manual, 📘 Meta Ads, 📊 GA4, 🔵 Google Ads |
| `views/FormView.jsx` — form field labels | 📊 Observation, 💡 Hypothesis, 🎯 Success metric, ⚠️ Blocker |
| `config.js` — C-suite agent avatars | ⚙ 📊 📣 🚀 |

Three problems, in order of severity:

1. **They render differently on every OS.** Apple Color Emoji, Segoe UI Emoji
   and Noto Color Emoji are three different illustration styles. The product
   looks like a different product on a Mac and a Windows laptop — and the client
   meeting is often on the client's machine.
2. **They cannot be themed.** Every other colour in this app is a token that
   flips between `TL` and `TD` and is contrast-checked in CI. Emoji ignore all of
   it, which is why 📘 for Meta is a *blue book* sitting in a gold-and-charcoal
   palette.
3. **They are typed as free text.** `SettingsModal.jsx:103` renders a 44px text
   input whose value is an emoji character. The agent avatar system is "paste a
   character in a box".

Neither Stripe nor Twilio ships an emoji in product chrome. Both use a single
monochrome stroke set that inherits `currentColor`.

The app already knows how to do this: `views/LearningLibrary.jsx:15–22` has two
hand-drawn 16px `viewBox` icons with `stroke="currentColor"` and
`aria-hidden="true"`, and they are the best-looking glyphs in the product. That
is the pattern — it exists in exactly one file.

**Fix:** a `components/icons.jsx` with ~20 stroke icons at a 16px grid, all
`currentColor`, replacing every emoji in chrome. Emoji stay allowed in
user-authored content and in AI output; they are banned from labels, buttons,
tabs, avatars and source badges.

### 1.6 Two "Placeholder" panels ship in the product

- `views/FormView.jsx:229–235` — a "Data context" card in the primary initiative
  form, badged **Placeholder**, whose own textarea placeholder text reads
  "Future: will connect to Google Sheets, GA4, Meta Ads."
- `components/SettingsModal.jsx:216–222` — a "Data sources" section badged
  **Placeholder · coming soon**, ending in an empty state that says "No data
  sources connected yet."

Roadmap honesty is good in a README. Inside a client-facing tool it reads as an
unfinished build. The Data context field is worse than decoration — it is a real
input that feeds the AI calls, wearing a badge that tells the user not to trust
it.

**Fix:** drop the badges. Rename Data context to what it does ("Supporting
data — pasted metrics the AI will read") and let it be a finished feature that
happens to be manual. Delete the Data sources section entirely until there is
one to connect; an empty section is not a roadmap, it is a gap.

---

## Tier 2 — Usability. Hit within the first working session.

### 2.1 No modal closes with Escape, and none traps focus

Eleven modals, two drawers (Guide, Signal), and the guided tour. Across all of
them: **zero** `keydown` handlers for Escape, zero `role="dialog"`, zero
`aria-modal`, zero focus trap, zero focus restoration on close. The only
keyboard handlers in the app are five `Enter`-to-submit bindings.

The whole app has one `role` attribute (`role="alert"` on the storage banner,
`App.jsx:1489`) and eight `aria-*` attributes total.

Escape-to-close is the single most reflexive interaction in dashboard software.
Its absence is felt immediately and constantly — including in the guided tour,
where a cold visitor who wants out has to find the small underlined "Skip".

**Fix:** put it in `Modal.jsx` once — a `useEffect` binding Escape, a focus trap,
`role="dialog" aria-modal="true" aria-labelledby`, and focus return to the
trigger. Every modal in the app already routes through this component, so it is
one file. The two drawers and the tour need the same treatment applied by hand.

### 2.2 Not one form field in the product is labelled

`components/FR.jsx` is the label primitive used by every form in the app:

```jsx
<label style={{...}}>{label}</label>
{children}
```

No `htmlFor`, and the input is a sibling rather than a child. So the association
does not exist, anywhere. Two consequences:

- **Clicking a label does not focus its field.** Users do this constantly without
  thinking about it; here it silently does nothing.
- **Every field is unlabelled to a screen reader.** Not "poorly labelled" —
  unlabelled. `FormView` alone has ~20 of them.

The same pattern is hand-rolled in `SettingsModal`, `OnboardingModal` and the
Initiatives filter row.

**Fix:** `FR` generates an id, sets `htmlFor`, and clones the child with a
matching `id`. One component, and it fixes every form at once.

### 2.3 The required fields are not required

`FormView` marks four fields with `*` — Title, Observation, Hypothesis, Success
metric (`FormView.jsx:26, 34, 41, 60`) — and README calls this the "structured
hypothesis enforcer: every initiative requires three distinct fields".

Save is disabled on `!form.title` and nothing else (`FormView.jsx:243`). You can
save an initiative with no observation, no hypothesis and no success metric. The
enforcer does not enforce.

There is also **no inline validation anywhere in the product**: no error text
under a field, no `aria-invalid`, no `required`, no summary on submit. The only
feedback mechanism is a toast, and toasts are used for outcomes, not for
validation.

This one is not cosmetic. The pre-registration discipline is the product's
actual claim; a form that marks a field required and then accepts it empty
teaches the operator that the discipline is optional.

**Fix:** disable Save until the four starred fields are non-empty, with inline
messages naming what is missing, and a one-line explanation of why the field is
required (it is the thing the calibration ledger later compares against). This
is a case where friction is the feature.

### 2.4 In-progress work is discarded silently, in two places

- **The initiative form.** Clicking any sidebar item while editing switches
  `nav` away; the form is never rendered again and there is no route back to it.
  Cancel discards without asking. No autosave, no draft, no dirty check, no
  `beforeunload`.
- **The Settings modal.** Nine sections of editable state held in local state
  (`SettingsModal.jsx:9`). Clicking the scrim calls `onClose` (`Modal.jsx:4`) and
  every edit is gone — brand briefs, agent lenses, health metric targets, all of
  it. Reconfiguring five health metrics and then mis-clicking the backdrop loses
  ten minutes.

Stripe's answer is a dirty-state guard on close; Linear's is autosave. Either
beats the current behaviour.

**Fix:** track dirty state in both; on scrim/Escape/Cancel with edits present,
confirm. The confirmation modal pattern already exists (Reset demo, Restore
backup) and is good — it just is not applied here.

### 2.5 Deleting an initiative uses a native `confirm()` and cannot be undone

`views/DetailView.jsx:33`:

```jsx
<button ...>onClick={()=>{if(confirm("Delete this initiative?"))onDelete();}}>🗑</button>
```

Four problems in one line: it is a native dialog (README claims "all native
browser alerts replaced with in-app slide-up toasts" — two `confirm()` calls
remain, the other at `PerformanceView.jsx:581`); it does not name the initiative
being deleted; the button is icon-only with no `title` or `aria-label`; and the
deletion is permanent with no undo, taking the frozen prediction snapshot and
every logged learning with it.

This is the app's most destructive action and it has the least ceremony —
strictly less than "Reset demo data", which gets a proper modal naming exactly
what it overwrites.

**Fix:** the existing confirmation modal, naming the initiative and its ID, plus
an undo toast (keep the deleted record in state for 10 seconds). Label the
button.

### 2.6 Nothing can be found from anywhere

There is no global search and no command palette. To find an initiative you must
already know which view it lives in, navigate there, and filter. Search exists in
exactly two places, both scoped: keyword search inside the Library, and a
typeahead inside the linked-initiative picker.

There are no keyboard shortcuts of any kind.

For a portfolio product spanning multiple brands and four statuses, "where is
the thing I am thinking of" is the most frequent question the interface has to
answer, and right now it answers it with navigation. ⌘K is table stakes in this
comparison set — Stripe, Linear, Vercel and GitHub all have it.

**Fix:** a ⌘K palette over initiatives (title, `initId`, hypothesis), learnings,
and nav destinations. It is a single component over data already in memory, and
it is the highest perceived-quality-per-line change available.

### 2.7 The explanations are all in native tooltips

57 `title=` attributes carry a large share of the product's explanatory copy —
including the entire sidebar blurb system, which `navSections.js` documents as a
deliberate move ("it moved to the tooltip, where it costs no height").

Native `title` has three properties that make it the wrong home for content that
matters: it never appears on touch devices, it takes ~1s to appear on desktop,
and it cannot be styled or themed.

The consequence is concrete: below 900px the sidebar is hidden and reachable only
via the burger drawer, and in the collapsed rail state on desktop each nav item
is a two-letter code (`OB`, `RG`, `AR`, `MS`, `QR`, `BN`, `RO`) whose only
explanation is a tooltip. On a tablet, the collapsed rail is seven unexplained
monograms.

**Fix:** a small themed `<Tooltip>` (hover + focus, `aria-describedby`,
touch-friendly), applied to the nav first. Keep `title` only for genuinely
redundant hints.

### 2.8 Nine clickable `<div>`s, including the primary row target

`App.jsx:1077` — the initiative card, the most-clicked element in the product —
is a `<div onClick>` with no `tabIndex`, no `role`, no key handler. Same for the
Triage row title (`TriageView.jsx:200`), the linked-initiative rows
(`DetailView.jsx:252`), the template picker (`App.jsx:1704`), the citation rows
(`NextPlaysModal.jsx:163`) and the guide section headers (`App.jsx:248`).

`tabIndex` appears zero times in the codebase. You cannot reach an initiative
with a keyboard.

**Fix:** these are all `<button>`s with `text-align:left` and a reset background.
The `interactive()` helper they already use handles `:focus-visible` correctly,
so the styling is free once the element type is right.

---

## Tier 3 — Consistency and craft. Not blocking, but this is what "best in class" means.

### 3.1 There are colour tokens and nothing else

`constants.js` has a genuinely good colour system — two themes, semantic ink vs
fill separation, and 66 pairings gated in CI. There is no equivalent for
anything else, and it shows:

| Dimension | Distinct values in `src/` | What a design system uses |
|---|---|---|
| `borderRadius` | **13** (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 20) | 3–4 |
| `fontSize` | **24**, including 9.5, 10.5, 11.5, 12.5, 13.5, 14.5 | 6–8 |
| Button `padding` pairs | **~60** | 3 (sm/md/lg) |

Supporting numbers: 1,697 inline `style={{...}}` objects; 173 `<button>`s, of
which 63 are entirely bespoke and 110 use a shared helper — but 127 of those
usages spread-override it inline (`{...gG(t),fontSize:11,padding:"5px 11px"}`).
The helpers in `components/styles.js` are nine one-liners and are treated as
suggestions.

The effect is subtle but constant: nothing quite lines up, the same button is
four sizes on four screens, and cards have four different corner radii within one
view. This is precisely the difference a user registers as "polished" without
being able to name it.

**Fix:** extend the token object with `radius`, `space` and `size` scales, then
add a `variant`-based `Button`/`Card` so the override path is a prop rather than
a spread. Sweeping all 1,697 inline styles is not the job; capping the vocabulary
and converting buttons and cards is.

### 3.2 Four currency formatters that disagree

| Where | `$2,400,000` renders as | `$41,200` renders as |
|---|---|---|
| `constants.js:288` `fmtCur` | `$2.4M` | `$41k` |
| `TriageView.jsx:10` local `fmtCur` | **`$2400k`** | `$41k` |
| `DashView.jsx:175` local `fmtK` | `$2400k` | **`$41.2k`** |
| `portfolio.js` (AI context) | `$2,400,000` | `$41,200` |

`TriageView` also re-implements `fmtDate`, `parseD` and `iceScore` locally, and
its `fmtDate` drops the year while the shared one keeps it — so the same
initiative shows "Aug 12" in Triage and "Aug 12, 2026" everywhere else.

Separately: `$` and the `en-CA` locale are hard-coded throughout. There is no
currency setting. A UK or EU client sees dollar signs against their own numbers,
in a tool whose core artifact is a revenue claim they forward to their board.

**Fix:** delete the local formatters and import the shared ones. Add
`settings.currency` + `settings.locale` and thread them through `fmtCur` /
`fmtDate`. The date and money formatting is the last mile of looking financial-
grade, and it is currently three different answers.

### 3.3 The contrast gate exempts the app's most-used ink

`scripts/check-contrast.mjs` is a genuinely good idea and its 66 pairings all
pass. But it holds `textMuted` to AA-Large (3:1) rather than AA (4.5:1), on a
stated assumption:

> Muted is micro-label only — held to AA Large. […] used exclusively for
> uppercase micro-labels that are decorative context rather than content.

The code does not honour that assumption. `t.textMuted` appears **395 times**
(against 129 for `textSub`), and it is:

- the label colour for every form field in the product, via `FR.jsx:4`
- every table header and half the table *cells* in Weekly Pulse (Date, Source)
- the sublabel under every KPI tile
- used at 9–10.5px in 190 places

Measured: `4.05:1` on `bg`, `4.47:1` on `surfaceAlt` (light theme). Both are
below AA, and AA-Large only applies at ≥18.66px regular / ≥24px bold — which
none of these are. The exemption is the one place the palette is not actually
held to the standard the gate exists to enforce.

**Fix:** darken `TL.textMuted` from `#74716A` to roughly `#6B6862` to clear 4.5:1
on `bg`, then hold it to AA in the gate. If a genuinely decorative tier is
wanted, add a separate `textFaint` token and check *it* at AA-Large — so the
exemption names the thing it applies to rather than the thing that is used
everywhere.

### 3.4 One media query in the entire application

`App.jsx:1303` — the 900px rail/burger swap. That is the whole responsive system.

Because every style in the app is an inline object, media queries are
structurally impossible except through that single `<style>` string. What that
costs:

- **18 hard-coded `1fr 1fr` grids** that never collapse — the results modal's
  cost fields, the ICE review pair, six brand-brief fields in Settings and
  Onboarding, the calibration card's three columns.
- The **Initiatives filter row** is five `<select>`s at 104–130px min-width plus
  five status chips; on a 390px viewport this is six or seven stacked rows before
  the first initiative appears.
- **`CopilotPanel.jsx:300`** sizes itself with `Math.min(600, window.innerWidth-16)`
  read once at render, with no resize listener — it does not respond to rotation.
- **The guided tour breaks below 900px.** Three of its anchors live in the
  sidebar, which is `display:none` there; `GuidedTour.jsx:19–29` acknowledges
  this and falls back to an unanchored centred card. So the first-run experience
  for a visitor on a phone — the most likely way a link gets opened — is a tour
  that stops pointing at anything.

The tour has a second, size-independent bug: it never calls `scrollIntoView` on
its target. If the anchor is below the fold, the spotlight frames an off-screen
rectangle and the card is positioned against it.

**Fix:** extend the existing `<style>` block into a small set of utility classes
(`.gos-grid-2`, `.gos-filters`, `.gos-stack-sm`) that collapse under 700px, and
use them where the fixed grids are. Add `scrollIntoView({block:"center"})` to the
tour's measure loop and re-anchor its sidebar steps to the header on small
screens.

### 3.5 The dashboard is fifteen panels with no hierarchy

Render order in `DashView`: North star → This week's focus → Next Plays → Weekly
Pulse → Business Health → *(a floating "Copy executive summary" button)* → date
range → 10 KPI tiles → Funnel coverage → Contribution → Transfers → Calibration →
Velocity + Category → Type → Outcomes → "View initiatives".

Three specific problems:

1. **The date-range control is seventh down the page.** Everything above it —
   North star, focus nudges, Next Plays, Weekly Pulse, Business Health — ignores
   it. Everything below it obeys it. Nothing says so. A filter that appears
   mid-page and silently governs half the content is a correctness problem
   dressed as a layout one: a reader cannot tell which numbers are scoped.
2. **Ten KPI tiles at near-equal weight.** Only "Projected Impact" is marked
   `hero`. Stripe's dashboard leads with three numbers and makes you ask for the
   rest. Ten equally-weighted tiles is the same as none.
3. **"Copy executive summary" is an unlabelled right-floated button** between two
   panels, belonging to no section. It is one of the most valuable actions in the
   product (it is the client-meeting artifact) and it looks like a stray control.

**Fix:** move the range picker to the view header where it can be labelled with
its scope; cut the tile row to four with the rest behind a "More metrics"
disclosure; group the six analytical panels (Funnel, Contribution, Calibration,
Velocity, Type, Outcomes) under a tab or a collapse, since none of them is a
daily read; and give the exec summary a home next to the readout entry point.

### 3.6 The same number has four names

| Name | Where |
|---|---|
| "Projected Impact" | KPI tile, `DashView.jsx:1015` |
| "Revenue impacted" | README |
| "realised" | Contribution view and `dash.contribution` |
| "Projected impact from completed work" | Client readout export |

Related: "Revenue at risk" (tile) vs "revenue in play" (Funnel coverage) vs
"Revenue at risk / in-flight" (readout) — three names for `revAtRisk`.

In a product whose entire pitch is defensible measurement, the vocabulary for the
headline figure has to be one word used everywhere, including in the artifact
that leaves the building. Pick one per concept and enforce it in a constants
file so a rename is one edit.

### 3.7 The differentiator is two levels deep, and Settings is an app inside a modal

The campaign nomenclature engine is the thing the README argues makes this a
different category from GrowthLab/GrowthOrange/GrowthEX. Editing it lives at
**Performance → Taxonomy tab** (`PerformanceView.jsx:473`) — inside a view named
after something else, behind a tab, four clicks from the dashboard. README says
the convention is "stored in settings"; the UI does not put it there.

Meanwhile Settings is nine sections in a 560px-wide modal capped at 88vh:
Company, North star, Categories, Retailers (6 fields × N), Debate agents (4
fields × N), Health metrics (5 controls × N), Backup & restore, Demo data, Data
sources. No sub-navigation, no anchors, no search. Configuring five health
metrics means scrolling past four unrelated sections in a viewport-constrained
box.

Twilio and Stripe both made the same call: settings is a **page** with a left
sub-nav, not a modal. That is the fix — Settings becomes a nav destination with
sections down the left, and Taxonomy moves into it as one of those sections,
matching what the README already claims.

### 3.8 Smaller things, each individually cheap

- **Dark-mode users get a white flash on every load.** `index.css:17` sets
  `color-scheme: light dark` on `:root`, so the browser paints the canvas from
  the *OS* preference, while the app theme is read asynchronously from the store
  (`App.jsx:640`). A user with a light OS and the app in dark mode gets a full
  white frame before React paints. Fix: write the theme to a `data-theme`
  attribute on `<html>` from a tiny inline script in `index.html`, and set the
  body background from it.
- **`index.html` has no meta description, no Open Graph tags, no theme-color, no
  apple-touch-icon.** README leads with "Launch Live Application"; pasting that
  link into Slack or LinkedIn produces a blank card. For a product whose
  distribution is a shared link, this is free reach being left on the floor.
- **Number inputs cannot be emptied.** `value={form.spendCost||0}` on the three
  investment fields means the input always reads `0` and must be select-all-
  replaced. Use `""` for the empty state and coerce on save.
- **The health-metric toggle is not a switch.** `SettingsModal.jsx:143` is a
  `<button>` styled as a track and knob, with no `role="switch"`, no
  `aria-checked`, and no label association.
- **The linked-initiative typeahead has no keyboard support.** Selection is
  `onMouseDown` only, there is no arrow-key navigation, no `aria-combobox`/
  `listbox`/`aria-activedescendant`, and it closes on a 200ms `setTimeout` after
  blur (`FormView.jsx:292`) — a timing hack that will eventually misfire.
- **Library outcome tiles drop to 45% opacity when inactive** and use 2px borders
  where the rest of the app uses 1px. They are filter toggles wearing stat-tile
  clothes, and the dimmed state makes the counts hard to read — which is the one
  thing a stat tile is for.
- **`ViewLoading` is a bare "Loading…"** for four lazy-loaded views. The Next
  Plays card already has a proper skeleton (`DashView.jsx:786`); that pattern
  should be the one that generalises.

---

## Recommended order

Sequenced by credibility-per-hour, not by tier.

**Week 1 — the things a prospect sees**
1. Name pass: wordmark, readout export, CSV filename (1.1)
2. Favicon + delete `icons.svg` (1.3)
3. Escape + focus trap + dialog roles in `Modal.jsx` (2.1)
4. `htmlFor` in `FR.jsx` (2.2)
5. Enforce the starred fields with inline validation (2.3)
6. Drop the two Placeholder badges (1.6)
7. `index.html` meta + OG + theme flash fix (3.8)

**Week 2 — the things that make it feel like software**
8. Hash routing for `nav` + `selId` (1.4)
9. ⌘K palette (2.6)
10. Delete confirmation modal + undo, and label the button (2.5)
11. Dirty-state guards on the form and Settings (2.4)
12. Clickable `<div>` → `<button>` sweep (2.8)

**Week 3–4 — the things that make it look like Stripe**
13. `components/icons.jsx`, emoji removed from all chrome (1.5)
14. `radius` / `space` / `size` tokens + `Button`/`Card` variants (3.1)
15. Single currency/date formatter + `settings.currency` (3.2)
16. `textMuted` darkened and held to AA (3.3)
17. Responsive utility classes for the 18 fixed grids; tour `scrollIntoView` (3.4)
18. Dashboard hierarchy: range picker to the header, four hero tiles, analytics
    behind a disclosure (3.5)
19. Settings as a page with sub-nav; Taxonomy moves into it (3.7)
20. Vocabulary pass on the revenue terms (3.6)

Items 1–7 are roughly a day and a half of work and close most of the distance
between "impressive prototype" and "product". Everything after that is the
difference between "product" and "product I would put next to Stripe in a
screenshot".
