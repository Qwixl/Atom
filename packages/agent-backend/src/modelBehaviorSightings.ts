/**
 * Persist model-id sightings under ATOM_DATA_DIR (MBA-7).
 * Model ids only — never API keys.
 */
import fs from "node:fs";
import path from "node:path";
import {
  emptySightingsFile,
  mergeSighting,
  parseSightingsJson,
  serializeSightings,
  type ModelSightingsFile,
} from "@qwixl/agent-llm";
import { resolveDataPath } from "./dataDir.js";

export const HOSTED_SIGHTINGS_FILE = "model-behavior-sightings.json";

export function hostedSightingsPath(): string {
  return resolveDataPath(HOSTED_SIGHTINGS_FILE);
}

export function loadHostedSightings(filePath = hostedSightingsPath()): ModelSightingsFile {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return parseSightingsJson(raw);
  } catch {
    return emptySightingsFile();
  }
}

export function saveHostedSightings(
  file: ModelSightingsFile,
  filePath = hostedSightingsPath(),
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeSightings(file), "utf8");
}

/** Best-effort record; never throws into the chat path. */
export function recordHostedModelSighting(modelId: string): void {
  try {
    const id = modelId.trim();
    if (!id) return;
    const next = mergeSighting(loadHostedSightings(), id, "hosted");
    saveHostedSightings(next);
  } catch {
    /* ignore disk errors */
  }
}
