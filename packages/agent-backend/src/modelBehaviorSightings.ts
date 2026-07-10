/**
 * Persist model-id sightings under ATOM_DATA_DIR (MBA-7) and
 * fire-and-forget first-use reports to the control plane (MBA-8).
 * Model ids only — never API keys. Never throws into the chat path.
 */
import fs from "node:fs";
import path from "node:path";
import {
  emptySightingsFile,
  isModelAssessed,
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

function reportToControlPlane(modelId: string): void {
  const base = process.env.ATOM_CONTROL_PLANE_URL?.trim()?.replace(/\/$/, "");
  const token = process.env.ATOM_ADMIN_TOKEN?.trim();
  if (!base || !token) return;

  // Skip if an exact assessment already exists (any baseline).
  if (isModelAssessed(modelId)) return;

  void fetch(`${base}/model-behavior/sightings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modelId }),
  }).catch(() => {
    /* ignore network errors */
  });
}

/** Best-effort record; never throws into the chat path. */
export function recordHostedModelSighting(modelId: string): void {
  try {
    const id = modelId.trim();
    if (!id) return;
    const next = mergeSighting(loadHostedSightings(), id, "hosted");
    saveHostedSightings(next);
    reportToControlPlane(id);
  } catch {
    /* ignore disk errors */
  }
}
