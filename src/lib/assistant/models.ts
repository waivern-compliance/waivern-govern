import type { ProviderKind } from "./providers";

/**
 * Commonly used models, as suggestions rather than a menu.
 *
 * Offered on a free-text field: anything here can be picked, and anything not
 * here can be typed. A closed list would be wrong — organisations run
 * fine-tuned models, private deployments and Azure deployment names that no
 * list could anticipate, and the endpoint is theirs to choose.
 *
 * Two things keep it from going stale badly. Where a provider publishes a
 * stable alias — `-latest`, `deepseek-chat` — the alias is listed rather than
 * a dated snapshot, because the alias is what stays correct. And the list is
 * dated below, so somebody can see how old it is rather than assuming it is
 * current. The provider's own documentation is authoritative; this is a
 * convenience.
 */

/** When these were last reviewed. Shown to the user, not decorative. */
export const SUGGESTIONS_REVIEWED = "September 2026";

export type ModelSuggestion = {
  id: string;
  /** Shown beside the identifier so a reader can tell what they are picking. */
  label: string;
  vendor: string;
};

/**
 * Anthropic's own API. Only these speak the Anthropic wire format natively;
 * a gateway in front of something else may also do so.
 */
const ANTHROPIC: ModelSuggestion[] = [
  { id: "claude-opus-5", label: "Claude Opus 5 — most capable", vendor: "Anthropic" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — balanced", vendor: "Anthropic" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", vendor: "Anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fastest", vendor: "Anthropic" },
];

/**
 * Everything that speaks the OpenAI shape, which is most things.
 *
 * Mistral, Qwen and DeepSeek all publish OpenAI-compatible endpoints, so they
 * belong under this wire format rather than alongside Anthropic — grouping
 * them by vendor while filtering by format is what stops somebody pairing an
 * Anthropic identifier with an OpenAI-shaped request, which is a mistake that
 * reads as an authentication failure.
 */
const OPENAI_COMPATIBLE: ModelSuggestion[] = [
  { id: "gpt-4o", label: "GPT-4o", vendor: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o mini — cheaper", vendor: "OpenAI" },
  { id: "gpt-4.1", label: "GPT-4.1", vendor: "OpenAI" },
  { id: "o3", label: "o3 — reasoning", vendor: "OpenAI" },
  { id: "o4-mini", label: "o4-mini — reasoning, cheaper", vendor: "OpenAI" },

  { id: "mistral-large-latest", label: "Mistral Large — tracks the current release", vendor: "Mistral" },
  { id: "mistral-medium-latest", label: "Mistral Medium", vendor: "Mistral" },
  { id: "mistral-small-latest", label: "Mistral Small", vendor: "Mistral" },
  { id: "open-mistral-nemo", label: "Mistral NeMo — open weights", vendor: "Mistral" },

  { id: "qwen-max", label: "Qwen Max", vendor: "Qwen (Alibaba)" },
  { id: "qwen-plus", label: "Qwen Plus", vendor: "Qwen (Alibaba)" },
  { id: "qwen-turbo", label: "Qwen Turbo — fastest", vendor: "Qwen (Alibaba)" },
  { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen2.5 72B Instruct — open weights, self-hosted", vendor: "Qwen (Alibaba)" },

  { id: "deepseek-chat", label: "DeepSeek Chat", vendor: "DeepSeek" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner", vendor: "DeepSeek" },
];

export function suggestionsFor(kind: ProviderKind): ModelSuggestion[] {
  return kind === "anthropic" ? ANTHROPIC : OPENAI_COMPATIBLE;
}

/**
 * The endpoint each vendor publishes, for the field beside the model.
 *
 * Listed because the endpoint and the model are the two fields people get
 * wrong together, and knowing one narrows the other. An Azure deployment has
 * no canonical URL — it carries the resource name — so it says so instead of
 * offering a template that would be wrong for everybody.
 */
export const VENDOR_ENDPOINTS: Array<{ vendor: string; url: string; kind: ProviderKind }> = [
  { vendor: "Anthropic", url: "https://api.anthropic.com/v1/messages", kind: "anthropic" },
  { vendor: "OpenAI", url: "https://api.openai.com/v1/chat/completions", kind: "openai_compatible" },
  { vendor: "Mistral", url: "https://api.mistral.ai/v1/chat/completions", kind: "openai_compatible" },
  { vendor: "Qwen (Alibaba)", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", kind: "openai_compatible" },
  { vendor: "DeepSeek", url: "https://api.deepseek.com/v1/chat/completions", kind: "openai_compatible" },
];
