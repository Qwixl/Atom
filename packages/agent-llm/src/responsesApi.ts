import type { LlmConfig } from "./LlmAgentSession.js";
import type { AgentToolProfile } from "./agentTools.js";
import { responsesApiTools } from "./agentTools.js";

export interface ResponsesCallResult {
  text: string;
  functionCalls: Array<{ callId: string; name: string; arguments: string }>;
}

function responsesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/responses`;
}

function extractOutputText(data: Record<string, unknown>): string {
  const output = data.output;
  if (!Array.isArray(output)) {
    const text = data.output_text;
    return typeof text === "string" ? text : "";
  }
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.type === "message" && Array.isArray(row.content)) {
      for (const block of row.content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "output_text" && typeof b.text === "string") {
          parts.push(b.text);
        }
      }
    }
    if (typeof row.text === "string") parts.push(row.text);
  }
  return parts.join("\n").trim();
}

function extractFunctionCalls(data: Record<string, unknown>): ResponsesCallResult["functionCalls"] {
  const output = data.output;
  if (!Array.isArray(output)) return [];
  const calls: ResponsesCallResult["functionCalls"] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.type !== "function_call") continue;
    const callId = String(row.call_id ?? row.id ?? "");
    const name = String(row.name ?? "");
    const args = typeof row.arguments === "string" ? row.arguments : JSON.stringify(row.arguments ?? {});
    if (callId && name) calls.push({ callId, name, arguments: args });
  }
  return calls;
}

export async function callResponsesApi(opts: {
  config: LlmConfig;
  instructions: string;
  input: unknown;
  toolProfile: AgentToolProfile;
  previousResponseId?: string;
  signal: AbortSignal;
}): Promise<ResponsesCallResult & { responseId?: string }> {
  const tools = responsesApiTools(opts.toolProfile);
  const body: Record<string, unknown> = {
    model: opts.config.model,
    instructions: opts.instructions,
    input: opts.input,
  };
  if (tools.length > 0) body.tools = tools;
  if (opts.previousResponseId) body.previous_response_id = opts.previousResponseId;

  const res = await fetch(responsesUrl(opts.config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Responses API ${res.status}${errBody ? ` — ${errBody.slice(0, 240)}` : ""}`,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    text: extractOutputText(data),
    functionCalls: extractFunctionCalls(data),
    responseId: typeof data.id === "string" ? data.id : undefined,
  };
}
