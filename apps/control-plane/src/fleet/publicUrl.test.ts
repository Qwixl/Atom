import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertProductionAgentPublicUrl, isLocalHostAgentUrl } from "./publicUrl.js";

describe("publicUrl", () => {
  it("detects localhost agent URLs", () => {
    assert.equal(isLocalHostAgentUrl("http://127.0.0.1:5310"), true);
    assert.equal(isLocalHostAgentUrl("https://alice.agents.example.com"), false);
  });

  it("requires HTTPS in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    assert.throws(() => assertProductionAgentPublicUrl("http://127.0.0.1:5310"), /localhost/i);
    assert.throws(() => assertProductionAgentPublicUrl("http://agents.example.com:5310"), /HTTPS/i);
    assert.doesNotThrow(() => assertProductionAgentPublicUrl("https://5310.agents.example.com"));
    process.env.NODE_ENV = prev;
  });
});
