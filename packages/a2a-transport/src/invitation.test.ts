import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { createContactInvite, verifyContactInvite } from "./invitation.js";

describe("contact invitations (D026)", () => {
  it("mints and verifies a signed invitation token", async () => {
    const identity = await generateAgentKeyPair();
    const { token } = await createContactInvite({
      identity,
      endpoint: "http://127.0.0.1:5204/a2a/jsonrpc",
      name: "Alice's agent",
    });

    const invite = await verifyContactInvite(token);
    expect(invite.inviterDid).toBe(identity.did);
    expect(invite.endpoint).toBe("http://127.0.0.1:5204/a2a/jsonrpc");
    expect(invite.name).toBe("Alice's agent");
  });

  it("rejects expired invitations", async () => {
    const identity = await generateAgentKeyPair();
    const { token } = await createContactInvite({
      identity,
      endpoint: "http://127.0.0.1:5204/a2a/jsonrpc",
      ttlSeconds: -1,
    });
    await expect(verifyContactInvite(token)).rejects.toThrow();
  });

  it("rejects tampered tokens", async () => {
    const identity = await generateAgentKeyPair();
    const { object } = await createContactInvite({
      identity,
      endpoint: "http://127.0.0.1:5204/a2a/jsonrpc",
    });
    const tampered = {
      ...object,
      payload: { ...object.payload, endpoint: "http://evil.example/a2a" },
    };
    const token = Buffer.from(JSON.stringify(tampered), "utf8").toString("base64url");
    await expect(verifyContactInvite(token)).rejects.toThrow();
  });

  it("rejects garbage tokens", async () => {
    await expect(verifyContactInvite("not-a-token")).rejects.toThrow();
  });
});
