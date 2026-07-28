import { describe, expect, it } from "vitest";
import { generateAgentKeyPair, type AgentKeyPair } from "@qwixl/protocol";
import { buildAtomAgentCard } from "./agentCard.js";
import {
  advertisedAgentDid,
  signAtomAgentCard,
  verifyAtomAgentCard,
} from "./cardSignature.js";

async function identity(): Promise<AgentKeyPair> {
  return (await generateAgentKeyPair()) as AgentKeyPair;
}

function card(publisherDid: string) {
  return buildAtomAgentCard({
    name: "Signed agent",
    description: "An agent with a signed card",
    baseUrl: "https://agent.example",
    publisherDid,
    business: { verificationTier: 2, businessDomain: "agent.example", tierLabel: "Verified" },
  });
}

describe("agent card signatures", () => {
  it("signs with the agent did:key and verifies without a key server", async () => {
    const agent = await identity();
    const signed = await signAtomAgentCard(card(agent.did), agent);

    expect(signed.signatures.length).toBe(1);
    await expect(verifyAtomAgentCard(signed)).resolves.toBe(agent.did);
    expect(advertisedAgentDid(signed)).toBe(agent.did);
  });

  it("rejects a card whose contents changed after signing", async () => {
    const agent = await identity();
    const signed = await signAtomAgentCard(card(agent.did), agent);

    signed.description = "Something else entirely";

    await expect(verifyAtomAgentCard(signed)).rejects.toThrow();
  });

  it("rejects a card claiming a DID it cannot sign for", async () => {
    const impostor = await identity();
    const victim = await identity();

    // The impostor publishes a card advertising the victim's DID and signs it
    // with its own key: the claim and the signature disagree, which is the case
    // an unsigned card could not distinguish.
    const forged = await signAtomAgentCard(card(victim.did), impostor);

    await expect(verifyAtomAgentCard(forged)).resolves.toBe(impostor.did);
    expect(advertisedAgentDid(forged)).toBe(victim.did);
    expect(await verifyAtomAgentCard(forged)).not.toBe(advertisedAgentDid(forged));
  });

  it("refuses an unsigned card", async () => {
    const agent = await identity();
    await expect(verifyAtomAgentCard(card(agent.did))).rejects.toThrow(/not signed/);
  });

  it("keeps empty containers so the SDK's v0.3 card translator does not throw", async () => {
    const agent = await identity();
    const signed = await signAtomAgentCard(card(agent.did), agent);

    // Protobuf JSON omits empty arrays/objects; without them the legacy
    // well-known handler crashes (production: 500 "Failed to retrieve agent card").
    expect(signed.securitySchemes).toEqual({});
    expect(signed.securityRequirements).toEqual([]);
    expect(signed.signatures.length).toBe(1);
    for (const skill of signed.skills) {
      expect(Array.isArray(skill.examples)).toBe(true);
      expect(Array.isArray(skill.inputModes)).toBe(true);
      expect(Array.isArray(skill.outputModes)).toBe(true);
      expect(Array.isArray(skill.securityRequirements)).toBe(true);
    }
    await expect(verifyAtomAgentCard(signed)).resolves.toBe(agent.did);
  });
});
