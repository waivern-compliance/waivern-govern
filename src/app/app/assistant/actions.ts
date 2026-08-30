"use server";

import { requireCapability } from "@/lib/session";
import { searchHelp } from "@/lib/help/search";
import { HELP_TOPICS } from "@/lib/help/topics";
import { converse, type Surface } from "@/services/assistant";

/**
 * Ground a help answer in the shipped documentation.
 *
 * Retrieval rather than sending the whole corpus: it keeps the request small,
 * and it means an answer can be traced to a topic somebody wrote and reviewed
 * rather than to the model's own recollection of privacy law.
 */
function helpContext(question: string): string {
  const hits = searchHelp(HELP_TOPICS, question).slice(0, 3);
  if (hits.length === 0) {
    return "No documentation matched this question. Say so rather than answering from general knowledge.";
  }
  return [
    "Answer only from the documentation below, and name the topic you used.",
    "If it does not cover the question, say so.",
    "",
    ...hits.map(({ topic }) =>
      [
        `## ${topic.title} (topic id: ${topic.id})`,
        topic.summary,
        ...topic.sections.flatMap((s) => [`### ${s.heading}`, ...s.body, ...(s.points ?? [])]),
      ].join("\n"),
    ),
  ].join("\n");
}

export type ChatState = {
  conversationId: string | null;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  minimisation: string | null;
  error: string | null;
};

export const EMPTY_CHAT: ChatState = {
  conversationId: null,
  turns: [],
  minimisation: null,
  error: null,
};

/**
 * Ask the organisation's model a question.
 *
 * Needs read access on the subject, not write. Somebody who can see a record
 * but cannot edit it is exactly who is most likely to need this explained.
 */
export async function askAction(
  context: {
    surface: Surface;
    subjectType?: string;
    subjectId?: string;
    entityId: string | null;
    /** Facts this surface chose to send. Assembled on the server, never trusted from the form. */
    contextText: string;
  },
  previous: ChatState,
  formData: FormData,
): Promise<ChatState> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return previous;

  const active = await requireCapability(
    "record.read",
    context.entityId ? { entityId: context.entityId } : undefined,
  );

  const asked = [...previous.turns, { role: "user" as const, content: question }];

  // Help retrieves per question; other surfaces send what the page assembled.
  const contextText =
    context.surface === "help" ? helpContext(question) : context.contextText;

  const result = await converse({
    organisationId: active.membership.organisationId,
    entityId: context.entityId,
    surface: context.surface,
    subjectType: context.subjectType as never,
    subjectId: context.subjectId,
    context: contextText,
    question,
    conversationId: previous.conversationId ?? undefined,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  if ("error" in result) {
    // The question stays on screen. Losing what somebody typed because the
    // model was unreachable would be the worst part of the failure.
    return { ...previous, turns: asked, error: result.error, minimisation: null };
  }

  return {
    conversationId: result.conversationId,
    turns: [...asked, { role: "assistant", content: result.reply }],
    minimisation: result.minimisation,
    error: null,
  };
}
