import { readFlag, collectPositional } from "../args.js";
import { adminJson, loadAgentConnection } from "../connection.js";

export async function listRooms(): Promise<void> {
  const connection = await loadAgentConnection();
  const payload = await adminJson<{
    hosted?: Array<{ roomId: string; name?: string; title?: string }>;
    joined?: Array<{ roomId: string; title?: string; hostUrl?: string; descriptor?: { name?: string } }>;
  }>(connection, "/rooms");
  const hosted = payload.hosted ?? [];
  const joined = payload.joined ?? [];
  if (hosted.length === 0 && joined.length === 0) {
    console.log("No rooms.");
    return;
  }
  if (hosted.length > 0) {
    console.log("Hosted:");
    for (const room of hosted) {
      console.log(`- ${room.name ?? room.title ?? room.roomId} (${room.roomId})`);
    }
  }
  if (joined.length > 0) {
    console.log("Joined:");
    for (const room of joined) {
      const title = room.descriptor?.name ?? room.title ?? room.roomId;
      console.log(`- ${title} (${room.roomId})${room.hostUrl ? ` @ ${room.hostUrl}` : ""}`);
    }
  }
}

export async function joinRoom(args: string[]): Promise<void> {
  const roomId = args[0];
  const hostUrl = readFlag(args, "--host");
  if (!roomId?.trim()) {
    console.error("Usage: atom rooms join <roomId> --host <agent-url>");
    process.exit(1);
  }

  const connection = await loadAgentConnection();
  if (!hostUrl?.trim()) {
    const listed = await adminJson<{
      hosted?: Array<{ roomId: string; name?: string }>;
      joined?: Array<{ roomId: string }>;
    }>(connection, "/rooms");
    if (listed.hosted?.some((room) => room.roomId === roomId.trim())) {
      const hosted = listed.hosted.find((room) => room.roomId === roomId.trim());
      console.log(`You host ${hosted?.name ?? roomId}. Send with: atom rooms send ${roomId} --message "…"`);
      return;
    }
    if (listed.joined?.some((room) => room.roomId === roomId.trim())) {
      console.log(`Already joined ${roomId}.`);
      return;
    }
    console.error("Join a remote room with --host <agent-url> (e.g. the Coffee Shop host agent).");
    process.exit(1);
  }

  const payload = await adminJson<{
    joined?: string;
    descriptor?: { name?: string; roomId?: string } | null;
  }>(connection, "/rooms/join-remote", {
    method: "POST",
    body: JSON.stringify({ hostUrl: hostUrl.trim(), roomId: roomId.trim() }),
  });
  const name = payload.descriptor?.name ?? payload.joined ?? roomId;
  console.log(`Joined ${name}`);
}

export async function roomMessages(args: string[]): Promise<void> {
  const roomId = args[0];
  const after = Number(readFlag(args, "--after") ?? "0");
  if (!roomId?.trim()) {
    console.error("Usage: atom rooms messages <roomId> [--after seq]");
    process.exit(1);
  }
  const connection = await loadAgentConnection();
  const payload = await adminJson<{
    messages?: Array<{ seq: number; senderDid: string; text?: string; at: string; kind?: string }>;
  }>(connection, `/rooms/${encodeURIComponent(roomId.trim())}/messages?after=${after}`);
  const messages = payload.messages ?? [];
  if (messages.length === 0) {
    console.log("No messages.");
    return;
  }
  for (const message of messages) {
    const when = new Date(message.at).toLocaleString();
    console.log(`[${message.seq}] ${when} ${message.senderDid}: ${message.text ?? `(${message.kind ?? "event"})`}`);
  }
}

export async function sendRoomMessage(args: string[]): Promise<void> {
  const roomId = args[0];
  const text = readFlag(args, "--message") ?? collectPositional(args.slice(1)).join(" ");
  if (!roomId?.trim() || !text.trim()) {
    console.error('Usage: atom rooms send <roomId> --message "hello"');
    process.exit(1);
  }
  const connection = await loadAgentConnection();
  const payload = await adminJson<{ message?: { seq?: number } }>(
    connection,
    `/rooms/${encodeURIComponent(roomId.trim())}/send`,
    {
      method: "POST",
      body: JSON.stringify({ text: text.trim(), kind: "message" }),
    },
  );
  console.log(payload.message?.seq ? `Sent (seq ${payload.message.seq}).` : "Sent.");
}

export async function watchRoom(args: string[]): Promise<void> {
  const roomId = args[0];
  const after = Number(readFlag(args, "--after") ?? "0");
  if (!roomId?.trim()) {
    console.error("Usage: atom rooms watch <roomId> [--after seq]");
    process.exit(1);
  }
  let cursor = after;
  console.error(`Watching ${roomId} (Ctrl+C to stop)…`);
  while (true) {
    const connection = await loadAgentConnection();
    const payload = await adminJson<{
      messages?: Array<{ seq: number; senderDid: string; text?: string; at: string; kind?: string }>;
    }>(connection, `/rooms/${encodeURIComponent(roomId.trim())}/messages?after=${cursor}`);
    for (const message of payload.messages ?? []) {
      cursor = message.seq;
      const when = new Date(message.at).toLocaleString();
      console.log(`[${message.seq}] ${when} ${message.senderDid}: ${message.text ?? `(${message.kind ?? "event"})`}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
