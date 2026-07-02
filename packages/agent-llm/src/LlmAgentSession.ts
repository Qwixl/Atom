import {
  SessionEmitter,
  validateComposition,
  validateConsequentialAction,
  type AgentSession,
  type Catalog,
  type UiEvent,
} from "@atom/shell-core";
import { buildSystemPrompt } from "./prompt.js";

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
  private inFlight = false;
  private queued: string[] = [];
  private disposed = false;

  constructor(config: LlmConfig, catalog: Catalog) {
    super();
    this.config = config;
    this.messages = [{ role: "system", content: buildSystemPrompt(catalog) }];
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

  dispose(): void {
    this.disposed = true;
  }

  private enqueue(content: string): void {
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
    if (typeof message !== "object" || message === null) return;
    const m = message as Record<string, unknown>;

    if (m.type === "text" && typeof m.text === "string") {
      this.emit({ type: "text", text: m.text });
      return;
    }

    if (m.type === "composition") {
      const result = validateComposition(m.composition);
      if (result.ok) {
        this.emit({ type: "composition", composition: result.value });
      } else {
        this.emit({
          type: "text",
          text: `(The agent produced an invalid surface, discarded by the shell: ${result.errors.join("; ")})`,
        });
      }
      return;
    }

    if (m.type === "consequential-action") {
      const result = validateConsequentialAction(m.action);
      if (result.ok && typeof m.surfaceId === "string") {
        this.emit({ type: "consequential-action", surfaceId: m.surfaceId, action: result.value });
      } else {
        const errors = result.ok ? ["surfaceId: required string"] : result.errors;
        this.emit({
          type: "text",
          text: `(The agent requested a malformed consequential action, blocked by the shell: ${errors.join("; ")})`,
        });
      }
    }
  }

  private async callApi(): Promise<string> {
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
