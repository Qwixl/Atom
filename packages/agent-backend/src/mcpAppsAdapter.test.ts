import { describe, expect, it } from "vitest";
import { mcpAppsToolToRegistryRef, mcpAppsUiUriToModuleId } from "./mcpAppsAdapter.js";

describe("mcpAppsAdapter", () => {
  it("maps ui:// URIs to registry module ids", () => {
    expect(mcpAppsUiUriToModuleId("ui://atom/media/video-call")).toBe("media/video-call");
  });

  it("builds registry ref from MCP Apps tool descriptor", () => {
    const ref = mcpAppsToolToRegistryRef({
      name: "play_audio",
      ui: { uri: "ui://atom/media/audio-player", mimeType: "text/html;profile=mcp-app" },
    });
    expect(ref?.moduleId).toBe("media/audio-player");
    expect(ref?.manifestUrl).toContain("media/audio-player");
  });
});
