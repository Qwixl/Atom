import { describe, expect, it } from "vitest";
import { createBusinessKnowledgeBackend } from "./businessKnowledgeBackend.js";

describe("createBusinessKnowledgeBackend", () => {
  it("defaults to json backend", () => {
    const backend = createBusinessKnowledgeBackend({ kind: "json", dataPath: "/tmp/unused.json" });
    expect(typeof backend.retrieve).toBe("function");
  });

  it("creates sqlite-named json backend (M12.9 v1 path)", () => {
    const backend = createBusinessKnowledgeBackend({
      kind: "sqlite",
      dataPath: "/tmp/unused.sqlite.json",
    });
    expect(typeof backend.retrieve).toBe("function");
  });

  it("rejects unimplemented remote backend at startup", () => {
    expect(() =>
      createBusinessKnowledgeBackend({ kind: "remote", remoteUrl: "https://knowledge.example/api" }),
    ).toThrow(/not implemented yet/i);
  });
});
