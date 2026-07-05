import { readFlag } from "../args.js";
import { adminJson, loadAgentConnection, saveAgentConnection } from "../connection.js";
import { resolveControlPlaneUrl } from "../platform.js";

export async function accountSignup(args: string[]): Promise<void> {
  const email = readFlag(args, "--email");
  const handle = readFlag(args, "--handle");
  if (!email?.includes("@")) {
    console.error("Usage: atom account signup --email you@example.com [--handle @you]");
    process.exit(1);
  }

  const controlPlane = resolveControlPlaneUrl();
  const resp = await fetch(`${controlPlane}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      ...(handle?.trim() ? { handle: handle.trim() } : {}),
    }),
  });
  const data = (await resp.json()) as {
    agentUrl?: string;
    adminToken?: string;
    handle?: string;
    error?: string;
    custodyNotice?: string;
  };
  if (!resp.ok) {
    throw new Error(data.error ?? `Signup failed (${resp.status})`);
  }
  if (!data.agentUrl || !data.adminToken) {
    throw new Error("Signup succeeded but no agent credentials were returned.");
  }

  const filePath = await saveAgentConnection({
    url: data.agentUrl,
    token: data.adminToken,
    handle: data.handle,
  });
  console.log(`Handle: ${data.handle ?? "(assigned)"}`);
  console.log(`Agent:  ${data.agentUrl}`);
  console.log(`Saved:  ${filePath}`);
  if (data.custodyNotice) console.log(data.custodyNotice);
}

export async function accountStatus(): Promise<void> {
  const connection = await loadAgentConnection();
  console.log(`Agent:    ${connection.url}`);
  if (connection.handle) console.log(`Handle:   ${connection.handle}`);
  if (connection.platformUrl) console.log(`Platform: ${connection.platformUrl}`);
  if (connection.did) console.log(`DID:      ${connection.did}`);
}

export async function agentStatus(): Promise<void> {
  const connection = await loadAgentConnection();
  const capabilities = await adminJson<{
    did?: string;
    displayName?: string;
    rooms?: unknown[];
    businessDomain?: string | null;
  }>(connection, "/discover/capabilities");
  console.log(`Agent: ${capabilities.displayName ?? connection.agentName ?? "Atom agent"}`);
  console.log(`DID:   ${capabilities.did ?? connection.did ?? "(unknown)"}`);
  console.log(`URL:   ${connection.url}`);
  if (connection.platformUrl) console.log(`Platform: ${connection.platformUrl}`);
  if (capabilities.businessDomain) console.log(`Domain: ${capabilities.businessDomain}`);
  const roomCount = Array.isArray(capabilities.rooms) ? capabilities.rooms.length : 0;
  if (roomCount > 0) console.log(`Rooms: ${roomCount}`);
}
