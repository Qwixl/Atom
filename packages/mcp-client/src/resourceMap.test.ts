import { describe, expect, it } from "vitest";
import { mapSdkTool, uiResourceUriFromToolMeta } from "./resourceMap.js";

describe("resourceMap", () => {
  it("preserves tool _meta", () => {
    const mapped = mapSdkTool({
      name: "show",
      _meta: { ui: { resourceUri: "ui://demo/view" } },
    });
    expect(mapped.meta).toEqual({ ui: { resourceUri: "ui://demo/view" } });
    expect(uiResourceUriFromToolMeta(mapped.meta)).toBe("ui://demo/view");
  });

  it("rejects non-ui resourceUri", () => {
    expect(uiResourceUriFromToolMeta({ ui: { resourceUri: "https://x" } })).toBeNull();
  });
});
