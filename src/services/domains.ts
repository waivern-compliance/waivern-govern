import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { memberships, organisationDomains, roleAssignments, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  claimRefusal,
  domainOf,
  normaliseDomain,
  recordsProve,
  verificationRecordName,
  verificationRecordValue,
} from "@/lib/auth/domains";
import type { Actor } from "./templates";

/**
 * Email domains an organisation has claimed, and joining through them.
 *
 * Claiming and verifying act for one organisation, under its row-level
 * security. Joining is the platform's: at sign-in nobody is acting for an
 * organisation yet, and the question is which one owns the domain.
 */

export class DomainRefused extends Error {}

type TxtLookup = (name: string) => Promise<string[][]>;

export async function domainsFor(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select()
      .from(organisationDomains)
      .where(eq(organisationDomains.organisationId, organisationId))
      .orderBy(asc(organisationDomains.domain));
    return rows.map((r) => ({
      ...r,
      recordName: verificationRecordName(r.domain),
      recordValue: verificationRecordValue(r.token),
    }));
  });
}

export async function claimDomain(input: { organisationId: string; domain: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    const refusal = claimRefusal(input.domain);
    if (refusal === "not_a_domain") throw new DomainRefused("That is not a domain name, such as example.gov.uk.");
    if (refusal === "public_email") {
      throw new DomainRefused("Anybody can have an address there, so it cannot be claimed.");
    }
    const domain = normaliseDomain(input.domain)!;

    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(organisationDomains)
        .where(
          and(
            eq(organisationDomains.organisationId, input.organisationId),
            eq(organisationDomains.domain, domain),
          ),
        );
      if (existing) return existing;

      const [row] = await tx
        .insert(organisationDomains)
        .values({
          organisationId: input.organisationId,
          domain,
          token: randomBytes(18).toString("base64url"),
          createdBy: input.actor.actorUserId ?? null,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation_domain.claimed",
        subjectType: "organisation",
        subjectId: input.organisationId,
        after: { domain },
      });
      return row;
    });
  });
}

/**
 * Check the DNS record and, if it is there, verify the claim.
 *
 * Refused if another organisation has already verified the same domain: a
 * domain lets people in, and it cannot let them into two places.
 */
export async function verifyDomain(input: {
  organisationId: string;
  claimId: string;
  actor: Actor;
  lookup?: TxtLookup;
}) {
  return withOrganisation(input.organisationId, async () => {
    const [claim] = await db
      .select()
      .from(organisationDomains)
      .where(
        and(
          eq(organisationDomains.id, input.claimId),
          eq(organisationDomains.organisationId, input.organisationId),
        ),
      );
    if (!claim) throw new DomainRefused("No such domain claim.");
    if (claim.verifiedAt) return claim;

    let records: string[][];
    try {
      records = await (input.lookup ?? resolveTxt)(verificationRecordName(claim.domain));
    } catch {
      records = [];
    }
    if (!recordsProve(records, claim.token)) {
      throw new DomainRefused(
        `The record is not there yet. Publish a TXT record at ${verificationRecordName(claim.domain)} ` +
          `with the value ${verificationRecordValue(claim.token)}, then check again; DNS can take a while to update.`,
      );
    }

    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .update(organisationDomains)
          .set({ verifiedAt: new Date(), verifiedBy: input.actor.actorUserId ?? null })
          .where(eq(organisationDomains.id, claim.id))
          .returning();
        await appendAuditEvent(tx, {
          ...input.actor,
          organisationId: input.organisationId,
          action: "organisation_domain.verified",
          subjectType: "organisation",
          subjectId: input.organisationId,
          after: { domain: claim.domain },
        });
        return row;
      });
    } catch (error) {
      const text = `${(error as Error).message} ${((error as Error & { cause?: Error }).cause?.message) ?? ""}`;
      if (/organisation_domain_verified_key/.test(text)) {
        throw new DomainRefused("Another organisation has already verified that domain.");
      }
      throw error;
    }
  });
}

export async function removeDomain(input: { organisationId: string; claimId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .delete(organisationDomains)
        .where(
          and(
            eq(organisationDomains.id, input.claimId),
            eq(organisationDomains.organisationId, input.organisationId),
          ),
        )
        .returning();
      if (!row) return null;
      // Nobody already in is removed: the claim only stops new people joining.
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation_domain.removed",
        subjectType: "organisation",
        subjectId: input.organisationId,
        before: { domain: row.domain, verified: row.verifiedAt !== null },
      });
      return row;
    });
  });
}

/**
 * At sign-in: join the organisation that has verified this person's email
 * domain, as a contributor.
 *
 * Only for an address the identity provider has verified — the caller checks
 * that. Never for somebody who has ever been a member of that organisation: a
 * person an administrator removed must not be let back in by their address.
 * Returns the organisation joined, or null.
 */
export async function joinByVerifiedDomain(email: string, name: string | null): Promise<string | null> {
  const domain = domainOf(email);
  if (!domain) return null;

  const [claim] = await db
    .select({ organisationId: organisationDomains.organisationId })
    .from(organisationDomains)
    .where(and(eq(organisationDomains.domain, domain), isNotNull(organisationDomains.verifiedAt)));
  if (!claim) return null;

  const address = email.toLowerCase().trim();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, address));
  const userId =
    existing?.id ??
    (await db.insert(users).values({ email: address, name }).returning({ id: users.id }))[0].id;

  const [before] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organisationId, claim.organisationId), eq(memberships.userId, userId)));
  if (before) return null;

  await withOrganisation(claim.organisationId, () =>
    db.transaction(async (tx) => {
      const [membership] = await tx
        .insert(memberships)
        .values({ organisationId: claim.organisationId, userId })
        .returning();
      await tx
        .insert(roleAssignments)
        .values({ membershipId: membership.id, role: "contributor", scope: "organisation" });
      await appendAuditEvent(tx, {
        actorKind: "system",
        actorUserId: null,
        actorLabel: address,
        organisationId: claim.organisationId,
        action: "membership.joined_by_domain",
        subjectType: "membership",
        subjectId: membership.id,
        after: { email: address, domain, role: "contributor" },
      });
    }),
  );
  return claim.organisationId;
}
