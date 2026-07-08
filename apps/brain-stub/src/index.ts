import { createServer } from "node:http";
import type { RunAgentInput } from "@ag-ui/client";
import {
  ATOM_AGUI_PROFILE_PROP,
  type PersonalAgentContext,
} from "@qwixl/owner-store";
import {
  atomConnectorInvokeEvent,
  atomGameMoveEvent,
  createAtomAgUiHttpHandler,
  parseAtomInboundMessage,
  textAgUiEvents,
} from "@qwixl/ag-ui-adapter/server";
import { v4 as uuid } from "uuid";

const PORT = Number(process.env.PORT ?? 5210);
const HOST = process.env.HOST ?? "127.0.0.1";

const ALLOWED_ORIGINS = new Set(
  (process.env.ATOM_SHELL_ORIGINS ??
    "http://localhost:5200,http://127.0.0.1:5200,http://localhost:5203,http://127.0.0.1:5203")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

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

function* runBrain(input: RunAgentInput) {
  const messageId = uuid();
  const text = lastUserText(input);
  const inbound = parseAtomInboundMessage(text);
  const profile = profileFromInput(input);
  const connectorsAvailable = Boolean(
    input.forwardedProps &&
      typeof input.forwardedProps === "object" &&
      (input.forwardedProps as Record<string, unknown>).atomConnectorsAvailable,
  );

  if (inbound.kind === "connector-result") {
    yield* textAgUiEvents(
      messageId,
      inbound.ok
        ? `Connector ${inbound.callId} succeeded.`
        : `Connector ${inbound.callId} failed: ${inbound.error ?? "unknown error"}`,
    );
    return;
  }

  if (text.toLowerCase().includes("connector") && connectorsAvailable) {
    yield* textAgUiEvents(messageId, "Requesting calendar status via shell connector…");
    yield atomConnectorInvokeEvent({
      callId: uuid(),
      connectorId: "webcal",
      operation: "getStatus",
    });
    return;
  }

  if (text.toLowerCase().includes("game-move") || text.includes("[game-turn]")) {
    yield atomGameMoveEvent("demo-game", { cell: 4 });
    return;
  }

  const name =
    profile?.open?.find((record) => record.category === "identity")?.label ?? "owner";
  yield* textAgUiEvents(
    messageId,
    `Brain stub (${HOST}:${PORT}) — hello ${name}. Try "connector status", "game-move demo", or plain chat. Body (A2A/vault) runs separately on atom-agent.`,
  );
}

const handler = createAtomAgUiHttpHandler({
  allowedOrigins: ALLOWED_ORIGINS,
  run: runBrain,
});

createServer((req, res) => {
  void handler(req, res);
}).listen(PORT, HOST, () => {
  console.log(`Atom brain stub (AG-UI only) http://${HOST}:${PORT}/agent`);
  console.log(`  Pair with atom-agent body for A2A/network. Shell Chat → this URL.`);
});
