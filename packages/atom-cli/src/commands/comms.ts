import { COMMS_MESSAGE_PURPOSE, COMMS_MESSAGE_SCHEMA } from "@qwixl/a2a-transport";
import { readFlag, collectPositional } from "../args.js";
import { adminJson, loadAgentConnection } from "../connection.js";

export async function showInbox(): Promise<void> {
  const connection = await loadAgentConnection();
  const payload = await adminJson<{
    entries?: Array<{
      id?: string;
      fromDid?: string;
      purpose?: string;
      receivedAt?: string;
      payload?: { text?: string };
    }>;
  }>(connection, "/inbox");
  const entries = payload.entries ?? [];
  if (entries.length === 0) {
    console.log("Inbox empty.");
    return;
  }
  for (const entry of entries) {
    const text = entry.payload?.text?.trim();
    const when = entry.receivedAt ? new Date(entry.receivedAt).toLocaleString() : "";
    console.log(`[${when}] ${entry.fromDid ?? "unknown"}${text ? `: ${text}` : ""}`);
  }
}

export async function createInvite(args: string[]): Promise<void> {
  const ttlRaw = readFlag(args, "--ttl");
  const ttlSeconds = ttlRaw ? Number(ttlRaw) : undefined;
  const connection = await loadAgentConnection();
  const payload = await adminJson<{ token?: string; issuerDid?: string }>(connection, "/invite", {
    method: "POST",
    body: JSON.stringify(ttlSeconds ? { ttlSeconds } : {}),
  });
  if (!payload.token) throw new Error("Invite token missing from response.");
  console.log(payload.token);
  if (payload.issuerDid) console.error(`Issuer: ${payload.issuerDid}`);
}

export async function connectInvite(args: string[]): Promise<void> {
  const token = args.join(" ").trim();
  if (!token) {
    console.error("Usage: atom connect invite <token>");
    process.exit(1);
  }
  const connection = await loadAgentConnection();
  const payload = await adminJson<{ connected?: string }>(connection, "/mls/connect", {
    method: "POST",
    body: JSON.stringify({ invite: token }),
  });
  console.log(`Connected: ${payload.connected ?? "ok"}`);
}

export async function connectPeer(args: string[]): Promise<void> {
  const peerUrl = readFlag(args, "--url") ?? args[0];
  const peerDid = readFlag(args, "--did");
  if (!peerUrl?.trim()) {
    console.error("Usage: atom connect peer <url> [--did did:key:…]");
    process.exit(1);
  }
  const connection = await loadAgentConnection();
  const payload = await adminJson<{ connected?: string }>(connection, "/mls/connect", {
    method: "POST",
    body: JSON.stringify({
      peerUrl: peerUrl.trim(),
      ...(peerDid?.trim() ? { peerDid: peerDid.trim() } : {}),
    }),
  });
  console.log(`Connected: ${payload.connected ?? "ok"}`);
}

export async function sendMessage(args: string[]): Promise<void> {
  const peerUrl = readFlag(args, "--peer");
  const peerDid = readFlag(args, "--did");
  const message = readFlag(args, "--message") ?? collectPositional(args).join(" ");
  const encrypt = !args.includes("--no-encrypt");
  if (!peerUrl?.trim() || !message.trim()) {
    console.error('Usage: atom send --peer <url> [--did did:key:…] --message "hello"');
    process.exit(1);
  }
  const connection = await loadAgentConnection();
  await adminJson(connection, "/send", {
    method: "POST",
    body: JSON.stringify({
      peerUrl: peerUrl.trim(),
      ...(peerDid?.trim() ? { peerDid: peerDid.trim() } : {}),
      encrypt,
      message: {
        semantic: { schema: COMMS_MESSAGE_SCHEMA },
        payload: { text: message.trim() },
        governance: { purpose: COMMS_MESSAGE_PURPOSE },
      },
    }),
  });
  console.log("Sent.");
}

export async function listPeers(): Promise<void> {
  const connection = await loadAgentConnection();
  const payload = await adminJson<{ peers?: string[]; rooms?: string[] }>(connection, "/mls/sessions");
  const peers = payload.peers ?? [];
  if (peers.length === 0) {
    console.log("No MLS peers connected.");
    return;
  }
  for (const peer of peers) console.log(`- ${peer}`);
}
