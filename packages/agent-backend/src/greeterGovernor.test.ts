import { describe, expect, it } from "vitest";
import { GreeterGovernor } from "./greeterGovernor.js";

describe("GreeterGovernor", () => {
  it("allows at most three greeters per place entry", () => {
    const gov = new GreeterGovernor({ cap: 3 });
    gov.noteHumanEntered("coffee-shop", "did:human");
    expect(gov.tryClaimGreeter("coffee-shop", "did:human", "npc-1").allowed).toBe(true);
    expect(gov.tryClaimGreeter("coffee-shop", "did:human", "npc-2").allowed).toBe(true);
    expect(gov.tryClaimGreeter("coffee-shop", "did:human", "npc-3").allowed).toBe(true);
    const fourth = gov.tryClaimGreeter("coffee-shop", "did:human", "npc-4");
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toBe("cap_reached");
  });

  it("rejects double-greet from the same NPC", () => {
    const gov = new GreeterGovernor();
    gov.noteHumanEntered("gym", "did:human");
    expect(gov.tryClaimGreeter("gym", "did:human", "npc-1").allowed).toBe(true);
    expect(gov.tryClaimGreeter("gym", "did:human", "npc-1").reason).toBe("already_greeted");
  });
});
