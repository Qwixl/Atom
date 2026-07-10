/**
 * LLM provider presets for Settings (BK-36).
 * OpenAI-compatible base URLs + curated model shortlists — not a full AA catalog.
 */
import { DEFAULT_OLLAMA_BASE_URL } from "../hostConfig.js";

export type LlmProviderPresetId =
  | "openai"
  | "openrouter"
  | "anthropic"
  | "ollama"
  | "custom";

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
    note: "One key for many models. Use provider/model ids (e.g. openai/gpt-4o-mini).",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    suggestedModels: ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"],
    note: "Uses Anthropic Messages API (not OpenAI /chat/completions).",
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
    label: "Custom",
    baseUrl: "",
    suggestedModels: [],
    note: "Any OpenAI-compatible base URL (Groq, Together, LM Studio, …).",
  },
] as const;

export function getLlmProviderPreset(id: LlmProviderPresetId): LlmProviderPreset {
  return LLM_PROVIDER_PRESETS.find((p) => p.id === id) ?? LLM_PROVIDER_PRESETS[4]!;
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
  if (normalized.includes("11434") || normalized.includes("ollama")) return "ollama";
  return "custom";
}

/**
 * Model ids to show in the Settings select.
 * Prefer provider /models when the list is small; otherwise curated shortlist + current.
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
