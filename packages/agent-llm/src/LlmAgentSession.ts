import {
  SessionEmitter,
  parseAgentProtocolMessage,
  type AgentSession,
  type Catalog,
  type JsonValue,
  type UiEvent,
} from "@qwixl/shell-core";
import { buildSystemPrompt, type PromptProfile } from "./prompt.js";

export interface LlmConfig {
  /** OpenAI-compatible base URL, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * AgentSession backed by any OpenAI-compatible chat-completions endpoint.
 * Proof point 1: an unscripted model composing from the catalog vocabulary
 * alone, through exactly the same contract the mock agent uses.
 */
export class LlmAgentSession extends SessionEmitter implements AgentSession {
  private messages: ChatMessage[];
  private config: LlmConfig;
  private catalog: Catalog;
  private profileProvider?: () => PromptProfile;
  private inFlight = false;
  private queued: string[] = [];
  private disposed = false;
  private abortController: AbortController | null = null;

  private static readonly REQUEST_TIMEOUT_MS = 120_000;

  constructor(
    config: LlmConfig,
    catalog: Catalog,
    profile?: PromptProfile | (() => PromptProfile),
  ) {
    super();
    this.config = config;
    this.catalog = catalog;
    this.profileProvider = typeof profile === "function" ? profile : profile ? () => profile : undefined;
    this.messages = [{ role: "system", content: this.currentSystemPrompt() }];
  }

  /**
   * The system prompt is reassembled from the live profile on every API
   * call. Because the endpoint is stateless, guarding a record mid-session
   * removes it from the model's context on the next turn — the only residue
   * is whatever the record already influenced earlier in the transcript.
   */
  private currentSystemPrompt(): string {
    return buildSystemPrompt(this.catalog, this.profileProvider?.());
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
    // React Strict Mode remounts reuse the same useMemo session instance after
    // dispose() ran in effect cleanup — re-activate on new user input.
    this.disposed = false;
    this.queued.push(content);
    if (!this.inFlight) void this.drain();
  }

  private async drain(): Promise<void> {
    this.inFlight = true;
    try {
      while (this.queued.length > 0 && !this.disposed) {
        // Batch anything queued while a request was in flight into one turn.
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
      raw = await this.callApi();
    } catch (error) {
      this.emit({
        type: "text",
        text: `I couldn't reach the model endpoint: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    this.messages.push({ role: "assistant", content: raw });
    const parsed = extractJson(raw);
    if (!parsed || !Array.isArray((parsed as { messages?: unknown }).messages)) {
      // Model ignored the protocol; degrade to plain text rather than failing.
      this.emit({ type: "text", text: raw });
      return;
    }

    for (const message of (parsed as { messages: unknown[] }).messages) {
      this.emitAgentMessage(message);
    }
  }

  private emitAgentMessage(message: unknown): void {
    const parsed = parseAgentProtocolMessage(message);
    if (!parsed) return;
    if (parsed.kind === "reject") {
      this.emit({ type: "text", text: parsed.text });
      return;
    }
    this.emit(parsed.output);
  }

  private async callApi(): Promise<string> {
    this.messages[0] = { role: "system", content: this.currentSystemPrompt() };
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const timeout = setTimeout(() => this.abortController?.abort(), LlmAgentSession.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature ?? 0.4,
          messages: this.messages,
        }),
        signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
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
