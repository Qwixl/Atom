import type { RunAgentInput } from "@ag-ui/client";
import type { BaseEvent } from "@ag-ui/client";
import { ATOM_AGUI_PROFILE_PROP, type PersonalAgentContext } from "@qwixl/owner-store";
import { parseAtomInboundMessage } from "@qwixl/ag-ui-adapter/server";
import { withMcpServerSession, type McpTransportKind } from "@qwixl/mcp-client";
import { eventsIncludeConnectorInvoke, mcpResultToAgUiEvents } from "./mapBrainResult.js";
import { loadBrainConfig } from "./config.js";

function lastUserText(input: RunAgentInput): string {
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const message = input.messages[i];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

function profileFromInput(input: RunAgentInput): PersonalAgentContext | undefined {
  const props = input.forwardedProps;
  if (!props || typeof props !== "object") return undefined;
  const profile = (props as Record<string, unknown>)[ATOM_AGUI_PROFILE_PROP];
  return profile && typeof profile === "object" ? (profile as PersonalAgentContext) : undefined;
}

function extractToolResult(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    const text = record.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const typed = part as { type?: string; text?: string };
        return typed.type === "text" && typeof typed.text === "string" ? typed.text : "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  return raw;
}

export async function callBrainTool(input: Record<string, unknown>): Promise<unknown> {
  const config = loadBrainConfig();
  const transport: McpTransportKind = config.transport;
  return withMcpServerSession(
    {
      transport,
      stdio:
        transport === "stdio"
          ? {
              command: config.command!,
              args: config.args,
              clientName: "atom-mcp-bridge",
              clientVersion: "0.1.0",
            }
          : undefined,
      http:
        transport === "streamable-http"
          ? {
              url: config.url!,
              headers: config.headers,
              clientName: "atom-mcp-bridge",
              clientVersion: "0.1.0",
            }
          : undefined,
    },
    async (session) => {
      const raw = await session.callTool(config.toolName, input);
      return extractToolResult(raw);
    },
  );
}

export async function* runBridgeTurn(input: RunAgentInput): AsyncGenerator<BaseEvent> {
  const text = lastUserText(input);
  const inbound = parseAtomInboundMessage(text);
  const toolInput: Record<string, unknown> = {
    kind: inbound.kind,
    message: text,
    threadId: input.threadId,
    runId: input.runId,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    atomProfile: profileFromInput(input),
    forwardedProps: input.forwardedProps ?? null,
  };

  const raw = await callBrainTool(toolInput);
  const events = mcpResultToAgUiEvents(raw);
  yield* events;

  if (eventsIncludeConnectorInvoke(events) && inbound.kind !== "connector-result") {
    return;
  }
}
