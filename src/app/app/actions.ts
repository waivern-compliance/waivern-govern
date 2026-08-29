"use server";

import { revalidatePath } from "next/cache";
import type { Persona } from "@/lib/persona";
import { setOwnPersona } from "@/services/persona";

export async function switchPersonaAction(persona: Persona) {
  await setOwnPersona(persona);
  revalidatePath("/app");
}
