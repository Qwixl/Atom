/**
 * NPC↔NPC autonomous conversation openers (D091).
 */

import {
  COMMS_MESSAGE_PURPOSE,
  COMMS_MESSAGE_SCHEMA,
} from "@qwixl/a2a-transport";
import { signDataObject, type AgentKeyPair } from "@qwixl/protocol";
import { swarmSystemPromptAddendum } from "@qwixl/agent-llm";
import type { AtomToolExecutor } from "@qwixl/agent-llm";
import { deliverSignedObject } from "./deliverObject.js";
import { connectMlsPeer } from "./mlsReconnect.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import {
  findSwarmCommunityMember,
  loadSwarmCommunityRoster,
  resolveCommunityMemberPublicUrl,
  type SwarmCommunityMember,
} from "./swarmCommunity.js";
import type { SwarmMemoryStore } from "./swarmMemoryStore.js";
import {
  formatSocialTurnBudget,
  SOCIAL_MAX_MESSAGES,
  SwarmSocialDialogueStore,
} from "./swarmSocialDialogue.js";
import type { SwarmSocialDeps } from "./swarmSocialTools.js";
import { sharedSwarmToolBudget } from "./swarmToolBudget.js";
import { buildSwarmPromptContext } from "./swarmTurnContext.js";
import {
  loadLlmAgUiConfigFromEnv,
  runLlmTextCompletion,
  type LlmAgUiConfig,
} from "./agUi/llmRunner.js";

export interface SwarmSocialAutonomyDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
  publicBaseUrl: string;
  swarmMemory?: SwarmMemoryStore | null;
  swarmSeedId?: string;
  swarmSocial?: SwarmSocialDeps | null;
  socialStore: SwarmSocialDialogueStore;
  connectorExecutor?: AtomToolExecutor;
  llmConfig?: LlmAgUiConfig | null;
  complete?: (system: string, user: string) => Promise<string>;
}

export function peerLooksLikeCommunityNpc(
  peerRecords: MlsPeerRecordStore,
  peerDid: string,
): boolean {
  const peerUrl = peerRecords.list().find((p) => p.peerDid === peerDid)?.peerUrl?.trim();
  if (!peerUrl) return false;
  for (const member of loadSwarmCommunityRoster()) {
    if (member.portHint == null) continue;
    if (peerUrl.includes(`:${member.portHint}`) || peerUrl.includes(`.${member.portHint}.`)) {
      return true;
    }
    const pub = resolveCommunityMemberPublicUrl(member);
    if (pub && peerUrl.replace(/\/a2a\/jsonrpc\/?$/i, "").startsWith(pub)) {
      return true;
    }
  }
  return false;
}

async function resolveFriendEndpoint(
  deps: SwarmSocialAutonomyDeps,
  friend: string,
): Promise<{ peerDid: string; peerUrl: string; member: SwarmCommunityMember } | { error: string }> {
  const member = findSwarmCommunityMember(friend);
  if (!member) return { error: `unknown community friend "${friend}"` };
  if (deps.swarmSeedId && member.id === deps.swarmSeedId) {
    return { error: "cannot open a conversation with yourself" };
  }
  const publicUrl = resolveCommunityMemberPublicUrl(member);
  if (!publicUrl) return { error: `cannot resolve URL for ${member.displayName}` };
  const peerUrl = `${publicUrl}/a2a/jsonrpc`;

  let peerDid = deps.peerRecords.list().find((p) => {
    const u = p.peerUrl ?? "";
    return u.includes(`:${member.portHint}`) || u.includes(publicUrl);
  })?.peerDid;

  if (!peerDid) {
    try {
      const health = (await fetch(`${publicUrl}/health`).then((r) => r.json())) as {
        did?: string;
      };
      if (!health.did) return { error: `${member.displayName} health missing did` };
      peerDid = health.did;
      deps.peerRecords.remember(peerDid, peerUrl);
    } catch (error) {
      return {
        error: `could not reach ${member.displayName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  if (!deps.mlsStore.hasSession(peerDid)) {
    try {
      await connectMlsPeer({
        mlsStore: deps.mlsStore,
        peerRecords: deps.peerRecords,
        localDid: deps.identity.did,
        peerDid,
        peerUrl,
        initiatorEndpoint: `${deps.publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
      });
    } catch (error) {
      return {
        error: `MLS connect failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { peerDid, peerUrl, member };
}

async function generateOpener(
  deps: SwarmSocialAutonomyDeps,
  peerDid: string,
  friendName: string,
): Promise<string> {
  const context = buildSwarmPromptContext(deps.swarmMemory, {
    query: `catch up with ${friendName}`,
    peerDid,
    selfSeedId: deps.swarmSeedId,
  });
  const system = `${swarmSystemPromptAddendum("swarm-npc")}

${context}

${formatSocialTurnBudget(1)}

## Neighbour opener

Start a short natural conversation with **${friendName}** (another NPC neighbour).
Plain text only. 1–2 sentences. No games, no ASCII boards, no tools required.`;

  if (deps.complete) {
    return (await deps.complete(system, `Say hi to ${friendName} and start a light chat.`)).trim();
  }
  const llmConfig =
    deps.llmConfig !== undefined ? deps.llmConfig : loadLlmAgUiConfigFromEnv();
  if (!llmConfig) {
    throw new Error("LLM_API_KEY not configured");
  }
  const budget = sharedSwarmToolBudget();
  const withTools: LlmAgUiConfig = {
    ...llmConfig,
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
  return (
    await runLlmTextCompletion(
      withTools,
      system,
      `Say hi to ${friendName} and start a light chat.`,
      { maxToolRounds: budget.maxToolRoundsPerTurn },
    )
  ).trim();
}

/**
 * Start an autonomous NPC↔NPC DM (initiator). Respects kill switch + caps.
 */
export async function openSwarmSocialDialogue(
  deps: SwarmSocialAutonomyDeps,
  friend: string,
): Promise<
  | { ok: true; peerDid: string; friend: string; opener: string }
  | { ok: false; reason: string }
> {
  if (process.env.ATOM_KILL_SWITCH === "1" || process.env.ATOM_KILL_SWITCH === "true") {
    return { ok: false, reason: "kill_switch" };
  }
  const resolved = await resolveFriendEndpoint(deps, friend);
  if ("error" in resolved) return { ok: false, reason: resolved.error };

  const gate = deps.socialStore.canStartOpener(resolved.peerDid);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  let opener: string;
  try {
    opener = await generateOpener(deps, resolved.peerDid, resolved.member.displayName);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (!opener) return { ok: false, reason: "empty_opener" };

  deps.socialStore.startDialogue(resolved.peerDid, "initiator", {
    peerLabel: resolved.member.displayName,
    sentByUs: 0,
    sentByThem: 0,
  });

  const signed = await signDataObject(
    {
      semantic: { schema: COMMS_MESSAGE_SCHEMA },
      payload: { text: opener },
      governance: { purpose: COMMS_MESSAGE_PURPOSE },
    },
    deps.identity,
  );

  await deliverSignedObject({
    mlsStore: deps.mlsStore,
    peerUrl: resolved.peerUrl,
    peerDid: resolved.peerDid,
    object: signed,
    encrypt: true,
  });

  deps.socialStore.noteOutbound(resolved.peerDid);
  if (deps.swarmMemory) {
    deps.swarmMemory.appendDialogueTurn(resolved.peerDid, "assistant", opener);
  }

  console.log(
    `[swarm-social] opened dialogue with ${resolved.member.displayName} (${resolved.peerDid}) max=${SOCIAL_MAX_MESSAGES}`,
  );
  return {
    ok: true,
    peerDid: resolved.peerDid,
    friend: resolved.member.displayName,
    opener,
  };
}

/** Pick a random community friend (excluding self) for host-driven ticks. */
export function pickRandomCommunityFriend(selfSeedId?: string): SwarmCommunityMember | null {
  const roster = loadSwarmCommunityRoster().filter((m) => m.id !== selfSeedId);
  if (roster.length === 0) return null;
  return roster[Math.floor(Math.random() * roster.length)] ?? null;
}
