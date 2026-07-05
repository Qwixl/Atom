import { readFlag, collectPositional } from "../args.js";
import { adminJson, loadAgentConnection } from "../connection.js";

export async function discoverSearch(args: string[]): Promise<void> {
  const kind = readFlag(args, "--kind") as "business" | "room" | "agent" | undefined;
  const positional = collectPositional(args);
  const terms = positional.join(" ").trim();
  if (!terms) {
    console.error('Usage: atom discover search <terms> [--kind business|room|agent]');
    process.exit(1);
  }

  const connection = await loadAgentConnection();
  const payload = await adminJson<{
    summary?: string;
    results?: Array<{
      displayName?: string;
      handle?: string;
      endpoint?: string;
      entry?: { handle?: string; displayName?: string; agentUrl?: string };
      resolved?: { adminBase?: string };
    }>;
  }>(connection, "/discover/search", {
    method: "POST",
    body: JSON.stringify({ terms, ...(kind ? { kind } : {}) }),
  });

  if (payload.summary?.trim()) console.log(payload.summary);
  const results = payload.results ?? [];
  if (results.length === 0) {
    console.log("No matches.");
    return;
  }
  for (const row of results) {
    const handle = row.handle ?? row.entry?.handle;
    const label = handle ? (handle.startsWith("@") ? handle : `@${handle}`) : row.displayName ?? row.entry?.displayName ?? "Unknown";
    const endpoint = row.endpoint ?? row.resolved?.adminBase ?? row.entry?.agentUrl;
    console.log(`- ${label}${endpoint ? ` · ${endpoint}` : ""}`);
  }
}
