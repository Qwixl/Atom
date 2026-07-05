#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accountSignup, accountStatus, agentStatus } from "./commands/account.js";
import { startAgent, showPlatform } from "./commands/agent.js";
import { chatWithAgent } from "./commands/chat.js";
import {
  connectInvite,
  connectPeer,
  createInvite,
  listPeers,
  sendMessage,
  showInbox,
} from "./commands/comms.js";
import { discoverSearch } from "./commands/discover.js";
import { joinRoom, listRooms, roomMessages, sendRoomMessage, watchRoom } from "./commands/rooms.js";
import { applyGlobalFlags } from "./args.js";
import { DEFAULT_PLATFORM_URL } from "./platform.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
  version: string;
};

function usage(): never {
  console.log(`atom — terminal interface to your owner agent

Atom platform (always on):
  Default: ${DEFAULT_PLATFORM_URL}
  Override only when developing locally or running a fork:
    atom --platform http://localhost:5200 …
    ATOM_PLATFORM_URL=https://your-fork.example atom …

Agent:
  atom agent start [--community-host]   Start your agent (alias: atom serve)
  atom status                           Agent identity and capabilities
  atom platform                         Show platform URL and reachability

Account (hosted agent):
  atom account signup --email you@example.com [--handle @you]
  atom account status

Discover:
  atom discover search <terms> [--kind business|room|agent]

Rooms:
  atom rooms list
  atom rooms join <roomId> --host <agent-url>
  atom rooms messages <roomId> [--after seq]
  atom rooms send <roomId> --message "hello"
  atom rooms watch <roomId> [--after seq]

Comms (DMs):
  atom inbox
  atom invite [--ttl seconds]
  atom connect invite <token>
  atom connect peer <url> [--did did:key:…]
  atom peers
  atom send --peer <url> [--did …] --message "hello"

Chat:
  atom chat "your message"              Talk to your agent (needs LLM_API_KEY on agent)

Registry:
  atom registry <atom-registry args…>

Browser mode (separate — do not mix):
  pnpm dev                              Local dev only: agent + shell together

Environment:
  ATOM_PLATFORM_URL         Override Atom platform (default ${DEFAULT_PLATFORM_URL})
  ATOM_CONTROL_PLANE_URL    Override signup host (default https://control.qwixl.dev)
  ATOM_DATA_DIR             Agent data (~/.atom)
  ATOM_AGENT_URL            Override your agent URL for CLI commands
  ATOM_ADMIN_TOKEN          Override admin token
`);
  process.exit(0);
}

function cmdRegistry(args: string[]): never {
  const child = spawnSync("atom-registry", args, { stdio: "inherit", shell: true });
  if (child.error) {
    console.error("atom-registry not found. Install @qwixl/registry-tools or run from the Atom monorepo.");
    process.exit(1);
  }
  process.exit(child.status ?? 1);
}

async function main(): Promise<void> {
  const args = applyGlobalFlags(process.argv.slice(2));
  const command = args[0];
  if (!command || command === "--help" || command === "-h") usage();
  if (command === "--version" || command === "-v") {
    console.log(version.version);
    return;
  }

  const rest = args.slice(1);

  if (command === "serve" || (command === "agent" && rest[0] === "start")) {
    startAgent(command === "serve" ? rest : rest.slice(1));
    return;
  }

  switch (command) {
    case "platform":
      await showPlatform();
      return;
    case "status":
      await agentStatus();
      return;
    case "account":
      if (rest[0] === "signup") {
        await accountSignup(rest.slice(1));
        return;
      }
      if (rest[0] === "status" || !rest[0]) {
        await accountStatus();
        return;
      }
      break;
    case "discover":
      if (rest[0] === "search") {
        await discoverSearch(rest.slice(1));
        return;
      }
      break;
    case "rooms":
      if (rest[0] === "list" || !rest[0]) {
        await listRooms();
        return;
      }
      if (rest[0] === "join") {
        await joinRoom(rest.slice(1));
        return;
      }
      if (rest[0] === "messages") {
        await roomMessages(rest.slice(1));
        return;
      }
      if (rest[0] === "send") {
        await sendRoomMessage(rest.slice(1));
        return;
      }
      if (rest[0] === "watch") {
        await watchRoom(rest.slice(1));
        return;
      }
      break;
    case "inbox":
      await showInbox();
      return;
    case "invite":
      await createInvite(rest);
      return;
    case "connect":
      if (rest[0] === "invite") {
        await connectInvite(rest.slice(1));
        return;
      }
      if (rest[0] === "peer") {
        await connectPeer(rest.slice(1));
        return;
      }
      break;
    case "peers":
      await listPeers();
      return;
    case "send":
      await sendMessage(rest);
      return;
    case "chat":
      await chatWithAgent(rest);
      return;
    case "registry":
      cmdRegistry(rest);
      return;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }

  console.error(`Unknown subcommand for: ${command}`);
  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
