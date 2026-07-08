import type { ModelCapabilityProfile, NativeToolId } from "./modelCapabilities.js";
import { filterWireableHostedTools, buildResponsesHostedTool } from "./hostedToolWireability.js";

export type AtomToolId = "connector_invoke";

export interface AtomConnectorInvokeInput {
  connectorId: "webcal" | "rss" | "news-search" | "bookmarks";
  operation: string;
  input?: Record<string, unknown>;
}

export type AtomToolExecutor = (call: AtomConnectorInvokeInput) => Promise<unknown>;

export interface AgentToolProfile {
  native: NativeToolId[];
  atom: AtomToolId[];
  /** Provider-reported hosted tool types passed through to Responses API. */
  providerHostedTools: string[];
  useResponsesApi: boolean;
  useAtomToolLoop: boolean;
  needsProtocolFormatPass: boolean;
}

export function buildAgentToolProfile(
  capabilities: ModelCapabilityProfile | undefined,
  opts?: { atomConnectorsAvailable?: boolean },
): AgentToolProfile {
  const native = capabilities?.nativeTools ?? [];
  const providerHostedTools = filterWireableHostedTools(capabilities?.providerHostedTools ?? []);
  const atomConnectorsAvailable = opts?.atomConnectorsAvailable ?? false;
  const atom: AtomToolId[] = atomConnectorsAvailable ? ["connector_invoke"] : [];
  const hasResponsesTools = providerHostedTools.length > 0;
  const useResponsesApi = Boolean(capabilities?.responsesApi) && hasResponsesTools;
  const useAtomToolLoop = atom.length > 0 && !useResponsesApi;
  return {
    native,
    atom,
    providerHostedTools,
    useResponsesApi,
    useAtomToolLoop,
    needsProtocolFormatPass: useResponsesApi,
  };
}

export const ATOM_CONNECTOR_INVOKE_TOOL = {
  type: "function" as const,
  function: {
    name: "atom_connector_invoke",
    description:
      "Read owner-specific data via Atom connectors. Use for calendar (webcal), subscribed RSS feeds, " +
      "ephemeral news search (news-search), or saved bookmarks. Agent-led only — never triggered by shell keywords.",
    parameters: {
      type: "object",
      properties: {
        connectorId: {
          type: "string",
          enum: ["webcal", "rss", "news-search", "bookmarks"],
          description: "Connector id.",
        },
        operation: {
          type: "string",
          description:
            "Operation id. webcal: getStatus, listEvents. rss: getStatus, listItems. " +
            "news-search: searchItems (requires input.query). bookmarks: getStatus, listItems, readUrl.",
        },
        input: {
          type: "object",
          description: 'Operation input, e.g. { query: "politics" } for news-search searchItems.',
          additionalProperties: true,
        },
      },
      required: ["connectorId", "operation"],
      additionalProperties: false,
    },
  },
};

const NATIVE_TOOL_LABELS: Record<NativeToolId, string> = {
  web_search: "**web_search** (provider): live public web search",
  image_generation: "**image_generation** (provider): generate or edit images",
  file_search: "**file_search** (provider): search uploaded vector stores",
  code_interpreter: "**code_interpreter** (provider): run code in a sandbox",
  computer_use: "**computer_use** (provider): control a computer interface",
  realtime: "**realtime** (provider): low-latency speech/streaming via Realtime API",
  audio: "**audio** (provider): speech synthesis and transcription",
};

export function chatCompletionTools(profile: AgentToolProfile): unknown[] {
  if (!profile.useAtomToolLoop) return [];
  return [ATOM_CONNECTOR_INVOKE_TOOL];
}

export function responsesApiTools(profile: AgentToolProfile): unknown[] {
  const tools: unknown[] = [];
  const seen = new Set<string>();
  for (const type of filterWireableHostedTools(profile.providerHostedTools)) {
    if (seen.has(type)) continue;
    seen.add(type);
    const tool = buildResponsesHostedTool(type);
    if (tool) tools.push(tool);
  }
  if (profile.atom.includes("connector_invoke")) {
    tools.push({
      type: "function",
      name: ATOM_CONNECTOR_INVOKE_TOOL.function.name,
      description: ATOM_CONNECTOR_INVOKE_TOOL.function.description,
      parameters: ATOM_CONNECTOR_INVOKE_TOOL.function.parameters,
      strict: false,
    });
  }
  return tools;
}

export function formatToolsForPrompt(profile: AgentToolProfile): string {
  const lines: string[] = ["## Tools available this session", ""];
  for (const type of profile.providerHostedTools) {
    lines.push(`- **${type}** (provider-hosted)`);
  }
  for (const tool of profile.native) {
    if (profile.providerHostedTools.includes(tool)) continue;
    lines.push(`- ${NATIVE_TOOL_LABELS[tool] ?? tool}`);
  }
  if (profile.atom.includes("connector_invoke")) {
    lines.push(
      "- **atom_connector_invoke** (Atom): owner calendar, RSS, news-search, bookmarks — call for fresh owner data",
    );
  }
  if (profile.native.length === 0 && profile.atom.length === 0) {
    lines.push(
      "No provider-hosted tools or Atom connector invoke wired for this model/endpoint. " +
        "Answer from training knowledge and passive snapshots below.",
    );
  }
  lines.push("");
  lines.push(
    "When the owner asks what tools/skills you have, list **every tool above first**, then Atom UI composition abilities. " +
      "Native provider tools and Atom tools **add together** — never omit web_search when listed above. " +
      "Never claim a tool not listed above.",
  );
  lines.push(
    "After web search or connector reads, always emit Atom JSON with headline/list content in `text` and/or `core/list` — never stop at an empty intro.",
  );
  lines.push(
    "When atom_connector_invoke fails, tell the owner to start their Messages agent (pnpm start:agent) — connectors run on the agent backend, not in the browser alone.",
  );
  return lines.join("\n");
}

export function parseAtomConnectorInvokeArgs(raw: string): AtomConnectorInvokeInput {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const connectorId = String(parsed.connectorId ?? "").trim() as AtomConnectorInvokeInput["connectorId"];
  const operation = String(parsed.operation ?? "").trim();
  if (!connectorId || !operation) {
    throw new Error("atom_connector_invoke requires connectorId and operation");
  }
  const input =
    parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input)
      ? (parsed.input as Record<string, unknown>)
      : undefined;
  return { connectorId, operation, input };
}
