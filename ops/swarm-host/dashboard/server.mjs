#!/usr/bin/env node
/**
 * Atom swarm operator dashboard — LAN-only aggregator.
 * Reads each NPC meta.json + admin.token under ~/atom/state/npcs, polls agent APIs.
 *
 *   HOST=0.0.0.0 PORT=8080 node ops/swarm-host/dashboard/server.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || os.homedir();
const NPC_ROOT = process.env.ATOM_NPC_DIR || path.join(HOME, "atom", "state", "npcs");
const LOG_ROOT = process.env.ATOM_NPC_LOG_DIR || path.join(HOME, "atom", "logs", "npcs");
const HEARTBEAT_PATH =
  process.env.ATOM_HEARTBEAT_PATH || path.join(HOME, "atom", "state", "heartbeat", "heartbeat.json");
const CHRONICLE_DIR =
  process.env.ATOM_CHRONICLE_DIR || path.join(HOME, "atom", "state", "chronicles");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, "public");

function listNpc() {
  if (!fs.existsSync(NPC_ROOT)) return [];
  return fs
    .readdirSync(NPC_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(NPC_ROOT, d.name);
      const metaPath = path.join(dir, "meta.json");
      const tokenPath = path.join(dir, "admin.token");
      if (!fs.existsSync(metaPath) || !fs.existsSync(tokenPath)) return null;
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      const token = fs.readFileSync(tokenPath, "utf8").trim();
      return { id: d.name, dir, meta, token, port: meta.port };
    })
    .filter(Boolean)
    .sort((a, b) => a.port - b.port);
}

async function fetchJson(url, token, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    clearTimeout(timer);
  }
}

function tailLog(id, maxLines = 40) {
  const file = path.join(LOG_ROOT, `${id}.log`);
  if (!fs.existsSync(file)) return [];
  try {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function latestChronicleSnippet(maxChars = 2500) {
  if (!fs.existsSync(CHRONICLE_DIR)) return null;
  const files = fs
    .readdirSync(CHRONICLE_DIR)
    .filter((f) => f.startsWith("chronicle-") && f.endsWith(".md"))
    .sort()
    .reverse();
  if (!files[0]) return null;
  const full = path.join(CHRONICLE_DIR, files[0]);
  const text = fs.readFileSync(full, "utf8");
  return { file: files[0], text: text.slice(-maxChars) };
}

function readHeartbeat() {
  try {
    return JSON.parse(fs.readFileSync(HEARTBEAT_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function snapshotNpc(npc) {
  const base = `http://127.0.0.1:${npc.port}`;
  const [health, dash, brain, intents, pending, memories] = await Promise.all([
    fetchJson(`${base}/health`, npc.token),
    fetchJson(`${base}/swarm/dashboard`, npc.token),
    fetchJson(`${base}/brain/status`, npc.token),
    fetchJson(`${base}/brain/intents`, npc.token),
    fetchJson(`${base}/brain/pending?undelivered=1`, npc.token),
    fetchJson(`${base}/swarm/memory/retrieve`, npc.token, {
      method: "POST",
      body: JSON.stringify({
        query: "plans goals dialogue reflections presence relationships today",
        limit: 10,
      }),
    }),
  ]);

  const d = dash.ok ? dash.body : null;
  const core = d?.core ?? null;
  const mutable = d?.mutable ?? null;
  return {
    id: npc.id,
    handle: npc.meta.handle ?? null,
    displayName: npc.meta.displayName ?? core?.name ?? npc.id,
    homePlace: npc.meta.homePlace ?? null,
    agentKind: npc.meta.agentKind ?? d?.agentKind ?? null,
    port: npc.port,
    up: Boolean(health.ok),
    healthStatus: health.status,
    did: health.body?.did ?? null,
    killSwitch: Boolean(d?.killSwitch),
    founderAlertConfigured: Boolean(d?.founderAlertConfigured),
    core,
    mutable,
    mood: mutable?.mood ?? null,
    shortGoals: mutable?.shortGoals ?? [],
    traits: mutable?.traits ?? {},
    brain: brain.ok ? brain.body : null,
    intents: intents.ok ? intents.body?.intents ?? [] : [],
    pending: pending.ok ? pending.body?.notifications ?? [] : [],
    memories: memories.ok ? memories.body?.memories ?? [] : [],
    recentFindings: d?.recentFindings ?? [],
    activeBans: d?.activeBans ?? [],
    logTail: tailLog(npc.id),
    errors: [
      !health.ok ? `health:${health.status}` : null,
      !dash.ok ? `dashboard:${dash.status}` : null,
      !brain.ok ? `brain:${brain.status}` : null,
    ].filter(Boolean),
  };
}

async function buildSnapshot() {
  const npcs = listNpc();
  const agents = await Promise.all(npcs.map((n) => snapshotNpc(n)));
  const police = agents.find((a) => a.agentKind === "swarm-police") ?? null;
  const findings = police?.recentFindings?.length
    ? police.recentFindings
    : agents.flatMap((a) => (a.recentFindings || []).map((f) => ({ ...f, from: a.id })));
  return {
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    heartbeat: readHeartbeat(),
    chronicle: latestChronicleSnippet(),
    summary: {
      total: agents.length,
      up: agents.filter((a) => a.up).length,
      policeUp: Boolean(police?.up),
      killSwitch: agents.some((a) => a.killSwitch),
      pendingAlerts: agents.reduce((n, a) => n + (a.pending?.length || 0), 0),
      findings: findings.length,
    },
    agents,
    findings: findings.slice(0, 40),
  };
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/snapshot") {
    try {
      const snap = await buildSnapshot();
      send(res, 200, snap);
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const file = path.join(PUBLIC_DIR, "index.html");
    send(res, 200, fs.readFileSync(file, "utf8"), contentType(file));
    return;
  }
  if (req.method === "GET" && !url.pathname.includes("..")) {
    const file = path.join(PUBLIC_DIR, url.pathname.replace(/^\//, ""));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      send(res, 200, fs.readFileSync(file, "utf8"), contentType(file));
      return;
    }
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Atom swarm dashboard http://${HOST}:${PORT}/  (npcRoot=${NPC_ROOT})`);
});
