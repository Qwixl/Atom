import { type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import {
  ATOM_CONNECTOR_INVOKE_TOOL,
  buildAgentToolProfile,
  buildSystemPrompt,
  chatCompletionTools,
  formatLlmProviderError,
  parseAtomConnectorInvokeArgs,
  wrapUntrustedContent,
  type AtomToolExecutor,
  type PromptProfile,
} from "@qwixl/agent-llm";
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
  /**
   * When set with atomConnectorsAvailable, the hosted AG-UI runner runs the same
   * atom_connector_invoke tool loop as browser Live LLM (calendar, RSS, etc.).
   */
  connectorExecutor?: AtomToolExecutor;
  atomConnectorsAvailable?: boolean;
}

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_TOOL_ROUNDS = 8;

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

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

function connectorsEnabled(config: LlmAgUiConfig): boolean {
  return Boolean(config.atomConnectorsAvailable && config.connectorExecutor);
}

async function executeNamedTool(config: LlmAgUiConfig, name: string, argsJson: string): Promise<string> {
  if (name === ATOM_CONNECTOR_INVOKE_TOOL.function.name) {
    if (!config.connectorExecutor) {
      return JSON.stringify({ error: "Atom connector invoke is not configured" });
    }
    try {
      const args = parseAtomConnectorInvokeArgs(argsJson);
      const result = await config.connectorExecutor(args);
      return wrapUntrustedContent(JSON.stringify(result, null, 2), {
        source: `connector:${args.connectorId}`,
        purpose: args.operation,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

async function callChatCompletions(
  config: LlmAgUiConfig,
  messages: ChatMessage[],
  tools?: unknown[],
): Promise<{
  message: ChatMessage;
  promptTokens?: number;
  completionTokens?: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature ?? 0.4,
      messages,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(
        `${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
      );
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: ChatMessage }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("endpoint returned no message");
    return {
      message,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runChatWithOptionalTools(
  config: LlmAgUiConfig,
  messages: ChatMessage[],
  maxToolRounds: number = MAX_TOOL_ROUNDS,
): Promise<string> {
  const toolProfile = buildAgentToolProfile(undefined, {
    atomConnectorsAvailable: connectorsEnabled(config),
  });
  const tools = chatCompletionTools(toolProfile);
  if (tools.length === 0) {
    const result = await callChatCompletions(config, messages);
    config.onUsage?.({
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      model: config.model,
    });
    const content = result.message.content;
    if (typeof content !== "string") throw new Error("endpoint returned no message content");
    return content;
  }

  const working = [...messages];
  const rounds = Math.max(1, Math.min(MAX_TOOL_ROUNDS, maxToolRounds));
  for (let round = 0; round < rounds; round += 1) {
    const result = await callChatCompletions(config, working, tools);
    config.onUsage?.({
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      model: config.model,
    });
    const message = result.message;
    if (message.tool_calls?.length) {
      working.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        const output = await executeNamedTool(config, call.function.name, call.function.arguments);
        working.push({
          role: "tool",
          tool_call_id: call.id,
          content: output,
        });
      }
      continue;
    }
    const content = message.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("endpoint returned empty content after tool loop");
    }
    return content;
  }
  throw new Error("tool loop exceeded maximum rounds");
}

/**
 * Plain text LLM completion with optional connector tools (Agent Brain turns).
 * Not an AG-UI SSE stream — returns assistant text only.
 * Does **not** include the Chat composition grammar (that caused brain watches to emit JSON protocol).
 */
export async function runLlmTextCompletion(
  config: LlmAgUiConfig,
  systemPrompt: string,
  userMessage: string,
  options?: { maxToolRounds?: number },
): Promise<string> {
  if (config.modelAllowlist && config.modelAllowlist.length > 0) {
    if (!config.modelAllowlist.includes(config.model)) {
      throw new Error(
        `Model "${config.model}" is not on this agent's allowlist. Set LLM_MODEL or clear ATOM_MODEL_ALLOWLIST.`,
      );
    }
  }
  const toolProfile = buildAgentToolProfile(undefined, {
    atomConnectorsAvailable: connectorsEnabled(config),
  });
  const toolHint = connectorsEnabled(config)
    ? "\n\nYou may call atom_connector_invoke for read-only connector operations when needed."
    : "";
  const systemContent = [config.safetyPrefix?.trim(), systemPrompt.trim() + toolHint]
    .filter(Boolean)
    .join("\n\n");
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userMessage },
  ];
  return runChatWithOptionalTools(config, messages, options?.maxToolRounds ?? MAX_TOOL_ROUNDS);
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
  const toolProfile = buildAgentToolProfile(undefined, {
    atomConnectorsAvailable: connectorsEnabled(config),
  });
  const baseSystem = buildSystemPrompt(catalog, mergedProfile, toolProfile);
  const systemContent = config.safetyPrefix?.trim()
    ? `${config.safetyPrefix.trim()}\n\n${baseSystem}`
    : baseSystem;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent,
    },
    ...history.map((entry) => ({ role: entry.role, content: entry.content }) as ChatMessage),
  ];

  let raw: string;
  try {
    raw = await runChatWithOptionalTools(config, messages);
  } catch (error) {
    yield* textAgUiEvents(
      uuid(),
      `I couldn't reach the model endpoint: ${formatLlmProviderError(error)}`,
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
