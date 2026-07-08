import { describe, expect, it } from "vitest";
import { buildImageResultProtocol, extractImageUrlsFromResponse } from "./imageProtocol.js";

describe("imageProtocol", () => {
  it("builds composition with core/image children", () => {
    const raw = buildImageResultProtocol(["https://example.com/cat.png"], "Golden cat");
    const parsed = JSON.parse(raw) as { messages: unknown[] };
    expect(parsed.messages).toHaveLength(2);
    const composition = parsed.messages[1] as {
      type: string;
      composition: { root: { children: Array<{ component: string; props: { src: string } }> } };
    };
    expect(composition.type).toBe("composition");
    expect(composition.composition.root.children[0]?.component).toBe("core/image");
    expect(composition.composition.root.children[0]?.props.src).toBe("https://example.com/cat.png");
  });

  it("extracts nested image URLs from Responses output", () => {
    const urls = extractImageUrlsFromResponse({
      output: [
        {
          type: "image_generation_call",
          result: "https://cdn.example.com/out.png",
        },
      ],
    });
    expect(urls).toEqual(["https://cdn.example.com/out.png"]);
  });
});
