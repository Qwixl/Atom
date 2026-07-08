import type { ModelCapabilityProfile } from "./modelCapabilities.js";

const ANTHROPIC_VERSION = "2023-06-01";
const USER_AGENT = "Atom/1.0 (Qwixl; https://atom.qwixl.com; third-party-agent-host)";

export interface AnthropicChatMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export function anthropicMessagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

export function anthropicRequestHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "User-Agent": USER_AGENT,
  };
}

export function usesAnthropicApi(profile: ModelCapabilityProfile | undefined, baseUrl: string): boolean {
  if (profile?.providerKind === "anthropic") return true;
  try {
    const host = new URL(baseUrl.trim().startsWith("http") ? baseUrl : `https://${baseUrl}`).hostname;
    return host === "api.anthropic.com" || host.endsWith(".anthropic.com");
  } catch {
    return false;
  }
}

interface OpenAiStyleTool {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export function openAiToolsToAnthropic(tools: unknown[]): AnthropicToolDefinition[] {
  const result: AnthropicToolDefinition[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const fn = (tool as OpenAiStyleTool).function;
    if (!fn?.name) continue;
    const params = fn.parameters && typeof fn.parameters === "object" ? fn.parameters : {};
    result.push({
      name: fn.name,
      description: fn.description,
      input_schema: {
        type: "object",
        properties: (params as { properties?: Record<string, unknown> }).properties,
        required: (params as { required?: string[] }).required,
        additionalProperties: (params as { additionalProperties?: boolean }).additionalProperties ?? false,
      },
    });
  }
  return result;
}

interface InternalChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export function splitAnthropicMessages(messages: InternalChatMessage[]): {
  system: string;
  messages: AnthropicChatMessage[];
} {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicChatMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content?.trim()) systemParts.push(message.content);
      continue;
    }
    if (message.role === "tool") {
      const last = anthropicMessages[anthropicMessages.length - 1];
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: message.tool_call_id ?? "unknown",
        content: message.content ?? "",
      };
      if (last?.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        anthropicMessages.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      if (message.content?.trim()) blocks.push({ type: "text", text: message.content });
      for (const call of message.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          input = {};
        }
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input,
        });
      }
      anthropicMessages.push({ role: "assistant", content: blocks });
      continue;
    }
    if (message.role === "assistant" || message.role === "user") {
      anthropicMessages.push({
        role: message.role,
        content: message.content ?? "",
      });
    }
  }

  return { system: systemParts.join("\n\n"), messages: anthropicMessages };
}

export interface AnthropicMessagesResponse {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason?: string;
}

export function parseAnthropicResponse(data: AnthropicMessagesResponse): {
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
} {
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  const textParts: string[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text" && block.text?.trim()) textParts.push(block.text);
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input ?? {}),
      });
    }
  }
  return { text: textParts.join("\n"), toolCalls };
}

export async function callAnthropicMessages(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  messages: AnthropicChatMessage[];
  tools?: AnthropicToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<AnthropicMessagesResponse> {
  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: options.maxTokens ?? 8192,
    temperature: options.temperature ?? 0.4,
    messages: options.messages,
  };
  if (options.system.trim()) body.system = options.system;
  if (options.tools?.length) body.tools = options.tools;

  const response = await fetch(anthropicMessagesUrl(options.baseUrl), {
    method: "POST",
    headers: anthropicRequestHeaders(options.apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 240)}` : ""}`,
    );
  }
  return (await response.json()) as AnthropicMessagesResponse;
}
