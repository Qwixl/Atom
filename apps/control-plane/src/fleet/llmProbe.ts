/** Tiny provider check after hosted LLM key rotate. */

export type LlmProbeResult =
  | { ok: true; model: string }
  | { ok: false; error: string };

const ANTHROPIC_VERSION = "2023-06-01";

export function isAnthropicBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(
      baseUrl.trim().startsWith("http") ? baseUrl : `https://${baseUrl}`,
    ).hostname.toLowerCase();
    return host === "api.anthropic.com" || host.endsWith(".anthropic.com");
  } catch {
    return /anthropic\.com/i.test(baseUrl);
  }
}

function anthropicMessagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

/**
 * Proves key + base URL + model before the owner returns to Chat.
 * OpenAI-compatible: POST /chat/completions. Anthropic: POST /v1/messages.
 */
export async function probeLlmConnection(input: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}): Promise<LlmProbeResult> {
  const apiKey = input.apiKey.trim();
  const baseUrl = (input.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = input.model?.trim() || "gpt-4o-mini";
  if (!apiKey) return { ok: false, error: "LLM API key is required" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 20_000);
  try {
    const resp = isAnthropicBaseUrl(baseUrl)
      ? await fetch(anthropicMessagesUrl(baseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: controller.signal,
        })
      : await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      const snippet = body.replace(/\s+/g, " ").slice(0, 160);
      return {
        ok: false,
        error: `Provider returned ${resp.status}${snippet ? `: ${snippet}` : ""}`,
      };
    }
    return { ok: true, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/abort/i.test(message)) {
      return { ok: false, error: "Provider timed out — check base URL and network from the fleet host" };
    }
    return { ok: false, error: message.slice(0, 200) };
  } finally {
    clearTimeout(timeout);
  }
}
