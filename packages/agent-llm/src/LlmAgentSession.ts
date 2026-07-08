import {
  SessionEmitter,
  parseAgentProtocolMessage,
  type AgentSession,
  type Catalog,
  type JsonValue,
  type UiEvent,
} from "@qwixl/shell-core";
import {
  ATOM_CONNECTOR_INVOKE_TOOL,
  buildAgentToolProfile,
  chatCompletionTools,
  parseAtomConnectorInvokeArgs,
  type AgentToolProfile,
  type AtomToolExecutor,
} from "./agentTools.js";
import type { ModelCapabilityProfile } from "./modelCapabilities.js";
import { inferModelCapabilities, normalizeModelCapabilityProfile } from "./modelCapabilities.js";
import { buildSystemPrompt, type PromptProfile } from "./prompt.js";
import { callResponsesApi } from "./responsesApi.js";

export interface LlmConfig {
  /** OpenAI-compatible base URL, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  /** Discovered native provider capabilities for this model (optional; inferred when absent). */
  capabilities?: ModelCapabilityProfile;
}

export interface LlmAgentSessionOptions {
  /** Execute Atom connector reads when the model calls `atom_connector_invoke`. */
  atomToolExecutor?: AtomToolExecutor;
  /** Owner has agent backend configured — enables Atom connector tool. */
  atomConnectorsAvailable?: boolean;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * AgentSession backed by any OpenAI-compatible chat-completions endpoint.
 * Adapts to discovered model capabilities: Responses API (native web_search),
 * Chat Completions tool loop (Atom connectors), or plain completions.
 */
export class LlmAgentSession extends SessionEmitter implements AgentSession {
  private messages: ChatMessage[];
  private config: LlmConfig;
  private catalog: Catalog;
  private profileProvider?: () => PromptProfile;
  private toolProfile: AgentToolProfile;
  private atomToolExecutor?: AtomToolExecutor;
  private inFlight = false;
  private queued: string[] = [];
  private disposed = false;
  private abortController: AbortController | null = null;
  private jsonModeSupported = true;

  private static readonly REQUEST_TIMEOUT_MS = 120_000;
  private static readonly MAX_TOOL_ROUNDS = 8;

  constructor(
    config: LlmConfig,
    catalog: Catalog,
    profile?: PromptProfile | (() => PromptProfile),
    options?: LlmAgentSessionOptions,
  ) {
    super();
    this.config = config;
    this.catalog = catalog;
    this.profileProvider = typeof profile === "function" ? profile : profile ? () => profile : undefined;
    this.atomToolExecutor = options?.atomToolExecutor;
    const capabilities = normalizeModelCapabilityProfile(config.capabilities, {
      baseUrl: config.baseUrl,
      model: config.model,
    });
    this.toolProfile = buildAgentToolProfile(capabilities, {
      atomConnectorsAvailable: Boolean(
        options?.atomConnectorsAvailable && options?.atomToolExecutor,
      ),
    });
    this.messages = [{ role: "system", content: this.currentSystemPrompt() }];
  }

  private currentSystemPrompt(): string {
    return buildSystemPrompt(this.catalog, this.profileProvider?.(), this.toolProfile);
  }

  sendUserMessage(text: string): void {
    this.enqueue(text);
  }

  sendUiEvent(event: UiEvent): void {
    this.enqueue(
      `[ui-event] ${JSON.stringify({
        surfaceId: event.surfaceId,
        nodeId: event.nodeId,
        name: event.name,
        payload: event.payload ?? null,
      })}`,
    );
  }

  sendActionDecision(actionId: string, decision: "approved" | "declined"): void {
    this.enqueue(`[action-decision] ${JSON.stringify({ actionId, decision })}`);
  }

  sendDataDisclosure(
    requestId: string,
    decision: "approved" | "declined",
    records: Array<{ category: string; label: string; value: JsonValue }>,
  ): void {
    const payload =
      decision === "approved" ? { requestId, decision, records } : { requestId, decision };
    this.enqueue(`[data-disclosure] ${JSON.stringify(payload)}`);
  }

  dispose(): void {
    this.disposed = true;
    this.abortController?.abort();
    this.queued = [];
  }

  private enqueue(content: string): void {
    this.disposed = false;
    this.queued.push(content);
    if (!this.inFlight) void this.drain();
  }

  private async drain(): Promise<void> {
    this.inFlight = true;
    try {
      while (this.queued.length > 0 && !this.disposed) {
        const batch = this.queued.splice(0, this.queued.length);
        this.messages.push({ role: "user", content: batch.join("\n") });
        await this.completeOnce();
      }
    } finally {
      this.inFlight = false;
      this.abortController = null;
      if (!this.disposed) this.emit({ type: "done" });
    }
  }

  private async completeOnce(): Promise<void> {
    let raw: string;
    try {
      raw = await this.callModel();
    } catch (error) {
      this.emit({
        type: "text",
        text: `I couldn't reach the model endpoint: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    if (this.toolProfile.needsProtocolFormatPass && !extractJson(raw)) {
      try {
        raw = await this.formatGatheredContentAsProtocol(raw);
      } catch {
        /* fall through — repair may still help */
      }
    }

    this.messages.push({ role: "assistant", content: raw });
    let parsed = extractJson(raw);
    if (!parsed || !Array.isArray((parsed as { messages?: unknown }).messages)) {
      const repaired = await this.attemptRepair();
      if (repaired) {
        parsed = repaired;
      } else {
        this.emit({ type: "text", text: raw });
        return;
      }
    }

    for (const message of (parsed as { messages: unknown[] }).messages) {
      this.emitAgentMessage(message);
    }
  }

  private async attemptRepair(): Promise<{ messages: unknown[] } | null> {
    if (this.disposed) return null;
    this.messages.push({
      role: "user",
      content:
        '[format-error] Your previous reply did not match the required protocol. ' +
        'Respond again for that same turn with ONLY the JSON object described in the ' +
        'system prompt — no markdown fences, no prose outside the JSON, no ASCII grids. ' +
        'If the turn calls for a game or module, use a "composition" message with the ' +
        "correct component, not a text drawing.",
    });
    let raw: string;
    try {
      raw = await this.callChatCompletionsPlain();
    } catch {
      return null;
    }
    this.messages.push({ role: "assistant", content: raw });
    const parsed = extractJson(raw);
    if (!parsed || !Array.isArray((parsed as { messages?: unknown }).messages)) return null;
    return parsed as { messages: unknown[] };
  }

  private emitAgentMessage(message: unknown): void {
    const parsed = parseAgentProtocolMessage(message);
    if (!parsed) {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as Record<string, unknown>).type === "composition"
      ) {
        console.warn("[LlmAgentSession] composition message rejected by protocol parser", message);
      }
      return;
    }
    if (parsed.kind === "reject") {
      this.emit({ type: "text", text: parsed.text });
      return;
    }
    this.emit(parsed.output);
  }

  private async callModel(): Promise<string> {
    this.messages[0] = { role: "system", content: this.currentSystemPrompt() };
    if (this.toolProfile.useResponsesApi) {
      return this.callResponsesPath();
    }
    if (this.toolProfile.useAtomToolLoop) {
      return this.callChatCompletionsToolLoop();
    }
    return this.callChatCompletionsPlain();
  }

  private beginRequest(): AbortSignal {
    this.abortController?.abort();
    this.abortController = new AbortController();
    return this.abortController.signal;
  }

  private chatCompletionsUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  private requestHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async callChatCompletionsPlain(): Promise<string> {
    const signal = this.beginRequest();
    const timeout = setTimeout(() => this.abortController?.abort(), LlmAgentSession.REQUEST_TIMEOUT_MS);
    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        temperature: this.config.temperature ?? 0.4,
        messages: this.messages,
      };
      if (this.jsonModeSupported) body.response_format = { type: "json_object" };

      let response = await fetch(this.chatCompletionsUrl(), {
        method: "POST",
        headers: this.requestHeaders(),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok && this.jsonModeSupported && (response.status === 400 || response.status === 422)) {
        this.jsonModeSupported = false;
        delete body.response_format;
        response = await fetch(this.chatCompletionsUrl(), {
          method: "POST",
          headers: this.requestHeaders(),
          body: JSON.stringify(body),
          signal,
        });
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(
          `${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
        );
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("endpoint returned no message content");
      return content;
    } catch (error) {
      if (signal.aborted) {
        throw new Error(
          this.disposed
            ? "request cancelled"
            : `request timed out after ${LlmAgentSession.REQUEST_TIMEOUT_MS / 1000}s`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callChatCompletionsToolLoop(): Promise<string> {
    const signal = this.beginRequest();
    const timeout = setTimeout(() => this.abortController?.abort(), LlmAgentSession.REQUEST_TIMEOUT_MS);
    const tools = chatCompletionTools(this.toolProfile);
    try {
      for (let round = 0; round < LlmAgentSession.MAX_TOOL_ROUNDS; round += 1) {
        const body: Record<string, unknown> = {
          model: this.config.model,
          temperature: this.config.temperature ?? 0.4,
          messages: this.messages,
          tools,
          tool_choice: "auto",
        };
        const response = await fetch(this.chatCompletionsUrl(), {
          method: "POST",
          headers: this.requestHeaders(),
          body: JSON.stringify(body),
          signal,
        });
        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new Error(
            `${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
          );
        }
        const data = (await response.json()) as {
          choices?: Array<{ message?: ChatMessage }>;
        };
        const message = data.choices?.[0]?.message;
        if (!message) throw new Error("endpoint returned no message");

        if (message.tool_calls?.length) {
          this.messages.push({
            role: "assistant",
            content: message.content ?? null,
            tool_calls: message.tool_calls,
          });
          for (const call of message.tool_calls) {
            const output = await this.executeToolCall(call);
            this.messages.push({
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
    } catch (error) {
      if (signal.aborted) {
        throw new Error(
          this.disposed
            ? "request cancelled"
            : `request timed out after ${LlmAgentSession.REQUEST_TIMEOUT_MS / 1000}s`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callResponsesPath(): Promise<string> {
    const signal = this.beginRequest();
    const timeout = setTimeout(() => this.abortController?.abort(), LlmAgentSession.REQUEST_TIMEOUT_MS);
    try {
      let input: unknown = messagesToResponsesInput(this.messages);
      let previousResponseId: string | undefined;

      for (let round = 0; round < LlmAgentSession.MAX_TOOL_ROUNDS; round += 1) {
        const result = await callResponsesApi({
          config: this.config,
          instructions: this.currentSystemPrompt(),
          input,
          toolProfile: this.toolProfile,
          previousResponseId,
          signal,
        });

        if (result.functionCalls.length === 0) {
          if (!result.text.trim()) throw new Error("Responses API returned no text");
          return result.text;
        }

        const outputs: unknown[] = Array.isArray(input) ? [...input] : input ? [input] : [];
        for (const call of result.functionCalls) {
          const toolResult = await this.executeNamedTool(call.name, call.arguments);
          outputs.push({
            type: "function_call_output",
            call_id: call.callId,
            output: toolResult,
          });
        }
        input = outputs;
        previousResponseId = result.responseId;
      }
      throw new Error("Responses tool loop exceeded maximum rounds");
    } catch (error) {
      if (signal.aborted) {
        throw new Error(
          this.disposed
            ? "request cancelled"
            : `request timed out after ${LlmAgentSession.REQUEST_TIMEOUT_MS / 1000}s`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeToolCall(call: ToolCall): Promise<string> {
    return this.executeNamedTool(call.function.name, call.function.arguments);
  }

  private async executeNamedTool(name: string, argsJson: string): Promise<string> {
    if (name !== ATOM_CONNECTOR_INVOKE_TOOL.function.name) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    if (!this.atomToolExecutor) {
      return JSON.stringify({ error: "Atom connector invoke is not configured" });
    }
    try {
      const args = parseAtomConnectorInvokeArgs(argsJson);
      const result = await this.atomToolExecutor(args);
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Chat Completions JSON pass after Responses API gathered prose (web search, etc.). */
  private async formatGatheredContentAsProtocol(gathered: string): Promise<string> {
    const signal = this.beginRequest();
    const timeout = setTimeout(() => this.abortController?.abort(), LlmAgentSession.REQUEST_TIMEOUT_MS);
    const formatMessages: ChatMessage[] = [
      {
        role: "system",
        content:
          this.currentSystemPrompt() +
          "\n\nYou already gathered content below (web search, tools). " +
          "Respond with ONLY the Atom JSON protocol for this turn. " +
          "Put every headline and fact in `text` and/or a `core/list` inside `core/card`. " +
          "Never return only an intro line.",
      },
      { role: "user", content: `Package this for the owner:\n\n${gathered}` },
    ];
    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        temperature: this.config.temperature ?? 0.3,
        messages: formatMessages,
        response_format: { type: "json_object" },
      };
      const response = await fetch(this.chatCompletionsUrl(), {
        method: "POST",
        headers: this.requestHeaders(),
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(
          `${response.status} ${response.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
        );
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("format pass returned no content");
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function messagesToResponsesInput(messages: ChatMessage[]): unknown[] {
  return messages
    .slice(1)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content ?? "" }));
}

/** Tolerant JSON extraction: strips fences, finds the first balanced object. */
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
