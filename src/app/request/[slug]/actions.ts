"use server";

import { headers } from "next/headers";
import { submitComplaintIntake, submitIntake, type IntakeResult } from "@/services/dsr-intake";

const text = (v: FormDataEntryValue | null) => String(v ?? "");

/**
 * The public form's one action. No session is read; the address in the URL
 * is the only authority, and the visitor's own address is used for rate
 * limiting alone, hashed, and forgotten after a day.
 */
export async function submitRequestAction(slug: string, _prev: IntakeResult | null, formData: FormData): Promise<IntakeResult> {
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (formData.get("kind") === "complaint") {
    return submitComplaintIntake({
      slug,
      started: text(formData.get("started")),
      trap: text(formData.get("website")),
      address,
      forSomeoneElse: formData.get("forSomeoneElse") === "yes",
      complainantName: text(formData.get("requesterName")),
      representativeName: text(formData.get("representativeName")),
      contact: text(formData.get("contact")),
      subject: text(formData.get("subject")),
      earlierReference: text(formData.get("earlierReference")),
      description: text(formData.get("description")),
    });
  }
  return submitIntake({
    slug,
    started: text(formData.get("started")),
    trap: text(formData.get("website")),
    address,
    forSomeoneElse: formData.get("forSomeoneElse") === "yes",
    requesterName: text(formData.get("requesterName")),
    representativeName: text(formData.get("representativeName")),
    contact: text(formData.get("contact")),
    relationship: text(formData.get("relationship")),
    rights: formData.getAll("rights").map(String),
    description: text(formData.get("description")),
  });
}
