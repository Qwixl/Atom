/**
 * Swarm NPC reply-on-DM (D087 / D089 / D090):
 * short-term thread history + selective long-term memory + vague recall on remember prompts.
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
import {
  formatVagueRecallBlock,
  isVagueRecallPrompt,
  outlineFromTurns,
} from "./swarmRecall.js";
import type { SwarmSocialDeps } from "./swarmSocialTools.js";
import { sharedSwarmToolBudget } from "./swarmToolBudget.js";
import { buildSwarmPromptContext } from "./swarmTurnContext.js";
import {
  loadLlmAgUiConfigFromEnv,
  runLlmTextCompletion,
  type LlmAgUiConfig,
  type LlmChatTurn,
} from "./agUi/llmRunner.js";
import type { AtomToolExecutor } from "@qwixl/agent-llm";

const SHORT_TERM_TURN_LIMIT = 16;
/** Archive older turns into a held-back outline once buffer exceeds this. */
const ARCHIVE_TURN_THRESHOLD = 12;
const ARCHIVE_KEEP_LAST = 6;

export interface SwarmDmReplyDeps {
  agentKind: AgentKindConfig;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
  swarmMemory?: SwarmMemoryStore | null;
  swarmSeedId?: string;
  swarmSocial?: SwarmSocialDeps | null;
  connectorExecutor?: AtomToolExecutor;
  /** Optional override for tests. */
  llmConfig?: LlmAgUiConfig | null;
  /** Optional override for tests. */
  complete?: (
    system: string,
    user: string,
    history?: LlmChatTurn[],
  ) => Promise<string>;
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
  seedId: string | undefined,
  inbound: string,
  vagueRecall: boolean,
): string {
  let vagueRecallBlock: string | undefined;
  if (vagueRecall && memory) {
    const summaries = memory.retrieveSummaries(peerDid, inbound, 6);
    vagueRecallBlock = formatVagueRecallBlock(summaries.map((s) => s.text));
  }
  const context = buildSwarmPromptContext(memory, {
    query: inbound || "conversation",
    peerDid,
    selfSeedId: seedId,
    vagueRecallBlock,
  });
  return `${swarmSystemPromptAddendum("swarm-npc")}

${context}

## DM reply

You received a direct message. Reply in plain text only (no JSON, no UI composition).
Stay in character. Keep replies concise (1–3 short sentences unless asked for more).
Use the recent conversation turns below as short-term context — continue the thread naturally.
If you start a game with \`challenge_friend_to_game\`, say so briefly — never paste an ASCII board or ask them to type a cell number.`;
}

function historyFromMemory(
  memory: SwarmMemoryStore | null | undefined,
  peerDid: string,
): LlmChatTurn[] {
  if (!memory) return [];
  return memory.recentDialogueTurns(peerDid, SHORT_TERM_TURN_LIMIT).map((t) => ({
    role: t.role,
    content: t.text,
  }));
}

function maybeArchiveOutline(memory: SwarmMemoryStore, peerDid: string): void {
  if (memory.countDialogueTurns(peerDid) < ARCHIVE_TURN_THRESHOLD) return;
  const turns = memory.recentDialogueTurns(peerDid, 40);
  const older = turns.slice(0, Math.max(0, turns.length - ARCHIVE_KEEP_LAST));
  const outline = outlineFromTurns(older);
  if (!outline) return;
  memory.archiveDialogueOutline(
    peerDid,
    `Outline with this peer: ${outline}`,
    ARCHIVE_KEEP_LAST,
  );
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
    const recall = isVagueRecallPrompt(inbound);
    const system = buildDmSystemPrompt(
      deps.swarmMemory,
      peerDid,
      deps.swarmSeedId,
      inbound,
      recall,
    );
    const history = historyFromMemory(deps.swarmMemory, peerDid);
    try {
      if (deps.complete) {
        replyText = (await deps.complete(system, inbound, history)).trim();
      } else {
        const budget = sharedSwarmToolBudget();
        const withTools: LlmAgUiConfig = {
          ...llmConfig!,
          agentKind: "swarm-npc",
          swarmMemory: deps.swarmMemory ?? null,
          swarmPeerDid: peerDid,
          swarmSeedId: deps.swarmSeedId,
          swarmToolBudget: budget,
          swarmSocial: deps.swarmSocial ?? null,
          atomConnectorsAvailable: Boolean(deps.connectorExecutor),
          connectorExecutor: deps.connectorExecutor,
          connectedConnectorIds: ["news-search", "page-fetch"],
        };
        replyText = (
          await runLlmTextCompletion(withTools, system, inbound, {
            maxToolRounds: budget.maxToolRoundsPerTurn,
            history,
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

  if (deps.swarmMemory) {
    deps.swarmMemory.appendDialogueTurn(peerDid, "user", inbound);
    deps.swarmMemory.appendDialogueTurn(peerDid, "assistant", replyText);
    maybeArchiveOutline(deps.swarmMemory, peerDid);
  }

  console.log(`[swarm-dm] replied to ${peerDid} id=${signed.id}`);
  return { replied: true };
}
