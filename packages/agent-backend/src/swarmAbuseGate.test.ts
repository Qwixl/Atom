import { describe, expect, it } from "vitest";
import { evaluateInboundForNpc } from "./swarmAbuseGate.js";

describe("evaluateInboundForNpc", () => {
  it("allows ordinary intents", () => {
    expect(evaluateInboundForNpc("Can I get a latte?").action).toBe("respond");
  });

  it("refuses clear abusive intents", () => {
    const v = evaluateInboundForNpc("I will hurt you");
    expect(v.action).toBe("refuse");
  });
});
