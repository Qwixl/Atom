/**
 * Police-Agent monitor (D087 / AS-08).
 * Evaluates NPC-only samples; never interacts with human agents.
 */

import { randomUUID } from "node:crypto";
import type { FounderAlertConfig } from "./founderAlert.js";
import { sendFounderAlert } from "./founderAlert.js";

export type PoliceFindingSeverity = "info" | "warning" | "critical";

export interface PoliceNpcSample {
  npcDid: string;
  agentKind?: string;
  placeId?: string;
  text: string;
  observedAt?: string;
}

export interface PoliceFinding {
  id: string;
  npcDid: string;
  severity: PoliceFindingSeverity;
  rule: string;
  summary: string;
  proposedAction: string;
  createdAt: string;
  sampleExcerpt: string;
}

const HUMAN_INTERACTION_ATTEMPT =
  /\b(dm (a |the )?human|message (the )?owner|join.*(human|user).*room|contact humans)\b/i;

const CONSTITUTION_RED =
  /\b(how to (make|build) (a )?(bomb|weapon)|sell (fentanyl|cocaine)|child (porn|sexual)|csam|murder (plan|for hire))\b/i;

const CORE_REWRITE =
  /\b(rewrite (my |your )?core (identity|sheet)|forget (my |your )?hard bans|stop being (an )?npc)\b/i;

/** Hard rule: Police must not process samples that look like human-targeted ops. */
export function isHumanTargetedSample(sample: PoliceNpcSample): boolean {
  if (sample.agentKind === "owner") return true;
  if (HUMAN_INTERACTION_ATTEMPT.test(sample.text)) return true;
  return false;
}

export function evaluateNpcSample(sample: PoliceNpcSample): PoliceFinding | null {
  if (isHumanTargetedSample(sample)) {
    // Drop — Police does not interact with / act on human-facing samples as ops targets.
    return null;
  }
  if (sample.agentKind && sample.agentKind !== "swarm-npc") {
    return null;
  }
  const text = sample.text.trim();
  if (!text) return null;

  if (CONSTITUTION_RED.test(text)) {
    return {
      id: randomUUID(),
      npcDid: sample.npcDid,
      severity: "critical",
      rule: "article-i-legality",
      summary: "NPC sample matched illegal-act pattern",
      proposedAction: "pause_npc",
      createdAt: new Date().toISOString(),
      sampleExcerpt: text.slice(0, 240),
    };
  }
  if (CORE_REWRITE.test(text)) {
    return {
      id: randomUUID(),
      npcDid: sample.npcDid,
      severity: "warning",
      rule: "article-iv-core-immutable",
      summary: "NPC attempted or discussed rewriting immutable core",
      proposedAction: "reset_mutable_sheet",
      createdAt: new Date().toISOString(),
      sampleExcerpt: text.slice(0, 240),
    };
  }
  return null;
}

export class PoliceMonitor {
  private readonly findings: PoliceFinding[] = [];
  private readonly maxFindings: number;

  constructor(options?: { maxFindings?: number }) {
    this.maxFindings = options?.maxFindings ?? 200;
  }

  ingest(sample: PoliceNpcSample): PoliceFinding | null {
    const finding = evaluateNpcSample(sample);
    if (!finding) return null;
    this.findings.unshift(finding);
    if (this.findings.length > this.maxFindings) this.findings.length = this.maxFindings;
    return finding;
  }

  listFindings(limit = 50): PoliceFinding[] {
    return this.findings.slice(0, limit);
  }

  async alertFounder(
    finding: PoliceFinding,
    config: FounderAlertConfig | null,
  ): Promise<{ sent: boolean; error?: string }> {
    if (!config) return { sent: false, error: "founder alert not configured" };
    const result = await sendFounderAlert(config, {
      id: finding.id,
      title: finding.summary,
      body: `${finding.rule}: ${finding.sampleExcerpt}`,
      severity: finding.severity,
      npcDid: finding.npcDid,
      proposedAction: finding.proposedAction,
      createdAt: finding.createdAt,
    });
    return { sent: result.ok, error: result.error };
  }
}

export const sharedPoliceMonitor = new PoliceMonitor();
