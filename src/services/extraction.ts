import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  documents,
  dpas,
  extractionFindings,
  extractionLinks,
  extractions,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { ask } from "@/lib/assistant/providers";
import { textFrom, textFromHtml } from "@/lib/documents/text";
import { FetchRefused, fetchPage } from "@/lib/net/fetch-page";
import {
  EXTRACTION_PROMPT_VERSION,
  MECHANISMS,
  SYSTEM,
  buildTurn,
  readResponse,
  sourceFor,
  type Source,
} from "@/lib/thirdparty/extraction";
import { providerFor } from "./assistant";
import type { Actor } from "./templates";

/**
 * Asking the organisation's own model to read an agreement.
 *
 * The register already had columns for transfer mechanism and sub-processors,
 * and they were filled in by hand from a PDF somebody had open in another
 * window — or, more often, left empty. This reads the file that is already
 * attached and proposes what it says, with the sentence it says it in.
 *
 * Nothing here writes to the register. A proposal becomes a register entry
 * when a person accepts it, under their own name, and the provenance travels
 * with it.
 */

/** Enough of the model's budget for a long list of sub-processors. */
const MAX_TOKENS = 4096;
/** Beyond this the sources are costing more than they inform. */
const MAX_SOURCE_CHARACTERS = 120_000;

/** A source as recorded on the run: the label, and what it actually was. */
type StoredSource = {
  label: string;
  kind: "document" | "web_page";
  name: string;
  documentId?: string;
  url?: string;
  sha256?: string;
  fetchedAt?: string;
  characters: number;
};

export class ExtractionUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionUnavailable";
  }
}

/** Whether the button should be offered at all. */
export async function extractionAvailable(organisationId: string): Promise<boolean> {
  const configured = await providerFor(organisationId);
  return Boolean(configured?.surfaces.includes("extraction"));
}

type Loaded = { organisationId: string; dpa: typeof dpas.$inferSelect };

async function loadDpa(dpaId: string, organisationId: string): Promise<Loaded> {
  const [dpa] = await db
    .select()
    .from(dpas)
    .where(and(eq(dpas.id, dpaId), eq(dpas.organisationId, organisationId)));
  if (!dpa) throw new ExtractionUnavailable("That agreement no longer exists.");
  return { organisationId, dpa };
}

export type RunResult = {
  extractionId: string;
  transfers: number;
  subProcessors: number;
  links: number;
  unreadable: Array<{ name: string; reason: string }>;
  failure: string | null;
};

export async function runExtraction(input: {
  organisationId: string;
  entityId: string | null;
  dpaId: string;
  actor: Actor;
}): Promise<RunResult> {
  const configured = await providerFor(input.organisationId);
  if (!configured) {
    throw new ExtractionUnavailable(
      "No model is configured. An administrator sets one up under Admin → Assistant.",
    );
  }
  if (!configured.surfaces.includes("extraction")) {
    throw new ExtractionUnavailable(
      "Reading agreements is switched off for this organisation. An administrator " +
        "can enable it under Admin → Assistant.",
    );
  }

  const { dpa } = await loadDpa(input.dpaId, input.organisationId);

  const attached = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      contentType: documents.contentType,
      sha256: documents.sha256,
      content: documents.content,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organisationId, input.organisationId),
        eq(documents.subjectType, "dpa"),
        eq(documents.subjectId, dpa.id),
      ),
    );

  const supplierDocs = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      contentType: documents.contentType,
      sha256: documents.sha256,
      content: documents.content,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organisationId, input.organisationId),
        eq(documents.subjectType, "supplier"),
        eq(documents.subjectId, dpa.supplierId),
      ),
    );

  const sources: Source[] = [];
  const stored: StoredSource[] = [];
  const unreadable: Array<{ name: string; reason: string }> = [];
  let budget = MAX_SOURCE_CHARACTERS;

  for (const file of [...attached, ...supplierDocs]) {
    const read = textFrom(file.contentType, file.content);
    if (!read.ok) {
      unreadable.push({ name: file.filename, reason: read.reason });
      continue;
    }
    if (budget <= 0) {
      unreadable.push({
        name: file.filename,
        reason: "Not read — the earlier files already filled the amount that can be sent at once.",
      });
      continue;
    }
    const text = read.text.slice(0, budget);
    budget -= text.length;

    const label = `S${sources.length + 1}`;
    sources.push({ label, kind: "document", name: file.filename, text });
    stored.push({
      label,
      kind: "document",
      name: file.filename,
      documentId: file.id,
      sha256: file.sha256,
      characters: text.length,
    });
  }

  if (sources.length === 0) {
    throw new ExtractionUnavailable(
      unreadable.length > 0
        ? `Nothing could be read. ${unreadable.map((u) => `${u.name} — ${u.reason}`).join(" ")}`
        : "There are no files attached to this agreement or to the third party.",
    );
  }

  return persist({ ...input, dpa, sources, stored, unreadable, configured });
}

async function persist(input: {
  organisationId: string;
  entityId: string | null;
  dpa: typeof dpas.$inferSelect;
  actor: Actor;
  sources: Source[];
  stored: StoredSource[];
  unreadable: Array<{ name: string; reason: string }>;
  configured: NonNullable<Awaited<ReturnType<typeof providerFor>>>;
  parentLinkId?: string;
}): Promise<RunResult> {
  const answer = await ask(input.configured.config, {
    system: SYSTEM,
    turns: [{ role: "user", content: buildTurn(input.sources) }],
    maxTokens: MAX_TOKENS,
  });

  const found = answer.ok ? readResponse(answer.text, input.sources) : null;
  const failure = answer.ok
    ? found
      ? null
      : "The model answered, but not in a shape that could be read. Try again."
    : answer.reason;

  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(extractions)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        subjectType: "dpa",
        subjectId: input.dpa.id,
        model: input.configured.config.model,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        sources: input.stored,
        unreadable: input.unreadable,
        redactions: answer.redactions,
        notes: found?.notes ?? null,
        failure,
        requestedBy: input.actor.actorUserId ?? null,
        requestedByLabel: input.actor.actorLabel,
      })
      .returning({ id: extractions.id });

    const findings: (typeof extractionFindings.$inferInsert)[] = [];

    for (const transfer of found?.transfers ?? []) {
      const source = sourceFor(transfer.source, input.sources)!;
      const from = input.stored.find((s) => s.label === source.label);
      findings.push({
        extractionId: run.id,
        organisationId: input.organisationId,
        kind: "transfer_mechanism",
        value: MECHANISMS[transfer.mechanism],
        detail: transfer.detail ?? null,
        country: transfer.countries.join(", ") || null,
        quote: transfer.quote,
        sourceLabel: source.label,
        sourceKind: source.kind,
        sourceDocumentId: from?.documentId ?? null,
        sourceUrl: from?.url ?? null,
        sourceSha256: from?.sha256 ?? null,
        sourceFetchedAt: from?.fetchedAt ? new Date(from.fetchedAt) : null,
      });
    }

    for (const processor of found?.subProcessors ?? []) {
      const source = sourceFor(processor.source, input.sources)!;
      const from = input.stored.find((s) => s.label === source.label);
      findings.push({
        extractionId: run.id,
        organisationId: input.organisationId,
        kind: "sub_processor",
        value: processor.name,
        detail: processor.service ?? null,
        country: processor.country ?? null,
        quote: processor.quote,
        sourceLabel: source.label,
        sourceKind: source.kind,
        sourceDocumentId: from?.documentId ?? null,
        sourceUrl: from?.url ?? null,
        sourceSha256: from?.sha256 ?? null,
        sourceFetchedAt: from?.fetchedAt ? new Date(from.fetchedAt) : null,
      });
    }

    if (findings.length > 0) await tx.insert(extractionFindings).values(findings);

    const links = (found?.links ?? [])
      // A malformed or private address is dropped here rather than offered as
      // something to click; the same check runs again before any fetch.
      .filter((link) => /^https?:\/\/\S+$/i.test(link.url.trim()))
      .slice(0, 20);
    if (links.length > 0) {
      await tx.insert(extractionLinks).values(
        links.map((link) => ({
          extractionId: run.id,
          organisationId: input.organisationId,
          url: link.url.trim(),
          why: link.why ?? null,
          sourceLabel: link.source ?? null,
        })),
      );
    }

    if (input.parentLinkId) {
      await tx
        .update(extractionLinks)
        .set({ followedBy: run.id })
        .where(eq(extractionLinks.id, input.parentLinkId));
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: input.entityId ?? undefined,
      action: "extraction.run",
      subjectType: "extraction",
      subjectId: run.id,
      after: {
        dpa: input.dpa.id,
        model: input.configured.config.model,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        sources: input.stored.map((s) => `${s.label}:${s.name}`),
        transfers: findings.filter((f) => f.kind === "transfer_mechanism").length,
        subProcessors: findings.filter((f) => f.kind === "sub_processor").length,
        unreadable: input.unreadable.length,
        failure,
      },
    });

    return {
      extractionId: run.id,
      transfers: findings.filter((f) => f.kind === "transfer_mechanism").length,
      subProcessors: findings.filter((f) => f.kind === "sub_processor").length,
      links: links.length,
      unreadable: input.unreadable,
      failure,
    };
  });
}

/**
 * Fetch a sub-processor page the agreement pointed at, and read it.
 *
 * Separate from the run that proposed it, and requiring its own act, because
 * this is the step where the platform makes a network request to an address
 * chosen by a third party. What comes back is recorded with its hash and the
 * time it was retrieved: a sub-processor list is a page that changes, and
 * "these were the names on that date" is the only claim worth keeping.
 */
export async function followLink(input: {
  organisationId: string;
  entityId: string | null;
  linkId: string;
  actor: Actor;
}): Promise<RunResult> {
  const configured = await providerFor(input.organisationId);
  if (!configured?.surfaces.includes("extraction")) {
    throw new ExtractionUnavailable("Reading agreements is switched off for this organisation.");
  }

  const [link] = await db
    .select()
    .from(extractionLinks)
    .where(
      and(
        eq(extractionLinks.id, input.linkId),
        eq(extractionLinks.organisationId, input.organisationId),
      ),
    );
  if (!link) throw new ExtractionUnavailable("That link no longer exists.");

  const [parent] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.id, link.extractionId));
  if (!parent) throw new ExtractionUnavailable("That extraction no longer exists.");

  const { dpa } = await loadDpa(parent.subjectId, input.organisationId);

  let page;
  try {
    page = await fetchPage(link.url);
  } catch (error) {
    const reason =
      error instanceof FetchRefused ? error.message : "That address could not be reached.";
    await db.transaction(async (tx) => {
      await tx
        .update(extractionLinks)
        .set({
          status: "failed",
          failure: reason,
          decidedBy: input.actor.actorUserId ?? null,
          fetchedAt: new Date(),
        })
        .where(eq(extractionLinks.id, link.id));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: input.entityId ?? undefined,
        action: "extraction.link.failed",
        subjectType: "extraction",
        subjectId: link.extractionId,
        after: { url: link.url, reason },
      });
    });
    throw new ExtractionUnavailable(reason);
  }

  const text = textFromHtml(page.body).slice(0, MAX_SOURCE_CHARACTERS);
  const label = "S1";
  const sources: Source[] = [{ label, kind: "web_page", name: page.url, text }];
  const stored: StoredSource[] = [
    {
      label,
      kind: "web_page",
      name: page.url,
      url: page.url,
      sha256: page.sha256,
      fetchedAt: page.fetchedAt.toISOString(),
      characters: text.length,
    },
  ];

  await db
    .update(extractionLinks)
    .set({
      status: "fetched",
      fetchedAt: page.fetchedAt,
      fetchedSha256: page.sha256,
      fetchedCharacters: text.length,
      failure: null,
      decidedBy: input.actor.actorUserId ?? null,
    })
    .where(eq(extractionLinks.id, link.id));

  return persist({
    organisationId: input.organisationId,
    entityId: input.entityId,
    dpa,
    actor: input.actor,
    sources,
    stored,
    unreadable: [],
    configured,
    parentLinkId: link.id,
  });
}

export async function declineLink(input: {
  organisationId: string;
  linkId: string;
  actor: Actor;
}) {
  await db
    .update(extractionLinks)
    .set({ status: "declined", decidedBy: input.actor.actorUserId ?? null })
    .where(
      and(
        eq(extractionLinks.id, input.linkId),
        eq(extractionLinks.organisationId, input.organisationId),
      ),
    );
}

/**
 * A person's decision on one proposal.
 *
 * Accepting is the only path by which any of this reaches the register, and it
 * is an update to the agreement attributed to the person who made it. The
 * proposal is kept either way, with who decided and when.
 */
export async function decideFinding(input: {
  organisationId: string;
  entityId: string | null;
  findingId: string;
  accept: boolean;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [finding] = await tx
      .select()
      .from(extractionFindings)
      .where(
        and(
          eq(extractionFindings.id, input.findingId),
          eq(extractionFindings.organisationId, input.organisationId),
        ),
      );
    if (!finding) throw new ExtractionUnavailable("That proposal no longer exists.");
    if (finding.status !== "proposed") return finding;

    const [run] = await tx
      .select()
      .from(extractions)
      .where(eq(extractions.id, finding.extractionId));

    await tx
      .update(extractionFindings)
      .set({
        status: input.accept ? "accepted" : "rejected",
        decidedBy: input.actor.actorUserId ?? null,
        decidedAt: new Date(),
      })
      .where(eq(extractionFindings.id, finding.id));

    let before: Record<string, unknown> | undefined;
    let after: Record<string, unknown> | undefined;

    if (input.accept && run) {
      const [dpa] = await tx.select().from(dpas).where(eq(dpas.id, run.subjectId));
      if (dpa) {
        if (finding.kind === "sub_processor") {
          const existing = dpa.subProcessors ?? [];
          // Matched case-insensitively: "Datadog Inc." arriving twice from two
          // sources should not become two entries in the register.
          const already = existing.some(
            (name) => name.trim().toLowerCase() === finding.value.trim().toLowerCase(),
          );
          if (!already) {
            before = { subProcessors: existing };
            const next = [...existing, finding.value].sort((a, b) => a.localeCompare(b));
            after = { subProcessors: next };
            await tx
              .update(dpas)
              .set({ subProcessors: next, updatedAt: new Date() })
              .where(eq(dpas.id, dpa.id));
          }
        } else {
          const value = finding.detail
            ? `${finding.value} — ${finding.detail}`
            : finding.value;
          before = { transferMechanism: dpa.transferMechanism };
          after = { transferMechanism: value };
          await tx
            .update(dpas)
            .set({ transferMechanism: value, updatedAt: new Date() })
            .where(eq(dpas.id, dpa.id));
        }
      }
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: input.entityId ?? undefined,
      action: input.accept ? "extraction.finding.accepted" : "extraction.finding.rejected",
      subjectType: "extraction_finding",
      subjectId: finding.id,
      before,
      after: {
        ...after,
        kind: finding.kind,
        value: finding.value,
        // The provenance travels into the audit trail, so the register entry
        // can be traced to a source without the extraction still being to hand.
        source: finding.sourceUrl ?? finding.sourceDocumentId,
        sourceSha256: finding.sourceSha256,
        quote: finding.quote,
      },
    });

    return finding;
  });
}

/** The most recent run against an agreement, with everything it proposed. */
export async function latestExtraction(organisationId: string, dpaId: string) {
  const [run] = await db
    .select()
    .from(extractions)
    .where(
      and(
        eq(extractions.organisationId, organisationId),
        eq(extractions.subjectType, "dpa"),
        eq(extractions.subjectId, dpaId),
      ),
    )
    .orderBy(desc(extractions.createdAt))
    .limit(1);
  if (!run) return null;

  const [findings, links] = await Promise.all([
    db
      .select()
      .from(extractionFindings)
      .where(eq(extractionFindings.extractionId, run.id))
      .orderBy(extractionFindings.kind, extractionFindings.value),
    db
      .select()
      .from(extractionLinks)
      .where(eq(extractionLinks.extractionId, run.id))
      .orderBy(extractionLinks.createdAt),
  ]);

  return { run, findings, links };
}

/**
 * Every run against an agreement, newest first — including those reached by
 * following a link, which are runs in their own right.
 */
export async function extractionHistory(organisationId: string, dpaId: string) {
  return db
    .select({
      id: extractions.id,
      createdAt: extractions.createdAt,
      model: extractions.model,
      requestedByLabel: extractions.requestedByLabel,
      failure: extractions.failure,
      sources: extractions.sources,
    })
    .from(extractions)
    .where(
      and(
        eq(extractions.organisationId, organisationId),
        eq(extractions.subjectType, "dpa"),
        eq(extractions.subjectId, dpaId),
      ),
    )
    .orderBy(desc(extractions.createdAt))
    .limit(20);
}
