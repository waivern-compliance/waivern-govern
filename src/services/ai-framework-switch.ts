import { and, eq } from "drizzle-orm";
import { db, type Db, withOrganisation } from "@/db/client";
import { organisations, riskAppetites, risks, templates } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { AI_FRAMEWORKS, categoryLabel, isAiFramework, type AiFrameworkId } from "@/lib/ai-frameworks";
import { refileCategory } from "@/lib/ai-frameworks/crosswalk";
import { APPETITE_LEVELS, type AppetiteLevel } from "@/lib/risk/appetite";
import { tierRank, type RiskTier } from "@/lib/risk/scale";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { installShippedTemplates, type Actor } from "./templates";

/**
 * Moving an organisation from one AI governance framework to another.
 *
 * What it already holds comes with it rather than being left behind:
 *
 * - Each risk filed under one of the old framework's categories is re-filed
 *   under the new one's, through the crosswalk, and the move is recorded
 *   against the risk.
 * - Appetite does not carry over by itself, because an appetite statement is a
 *   decision an approver signed. For each new category that old statements
 *   map into, the most cautious of them is proposed again under the new
 *   category, for an approver to decide. Until then those risks are judged
 *   against the organisation default, as any category without a statement is.
 * - The new framework's shipped templates are installed. The old ones stay, as
 *   do assessments under way, which keep the template version they started on.
 *
 * Nothing is deleted, so moving back is the same operation the other way.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class FrameworkSwitchRefused extends Error {}

export type FrameworkSwitchPreview = {
  from: AiFrameworkId;
  to: AiFrameworkId;
  /** Shipped templates the organisation will be given. */
  templatesToInstall: string[];
  /** Risks that will move category, open or closed. */
  refiled: Array<{ riskId: string; reference: string; title: string; from: string; to: string }>;
  /** Statements that will be proposed again under a new category. */
  appetite: Array<{ category: string; level: AppetiteLevel; toleratedTier: RiskTier; carriedFrom: string[] }>;
  /**
   * The new framework's categories that will have no approved appetite of their
   * own, so risks in them are judged against the organisation default until
   * one is approved.
   */
  withoutAppetite: string[];
};

async function compute(tx: Tx | Db, organisationId: string, from: AiFrameworkId, to: AiFrameworkId) {
  const [riskRows, appetiteRows, held] = await Promise.all([
    tx
      .select({ id: risks.id, reference: risks.reference, title: risks.title, category: risks.category, entityId: risks.entityId })
      .from(risks)
      .where(eq(risks.organisationId, organisationId)),
    tx.select().from(riskAppetites).where(eq(riskAppetites.organisationId, organisationId)),
    tx
      .select({ name: templates.name })
      .from(templates)
      .where(and(eq(templates.organisationId, organisationId), eq(templates.isSystem, true))),
  ]);

  const refiled = riskRows.flatMap((r) => {
    const target = refileCategory(r.category, to);
    return target && r.category ? [{ riskId: r.id, entityId: r.entityId, reference: r.reference, title: r.title, from: r.category, to: target }] : [];
  });

  const approved = appetiteRows.filter((a) => a.status === "approved");
  const pending = new Set(appetiteRows.filter((a) => a.status === "proposed").map((a) => a.category));
  const approvedFor = new Set(approved.map((a) => a.category));

  const appetite: Array<FrameworkSwitchPreview["appetite"][number] & { statement: string }> = [];
  for (const c of AI_FRAMEWORKS[to].categories) {
    if (approvedFor.has(c.value) || pending.has(c.value)) continue;
    const sources = approved
      .filter((a) => refileCategory(a.category, to) === c.value)
      .sort(
        (a, b) =>
          tierRank(a.toleratedTier as RiskTier) - tierRank(b.toleratedTier as RiskTier) ||
          APPETITE_LEVELS.indexOf(a.level as AppetiteLevel) - APPETITE_LEVELS.indexOf(b.level as AppetiteLevel),
      );
    if (sources.length === 0) continue;
    const [cautious] = sources;
    const carriedFrom = sources.map((s) => categoryLabel(s.category) ?? s.category);
    appetite.push({
      category: c.value,
      level: cautious.level as AppetiteLevel,
      toleratedTier: cautious.toleratedTier as RiskTier,
      carriedFrom,
      statement:
        `Carried over on moving to ${AI_FRAMEWORKS[to].label}, from the appetite for ${categoryLabel(cautious.category)}` +
        (sources.length > 1 ? `, the most cautious of ${carriedFrom.join(", ")}` : "") +
        `: ${cautious.statement}`,
    });
  }

  const withoutAppetite = AI_FRAMEWORKS[to].categories
    .map((c) => c.value)
    .filter((v) => !approvedFor.has(v));

  const names = new Set(held.map((h) => h.name));
  const templatesToInstall = SYSTEM_TEMPLATES.filter((t) => t.aiFramework === to && !names.has(t.name)).map((t) => t.name);

  return { from, to, templatesToInstall, refiled, appetite, withoutAppetite };
}

async function currentFramework(tx: Tx | Db, organisationId: string, lock: boolean) {
  const query = tx
    .select({ aiFramework: organisations.aiFramework })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  const [org] = lock ? await query.for("update") : await query;
  if (!org) throw new FrameworkSwitchRefused("No such organisation");
  return org.aiFramework;
}

/** What moving to `to` would change, without changing it. */
export async function previewAiFrameworkSwitch(organisationId: string, to: string): Promise<FrameworkSwitchPreview> {
  if (!isAiFramework(to)) throw new FrameworkSwitchRefused("No such framework");
  return withOrganisation(organisationId, async () => {
    const from = await currentFramework(db, organisationId, false);
    const { refiled, appetite, ...rest } = await compute(db, organisationId, from, to);
    return {
      ...rest,
      refiled: refiled.map((r) => ({ riskId: r.riskId, reference: r.reference, title: r.title, from: r.from, to: r.to })),
      appetite: appetite.map((a) => ({ category: a.category, level: a.level, toleratedTier: a.toleratedTier, carriedFrom: a.carriedFrom })),
    };
  });
}

/**
 * Move the organisation to `to`. Who may is for the caller: the framework page
 * allows anyone who configures the AI risk workflow across the whole
 * organisation.
 */
export async function switchAiFramework(input: { organisationId: string; to: string; actor: Actor }) {
  const to = input.to;
  if (!isAiFramework(to)) throw new FrameworkSwitchRefused("No such framework");

  const outcome = await withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      // Locked, so two people switching at once cannot each re-file the register.
      const from = await currentFramework(tx, input.organisationId, true);
      if (from === to) throw new FrameworkSwitchRefused(`This organisation already follows ${AI_FRAMEWORKS[to].label}.`);
      const plan = await compute(tx, input.organisationId, from, to);

      await tx
        .update(organisations)
        .set({ aiFramework: to, updatedAt: new Date() })
        .where(eq(organisations.id, input.organisationId));

      for (const r of plan.refiled) {
        await tx.update(risks).set({ category: r.to, updatedAt: new Date() }).where(eq(risks.id, r.riskId));
        await appendAuditEvent(tx, {
          ...input.actor,
          organisationId: input.organisationId,
          action: "risk.recategorised",
          subjectType: "risk",
          subjectId: r.riskId,
          entityId: r.entityId,
          before: { category: r.from },
          after: { category: r.to },
          metadata: { reason: "ai_framework_switch", from, to },
        });
      }

      for (const a of plan.appetite) {
        const [row] = await tx
          .insert(riskAppetites)
          .values({
            organisationId: input.organisationId,
            category: a.category,
            level: a.level,
            toleratedTier: a.toleratedTier,
            statement: a.statement,
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
          metadata: { reason: "ai_framework_switch", carriedFrom: a.carriedFrom },
        });
      }

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation.ai_framework_set",
        subjectType: "organisation",
        subjectId: input.organisationId,
        before: { aiFramework: from },
        after: { aiFramework: to },
        metadata: {
          risksRefiled: plan.refiled.length,
          appetiteProposed: plan.appetite.map((a) => a.category),
          withoutAppetite: plan.withoutAppetite,
        },
      });
      return plan;
    }),
  );

  // Installed after the switch commits, through the same create-and-publish
  // path as every template. It installs only what is missing, so a failure
  // here is put right by installing missing templates from the templates page.
  const installed = await installShippedTemplates({
    organisationId: input.organisationId,
    aiFramework: to,
    actor: input.actor,
  });

  return {
    from: outcome.from,
    to,
    installed,
    refiled: outcome.refiled.length,
    appetiteProposed: outcome.appetite.map((a) => a.category),
    withoutAppetite: outcome.withoutAppetite,
  };
}
