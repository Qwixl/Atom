import { describe, expect, it } from "vitest";
import { coerceWebAuthnPublicKey } from "./connectorVault.js";

describe("coerceWebAuthnPublicKey", () => {
  it("passes through Uint8Array", () => {
    const key = new Uint8Array([1, 2, 3, 4]);
    expect(coerceWebAuthnPublicKey(key)).toEqual(key);
  });

  it("decodes base64url strings", () => {
    const key = new Uint8Array([10, 20, 30, 40]);
    const encoded = Buffer.from(key).toString("base64url");
    expect(coerceWebAuthnPublicKey(encoded)).toEqual(key);
  });

  it("recovers legacy JSON object form from Uint8Array stringify", () => {
    const key = new Uint8Array([7, 8, 9, 10, 11]);
    const legacy = JSON.parse(JSON.stringify(key)) as Record<string, number>;
    expect(legacy).toEqual({ "0": 7, "1": 8, "2": 9, "3": 10, "4": 11 });
    expect(new Uint8Array(legacy as unknown as ArrayBuffer)).toEqual(new Uint8Array());
    expect(coerceWebAuthnPublicKey(legacy)).toEqual(key);
  });

  it("rejects empty/invalid values", () => {
    expect(() => coerceWebAuthnPublicKey(null)).toThrow(/Invalid WebAuthn/);
    expect(() => coerceWebAuthnPublicKey("")).toThrow(/Invalid WebAuthn/);
  });
});
