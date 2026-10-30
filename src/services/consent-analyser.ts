import { and, eq, isNull } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { consentScans, digitalProperties, organisations } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { FetchRefused, vetted } from "@/lib/net/fetch-page";
import { openSecret, sealSecret } from "@/lib/integration/crypto";
import {
  AnalyserError,
  TOKEN_PATTERN,
  checkToken,
  fetchReport,
  runStatus,
  startScan as startAnalyserScan,
  type Transport,
} from "@/lib/pecr/analyser-client";
import { InventoryRefused, ingestAnalyserReport } from "./storage-inventory";
import type { Actor } from "./templates";

/**
 * Scanning a website with the Waivern Consent Analyser from inside Govern.
 *
 * One analyser and one API token per organisation, set by somebody who
 * configures the whole organisation. A scan is started by a person, followed
 * while they watch, and finished by the sweep if they do not: the report is
 * fetched and taken into the inventory exactly as an uploaded one would be.
 */

export const DEFAULT_ANALYSER_URL = "https://consent-analyser-emea.waivern.com";

/** A run still not finished after this long is given up on. The analyser stops its own at ten minutes. */
export const SCAN_GIVE_UP_MS = 15 * 60_000;

export type ScanOptions = Transport & { resolve?: (host: string) => Promise<string[]> };

const SYSTEM: Actor = { actorKind: "system", actorUserId: null, actorLabel: "consent scan" };

/**
 * A Consent Analyser running on this machine, for development only.
 *
 * The address is otherwise refused for being private — rightly, since the token
 * is sent to it. Set CONSENT_ANALYSER_ALLOW_LOCAL=true to run both locally;
 * production ignores it.
 */
function localAnalyserAllowed(url: string): boolean {
  if (process.env.NODE_ENV === "production" || process.env.CONSENT_ANALYSER_ALLOW_LOCAL !== "true") return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** What the settings page may show: never the token itself. */
export async function analyserSettings(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const [org] = await db
      .select({ url: organisations.consentAnalyserUrl, hint: organisations.consentAnalyserTokenHint })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    return { url: org?.url ?? DEFAULT_ANALYSER_URL, configured: Boolean(org?.hint), hint: org?.hint ?? null };
  });
}

async function credentials(organisationId: string) {
  const [org] = await db
    .select({
      url: organisations.consentAnalyserUrl,
      ciphertext: organisations.consentAnalyserTokenCiphertext,
      iv: organisations.consentAnalyserTokenIv,
      tag: organisations.consentAnalyserTokenTag,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  if (!org?.ciphertext || !org.iv || !org.tag) return null;
  return { url: org.url, token: openSecret({ ciphertext: org.ciphertext, iv: org.iv, tag: org.tag }) };
}

/**
 * Set where the analyser is and the token to use.
 *
 * The token is checked with the analyser before it is saved, so a typo is
 * found now rather than at the first scan. `token: null` removes it; leaving it
 * out keeps the one already saved.
 */
export async function setAnalyserSettings(
  input: { organisationId: string; url: string; token?: string | null; actor: Actor },
  options: ScanOptions = {},
) {
  const url = input.url.trim().replace(/\/+$/, "") || DEFAULT_ANALYSER_URL;
  if (!localAnalyserAllowed(url)) {
    if (!url.startsWith("https://")) throw new InventoryRefused("The analyser's address should start with https://.");
    try {
      await vetted(url, options.resolve);
    } catch (error) {
      if (error instanceof FetchRefused) throw new InventoryRefused(`The analyser's address cannot be used: ${error.message}`);
      throw error;
    }
  }
  const token = input.token === undefined ? undefined : input.token === null ? null : input.token.trim();
  if (token && !TOKEN_PATTERN.test(token)) {
    throw new InventoryRefused("That is not a Consent Analyser API token. They look like wvn_ followed by 32 letters and digits.");
  }

  return withOrganisation(input.organisationId, async () => {
    const existing = await credentials(input.organisationId);
    const checkWith = token ?? (token === undefined ? existing?.token : undefined);
    if (checkWith) {
      try {
        await checkToken(url, checkWith, options);
      } catch (error) {
        if (error instanceof AnalyserError) throw new InventoryRefused(error.message);
        throw error;
      }
    }
    const sealed = token ? sealSecret(token) : null;
    await db.transaction(async (tx) => {
      await tx
        .update(organisations)
        .set({
          consentAnalyserUrl: url,
          ...(token === undefined
            ? {}
            : {
                consentAnalyserTokenCiphertext: sealed?.ciphertext ?? null,
                consentAnalyserTokenIv: sealed?.iv ?? null,
                consentAnalyserTokenTag: sealed?.tag ?? null,
                consentAnalyserTokenHint: token ? token.slice(-4) : null,
              }),
        })
        .where(eq(organisations.id, input.organisationId));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation.consent_analyser_set",
        subjectType: "organisation",
        subjectId: input.organisationId,
        // Which token, by its last four characters only.
        after: { url, token: token === undefined ? "unchanged" : token ? `…${token.slice(-4)}` : "removed" },
      });
    });
  });
}

/**
 * Start a scan of a website.
 *
 * One at a time per website: a second press while a scan runs would spend
 * the token owner's credits on the same answer.
 */
export async function startPropertyScan(
  input: { propertyId: string; organisationId: string; actor: Actor },
  options: ScanOptions = {},
) {
  return withOrganisation(input.organisationId, async () => {
    const [property] = await db
      .select()
      .from(digitalProperties)
      .where(and(eq(digitalProperties.id, input.propertyId), eq(digitalProperties.organisationId, input.organisationId)));
    if (!property) throw new Error("No such website or app");
    if (property.kind !== "website") throw new InventoryRefused("The Consent Analyser scans websites. Record an app's items by hand.");
    // The analyser fetches whatever it is given, so an address that resolves
    // inside a private network is not sent to it.
    try {
      await vetted(property.url, options.resolve);
    } catch (error) {
      if (error instanceof FetchRefused) throw new InventoryRefused(`This website's address cannot be scanned: ${error.message}`);
      throw error;
    }
    const creds = await credentials(input.organisationId);
    if (!creds) throw new InventoryRefused("No Consent Analyser token is set. An owner or privacy administrator can add one on the cookies page.");

    const [running] = await db
      .select({ id: consentScans.id, startedAt: consentScans.startedAt })
      .from(consentScans)
      .where(and(eq(consentScans.propertyId, property.id), eq(consentScans.status, "running")));
    if (running && Date.now() - running.startedAt.getTime() < SCAN_GIVE_UP_MS) {
      throw new InventoryRefused("A scan of this website is already running.");
    }

    let started;
    try {
      started = await startAnalyserScan(creds.url, creds.token, property.url, options);
    } catch (error) {
      if (error instanceof AnalyserError) throw new InventoryRefused(error.message);
      throw error;
    }

    return db.transaction(async (tx) => {
      const [scan] = await tx
        .insert(consentScans)
        .values({
          organisationId: input.organisationId,
          propertyId: property.id,
          source: "api",
          analyserRunId: started.runId,
          analyserUrl: creds.url,
          targetUrl: property.url,
          mode: "gdpr",
          region: started.region,
          status: "running",
          startedBy: input.actor.actorUserId,
          startedByLabel: input.actor.actorLabel,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: property.entityId,
        action: "pecr.scan_started",
        subjectType: "digital_property",
        subjectId: property.id,
        after: { property: property.reference, scanId: scan.id, runId: started.runId, region: started.region, note: started.note },
      });
      return { ...scan, note: started.note };
    });
  });
}

async function failScan(scanId: string, organisationId: string, entityId: string, reason: string, actor: Actor) {
  await db.transaction(async (tx) => {
    const [scan] = await tx
      .update(consentScans)
      .set({ status: "failed", failure: reason, completedAt: new Date() })
      .where(and(eq(consentScans.id, scanId), eq(consentScans.status, "running")))
      .returning();
    if (!scan) return;
    await appendAuditEvent(tx, {
      ...actor,
      organisationId,
      entityId,
      action: "pecr.scan_failed",
      subjectType: "digital_property",
      subjectId: scan.propertyId,
      after: { scanId, runId: scan.analyserRunId, reason },
    });
  });
}

export type ScanProgress =
  | { state: "running"; step: string | null }
  | { state: "done"; proposedNew: number; proposedNotSeen: number; findings: number }
  | { state: "failed"; reason: string };

/**
 * Ask after a running scan, and take its report in once it is finished.
 *
 * Safe to call repeatedly and from more than one place at once: only the
 * caller that moves the scan out of `running` records anything.
 */
export async function checkPropertyScan(
  input: { scanId: string; organisationId: string; actor?: Actor; propertyId?: string },
  options: ScanOptions = {},
): Promise<ScanProgress> {
  const actor = input.actor ?? SYSTEM;
  return withOrganisation(input.organisationId, async () => {
    const [row] = await db
      .select({ scan: consentScans, entityId: digitalProperties.entityId })
      .from(consentScans)
      .innerJoin(digitalProperties, eq(digitalProperties.id, consentScans.propertyId))
      .where(and(eq(consentScans.id, input.scanId), eq(consentScans.organisationId, input.organisationId)));
    if (!row || (input.propertyId && row.scan.propertyId !== input.propertyId)) throw new Error("No such scan");
    const { scan, entityId } = row;
    if (scan.status === "failed") return { state: "failed", reason: scan.failure ?? "The scan failed." };
    if (scan.status === "done") return { state: "done", proposedNew: 0, proposedNotSeen: 0, findings: 0 };

    const giveUp = async (reason: string): Promise<ScanProgress> => {
      await failScan(scan.id, input.organisationId, entityId, reason, actor);
      return { state: "failed", reason };
    };
    if (Date.now() - scan.startedAt.getTime() > SCAN_GIVE_UP_MS) {
      return giveUp("The scan did not finish within fifteen minutes. Start another.");
    }
    const creds = await credentials(input.organisationId);
    if (!creds || !scan.analyserRunId) return giveUp("The analyser token was removed while the scan ran.");

    try {
      const status = await runStatus(scan.analyserUrl ?? creds.url, creds.token, scan.analyserRunId, options);
      if (!status.done) return { state: "running", step: status.step };
      if (status.failed || status.cancelled) {
        return giveUp(status.cancelled ? "The scan was cancelled on the analyser." : "The analyser reported that the scan failed.");
      }
      // Claim the finished run, so two callers asking at once do not both take
      // its report in. `completed_at` marks the claim until the ingest sets it.
      const [claimed] = await db
        .update(consentScans)
        .set({ completedAt: new Date() })
        .where(and(eq(consentScans.id, scan.id), eq(consentScans.status, "running"), isNull(consentScans.completedAt)))
        .returning({ id: consentScans.id });
      if (!claimed) return { state: "running", step: "Reading the report" };
      const report = await fetchReport(scan.analyserUrl ?? creds.url, creds.token, scan.analyserRunId, options);
      const outcome = await ingestAnalyserReport({
        propertyId: scan.propertyId,
        organisationId: input.organisationId,
        report,
        source: "api",
        analyserUrl: scan.analyserUrl,
        scanId: scan.id,
        actor,
      });
      return { state: "done", proposedNew: outcome.proposedNew, proposedNotSeen: outcome.proposedNotSeen, findings: outcome.findings };
    } catch (error) {
      if (error instanceof AnalyserError || error instanceof InventoryRefused) return giveUp(error.message);
      throw error;
    }
  });
}

/** Finish, or give up on, every scan left running. Used by the sweep. */
export async function finishRunningScans(organisationId: string, options: ScanOptions = {}): Promise<number> {
  const running = await withOrganisation(organisationId, () =>
    db
      .select({ id: consentScans.id })
      .from(consentScans)
      .where(and(eq(consentScans.organisationId, organisationId), eq(consentScans.status, "running"))),
  );
  let finished = 0;
  for (const { id } of running) {
    const progress = await checkPropertyScan({ scanId: id, organisationId }, options);
    if (progress.state !== "running") finished += 1;
  }
  return finished;
}
