import { describe, expect, it } from "vitest";
import { generateAgentKeyPair, type AgentKeyPair } from "@qwixl/protocol";
import {
  mintAtomTransportToken,
  normalizeTransportAudience,
  verifyAtomTransportToken,
} from "./transportAuth.js";

describe("Atom DID Bearer transport tokens", () => {
  it("mints and verifies a token for a peer audience", async () => {
    const identity = (await generateAgentKeyPair()) as AgentKeyPair;
    const audience = "https://peer.example:8443";
    const token = await mintAtomTransportToken({ identity, audience });
    const verified = await verifyAtomTransportToken({ token, audience: audience + "/" });
    expect(verified.did).toBe(identity.did);
  });

  it("rejects expired, wrong-audience, and tampered tokens", async () => {
    const identity = (await generateAgentKeyPair()) as AgentKeyPair;
    const audience = "https://peer.example";
    const expired = await mintAtomTransportToken({
      identity,
      audience,
      now: new Date(Date.now() - 10 * 60 * 1000),
      ttlMs: 60_000,
    });
    await expect(verifyAtomTransportToken({ token: expired, audience })).rejects.toThrow(/expired/);

    const token = await mintAtomTransportToken({ identity, audience });
    await expect(
      verifyAtomTransportToken({ token, audience: "https://other.example" }),
    ).rejects.toThrow(/audience/);

    const [prefix, body, sig] = token.split(".");
    const flipped = Buffer.from(sig!, "base64url");
    flipped[0] = flipped[0]! ^ 0xff;
    const tampered = `${prefix}.${body}.${Buffer.from(flipped).toString("base64url")}`;
    await expect(verifyAtomTransportToken({ token: tampered, audience })).rejects.toThrow();
  });

  it("normalises audiences to origin (ignores path)", () => {
    expect(normalizeTransportAudience("https://a.example/a2a/")).toBe("https://a.example");
    expect(normalizeTransportAudience("https://a.example:8443/inbox")).toBe(
      "https://a.example:8443",
    );
  });
});
