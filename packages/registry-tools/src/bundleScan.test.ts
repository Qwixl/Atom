import { describe, expect, it } from "vitest";
import { scanText } from "./bundleScan.js";

describe("bundleScan", () => {
  it("flags eval as error", () => {
    const issues = scanText("acme/bad", "/bad.html", "eval('x')", false);
    expect(issues.some((i) => i.rule === "no-eval" && i.severity === "error")).toBe(true);
  });

  it("flags external script as warning by default", () => {
    const issues = scanText(
      "data/map-view",
      "/map.html",
      '<script src="https://cdn.example/lib.js"></script>',
      false,
    );
    expect(issues[0]?.severity).toBe("warning");
  });

  it("flags external script as error in strict mode", () => {
    const issues = scanText(
      "data/map-view",
      "/map.html",
      '<script src="https://cdn.example/lib.js"></script>',
      true,
    );
    expect(issues[0]?.severity).toBe("error");
  });
});
