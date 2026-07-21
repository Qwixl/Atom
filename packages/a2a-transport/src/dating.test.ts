import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  DATING_INTRO_PURPOSE,
  DATING_INTRO_RESPONSE_PURPOSE,
} from "./constants.js";
import {
  createDatingIntro,
  createDatingIntroResponse,
  verifyDatingIntro,
  verifyDatingIntroResponse,
} from "./dating.js";

describe("dating intro objects", () => {
  it("round-trips intro and response", async () => {
    const identity = await generateAgentKeyPair();
    const intro = await createDatingIntro({
      identity,
      payload: {
        displayName: "Alex",
        oneLiner: "Coffee and long walks",
        interests: ["coffee", "walks"],
      },
    });
    expect(intro.governance.purpose).toBe(DATING_INTRO_PURPOSE);
    const verified = await verifyDatingIntro(intro);
    expect(verified.payload.displayName).toBe("Alex");

    const response = await createDatingIntroResponse({
      identity,
      payload: { introId: intro.id, response: "accept" },
    });
    expect(response.governance.purpose).toBe(DATING_INTRO_RESPONSE_PURPOSE);
    const verifiedResponse = await verifyDatingIntroResponse(response);
    expect(verifiedResponse.payload.response).toBe("accept");
    expect(verifiedResponse.payload.introId).toBe(intro.id);
  });
});
