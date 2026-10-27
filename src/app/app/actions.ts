"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, loadMemberships } from "@/auth";
import type { Persona } from "@/lib/persona";
import { ORGANISATION_COOKIE } from "@/lib/session";
import { setOwnGuidance, type Mode } from "@/services/guidance";
import { setOwnPersona } from "@/services/persona";

export async function switchPersonaAction(persona: Persona) {
  await setOwnPersona(persona);
  revalidatePath("/app");
}

export async function setGuidanceAction(mode: Mode) {
  await setOwnGuidance(mode);
  revalidatePath("/app");
}

/**
 * Work in another of the caller's organisations.
 *
 * Only an organisation they are an active member of: the cookie this sets is a
 * preference the session re-checks on every request, but refusing an unknown
 * one here keeps a mistaken or forged choice from being remembered at all.
 * Lands on the home page, because whatever record was open belongs to the
 * organisation being left.
 */
export async function switchOrganisationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const chosen = String(formData.get("organisationId") ?? "");
  const memberships = await loadMemberships(session.user.id);
  if (!memberships.some((m) => m.organisationId === chosen)) {
    throw new Error("You are not a member of that organisation.");
  }
  (await cookies()).set(ORGANISATION_COOKIE, chosen, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/app");
}
