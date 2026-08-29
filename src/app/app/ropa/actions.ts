"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import { createActivity, updateActivity } from "@/services/ropa";

/** "GB", "US: SCCs", "us — scc" — all three are what people actually type. */
function parseTransfers(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [country, ...rest] = line.split(/[:—-]/);
      const mechanism = rest.join(" ").trim();
      return {
        country: country.trim().toUpperCase(),
        ...(mechanism ? { mechanism } : {}),
      };
    });
}

const lines = (raw: FormDataEntryValue | null) =>
  String(raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

const text = (raw: FormDataEntryValue | null) => String(raw ?? "").trim();

export async function recordActivity(formData: FormData) {
  const entityId = text(formData.get("entityId"));
  const name = text(formData.get("name"));
  if (!entityId || !name) return;

  const active = await requireCapability("record.write", { entityId });

  const [entity] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, entityId),
        eq(entities.organisationId, active.membership.organisationId),
      ),
    );
  if (!entity) throw new Error("No such entity");

  const activity = await createActivity({
    organisationId: active.membership.organisationId,
    entityId,
    name,
    description: text(formData.get("description")) || undefined,
    purposes: lines(formData.get("purposes")),
    controllerRole: text(formData.get("controllerRole")) || "controller",
    // Deliberately permissive: a thin record that exists can be completed, and
    // the register reports its own gaps. Refusing to save until every Article
    // 30 field is filled is how processing stays undocumented.
    ownerId: formData.get("ownMe") === "on" ? active.userId : null,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/ropa");
  redirect(`/app/ropa/${activity.id}`);
}

export async function updateActivityAction(activityId: string, formData: FormData) {
  const active = await requireCapability("record.write");
  const owner = formData.get("ownerId");

  await updateActivity({
    activityId,
    organisationId: active.membership.organisationId,
    changes: {
      name: text(formData.get("name")),
      description: text(formData.get("description")),
      purposes: lines(formData.get("purposes")),
      lawfulBasis: text(formData.get("lawfulBasis")),
      dataCategories: lines(formData.get("dataCategories")),
      subjectCategories: lines(formData.get("subjectCategories")),
      recipients: lines(formData.get("recipients")),
      systems: lines(formData.get("systems")),
      transfers: parseTransfers(String(formData.get("transfers") ?? "")),
      retention: text(formData.get("retention")),
      securityMeasures: text(formData.get("securityMeasures")),
      controllerRole: text(formData.get("controllerRole")),
      controllerName: text(formData.get("controllerName")),
      ...(owner !== null ? { ownerId: text(owner) || null } : {}),
    },
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath(`/app/ropa/${activityId}`);
  revalidatePath("/app/ropa");
}
