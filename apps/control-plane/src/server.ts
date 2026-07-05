/**
 * M15 control plane — signup, Docker fleet provisioning, abuse reporting.
 * Production: ATOM_FLEET_MODE=docker + atom-agent:latest image.
 * Local dev: HOSTED_STUB_AGENT_URL + HOSTED_STUB_AGENT_TOKEN (via pnpm dev:hosting).
 */
import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFleetProvisioner,
  devStubCredentials,
  handleFromEmail,
  newAgentId,
} from "./fleet/index.js";
import { requireProductionFleetTemplate } from "./fleet/publicUrl.js";
import { isHandleTaken, parseSignupHandle, publicHandle } from "./handles.js";
import { loadAgentStore, resolveDataDir, saveAgentStore } from "./fleet/store.js";
import type { FleetProvisioner, HostedAgentRecord } from "./fleet/types.js";
import { createRateLimiter } from "./rateLimit.js";

const app = express();
app.use(express.json());

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const aupText = readFileSync(path.join(packageDir, "..", "AUP.md"), "utf8");
const dataDir = resolveDataDir();

const allowedOrigins = new Set(
  (
    process.env.ATOM_SHELL_ORIGINS?.trim() ||
    "http://localhost:5200,http://127.0.0.1:5200,http://localhost:5203,http://127.0.0.1:5203,https://atom.qwixl.com"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (typeof origin === "string" && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.status(204).end();
    return;
  }
  next();
});

let agents = new Map<string, HostedAgentRecord>();
let fleet: FleetProvisioner | null = null;

const signupRateLimit = createRateLimiter(15 * 60 * 1000, 5);
const handleCheckRateLimit = createRateLimiter(60 * 1000, 30);
const provisionSecret = process.env.ATOM_PROVISION_SECRET?.trim();
const isProduction = process.env.NODE_ENV === "production";

function requireProvisionAuth(req: Request, res: Response): boolean {
  if (isProduction && !provisionSecret) return false;
  if (!provisionSecret) return true;
  const header = req.headers.authorization;
  if (header === `Bearer ${provisionSecret}`) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

async function init(): Promise<void> {
  agents = await loadAgentStore(dataDir);
  fleet = await createFleetProvisioner(agents);
  if (fleet.mode === "docker") {
    requireProductionFleetTemplate();
  }
}

async function persistAgents(): Promise<void> {
  await saveAgentStore(dataDir, agents);
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "atom-control-plane",
    version: "0.3.0-m15",
    fleetMode: fleet?.mode ?? "loading",
    agents: agents.size,
    dataDir,
  });
});

app.get("/policy/acceptable-use", (_req, res) => {
  res.type("text/markdown").send(aupText);
});

app.get("/handles/check", handleCheckRateLimit, (req, res) => {
  const parsed = parseSignupHandle({ handle: String(req.query.handle ?? "") });
  if (parsed.error) {
    res.json({ available: false, handle: publicHandle(parsed.handle), error: parsed.error });
    return;
  }
  const taken = isHandleTaken(agents.values(), parsed.handle);
  res.json({
    available: !taken,
    handle: publicHandle(parsed.handle),
    error: taken ? "That handle is already taken." : undefined,
  });
});

app.post("/signup", signupRateLimit, async (req, res) => {
  if (!fleet) {
    res.status(503).json({ error: "Control plane starting" });
    return;
  }
  const email = String((req.body as { email?: string }).email ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ error: "valid email required" });
    return;
  }

  const parsedHandle = parseSignupHandle(req.body as { email?: string; handle?: string });
  if (parsedHandle.error) {
    res.status(400).json({ error: parsedHandle.error });
    return;
  }
  if (isHandleTaken(agents.values(), parsedHandle.handle)) {
    res.status(409).json({ error: "That handle is already taken.", handle: publicHandle(parsedHandle.handle) });
    return;
  }

  try {
    const id = newAgentId();
    const outcome = await fleet.provision({ id, handle: parsedHandle.handle, email });
    agents.set(outcome.agent.id, outcome.agent);
    await persistAgents();

    res.json({
      id: outcome.agent.id,
      handle: publicHandle(outcome.agent.handle),
      agentUrl: outcome.agent.agentUrl,
      adminToken: outcome.agent.adminToken,
      custodyNotice:
        "A hosted agent means Qwixl infrastructure holds your keys and store. You can export and self-host at any time.",
      policyUrl: "/policy/acceptable-use",
      status: outcome.status,
      message: outcome.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (fleet.mode === "unconfigured") {
      res.status(503).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

app.post("/provision", signupRateLimit, async (req, res) => {
  if (isProduction && !provisionSecret) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!requireProvisionAuth(req, res)) return;
  if (!fleet) {
    res.status(503).json({ error: "Control plane starting" });
    return;
  }
  const email = String((req.body as { email?: string }).email ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ error: "valid email required" });
    return;
  }
  try {
    const id = newAgentId();
    const handle = handleFromEmail(email);
    const outcome = await fleet.provision({ id, handle, email });
    agents.set(outcome.agent.id, outcome.agent);
    await persistAgents();
    res.status(201).json({
      id: outcome.agent.id,
      agentUrl: outcome.agent.agentUrl,
      adminToken: outcome.agent.adminToken,
      status: outcome.status,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/agents/:id/suspend", async (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent || !fleet) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  const reason = String((req.body as { reason?: string }).reason ?? "policy-violation").trim();
  await fleet.suspend(agent, reason);
  agent.status = "suspended";
  agent.suspendReason = reason;
  agents.set(agent.id, agent);
  await persistAgents();
  res.json({ id: agent.id, status: agent.status, reason, reapplyRoute: `/agents/${agent.id}/resume` });
});

app.post("/agents/:id/resume", async (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent || !fleet) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  await fleet.resume(agent);
  agent.status = "active";
  agent.suspendReason = undefined;
  agents.set(agent.id, agent);
  await persistAgents();
  res.json({ id: agent.id, status: agent.status });
});

app.delete("/agents/:id", async (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent || !fleet) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  await fleet.destroy(agent);
  agents.delete(req.params.id);
  await persistAgents();
  res.json({ deleted: req.params.id });
});

app.post("/report-abuse", (req, res) => {
  const target = String((req.body as { agentUrl?: string; reason?: string }).agentUrl ?? "").trim();
  const reason = String((req.body as { reason?: string }).reason ?? "").trim();
  if (!target) {
    res.status(400).json({ error: "agentUrl required" });
    return;
  }
  console.log(`[abuse-report] target=${target} reason=${reason || "(none)"}`);
  res.json({ received: true, target, status: "queued" });
});

const port = Number(process.env.PORT ?? 5300);

init()
  .then(() => {
    app.listen(port, () => {
      const stub = devStubCredentials();
      console.log(`Atom control plane http://127.0.0.1:${port}`);
      console.log(`  fleet mode: ${fleet?.mode ?? "unknown"}`);
      console.log(`  data dir:   ${dataDir}`);
      if (fleet?.mode === "docker") {
        console.log(`  agent image: ${process.env.ATOM_AGENT_IMAGE?.trim() || "atom-agent:latest"}`);
      } else if (stub) {
        console.log(`  dev stub agent: ${stub.agentUrl}`);
      } else {
        console.log("  hosted signup disabled — set ATOM_FLEET_MODE=docker or HOSTED_STUB_* for dev");
      }
    });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
