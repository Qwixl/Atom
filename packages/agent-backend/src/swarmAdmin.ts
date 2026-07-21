import type { Express, Request, Response } from "express";
import type { SwarmMemoryStore } from "./swarmMemoryStore.js";
import { sharedGreeterGovernor } from "./greeterGovernor.js";
import { sharedPoliceMonitor } from "./policeMonitor.js";
import { loadFounderAlertConfig } from "./founderAlert.js";
import type { BanLadderStore } from "./banLadder.js";
import { runSwarmPlanPass, runSwarmReflectPass } from "./swarmReflect.js";
import {
  openSwarmSocialDialogue,
  pickRandomCommunityFriend,
  type SwarmSocialAutonomyDeps,
} from "./swarmSocialAutonomy.js";
import {
  SOCIAL_MAX_MESSAGES,
  SOCIAL_MIN_MESSAGES,
  SOCIAL_PAIR_COOLDOWN_HOURS,
  type SwarmSocialDialogueStore,
} from "./swarmSocialDialogue.js";
import {
  runVenuePresenceTick,
  type SwarmVenuePresenceDeps,
} from "./swarmVenuePresence.js";

export function registerSwarmAdminRoutes(
  app: Express,
  deps: {
    memory: SwarmMemoryStore | null;
    agentKind: string;
    bans: BanLadderStore | null;
    socialStore?: SwarmSocialDialogueStore | null;
    socialAutonomy?: SwarmSocialAutonomyDeps | null;
    venuePresence?: SwarmVenuePresenceDeps | null;
  },
): void {
  app.get("/swarm/status", (_req: Request, res: Response) => {
    const core = deps.memory?.getCoreSheet() ?? null;
    const mutable = deps.memory?.getMutableSheet() ?? null;
    res.json({
      agentKind: deps.agentKind,
      memoryLoaded: Boolean(deps.memory),
      coreName: core?.name ?? null,
      mood: mutable?.mood ?? null,
      policeFindings: deps.agentKind === "swarm-police" ? sharedPoliceMonitor.listFindings(10) : [],
      activeBans: deps.bans?.listActive(20) ?? [],
    });
  });

  /** Read-only operator snapshot (AS-10 v1). */
  app.get("/swarm/dashboard", (_req: Request, res: Response) => {
    res.json({
      generatedAt: new Date().toISOString(),
      agentKind: deps.agentKind,
      killSwitch: process.env.ATOM_KILL_SWITCH === "1" || process.env.ATOM_KILL_SWITCH === "true",
      core: deps.memory?.getCoreSheet() ?? null,
      mutable: deps.memory?.getMutableSheet() ?? null,
      recentFindings: sharedPoliceMonitor.listFindings(25),
      activeBans: deps.bans?.listActive(50) ?? [],
      founderAlertConfigured: Boolean(loadFounderAlertConfig()),
      social: deps.socialStore?.snapshot() ?? null,
      socialCaps: {
        minMessages: SOCIAL_MIN_MESSAGES,
        maxMessages: SOCIAL_MAX_MESSAGES,
        pairCooldownHours: SOCIAL_PAIR_COOLDOWN_HOURS,
        openersPerDay: 1,
      },
    });
  });

  app.get("/swarm/social/status", (_req: Request, res: Response) => {
    if (deps.agentKind !== "swarm-npc" || !deps.socialStore) {
      res.status(404).json({ error: "social autonomy only on swarm-npc" });
      return;
    }
    deps.socialStore.sweepStaleDialogues();
    res.json({
      ...deps.socialStore.snapshot(),
      caps: {
        minMessages: SOCIAL_MIN_MESSAGES,
        maxMessages: SOCIAL_MAX_MESSAGES,
        pairCooldownHours: SOCIAL_PAIR_COOLDOWN_HOURS,
        openersPerDay: 1,
      },
    });
  });

  /**
   * Start one autonomous NPC↔NPC DM (D091). Host `social_tick.sh` calls this
   * on at most one initiator per hour swarm-wide.
   */
  app.post("/swarm/social/open", async (req: Request, res: Response) => {
    if (deps.agentKind !== "swarm-npc" || !deps.socialAutonomy) {
      res.status(404).json({ error: "social open only on swarm-npc" });
      return;
    }
    const friendRaw = String(req.body?.friend ?? "").trim();
    const friend =
      friendRaw ||
      pickRandomCommunityFriend(deps.socialAutonomy.swarmSeedId)?.id ||
      "";
    if (!friend) {
      res.status(400).json({ error: "friend required (or empty roster)" });
      return;
    }
    const peerDid =
      typeof req.body?.peerDid === "string" && req.body.peerDid.trim()
        ? req.body.peerDid.trim()
        : undefined;
    const peerUrl =
      typeof req.body?.peerUrl === "string" && req.body.peerUrl.trim()
        ? req.body.peerUrl.trim()
        : undefined;
    try {
      const result = await openSwarmSocialDialogue(deps.socialAutonomy, friend, {
        peerDid,
        peerUrl,
      });
      if (!result.ok) {
        res.status(409).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * Home-venue shift presence (D093 / AS-19). Host cron calls every ~15m.
   * On shift → join home room; off shift → leave.
   */
  app.post("/swarm/venue/presence-tick", async (_req: Request, res: Response) => {
    if (deps.agentKind !== "swarm-npc" || !deps.venuePresence) {
      res.status(404).json({ error: "venue presence only on swarm-npc with homeShift" });
      return;
    }
    try {
      const result = await runVenuePresenceTick(deps.venuePresence);
      if (!result.ok) {
        res.status(409).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/swarm/greeter/enter", (req: Request, res: Response) => {
    const placeId = String(req.body?.placeId ?? "").trim();
    const humanDid = String(req.body?.humanDid ?? "").trim();
    if (!placeId || !humanDid) {
      res.status(400).json({ error: "placeId and humanDid required" });
      return;
    }
    sharedGreeterGovernor.noteHumanEntered(placeId, humanDid);
    res.json({ ok: true });
  });

  app.post("/swarm/greeter/claim", (req: Request, res: Response) => {
    const placeId = String(req.body?.placeId ?? "").trim();
    const humanDid = String(req.body?.humanDid ?? "").trim();
    const npcDid = String(req.body?.npcDid ?? "").trim();
    if (!placeId || !humanDid || !npcDid) {
      res.status(400).json({ error: "placeId, humanDid, and npcDid required" });
      return;
    }
    const result = sharedGreeterGovernor.tryClaimGreeter(placeId, humanDid, npcDid);
    res.json(result);
  });

  app.post("/swarm/memory/retrieve", (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(404).json({ error: "swarm memory not loaded" });
      return;
    }
    const query = String(req.body?.query ?? "").trim();
    const limit = Math.min(30, Math.max(1, Number(req.body?.limit) || 12));
    res.json({ memories: deps.memory.retrieve(query, limit) });
  });

  /** Bootstrap / ops — set immutable core once (or replace with founder approval). */
  app.put("/swarm/memory/core", (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(404).json({ error: "swarm memory not loaded" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const reasonForBeing =
      typeof body.reasonForBeing === "string" ? body.reasonForBeing.trim() : "";
    const voice = typeof body.voice === "string" ? body.voice.trim() : "";
    if (!name || !role || !reasonForBeing || !voice) {
      res.status(400).json({
        error: "name, role, reasonForBeing, and voice required",
      });
      return;
    }
    const values = Array.isArray(body.values)
      ? body.values.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    const hardBans = Array.isArray(body.hardBans)
      ? body.hardBans.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    deps.memory.setCoreSheet({ name, role, reasonForBeing, values, hardBans, voice });
    res.json({ ok: true, core: deps.memory.getCoreSheet() });
  });

  app.post("/swarm/reflect", (req: Request, res: Response) => {
    if (deps.agentKind !== "swarm-npc" || !deps.memory) {
      res.status(404).json({ error: "reflect only on swarm-npc with memory" });
      return;
    }
    const focus = String(req.body?.focus ?? "today plans relationships places").trim();
    const placeId = String(req.body?.placeId ?? "coffee-shop").trim();
    const reflect = runSwarmReflectPass(deps.memory, focus);
    const planId = runSwarmPlanPass(
      deps.memory,
      placeId,
      String(req.body?.plan ?? "Continue venue presence within greeter caps"),
    );
    res.json({ ok: true, reflect, planId });
  });

  /** Police only — ingest NPC sample; never human ops. */
  app.post("/swarm/police/ingest", async (req: Request, res: Response) => {
    if (deps.agentKind !== "swarm-police") {
      res.status(403).json({ error: "police ingest only on swarm-police agents" });
      return;
    }
    const npcDid = String(req.body?.npcDid ?? "").trim();
    const text = String(req.body?.text ?? "").trim();
    const agentKind = String(req.body?.agentKind ?? "swarm-npc").trim();
    if (!npcDid || !text) {
      res.status(400).json({ error: "npcDid and text required" });
      return;
    }
    if (agentKind === "owner") {
      res.status(400).json({ error: "Police-Agent does not process owner/human agent samples" });
      return;
    }
    const finding = sharedPoliceMonitor.ingest({
      npcDid,
      text,
      agentKind,
      placeId: typeof req.body?.placeId === "string" ? req.body.placeId : undefined,
    });
    let alert: { sent: boolean; error?: string } | null = null;
    if (finding && (finding.severity === "warning" || finding.severity === "critical")) {
      alert = await sharedPoliceMonitor.alertFounder(finding, loadFounderAlertConfig());
    }
    res.json({ finding, alert });
  });

  app.get("/swarm/police/findings", (req: Request, res: Response) => {
    if (deps.agentKind !== "swarm-police") {
      res.status(403).json({ error: "findings only on swarm-police agents" });
      return;
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    res.json({ findings: sharedPoliceMonitor.listFindings(limit) });
  });

  app.post("/swarm/bans/apply", (req: Request, res: Response) => {
    if (!deps.bans) {
      res.status(404).json({ error: "ban ladder not loaded" });
      return;
    }
    const subjectKey = String(req.body?.subjectKey ?? "").trim();
    const reason = String(req.body?.reason ?? "").trim();
    const evidenceRef = String(req.body?.evidenceRef ?? "").trim();
    if (!subjectKey || !reason || !evidenceRef) {
      res.status(400).json({ error: "subjectKey, reason, evidenceRef required" });
      return;
    }
    const forceRung = [1, 2, 3, 4].includes(Number(req.body?.forceRung))
      ? (Number(req.body.forceRung) as 1 | 2 | 3 | 4)
      : undefined;
    const record = deps.bans.applyBan({
      subjectKey,
      reason,
      evidenceRef,
      circumvention: Boolean(req.body?.circumvention),
      forceRung,
    });
    res.json({ ban: record });
  });

  app.get("/swarm/bans/active", (req: Request, res: Response) => {
    if (!deps.bans) {
      res.status(404).json({ error: "ban ladder not loaded" });
      return;
    }
    const subjectKey = String(req.query.subjectKey ?? "").trim();
    if (subjectKey) {
      res.json({ ban: deps.bans.getActiveBan(subjectKey) });
      return;
    }
    res.json({ bans: deps.bans.listActive(100) });
  });
}
