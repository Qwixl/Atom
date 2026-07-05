import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, generateMasterKey } from "./vaultCrypto.js";

describe("vaultCrypto", () => {
  it("round-trips encrypted JSON", () => {
    const key = generateMasterKey();
    const blob = encryptJson(key, { token: "secret", count: 2 });
    expect(decryptJson<{ token: string; count: number }>(key, blob)).toEqual({
      token: "secret",
      count: 2,
    });
  });
});
