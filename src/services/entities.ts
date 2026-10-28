import { and, asc, eq, ne } from "drizzle-orm";
import { db, withOrganisation, type Db } from "@/db/client";
import { entities } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { NotInOrganisation } from "./tenancy-guards";
import type { Actor } from "./templates";

/**
 * An organisation's legal entities: adding one, renaming one, and choosing the
 * default.
 *
 * Entities sit inside an organisation; the organisation itself — a separate
 * account — is created only when Waivern approves a request (see
 * `organisation-requests.ts`). Who may call these is for the caller: the
 * Organisation page allows an owner over the whole organisation only.
 *
 * Nothing is removed here. Records, grants and retention profiles point at
 * entities, and an entity that held records is part of their history.
 */

export class EntityRefused extends Error {}

const NAME_LIMIT = 120;
const REF_LIMIT = 60;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function cleanName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new EntityRefused("Give the legal entity's name.");
  if (name.length > NAME_LIMIT) throw new EntityRefused("That name is too long.");
  return name;
}

function cleanRef(value: string | null | undefined): string | null {
  const ref = (value ?? "").trim();
  if (!ref) return null;
  if (ref.length > REF_LIMIT) throw new EntityRefused("That reference is too long.");
  return ref;
}

/**
 * Ingest and export find an entity by its name or its reference, either one, so
 * no two entities may share either — including one entity's name being
 * another's reference.
 */
async function assertDistinct(tx: Tx, organisationId: string, name: string, ref: string | null, except?: string) {
  const others = await tx
    .select({ name: entities.name, ref: entities.legalEntityRef })
    .from(entities)
    .where(
      except
        ? and(eq(entities.organisationId, organisationId), ne(entities.id, except))
        : eq(entities.organisationId, organisationId),
    );
  const taken = new Set(others.flatMap((o) => [o.name, o.ref]).filter(Boolean).map((v) => v!.toLowerCase()));
  if (taken.has(name.toLowerCase())) {
    throw new EntityRefused(`Another legal entity is already called or referenced “${name}”.`);
  }
  if (ref && taken.has(ref.toLowerCase())) {
    throw new EntityRefused(`Another legal entity is already called or referenced “${ref}”.`);
  }
}

export async function entitiesOf(organisationId: string) {
  return withOrganisation(organisationId, () =>
    db
      .select()
      .from(entities)
      .where(eq(entities.organisationId, organisationId))
      .orderBy(asc(entities.name)),
  );
}

export async function addEntity(input: {
  organisationId: string;
  name: string;
  legalEntityRef?: string | null;
  actor: Actor;
}) {
  const name = cleanName(input.name);
  const legalEntityRef = cleanRef(input.legalEntityRef);
  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      await assertDistinct(tx, input.organisationId, name, legalEntityRef);
      const [created] = await tx
        .insert(entities)
        .values({ organisationId: input.organisationId, name, legalEntityRef })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "entity.created",
        subjectType: "entity",
        subjectId: created.id,
        entityId: created.id,
        after: { name, legalEntityRef },
      });
      return created;
    }),
  );
}

async function entityIn(tx: Tx, organisationId: string, entityId: string) {
  const [row] = await tx
    .select()
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.organisationId, organisationId)));
  if (!row) throw new NotInOrganisation("No such legal entity in this organisation.");
  return row;
}

/**
 * Change an entity's name or reference. Its records follow it, being linked by
 * id; whatever outside names it — the Portal's ingest, a script — has to be
 * told.
 */
export async function renameEntity(input: {
  organisationId: string;
  entityId: string;
  name: string;
  legalEntityRef?: string | null;
  actor: Actor;
}) {
  const name = cleanName(input.name);
  const legalEntityRef = cleanRef(input.legalEntityRef);
  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      const before = await entityIn(tx, input.organisationId, input.entityId);
      if (before.name === name && before.legalEntityRef === legalEntityRef) return before;
      await assertDistinct(tx, input.organisationId, name, legalEntityRef, before.id);
      const [after] = await tx
        .update(entities)
        .set({ name, legalEntityRef, updatedAt: new Date() })
        .where(eq(entities.id, before.id))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "entity.renamed",
        subjectType: "entity",
        subjectId: before.id,
        entityId: before.id,
        before: { name: before.name, legalEntityRef: before.legalEntityRef },
        after: { name, legalEntityRef },
      });
      return after;
    }),
  );
}

/** Where a record arrives with no entity named, it lands in the default. There is one. */
export async function makeDefaultEntity(input: { organisationId: string; entityId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      const chosen = await entityIn(tx, input.organisationId, input.entityId);
      if (chosen.isDefault) return chosen;
      const [previous] = await tx
        .select({ id: entities.id, name: entities.name })
        .from(entities)
        .where(and(eq(entities.organisationId, input.organisationId), eq(entities.isDefault, true)));
      await tx
        .update(entities)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(entities.organisationId, input.organisationId), eq(entities.isDefault, true)));
      const [after] = await tx
        .update(entities)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(entities.id, chosen.id))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "entity.made_default",
        subjectType: "entity",
        subjectId: chosen.id,
        entityId: chosen.id,
        before: { default: previous?.name ?? null },
        after: { default: chosen.name },
      });
      return after;
    }),
  );
}
