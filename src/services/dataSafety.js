// -- Data safety ---------------------------------------------------------------
//
// This module exists because the workspace is about to stop being a demo.
//
// Every config in the repo has run with seeded data, so the question of what a
// client's own data is allowed to be has never had to be answered. It has to be
// answered before the first real ad account is loaded, and it has to be answered
// in code rather than in a sentence in a proposal, because a rule that lives only
// in a proposal is a rule that gets broken by the first convenient CSV.
//
// ## The contract
//
// **This workspace holds aggregates about ad entities. It does not hold people.**
//
// A row may describe a campaign, an ad set, an ad, a brand-week or an initiative.
// It may carry spend, impressions, clicks, conversions, revenue, dates and the
// dimensions parsed out of a name. It may not carry an email address, a phone
// number, a person's name, a street address, a customer or profile id, a device
// or advertising id, an IP address, or a date of birth.
//
// The contract is not a preference. It is what makes three separate things true:
//
//   1. A prospect's security review has a one-sentence answer, and the answer is
//      checkable against this file rather than asserted.
//   2. `localStorage` — an unencrypted store on whatever laptop the operator is
//      using — is a defensible home for the data, which it would not be for a
//      customer list.
//   3. Prompts sent to model providers carry no personal data, which is what
//      keeps the AI features out of scope for a DPA argument entirely.
//
// The same contract is what would let this be sold into a regulated vertical
// without the compliance programme that handling personal data there would
// require: the product stays above the line by refusing to hold anything below
// it. That refusal has to be enforced, or it is just a claim.
//
// ## Why this is a guard and not a filter
//
// As it happens, both CSV importers already read only the columns they recognise
// — `PERF_METRIC_ALIASES` and `NAME_COLUMNS` in performance.js, a fixed field
// list in csv.js — so an export containing an email column has never actually
// written one into the store. That is an accident of how they were written, not
// a property anybody stated, and it is exactly the kind of accident that a
// future connector written in a hurry does not inherit.
//
// So: the scan reports what a file contains, the assertion is the chokepoint any
// producer of rows must pass, and both are tested. What was implicit becomes
// something the operator is told and a reviewer can verify.

const norm = (h) => String(h == null ? "" : h).trim().toLowerCase().replace(/[\s_.-]+/g, " ");

// Matched against the normalised header. Ordered most-specific first so a
// header hits the kind that describes it best — "customer email" is an email,
// not an id.
//
// `re` is deliberately loose. A false positive costs the operator one line of
// explanation in the import summary; a false negative costs the contract.
const RULES = [
  { kind:"email",    label:"Email address",        re:/\b(e ?mail|email address|recipient)\b/ },
  { kind:"phone",    label:"Phone number",         re:/\b(phone|mobile|sms number|msisdn|telephone)\b/ },
  { kind:"name",     label:"Person's name",        re:/\b(first name|last name|full name|customer name|recipient name|contact name|surname|given name)\b/ },
  // Device before address, because "IP address" contains "address" and is the
  // more specific reading of the two.
  { kind:"device",   label:"Device or network id", re:/\b(ip|ip address|device id|idfa|gaid|maid|advertising id|user agent|cookie id)\b/ },
  { kind:"address",  label:"Postal address",       re:/\b(address|street|address line \d|postcode|postal code|zip|zip code)\b/ },
  { kind:"identity", label:"Person identifier",    re:/\b(customer id|profile id|contact id|person id|subscriber id|user id|klaviyo id|shopify customer|external id)\b/ },
  { kind:"birth",    label:"Date of birth",        re:/\b(birth|birthday|dob|date of birth)\b/ },
  { kind:"geo",      label:"Precise location",     re:/\b(latitude|longitude|lat long|geo point)\b/ },
];

// Headers that trip a rule but are not personal data, because in a platform
// export they describe an audience segment rather than a person. Meta's "Age"
// and "Gender" breakdown columns are cohorts; "City" on a geo breakdown is a
// targeting row, not where somebody lives. Listed explicitly rather than
// loosening the rules above, so the exception is visible and reviewable.
const ALLOWED = new Set([
  "age", "gender", "country", "region", "city", "dma", "audience", "audience name",
  "placement", "platform", "device platform", "impression device",
]);

/** True when this header is an aggregate dimension despite matching a rule. */
export const isAllowedDimension = (header) => ALLOWED.has(norm(header));

/**
 * Classify one header. Returns null when it carries no personal data.
 *
 * Exported for the connector path, which sees field names one at a time rather
 * than as a header row.
 */
export function classifyHeader(header) {
  const h = norm(header);
  if (!h || isAllowedDimension(h)) return null;
  for (const rule of RULES) {
    if (rule.re.test(h)) return { header: String(header), kind: rule.kind, label: rule.label };
  }
  return null;
}

/**
 * Scan a header row.
 *
 * `blocked` is what the importer must not read and must tell the operator it did
 * not read. `indexes` is the set of column positions, for any caller that walks
 * a row by position rather than by name.
 */
export function scanHeaders(headers) {
  const blocked = [];
  (headers || []).forEach((h, i) => {
    const hit = classifyHeader(h);
    if (hit) blocked.push({ ...hit, index: i });
  });
  return {
    blocked,
    indexes: new Set(blocked.map(b => b.index)),
    clean: blocked.length === 0,
    kinds: [...new Set(blocked.map(b => b.kind))],
  };
}

/**
 * The sentence the operator sees after an import that carried personal data.
 *
 * Says three things in order: it was not stored, here is what it was, and the
 * file on disk is still the file on disk. The third clause is the one that
 * matters operationally — the product's own hygiene does nothing about an
 * export sitting in a downloads folder, and pretending otherwise would be the
 * more comfortable message and the less useful one.
 */
export function piiNotice(scan) {
  if (!scan || scan.clean) return "";
  const names = scan.blocked.map(b => `"${b.header}"`);
  const list = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
  return `${names.length} column${names.length > 1 ? "s were" : " was"} not imported because ${names.length > 1 ? "they carry" : "it carries"} personal data: ${list}. This workspace holds aggregates about ad entities, never people. The export file itself still contains those columns — delete it when you are done.`;
}

/**
 * The chokepoint for any producer of rows that is not a CSV importer.
 *
 * A connector adapter builds objects rather than parsing a header row, so it has
 * no scan to run. It calls this on one row and gets back the row with offending
 * keys removed, plus what was removed. Throwing would be the stricter design and
 * the wrong one: a connector that dies on an unexpected field returns nothing,
 * where one that strips and reports returns the spend figures and a line in the
 * import summary.
 */
export function stripPersonalFields(record) {
  const out = {}, removed = [];
  Object.entries(record || {}).forEach(([k, v]) => {
    const hit = classifyHeader(k);
    if (hit) removed.push(hit); else out[k] = v;
  });
  return { record: out, removed };
}

// -- Workspace mode ------------------------------------------------------------
//
// `DEMO_MODE` is a build-time constant in the config, and it answers "should a
// cold visitor be shown a tour and skipped past onboarding". That is a different
// question from "is the data in this browser real", and conflating them is how a
// client workspace ends up one misclick from Reset Demo.
//
// So mode is workspace state, defaulted from the constant and overridable in
// Settings. It is deliberately not derived: the demo config could be deployed
// for a client who then imports their own account, and at that moment the build
// flag is stale and the operator is the only one who knows.

export const WORKSPACE_MODES = [
  { id:"demo", label:"Demonstration",
    hint:"Seeded portfolio, resettable, safe to show. Do not import a client's data into it." },
  { id:"live", label:"Live client data",
    hint:"Real account data. Demo reset is disabled and backups are tracked." },
];

export const resolveWorkspaceMode = (settings, demoMode) =>
  settings?.workspaceMode || (demoMode ? "demo" : "live");

export const isLiveWorkspace = (settings, demoMode) =>
  resolveWorkspaceMode(settings, demoMode) === "live";

// -- Backup age ----------------------------------------------------------------
//
// A live workspace's only copy of a client's imported history is in one browser
// profile on one machine, until Phase 2.0 lands. The honest mitigation is not a
// reassurance, it is a reminder with a number on it.
//
// The app already nudged at fourteen days. Two things were wrong with it and
// both only matter once the data is real:
//
//   - It read the timestamp and did nothing when there wasn't one, so a
//     workspace that had *never* been backed up was the one case it stayed
//     silent for. That is exactly backwards.
//   - Fourteen days is two weekly cadences. A live workspace should not be able
//     to lose two weeks of a client's imported history to a cleared browser
//     profile.
//
// Seven days for live, because the operating cadence is weekly and a reminder
// that lands inside the working rhythm is a checklist item. Fourteen stays for
// demo, where the data is seeded and a reset button restores it — nagging a
// visitor to back up a demonstration is noise.

export const BACKUP_STALE_DAYS = { live: 7, demo: 14 };

export function backupStatus(lastBackupAt, { now = new Date(), hasData = true, live = false } = {}) {
  const limit = live ? BACKUP_STALE_DAYS.live : BACKUP_STALE_DAYS.demo;
  if (!hasData) return { due: false, days: null, never: false, limit };
  const last = lastBackupAt ? new Date(lastBackupAt) : null;
  if (!last || Number.isNaN(last.getTime())) return { due: live, days: null, never: true, limit };
  const days = Math.floor((now - last) / 86400000);
  return { due: days >= limit, days, never: false, limit };
}
