/**
 * Per-turn swarm NPC prompt context: character + community + selective memory retrieve (D089).
 */

import { randomUUID } from "node:crypto";
import type {
  SwarmMemoryKind,
  SwarmMemoryStore,
} from "./swarmMemoryStore.js";
import { formatSwarmCommunityBlock } from "./swarmCommunity.js";
import { formatVagueRecallBlock } from "./swarmRecall.js";
import { SWARM_MEMORY_REMEMBER_TOOL } from "./swarmToolBudget.js";

export interface SwarmTurnContextOptions {
  query: string;
  peerDid?: string;
  /** Seed id e.g. mira-barista — used to omit self from community roster. */
  selfSeedId?: string;
  retrieveLimit?: number;
  /**
   * When true, inject held-back conversation outlines for this peer (vague recall).
   * Summaries are otherwise excluded from normal retrieve (D090).
   */
  vagueRecall?: boolean;
  /** Preformatted vague-recall markdown block (optional override). */
  vagueRecallBlock?: string;
}

export interface SwarmMemoryRememberArgs {
  text: string;
  importance: number;
  kind: SwarmMemoryKind;
  counterpartDid?: string;
  impression?: string;
}

export const MEMORY_REMEMBER_CHAT_TOOL = {
  type: "function" as const,
  function: {
    name: SWARM_MEMORY_REMEMBER_TOOL,
    description:
      "Choose to keep something important from this interaction in your long-term memory. " +
      "Use sparingly for facts, feelings, commitments, or impressions that will matter later. " +
      "Do not store chit-chat or one-off trivia. Never rewrite your core identity.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Short memory text to keep (1–2 sentences).",
        },
        importance: {
          type: "number",
          description: "How important this is from 0 to 1.",
        },
        kind: {
          type: "string",
          enum: ["observation", "dialogue", "reflection"],
          description: "Memory kind.",
        },
        counterpartDid: {
          type: "string",
          description: "Optional DID of the person this memory is about.",
        },
        impression: {
          type: "string",
          description: "Optional one-line updated impression of that counterpart (max ~280 chars).",
        },
      },
      required: ["text", "importance"],
      additionalProperties: false,
    },
  },
};

export function parseSwarmMemoryRememberArgs(argsJson: string): SwarmMemoryRememberArgs | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(argsJson) as unknown;
  } catch {
    return { error: "invalid JSON arguments" };
  }
  if (!raw || typeof raw !== "object") return { error: "arguments must be an object" };
  const obj = raw as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) return { error: "text is required" };
  const importanceRaw = typeof obj.importance === "number" ? obj.importance : Number(obj.importance);
  const importance = Number.isFinite(importanceRaw)
    ? Math.max(0, Math.min(1, importanceRaw))
    : 0.5;
  const kindRaw = typeof obj.kind === "string" ? obj.kind.trim() : "observation";
  const kind: SwarmMemoryKind =
    kindRaw === "dialogue" || kindRaw === "reflection" || kindRaw === "observation"
      ? kindRaw
      : "observation";
  const counterpartDid =
    typeof obj.counterpartDid === "string" && obj.counterpartDid.trim()
      ? obj.counterpartDid.trim()
      : undefined;
  const impression =
    typeof obj.impression === "string" && obj.impression.trim()
      ? obj.impression.trim().slice(0, 280)
      : undefined;
  return { text: text.slice(0, 2000), importance, kind, counterpartDid, impression };
}

export function applySwarmMemoryRemember(
  memory: SwarmMemoryStore,
  args: SwarmMemoryRememberArgs,
  fallbackPeerDid?: string,
): { ok: true; id: string } {
  const counterpartDid = args.counterpartDid ?? fallbackPeerDid;
  const id = `mem-${randomUUID()}`;
  memory.appendMemory({
    id,
    kind: args.kind,
    text: args.text,
    importance: args.importance,
    counterpartDid,
  });
  if (counterpartDid && args.impression) {
    memory.setImpression(counterpartDid, args.impression);
  }
  return { ok: true, id };
}

/** Assemble character / mood / memories / community for the system prompt. */
export function buildSwarmPromptContext(
  memory: SwarmMemoryStore | null | undefined,
  options: SwarmTurnContextOptions,
): string {
  const parts: string[] = [];
  const core = memory?.getCoreSheet() ?? null;
  const mutable = memory?.getMutableSheet() ?? null;

  if (core) {
    parts.push(`## Your character

You are **${core.name}** — ${core.role}.
Reason for being: ${core.reasonForBeing}
Voice: ${core.voice}
Values: ${core.values.join(", ") || "(none listed)"}
Hard bans: ${core.hardBans.join(", ") || "(none listed)"}
Stay in this character. Do not describe yourself as a generic swarm chatbot or interchangeable agent.`);
  } else {
    parts.push(`## Your character

Stay in your assigned NPC role. Do not describe yourself as a generic swarm chatbot.`);
  }

  if (mutable) {
    const goals = mutable.shortGoals?.filter((g) => g.trim()).join("; ") || "(none)";
    parts.push(`## Current mood and goals

Mood: ${mutable.mood || "steady"}
Short goals: ${goals}`);
  }

  parts.push(formatSwarmCommunityBlock(options.selfSeedId));

  if (memory) {
    const hits = memory.retrieve(options.query, options.retrieveLimit ?? 8);
    if (hits.length > 0) {
      const lines = hits.map(
        (h, i) =>
          `${i + 1}. [${h.kind} · importance ${h.importance.toFixed(2)}] ${h.text}`,
      );
      parts.push(`## Retrieved memories

These are memories you previously chose to keep. Use them when relevant; do not invent others.
${lines.join("\n")}`);
    } else {
      parts.push(`## Retrieved memories

(No strongly matching memories yet. Use \`${SWARM_MEMORY_REMEMBER_TOOL}\` only if something in this turn should last.)`);
    }

    if (options.peerDid) {
      const impression = memory.getImpression(options.peerDid);
      parts.push(
        impression
          ? `## Impression of this peer\n\n${impression}`
          : `## Impression of this peer\n\n(None stored yet. You may set one via \`${SWARM_MEMORY_REMEMBER_TOOL}\` with an impression field when appropriate.)`,
      );
    }

    if (options.vagueRecallBlock) {
      parts.push(options.vagueRecallBlock);
    } else if (options.vagueRecall && options.peerDid) {
      const summaries = memory.retrieveSummaries(options.peerDid, options.query, 6);
      parts.push(formatVagueRecallBlock(summaries.map((s) => s.text)));
    }
  }

  parts.push(`## Memory and search tools

- \`${SWARM_MEMORY_REMEMBER_TOOL}\`: choose what to keep in **long-term** memory. Prefer lasting facts, feelings, commitments, and peer impressions. Skip small talk.
- Recent turns in this DM are already in your short-term conversation context — you do not need to remember every line.
- Conversation outlines are held back until someone asks if you remember; then you get vague recall only.
- \`invite_friend_to_room\`: invite a named community friend into an open room (Coffee Shop or a new hangout) — not into a private 1:1 DM.
- \`challenge_friend_to_game\`: start tic-tac-toe with a contact or community friend over Messages.
- \`news_search\` / \`page_read\`: use when you lack facts needed for a good answer. Do not search every turn. If rate-limited or the tool fails, say so briefly — never invent search results.
- Never rewrite your core identity via tools.`);

  return parts.join("\n\n");
}
