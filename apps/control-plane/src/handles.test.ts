import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isHandleTaken, parseSignupHandle, publicHandle } from "./handles.js";

describe("handles", () => {
  it("validates and normalizes signup handle", () => {
    const parsed = parseSignupHandle({ email: "luke@example.com", handle: "@Coffee-Shop" });
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.handle, "coffee-shop");
    assert.equal(publicHandle(parsed.handle), "@coffee-shop");
  });

  it("detects taken handles", () => {
    const agents = [{ handle: "luke" }];
    assert.equal(isHandleTaken(agents, "@luke"), true);
    assert.equal(isHandleTaken(agents, "@other"), false);
  });
});
