import { SHOW_DEV_WORKFLOWS } from "./hostConfig.js";

/** Dev-only: probe common local agent ports. Never runs on production deploys. */
export async function probeLocalDevAgentBase(): Promise<string | null> {
  if (!SHOW_DEV_WORKFLOWS) return null;
  for (const port of [5204, 5207, 5301]) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/discover/capabilities`);
      if (resp.ok) return `http://127.0.0.1:${port}`;
    } catch {
      // try next port
    }
  }
  return null;
}
