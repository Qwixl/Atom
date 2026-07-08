import { describe, expect, it } from "vitest";
import { withMcpServerSession } from "./serverSession.js";

describe("withMcpServerSession", () => {
  it("requires command for stdio transport", async () => {
    await expect(
      withMcpServerSession({ transport: "stdio", stdio: { command: "" } }, async () => "ok"),
    ).rejects.toThrow(/requires command/);
  });

  it("requires url for streamable-http transport", async () => {
    await expect(
      withMcpServerSession({ transport: "streamable-http", http: { url: "" } }, async () => "ok"),
    ).rejects.toThrow(/requires url/);
  });
});
