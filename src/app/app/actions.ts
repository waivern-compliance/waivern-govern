"use server";

import { revalidatePath } from "next/cache";
import type { Persona } from "@/lib/persona";
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
