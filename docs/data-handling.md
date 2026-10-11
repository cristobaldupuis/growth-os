# Data handling

What this workspace holds, where it lives, what leaves it, and what it refuses.

This document exists to be handed to a prospect. It is written to be checkable
against the source rather than believed: where a claim is enforced by code it
names the file, and where nothing enforces it, it says so.

Last reviewed: October 2026.

---

## The contract

**This workspace holds aggregates about ad entities and the team's own business
content. It does not hold customers or audiences.**

A record may describe a campaign, an ad set, an ad, a brand-week, or an
experiment. It may carry spend, impressions, clicks, conversions, revenue,
dates, and the dimensions parsed out of an entity's name.

It may not carry customer data: an email address, a phone number, a customer's
name, a street address, a customer or profile id, a device or advertising id,
an IP address, or a date of birth.

Where data enters, that is enforced as follows:

- **Performance exports** are read column by column against a list of
  recognised headers; anything else, personal or not, is never read
  ([`src/services/performance.js`](../src/services/performance.js)).
- **Weekly-metrics files** keep unrecognised columns as custom metrics, except
  any column the personal-data classifier flags, which is left out
  (`parseMetricsCSV` in [`src/constants.js`](../src/constants.js)). A column
  whose name also names a count, rate or amount — `email_revenue`,
  `mobile_sessions`, `Mobile %` — is an aggregate and is kept.
- **Connector syncs** pass every row, and every key inside its metrics, through
  `stripPersonalFields` on the server before the rows reach a browser
  ([`api/connectors.js`](../api/connectors.js)). The one connector built so far,
  Klaviyo, requests flow and message names and ids (the grouping Klaviyo
  requires), four daily statistics, and the account's metric names to find the
  conversion metric ([`api/_klaviyo.js`](../api/_klaviyo.js)). No profile or
  event is read.
- **Backup restore** passes weekly metrics through the same filter when they
  are saved (`stripPersonalMetrics`, applied in `saveMetrics` in
  [`src/App.jsx`](../src/App.jsx)). Weekly metrics already stored by the
  importer before it skipped personal columns keep those columns until the
  next time weekly metrics are saved.
- **Customer voice** — pasted reviews and survey answers — is scrubbed of
  identifiers before it is stored ([see below](#customer-voice)).

The classifier is [`src/services/dataSafety.js`](../src/services/dataSafety.js).
`dataSafety.test.js` runs a performance export and a weekly-metrics file, each
carrying personal columns (email and name; the weekly file also an IP address
and a customer id), through their importers and asserts none of it comes out.
The classifier reads column names, not values: a personal value typed into a
column with an ordinary name is not detected.

**Age, gender, country, city, region and placement are allowed**, because in a
platform export those are audience cohorts on a breakdown row rather than facts
about an individual. That exception is an explicit allowlist, not a gap in the
rules.

### People who are not customers

The contract is about customers and audiences. Some records do name people, and
they are listed here rather than left for a reviewer to find:

- **Team members.** An initiative's owner is a free-text field, normally a
  colleague's name. It is stored with the initiative and can appear in model
  prompts — the debate's list of running initiatives includes it
  ([`src/services/portfolio.js`](../src/services/portfolio.js)).
- **Creators.** The default naming convention's Asset slot holds a creator name
  or an asset type ([`src/services/naming.js`](../src/services/naming.js)), so
  ad names, and the dimensions parsed from them, can carry a creator's name.
- **Workspace members.** Sign-in email addresses live in Supabase Auth, not in
  workspace documents. Every member of a workspace, viewers included, can see
  the other members' email addresses in the Members list, and each saved
  document records the user id of its last editor.
- **Free text in general.** Titles, hypotheses, observations, notes and
  learnings are free text and nothing scans them. Keeping customer data out of
  them is the operator's responsibility under the services agreement, not
  something the product can enforce.

### Why the line is drawn here and not somewhere else

Three things are true only because of it:

1. **A security review has a short answer.** "It never receives customer data"
   ends a conversation that "it receives customer data and protects it
   carefully" begins.
2. **Browser storage is a defensible home, and Postgres a routine one.** Browser
   storage on an operator's laptop is a reasonable place for campaign spend
   aggregates and an indefensible one for a customer list. A signed-in workspace
   lives in Supabase Postgres instead, and the contract is what makes that a
   routine move rather than a DPA conversation.
3. **AI prompts carry no customer data.** Every model call is built from
   initiatives, learnings, briefs and aggregate metrics. The people a prompt can
   name are the team and the creators listed above.

### Regulated verticals

The same line is what could let this be sold into health, finance or another
regulated sector without the compliance programme that handling personal data
there requires. A prospect whose marketing questions can be answered from
campaign aggregates is servable under a contract stating that regulated personal
data never enters the workspace. Two things are not yet in place for that sale:
free-text fields are not scanned, and server-side retention and deletion are
manual (see [Retention and deletion](#retention-and-deletion)). A prospect who
needs individual-level data in the tool is not a customer for this architecture,
and the correct answer is to say so rather than to widen the contract.

---

## Where the data lives

A deployment can run with or without sign-in. Sign-in needs Supabase configured
with a publishable key (`SUPABASE_PUBLISHABLE_KEY`). Without it, every workspace
lives in the browser and nothing in the first row below is stored on the server
as workspace state, though AI features still send parts of it to the server and
a debate stores a snapshot of it (see the debate row). The strip at the top of
the app always says which store answered.

| What | Where | Who can reach it | Kept |
|---|---|---|---|
| Workspace state: initiatives, settings and brand briefs, learnings, weekly metrics, debate history, recommendations, creative briefs, asset records, the AI usage ledger, the learning agenda | Signed in: Supabase Postgres, one JSONB document per key (`workspace_docs`). Signed out: the browser's `localStorage`, under the same keys | Members of the workspace, through [`api/state.js`](../api/state.js), which checks membership on every request. Owners and members read and write; viewers read only. RLS policies are a second line for any path using a member's own token | Until the workspace is deleted. No time-based retention |
| Performance rows (one row per ad entity per day) | Signed in: Postgres `performance_rows`. Signed out: the browser. Capped at 5,000 rows in both, oldest dropped on import with the count reported: a signed-in workspace loads all its rows in one response, which has a size limit, so the cap stays until loading is paged | As above | As above |
| Signal AI debates | Postgres `debate_runs`: the portfolio snapshot the debate argued about (initiatives, settings, brands, weekly metrics, categories), the operator's free-text context, the agent settings, the full model conversation, the transcript and the results | Started by anyone who can open the app, signed in or not, within rate limits ([`api/debate.js`](../api/debate.js)). Each run has a random id; whoever holds it can read the run's status, transcript and results, never the snapshot. Rows carry no workspace or user id | Until deleted by hand. There is no purge |
| Images: generated key frames, product images, brand logos, style references | A private Supabase Storage bucket, through [`api/asset.js`](../api/asset.js). Object keys are a timestamp and a short random suffix, not grouped by workspace | Through the server, which hands out signed links that expire after an hour. Anyone who holds an object key can ask for a link: there is no sign-in or membership check on it, and uploads are accepted from signed-out callers within rate limits | Until deleted by hand. The app has no delete action |
| Model routing (which model serves each feature group) | Postgres `app_config`, one row | The server only. No personal data | Overwritten on each change |
| Rate-limit counters | Postgres `rate_limit_counters`. The key holds the caller's IP address when they are not signed in, or their user id when they are, plus a count. The admin console and the MCP connector's sign-in and token endpoints always key on IP address | The server only | Until the window ends (an hour per caller, a day for deployment-wide caps), then deleted by the next counter update |
| MCP connector authorisation | Postgres `oauth_clients` (the name and redirect addresses a client registers with), `oauth_codes` and `oauth_tokens` (SHA-256 hashes only, never the codes or tokens themselves, with the user id, workspace id and scope) | The server only ([`api/oauth.js`](../api/oauth.js)) | Codes expire in 5 minutes, access tokens in an hour, refresh tokens in 90 days. Expired and revoked rows stay until their client, user or workspace is deleted |
| Accounts | Supabase Auth: each member's email address and user id; passwords are handled by Supabase and never pass through this application's server | Supabase, and the server for invites and sign-in checks | Until the user is deleted in Supabase |
| JSON backups | Wherever the operator saves the download | The operator | The operator's choice |
| Server logs | Vercel runtime logs. Error lines only, never request bodies. A provider's error message can quote part of the request it rejected, debate errors log the run id, and a failed membership lookup logs the caller's IP address | The deployment's Vercel project members | Per the Vercel plan; one hour on Hobby |
| Page views | Vercel Web Analytics on the main app (not the admin console) | Vercel project members | Per Vercel's terms. No workspace content |

Encryption at rest for anything held by Supabase or Vercel is the provider's and
is not something this repository controls. Browser storage is unencrypted beyond
whatever the operating system provides.

---

## What leaves the browser

1. **Model calls**, when the operator uses an AI feature: text through
   [`api/proxy.js`](../api/proxy.js), debates through `api/debate.js`, images
   through `api/image.js`, voice and video through `api/video.js`. Each sends the
   context that call needs: initiative titles and hypotheses, learnings,
   aggregate metrics, brand briefs, the chosen product's facts and images, and
   scrubbed customer voice. The debate sends the whole portfolio snapshot
   described above, and the server keeps it.
2. **Workspace saves**, for a signed-in workspace: every change, and member
   changes, which include an email address when an owner adds someone.
3. **Image bytes**, uploaded to the Storage bucket: logos, style references,
   product images the operator keeps, and generated frames.
4. **A product page address**, when the operator imports a product. The server
   fetches that public page, possibly the store's own product JSON, and the
   images the operator picks, following at most three redirects, and nothing
   else ([`api/_productPage.js`](../api/_productPage.js)). No workspace content
   goes with it.
5. **A connector sync request**, naming the platform and the number of days.
   The platform's data comes back the other way, already stripped.
6. **Sign-in credentials**, sent directly to Supabase Auth.
7. **What the operator exports**: CSV exports, JSON backups, the client readout,
   static ads and creator briefs. These are actions, not background behaviour.

On every page load the app makes three small status requests to its own server
(whether sign-in is available, which models are routed, whether image storage
is configured), records a Vercel Analytics page view, and fetches its fonts from
Google Fonts, which sees the visitor's IP address and browser. A signed-in tab
also downloads its workspace and, while the tab is visible, checks every 60
seconds whether a colleague saved something. That check downloads; it uploads
only to finish merging an edit this tab had not yet saved, and an empty
signed-in workspace is filled with the starting data on its first load.

Outside the workspace, the admin console sends a client owner's email address
to Supabase Auth to invite them or reset their password.

**The MCP connector** lets a member read and write the workspace from Claude or
another MCP client. Once a member connects one, the workspace content each tool
call asks for — initiatives, learnings, the agenda, performance summaries — goes
to that client. Nothing is pushed; data moves only when the client calls a tool.

---

## Subprocessors

| Service | What it receives | When |
|---|---|---|
| Vercel | Every request to the application's server passes through its functions; runtime logs; page-view analytics | Always — it hosts the deployment |
| Supabase | Workspace documents and performance rows, debate runs, images, accounts, routing, rate-limit counters, MCP authorisation | Whenever the deployment has Supabase configured |
| Anthropic | Model calls | The default for every text feature |
| Google (Gemini API or Vertex AI) | Image and scene generation prompts and reference images; text calls for any feature group routed to Gemini | When images or scenes are generated, or a group is routed there |
| Google Fonts | The visitor's IP address and browser, when the font files are fetched | Every load of the main app |
| OpenAI, Thinking Machines | Text calls | Only for a feature group the operator routes to them in `/admin` |
| ElevenLabs | An ad variant's script text | Voice auditions and the Custom voice video tier, when video tools are on |
| HeyGen, D-ID, fal.ai (VEED Fabric) | An ad variant's script text and the brand's avatar image address | A video render, only when the deployment has that provider's key and video tools are on |

Sources this application reads from rather than sends to: Klaviyo, when a
deployment connects it, and the product pages an operator imports.

No data processing agreement or formal subprocessor list exists yet. That is
commercial paper rather than code, and it is needed before the first client
contract (ROADMAP 1.8).

---

## Customer voice

The creative brief grounds its buyer insight in what customers wrote, so a brand
can hold pasted reviews, survey answers and comments. Their text is business
content; the people who wrote them are not, and a pasted review often arrives
with one attached. Emails, links, phone and order numbers (any run of seven or
more digits), @handles, trailing sign-offs ("— Jane D.") and leading
attributions ("Review by Mark:") are removed **before the field is stored** —
when the operator leaves the field, and again on every settings save, whichever
path it came by — and the field says how many snippets were changed. Splitting
the text for a prompt runs the same scrub once more.
[`src/services/voc.js`](../src/services/voc.js), tested in
`creativeInputs.test.js`.

It is a pattern backstop, not a detector: a first name written mid-sentence
("my sister Anna loves it") is kept, because a capitalised word mid-sentence is
far more often a product than a person. The field asks for the words only.
Pasting a customer list or a CRM export is outside this contract whatever the
scrub catches.

---

## What the importers refuse

The performance-export and weekly-metrics importers both leave out any column
the classifier flags as personal data, and name every one of them to the
operator before the import is confirmed. The initiative importer reads a fixed
list of fields and nothing else, so it has no personal column to refuse, but it
does not scan the file either.

The reported message says three things deliberately, in this order: it was not
imported, here is what it was, and **the export file on your disk still contains
it**. The product cannot delete a file in a downloads folder, and a message that
implies otherwise would be the comfortable version and the harmful one.

A connector builds rows in code rather than parsing a file, so it has no header
row to scan. `stripPersonalFields` is its chokepoint: the connector endpoint runs
every row through it on the server, including the keys inside each row's
metrics, and the import preview names anything it removed.

---

## Backups and loss

A signed-in workspace lives in Postgres and survives a cleared browser. A
signed-out workspace lives in one browser and is lost with it unless backed up.
Two mitigations cover that case:

- A **write-failure banner**. When a durable write fails — a full quota, a
  private window, an unreachable workspace store — the app says so and offers a
  one-click backup, rather than silently falling through to memory and losing
  everything on reload.
- A **backup reminder** at load. A live workspace with data is reminded if it
  has never been backed up on this device, or not for seven days. A
  demonstration workspace is reminded after fourteen days. The last-backup date
  is kept per device.

---

## Retention and deletion

There is no automatic retention schedule yet, and deleting a client's data is a
manual job in Supabase rather than a button. What exists today:

- **Workspace documents, performance rows, memberships and MCP authorisations**
  are deleted together when the workspace row is deleted: they cascade from it.
  The admin console cannot delete a workspace; it is done in the Supabase
  dashboard or SQL editor.
- **Debate runs and stored images are not linked to a workspace**, so deleting
  one does not remove them, and on a deployment serving several clients a
  date range would catch other clients' too. They have to be identified from
  the workspace's own records before it is deleted (below).
- **Accounts** are removed by deleting the user in Supabase Auth, which also
  removes their memberships and MCP authorisations.
- **Rate-limit counters** remove themselves after their window.
- **Logs** follow the Vercel plan's retention.
- **The browser copy** goes when the browser's site data is cleared. JSON
  backups are wherever the operator saved them.

A complete deletion request today therefore means, in this order:

1. **Before deleting anything**, collect every image key the workspace refers
   to — the `storageKey` on each record in its asset document and on the brand
   logos, style references and product images in its settings document — and
   identify its debate runs by the company name in each run's snapshot
   (`snapshot → settings → companyName`).
2. Delete exactly those images from the bucket and those rows from
   `debate_runs`.
3. Delete the workspace row, which removes its documents, performance rows,
   memberships and MCP authorisations.
4. Delete the members' Supabase accounts if they belong to no other workspace.
5. Ask the client to delete any JSON backups and exports they hold.

An image the workspace no longer refers to, such as a replaced logo, cannot be
traced to it this way. A retention
schedule, a deletion feature with a stated timeline, and workspace ids on debate
runs and images are not built yet.

---

## Known limitations, stated rather than omitted

- **Access control stops at the workspace.** Owners and members read and write
  everything in it, viewers read everything and write nothing, and only owners
  manage members. There is nothing finer: no per-brand, per-initiative or
  per-person permission.
- **Single device when signed out.** A workspace that has never been signed in
  to lives in one browser, and the app says so rather than implying otherwise.
- **Performance rows are capped at 5,000 per workspace**, oldest dropped on
  import with the count reported. That includes a signed-in workspace, whose
  load returns every row in one response; lifting the cap needs paged loading.
- **Two members importing performance data at once can lose one import.** A
  tab's save replaces the workspace's rows with the set that tab holds, and a
  tab opened before a colleague's import does not hold that import, so saving
  from it deletes the colleague's rows. Reload before importing when someone
  else may have imported since.
- **A failed chunk during a performance save leaves too many rows, never too
  few**, for a save from a tab that holds the workspace's current rows (the
  previous point covers one that does not). New rows are staged first and old
  ones removed only once every chunk has landed, so a failure leaves the
  previous rows alongside whatever new ones arrived. The failure is reported, the full set stays in memory for the
  session, and the next successful save converges.
- **Debate runs and images have no owner on the server**, which is why their
  deletion is manual, and why anyone who can open a deployment can start a
  debate that stores the portfolio it was given.
- **Free text is not scanned**, and the classifier reads column names rather
  than values. See [People who are not customers](#people-who-are-not-customers).
- **Provider error messages are logged**, and can quote part of the request the
  provider rejected. They live as long as the deployment's logs do.
