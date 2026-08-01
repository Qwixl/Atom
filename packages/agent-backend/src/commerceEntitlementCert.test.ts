import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  encodeUrlsafeB64,
  signCommerceEntitlementCert,
  verifyCommerceEntitlementCert,
} from "./commerceEntitlementCert.js";

describe("commerceEntitlementCert", () => {
  it("round-trips sign and verify", async () => {
    const kp = await generateAgentKeyPair();
    const issuedAt = new Date().toISOString();
    const renewBy = new Date(Date.now() + 86400_000).toISOString();
    const compact = await signCommerceEntitlementCert(
      {
        workspaceKind: "business",
        commerceEligible: true,
        hosted: true,
        issuedAt,
        renewBy,
      },
      kp.privateKey,
    );
    const cert = await verifyCommerceEntitlementCert(compact, {
      publicKeyB64: encodeUrlsafeB64(kp.publicKey),
    });
    expect(cert.workspaceKind).toBe("business");
    expect(cert.commerceEligible).toBe(true);
  });
});
