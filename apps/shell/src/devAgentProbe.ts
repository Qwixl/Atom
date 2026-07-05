/** Probe common local dev:a2a ports (public capabilities endpoint, no auth). */
export async function probeLocalDevAgentBase(): Promise<string | null> {
  for (const port of [5204, 5205, 5207, 5301]) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/discover/capabilities`);
      if (resp.ok) return `http://127.0.0.1:${port}`;
    } catch {
      /* try next port */
    }
  }
  return null;
}
