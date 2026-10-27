import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { aiUseCases, memberships, roleAssignments, trainingRecords, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  COURSE_BY_KEY,
  SRO_COURSES,
  isCourseKey,
  requirementsFor,
  statusOf,
  type CourseKey,
  type CourseStatus,
} from "@/lib/ai/training";
import type { AppRole } from "@/lib/rbac";
import type { Actor } from "./templates";

/**
 * AI learning: who has done what, and who still needs to.
 */

export class TrainingRefused extends Error {}

export async function recordTraining(input: {
  organisationId: string;
  userId: string;
  /** A course from the shipped list, or null with a title for anything else. */
  courseKey: string | null;
  title?: string;
  completedAt: Date;
  evidenceRef?: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const course = input.courseKey ? COURSE_BY_KEY.get(input.courseKey) : null;
    if (input.courseKey && !course) throw new TrainingRefused("No such course.");
    const title = (input.title ?? "").trim() || course?.title || "";
    if (!title) throw new TrainingRefused("Say what the learning was.");
    if (Number.isNaN(input.completedAt.getTime()) || input.completedAt.getTime() > Date.now()) {
      throw new TrainingRefused("Give the date it was completed, which cannot be in the future.");
    }

    const [member] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(eq(memberships.organisationId, input.organisationId), eq(memberships.userId, input.userId)),
      );
    if (!member) throw new TrainingRefused("That person is not a member.");

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(trainingRecords)
        .values({
          organisationId: input.organisationId,
          userId: input.userId,
          courseKey: course?.key ?? null,
          title,
          completedAt: input.completedAt,
          evidenceRef: (input.evidenceRef ?? "").trim() || null,
          selfAttested: input.actor.actorUserId === input.userId,
          recordedByUserId: input.actor.actorUserId ?? null,
          recordedByLabel: input.actor.actorLabel,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "training.recorded",
        subjectType: "training_record",
        subjectId: row.id,
        after: {
          userId: input.userId,
          course: row.courseKey,
          title,
          completedAt: row.completedAt.toISOString(),
          selfAttested: row.selfAttested,
        },
      });
      return row;
    });
  });
}

/** Most recent completion per person and course, for the shipped courses. */
async function latestCompletions(organisationId: string, userIds?: string[]) {
  const rows = await db
    .select({ userId: trainingRecords.userId, course: trainingRecords.courseKey, at: trainingRecords.completedAt })
    .from(trainingRecords)
    .where(
      and(
        eq(trainingRecords.organisationId, organisationId),
        isNotNull(trainingRecords.courseKey),
        ...(userIds ? [inArray(trainingRecords.userId, userIds)] : []),
      ),
    );
  const latest = new Map<string, Date>();
  for (const r of rows) {
    const k = `${r.userId}:${r.course}`;
    const seen = latest.get(k);
    if (!seen || r.at > seen) latest.set(k, r.at);
  }
  return (userId: string, course: CourseKey) => latest.get(`${userId}:${course}`) ?? null;
}

/** People who own a system still in use. */
async function aiSystemOwners(organisationId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ ownerId: aiUseCases.ownerId })
    .from(aiUseCases)
    .where(
      and(
        eq(aiUseCases.organisationId, organisationId),
        ne(aiUseCases.lifecycleStage, "retired"),
        isNotNull(aiUseCases.ownerId),
      ),
    );
  return new Set(rows.map((r) => r.ownerId!));
}

export type PersonCoverage = {
  userId: string;
  email: string;
  roles: AppRole[];
  ownsAiSystem: boolean;
  courses: Array<{ course: CourseKey; because: string[]; status: CourseStatus; completedAt: Date | null }>;
  outstanding: number;
};

/** Every active member, what they need, and where they stand. */
export async function coverage(organisationId: string, onlyUserId?: string): Promise<PersonCoverage[]> {
  return withOrganisation(organisationId, async () => {
    const people = await db
      .select({ userId: users.id, email: users.email, membershipId: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organisationId, organisationId),
          eq(memberships.isActive, true),
          ...(onlyUserId ? [eq(memberships.userId, onlyUserId)] : []),
        ),
      )
      .orderBy(users.email);
    if (people.length === 0) return [];

    const [grants, owners, latest] = await Promise.all([
      db
        .select({ membershipId: roleAssignments.membershipId, role: roleAssignments.role })
        .from(roleAssignments)
        .where(inArray(roleAssignments.membershipId, people.map((p) => p.membershipId))),
      aiSystemOwners(organisationId),
      latestCompletions(organisationId, people.map((p) => p.userId)),
    ]);
    const rolesOf = new Map<string, AppRole[]>();
    for (const g of grants) rolesOf.set(g.membershipId, [...(rolesOf.get(g.membershipId) ?? []), g.role as AppRole]);

    const now = new Date();
    return people.map((p) => {
      const roles = rolesOf.get(p.membershipId) ?? [];
      const ownsAiSystem = owners.has(p.userId);
      const courses = requirementsFor(roles, ownsAiSystem).map(({ course, because }) => {
        const completedAt = latest(p.userId, course);
        return { course, because, status: statusOf(course, completedAt, now), completedAt };
      });
      return {
        userId: p.userId,
        email: p.email,
        roles,
        ownsAiSystem,
        courses,
        outstanding: courses.filter((c) => c.status !== "current").length,
      };
    });
  });
}

/** One person's record of learning, newest first, including anything outside the course list. */
export async function historyOf(organisationId: string, userId: string) {
  return withOrganisation(organisationId, async () => {
    return db
      .select()
      .from(trainingRecords)
      .where(and(eq(trainingRecords.organisationId, organisationId), eq(trainingRecords.userId, userId)))
      .orderBy(desc(trainingRecords.completedAt), desc(trainingRecords.createdAt));
  });
}

/** Owners whose owner-level learning is current, for the AI register. */
export async function trainedOwners(organisationId: string): Promise<Set<string>> {
  return withOrganisation(organisationId, async () => {
    const owners = [...(await aiSystemOwners(organisationId))];
    if (owners.length === 0) return new Set();
    const latest = await latestCompletions(organisationId, owners);
    const now = new Date();
    return new Set(
      owners.filter((id) => SRO_COURSES.every((c) => statusOf(c, latest(id, c), now) === "current")),
    );
  });
}

export { isCourseKey };
