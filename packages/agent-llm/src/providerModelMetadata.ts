import type { ModelCapabilityProfile, ModelFamily, NativeToolId } from "./modelCapabilities.js";
import { inferModelFamily, inferProviderKind, normalizeModelId } from "./modelCapabilities.js";
import { filterWireableHostedTools } from "./hostedToolWireability.js";

/** Provider feature flags that are not Responses hosted tools. */
const NON_HOSTED_FEATURES = new Set([
  "streaming",
  "streaming_if_verified",
  "function_calling",
  "parallel_tool_calls",
  "developer_message",
  "system_message",
  "image_content",
  "file_content",
  "response_json_object",
  "response_json_schema",
  "reasoning_effort",
  "reasoning_effort_minimal",
  "reasoning_effort_none",
  "reasoning_effort_xhigh",
  "detailed_reasoning_summary",
  "variable_verbosity",
  "advanced_config",
  "input_fidelity",
  "auto_add_web_search",
  "custom_tools",
  "audio",
]);

export interface ParsedProviderModelMetadata {
  rawFeatures: string[];
  supportedMethods: string[];
  providerHostedTools: string[];
  nativeTools: NativeToolId[];
  responsesApi: boolean;
  chatCompletions: boolean;
  source: "provider-metadata" | "heuristic";
}

function collectStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function collectCapabilityFlags(capabilities: unknown): string[] {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return [];
  return Object.entries(capabilities as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => k.trim())
    .filter(Boolean);
}

export function extractProviderFeatureStrings(record: Record<string, unknown>): string[] {
  const set = new Set<string>();
  for (const f of collectStrings(record.features)) set.add(f);
  for (const f of collectCapabilityFlags(record.capabilities)) set.add(f);
  for (const f of collectStrings(record.tools)) set.add(f);
  if (typeof record.modality === "string") set.add(record.modality);
  return [...set];
}

export function extractSupportedMethods(record: Record<string, unknown>): string[] {
  return collectStrings(record.supported_methods);
}

function mapFeatureToNativeTool(feature: string): NativeToolId | undefined {
  switch (feature) {
    case "web_search":
    case "web_search_preview":
    case "auto_add_web_search":
      return "web_search";
    case "file_search":
      return "file_search";
    case "code_interpreter":
      return "code_interpreter";
    case "image_generation":
      return "image_generation";
    case "computer_use":
    case "computer-preview":
    case "dev_environment_tools":
      return "computer_use";
    case "realtime":
      return "realtime";
    default:
      return undefined;
  }
}

/** Decide if a provider feature string maps to a hosted tool type (wireability checked separately). */
export function featureToHostedToolType(feature: string): string | undefined {
  const id = feature.trim();
  if (!id || NON_HOSTED_FEATURES.has(id)) return undefined;
  if (mapFeatureToNativeTool(id)) return id === "auto_add_web_search" ? "web_search" : id;
  if (id === "web_search_preview" || id === "computer-preview" || id === "tool_search" || id === "mcp") {
    return id;
  }
  if (id === "file_search" || id === "code_interpreter" || id === "image_generation") return id;
  // Forward-compat: new provider tool ids pass through for discovery display.
  if (/^[a-z][a-z0-9_]*$/i.test(id) && !id.endsWith("_effort") && !id.startsWith("reasoning_")) {
    return id;
  }
  return undefined;
}

export function parseProviderModelMetadata(
  record: Record<string, unknown> | null,
  opts: { model: string; baseUrl: string; family: ModelFamily },
): ParsedProviderModelMetadata | null {
  if (!record) return null;

  const rawFeatures = extractProviderFeatureStrings(record);
  const supportedMethods = extractSupportedMethods(record);
  if (rawFeatures.length === 0 && supportedMethods.length === 0) return null;

  const hostedSet = new Set<string>();
  for (const feature of rawFeatures) {
    const tool = featureToHostedToolType(feature);
    if (tool) hostedSet.add(tool === "web_search_preview" ? "web_search" : tool);
  }

  const nativeSet = new Set<NativeToolId>();
  for (const feature of rawFeatures) {
    const mapped = mapFeatureToNativeTool(feature);
    if (mapped) nativeSet.add(mapped);
  }
  if (opts.family === "image" && inferProviderKind(opts.baseUrl) === "openai") {
    nativeSet.add("image_generation");
    hostedSet.add("image_generation");
  }
  if (opts.family === "realtime" && inferProviderKind(opts.baseUrl) === "openai") {
    nativeSet.add("realtime");
  }
  if (opts.family === "audio" && inferProviderKind(opts.baseUrl) === "openai") {
    nativeSet.add("audio");
  }

  const responsesApi =
    supportedMethods.includes("responses") ||
    supportedMethods.includes("chat.completions") === false && hostedSet.size > 0;
  const chatCompletions =
    supportedMethods.length === 0 ||
    supportedMethods.includes("chat.completions") ||
    supportedMethods.includes("responses");

  return {
    rawFeatures,
    supportedMethods,
    providerHostedTools: filterWireableHostedTools([...hostedSet]),
    nativeTools: [...nativeSet],
    responsesApi: supportedMethods.includes("responses") || filterWireableHostedTools([...hostedSet]).length > 0,
    chatCompletions,
    source: "provider-metadata",
  };
}

export async function fetchProviderModelRecord(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<Record<string, unknown> | null> {
  const root = baseUrl.trim().replace(/\/+$/, "");
  const id = encodeURIComponent(normalizeModelId(model));
  const res = await fetch(`${root}/models/${id}`, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  return body && typeof body === "object" ? body : null;
}

/**
 * OpenAI platform catalog (undocumented but used by dashboard). May return `features` + `supported_methods`.
 * Falls back silently when unavailable.
 */
export async function fetchOpenAiDashboardModelRecord(
  apiKey: string,
  model: string,
): Promise<Record<string, unknown> | null> {
  const id = encodeURIComponent(normalizeModelId(model));
  const res = await fetch(`https://api.openai.com/dashboard/models/${id}`, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  return body && typeof body === "object" ? body : null;
}

export async function fetchRichProviderModelMetadata(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<Record<string, unknown> | null> {
  const standard = await fetchProviderModelRecord(baseUrl, apiKey, model);
  const standardFeatures = standard ? extractProviderFeatureStrings(standard) : [];
  const standardMethods = standard ? extractSupportedMethods(standard) : [];

  if (standardFeatures.length > 0 || standardMethods.length > 0) {
    return standard;
  }

  if (inferProviderKind(baseUrl) === "openai" && apiKey.trim()) {
    const dashboard = await fetchOpenAiDashboardModelRecord(apiKey, model);
    if (dashboard) return dashboard;
  }

  return standard;
}

export function applyProviderMetadataToProfile(
  profile: ModelCapabilityProfile,
  parsed: ParsedProviderModelMetadata,
): ModelCapabilityProfile {
  return {
    ...profile,
    nativeTools: parsed.nativeTools,
    providerHostedTools: parsed.providerHostedTools,
    providerFeatures: parsed.rawFeatures,
    supportedMethods: parsed.supportedMethods,
    responsesApi: parsed.responsesApi,
    chatCompletions: parsed.chatCompletions,
    source: parsed.source,
    discoveredAt: new Date().toISOString(),
  };
}
