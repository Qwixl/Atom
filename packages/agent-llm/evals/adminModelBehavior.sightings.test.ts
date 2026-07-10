import { describe, expect, it } from "vitest";
import {
  emptySightingsFile,
  mergeSighting,
  serializeSightings,
} from "../src/modelSightings.js";
import { resolveEvalModelShortlist } from "./adminModelBehavior.js";

describe("adminModelBehavior sightings shortlist", () => {
  it("merges defaults with sightings when EVAL_MODELS unset", () => {
    let file = emptySightingsFile();
    file = mergeSighting(file, "deepseek-chat", "import");
    file = mergeSighting(file, "gemini-2.0-flash", "import");
    const { models, fromSightings } = resolveEvalModelShortlist({}, file);
    expect(models).toContain("gpt-4o-mini");
    expect(models).toContain("gpt-4o");
    expect(models).toContain("deepseek-chat");
    expect(models).toContain("gemini-2.0-flash");
    expect(fromSightings).toEqual(expect.arrayContaining(["deepseek-chat", "gemini-2.0-flash"]));
  });

  it("EVAL_MODELS overrides sightings entirely", () => {
    let file = emptySightingsFile();
    file = mergeSighting(file, "deepseek-chat", "import");
    const { models, fromSightings } = resolveEvalModelShortlist(
      { EVAL_MODELS: "claude-sonnet-4" },
      file,
    );
    expect(models).toEqual(["claude-sonnet-4"]);
    expect(fromSightings).toEqual([]);
  });

  it("serializeSightings is valid JSON for hand-export", () => {
    const file = mergeSighting(emptySightingsFile(), "grok-3", "shell");
    expect(() => JSON.parse(serializeSightings(file))).not.toThrow();
  });
});
