"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isPlatformAdmin } from "@/lib/platform";
import { RequestRefused, approveRequest, declineRequest } from "@/services/organisation-requests";

export type DecisionResult = { ok: boolean; message: string } | null;

/** The operator deciding, or a 404: the page's existence is not advertised. */
async function operator(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isPlatformAdmin(email)) notFound();
  return email;
}

async function decide(work: () => Promise<string>): Promise<DecisionResult> {
  try {
    const message = await work();
    revalidatePath("/platform");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof RequestRefused) return { ok: false, message: error.message };
    throw error;
  }
}

export async function approveAction(requestId: string, _prev: DecisionResult): Promise<DecisionResult> {
  const email = await operator();
  return decide(async () => {
    const { organisation } = await approveRequest({ requestId, decidedByEmail: email });
    return `${organisation.name} is set up. Its owner can sign in now.`;
  });
}

export async function declineAction(requestId: string, _prev: DecisionResult, formData: FormData): Promise<DecisionResult> {
  const email = await operator();
  return decide(async () => {
    const declined = await declineRequest({ requestId, decidedByEmail: email, note: String(formData.get("note") ?? "") });
    return `Declined ${declined.organisationName}.`;
  });
}
