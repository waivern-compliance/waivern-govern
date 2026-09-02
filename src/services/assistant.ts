import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiConversations,
  aiMessages,
  aiSuggestions,
  integrationConnections,
} from "@/db/schema";
import { PRODUCT_NAME } from "@/lib/product";
import { appendAuditEvent } from "@/lib/audit";
import { openSecret, sealSecret } from "@/lib/integration/crypto";
import { ask, type ProviderConfig, type ProviderKind, type Turn } from "@/lib/assistant/providers";
import { summariseRedactions } from "@/lib/assistant/redact";
import type { Actor } from "./templates";

/**
 * The assistant, such as it is permitted to be.
 *
 * It drafts, explains and finds. It does not attest, decide, or close a gap.
 * Every surface here returns text a person then edits and commits under their
 * own name; nothing in this file writes to a governance field.
 */

/** Where an assistant may appear, and what each is for. */
export const SURFACES = {
  assessment: "Help with answering an assessment",
  help: "Questions about how the platform works",
} as const;
export type Surface = keyof typeof SURFACES;

/** Bumped when a prompt changes, so a proposal stays attributable to one. */
export const PROMPT_VERSION = "2026-08-30.1";

/**
 * The house rules, sent on every request.
 *
 * Stated to the model as well as enforced in the product, because a model that
 * volunteers a risk rating puts a number in front of somebody who then has to
 * un-see it. Belt and braces: the surfaces do not offer to write these fields
 * either.
 */
const HOUSE_RULES = `You assist users of ${PRODUCT_NAME}, a privacy and AI governance platform.

You may explain what a question or record means, draft wording a person will
review, and point to where something is recorded.

You must not: rate a risk's likelihood, impact or residual severity; say whether
a DPIA is required; approve, reject or accept anything; state that a country is
adequate; or confirm that a supplier is a processor. Those are decisions a named
person must make and attest to. If asked for one, say plainly that it is theirs
to make, and offer to explain what bears on it instead.

Be concise and specific. British English. Where you are unsure, say so rather
than guessing — an honest gap is more useful here than a confident invention.`;

type ProviderSettings = {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiVersion?: string;
  /** Surfaces the organisation has switched on. Absent means none. */
  surfaces?: Surface[];
};

export type Configured = { config: ProviderConfig; surfaces: Surface[] };

/**
 * The organisation's own model, or nothing.
 *
 * There is deliberately no fallback endpoint. An organisation that has not
 * configured a provider has no assistant, rather than quietly having ours.
 */
export async function providerFor(organisationId: string): Promise<Configured | null> {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organisationId, organisationId),
        eq(integrationConnections.kind, "model_provider"),
        eq(integrationConnections.isActive, true),
      ),
    );
  if (!connection) return null;

  let settings: ProviderSettings;
  let apiKey: string;
  try {
    apiKey = openSecret({
      ciphertext: connection.secretCiphertext,
      iv: connection.secretIv,
      tag: connection.secretTag,
    });
    // The non-secret half rides on webhookUrl, which is the connection row's
    // free-text field. A dedicated column would be tidier and is a migration
    // this does not need yet.
    settings = JSON.parse(connection.webhookUrl ?? "{}") as ProviderSettings;
  } catch {
    return null;
  }
  if (!settings.baseUrl || !settings.model) return null;

  return {
    config: {
      kind: settings.kind === "anthropic" ? "anthropic" : "openai_compatible",
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey,
      apiVersion: settings.apiVersion,
    },
    surfaces: settings.surfaces ?? [],
  };
}

export type Exchange = {
  conversationId: string;
  reply: string;
  /** Said to the user, when anything was stripped before sending. */
  minimisation: string | null;
};

/** How long an exchange is kept before the sweep removes it. */
export const RETAIN_DAYS = 30;

export async function converse(input: {
  organisationId: string;
  entityId: string | null;
  surface: Surface;
  subjectType?: Parameters<typeof appendAuditEvent>[1]["subjectType"];
  subjectId?: string;
  /** Facts the surface chose to give the model. Never the register wholesale. */
  context: string;
  question: string;
  conversationId?: string;
  actor: Actor;
}): Promise<Exchange | { error: string }> {
  const configured = await providerFor(input.organisationId);
  if (!configured) {
    return { error: "No model is configured for this organisation." };
  }
  if (!configured.surfaces.includes(input.surface)) {
    return { error: "The assistant is not switched on for this part of the platform." };
  }

  const conversationId =
    input.conversationId ??
    (
      await db
        .insert(aiConversations)
        .values({
          organisationId: input.organisationId,
          entityId: input.entityId,
          surface: input.surface,
          subjectType: input.subjectType ?? null,
          subjectId: input.subjectId ?? null,
          userId: input.actor.actorUserId ?? null,
          userLabel: input.actor.actorLabel,
          retainUntil: new Date(Date.now() + RETAIN_DAYS * 86_400_000),
        })
        .returning()
    )[0].id;

  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  const turns: Turn[] = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: `${input.context}\n\nQuestion: ${input.question}` },
  ];

  const result = await ask(configured.config, { system: HOUSE_RULES, turns });

  // The user's turn is recorded either way. A question that got no answer is
  // still something the person asked, and the redactions applied to it still
  // happened.
  await db.insert(aiMessages).values({
    conversationId,
    role: "user",
    content: input.question,
    redactions: result.redactions,
  });

  if (!result.ok) {
    await db
      .update(aiConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(aiConversations.id, conversationId));
    return { error: result.reason };
  }

  await db.transaction(async (tx) => {
    await tx.insert(aiMessages).values({
      conversationId,
      role: "assistant",
      content: result.text,
      model: result.model,
      promptVersion: PROMPT_VERSION,
    });
    await tx
      .update(aiConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(aiConversations.id, conversationId));

    if (input.subjectType && input.subjectId) {
      // Audited as an assistant act, distinctly from any later acceptance.
      await appendAuditEvent(tx, {
        organisationId: input.organisationId,
        entityId: input.entityId ?? undefined,
        actorKind: "assistant",
        actorUserId: null,
        actorLabel: `${result.model} (asked by ${input.actor.actorLabel})`,
        action: "assistant.answered",
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        after: { surface: input.surface, promptVersion: PROMPT_VERSION },
      });
    }
  });

  return {
    conversationId,
    reply: result.text,
    minimisation: summariseRedactions(result.redactions),
  };
}

export async function conversationMessages(conversationId: string, organisationId: string) {
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.organisationId, organisationId),
      ),
    );
  if (!conversation) return null;

  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));
  return { conversation, messages };
}

/**
 * Record that a person took a proposal into a record.
 *
 * The acceptance is the audited act, and it names the human. The suggestion
 * row keeps the model and prompt version, so the trail shows both that
 * something was proposed by a model and who took responsibility for it.
 */
export async function acceptSuggestion(input: {
  organisationId: string;
  conversationId: string | null;
  subjectType: Parameters<typeof appendAuditEvent>[1]["subjectType"];
  subjectId: string;
  field: string | null;
  proposed: string;
  model: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(aiSuggestions)
      .values({
        organisationId: input.organisationId,
        conversationId: input.conversationId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        field: input.field,
        proposed: input.proposed,
        model: input.model,
        promptVersion: PROMPT_VERSION,
        status: "accepted",
        decidedBy: input.actor.actorUserId ?? null,
        decidedAt: new Date(),
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "assistant.suggestion_accepted",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      after: { field: input.field, model: input.model, suggestion: row.id },
    });
    return row;
  });
}

/** Conversations past their retention date. Called by the sweep. */
export async function forgetExpiredConversations(organisationId: string): Promise<number> {
  const expired = await db
    .delete(aiConversations)
    .where(
      and(
        eq(aiConversations.organisationId, organisationId),
        lte(aiConversations.retainUntil, new Date()),
      ),
    )
    .returning({ id: aiConversations.id });
  return expired.length;
}

/** Recent exchanges, for showing somebody what was asked on their behalf. */
export async function recentConversations(organisationId: string, limit = 20) {
  return db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.organisationId, organisationId))
    .orderBy(desc(aiConversations.lastMessageAt))
    .limit(limit);
}

/** What the settings screen may show. Never the key. */
export type ProviderSummary = {
  connectionId: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiVersion: string | null;
  surfaces: Surface[];
  isActive: boolean;
  lastSeenAt: Date | null;
};

export async function providerSummary(
  organisationId: string,
): Promise<ProviderSummary | null> {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organisationId, organisationId),
        eq(integrationConnections.kind, "model_provider"),
      ),
    );
  if (!connection) return null;

  let settings: ProviderSettings = {} as ProviderSettings;
  try {
    settings = JSON.parse(connection.webhookUrl ?? "{}") as ProviderSettings;
  } catch {
    // A malformed row should still be visible and replaceable, not invisible.
  }

  return {
    connectionId: connection.id,
    kind: settings.kind === "anthropic" ? "anthropic" : "openai_compatible",
    baseUrl: settings.baseUrl ?? "",
    model: settings.model ?? "",
    apiVersion: settings.apiVersion ?? null,
    surfaces: settings.surfaces ?? [],
    isActive: connection.isActive,
    lastSeenAt: connection.lastSeenAt,
  };
}

/**
 * Store the organisation's model configuration.
 *
 * The key is sealed with the same AES-256-GCM helper the ingest connections
 * use, and is never read back out to a screen. Leaving the key field blank on
 * an update keeps the stored one, so somebody changing which surfaces are
 * enabled does not have to re-enter a credential they may not have to hand.
 */
export async function saveProvider(input: {
  organisationId: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiVersion?: string;
  surfaces: Surface[];
  /** Absent means keep whatever is stored. */
  apiKey?: string;
  isActive: boolean;
  actor: Actor;
}) {
  const settings: ProviderSettings = {
    kind: input.kind,
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    ...(input.apiVersion?.trim() ? { apiVersion: input.apiVersion.trim() } : {}),
    surfaces: input.surfaces,
  };

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.organisationId, input.organisationId),
          eq(integrationConnections.kind, "model_provider"),
        ),
      );

    if (!existing && !input.apiKey) {
      throw new Error("A key is needed the first time a provider is configured");
    }

    const sealed = input.apiKey
      ? sealSecret(input.apiKey)
      : {
          ciphertext: existing!.secretCiphertext,
          iv: existing!.secretIv,
          tag: existing!.secretTag,
        };

    const values = {
      organisationId: input.organisationId,
      kind: "model_provider" as const,
      name: `${input.kind} · ${input.model}`,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretTag: sealed.tag,
      webhookUrl: JSON.stringify(settings),
      isActive: input.isActive,
    };

    const row = existing
      ? (
          await tx
            .update(integrationConnections)
            .set(values)
            .where(eq(integrationConnections.id, existing.id))
            .returning()
        )[0]
      : (await tx.insert(integrationConnections).values(values).returning())[0];

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: existing ? "model_provider.updated" : "model_provider.configured",
      subjectType: "integration_connection",
      subjectId: row.id,
      // The endpoint and model are recorded; the key never is.
      after: {
        kind: input.kind,
        baseUrl: settings.baseUrl,
        model: settings.model,
        surfaces: input.surfaces,
        isActive: input.isActive,
        keyReplaced: Boolean(input.apiKey),
      },
    });

    return row;
  });
}

export async function removeProvider(input: { organisationId: string; actor: Actor }) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.organisationId, input.organisationId),
          eq(integrationConnections.kind, "model_provider"),
        ),
      );
    if (!existing) return;

    await tx.delete(integrationConnections).where(eq(integrationConnections.id, existing.id));
    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "model_provider.removed",
      subjectType: "integration_connection",
      subjectId: existing.id,
    });
  });
}

/**
 * Send one harmless request, so the first real call is not in front of a user.
 *
 * Adapters are written to documented wire formats, which is not the same as
 * having spoken to the endpoint an organisation actually has. This is where a
 * wrong base URL, a missing api-version or a bad key should surface.
 */
export async function testProvider(organisationId: string): Promise<{
  ok: boolean;
  detail: string;
  model?: string;
}> {
  const configured = await providerFor(organisationId);
  if (!configured) return { ok: false, detail: "No model is configured." };

  const result = await ask(configured.config, {
    system: "Reply with the single word: ready",
    turns: [{ role: "user", content: "Are you reachable?" }],
    maxTokens: 16,
  });

  if (!result.ok) return { ok: false, detail: result.reason };
  if (!result.text.trim()) {
    return {
      ok: false,
      detail: "The endpoint answered, but with nothing. Check the model name.",
    };
  }
  return {
    ok: true,
    model: result.model,
    detail: `Answered: “${result.text.trim().slice(0, 80)}”`,
  };
}
