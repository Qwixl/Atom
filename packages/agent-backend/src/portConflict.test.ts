import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import {
  isPortAvailable,
  promptPortConflict,
  resolvePortWithPrompt,
} from "./portConflict.js";

function listenOn(host: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

describe("portConflict", () => {
  it("isPortAvailable returns true when port is free", async () => {
    expect(await isPortAvailable("127.0.0.1", 59210)).toBe(true);
  });

  it("resolvePortWithPrompt returns startPort when free", async () => {
    const port = await resolvePortWithPrompt({
      host: "127.0.0.1",
      startPort: 59211,
      interactive: false,
    });
    expect(port).toBe(59211);
  });

  it("resolvePortWithPrompt auto-bumps when not interactive", async () => {
    const occupied = await listenOn("127.0.0.1", 59214);
    try {
      const port = await resolvePortWithPrompt({
        host: "127.0.0.1",
        startPort: 59214,
        interactive: false,
      });
      expect(port).toBe(59215);
    } finally {
      occupied.close();
    }
  });

  it("resolvePortWithPrompt bumps port when user chooses next", async () => {
    const occupied = await listenOn("127.0.0.1", 59212);
    try {
      const port = await resolvePortWithPrompt({
        host: "127.0.0.1",
        startPort: 59212,
        interactive: true,
        ask: async () => "p",
      });
      expect(port).toBe(59213);
    } finally {
      occupied.close();
    }
  });

  it("promptPortConflict accepts p and k", async () => {
    expect(await promptPortConflict(5204, async () => "p")).toBe("next");
    expect(await promptPortConflict(5204, async () => "k")).toBe("kill");
    expect(await promptPortConflict(5204, async () => "kill")).toBe("kill");
  });

  it("promptPortConflict rejects invalid input", async () => {
    await expect(promptPortConflict(5204, async () => "x")).rejects.toThrow(/Startup cancelled/);
  });
});
