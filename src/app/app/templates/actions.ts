"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { templateDefinition } from "@/lib/templates/schema";
import { validateTemplate } from "@/lib/templates/validate";
import { requireCapability } from "@/lib/session";
import {
  createDraftFrom,
  createTemplate,
  publishVersion,
  updateDraft,
  type TemplateKind,
} from "@/services/templates";

/** A new template starts with one section and one question, not an empty file. */
const STARTER = {
  schema: {
    sections: [
      {
        key: "scope",
        title: "Scope",
        questions: [
          {
            key: "what_is_it",
            label: "What is being assessed?",
            type: "long_text",
            required: true,
            legalRefs: [],
            evidence: "none",
          },
        ],
      },
    ],
  },
  scoring: { method: "none" },
} as const;

export async function createTemplateAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as TemplateKind;
  if (!name || !kind) return;

  const active = await requireCapability("template.author");
  const created = await createTemplate({
    organisationId: active.membership.organisationId,
    kind,
    name,
    description: String(formData.get("description") ?? "").trim() || undefined,
    jurisdiction: String(formData.get("jurisdiction") ?? "").trim() || undefined,
    definition: templateDefinition.parse(STARTER),
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/templates");
  redirect(`/app/templates/${created.template.id}`);
}

export type DraftResult = { ok: true } | { ok: false; problems: string[] };

/**
 * Save a draft, reporting what is wrong rather than throwing it away.
 *
 * Three things can be wrong and they need different words: the JSON does not
 * parse, it parses but is not a template, or it is a valid template that says
 * something incoherent — a question referring to one that does not exist. The
 * last is the one worth catching before publication, and it is the one a
 * schema check alone would pass.
 */
export async function saveDraftAction(
  templateId: string,
  versionId: string,
  _previous: DraftResult | null,
  formData: FormData,
): Promise<DraftResult> {
  const active = await requireCapability("template.author");
  const raw = String(formData.get("definition") ?? "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      problems: [`That is not valid JSON — ${error instanceof Error ? error.message : "unparseable"}`],
    };
  }

  const shape = templateDefinition.safeParse(parsed);
  if (!shape.success) {
    return {
      ok: false,
      problems: shape.error.issues.map((i) => `${i.path.join(".") || "definition"}: ${i.message}`),
    };
  }

  const problems = validateTemplate(shape.data);
  if (problems.length > 0) {
    // Saved anyway: a draft is working material, and refusing to store
    // half-finished logic means losing it. Publication is where this blocks.
    await updateDraft({
      organisationId: active.membership.organisationId,
      versionId,
      definition: shape.data,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath(`/app/templates/${templateId}`);
    return { ok: false, problems: problems.map((p) => `${p.path}: ${p.message}`) };
  }

  await updateDraft({
    organisationId: active.membership.organisationId,
    versionId,
    definition: shape.data,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(`/app/templates/${templateId}`);
  return { ok: true };
}

export async function startDraftAction(templateId: string) {
  const active = await requireCapability("template.author");
  await createDraftFrom({
    organisationId: active.membership.organisationId,
    templateId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(`/app/templates/${templateId}`);
}

export async function publishAction(templateId: string, versionId: string) {
  const active = await requireCapability("template.publish");
  await publishVersion({
    organisationId: active.membership.organisationId,
    versionId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(`/app/templates/${templateId}`);
  revalidatePath("/app/templates");
}
