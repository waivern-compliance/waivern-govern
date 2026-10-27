"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { requestsOpen } from "@/lib/platform";
import { RequestRefused, requestOrganisation } from "@/services/organisation-requests";

export type RequestResult = { ok: boolean; message: string } | null;

export async function requestOrganisationAction(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/sign-in");
  if (!requestsOpen()) return { ok: false, message: "New organisations are not being set up here." };
  try {
    await requestOrganisation({
      userId: session.user.id,
      email: session.user.email,
      organisationName: String(formData.get("organisationName") ?? ""),
      entityName: String(formData.get("entityName") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
  } catch (error) {
    if (error instanceof RequestRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/welcome");
  return { ok: true, message: "Sent. You will be able to start as soon as it is approved." };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}
