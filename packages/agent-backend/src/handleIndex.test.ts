import { describe, expect, it } from "vitest";
import { lookupHandleIndex, parseHandleIndex } from "./handleIndex.js";

describe("handleIndex", () => {
  it("parses and looks up handles", () => {
    const doc = parseHandleIndex({
      version: 1,
      updatedAt: "2026-07-08T00:00:00.000Z",
      entries: [
        {
          handle: "@coffee-shop",
          agentDid: "did:key:z6Mkcoffee",
          adminBase: "https://coffee.example.com",
        },
      ],
    });
    expect(doc).not.toBeNull();
    const hit = lookupHandleIndex(doc!, "coffee-shop");
    expect(hit?.agentDid).toBe("did:key:z6Mkcoffee");
  });
});
