"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/session";
import {
  ExtractionUnavailable,
  decideFinding,
  declineLink,
  followLink,
  runExtraction,
} from "@/services/extraction";

export type ExtractionResult = { ok: boolean; message: string } | null;

const actorFrom = (active: { userId: string; email: string }) => ({
  actorKind: "user" as const,
  actorUserId: active.userId,
  actorLabel: active.email,
});

export async function readAgreementAction(
  context: { dpaId: string; entityId: string | null; revalidate: string },
  _prev: ExtractionResult,
): Promise<ExtractionResult> {
  const active = await requireCapability(
    "record.write",
    context.entityId ? { entityId: context.entityId } : undefined,
  );

  try {
    const run = await runExtraction({
      organisationId: active.membership.organisationId,
      entityId: context.entityId,
      dpaId: context.dpaId,
      actor: actorFrom(active),
    });
    revalidatePath(context.revalidate);

    if (run.failure) return { ok: false, message: run.failure };

    const found =
      `Proposed ${run.transfers} transfer mechanism${run.transfers === 1 ? "" : "s"} ` +
      `and ${run.subProcessors} sub-processor${run.subProcessors === 1 ? "" : "s"}` +
      (run.links > 0 ? `, and found ${run.links} link${run.links === 1 ? "" : "s"} to a list held elsewhere` : "") +
      ".";
    const skipped =
      run.unreadable.length > 0
        ? ` Not read: ${run.unreadable.map((u) => `${u.name} — ${u.reason}`).join(" ")}`
        : "";
    return { ok: true, message: found + skipped };
  } catch (error) {
    if (error instanceof ExtractionUnavailable) return { ok: false, message: error.message };
    throw error;
  }
}

export async function decideFindingAction(
  findingId: string,
  accept: boolean,
  context: { entityId: string | null; revalidate: string },
) {
  const active = await requireCapability(
    "record.write",
    context.entityId ? { entityId: context.entityId } : undefined,
  );
  await decideFinding({
    organisationId: active.membership.organisationId,
    entityId: context.entityId,
    findingId,
    accept,
    actor: actorFrom(active),
  });
  revalidatePath(context.revalidate);
}

/**
 * Fetch a sub-processor page the agreement pointed at.
 *
 * Its own action, and its own button, because it is the one step here that
 * makes the platform open an address chosen by somebody outside the
 * organisation. A person decides that, every time.
 */
export async function followLinkAction(
  linkId: string,
  context: { entityId: string | null; revalidate: string },
  _prev: ExtractionResult,
): Promise<ExtractionResult> {
  const active = await requireCapability(
    "record.write",
    context.entityId ? { entityId: context.entityId } : undefined,
  );
  try {
    const run = await followLink({
      organisationId: active.membership.organisationId,
      entityId: context.entityId,
      linkId,
      actor: actorFrom(active),
    });
    revalidatePath(context.revalidate);
    if (run.failure) return { ok: false, message: run.failure };
    return {
      ok: true,
      message:
        `Read the page and proposed ${run.subProcessors} sub-processor` +
        `${run.subProcessors === 1 ? "" : "s"} from it.`,
    };
  } catch (error) {
    if (error instanceof ExtractionUnavailable) return { ok: false, message: error.message };
    throw error;
  }
}

export async function declineLinkAction(
  linkId: string,
  context: { entityId: string | null; revalidate: string },
) {
  const active = await requireCapability(
    "record.write",
    context.entityId ? { entityId: context.entityId } : undefined,
  );
  await declineLink({
    organisationId: active.membership.organisationId,
    linkId,
    actor: actorFrom(active),
  });
  revalidatePath(context.revalidate);
}
