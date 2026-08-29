"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { PERSONAS, type Persona } from "@/lib/persona";
import { requireSession } from "@/lib/session";

/**
 * Change how the platform presents itself to you.
 *
 * Deliberately something a person may do for themselves. It grants nothing and
 * hides nothing they could otherwise reach — it decides what their home screen
 * leads with — so requiring an administrator for it would be ceremony without
 * protection. Somebody who spans two roles in real life switches as they work.
 */
export async function setOwnPersona(persona: Persona) {
  if (!PERSONAS.includes(persona)) throw new Error("No such persona");
  const active = await requireSession();

  await db
    .update(memberships)
    .set({ persona })
    .where(
      and(
        eq(memberships.organisationId, active.membership.organisationId),
        eq(memberships.userId, active.userId),
      ),
    );
}
