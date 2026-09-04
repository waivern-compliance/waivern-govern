import { redact, type Redaction } from "./redact";

/**
 * A model of the organisation's choosing.
 *
 * One interface, two wire formats. OpenAI-compatible covers Azure OpenAI, an
 * OpenAI account, and anything self-hosted that speaks the same shape — which
 * is what an organisation insisting on its own tenancy will almost always
 * have. Anthropic differs enough in envelope to be worth its own adapter.
 *
 * No provider is called without an organisation having configured one. There
 * is no default endpoint and no fallback: an unconfigured platform has no
 * assistant, rather than quietly having ours.
 */

export type ProviderKind = "openai_compatible" | "anthropic";

export type ProviderConfig = {
  kind: ProviderKind;
  /** Full base URL of the endpoint the organisation controls. */
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Azure requires it on the query string; others ignore it. */
  apiVersion?: string;
};

export type Turn = { role: "user" | "assistant"; content: string };

export type AskResult =
  | { ok: true; text: string; model: string; redactions: Redaction[] }
  | {
      ok: false;
      reason: string;
      /**
       * What actually happened — a status code and whatever the provider said.
       *
       * Never shown to somebody answering an assessment: they can do nothing
       * with it, and it is noise beside their work. Shown on the settings
       * screen, whose whole purpose is to find out why a configuration does
       * not work, and where "could not be reached" is useless.
       */
      detail?: string;
      redactions: Redaction[];
    };

/** Beyond this the assistant has failed to be useful and should stop waiting. */
const TIMEOUT_MS = 25_000;

export async function ask(
  config: ProviderConfig,
  input: { system: string; turns: Turn[]; maxTokens?: number },
): Promise<AskResult> {
  // Minimisation happens here rather than at the call sites, so no surface can
  // forget it. Only user turns are scrubbed; the system prompt is ours, and
  // assistant turns already left the platform once.
  const redactions: Redaction[] = [];
  const turns = input.turns.map((turn) => {
    if (turn.role !== "user") return turn;
    const { text, redactions: found } = redact(turn.content);
    redactions.push(...found);
    return { ...turn, content: text };
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const text =
      config.kind === "anthropic"
        ? await askAnthropic(config, input.system, turns, input.maxTokens ?? 1024, controller.signal)
        : await askOpenAiCompatible(config, input.system, turns, input.maxTokens ?? 1024, controller.signal);
    return { ok: true, text, model: config.model, redactions };
  } catch (error) {
    // Fail soft, and never leak the endpoint or key into a user-facing string.
    const aborted = error instanceof Error && error.name === "AbortError";
    const reason = aborted
      ? "The model did not answer in time."
      : "The model could not be reached.";
    const detail =
      !aborted && error instanceof Error && error.name === "ProviderError"
        ? error.message
        : undefined;
    return { ok: false, reason, detail, redactions };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The provider's own account of what went wrong.
 *
 * Truncated, and the key is never in it — providers report the request that
 * failed, not the credential that failed to authenticate it. Worth reading:
 * "authentication_error" and "model: not found" need entirely different fixes,
 * and a generic message sends somebody looking in the wrong place.
 */
/** A failure attributable to the provider, carried to the settings screen. */
function provider(message: string): Error {
  const error = new Error(message);
  error.name = "ProviderError";
  return error;
}

async function providerError(response: Response): Promise<Error> {
  let said = "";
  try {
    const body = await response.text();
    const parsed = JSON.parse(body) as {
      error?: { message?: string; type?: string };
      message?: string;
    };
    said =
      parsed.error?.message ??
      parsed.message ??
      (parsed.error?.type ? String(parsed.error.type) : body.slice(0, 200));
  } catch {
    said = "";
  }
  return provider(said ? `${response.status}: ${said}` : `status ${response.status}`);
}

async function askOpenAiCompatible(
  config: ProviderConfig,
  system: string,
  turns: Turn[],
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const url = config.apiVersion
    ? `${config.baseUrl}?api-version=${encodeURIComponent(config.apiVersion)}`
    : config.baseUrl;

  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      // Azure uses api-key; OpenAI and most compatible servers use bearer.
      ...(config.apiVersion
        ? { "api-key": config.apiKey }
        : { authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...turns],
    }),
  });
  if (!response.ok) throw await providerError(response);

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (text) return text;

  const finish = data.choices?.[0]?.finish_reason;
  throw provider(
    `the model answered with no text` +
      (finish ? ` (finish reason: ${finish})` : "") +
      `. If the finish reason is length, the budget was too small for a reply.`,
  );
}

async function askAnthropic(
  config: ProviderConfig,
  system: string,
  turns: Turn[],
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      // System is its own field here, not a message. Sending it as a turn is
      // the usual way this adapter gets written wrong.
      system,
      messages: turns,
    }),
  });
  if (!response.ok) throw await providerError(response);

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    stop_reason?: string;
  };

  // Only text blocks. A response may carry others — thinking, tool use — and
  // mapping over everything turned those into empty strings, so a reply that
  // began with one looked like no reply at all.
  const text = (data.content ?? [])
    .filter((c) => c.type === "text" || (c.type === undefined && c.text !== undefined))
    .map((c) => c.text ?? "")
    .join("");
  if (text) return text;

  // Say what did come back. "Nothing" is not a diagnosis, and the previous
  // message guessed at the model name — which cannot be the cause of a 200.
  const kinds = (data.content ?? []).map((c) => c.type ?? "untyped").join(", ") || "no blocks";
  throw provider(
    `the model answered with no text (blocks: ${kinds}` +
      (data.stop_reason ? `; stop reason: ${data.stop_reason}` : "") +
      `). If the stop reason is max_tokens, the budget was too small for a reply.`,
  );
}
