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
  | { ok: false; reason: string; redactions: Redaction[] };

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
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "The model did not answer in time."
        : "The model could not be reached.";
    return { ok: false, reason, redactions };
  } finally {
    clearTimeout(timer);
  }
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
  if (!response.ok) throw new Error(`status ${response.status}`);

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
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
  if (!response.ok) throw new Error(`status ${response.status}`);

  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  return data.content?.map((c) => c.text ?? "").join("") ?? "";
}
