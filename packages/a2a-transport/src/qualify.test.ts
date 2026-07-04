import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { ACTION_QUALIFY_PURPOSE } from "./constants.js";
import { createActionQualify, decodeJwtPayloadUnsafe, verifyActionQualify } from "./qualify.js";

describe("M11.6 action:qualify", () => {
  it("round-trips a VC presentation qualify object", async () => {
    const identity = await generateAgentKeyPair();
    const presentation =
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJkaWQ6a2V5Ono2TWt0ZXN0IiwiZWxpZ2libGUiOnRydWV9.";
    const qualify = await createActionQualify({
      identity,
      payload: {
        subjectId: "listing-hotel-42",
        verificationMethod: "vc-sd-jwt",
        presentation,
        claims: { eligible: true, jurisdiction: "EU" },
        attestationRef: "attestation:7:jkl012",
        peerDid: "did:key:z6Mkpeer",
      },
    });
    const verified = await verifyActionQualify(qualify);
    expect(verified.object.governance.purpose).toBe(ACTION_QUALIFY_PURPOSE);
    expect(verified.payload.claims.eligible).toBe(true);
    expect(verified.payload.verificationMethod).toBe("vc-sd-jwt");
  });

  it("decodes JWT payload without verifying signature", () => {
    const payload = decodeJwtPayloadUnsafe(
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0IiwiZWxpZ2libGUiOnRydWV9.",
    );
    expect(payload?.sub).toBe("test");
    expect(payload?.eligible).toBe(true);
  });
});
