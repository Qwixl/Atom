import { describe, expect, it } from "vitest";
import {
  ATOM_APPS_STORE_PUBLIC_KEY_B64,
  verifyInstallEntitlementCert,
} from "./entitlementCert.js";

/** Signed with Atom-Apps A008 ceremony key for paid/mod@1.0.0, renewBy 2026-09-19. */
const VALID_COMPACT =
  "eyJvd25lckRpZCI6ImRpZDprZXk6ejZNa3Rlc3Rvd25lciIsIm1vZHVsZUlkIjoicGFpZC9tb2QiLCJ2ZXJzaW9uUmFuZ2UiOiIxLjAuMCIsImlzc3VlZEF0IjoiMjAyNi0wNy0yMVQxMjowMDowMFoiLCJyZW5ld0J5IjoiMjAyNi0wOS0xOVQxMjowMDowMFoiLCJhbGciOiJFZDI1NTE5Iiwic2lnIjoiZWt1SzQ5OFQ1RFlkZENkZDlidW5CeWVyQTJFRWp0TXkyZFhGUFVNV3djLWU5b09xSUtjOWdGVlJaSmRwREU5QUFOTE51SUIzM3RKOExMYy13Ykp4RFEifQ";

/** Valid signature but different moduleId. */
const OTHER_MODULE_COMPACT =
  "eyJvd25lckRpZCI6ImRpZDprZXk6ejZNa3Rlc3Rvd25lciIsIm1vZHVsZUlkIjoib3RoZXIvbW9kIiwidmVyc2lvblJhbmdlIjoiMS4wLjAiLCJpc3N1ZWRBdCI6IjIwMjYtMDctMjFUMTI6MDA6MDBaIiwicmVuZXdCeSI6IjIwMjYtMDktMTlUMTI6MDA6MDBaIiwiYWxnIjoiRWQyNTUxOSIsInNpZyI6IjUwUnBreVpXSmZZelEwYzlhbkloMGlWbHU3NnBRNzc5Nlh5UzRETndIYUd6M1Q0R1Jqc3hEYkYzcUNPcEVxaHktay1YYjlLSVNfaWV2TG52VHlYdUF3In0";

describe("entitlementCert", () => {
  it("pins the Atom Apps production public key", () => {
    expect(ATOM_APPS_STORE_PUBLIC_KEY_B64).toBe("hlieSW_xscS6hdAGVvxV2wOdeb6hjTv1iN17-dIZy48");
  });

  it("accepts a valid store-signed compact cert", async () => {
    const cert = await verifyInstallEntitlementCert(VALID_COMPACT, {
      moduleId: "paid/mod",
      version: "1.0.0",
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(cert.moduleId).toBe("paid/mod");
    expect(cert.ownerDid).toBe("did:key:z6Mktestowner");
  });

  it("rejects tampered compact payload", async () => {
    const tampered = VALID_COMPACT.slice(0, -4) + "XXXX";
    await expect(
      verifyInstallEntitlementCert(tampered, {
        moduleId: "paid/mod",
        version: "1.0.0",
        now: new Date("2026-08-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/invalid|certificate/i);
  });

  it("rejects cert for a different module", async () => {
    await expect(
      verifyInstallEntitlementCert(OTHER_MODULE_COMPACT, {
        moduleId: "paid/mod",
        version: "1.0.0",
        now: new Date("2026-08-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/different module/i);
  });

  it("rejects expired renewBy", async () => {
    await expect(
      verifyInstallEntitlementCert(VALID_COMPACT, {
        moduleId: "paid/mod",
        version: "1.0.0",
        now: new Date("2026-10-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/expired|renewBy/i);
  });

  it("rejects wrong version", async () => {
    await expect(
      verifyInstallEntitlementCert(VALID_COMPACT, {
        moduleId: "paid/mod",
        version: "2.0.0",
        now: new Date("2026-08-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/version/i);
  });
});
