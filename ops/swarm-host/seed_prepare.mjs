#!/usr/bin/env node
/**
 * Create ~/atom/state/npcs/<id>/ layout from packages/agent-backend/swarm-seeds/v1-npcs.json
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
const npcRoot = path.join(home, "atom", "state", "npcs");
const seedsPath = path.join(repoRoot, "packages", "agent-backend", "swarm-seeds", "v1-npcs.json");

const seeds = JSON.parse(fs.readFileSync(seedsPath, "utf8"));
fs.mkdirSync(npcRoot, { recursive: true });

for (const npc of seeds.npcs) {
  const dir = path.join(npcRoot, npc.id);
  fs.mkdirSync(dir, { recursive: true });
  const kind = npc.agentKind === "swarm-police" ? "swarm-police" : "swarm-npc";
  const meta = {
    id: npc.id,
    handle: npc.handle,
    displayName: npc.displayName,
    port: npc.portHint,
    homePlace: npc.homePlace,
    agentKind: kind,
    publicBaseUrl: `http://127.0.0.1:${npc.portHint}`,
  };
  fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "core.json"), `${JSON.stringify(npc.core, null, 2)}\n`);
  const tokenPath = path.join(dir, "admin.token");
  if (!fs.existsSync(tokenPath) || !fs.readFileSync(tokenPath, "utf8").trim()) {
    fs.writeFileSync(tokenPath, `${crypto.randomBytes(32).toString("base64url")}\n`, { mode: 0o600 });
  }
  console.log(`prepared ${npc.id} :${npc.portHint} (${kind})`);
}

const venuesSrc = path.join(repoRoot, "packages", "agent-backend", "swarm-seeds", "v1-venues.json");
const venuesDst = path.join(home, "atom", "state", "venues.json");
fs.copyFileSync(venuesSrc, venuesDst);
console.log(`copied venues -> ${venuesDst}`);
console.log(`npc root: ${npcRoot}`);
