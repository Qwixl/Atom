/**
 * Generative Agents–style observe → retrieve → reflect → clamp-write (AS-05).
 * Runs on swarm-npc brain ticks when memory is loaded.
 */

import { randomUUID } from "node:crypto";
import type { SwarmMemoryStore } from "./swarmMemoryStore.js";

export interface SwarmReflectResult {
  reflectionId: string;
  reflectionText: string;
  retrievedCount: number;
  mood?: string;
}

/**
 * Synthesize a reflection from recent important memories and apply a tiny mood clamp.
 * LLM-backed reflection can replace the template body later; structure stays the same.
 */
export function runSwarmReflectPass(
  memory: SwarmMemoryStore,
  focusQuery = "today plans relationships places",
): SwarmReflectResult | null {
  const hits = memory.retrieve(focusQuery, 8);
  if (hits.length === 0) return null;

  const lines = hits.map((h) => `- (${h.kind}, i=${h.importance.toFixed(2)}) ${h.text}`);
  const reflectionText = [
    "Reflection:",
    ...lines,
    "I will stay within my core values, greet sparingly in groups, and ignore abusive content while answering intent.",
  ].join("\n");

  const reflectionId = `reflect-${randomUUID()}`;
  memory.appendMemory({
    id: reflectionId,
    kind: "reflection",
    text: reflectionText,
    importance: 0.75,
  });

  const mutable = memory.getMutableSheet();
  const mood =
    hits.some((h) => /greet|welcome|friend/i.test(h.text)) ? "sociable" : mutable.mood;
  memory.applyMutableUpdate({ mood });

  return {
    reflectionId,
    reflectionText,
    retrievedCount: hits.length,
    mood,
  };
}

/** Append a plan memory for the next interval (hierarchical planning stub). */
export function runSwarmPlanPass(
  memory: SwarmMemoryStore,
  placeId: string,
  summary: string,
): string {
  const id = `plan-${randomUUID()}`;
  memory.appendMemory({
    id,
    kind: "plan",
    text: `Plan @ ${placeId}: ${summary}`,
    importance: 0.55,
    placeId,
  });
  return id;
}
