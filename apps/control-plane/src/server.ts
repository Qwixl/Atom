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
  ensureCommunityHost,
  handleFromEmail,
  newAgentId,
} from "./fleet/index.js";
import { requireProductionFleetTemplate } from "./fleet/publicUrl.js";
import { isHandleTaken, parseSignupHandle, publicHandle } from "./handles.js";
import { loadAgentStore, resolveDataDir, saveAgentStore } from "./fleet/store.js";
import type { FleetProvisioner, HostedAgentRecord } from "./fleet/types.js";
import { createRateLimiter } from "./rateLimit.js";
import { registerAccountRoutes } from "./accountRoutes.js";
import { registerWorkspaceRoutes } from "./workspaceRoutes.js";
import { registerModelBehaviorSightingsRoutes } from "./modelBehaviorSightingsRoutes.js";
import { isSupabaseConfigured } from "./supabaseAdmin.js";

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
const moduleFeedbackRateLimit = createRateLimiter(60 * 1000, 10);
const moduleAbuseRateLimit = createRateLimiter(60 * 1000, 5);
const commsAbuseRateLimit = createRateLimiter(60 * 1000, 5);
const reportAbuseRateLimit = createRateLimiter(60 * 1000, 5);
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
    await ensureCommunityHost(dataDir);
  }
}

async function persistAgents(): Promise<void> {
  await saveAgentStore(dataDir, agents);
}

registerAccountRoutes(app, {
  fleet: () => fleet,
  fleetAgents: () => agents,
  persistAgents,
});
registerWorkspaceRoutes(app, {
  fleet: () => fleet,
  fleetAgents: () => agents,
  persistAgents,
});
registerModelBehaviorSightingsRoutes(app, { requireProvisionAuth });

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "atom-control-plane",
    version: "0.3.0-m15",
    fleetMode: fleet?.mode ?? "loading",
    agents: agents.size,
    dataDir,
    supabase: isSupabaseConfigured(),
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
  if (isProduction && !provisionSecret) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!requireProvisionAuth(req, res)) return;
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
  if (isProduction && !provisionSecret) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!requireProvisionAuth(req, res)) return;
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
  if (isProduction && !provisionSecret) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!requireProvisionAuth(req, res)) return;
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

app.post("/report-abuse", reportAbuseRateLimit, (req, res) => {
  const target = String((req.body as { agentUrl?: string; reason?: string }).agentUrl ?? "")
    .trim()
    .slice(0, 500);
  const reason = String((req.body as { reason?: string }).reason ?? "")
    .trim()
    .slice(0, 2000);
  if (!target) {
    res.status(400).json({ error: "agentUrl required" });
    return;
  }
  console.log(`[abuse-report] target=${target} reason=${reason || "(none)"}`);
  res.json({ received: true, target, status: "queued" });
});

app.post("/module-feedback", moduleFeedbackRateLimit, (req, res) => {
  const body = req.body as {
    moduleId?: string;
    version?: string;
    rating?: number;
    comment?: string;
  };
  const moduleId = String(body.moduleId ?? "").trim().slice(0, 200);
  const version = String(body.version ?? "").trim().slice(0, 200);
  const rating = typeof body.rating === "number" ? body.rating : Number(body.rating);
  const comment = String(body.comment ?? "").trim().slice(0, 2000);
  if (!moduleId || !version) {
    res.status(400).json({ error: "moduleId and version required" });
    return;
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be 1–5" });
    return;
  }
  console.log(
    `[module-feedback] ${moduleId}@${version} rating=${rating} comment=${comment || "(none)"}`,
  );
  res.json({ received: true, moduleId, version, rating, status: "queued" });
});

const MODULE_ABUSE_CATEGORIES = new Set([
  "malware",
  "phishing",
  "prohibited-content",
  "privacy",
  "spam",
  "other",
]);

/** M-TS-04: owner reports against a curated/third-party catalog listing. */
app.post("/module-abuse-report", moduleAbuseRateLimit, (req, res) => {
  const body = req.body as {
    moduleId?: string;
    version?: string;
    category?: string;
    details?: string;
    publisher?: string;
  };
  const moduleId = String(body.moduleId ?? "").trim();
  const version = String(body.version ?? "").trim();
  const category = String(body.category ?? "").trim();
  const details = String(body.details ?? "").trim().slice(0, 2000);
  const publisher = String(body.publisher ?? "").trim().slice(0, 200);
  if (!moduleId || !version) {
    res.status(400).json({ error: "moduleId and version required" });
    return;
  }
  if (!MODULE_ABUSE_CATEGORIES.has(category)) {
    res.status(400).json({
      error: `category must be one of: ${[...MODULE_ABUSE_CATEGORIES].join(", ")}`,
    });
    return;
  }
  console.log(
    `[module-abuse] ${moduleId}@${version} category=${category} publisher=${publisher || "(none)"} details=${details || "(none)"}`,
  );
  res.json({
    received: true,
    moduleId,
    version,
    category,
    status: "queued",
    next: "Operators review logs, update registry revocations.json, redeploy index; shells evict via syncRevocations()",
  });
});

const COMMS_ABUSE_CATEGORIES = new Set([
  "harassment",
  "spam",
  "scam",
  "illegal-content",
  "csam",
  "impersonation",
  "other",
]);

/** M-TS-08: peer/contact report. Metadata only — no MLS plaintext. */
app.post("/comms-abuse-report", commsAbuseRateLimit, (req, res) => {
  const body = req.body as {
    peerDid?: string;
    category?: string;
    details?: string;
    peerEndpoint?: string;
    peerHandle?: string;
    peerName?: string;
    roomId?: string;
    alsoBlock?: boolean;
  };
  const peerDid = String(body.peerDid ?? "").trim();
  const category = String(body.category ?? "").trim();
  const details = String(body.details ?? "").trim().slice(0, 2000);
  const peerEndpoint = String(body.peerEndpoint ?? "").trim().slice(0, 500);
  const peerHandle = String(body.peerHandle ?? "").trim().slice(0, 120);
  const peerName = String(body.peerName ?? "").trim().slice(0, 120);
  const roomId = String(body.roomId ?? "").trim().slice(0, 200);
  if (!peerDid) {
    res.status(400).json({ error: "peerDid required" });
    return;
  }
  if (!COMMS_ABUSE_CATEGORIES.has(category)) {
    res.status(400).json({
      error: `category must be one of: ${[...COMMS_ABUSE_CATEGORIES].join(", ")}`,
    });
    return;
  }
  console.log(
    `[comms-abuse] peerDid=${peerDid} category=${category} handle=${peerHandle || "(none)"} endpoint=${peerEndpoint || "(none)"} room=${roomId || "(none)"} alsoBlock=${body.alsoBlock === true} details=${details || "(none)"} name=${peerName || "(none)"}`,
  );
  res.json({
    received: true,
    peerDid,
    category,
    status: "queued",
    next: "Operators triage logs; metadata-only. Escalate hosted agents via POST /agents/:id/suspend when peerEndpoint matches fleet.",
  });
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
