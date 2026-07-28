/**
 * LLM provider presets for Settings (BK-36).
 * OpenAI-compatible base URLs + curated model shortlists — not a full AA catalog.
 */
import { DEFAULT_OLLAMA_BASE_URL } from "../hostConfig.js";

export type LlmProviderPresetId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "groq"
  | "mistral"
  | "deepseek"
  | "together"
  | "ollama"
  | "custom";

/** Hosted agents: OpenAI-compatible providers + Anthropic Messages. Ollama is local-only. */
export type HostedLlmProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "groq"
  | "mistral"
  | "deepseek"
  | "together"
  | "custom";

export const HOSTED_LLM_PROVIDER_IDS: readonly HostedLlmProviderId[] = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "groq",
  "mistral",
  "deepseek",
  "together",
  "custom",
] as const;

/** Select optgroups for the hosted provider dropdown. */
export const HOSTED_LLM_PROVIDER_GROUPS: readonly {
  label: string;
  ids: readonly HostedLlmProviderId[];
}[] = [
  {
    label: "Popular",
    ids: ["openai", "anthropic", "google", "openrouter"],
  },
  {
    label: "More providers",
    ids: ["groq", "mistral", "deepseek", "together"],
  },
  {
    label: "Other",
    ids: ["custom"],
  },
] as const;

export interface LlmProviderPreset {
  id: LlmProviderPresetId;
  label: string;
  /** Empty for custom (owner types URL). */
  baseUrl: string;
  /** Curated picks when /models is huge, missing, or Anthropic-native. */
  suggestedModels: string[];
  note?: string;
}

export const LLM_PROVIDER_PRESETS: readonly LlmProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com",
    suggestedModels: [
      "claude-sonnet-4-20250514",
      "claude-3-5-haiku-latest",
      "claude-opus-4-20250514",
    ],
    note: "Uses your Anthropic API key directly.",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    suggestedModels: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    note: "Uses Google AI Studio / Gemini API keys.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    suggestedModels: [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.0-flash",
      "deepseek/deepseek-chat",
    ],
    note: "One key for Claude, Gemini, and many others. Model ids look like openai/gpt-4o-mini.",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    suggestedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    note: "Very fast open models.",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    suggestedModels: ["mistral-small-latest", "mistral-large-latest", "codestral-latest"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    suggestedModels: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    ],
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    suggestedModels: ["llama3.1", "mistral", "qwen2.5"],
    note: "Local OpenAI-compatible endpoint (default port 11434). Any non-empty API key is fine if Ollama does not require one.",
  },
  {
    id: "custom",
    label: "Other",
    baseUrl: "",
    suggestedModels: [],
    note: "Paste any OpenAI-compatible endpoint URL (Fireworks, LM Studio, Azure, …).",
  },
] as const;

export function getLlmProviderPreset(id: LlmProviderPresetId): LlmProviderPreset {
  return LLM_PROVIDER_PRESETS.find((p) => p.id === id) ?? LLM_PROVIDER_PRESETS[LLM_PROVIDER_PRESETS.length - 1]!;
}

export function isHostedLlmProviderId(id: string): id is HostedLlmProviderId {
  return (HOSTED_LLM_PROVIDER_IDS as readonly string[]).includes(id);
}

/** Resolve provider + base URL + model for hosted signup / Settings. */
export function resolveHostedLlmConnection(input: {
  providerId: HostedLlmProviderId;
  baseUrl?: string;
  model?: string;
}): { provider: HostedLlmProviderId; baseUrl: string; model: string } {
  const preset = getLlmProviderPreset(input.providerId);
  const baseUrl =
    input.providerId === "custom" ? (input.baseUrl?.trim() ?? "") : preset.baseUrl;
  const model =
    input.model?.trim() ||
    preset.suggestedModels[0] ||
    (input.providerId === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini");
  return { provider: input.providerId, baseUrl, model };
}

/** Match a saved base URL to a preset (custom if unknown). */
export function matchLlmProviderPresetId(baseUrl: string): LlmProviderPresetId {
  const normalized = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  if (!normalized) return "custom";
  for (const preset of LLM_PROVIDER_PRESETS) {
    if (preset.id === "custom" || !preset.baseUrl) continue;
    const target = preset.baseUrl.replace(/\/+$/, "").toLowerCase();
    if (normalized === target || normalized.startsWith(`${target}/`)) {
      return preset.id;
    }
  }
  if (normalized.includes("openrouter.ai")) return "openrouter";
  if (normalized.includes("api.openai.com")) return "openai";
  if (normalized.includes("anthropic.com")) return "anthropic";
  if (normalized.includes("generativelanguage.googleapis.com") || normalized.includes("googleapis.com"))
    return "google";
  if (normalized.includes("groq.com")) return "groq";
  if (normalized.includes("mistral.ai")) return "mistral";
  if (normalized.includes("deepseek.com")) return "deepseek";
  if (normalized.includes("together.xyz") || normalized.includes("together.ai")) return "together";
  if (normalized.includes("11434") || normalized.includes("ollama")) return "ollama";
  return "custom";
}

export function matchHostedLlmProviderId(
  baseUrl: string,
  provider?: string | null,
): HostedLlmProviderId {
  const fromProvider = provider?.trim().toLowerCase() ?? "";
  if (fromProvider && isHostedLlmProviderId(fromProvider)) return fromProvider;
  const matched = matchLlmProviderPresetId(baseUrl);
  if (isHostedLlmProviderId(matched)) return matched;
  return "custom";
}

/**
 * Model ids to show when a short static list is preferred.
 * Prefer provider /models when the list is small; otherwise curated shortlist + current.
 * Searchable pickers should pass the full API list and filter client-side instead.
 */
export function modelSelectOptions(input: {
  presetId: LlmProviderPresetId;
  apiModels: string[];
  currentModel: string;
  apiListOk: boolean;
}): string[] {
  const suggested = getLlmProviderPreset(input.presetId).suggestedModels;
  const current = input.currentModel.trim();
  if (input.apiListOk && input.apiModels.length > 0 && input.apiModels.length <= 40) {
    const set = new Set(input.apiModels);
    if (current) set.add(current);
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  const set = new Set<string>([...suggested]);
  if (current) set.add(current);
  // Keep a few API hits that look related to the shortlist (OpenRouter flood).
  if (input.apiListOk) {
    for (const id of input.apiModels) {
      if (suggested.some((s) => id === s || id.endsWith(s) || s.endsWith(id))) {
        set.add(id);
      }
    }
  }
  return [...set];
}

/** Rank models for an empty search: curated first, then alphabetical API hits. */
export function rankModelsForPicker(input: {
  presetId: LlmProviderPresetId;
  apiModels: string[];
  currentModel: string;
  query: string;
}): string[] {
  const q = input.query.trim().toLowerCase();
  const suggested = getLlmProviderPreset(input.presetId).suggestedModels;
  const current = input.currentModel.trim();
  const pool = new Set<string>([...input.apiModels, ...suggested]);
  if (current) pool.add(current);
  let list = [...pool];
  if (q) {
    list = list.filter((id) => id.toLowerCase().includes(q));
  } else {
    const pinned = suggested.filter((id) => pool.has(id));
    const rest = list
      .filter((id) => !pinned.includes(id))
      .sort((a, b) => a.localeCompare(b));
    list = [...pinned, ...rest];
  }
  if (current && list.includes(current)) {
    list = [current, ...list.filter((id) => id !== current)];
  }
  return list;
}
