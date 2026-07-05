import { describe, expect, it } from "vitest";
import { createBusinessKnowledgeBackend } from "./businessKnowledgeBackend.js";

describe("createBusinessKnowledgeBackend", () => {
  it("defaults to json backend", () => {
    const backend = createBusinessKnowledgeBackend({ kind: "json", dataPath: "/tmp/unused.json" });
    expect(typeof backend.retrieve).toBe("function");
  });

  it("rejects unimplemented sqlite backend at startup", () => {
    expect(() => createBusinessKnowledgeBackend({ kind: "sqlite" })).toThrow(/not implemented yet/i);
  });

  it("rejects unimplemented remote backend at startup", () => {
    expect(() =>
      createBusinessKnowledgeBackend({ kind: "remote", remoteUrl: "https://knowledge.example/api" }),
    ).toThrow(/not implemented yet/i);
  });
});
