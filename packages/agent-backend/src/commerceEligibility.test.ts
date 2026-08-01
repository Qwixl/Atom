import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  encodeUrlsafeB64,
  signCommerceEntitlementCert,
} from "./commerceEntitlementCert.js";
import {
  assertHostedBusinessCommerceEligible,
  isHostedBusinessCommerceEligible,
} from "./commerceEligibility.js";

async function signedBusinessEnv(extra: Record<string, string> = {}) {
  const kp = await generateAgentKeyPair();
  const issuedAt = new Date().toISOString();
  const renewBy = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const compact = await signCommerceEntitlementCert(
    {
      workspaceKind: "business",
      commerceEligible: true,
      hosted: true,
      issuedAt,
      renewBy,
      accountId: "acct_test",
    },
    kp.privateKey,
  );
  return {
    env: {
      ATOM_COMMERCE_ENTITLEMENT: compact,
      ATOM_COMMERCE_MC_PUBLIC_KEY_B64: encodeUrlsafeB64(kp.publicKey),
      ...extra,
    } as NodeJS.ProcessEnv,
    kp,
  };
}

describe("commerceEligibility (BUS-01-ELIG-01)", () => {
  it("rejects env businessMode alone", async () => {
    expect(
      await isHostedBusinessCommerceEligible({
        ATOM_BUSINESS_MODE: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("rejects env triad without signed entitlement", async () => {
    expect(
      await isHostedBusinessCommerceEligible({
        ATOM_COMMERCE_ELIGIBLE: "1",
        ATOM_WORKSPACE_KIND: "business",
        ATOM_HOSTED: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("accepts valid MC-signed commerce entitlement", async () => {
    const { env } = await signedBusinessEnv();
    expect(await isHostedBusinessCommerceEligible(env)).toBe(true);
    await expect(assertHostedBusinessCommerceEligible(env)).resolves.toBeUndefined();
  });

  it("rejects forged compact with wrong signature", async () => {
    const { env } = await signedBusinessEnv();
    const other = await generateAgentKeyPair();
    env.ATOM_COMMERCE_MC_PUBLIC_KEY_B64 = encodeUrlsafeB64(other.publicKey);
    expect(await isHostedBusinessCommerceEligible(env)).toBe(false);
  });
});
