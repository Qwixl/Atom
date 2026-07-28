/**
 * Server-side model listing for hosted Settings (avoids browser CORS).
 */
import { isAnthropicBaseUrl } from "./llmProbe.js";

/** Curated Anthropic model ids — Anthropic has no OpenAI-compatible GET /models. */
export const ANTHROPIC_CURATED_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-3-5-haiku-latest",
  "claude-opus-4-20250514",
] as const;

const MAX_MODELS = 2000;

export async function listProviderModels(input: {
  apiKey: string;
  baseUrl?: string;
  provider?: string;
  timeoutMs?: number;
}): Promise<{ models: string[]; source: "api" | "curated" }> {
  const apiKey = input.apiKey.trim();
  const baseUrl = (input.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const provider = (input.provider ?? "").trim().toLowerCase();
  if (!apiKey) throw new Error("LLM API key is required");

  if (provider === "anthropic" || isAnthropicBaseUrl(baseUrl)) {
    return { models: [...ANTHROPIC_CURATED_MODELS], source: "curated" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 20_000);
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Could not list models (${resp.status})`);
    }
    const body = (await resp.json()) as { data?: Array<{ id?: string }> };
    const ids = (body.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
    if (unique.length === 0) {
      throw new Error("The provider returned no models");
    }
    return {
      models: unique.slice(0, MAX_MODELS),
      source: "api",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/abort/i.test(message)) {
      throw new Error("Listing models timed out");
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}
