import { describe, expect, it } from "vitest";
import {
  parseSwarmAgentKind,
  swarmBadgeLabel,
  swarmNpcPromptAddendum,
} from "./swarmPrompt.js";

describe("swarmPrompt", () => {
  it("parses agent kinds", () => {
    expect(parseSwarmAgentKind("swarm-npc")).toBe("swarm-npc");
    expect(parseSwarmAgentKind("police")).toBe("swarm-police");
    expect(parseSwarmAgentKind(undefined)).toBe("owner");
  });

  it("NPC addendum covers abuse ignore and greeter cap", () => {
    const text = swarmNpcPromptAddendum("swarm-npc");
    expect(text).toContain("Atom Constitution");
    expect(text).toContain("ignore abusive");
    expect(text).toContain("1–3");
    expect(text).toContain("Never claim to be a human");
  });

  it("Police addendum forbids human interaction", () => {
    const text = swarmNpcPromptAddendum("swarm-police");
    expect(text).toContain("Never DM");
    expect(text).toContain("human agents");
  });

  it("badge labels", () => {
    expect(swarmBadgeLabel("swarm-npc")).toBe("Qwixl NPC");
    expect(swarmBadgeLabel("owner")).toBeNull();
  });
});
