import { type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import { buildSystemPrompt, type PromptProfile } from "@qwixl/agent-llm";
import {
  Catalog,
  parseAgentProtocolMessage,
  registerCorePrimitives,
  registerEcosystemModules,
  type AgentOutput,
} from "@qwixl/shell-core";
import { v4 as uuid } from "uuid";
import { agentOutputToAgUiEvents, textAgUiEvents } from "./outputEvents.js";
import { profileFromRunAgentInput } from "./profileFromInput.js";

export interface LlmAgUiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  profile?: PromptProfile;
  /** Server-side business catalog summary when ATOM_BUSINESS_MODE (M12). */
  businessContext?: string;
  /** Optional prefix prepended to the system prompt (M-TS-06 hosted safety framing). */
  safetyPrefix?: string;
  /** When non-empty, model must be in this list (M-TS-06). */
  modelAllowlist?: readonly string[];
  /** Optional LLM spend meter (D066 budget ledger). */
  onUsage?: (usage: { promptTokens?: number; completionTokens?: number; model: string }) => void;
}

const REQUEST_TIMEOUT_MS = 120_000;

function lastUserContent(input: RunAgentInput): string {
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const message = input.messages[i];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

function inputToChatMessages(
  input: RunAgentInput,
): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of input.messages) {
    if (typeof message.content !== "string") continue;
    if (message.role === "user" || message.role === "assistant") {
      out.push({ role: message.role, content: message.content });
    }
  }
  return out;
}

function extractJson(text: string): unknown | null {
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  const start = stripped.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stripped.length; i++) {
    const char = stripped[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function protocolMessageToOutput(message: unknown): AgentOutput | null {
  const parsed = parseAgentProtocolMessage(message);
  if (!parsed) return null;
  if (parsed.kind === "reject") return { type: "text", text: parsed.text };
  return parsed.output;
}

async function callChatCompletions(
  config: LlmAgUiConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{ content: string; promptTokens?: number; completionTokens?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature ?? 0.4,
        messages,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      );
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("endpoint returned no message content");
    return {
      content,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function loadLlmAgUiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmAgUiConfig | null {
  const apiKey = env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const modelAllowlist = env.ATOM_MODEL_ALLOWLIST?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    apiKey,
    baseUrl: env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1",
    model: env.LLM_MODEL?.trim() || "gpt-4o-mini",
    temperature: env.LLM_TEMPERATURE ? Number(env.LLM_TEMPERATURE) : undefined,
    safetyPrefix: env.ATOM_SAFETY_PREFIX?.trim() || undefined,
    modelAllowlist: modelAllowlist?.length ? modelAllowlist : undefined,
  };
}

/** Run one AG-UI turn against an OpenAI-compatible LLM; yields AG-UI SSE events. */
export async function* runLlmAgUiEvents(
  input: RunAgentInput,
  config: LlmAgUiConfig,
): AsyncGenerator<BaseEvent> {
  if (config.modelAllowlist && config.modelAllowlist.length > 0) {
    if (!config.modelAllowlist.includes(config.model)) {
      yield* textAgUiEvents(
        uuid(),
        `Model "${config.model}" is not on this agent's allowlist. Set LLM_MODEL to an allowed model or clear ATOM_MODEL_ALLOWLIST.`,
      );
      return;
    }
  }
  const catalog = new Catalog();
  registerCorePrimitives(catalog);
  registerEcosystemModules(catalog);
  const history = inputToChatMessages(input);
  if (history.length === 0 && lastUserContent(input)) {
    history.push({ role: "user", content: lastUserContent(input) });
  }
  const profile = profileFromRunAgentInput(input, config.profile);
  const mergedProfile: PromptProfile | undefined = profile
    ? {
        ...profile,
        businessContext: [profile.businessContext, config.businessContext]
          .filter((s) => s?.trim())
          .join("\n\n") || undefined,
      }
    : config.businessContext?.trim()
      ? { open: [], guardedCategories: [], businessContext: config.businessContext.trim() }
      : undefined;
  const baseSystem = buildSystemPrompt(catalog, mergedProfile);
  const systemContent = config.safetyPrefix?.trim()
    ? `${config.safetyPrefix.trim()}\n\n${baseSystem}`
    : baseSystem;
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: systemContent,
    },
    ...history,
  ];

  let raw: string;
  try {
    const result = await callChatCompletions(config, messages);
    raw = result.content;
    config.onUsage?.({
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      model: config.model,
    });
  } catch (error) {
    yield* textAgUiEvents(
      uuid(),
      `I couldn't reach the model endpoint: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const parsed = extractJson(raw);
  if (!parsed || !Array.isArray((parsed as { messages?: unknown }).messages)) {
    yield* textAgUiEvents(uuid(), raw);
    return;
  }

  for (const message of (parsed as { messages: unknown[] }).messages) {
    const output = protocolMessageToOutput(message);
    if (!output || output.type === "done") continue;
    for (const event of agentOutputToAgUiEvents(output)) {
      yield event;
    }
  }
}
