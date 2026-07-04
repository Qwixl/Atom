import { describe, expect, it } from "vitest";
import { createMemorySecretStore } from "./memorySecretStore.js";
import {
  DEFAULT_STRIPE_PAYMENT_REF,
  isPaymentConnectionReady,
  resolvePaymentSecret,
  upsertPaymentConnection,
} from "./paymentConnection.js";

describe("paymentConnection", () => {
  it("resolves stripe secret from SecretStore ref", () => {
    const store = createMemorySecretStore({ [DEFAULT_STRIPE_PAYMENT_REF]: "sk_test_abc" });
    const connection = upsertPaymentConnection({
      provider: "stripe",
      secretRef: DEFAULT_STRIPE_PAYMENT_REF,
      publishableKey: "pk_test_xyz",
    })[0]!;
    expect(resolvePaymentSecret(connection, store)).toBe("sk_test_abc");
    expect(isPaymentConnectionReady(connection, store)).toBe(true);
  });
});
