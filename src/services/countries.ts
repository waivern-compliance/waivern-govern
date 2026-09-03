import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { countryRisk, countryRiskReviews } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { addMonths } from "@/lib/dates";
import { COUNTRY_LIBRARY, REVIEW_INTERVAL_MONTHS, SEED_REVIEWER } from "@/lib/countries/library";
import type { AdequacyStatus, Regime, RiskLevel } from "@/lib/countries/labels";
import type { Actor } from "./templates";

export type { AdequacyStatus, Regime, RiskLevel } from "@/lib/countries/labels";
export { ADEQUACY_WORDS, RISK_WORDS } from "@/lib/countries/labels";

export type CountryEntry = typeof countryRisk.$inferSelect & {
  /** True when this row is a client's own analysis rather than the shared one. */
  isOverride: boolean;
  stale: boolean;
  /** Never checked by a person — only ever seeded. */
  unverified: boolean;
};

function decorate(row: typeof countryRisk.$inferSelect): CountryEntry {
  return {
    ...row,
    isOverride: row.organisationId !== null,
    stale: row.nextReviewAt.getTime() <= Date.now(),
    unverified: row.reviewedBy === SEED_REVIEWER,
  };
}

/**
 * The library as one organisation sees it.
 *
 * A client's own row for a country replaces the shared one entirely rather than
 * merging with it. Half a client's analysis and half ours would be a view
 * nobody wrote and nobody can defend.
 */
export async function libraryFor(organisationId: string): Promise<CountryEntry[]> {
  const rows = await db
    .select()
    .from(countryRisk)
    .where(or(isNull(countryRisk.organisationId), eq(countryRisk.organisationId, organisationId)))
    .orderBy(asc(countryRisk.name));

  const byCode = new Map<string, typeof countryRisk.$inferSelect>();
  for (const row of rows) {
    const existing = byCode.get(row.code);
    if (!existing || row.organisationId !== null) byCode.set(row.code, row);
  }
  return [...byCode.values()]
    .map(decorate)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function lookup(
  organisationId: string,
  code: string,
): Promise<CountryEntry | null> {
  const rows = await db
    .select()
    .from(countryRisk)
    .where(
      and(
        eq(countryRisk.code, code.toUpperCase()),
        or(isNull(countryRisk.organisationId), eq(countryRisk.organisationId, organisationId)),
      ),
    );
  if (rows.length === 0) return null;
  return decorate(rows.find((r) => r.organisationId !== null) ?? rows[0]);
}

/** Codes needing an Article 46 route under a given regime. */
export async function needingSafeguards(
  organisationId: string,
  regime: Regime = "uk",
): Promise<Set<string>> {
  const library = await libraryFor(organisationId);
  return new Set(
    library
      .filter((c) => {
        const status = regime === "uk" ? c.ukAdequacy : c.euAdequacy;
        // "Conditionally adequate" counts as needing safeguards. The condition
        // is about the recipient, not the country, so the platform cannot know
        // it holds — and assuming it does is how a US transfer to an
        // uncertified processor sails through.
        return status !== "adequate";
      })
      .map((c) => c.code),
  );
}

export type LibraryHealth = {
  total: number;
  stale: number;
  unverified: number;
  /** Countries a transfer assessment has cited that are stale. */
  dueSoon: number;
};

export async function libraryHealth(organisationId: string): Promise<LibraryHealth> {
  const library = await libraryFor(organisationId);
  const soon = Date.now() + 30 * 24 * 3600 * 1000;
  return {
    total: library.length,
    stale: library.filter((c) => c.stale).length,
    unverified: library.filter((c) => c.unverified).length,
    dueSoon: library.filter((c) => !c.stale && c.nextReviewAt.getTime() <= soon).length,
  };
}

/**
 * Record that a person has checked a country, and what they concluded.
 *
 * Confirming that nothing has changed is a review. Requiring an edit before the
 * clock resets would push people to make a cosmetic change, and the record
 * would then say something moved when it did not.
 */
export async function reviewCountry(input: {
  organisationId: string;
  code: string;
  note: string;
  changes?: Partial<{
    ukAdequacy: AdequacyStatus;
    ukAdequacyNote: string;
    euAdequacy: AdequacyStatus;
    euAdequacyNote: string;
    governmentAccess: RiskLevel;
    redress: RiskLevel;
    summary: string;
  }>;
  /** Write the client's own row rather than editing the shared library. */
  asOverride?: boolean;
  actor: Actor;
}) {
  const note = input.note.trim();
  if (!note) throw new Error("A review needs a note, even if nothing changed");

  const current = await lookup(input.organisationId, input.code);
  if (!current) throw new Error(`No country with code ${input.code}`);

  const now = new Date();
  const next = addMonths(now, REVIEW_INTERVAL_MONTHS);

  return db.transaction(async (tx) => {
    const before = {
      ukAdequacy: current.ukAdequacy,
      euAdequacy: current.euAdequacy,
      governmentAccess: current.governmentAccess,
      redress: current.redress,
      reviewedBy: current.reviewedBy,
    };

    const values = {
      ...input.changes,
      reviewedAt: now,
      reviewedBy: input.actor.actorLabel,
      nextReviewAt: next,
      updatedAt: now,
    };

    // Editing the shared library from inside one client would change what every
    // other client sees, so a client's review always writes their own row.
    const writeOverride = input.asOverride ?? current.organisationId === null;

    const [row] = writeOverride
      ? await tx
          .insert(countryRisk)
          .values({
            organisationId: input.organisationId,
            code: current.code,
            name: current.name,
            ukAdequacy: current.ukAdequacy,
            ukAdequacyNote: current.ukAdequacyNote,
            euAdequacy: current.euAdequacy,
            euAdequacyNote: current.euAdequacyNote,
            governmentAccess: current.governmentAccess,
            redress: current.redress,
            summary: current.summary,
            sources: current.sources,
            ...values,
          })
          .onConflictDoUpdate({
            target: [countryRisk.organisationId, countryRisk.code],
            targetWhere: sql`${countryRisk.organisationId} is not null`,
            set: values,
          })
          .returning()
      : await tx
          .update(countryRisk)
          .set(values)
          .where(eq(countryRisk.id, current.id))
          .returning();

    await tx.insert(countryRiskReviews).values({
      countryRiskId: row.id,
      reviewedByUserId: input.actor.actorUserId ?? null,
      reviewedByLabel: input.actor.actorLabel,
      note,
      before,
      after: {
        ukAdequacy: row.ukAdequacy,
        euAdequacy: row.euAdequacy,
        governmentAccess: row.governmentAccess,
        redress: row.redress,
      },
    });

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "country_risk.reviewed",
      subjectType: "country_risk",
      subjectId: row.id,
      before,
      after: { code: row.code, note, nextReviewAt: next.toISOString() },
    });

    return decorate(row);
  });
}

export async function reviewHistory(countryRiskId: string) {
  return db
    .select()
    .from(countryRiskReviews)
    .where(eq(countryRiskReviews.countryRiskId, countryRiskId))
    .orderBy(countryRiskReviews.createdAt);
}

/** Entries whose review has come due, for the scheduler to turn into work. */
export async function countriesDueForReview() {
  return db
    .select()
    .from(countryRisk)
    .where(lte(countryRisk.nextReviewAt, new Date()))
    .orderBy(asc(countryRisk.nextReviewAt));
}

/**
 * Load the shared library.
 *
 * Seeded rows arrive due for review immediately and identify themselves as
 * unverified, because they are: generated from a starting point rather than
 * checked against a current source. Anything else would put a rating into a
 * transfer assessment that reads as evidenced and is not.
 */
export async function seedSharedLibrary() {
  const now = new Date();
  let created = 0;

  for (const entry of COUNTRY_LIBRARY) {
    const [row] = await db
      .insert(countryRisk)
      .values({
        organisationId: null,
        code: entry.code,
        name: entry.name,
        ukAdequacy: entry.ukAdequacy,
        ukAdequacyNote: entry.ukAdequacyNote,
        euAdequacy: entry.euAdequacy,
        euAdequacyNote: entry.euAdequacyNote,
        governmentAccess: entry.governmentAccess ?? "unknown",
        redress: entry.redress ?? "unknown",
        summary: entry.summary,
        sources: entry.sources ?? [],
        reviewedAt: now,
        reviewedBy: SEED_REVIEWER,
        nextReviewAt: now,
      })
      .onConflictDoNothing({
        target: countryRisk.code,
        // The unique index is partial, so the predicate has to be repeated for
        // Postgres to match it. onConflictDoNothing names this `where`, where
        // onConflictDoUpdate names it `targetWhere`.
        where: sql`${countryRisk.organisationId} is null`,
      })
      .returning();
    if (row) created += 1;
  }
  return { created, total: COUNTRY_LIBRARY.length };
}
