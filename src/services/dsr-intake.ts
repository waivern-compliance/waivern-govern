import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { dsrIntakeAttempts, dsrIntakeLinks, entities, organisations } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { acknowledgementDeadline, s164aApplies } from "@/lib/complaints/statutory";
import { requestClock } from "@/lib/dsr/statutory";
import { ComplaintRefused, recordComplaint } from "./complaints";
import { RequestRefused, recordRequest } from "./data-subject-requests";
import type { Actor } from "./templates";
import { assertEntityIn } from "./tenancy-guards";
import { raiseTask } from "./workflow";

/**
 * The public web form for making a data subject request, or a complaint.
 *
 * The only page in the request register that somebody without an account can
 * use, so it does as little as it can: it takes a request, gives back a
 * reference and the date a response is due, and tells the privacy team. It
 * never shows anything back — not whether a request exists, not its status —
 * because the person on the other end has not proved who they are.
 *
 * It takes no identity documents. If the organisation reasonably doubts who
 * is asking, it asks afterwards, through the register, as for any other route.
 */

export type IntakeLink = typeof dsrIntakeLinks.$inferSelect;

/** Submissions from one address to one form in an hour, and to one form from anywhere. */
export const PER_ADDRESS_PER_HOUR = 5;
export const PER_FORM_PER_HOUR = 50;
/** Quicker than this from opening the form, and it was not a person typing. */
export const MIN_FILL_SECONDS = 3;
const MAX_OPEN_HOURS = 24;

export const FIELD_LIMITS = { name: 200, contact: 300, relationship: 200, description: 5000 } as const;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value) return value;
  // Without a secret the address hashes could be reversed by trying every
  // IPv4 address, so production refuses to run the form at all.
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required for the request form");
  return "govern-development-only";
}

/** An address, made unreadable. Kept a day, for rate limiting only. */
export function hashAddress(address: string): string {
  return createHmac("sha256", secret()).update(`dsr-intake:${address}`).digest("hex");
}

/**
 * A signed note of when the form was opened.
 *
 * Lets a submission be judged too quick to be a person, or open too long to
 * trust, without storing anything about the visitor between the two requests.
 */
export function startedToken(slug: string, at = new Date()): string {
  const issued = String(at.getTime());
  const mac = createHmac("sha256", secret()).update(`${slug}.${issued}`).digest("base64url");
  return `${issued}.${mac}`;
}

function startedAt(slug: string, token: string): Date | null {
  const [issued, mac] = token.split(".");
  if (!issued || !mac) return null;
  const expected = createHmac("sha256", secret()).update(`${slug}.${issued}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const at = new Date(Number(issued));
  return Number.isNaN(at.getTime()) ? null : at;
}

export async function issueIntakeLink(input: {
  organisationId: string;
  entityId: string;
  label: string;
  actor: Actor;
}) {
  const label = input.label.trim();
  if (!label) throw new RequestRefused("Say where the form will be published, so the team knows where requests came from.");
  return withOrganisation(input.organisationId, async () => {
    await assertEntityIn(input.organisationId, input.entityId);
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dsrIntakeLinks)
        .values({
          organisationId: input.organisationId,
          entityId: input.entityId,
          slug: randomBytes(16).toString("base64url"),
          label,
          createdBy: input.actor.actorUserId ?? null,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: input.entityId,
        action: "dsr.intake_link_issued",
        subjectType: "organisation",
        subjectId: input.organisationId,
        after: { link: row.id, label },
      });
      return row;
    });
  });
}

/** Stop a form taking requests. Requests already made through it are untouched. */
export async function revokeIntakeLink(input: { linkId: string; organisationId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(dsrIntakeLinks)
        .set({ revokedAt: new Date(), revokedBy: input.actor.actorUserId ?? null })
        .where(
          and(
            eq(dsrIntakeLinks.id, input.linkId),
            eq(dsrIntakeLinks.organisationId, input.organisationId),
            isNull(dsrIntakeLinks.revokedAt),
          ),
        )
        .returning();
      if (!row) throw new RequestRefused("That form is already withdrawn, or is not yours.");
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: row.entityId,
        action: "dsr.intake_link_revoked",
        subjectType: "organisation",
        subjectId: input.organisationId,
        after: { link: row.id, label: row.label, submissions: row.submissions },
      });
      return row;
    });
  });
}

export async function intakeLinksFor(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    return db
      .select({ link: dsrIntakeLinks, entityName: entities.name })
      .from(dsrIntakeLinks)
      .innerJoin(entities, eq(entities.id, dsrIntakeLinks.entityId))
      .where(
        entityIds === null
          ? eq(dsrIntakeLinks.organisationId, organisationId)
          : and(eq(dsrIntakeLinks.organisationId, organisationId), inArray(dsrIntakeLinks.entityId, entityIds)),
      )
      .orderBy(desc(dsrIntakeLinks.createdAt));
  });
}

/**
 * The form behind a published address, if it is still open.
 *
 * Read before any organisation is known — the address is the only authority,
 * as a contributor link's token is. Returns only what the page shows.
 */
export async function openIntakeLink(slug: string) {
  const [row] = await db
    .select({ link: dsrIntakeLinks, entityName: entities.name, organisationName: organisations.name })
    .from(dsrIntakeLinks)
    .innerJoin(entities, eq(entities.id, dsrIntakeLinks.entityId))
    .innerJoin(organisations, eq(organisations.id, dsrIntakeLinks.organisationId))
    .where(and(eq(dsrIntakeLinks.slug, slug), isNull(dsrIntakeLinks.revokedAt)));
  if (!row) return null;
  return {
    linkId: row.link.id,
    organisationId: row.link.organisationId,
    entityId: row.link.entityId,
    label: row.link.label,
    takesComplaints: row.link.takesComplaints,
    // Who the person is writing to: the entity, which is the controller.
    controllerName: row.entityName === row.organisationName ? row.organisationName : `${row.entityName} (${row.organisationName})`,
  };
}

export type IntakeResult =
  | { ok: true; reference: string; receivedAt: Date; dueWords: string }
  | { ok: false; message: string };

const clip = (value: string, max: number) => value.trim().slice(0, max);

/**
 * Take a request from the public form.
 *
 * Refusals are worded for the person, and say how else to ask: a request
 * that a form turns away is still a request if it reaches the organisation
 * some other way, and the form must not leave anybody thinking otherwise.
 */
type OpenForm = NonNullable<Awaited<ReturnType<typeof openIntakeLink>>>;

/**
 * The checks every submission passes before anything is recorded: the form is
 * open, the hidden field is empty, and it was neither sent too quickly to be a
 * person nor left open too long to trust.
 */
async function admit(slug: string, started: string, trap: string | undefined, now: Date): Promise<{ form: OpenForm } | { refused: string }> {
  const form = await openIntakeLink(slug);
  if (!form) return { refused: "This form is no longer taking requests. Contact the organisation another way — by email or post — and your request still counts." };
  if (trap) return { refused: "This could not be sent. Please contact the organisation directly by email or post." };
  const at = startedAt(slug, started);
  if (!at || now.getTime() - at.getTime() > MAX_OPEN_HOURS * 3_600_000) {
    return { refused: "This form has been open too long. Reload the page and send it again." };
  }
  if (now.getTime() - at.getTime() < MIN_FILL_SECONDS * 1000) {
    return { refused: "That was sent very quickly. Check your answers and send it again." };
  }
  return { form };
}

/**
 * Count this attempt against the form's limits, or refuse it. Requests and
 * complaints share the limits: they are one form, and one address.
 * Called inside the form's organisation.
 */
async function withinLimits(form: OpenForm, address: string, now: Date): Promise<boolean> {
  const ipHash = hashAddress(address);
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [[fromHere], [fromAnywhere]] = await Promise.all([
    db
      .select({ n: count() })
      .from(dsrIntakeAttempts)
      .where(and(eq(dsrIntakeAttempts.linkId, form.linkId), eq(dsrIntakeAttempts.ipHash, ipHash), gte(dsrIntakeAttempts.createdAt, hourAgo))),
    db
      .select({ n: count() })
      .from(dsrIntakeAttempts)
      .where(and(eq(dsrIntakeAttempts.linkId, form.linkId), gte(dsrIntakeAttempts.createdAt, hourAgo))),
  ]);
  if (Number(fromHere.n) >= PER_ADDRESS_PER_HOUR || Number(fromAnywhere.n) >= PER_FORM_PER_HOUR) return false;
  await db.insert(dsrIntakeAttempts).values({ organisationId: form.organisationId, linkId: form.linkId, ipHash });
  return true;
}

const TOO_MANY =
  "Too many have been sent from here in the last hour. Try again later, or contact the organisation by email or post — it counts either way.";

export async function submitIntake(input: {
  slug: string;
  started: string;
  /** Filled only by software that fills in every field it finds. */
  trap?: string;
  address: string;
  forSomeoneElse: boolean;
  requesterName: string;
  representativeName?: string;
  contact: string;
  relationship?: string;
  rights: string[];
  description: string;
  now?: Date;
}): Promise<IntakeResult> {
  const now = input.now ?? new Date();
  const admitted = await admit(input.slug, input.started, input.trap, now);
  if ("refused" in admitted) return { ok: false, message: admitted.refused };
  const { form } = admitted;

  const requesterName = clip(input.requesterName, FIELD_LIMITS.name);
  const representative = input.forSomeoneElse ? clip(input.representativeName ?? "", FIELD_LIMITS.name) : "";
  const contact = clip(input.contact, FIELD_LIMITS.contact);
  const description = clip(input.description, FIELD_LIMITS.description);
  const relationship = clip(input.relationship ?? "", FIELD_LIMITS.relationship);
  // Checked here, in words for the public, before the register's own checks.
  if (!requesterName) return { ok: false, message: "Give the name of the person the request is about." };
  if (!contact) return { ok: false, message: "Give an email or postal address, so the response can reach you." };
  if (input.rights.length === 0) {
    return { ok: false, message: "Choose at least one thing you are asking for. If you are not sure, choose the closest and explain below." };
  }
  if (!description) return { ok: false, message: "Say what you are asking for, in your own words." };
  if (input.forSomeoneElse && !representative) return { ok: false, message: "Give your own name as well as theirs." };

  return withOrganisation(form.organisationId, async () => {
    if (!(await withinLimits(form, input.address, now))) return { ok: false as const, message: TOO_MANY };

    let request;
    try {
      request = await recordRequest({
        organisationId: form.organisationId,
        entityId: form.entityId,
        rights: input.rights,
        channel: "web_form",
        receivedAt: now,
        description,
        requesterName,
        requesterContact: contact,
        representative: representative || null,
        subjectCategories: relationship ? [relationship] : [],
        intakeLinkId: form.linkId,
        actor: { actorKind: "public_form", actorUserId: null, actorLabel: `web form: ${form.label}` },
      });
    } catch (error) {
      if (error instanceof RequestRefused) return { ok: false as const, message: error.message };
      throw error;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(dsrIntakeLinks)
        .set({ submissions: sql`${dsrIntakeLinks.submissions} + 1`, lastSubmittedAt: now })
        .where(eq(dsrIntakeLinks.id, form.linkId));
      // Nobody is watching a web form. The month is running from now.
      await raiseTask(tx, {
        organisationId: form.organisationId,
        entityId: form.entityId,
        type: "dsr_intake",
        title: `${request.reference} arrived through ${form.label}`,
        description: "A request from the public web form. Check it is a request, decide whether identity is in reasonable doubt, and pick it up.",
        subjectType: "data_subject_request",
        subjectId: request.id,
        assigneeRole: "privacy_admin",
        idempotencyKey: `dsr-intake:${request.id}`,
        actor: { actorKind: "system", actorUserId: null, actorLabel: "request form" },
      });
    });

    const clock = requestClock({ jurisdiction: request.jurisdiction, receivedAt: request.receivedAt, now });
    return { ok: true as const, reference: request.reference, receivedAt: request.receivedAt, dueWords: clock.words };
  });
}

/** What a complaint is about, in the words somebody would use. Keys are the register's subjects. */
export const COMPLAINT_ASKS: Array<[string, string]> = [
  ["request_handling", "How a request I made about my data was handled"],
  ["accuracy", "Information about me is wrong"],
  ["security", "My data was lost, stolen or not kept safe"],
  ["disclosure", "My data was shared with someone it should not have been"],
  ["retention", "My data has been kept too long"],
  ["marketing", "Marketing I did not want"],
  ["lawfulness", "My data is being used without a good reason"],
  ["transparency", "I was not told how my data would be used"],
  ["automated_decision", "A decision made about me automatically"],
  ["other", "Something else"],
];

/**
 * Take a complaint from the public form (DPA 2018 s.164A).
 *
 * The same defences and limits as a request, and the same rule about what is
 * shown back: a reference and when to expect an acknowledgement, nothing else.
 */
export async function submitComplaintIntake(input: {
  slug: string;
  started: string;
  trap?: string;
  address: string;
  forSomeoneElse: boolean;
  complainantName: string;
  representativeName?: string;
  contact: string;
  subject: string;
  /** A reference they were given for an earlier request, if any. Kept with what they wrote. */
  earlierReference?: string;
  description: string;
  now?: Date;
}): Promise<IntakeResult> {
  const now = input.now ?? new Date();
  const admitted = await admit(input.slug, input.started, input.trap, now);
  if ("refused" in admitted) return { ok: false, message: admitted.refused };
  const { form } = admitted;
  if (!form.takesComplaints) {
    return { ok: false, message: "This form does not take complaints. Contact the organisation by email or post — your complaint counts just the same." };
  }

  const complainantName = clip(input.complainantName, FIELD_LIMITS.name);
  const representative = input.forSomeoneElse ? clip(input.representativeName ?? "", FIELD_LIMITS.name) : "";
  const contact = clip(input.contact, FIELD_LIMITS.contact);
  const earlier = clip(input.earlierReference ?? "", 60);
  const said = clip(input.description, FIELD_LIMITS.description);
  if (!complainantName) return { ok: false, message: "Give the name of the person the complaint is about." };
  if (!contact) return { ok: false, message: "Give an email or postal address, so the reply can reach you." };
  if (!said) return { ok: false, message: "Say what your complaint is, in your own words." };
  if (input.forSomeoneElse && !representative) return { ok: false, message: "Give your own name as well as theirs." };
  const subject = COMPLAINT_ASKS.some(([k]) => k === input.subject) ? input.subject : "other";
  const description = earlier ? `${said}\n\nEarlier reference given: ${earlier}` : said;

  return withOrganisation(form.organisationId, async () => {
    if (!(await withinLimits(form, input.address, now))) return { ok: false as const, message: TOO_MANY };

    let complaint;
    try {
      complaint = await recordComplaint({
        organisationId: form.organisationId,
        entityId: form.entityId,
        channel: "web_form",
        receivedAt: now,
        subject,
        description,
        complainantName,
        complainantContact: contact,
        representative: representative || null,
        intakeLinkId: form.linkId,
        actor: { actorKind: "public_form", actorUserId: null, actorLabel: `web form: ${form.label}` },
      });
    } catch (error) {
      if (error instanceof ComplaintRefused) return { ok: false as const, message: error.message };
      throw error;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(dsrIntakeLinks)
        .set({ submissions: sql`${dsrIntakeLinks.submissions} + 1`, lastSubmittedAt: now })
        .where(eq(dsrIntakeLinks.id, form.linkId));
      // Nobody is watching a web form. The 30 days are running from now.
      await raiseTask(tx, {
        organisationId: form.organisationId,
        entityId: form.entityId,
        type: "complaint_intake",
        title: `${complaint.reference} arrived through ${form.label}`,
        description: "A complaint from the public web form. Check it is about personal data, acknowledge it, and pick it up.",
        subjectType: "data_protection_complaint",
        subjectId: complaint.id,
        assigneeRole: "privacy_admin",
        idempotencyKey: `complaint-intake:${complaint.id}`,
        actor: { actorKind: "system", actorUserId: null, actorLabel: "request form" },
      });
    });

    const longDate = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    const dueWords = s164aApplies(complaint)
      ? `They must acknowledge it by ${longDate(acknowledgementDeadline(complaint.receivedAt))}, look into it, and tell you the outcome without undue delay.`
      : "They will acknowledge it, look into it, and tell you the outcome.";
    return { ok: true as const, reference: complaint.reference, receivedAt: complaint.receivedAt, dueWords };
  });
}

/** Stop or start a form taking complaints. Requests are unaffected. */
export async function setIntakeLinkComplaints(input: {
  linkId: string;
  organisationId: string;
  takesComplaints: boolean;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(dsrIntakeLinks)
        .set({ takesComplaints: input.takesComplaints })
        .where(and(eq(dsrIntakeLinks.id, input.linkId), eq(dsrIntakeLinks.organisationId, input.organisationId)))
        .returning();
      if (!row) throw new RequestRefused("That form is not yours.");
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: row.entityId,
        action: "dsr.intake_link_complaints_set",
        subjectType: "organisation",
        subjectId: input.organisationId,
        after: { link: row.id, label: row.label, takesComplaints: input.takesComplaints },
      });
      return row;
    });
  });
}

/** Forget attempts older than a day. They exist only to rate-limit. */
export async function pruneIntakeAttempts(organisationId: string): Promise<number> {
  return withOrganisation(organisationId, async () => {
    const removed = await db
      .delete(dsrIntakeAttempts)
      .where(
        and(
          eq(dsrIntakeAttempts.organisationId, organisationId),
          lt(dsrIntakeAttempts.createdAt, new Date(Date.now() - MAX_OPEN_HOURS * 3_600_000)),
        ),
      )
      .returning({ id: dsrIntakeAttempts.id });
    return removed.length;
  });
}
