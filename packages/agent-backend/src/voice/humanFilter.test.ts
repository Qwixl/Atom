import { describe, expect, it } from "vitest";
import { applyHumanFilter } from "./humanFilter.js";

describe("applyHumanFilter", () => {
  it("strips markdown fences and bold", () => {
    const out = applyHumanFilter("Here is **bold** and `code`.");
    expect(out.text).not.toContain("**");
    expect(out.text).not.toContain("`");
    expect(out.text).toMatch(/bold/);
  });

  it("returns empty for blank input", () => {
    expect(applyHumanFilter("   ").text).toBe("");
  });

  it("infers calm emotion for apologies", () => {
    const out = applyHumanFilter("Sorry, I can't complete that request right now.");
    expect(out.emotion).toBe("calm");
  });
});
