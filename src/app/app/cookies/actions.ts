"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability, requireSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import type { ConditionKey, StorageBasis } from "@/lib/pecr/statutory";
import { refusable, type EditResult } from "@/lib/edit-result";
import type { RequestResult } from "../requests/actions";
import {
  InventoryRefused,
  addItem,
  createProperty,
  decideProposal,
  ingestAnalyserReport,
  inventoryEntity,
  recordStorageDecision,
  updateItem,
  updateProperty,
  ITEM_KINDS,
} from "@/services/storage-inventory";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function actorOf(active: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: active.userId, actorLabel: active.email };
}

/** A refusal from the service, worded for the person, shown beside the form. */
async function refused(work: () => Promise<void>, ok: string): Promise<RequestResult> {
  try {
    await work();
    return { ok: true, message: ok };
  } catch (error) {
    if (error instanceof InventoryRefused) return { ok: false, message: error.message };
    throw error;
  }
}

/**
 * The signed-in person, allowed to write in the entity the record belongs to.
 * A grant confined to one entity does not reach another's websites.
 */
async function writerFor(of: Parameters<typeof inventoryEntity>[0]) {
  const active = await requireSession();
  const entityId = await inventoryEntity(of, active.membership.organisationId);
  if (!entityId || !can(active.membership.grants, "record.write", entityId)) return null;
  return active;
}

const NOT_YOURS = { ok: false, message: "You cannot change this website's inventory." };

function refresh(propertyId?: string) {
  if (propertyId) revalidatePath(`/app/cookies/${propertyId}`);
  revalidatePath("/app/cookies");
}

export async function createPropertyAction(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const entityId = text(formData.get("entityId"));
  if (!entityId) return { ok: false, message: "Choose the entity the website or app belongs to." };
  const active = await requireCapability("record.write", { entityId });
  let id: string | null = null;
  const result = await refused(async () => {
    const property = await createProperty({
      organisationId: active.membership.organisationId,
      entityId,
      name: text(formData.get("name")),
      url: text(formData.get("url")),
      kind: text(formData.get("kind")) === "app" ? "app" : "website",
      informationUrl: text(formData.get("informationUrl")) || null,
      objectionMechanism: text(formData.get("objectionMechanism")) || null,
      ownerId: formData.get("ownMe") === "on" ? active.userId : null,
      actor: actorOf(active),
    });
    id = property.id;
  }, "Added.");
  if (!id) return result;
  refresh();
  redirect(`/app/cookies/${id}`);
}

export async function updatePropertyAction(propertyId: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerFor({ property: propertyId });
    if (!active) throw new InventoryRefused(NOT_YOURS.message);
    await updateProperty({
      propertyId,
      organisationId: active.membership.organisationId,
      changes: {
        name: text(formData.get("name")),
        url: text(formData.get("url")),
        informationUrl: text(formData.get("informationUrl")) || null,
        objectionMechanism: text(formData.get("objectionMechanism")) || null,
        rescanIntervalMonths: text(formData.get("rescanIntervalMonths")) ? Number(text(formData.get("rescanIntervalMonths"))) : null,
      },
      actor: actorOf(active),
    });
    refresh(propertyId);
  });
}

/**
 * Take an uploaded report. The browser has already removed the screenshots,
 * which would otherwise take most reports past the upload limit; the service
 * checks and strips it again regardless.
 */
export async function uploadReportAction(propertyId: string, _prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const active = await writerFor({ property: propertyId });
  if (!active) return NOT_YOURS;
  const raw = text(formData.get("report"));
  if (!raw) return { ok: false, message: "Choose a report file first." };
  let report: unknown;
  try {
    report = JSON.parse(raw);
  } catch {
    return { ok: false, message: "That file is not valid JSON. Download the report as JSON from the analyser and try again." };
  }
  let message = "";
  const result = await refused(async () => {
    const outcome = await ingestAnalyserReport({
      propertyId,
      organisationId: active.membership.organisationId,
      report,
      source: "upload",
      acceptOtherSite: formData.get("acceptOtherSite") === "on",
      actor: actorOf(active),
    });
    message =
      `Recorded. ${outcome.proposedNew} new item${outcome.proposedNew === 1 ? "" : "s"} and ` +
      `${outcome.proposedNotSeen} no longer seen to review; ${outcome.findings} failing check${outcome.findings === 1 ? "" : "s"} added to Findings.`;
  }, "Recorded.");
  refresh(propertyId);
  return result?.ok ? { ok: true, message } : result;
}

export async function decideProposalAction(
  proposalId: string,
  propertyId: string,
  accept: boolean,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await writerFor({ proposal: proposalId });
  if (!active) return NOT_YOURS;
  const result = await refused(async () => {
    await decideProposal({
      proposalId,
      organisationId: active.membership.organisationId,
      accept,
      note: text(formData.get("note")) || null,
      actor: actorOf(active),
    });
  }, accept ? "Accepted." : "Rejected.");
  refresh(propertyId);
  return result;
}

export async function addItemAction(propertyId: string, _prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const active = await writerFor({ property: propertyId });
  if (!active) return NOT_YOURS;
  const kind = text(formData.get("kind")) as (typeof ITEM_KINDS)[number];
  const party = text(formData.get("party"));
  const result = await refused(async () => {
    await addItem({
      propertyId,
      organisationId: active.membership.organisationId,
      name: text(formData.get("name")),
      kind,
      domain: text(formData.get("domain")) || null,
      party: party === "first" || party === "third" ? party : "unknown",
      expiry: text(formData.get("expiry")) || null,
      purpose: text(formData.get("purpose")) || null,
      actor: actorOf(active),
    });
  }, "Added. Record the basis it relies on next.");
  refresh(propertyId);
  return result;
}

export async function updateItemAction(itemId: string, propertyId: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerFor({ item: itemId });
    if (!active) throw new InventoryRefused(NOT_YOURS.message);
    const party = text(formData.get("party"));
    const status = text(formData.get("status"));
    await updateItem({
      itemId,
      organisationId: active.membership.organisationId,
      changes: {
        purpose: text(formData.get("purpose")) || null,
        supplierId: text(formData.get("supplierId")) || null,
        expiry: text(formData.get("expiry")) || null,
        party: party === "first" || party === "third" ? party : "unknown",
        ...(status === "removed" || status === "active" ? { status } : {}),
      },
      actor: actorOf(active),
    });
    refresh(propertyId);
  });
}

export async function decideBasisAction(itemId: string, propertyId: string, _prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const active = await writerFor({ item: itemId });
  if (!active) return NOT_YOURS;
  const conditions: Partial<Record<ConditionKey, boolean>> = {};
  for (const key of formData.getAll("conditions").map(String)) conditions[key as ConditionKey] = true;
  const result = await refused(async () => {
    await recordStorageDecision({
      itemId,
      organisationId: active.membership.organisationId,
      basis: text(formData.get("basis")) as StorageBasis,
      conditions,
      rationale: text(formData.get("rationale")),
      actor: actorOf(active),
    });
  }, "Recorded.");
  refresh(propertyId);
  return result;
}
