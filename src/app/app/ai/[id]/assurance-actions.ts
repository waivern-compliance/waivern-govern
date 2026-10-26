"use server";

import { revalidatePath } from "next/cache";
import { ASSURANCE_KIND_LABEL, DOCUMENTATION, type AssuranceKind, type AssuranceResult } from "@/lib/ai/assurance";
import { requireCapability } from "@/lib/session";
import { loadUseCase } from "@/services/ai-register";
import { AssuranceRefused, recordAssurance } from "@/services/ai-assurance";

export type AssuranceActionResult = { ok: boolean; message: string } | null;

const RESULTS: AssuranceResult[] = ["passed", "passed_with_issues", "failed"];

export async function recordAssuranceAction(
  useCaseId: string,
  _prev: AssuranceActionResult,
  formData: FormData,
): Promise<AssuranceActionResult> {
  const session = await requireCapability("record.write");
  const loaded = await loadUseCase(useCaseId, session.membership.organisationId);
  if (!loaded) throw new Error("No such AI use case");
  const active = await requireCapability("record.write", { entityId: loaded.useCase.entityId });

  const kind = String(formData.get("kind") ?? "") as AssuranceKind;
  if (!(kind in ASSURANCE_KIND_LABEL)) return { ok: false, message: "Say what kind of record it is." };
  const result = String(formData.get("result") ?? "");
  const performed = String(formData.get("performedAt") ?? "");
  if (!performed) return { ok: false, message: "Say when it was carried out." };

  // Metrics arrive as parallel lists, one entry per row on the form. A row
  // left with no name is a row nobody filled in, not a nameless metric.
  const names = formData.getAll("metricName").map(String);
  const values = formData.getAll("metricValue").map(String);
  const thresholds = formData.getAll("metricThreshold").map(String);
  const directions = formData.getAll("metricDirection").map(String);
  const units = formData.getAll("metricUnit").map(String);
  const metrics = names
    .map((name, i) => ({
      name: name.trim(),
      value: Number(values[i]),
      threshold: thresholds[i]?.trim() ? Number(thresholds[i]) : null,
      direction: directions[i] === "at_most" ? ("at_most" as const) : ("at_least" as const),
      ...(units[i]?.trim() ? { unit: units[i].trim() } : {}),
    }))
    .filter((m) => m.name !== "");

  try {
    await recordAssurance({
      useCaseId,
      organisationId: active.membership.organisationId,
      kind,
      title: String(formData.get("title") ?? ""),
      performedAt: new Date(`${performed}T00:00:00Z`),
      performedBy: String(formData.get("performedBy") ?? ""),
      independent: formData.get("independent") === "on",
      method: String(formData.get("method") ?? ""),
      metrics,
      result: DOCUMENTATION.includes(kind)
        ? null
        : RESULTS.includes(result as AssuranceResult)
          ? (result as AssuranceResult)
          : null,
      findings: String(formData.get("findings") ?? ""),
      evidenceRef: String(formData.get("evidenceRef") ?? ""),
      changeId: String(formData.get("changeId") ?? "") || undefined,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
  } catch (error) {
    if (error instanceof AssuranceRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/app/ai/${useCaseId}`);
  revalidatePath("/app/ai");
  return { ok: true, message: "Recorded." };
}
