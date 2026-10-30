/**
 * Reading a Waivern Consent Analyser report.
 *
 * Pure. A report is validated the way the analyser validates one uploaded to
 * itself, stripped of what Govern should not keep, and read for the storage it
 * saw. Nothing here decides a basis: what comes out is observation, which a
 * person turns into the inventory.
 *
 * Schema 2.0 has no list of cookies of its own. They appear only as evidence
 * inside individual checks, so they are read from there:
 *   - G.1, every first-party cookie after Accept All, with expiry;
 *   - B.2, advertising and analytics cookies set before any consent;
 *   - F.1, advertising and analytics cookies still collecting after Reject All;
 *   - `metadata.cookie_ai_classification`, a purpose category per cookie name
 *     where the analyser's AI ran.
 * Schema 2.1, if the analyser adds it, carries a top-level `storage` list, and
 * that is read instead.
 */

/** The report sizes Govern keeps, once screenshots are gone. */
export const MAX_STRIPPED_BYTES = 5_000_000;

export type AnalyserReport = {
  schema_version: string;
  run_id?: string;
  generated_at?: string;
  metadata: Record<string, unknown>;
  summary: Record<string, unknown>;
  checklist: Array<Record<string, unknown>>;
  cmp_interaction?: Record<string, unknown>;
  storage?: Array<Record<string, unknown>>;
};

export type Validation = { ok: true; report: AnalyserReport } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Accept what the analyser itself accepts, and refuse a scan that never saw the site. */
export function validateReport(input: unknown): Validation {
  if (!isObject(input)) return { ok: false, reason: "That is not a Consent Analyser report: it is not a JSON object." };
  const version = input.schema_version;
  if (version !== "2.0" && version !== "2.1") {
    return {
      ok: false,
      reason: `That is not a Consent Analyser report Govern can read (schema_version ${JSON.stringify(version ?? null)}; expected "2.0" or "2.1").`,
    };
  }
  if (!Array.isArray(input.checklist) || !isObject(input.summary) || !isObject(input.metadata)) {
    return { ok: false, reason: "That report is incomplete: it needs metadata, a summary and a checklist." };
  }
  if (input.metadata.bot_blocked === true) {
    const by = typeof input.metadata.bot_blocker_name === "string" ? ` by ${input.metadata.bot_blocker_name}` : "";
    return {
      ok: false,
      reason: `The scan was blocked${by}, so it saw a block page rather than the site. Scan again, or allow the analyser through.`,
    };
  }
  return { ok: true, report: input as unknown as AnalyserReport };
}

/**
 * What Govern keeps of a report.
 *
 * Screenshots are dropped: they are large, and the analyser keeps them. So is
 * any cookie value the evidence quotes — a value can be an identifier for the
 * person who happened to be scanning, and nothing here needs it.
 */
export function stripReport(report: AnalyserReport): AnalyserReport {
  const { checklist, metadata, summary } = report;
  const kept: AnalyserReport = {
    schema_version: report.schema_version,
    run_id: report.run_id,
    generated_at: report.generated_at,
    metadata,
    summary,
    cmp_interaction: report.cmp_interaction,
    checklist: checklist.map((item) => ({
      ...item,
      evidence: Array.isArray(item.evidence)
        ? item.evidence.map((e) => (isObject(e) ? withoutValues(e) : e))
        : item.evidence,
    })),
  };
  if (report.storage) kept.storage = report.storage.map(withoutValues);
  return kept;
}

function withoutValues(e: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === "value" || k === "value_snippet" || k === "set_cookie_header") continue;
    out[k] = v;
  }
  return out;
}

export type ObservedItem = {
  key: string;
  name: string;
  kind: "cookie" | "local_storage" | "session_storage" | "pixel" | "sdk" | "other";
  domain: string | null;
  party: "first" | "third" | "unknown";
  expiry: string | null;
  category: string | null;
  seenBeforeConsent: boolean;
  seenAfterReject: boolean;
};

/** Public suffixes with two labels that matter for UK sites. Enough for a suggestion. */
const TWO_LABEL_SUFFIXES = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk", "nhs.uk", "com.au", "co.nz", "co.jp"]);

/** The registrable part of a host: `www.shop.example.co.uk` → `example.co.uk`. */
export function registrable(host: string): string {
  const labels = host.toLowerCase().replace(/^\./, "").replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return TWO_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}

export function partyOf(domain: string | null, targetUrl: string | null): ObservedItem["party"] {
  const host = targetUrl ? hostOf(targetUrl) : null;
  if (!domain || !host) return "unknown";
  return registrable(domain) === registrable(host) ? "first" : "third";
}

/** The inventory key: one row per kind, registrable domain and name. */
export function itemKey(kind: string, domain: string | null, name: string): string {
  return `${kind}:${domain ? registrable(domain) : "?"}:${name}`;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function expiryOf(v: unknown): string | null {
  if (v === "session") return "session";
  if (typeof v === "number" && Number.isFinite(v)) return v < 1 ? "under a day" : `${Math.round(v)} day${Math.round(v) === 1 ? "" : "s"}`;
  return text(v);
}

function evidenceOf(report: AnalyserReport, itemId: string): Array<Record<string, unknown>> {
  const check = report.checklist.find((c) => c.item_id === itemId);
  return Array.isArray(check?.evidence) ? check.evidence.filter(isObject) : [];
}

/** The scanner's purpose category for each cookie name, where its AI ran. */
function aiCategories(report: AnalyserReport): Map<string, string> {
  const out = new Map<string, string>();
  const ai = report.metadata.cookie_ai_classification;
  if (!isObject(ai) || !Array.isArray(ai.classifications)) return out;
  for (const c of ai.classifications) {
    if (!isObject(c)) continue;
    const name = text(c.cookie_name);
    const category = text(c.category);
    if (name && category) out.set(name, category);
  }
  return out;
}

/**
 * Everything the scan saw, one entry per item.
 *
 * Read from 2.1's `storage` where it is there, otherwise from the 2.0
 * evidence. The category is the scanner's, kept as a suggestion; the
 * analyser's rules put analytics cookies such as `_ga` under advertising, so
 * its AI's category is preferred where there is one.
 */
export function observedStorage(report: AnalyserReport): ObservedItem[] {
  const target = text(report.metadata.target_url);
  const items = new Map<string, ObservedItem>();
  const categories = aiCategories(report);

  const upsert = (raw: {
    name: string | null;
    kind?: ObservedItem["kind"];
    domain: string | null;
    party?: ObservedItem["party"];
    expiry?: string | null;
    category?: string | null;
    beforeConsent?: boolean;
    afterReject?: boolean;
  }) => {
    if (!raw.name) return;
    const kind = raw.kind ?? "cookie";
    const key = itemKey(kind, raw.domain, raw.name);
    const was = items.get(key);
    items.set(key, {
      key,
      name: raw.name,
      kind,
      domain: raw.domain ?? was?.domain ?? null,
      party: raw.party && raw.party !== "unknown" ? raw.party : was?.party ?? partyOf(raw.domain, target),
      expiry: raw.expiry ?? was?.expiry ?? null,
      category: categories.get(raw.name) ?? raw.category ?? was?.category ?? null,
      seenBeforeConsent: Boolean(was?.seenBeforeConsent || raw.beforeConsent),
      seenAfterReject: Boolean(was?.seenAfterReject || raw.afterReject),
    });
  };

  if (Array.isArray(report.storage)) {
    for (const s of report.storage) {
      const phases = Array.isArray(s.phases) ? s.phases.map(String) : [];
      const party = s.party === "first" || s.party === "first-party" ? "first" : s.party === "third" || s.party === "third-party" ? "third" : undefined;
      upsert({
        name: text(s.name),
        kind: (["cookie", "local_storage", "session_storage", "pixel", "sdk"].includes(String(s.kind)) ? s.kind : s.kind ? "other" : "cookie") as ObservedItem["kind"],
        domain: text(s.domain),
        party,
        expiry: expiryOf(s.expiry ?? s.expires_days),
        category: text(s.category),
        beforeConsent: phases.includes("before_consent"),
        afterReject: phases.includes("after_reject"),
      });
    }
    return [...items.values()];
  }

  for (const e of evidenceOf(report, "G.1")) {
    upsert({ name: text(e.name), domain: text(e.domain), party: "first", expiry: expiryOf(e.expires_days), category: legacyCategory(e.classification) });
  }
  for (const e of evidenceOf(report, "B.2")) {
    upsert({ name: text(e.name), domain: text(e.domain), category: legacyCategory("AD"), beforeConsent: true });
  }
  for (const e of evidenceOf(report, "F.1")) {
    // `suppressed` and `dormant` cookies are present but not collecting after Reject.
    const collecting = e.disposition === undefined || e.disposition === "fail";
    const party = e.party === "first-party" ? "first" : e.party === "third-party" ? "third" : undefined;
    upsert({ name: text(e.name), domain: text(e.domain), party, expiry: expiryOf(e.expires_days), category: legacyCategory("AD"), afterReject: collecting });
  }
  return [...items.values()];
}

/**
 * The analyser's rule-based classes, mapped loosely. Its `AD` covers analytics
 * as well as advertising, which Schedule A1 treats very differently, so it is
 * kept as both rather than guessed at.
 */
function legacyCategory(v: unknown): string | null {
  if (v === "ESSENTIAL") return "strictly_necessary";
  if (v === "AD") return "advertising_or_analytics";
  return null;
}

/** Checks that failed or only partly passed, for the findings list. */
export function failingChecks(report: AnalyserReport) {
  return report.checklist
    .filter((c) => c.result === "FAIL" || c.result === "PARTIAL")
    .map((c) => ({
      itemId: text(c.item_id) ?? "?",
      section: text(c.section),
      description: text(c.description) ?? "Check",
      result: String(c.result),
      notes: text(c.notes),
      recommendation: text(c.recommendation),
    }));
}

/**
 * Where the analyser's browser was when it scanned.
 *
 * 2.0 reports give a short code ("eu"); 2.1 an object with the country. The UK
 * is recorded as "uk", like the region a run is started with, so the two read
 * the same; anywhere else by its country's name.
 */
function probeLocationOf(v: unknown): string | null {
  if (isObject(v)) {
    if (text(v.country_code)?.toUpperCase() === "GB") return "uk";
    return text(v.country) ?? text(v.country_code);
  }
  return text(v);
}

export type CheckToLookAt = {
  itemId: string;
  result: "FAIL" | "PARTIAL" | "MANUAL";
  description: string;
  notes: string | null;
  recommendation: string | null;
};

/**
 * How the run's checks came out, counted from the checklist itself, and the
 * ones a person has to do something about: those that failed, and those the
 * analyser could not decide and left to be checked by hand.
 */
export function checkOutcome(report: AnalyserReport) {
  const count = (r: string) => report.checklist.filter((c) => c.result === r).length;
  const toLookAt: CheckToLookAt[] = report.checklist
    .filter((c) => c.result === "FAIL" || c.result === "PARTIAL" || c.result === "MANUAL")
    .map((c) => ({
      itemId: text(c.item_id) ?? "?",
      result: c.result as CheckToLookAt["result"],
      description: text(c.description) ?? "Check",
      notes: text(c.notes),
      recommendation: text(c.recommendation),
    }));
  return {
    passed: count("PASS"),
    failed: count("FAIL") + count("PARTIAL"),
    manual: count("MANUAL"),
    info: count("INFO"),
    toLookAt,
  };
}

/** The headline facts of a run, for the scan record. */
export function reportSummary(report: AnalyserReport) {
  const m = report.metadata;
  const s = report.summary;
  const seen = observedStorage(report);
  return {
    runId: text(report.run_id),
    targetUrl: text(m.target_url),
    // The full timestamp where there is one; test_date alone is midnight.
    testedAt: text(report.generated_at) ?? text(m.test_date),
    cmp: text(m.cmp_detected),
    mode: text(m.analysis_mode),
    probeLocation: probeLocationOf(m.probe_location),
    overall: text(s.overall),
    passCount: typeof s.pass_count === "number" ? s.pass_count : null,
    failCount: typeof s.fail_count === "number" ? s.fail_count : null,
    aiClassified: aiCategories(report).size > 0,
    checks: checkOutcome(report),
    seen: {
      total: seen.length,
      beforeConsent: seen.filter((o) => o.seenBeforeConsent).length,
      afterReject: seen.filter((o) => o.seenAfterReject).length,
      thirdParty: seen.filter((o) => o.party === "third").length,
    },
  };
}

export type ScanSummary = ReturnType<typeof reportSummary>;
