"use server";

import { revalidatePath } from "next/cache";
import { pathFor } from "@/lib/records";
import { requireCapability } from "@/lib/session";
import { postComment, withdrawComment } from "@/services/collaboration";
import type { Comment } from "@/services/collaboration";

/**
 * Commenting needs read access, not write.
 *
 * Asking a question about a record is not changing it, and requiring
 * `record.write` would silence exactly the people the discussion is for — an
 * engineering lead or product manager who can see what is being asked of them
 * but cannot edit the assessment.
 */
export async function postCommentAction(
  context: {
    subjectType: Comment["subjectType"];
    subjectId: string;
    entityId: string | null;
    subjectLabel: string;
  },
  formData: FormData,
) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const active = await requireCapability(
    "record.read",
    context.entityId ? { entityId: context.entityId } : undefined,
  );

  await postComment({
    organisationId: active.membership.organisationId,
    entityId: context.entityId,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    subjectLabel: context.subjectLabel,
    body,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  const href = pathFor(context.subjectType, context.subjectId);
  if (href) revalidatePath(href);
}

export async function withdrawCommentAction(commentId: string, href: string) {
  const active = await requireCapability("record.read");
  await withdrawComment({
    commentId,
    organisationId: active.membership.organisationId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(href);
}
