import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { assessments, contributorLinks } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { sha256Hex } from "@/lib/canonical";
import type { Actor } from "./templates";

/**
 * Access for a contributor who has no account.
 *
 * A note on "single use". A link that dies after one HTTP request is unusable:
 * loading the page, saving a draft and submitting are three requests, and people
 * come back to finish. So the link is single-*purpose* rather than
 * single-request — it opens exactly one assessment, optionally one section of
 * it, until it expires, is completed, or is revoked. Every use is counted and
 * audited, so an unexpected pattern of use is visible even though repeat use is
 * allowed.
 *
 * The token is never stored. Only its SHA-256 is, so a database disclosure does
 * not hand over working links.
 */

/** Long enough that guessing is not a strategy. */
const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 14;

function encodeToken(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export type IssuedLink = {
  id: string;
  /** Returned exactly once, at creation. It cannot be recovered afterwards. */
  token: string;
  expiresAt: Date;
};

export async function issueContributorLink(input: {
  organisationId: string;
  assessmentId: string;
  email: string;
  sectionKey?: string | null;
  ttlDays?: number;
  actor: Actor;
}): Promise<IssuedLink> {
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, input.assessmentId),
        eq(assessments.organisationId, input.organisationId),
      ),
    );
  if (!assessment) throw new Error("No such assessment");

  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const token = encodeToken(bytes);
  const tokenHash = await sha256Hex(token);

  const expiresAt = new Date(
    Date.now() + (input.ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000,
  );

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contributorLinks)
      .values({
        organisationId: input.organisationId,
        assessmentId: input.assessmentId,
        sectionKey: input.sectionKey ?? null,
        email: input.email.toLowerCase(),
        tokenHash,
        expiresAt,
        createdByUserId: input.actor.actorUserId ?? null,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "contributor_link.issued",
      subjectType: "assessment",
      subjectId: input.assessmentId,
      entityId: assessment.entityId,
      after: {
        email: row.email,
        section: row.sectionKey,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return { id: row.id, token, expiresAt };
  });
}

export type RedeemedLink = {
  linkId: string;
  organisationId: string;
  assessmentId: string;
  entityId: string;
  sectionKey: string | null;
  email: string;
};

export type RedemptionFailure =
  | "not_found"
  | "expired"
  | "revoked"
  | "completed"
  | "assessment_closed";

/**
 * Exchange a token for scoped access.
 *
 * Looked up by hash, so the stored value is useless on its own. Failures are
 * deliberately not distinguished to the caller's user interface — telling an
 * anonymous visitor that a token exists but expired confirms the token was real.
 */
export async function redeemContributorLink(
  token: string,
  ipHash?: string,
): Promise<{ ok: true; link: RedeemedLink } | { ok: false; reason: RedemptionFailure }> {
  const tokenHash = await sha256Hex(token);

  const [row] = await db
    .select({ link: contributorLinks, assessment: assessments })
    .from(contributorLinks)
    .innerJoin(assessments, eq(assessments.id, contributorLinks.assessmentId))
    .where(eq(contributorLinks.tokenHash, tokenHash));

  if (!row) return { ok: false, reason: "not_found" };
  if (row.link.revokedAt) return { ok: false, reason: "revoked" };
  if (row.link.completedAt) return { ok: false, reason: "completed" };
  if (row.link.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (!["draft", "in_progress", "returned"].includes(row.assessment.status)) {
    return { ok: false, reason: "assessment_closed" };
  }

  const now = new Date();
  await db
    .update(contributorLinks)
    .set({
      useCount: sql`${contributorLinks.useCount} + 1`,
      lastUsedAt: now,
      lastUsedIpHash: ipHash ?? row.link.lastUsedIpHash,
    })
    .where(eq(contributorLinks.id, row.link.id));

  return {
    ok: true,
    link: {
      linkId: row.link.id,
      organisationId: row.link.organisationId,
      assessmentId: row.link.assessmentId,
      entityId: row.assessment.entityId,
      sectionKey: row.link.sectionKey,
      email: row.link.email,
    },
  };
}

/** The actor a link contributor writes as. They never get a user row. */
export function contributorActor(email: string): Actor {
  return { actorKind: "contributor_link", actorUserId: null, actorLabel: email };
}

export async function completeContributorLink(input: {
  linkId: string;
  organisationId: string;
  actor: Actor;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(contributorLinks)
      .set({ completedAt: now })
      .where(
        and(
          eq(contributorLinks.id, input.linkId),
          isNull(contributorLinks.completedAt),
          isNull(contributorLinks.revokedAt),
        ),
      )
      .returning();
    if (!row) return null;

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "contributor_link.completed",
      subjectType: "assessment",
      subjectId: row.assessmentId,
      after: { email: row.email, section: row.sectionKey },
    });
    return row;
  });
}

export async function revokeContributorLink(input: {
  linkId: string;
  organisationId: string;
  actor: Actor;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(contributorLinks)
      .set({ revokedAt: now })
      .where(
        and(
          eq(contributorLinks.id, input.linkId),
          eq(contributorLinks.organisationId, input.organisationId),
          isNull(contributorLinks.revokedAt),
        ),
      )
      .returning();
    if (!row) return null;

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "contributor_link.revoked",
      subjectType: "assessment",
      subjectId: row.assessmentId,
      after: { email: row.email, section: row.sectionKey },
    });
    return row;
  });
}

export async function linksForAssessment(assessmentId: string) {
  return db
    .select()
    .from(contributorLinks)
    .where(eq(contributorLinks.assessmentId, assessmentId))
    .orderBy(contributorLinks.createdAt);
}
