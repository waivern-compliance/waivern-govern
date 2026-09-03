"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import {
  RationaleRequired,
  closeBreach,
  recordBreach,
  recordDecision,
  updateBreach,
} from "@/services/breaches";
import type { BreachDecision } from "@/services/breaches";
import type { ControllerRole } from "@/lib/breach/statutory";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const num = (v: FormDataEntryValue | null) => {
  const raw = text(v);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const when = (v: FormDataEntryValue | null) => {
  const raw = text(v);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};
const tri = (v: FormDataEntryValue | null) => {
  const raw = text(v);
  return raw === "" ? null : raw === "yes";
};

export type BreachResult = { ok: boolean; message: string } | null;

export async function recordBreachAction(_prev: BreachResult, formData: FormData) {
  const title = text(formData.get("title"));
  const description = text(formData.get("description"));
  const entityId = text(formData.get("entityId"));
  const discoveredAt = when(formData.get("discoveredAt"));

  if (!title || !description || !entityId) {
    return { ok: false, message: "A breach needs a name, a description and an entity." };
  }
  if (!discoveredAt) {
    // The clock runs from here, so it cannot be guessed at.
    return { ok: false, message: "When did you become aware? That is what starts the seventy-two hours." };
  }

  const active = await requireCapability("record.write", { entityId });
  const [entity] = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.organisationId, active.membership.organisationId)),
    );
  if (!entity) return { ok: false, message: "No such entity." };

  const breach = await recordBreach({
    organisationId: active.membership.organisationId,
    entityId,
    title,
    description,
    controllerRole: (text(formData.get("controllerRole")) || "controller") as ControllerRole,
    discoveredAt,
    occurredAt: when(formData.get("occurredAt")),
    categories: formData.getAll("categories").map(String),
    ownerId: formData.get("ownMe") === "on" ? active.userId : null,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/breaches");
  redirect(`/app/breaches/${breach.id}`);
}

export async function updateBreachAction(breachId: string, formData: FormData) {
  const active = await requireCapability("record.write");
  const owner = formData.get("ownerId");

  await updateBreach({
    breachId,
    organisationId: active.membership.organisationId,
    changes: {
      title: text(formData.get("title")),
      description: text(formData.get("description")),
      controllerRole: text(formData.get("controllerRole")),
      occurredAt: when(formData.get("occurredAt")),
      containedAt: when(formData.get("containedAt")),
      categories: formData.getAll("categories").map(String),
      subjectCategories: lines(formData.get("subjectCategories")),
      dataCategories: lines(formData.get("dataCategories")),
      subjectsAffected: num(formData.get("subjectsAffected")),
      recordsAffected: num(formData.get("recordsAffected")),
      specialCategory: tri(formData.get("specialCategory")),
      likelyConsequences: text(formData.get("likelyConsequences")),
      measuresTaken: text(formData.get("measuresTaken")),
      dataUnintelligible: tri(formData.get("dataUnintelligible")),
      ...(owner !== null ? { ownerId: text(owner) || null } : {}),
    },
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath(`/app/breaches/${breachId}`);
  revalidatePath("/app/breaches");
}

export async function recordDecisionAction(
  breachId: string,
  _prev: BreachResult,
  formData: FormData,
): Promise<BreachResult> {
  const active = await requireCapability("record.write");
  const rationale = text(formData.get("rationale"));
  if (!rationale) {
    return {
      ok: false,
      message: "Record why. A decision without its reasoning cannot be defended later.",
    };
  }

  try {
    await recordDecision({
      organisationId: active.membership.organisationId,
      breachId,
      kind: text(formData.get("kind")) as BreachDecision["kind"],
      outcome: text(formData.get("outcome")) as BreachDecision["outcome"],
      statutoryBasis: text(formData.get("statutoryBasis")) || null,
      rationale,
      recipient: text(formData.get("recipient")) || null,
      externalRef: text(formData.get("externalRef")) || null,
      completedAt: when(formData.get("completedAt")),
      lateReason: text(formData.get("lateReason")) || null,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
  } catch (error) {
    if (error instanceof RationaleRequired) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  revalidatePath(`/app/breaches/${breachId}`);
  revalidatePath("/app/breaches");
  return { ok: true, message: "Recorded." };
}

export async function closeBreachAction(
  breachId: string,
  _prev: BreachResult,
  formData: FormData,
): Promise<BreachResult> {
  const active = await requireCapability("record.write");
  const rationale = text(formData.get("rationale"));
  if (!rationale) {
    return { ok: false, message: "Say what concluded it. Article 33(5) asks for the effects and the remedial action." };
  }

  await closeBreach({
    breachId,
    organisationId: active.membership.organisationId,
    rationale,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(`/app/breaches/${breachId}`);
  revalidatePath("/app/breaches");
  return { ok: true, message: "Closed." };
}
