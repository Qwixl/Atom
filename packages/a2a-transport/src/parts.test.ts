import { describe, expect, it } from "vitest";
import { generateAgentKeyPair, signDataObject } from "@qwixl/protocol";
import {
  dataObjectToPart,
  parseWireFromPart,
  verifyPartDataObject,
} from "./parts.js";
import { ATOM_DATA_OBJECT_MEDIA_TYPE, COMMS_MESSAGE_PURPOSE } from "./constants.js";

describe("A2A data object parts", () => {
  it("round-trips through data parts", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "peer hello" },
        governance: { purpose: COMMS_MESSAGE_PURPOSE },
      },
      keyPair,
    );

    const part = dataObjectToPart(object);
    expect(part.kind).toBe("data");

    const wire = parseWireFromPart(part);
    expect(wire?.mediaType).toBe(ATOM_DATA_OBJECT_MEDIA_TYPE);

    const verified = await verifyPartDataObject(part, {
      allowedPurposes: [COMMS_MESSAGE_PURPOSE],
    });
    expect(verified?.payload.text).toBe("peer hello");
  });
});
