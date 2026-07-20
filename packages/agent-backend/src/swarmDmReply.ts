/**
 * Swarm NPC reply-on-DM (D087 / D089): human/peer MLS or A2A `comms:message` → LLM → encrypted reply.
 * Selective memory + allowlisted search tools (fair-use budget).
 */

import {
  COMMS_MESSAGE_PURPOSE,
  COMMS_MESSAGE_SCHEMA,
} from "@qwixl/a2a-transport";
import { signDataObject, type AgentKeyPair, type DataObject } from "@qwixl/protocol";
import { swarmSystemPromptAddendum } from "@qwixl/agent-llm";
import type { AgentKindConfig } from "./config.js";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import {
  evaluateInboundForNpc,
  SWARM_ABUSE_REFUSE_TEXT,
} from "./swarmAbuseGate.js";
import type { SwarmMemoryStore } from "./swarmMemoryStore.js";
import { sharedSwarmToolBudget } from "./swarmToolBudget.js";
import { buildSwarmPromptContext } from "./swarmTurnContext.js";
import {
  loadLlmAgUiConfigFromEnv,
  runLlmTextCompletion,
  type LlmAgUiConfig,
} from "./agUi/llmRunner.js";
import type { AtomToolExecutor } from "@qwixl/agent-llm";

export interface SwarmDmReplyDeps {
  agentKind: AgentKindConfig;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
  swarmMemory?: SwarmMemoryStore | null;
  swarmSeedId?: string;
  connectorExecutor?: AtomToolExecutor;
  /** Optional override for tests. */
  llmConfig?: LlmAgUiConfig | null;
  /** Optional override for tests. */
  complete?: (system: string, user: string) => Promise<string>;
}

export function extractCommsMessageText(object: DataObject): string | null {
  if (object.governance.purpose !== COMMS_MESSAGE_PURPOSE) return null;
  const text = object.payload?.text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed || null;
}

function peerUrlFor(peerRecords: MlsPeerRecordStore, peerDid: string): string | undefined {
  return peerRecords.list().find((p) => p.peerDid === peerDid)?.peerUrl?.trim() || undefined;
}

function buildDmSystemPrompt(
  memory: SwarmMemoryStore | null | undefined,
  peerDid: string,
  seedId?: string,
  inbound?: string,
): string {
  const context = buildSwarmPromptContext(memory, {
    query: inbound || "conversation",
    peerDid,
    selfSeedId: seedId,
  });
  return `${swarmSystemPromptAddendum("swarm-npc")}

${context}

## DM reply

You received a direct message. Reply in plain text only (no JSON, no UI composition).
Stay in character. Keep replies concise (1–3 short sentences unless asked for more).`;
}

/**
 * If this is a swarm-npc inbound DM, generate and send a reply. No-op otherwise.
 * Safe to fire-and-forget from inbox handlers.
 */
export async function maybeReplySwarmDm(
  deps: SwarmDmReplyDeps,
  object: DataObject,
): Promise<{ replied: boolean; reason?: string }> {
  if (deps.agentKind !== "swarm-npc") {
    return { replied: false, reason: "not_swarm_npc" };
  }
  if (process.env.ATOM_KILL_SWITCH === "1") {
    return { replied: false, reason: "kill_switch" };
  }
  const inbound = extractCommsMessageText(object);
  if (!inbound) {
    return { replied: false, reason: "not_comms_message" };
  }
  const peerDid = object.issuerDid?.trim();
  if (!peerDid || peerDid === deps.identity.did) {
    return { replied: false, reason: "no_peer" };
  }
  const peerUrl = peerUrlFor(deps.peerRecords, peerDid);
  if (!peerUrl) {
    return { replied: false, reason: "no_peer_url" };
  }
  if (!deps.mlsStore.hasSession(peerDid)) {
    return { replied: false, reason: "no_mls_session" };
  }

  const verdict = evaluateInboundForNpc(inbound);
  let replyText: string;
  if (verdict.action === "refuse") {
    replyText = SWARM_ABUSE_REFUSE_TEXT;
  } else {
    const llmConfig =
      deps.llmConfig !== undefined ? deps.llmConfig : loadLlmAgUiConfigFromEnv();
    if (!llmConfig && !deps.complete) {
      console.warn("[swarm-dm] skip reply — LLM_API_KEY not configured");
      return { replied: false, reason: "no_llm" };
    }
    const system = buildDmSystemPrompt(
      deps.swarmMemory,
      peerDid,
      deps.swarmSeedId,
      inbound,
    );
    try {
      if (deps.complete) {
        replyText = (await deps.complete(system, inbound)).trim();
      } else {
        const budget = sharedSwarmToolBudget();
        const withTools: LlmAgUiConfig = {
          ...llmConfig!,
          agentKind: "swarm-npc",
          swarmMemory: deps.swarmMemory ?? null,
          swarmPeerDid: peerDid,
          swarmSeedId: deps.swarmSeedId,
          swarmToolBudget: budget,
          atomConnectorsAvailable: Boolean(deps.connectorExecutor),
          connectorExecutor: deps.connectorExecutor,
          connectedConnectorIds: ["news-search", "page-fetch"],
        };
        replyText = (
          await runLlmTextCompletion(withTools, system, inbound, {
            maxToolRounds: budget.maxToolRoundsPerTurn,
          })
        ).trim();
      }
    } catch (error) {
      console.warn(
        `[swarm-dm] LLM failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { replied: false, reason: "llm_error" };
    }
    if (!replyText) {
      return { replied: false, reason: "empty_reply" };
    }
  }

  const signed = await signDataObject(
    {
      semantic: { schema: COMMS_MESSAGE_SCHEMA },
      payload: { text: replyText },
      governance: { purpose: COMMS_MESSAGE_PURPOSE },
    },
    deps.identity,
  );

  await deliverSignedObject({
    mlsStore: deps.mlsStore,
    peerUrl,
    peerDid,
    object: signed,
    encrypt: true,
  });
  console.log(`[swarm-dm] replied to ${peerDid} id=${signed.id}`);
  return { replied: true };
}
