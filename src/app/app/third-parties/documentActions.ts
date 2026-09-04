"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/session";
import {
  UploadRefused,
  attachDocument,
  removeDocument,
} from "@/services/documents";
import type { StoredDocument } from "@/services/documents";

export type UploadResult = { ok: boolean; message: string } | null;

/**
 * Attach one or more files to a record.
 *
 * Several at once, because an agreement is rarely one document — a master
 * agreement, a data processing schedule and a sub-processor annexe are three
 * files describing one arrangement, and making somebody upload them
 * separately invites two of the three going missing.
 */
export async function uploadDocumentsAction(
  context: {
    subjectType: StoredDocument["subjectType"];
    subjectId: string;
    entityId: string | null;
    revalidate: string;
  },
  _prev: UploadResult,
  formData: FormData,
): Promise<UploadResult> {
  const active = await requireCapability(
    "record.write",
    context.entityId ? { entityId: context.entityId } : undefined,
  );

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, message: "Choose at least one file." };

  const description = String(formData.get("description") ?? "").trim();
  const actor = { actorKind: "user" as const, actorUserId: active.userId, actorLabel: active.email };

  const attached: string[] = [];
  const refused: string[] = [];

  for (const file of files) {
    try {
      await attachDocument({
        organisationId: active.membership.organisationId,
        entityId: context.entityId,
        subjectType: context.subjectType,
        subjectId: context.subjectId,
        filename: file.name,
        contentType: file.type,
        description: description || null,
        content: Buffer.from(await file.arrayBuffer()),
        actor,
      });
      attached.push(file.name);
    } catch (error) {
      if (error instanceof UploadRefused) {
        // One bad file does not lose the others: the accepted ones are kept
        // and the rest are named, rather than the whole upload failing.
        refused.push(`${file.name} — ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  revalidatePath(context.revalidate);

  if (refused.length === 0) {
    return { ok: true, message: `Attached ${attached.length} file${attached.length === 1 ? "" : "s"}.` };
  }
  return {
    ok: attached.length > 0,
    message:
      (attached.length > 0 ? `Attached ${attached.length}. ` : "") +
      `Not attached: ${refused.join("; ")}`,
  };
}

export async function removeDocumentAction(id: string, revalidate: string) {
  const active = await requireCapability("record.write");
  await removeDocument({
    id,
    organisationId: active.membership.organisationId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(revalidate);
}
