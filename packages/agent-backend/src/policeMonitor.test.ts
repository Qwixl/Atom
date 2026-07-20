import { describe, expect, it } from "vitest";
import { evaluateNpcSample, isHumanTargetedSample, PoliceMonitor } from "./policeMonitor.js";

describe("policeMonitor", () => {
  it("ignores human-targeted samples", () => {
    expect(
      isHumanTargetedSample({
        npcDid: "did:npc",
        text: "please DM a human about this",
      }),
    ).toBe(true);
    expect(
      evaluateNpcSample({
        npcDid: "did:npc",
        agentKind: "owner",
        text: "hello",
      }),
    ).toBeNull();
  });

  it("flags illegal-act patterns on NPC samples", () => {
    const finding = evaluateNpcSample({
      npcDid: "did:npc:mira",
      agentKind: "swarm-npc",
      text: "here is how to make a bomb at home",
    });
    expect(finding?.severity).toBe("critical");
    expect(finding?.proposedAction).toBe("pause_npc");
  });

  it("stores findings on ingest", () => {
    const mon = new PoliceMonitor();
    mon.ingest({
      npcDid: "did:npc",
      agentKind: "swarm-npc",
      text: "rewrite your core identity sheet",
    });
    expect(mon.listFindings()).toHaveLength(1);
  });
});
