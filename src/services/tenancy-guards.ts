import { and, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { entities, memberships, recordType } from "@/db/schema";

/**
 * Checks that something a request names belongs to the organisation acting.
 *
 * A foreign key proves a row exists, not whose it is: a risk in one
 * organisation can name another organisation's legal entity, an AI system
 * another's supplier, a comment another's risk, and the database accepts every
 * one. Services filtered the record they acted on by organisation, but not the
 * records it pointed at, so a request carrying another organisation's ids
 * linked across the boundary — and then showed what it linked to.
 *
 * Every service that takes an id of something other than the record it acts
 * on checks it here first. The isolation suite attacks each one.
 */

export class NotInOrganisation extends Error {}

type Reader = Pick<Db, "select" | "execute">;
type RecordType = (typeof recordType.enumValues)[number];

export async function assertEntityIn(organisationId: string, entityId: string, executor: Reader = db) {
  const [row] = await executor
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.organisationId, organisationId)));
  if (!row) throw new NotInOrganisation("No such legal entity in this organisation.");
}

/**
 * A member of this organisation, current or former.
 *
 * Former, because this is a boundary check and not a staffing one: a record
 * owned by somebody who has since left still has to be editable, and its form
 * sends the owner back unchanged. Whether a leaver may be newly given work is
 * for the service that gives it.
 */
export async function assertMemberOf(organisationId: string, userId: string, executor: Reader = db) {
  const [row] = await executor
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organisationId, organisationId), eq(memberships.userId, userId)));
  if (!row) throw new NotInOrganisation("That person is not a member of this organisation.");
}

/** Records that carry their organisation directly; the record type is the table's name. */
const OWN_TABLE: ReadonlySet<RecordType> = new Set<RecordType>([
  "assessment", "processing_activity", "ai_use_case", "supplier", "dpa", "risk", "breach",
  "comment", "document", "extraction", "extraction_finding", "task", "ai_incident",
  "ai_use_case_request", "atrs_record", "scan_finding", "evidence", "risk_appetite",
  "training_record", "ai_change", "ai_assurance_record", "integration_connection", "template",
  "workflow_definition", "breach_decision",
]);

/** Records that reach their organisation through one parent. */
const THROUGH_PARENT: Partial<Record<RecordType, { parent: string; key: string }>> = {
  mitigation: { parent: "risk", key: "risk_id" },
  risk_acceptance: { parent: "risk", key: "risk_id" },
  approval: { parent: "assessment", key: "assessment_id" },
  template_version: { parent: "template", key: "template_id" },
  workflow_stage: { parent: "workflow_definition", key: "workflow_definition_id" },
};

/**
 * A record of the given type, in this organisation.
 *
 * A type that is neither listed is refused rather than allowed: anything new
 * that can be commented on, attached to or assessed must say where it lives.
 */
export async function assertRecordIn(
  organisationId: string,
  type: RecordType,
  id: string,
  executor: Reader = db,
) {
  let found: unknown[];
  if (OWN_TABLE.has(type)) {
    found = await executor.execute(
      sql`select 1 from ${sql.identifier(type)} where id = ${id} and organisation_id = ${organisationId}`,
    );
  } else if (THROUGH_PARENT[type]) {
    const { parent, key } = THROUGH_PARENT[type]!;
    found = await executor.execute(sql`
      select 1 from ${sql.identifier(type)} c
      join ${sql.identifier(parent)} p on p.id = c.${sql.identifier(key)}
      where c.id = ${id} and p.organisation_id = ${organisationId}`);
  } else {
    throw new NotInOrganisation(`Nothing can be attached to a ${type.replace(/_/g, " ")}.`);
  }
  if (found.length === 0) {
    throw new NotInOrganisation(`No such ${type.replace(/_/g, " ")} in this organisation.`);
  }
}
