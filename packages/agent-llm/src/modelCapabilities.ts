/** Native hosted tools — mapped labels for known types; provider may supply more via metadata. */
import { filterWireableHostedTools } from "./hostedToolWireability.js";

export type NativeToolId =
  | "web_search"
  | "image_generation"
  | "file_search"
  | "code_interpreter"
  | "computer_use"
  | "realtime"
  | "audio";

export type ProviderKind = "openai" | "openai-compatible" | "anthropic" | "ollama" | "unknown";

export type ModelFamily =
  | "chat"
  | "image"
  | "audio"
  | "realtime"
  | "embedding"
  | "moderation"
  | "unknown";

export interface ModelCapabilityProfile {
  model: string;
  providerKind: ProviderKind;
  modelFamily: ModelFamily;
  chatCompletions: boolean;
  responsesApi: boolean;
  nativeTools: NativeToolId[];
  /** Raw hosted tool types for Responses API `{ type }` — includes provider-reported tools Atom does not hardcode. */
  providerHostedTools: string[];
  /** Raw feature strings from provider metadata when available. */
  providerFeatures: string[];
  supportedMethods: string[];
  jsonModeOnChatCompletions: boolean;
  source: "heuristic" | "probe" | "provider-metadata";
  discoveredAt: string;
  chatComposeNote?: string;
}

export interface DiscoverModelCapabilitiesInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  probe?: boolean;
}

const OPENAI_HOSTS = ["api.openai.com", "openai.com"];

const SEARCH_PREVIEW_MODEL = /(?:^|\/)gpt-4o-search-preview|gpt-4o-mini-search-preview/i;

export function normalizeModelId(model: string): string {
  return model.trim().replace(/^models\//, "");
}

export function isNanoChatModel(model: string): boolean {
  return /-nano(?:-\d{4}-\d{2}-\d{2})?$/i.test(normalizeModelId(model));
}

export function inferProviderKind(baseUrl: string): ProviderKind {
  const normalized = baseUrl.trim().toLowerCase();
  try {
    const host = new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`).hostname;
    if (OPENAI_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "openai";
    if (host === "api.anthropic.com" || host.endsWith(".anthropic.com")) return "anthropic";
    if (host === "localhost" || host === "127.0.0.1" || host.includes("ollama")) return "ollama";
  } catch {
    /* fall through */
  }
  if (normalized.includes("ollama")) return "ollama";
  if (normalized.includes("anthropic")) return "anthropic";
  return "openai-compatible";
}

export function inferModelFamily(model: string): ModelFamily {
  const id = normalizeModelId(model).toLowerCase();
  if (/^gpt-image|^dall-e/i.test(id)) return "image";
  if (/^gpt-realtime/i.test(id)) return "realtime";
  if (/^gpt-audio|^tts-|^whisper-/i.test(id)) return "audio";
  if (/^text-embedding|^embedding-/i.test(id)) return "embedding";
  if (/^omni-moderation|^text-moderation/i.test(id)) return "moderation";
  return "chat";
}

export function inferNativeTools(
  model: string,
  _providerKind: ProviderKind,
  family: ModelFamily,
): NativeToolId[] {
  const id = normalizeModelId(model);
  if (!id) return [];
  if (family === "image") return ["image_generation"];
  if (family === "realtime") return ["realtime"];
  if (family === "audio") return ["audio"];
  if (SEARCH_PREVIEW_MODEL.test(id)) return ["web_search"];
  return [];
}

export function inferModelCapabilities(
  baseUrl: string,
  model: string,
  source: ModelCapabilityProfile["source"] = "heuristic",
): ModelCapabilityProfile {
  const providerKind = inferProviderKind(baseUrl);
  const modelFamily = inferModelFamily(model);
  const nativeTools = inferNativeTools(model, providerKind, modelFamily);
  const providerHostedTools = filterWireableHostedTools(nativeTools);

  let chatComposeNote: string | undefined;
  if (modelFamily === "image") {
    chatComposeNote = "Image model — generates via Responses API (image_generation).";
  } else if (modelFamily === "realtime") {
    chatComposeNote = "Realtime model — use Realtime API (/v1/realtime), not Atom chat compose.";
  } else if (modelFamily === "audio") {
    chatComposeNote = "Audio model — speech/transcription APIs, not Atom chat compose.";
  } else if (modelFamily === "embedding" || modelFamily === "moderation") {
    chatComposeNote = "Specialized model — not intended for Atom chat compose.";
  }

  return {
    model: normalizeModelId(model),
    providerKind,
    modelFamily,
    chatCompletions: modelFamily === "chat",
    responsesApi: providerHostedTools.length > 0,
    nativeTools,
    providerHostedTools,
    providerFeatures: [],
    supportedMethods: [],
    jsonModeOnChatCompletions: modelFamily === "chat",
    source,
    discoveredAt: new Date().toISOString(),
    chatComposeNote,
  };
}

async function probeHostedTool(
  baseUrl: string,
  apiKey: string,
  model: string,
  toolType: string,
): Promise<boolean> {
  const root = baseUrl.trim().replace(/\/+$/, "");
  const res = await fetch(`${root}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: normalizeModelId(model),
      input: "Reply with exactly: ok",
      tools: [{ type: toolType }],
      max_output_tokens: 16,
    }),
  });
  return res.ok;
}

export function normalizeModelCapabilityProfile(
  profile: Partial<ModelCapabilityProfile> | null | undefined,
  ctx: { baseUrl: string; model: string },
): ModelCapabilityProfile {
  const fallback = inferModelCapabilities(ctx.baseUrl, ctx.model);
  if (!profile || typeof profile !== "object") return fallback;

  const providerHostedTools = filterWireableHostedTools(profile.providerHostedTools ?? []);
  const providerFeatures = profile.providerFeatures ?? [];
  const nativeTools = profile.nativeTools ?? fallback.nativeTools;

  return {
    ...fallback,
    ...profile,
    model: normalizeModelId(profile.model ?? ctx.model),
    nativeTools,
    providerHostedTools,
    providerFeatures,
    supportedMethods: profile.supportedMethods ?? [],
    responsesApi: providerHostedTools.length > 0,
  };
}

/** True when persisted capabilities should be re-discovered (schema drift or heuristic-only). */
export function capabilitiesNeedRefresh(
  profile: ModelCapabilityProfile | undefined,
  ctx: { baseUrl: string; model: string },
): boolean {
  if (!profile) return false;
  if (normalizeModelId(profile.model) !== normalizeModelId(ctx.model)) return true;
  if (!Array.isArray(profile.providerHostedTools) || !Array.isArray(profile.providerFeatures)) {
    return true;
  }
  if (profile.source === "heuristic" && profile.providerKind === "openai") return true;
  const normalized = normalizeModelCapabilityProfile(profile, ctx);
  if (normalized.providerHostedTools.join(",") !== profile.providerHostedTools.join(",")) {
    return true;
  }
  return false;
}

export async function discoverModelCapabilities(
  input: DiscoverModelCapabilitiesInput,
): Promise<ModelCapabilityProfile> {
  const family = inferModelFamily(input.model);
  let profile = inferModelCapabilities(input.baseUrl, input.model, "heuristic");

  if (input.apiKey.trim()) {
    const { fetchRichProviderModelMetadata, parseProviderModelMetadata, applyProviderMetadataToProfile } =
      await import("./providerModelMetadata.js");
    try {
      const record = await fetchRichProviderModelMetadata(input.baseUrl, input.apiKey, input.model);
      const parsed = parseProviderModelMetadata(record, {
        model: input.model,
        baseUrl: input.baseUrl,
        family,
      });
      if (parsed) {
        profile = applyProviderMetadataToProfile(profile, parsed);
      }
    } catch {
      /* keep heuristic */
    }
  }

  if (!input.probe || !input.model.trim() || profile.providerKind !== "openai" || family !== "chat") {
    return normalizeModelCapabilityProfile(profile, input);
  }

  if (profile.providerHostedTools.length > 0 || profile.providerFeatures.length > 0) {
    return normalizeModelCapabilityProfile(profile, input);
  }

  try {
    const webSearchWorks = await probeHostedTool(input.baseUrl, input.apiKey, input.model, "web_search");
    if (webSearchWorks) {
      return normalizeModelCapabilityProfile(
        {
          ...profile,
          nativeTools: profile.nativeTools.includes("web_search")
            ? profile.nativeTools
            : ["web_search", ...profile.nativeTools],
          providerHostedTools: ["web_search"],
          responsesApi: true,
          source: "probe",
          discoveredAt: new Date().toISOString(),
        },
        input,
      );
    }
  } catch {
    /* no probe result */
  }

  return normalizeModelCapabilityProfile(profile, input);
}

export function formatNativeToolsLabel(
  profile: Pick<ModelCapabilityProfile, "nativeTools" | "providerHostedTools" | "providerFeatures">,
): string {
  const wired = profile.providerHostedTools ?? [];
  const native = profile.nativeTools ?? [];
  const features = profile.providerFeatures ?? [];
  if (wired.length > 0) return wired.join(", ");
  if (native.length > 0) return native.join(", ");
  if (features.length > 0) return features.join(", ");
  return "none detected (no provider metadata; probe found nothing)";
}
