/**
 * The shape of a conversation in progress.
 *
 * Its own module with no "use server", because a server-action file may export
 * only async functions. A constant exported from one does not survive to the
 * client: it arrives as undefined, and the first property read on it throws
 * while rendering — which is how the assistant panel took down every
 * assessment page for any organisation that had configured a model.
 *
 * The same boundary that sent the Postgres driver into the browser bundle when
 * the upload limits lived in a service, in the opposite direction.
 */
export type ChatState = {
  conversationId: string | null;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  minimisation: string | null;
  error: string | null;
};

/** The initial state, and the one a failed exchange falls back to. */
export const EMPTY_CHAT: ChatState = {
  conversationId: null,
  turns: [],
  minimisation: null,
  error: null,
};
