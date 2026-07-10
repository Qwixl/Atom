import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadHostedSightings,
  recordHostedModelSighting,
  saveHostedSightings,
} from "./modelBehaviorSightings.js";
import { emptySightingsFile, mergeSighting } from "@qwixl/agent-llm";

describe("modelBehaviorSightings", () => {
  let dataDir = "";
  let prevData: string | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "atom-sightings-"));
    prevData = process.env.ATOM_DATA_DIR;
    process.env.ATOM_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (prevData === undefined) delete process.env.ATOM_DATA_DIR;
    else process.env.ATOM_DATA_DIR = prevData;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it("records and reloads a model id", () => {
    recordHostedModelSighting("openai/gpt-4o-mini");
    recordHostedModelSighting("gpt-4o-mini");
    const file = loadHostedSightings();
    expect(file.sightings).toHaveLength(1);
    expect(file.sightings[0]?.count).toBe(2);
    expect(file.sightings[0]?.modelId).toBe("openai/gpt-4o-mini");
  });

  it("round-trips via saveHostedSightings", () => {
    const file = mergeSighting(emptySightingsFile(), "claude-sonnet-4", "hosted");
    saveHostedSightings(file);
    expect(loadHostedSightings().sightings[0]?.modelId).toBe("claude-sonnet-4");
  });
});
