import { and, asc, count, desc, eq } from "drizzle-orm";
import { db, type Db, withOrganisation } from "@/db/client";
import { organisations, riskAppetites, risks } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { addMonths } from "@/lib/dates";
import {
  type AppetiteLevel,
  type AppetiteScope,
  isScope,
  APPETITE_LEVELS,
} from "@/lib/risk/appetite";
import { SCALES, TIER_ORDER, type RiskScaleId, type RiskTier } from "@/lib/risk/scale";
import { appetiteInForce } from "./appetite-in-force";
import { SegregationOfDuties, riskScaleOf } from "./risks";

export { appetiteInForce, riskScaleOf };
import type { Actor } from "./templates";

/**
 * The organisation's risk policy: the scale it rates on, and how much risk of
 * each kind it is prepared to carry. Both are decisions about the register as a
 * whole rather than about any one risk, which is why they live apart from it.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class RiskScaleLocked extends Error {}
export class AppetiteRefused extends Error {}

/** How many risks the organisation has, of any status. */
export async function riskCount(organisationId: string, tx: Tx | Db = db) {
  return withOrganisation(organisationId, async () => {
    const [row] = await tx
      .select({ n: count() })
      .from(risks)
      .where(eq(risks.organisationId, organisationId));
    return Number(row?.n ?? 0);
  });
}

/**
 * Choose the scale the register rates on.
 *
 * Only while the register is empty. Every risk is checked against the scale it
 * was rated on, so changing scale with risks on the register would not corrupt
 * anything — but it would leave a board looking at a four-point 12 next to a
 * five-point 12, which is the comparison a single scale exists to prevent.
 * Re-rating every risk is a decision for people, not a conversion for software.
 */
export async function setRiskScale(input: {
  organisationId: string;
  scale: RiskScaleId;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    if (!(input.scale in SCALES)) throw new Error("No such risk scale");

    return db.transaction(async (tx) => {
      // Lock the organisation row so a risk cannot be raised between the count
      // and the change.
      const [org] = await tx
        .select()
        .from(organisations)
        .where(eq(organisations.id, input.organisationId))
        .for("update");
      if (!org) throw new Error("No such organisation");
      if (org.riskScale === input.scale) return org;

      const existing = await riskCount(input.organisationId, tx);
      if (existing > 0) {
        throw new RiskScaleLocked(
          `The register already holds ${existing} risk${existing === 1 ? "" : "s"} rated on the ${SCALES[org.riskScale as RiskScaleId].inSentence} scale`,
        );
      }

      const [updated] = await tx
        .update(organisations)
        .set({ riskScale: input.scale, updatedAt: new Date() })
        .where(eq(organisations.id, input.organisationId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation.risk_scale_set",
        subjectType: "organisation",
        subjectId: input.organisationId,
        before: { riskScale: org.riskScale },
        after: { riskScale: input.scale },
      });
      return updated;
    });
  });
}

/** Every statement, newest first — current, pending and history. */
export async function appetiteHistory(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    return db
      .select()
      .from(riskAppetites)
      .where(eq(riskAppetites.organisationId, organisationId))
      .orderBy(asc(riskAppetites.category), desc(riskAppetites.createdAt));
  });
}

/**
 * Write down an appetite for one category, or the default.
 *
 * It changes nothing until approved. One proposal per scope at a time, so a
 * board is never choosing between two drafts without knowing it.
 */
export async function proposeAppetite(input: {
  organisationId: string;
  scope: AppetiteScope;
  level: AppetiteLevel;
  toleratedTier: RiskTier;
  statement: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    if (!isScope(input.scope)) throw new AppetiteRefused("Unknown category");
    if (!APPETITE_LEVELS.includes(input.level)) throw new AppetiteRefused("Unknown appetite level");
    if (!TIER_ORDER.includes(input.toleratedTier)) throw new AppetiteRefused("Unknown tier");
    const statement = input.statement.trim();
    if (!statement) {
      throw new AppetiteRefused("Say what the appetite means in words — the level alone is not a statement");
    }

    return db.transaction(async (tx) => {
      const [pending] = await tx
        .select({ id: riskAppetites.id })
        .from(riskAppetites)
        .where(
          and(
            eq(riskAppetites.organisationId, input.organisationId),
            eq(riskAppetites.category, input.scope),
            eq(riskAppetites.status, "proposed"),
          ),
        );
      if (pending) {
        throw new AppetiteRefused("There is already a proposal waiting for a decision in this category");
      }

      const [row] = await tx
        .insert(riskAppetites)
        .values({
          organisationId: input.organisationId,
          category: input.scope,
          level: input.level,
          toleratedTier: input.toleratedTier,
          statement,
          proposedByUserId: input.actor.actorUserId ?? null,
          proposedByLabel: input.actor.actorLabel,
        })
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "risk_appetite.proposed",
        subjectType: "risk_appetite",
        subjectId: row.id,
        after: { category: row.category, level: row.level, toleratedTier: row.toleratedTier },
      });
      return row;
    });
  });
}

/**
 * Approve or reject a proposed appetite.
 *
 * Not by the person who proposed it — the toolkit puts appetite with senior
 * leaders and the board, and a statement its own author signed off has been
 * signed off by nobody. Approval names where it was agreed, and supersedes
 * whatever was in force for that category. Every approved appetite carries a
 * review date: AI moves quickly, and an appetite set before a technology
 * existed is one nobody actually chose for it.
 */
export async function decideAppetite(input: {
  appetiteId: string;
  organisationId: string;
  decision: "approved" | "rejected";
  approvalReference?: string;
  rejectionReason?: string;
  reviewMonths?: number;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const reference = input.approvalReference?.trim() ?? "";
    const reason = input.rejectionReason?.trim() ?? "";
    if (input.decision === "approved" && !reference) {
      throw new AppetiteRefused("Say where it was signed off — the board, the date and the minute");
    }
    if (input.decision === "rejected" && !reason) {
      throw new AppetiteRefused("Say why it was not approved");
    }
    const reviewMonths = input.reviewMonths ?? 12;
    if (!Number.isInteger(reviewMonths) || reviewMonths < 1 || reviewMonths > 60) {
      throw new AppetiteRefused("Set a review between one month and five years away");
    }

    return db.transaction(async (tx) => {
      const [proposal] = await tx
        .select()
        .from(riskAppetites)
        .where(
          and(
            eq(riskAppetites.id, input.appetiteId),
            eq(riskAppetites.organisationId, input.organisationId),
          ),
        );
      if (!proposal) throw new Error("No such appetite statement");
      if (proposal.status !== "proposed") {
        throw new AppetiteRefused(`This statement is already ${proposal.status}`);
      }
      if (
        proposal.proposedByUserId &&
        input.actor.actorUserId &&
        proposal.proposedByUserId === input.actor.actorUserId
      ) {
        throw new SegregationOfDuties("An appetite cannot be signed off by the person who proposed it");
      }

      const now = new Date();
      let superseded: string | null = null;
      if (input.decision === "approved") {
        const [current] = await tx
          .update(riskAppetites)
          .set({ status: "superseded", supersededAt: now })
          .where(
            and(
              eq(riskAppetites.organisationId, input.organisationId),
              eq(riskAppetites.category, proposal.category),
              eq(riskAppetites.status, "approved"),
            ),
          )
          .returning({ id: riskAppetites.id });
        superseded = current?.id ?? null;
      }

      const [decided] = await tx
        .update(riskAppetites)
        .set({
          status: input.decision,
          decidedByUserId: input.actor.actorUserId ?? null,
          decidedByLabel: input.actor.actorLabel,
          decidedAt: now,
          ...(input.decision === "approved"
            ? {
                approvalReference: reference,
                reviewDueAt: addMonths(now, reviewMonths),
              }
            : { rejectionReason: reason }),
        })
        .where(eq(riskAppetites.id, input.appetiteId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: input.decision === "approved" ? "risk_appetite.approved" : "risk_appetite.rejected",
        subjectType: "risk_appetite",
        subjectId: decided.id,
        before: { status: "proposed" },
        after: {
          status: decided.status,
          category: decided.category,
          level: decided.level,
          toleratedTier: decided.toleratedTier,
          ...(input.decision === "approved"
            ? { approvalReference: reference, supersedes: superseded }
            : { rejectionReason: reason }),
        },
      });
      return decided;
    });
  });
}

/** Approved statements whose review date has passed. */
export async function appetitesDueForReview(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select()
      .from(riskAppetites)
      .where(
        and(eq(riskAppetites.organisationId, organisationId), eq(riskAppetites.status, "approved")),
      )
      .orderBy(asc(riskAppetites.reviewDueAt));
    const now = Date.now();
    return rows.filter((r) => r.reviewDueAt && r.reviewDueAt.getTime() <= now);
  });
}
