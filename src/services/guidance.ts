import { and, count, eq, isNotNull, isNull, lt, lte, ne, notExists, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiUseCases,
  assessments,
  dpas,
  entities,
  memberships,
  processingActivities,
  suppliers,
  tasks,
  templates,
  templateVersions,
} from "@/db/schema";
import { STEPS, type Stage, type Step } from "@/lib/guidance/steps";
import { requireSession } from "@/lib/session";
import { EXPIRING_WITHIN_DAYS } from "./third-party";

/**
 * The guide, and how far through it this organisation actually is.
 *
 * Progress is measured, never remembered. A checklist that stores its own
 * ticks tells you what somebody clicked; this reads the registers, so it tells
 * you what exists. That matters because the people this is for are precisely
 * the people who cannot tell whether a step is really finished — and a guide
 * that congratulates them for a box they ticked would be worse than none.
 */

export type Mode = "off" | Stage;

export type StepState = Step & {
  done: boolean;
  /** What was counted, said in the words of the step rather than as a number. */
  measure: string;
};

export type Guidance = {
  mode: Mode;
  /** Whether the mode was chosen by this person or derived from the registers. */
  chosen: boolean;
  stage: Stage;
  steps: StepState[];
  remaining: number;
};

/**
 * One count per register.
 *
 * Written as separate typed queries rather than one hand-rolled block of SQL.
 * The first version was the latter, and it silently produced `where  = $1` for
 * the one table whose organisation is reached through a parent — a class of
 * mistake the query builder cannot make.
 */
async function tally(organisationId: string) {
  const now = new Date();
  const horizon = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * 86_400_000);
  const rows = async (query: Promise<Array<{ n: number }>>) => (await query)[0]?.n ?? 0;
  const n = { n: count() };

  const [
    entityCount,
    people,
    published,
    activities,
    supplierCount,
    agreements,
    uncovered,
    untriaged,
    expiring,
    ai,
    all,
    approved,
    scheduled,
    overdueReviews,
    overdueTasks,
    openTasks,
  ] = await Promise.all([
    rows(db.select(n).from(entities).where(eq(entities.organisationId, organisationId))),
    rows(db.select(n).from(memberships).where(eq(memberships.organisationId, organisationId))),
    rows(
      db
        .select(n)
        .from(templateVersions)
        .innerJoin(templates, eq(templates.id, templateVersions.templateId))
        .where(
          and(eq(templates.organisationId, organisationId), eq(templateVersions.status, "published")),
        ),
    ),
    rows(
      db
        .select(n)
        .from(processingActivities)
        .where(eq(processingActivities.organisationId, organisationId)),
    ),
    rows(db.select(n).from(suppliers).where(eq(suppliers.organisationId, organisationId))),
    rows(
      db
        .select(n)
        .from(dpas)
        .where(and(eq(dpas.organisationId, organisationId), isNull(dpas.archivedAt))),
    ),
    // A third party with no live agreement is the Article 28 gap this step is
    // really about, so it is counted rather than inferred from two totals.
    rows(
      db
        .select(n)
        .from(suppliers)
        .where(
          and(
            eq(suppliers.organisationId, organisationId),
            notExists(
              db
                .select({ one: sql`1` })
                .from(dpas)
                .where(and(eq(dpas.supplierId, suppliers.id), isNull(dpas.archivedAt))),
            ),
          ),
        ),
    ),
    rows(
      db
        .select(n)
        .from(suppliers)
        .where(
          and(
            eq(suppliers.organisationId, organisationId),
            isNotNull(suppliers.sourceConnectionId),
            isNull(suppliers.reviewedAt),
          ),
        ),
    ),
    rows(
      db
        .select(n)
        .from(dpas)
        .where(
          and(
            eq(dpas.organisationId, organisationId),
            isNull(dpas.archivedAt),
            isNotNull(dpas.expiresAt),
            lte(dpas.expiresAt, horizon),
          ),
        ),
    ),
    rows(db.select(n).from(aiUseCases).where(eq(aiUseCases.organisationId, organisationId))),
    rows(db.select(n).from(assessments).where(eq(assessments.organisationId, organisationId))),
    rows(
      db
        .select(n)
        .from(assessments)
        .where(
          and(eq(assessments.organisationId, organisationId), eq(assessments.status, "approved")),
        ),
    ),
    rows(
      db
        .select(n)
        .from(assessments)
        .where(
          and(
            eq(assessments.organisationId, organisationId),
            eq(assessments.status, "approved"),
            isNotNull(assessments.reviewDueAt),
          ),
        ),
    ),
    rows(
      db
        .select(n)
        .from(assessments)
        .where(
          and(
            eq(assessments.organisationId, organisationId),
            eq(assessments.status, "approved"),
            lt(assessments.reviewDueAt, now),
          ),
        ),
    ),
    rows(
      db
        .select(n)
        .from(tasks)
        .where(
          and(
            eq(tasks.organisationId, organisationId),
            ne(tasks.status, "done"),
            lt(tasks.dueAt, now),
          ),
        ),
    ),
    rows(
      db
        .select(n)
        .from(tasks)
        .where(and(eq(tasks.organisationId, organisationId), ne(tasks.status, "done"))),
    ),
  ]);

  return {
    entities: entityCount,
    people,
    published,
    activities,
    suppliers: supplierCount,
    agreements,
    uncovered,
    untriaged,
    expiring,
    ai,
    assessments: all,
    approved,
    scheduled,
    overdueReviews,
    overdueTasks,
    openTasks,
  };
}

type Tally = Awaited<ReturnType<typeof tally>>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Whether each step is finished, and the sentence that says why.
 *
 * The measure is always a fact about the registers, phrased so somebody can
 * check it themselves. "3 activities recorded" invites a look; "step complete"
 * invites trust the platform has not earned.
 */
function measure(step: Step, t: Tally): { done: boolean; measure: string } {
  switch (step.id) {
    case "entities":
      return { done: t.entities > 0, measure: `${plural(t.entities, "entity", "entities")} recorded` };
    case "people":
      return { done: t.people > 1, measure: `${plural(t.people, "person", "people")} with access` };
    case "templates":
      return { done: t.published > 0, measure: `${plural(t.published, "template")} published` };
    case "activities":
      return { done: t.activities > 0, measure: `${plural(t.activities, "activity", "activities")} recorded` };
    case "third-parties":
      return {
        done: t.suppliers > 0 && t.uncovered === 0,
        measure:
          t.suppliers === 0
            ? "no third parties recorded"
            : `${plural(t.suppliers, "third party", "third parties")}, ${t.uncovered} without an agreement`,
      };
    case "ai":
      return { done: t.ai > 0, measure: `${plural(t.ai, "AI system")} recorded` };
    case "assessments":
      return {
        done: t.approved > 0,
        measure: `${plural(t.assessments, "assessment")}, ${t.approved} approved`,
      };
    case "reviews":
      return {
        done: t.approved > 0 && t.scheduled === t.approved,
        measure:
          t.approved === 0
            ? "nothing approved yet"
            : `${t.scheduled} of ${plural(t.approved, "approved assessment")} have a review date`,
      };

    case "tasks":
      return {
        done: t.overdueTasks === 0,
        measure: `${plural(t.openTasks, "open task")}, ${t.overdueTasks} overdue`,
      };
    case "due-reviews":
      return {
        done: t.overdueReviews === 0,
        measure: `${plural(t.overdueReviews, "assessment")} past a review date`,
      };
    case "expiring":
      return {
        done: t.expiring === 0,
        measure: `${plural(t.expiring, "agreement")} expiring within six months`,
      };
    case "untriaged":
      return {
        done: t.untriaged === 0,
        measure: `${plural(t.untriaged, "third party", "third parties")} never reviewed`,
      };
    case "records-current":
      return {
        done: t.activities > 0,
        measure: `${plural(t.activities, "activity", "activities")} recorded`,
      };
    case "risks":
      // Deliberately never marked done: "no open risk" is a snapshot, and a
      // tick would suggest risk work is a thing you finish.
      return { done: false, measure: "an ongoing judgement, not a box to tick" };
    case "breach":
      return { done: false, measure: "read it before you need it" };
    case "evidence":
      return { done: false, measure: "worth doing before somebody asks" };
    default:
      return { done: false, measure: "" };
  }
}

/**
 * Which stage an organisation is in, when nobody has said.
 *
 * Derived from whether the registers hold anything, rather than asked. A new
 * organisation should be guided without somebody first discovering that a
 * guide exists.
 */
export function derivedStage(t: Pick<Tally, "activities" | "approved">): Stage {
  return t.activities > 0 && t.approved > 0 ? "maintain" : "setup";
}

export async function guidanceFor(input: {
  organisationId: string;
  chosen: Mode | null;
}): Promise<Guidance> {
  const t = await tally(input.organisationId);
  const stage = input.chosen && input.chosen !== "off" ? input.chosen : derivedStage(t);
  const steps = STEPS[stage].map((step) => ({ ...step, ...measure(step, t) }));

  return {
    mode: input.chosen ?? stage,
    chosen: input.chosen !== null,
    stage,
    steps,
    remaining: steps.filter((s) => !s.done).length,
  };
}

/** A person's own choice. Grants nothing, so it needs no capability. */
export async function setOwnGuidance(mode: Mode) {
  if (!["off", "setup", "maintain"].includes(mode)) throw new Error("No such guidance mode");
  const active = await requireSession();

  await db
    .update(memberships)
    .set({ guidance: mode })
    .where(
      and(
        eq(memberships.organisationId, active.membership.organisationId),
        eq(memberships.userId, active.userId),
      ),
    );
}
