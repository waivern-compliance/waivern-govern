"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import { createActivity, setFurtherProcessing, updateActivity } from "@/services/ropa";
import { COMPATIBILITY_FACTOR_KEYS, RESEARCH_SAFEGUARD_KEYS } from "@/lib/gdpr/further-processing";
import { refusable, type EditResult } from "@/lib/edit-result";

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

/** Ticked catalogue entries (whose words may contain commas) and any others typed. */
const categories = (formData: FormData, name: string) => [
  ...new Set([...formData.getAll(`${name}Pick`).map(String), ...lines(formData.get(name))]),
];

const text = (raw: FormDataEntryValue | null) => String(raw ?? "").trim();

const yesNo = (raw: FormDataEntryValue | null) => {
  const v = String(raw ?? "");
  return v === "yes" ? true : v === "no" ? false : null;
};

export async function recordActivity(formData: FormData) {
  const entityId = text(formData.get("entityId"));
  const name = text(formData.get("name"));
  if (!entityId || !name) return;

  const active = await requireCapability("record.write", { entityId });

  const [entity] = await scoped(active.membership.organisationId, () => db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, entityId),
        eq(entities.organisationId, active.membership.organisationId),
      ),
    ));
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

export async function updateActivityAction(
  activityId: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
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
        lawfulBases: formData.getAll("lawfulBases").map(String),
        recognisedCondition: text(formData.get("recognisedCondition")) || null,
        dataCategories: categories(formData, "dataCategories"),
        subjectCategories: categories(formData, "subjectCategories"),
        recipients: lines(formData.get("recipients")),
        systems: lines(formData.get("systems")),
        transfers: parseTransfers(String(formData.get("transfers") ?? "")),
        retention: text(formData.get("retention")),
        securityMeasures: text(formData.get("securityMeasures")),
        controllerRole: text(formData.get("controllerRole")),
        controllerName: text(formData.get("controllerName")),
        childrenLikely: yesNo(formData.get("childrenLikely")),
        outsidePublicTasks: formData.get("outsidePublicTasks") === "on",
        specialCategory: yesNo(formData.get("specialCategory")),
        art9Condition: text(formData.get("art9Condition")) || null,
        schedule1Condition: text(formData.get("schedule1Condition")) || null,
        criminalOffence: yesNo(formData.get("criminalOffence")),
        art10Condition: text(formData.get("art10Condition")) || null,
        retentionFollowsPolicy: yesNo(formData.get("retentionFollowsPolicy")),
        retentionPolicyNote: text(formData.get("retentionPolicyNote")) || null,
        ...(owner !== null ? { ownerId: text(owner) || null } : {}),
      },
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });

    revalidatePath(`/app/ropa/${activityId}`);
    revalidatePath("/app/ropa");
  });
}

export async function saveFurtherProcessingAction(
  activityId: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("record.write");
    await setFurtherProcessing({
      activityId,
      organisationId: active.membership.organisationId,
      record: {
        furtherProcessing: yesNo(formData.get("furtherProcessing")),
        originalActivityId: text(formData.get("originalActivityId")) || null,
        originalConsent: yesNo(formData.get("originalConsent")),
        compatibilityRoute: text(formData.get("compatibilityRoute")) || null,
        annex2Condition: text(formData.get("annex2Condition")) || null,
        consentUnobtainable: yesNo(formData.get("consentUnobtainable")),
        compatibilityFactors: Object.fromEntries(
          COMPATIBILITY_FACTOR_KEYS.map((k) => [k, text(formData.get(`factor_${k}`))]),
        ),
        compatibilityNote: text(formData.get("compatibilityNote")) || null,
        research: yesNo(formData.get("research")),
        researchSafeguards: Object.fromEntries(
          RESEARCH_SAFEGUARD_KEYS.map((k) => [
            k,
            {
              confirmed: formData.get(`researchSafeguard_${k}`) === "on",
              note: text(formData.get(`researchSafeguardNote_${k}`)),
            },
          ]),
        ),
        approvedMedicalResearch: formData.get("approvedMedicalResearch") === "on" ? true : null,
        art13Exemption: yesNo(formData.get("art13Exemption")),
        publicInformationUrl: text(formData.get("publicInformationUrl")) || null,
      },
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });

    revalidatePath(`/app/ropa/${activityId}`);
    revalidatePath("/app/ropa");
  });
}
