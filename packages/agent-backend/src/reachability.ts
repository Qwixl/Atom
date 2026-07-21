import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentKindConfig } from "./config.js";

export type ReachabilityMode = "session" | "sleep" | "hourly_wake" | "always_on";

const REACHABILITY_VALUES: ReadonlySet<string> = new Set([
  "session",
  "sleep",
  "hourly_wake",
  "always_on",
]);

const HOURLY_WAKE_WINDOW_MINUTES = 5;

export interface ReachabilityConfig {
  mode: ReachabilityMode;
  /** Seed for hourly wake jitter (agent id or public base URL). */
  wakeSeed: string;
  /** Community / room hosts refuse sleep reachability. */
  forceAlwaysOn: boolean;
}

export interface ReachabilityEnvInput {
  ATOM_REACHABILITY?: string;
  ATOM_BRAIN_ALWAYS_ON?: string;
  ATOM_AGENT_KIND?: string;
  ATOM_COMMUNITY_HOST?: string;
  ATOM_COFFEE_SHOP?: string;
  PUBLIC_BASE_URL?: string;
}

export interface ResolveReachabilityOptions {
  env?: ReachabilityEnvInput;
  agentKind?: AgentKindConfig;
  communityHostMode?: boolean;
  /** Agent DID or other stable id for wake jitter. */
  agentId?: string;
  publicBaseUrl?: string;
}

function parseReachabilityRaw(raw: string | undefined): ReachabilityMode | null {
  const value = raw?.trim().toLowerCase();
  if (!value || !REACHABILITY_VALUES.has(value)) return null;
  return value as ReachabilityMode;
}

function isCommunityHostForcedAlwaysOn(
  env: ReachabilityEnvInput,
  agentKind?: AgentKindConfig,
  communityHostMode?: boolean,
): boolean {
  if (communityHostMode) return true;
  const kind = env.ATOM_AGENT_KIND?.trim().toLowerCase() ?? agentKind;
  if (kind === "community-host" || kind === "community_host" || kind === "room-host") {
    return true;
  }
  return (
    env.ATOM_COMMUNITY_HOST === "1" ||
    env.ATOM_COMMUNITY_HOST === "true" ||
    env.ATOM_COFFEE_SHOP === "1" ||
    env.ATOM_COFFEE_SHOP === "true"
  );
}

/** FNV-1a 32-bit — stable jitter for hourly wake minute. */
export function hashWakeSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function hourlyWakeMinute(seed: string): number {
  return hashWakeSeed(seed) % 60;
}

/** True for five consecutive UTC minutes each hour (jittered by wake seed). */
export function isInHourlyWakeWindow(now: Date, seed: string): boolean {
  const wakeMinute = hourlyWakeMinute(seed);
  const minute = now.getUTCMinutes();
  const offset = (minute - wakeMinute + 60) % 60;
  return offset < HOURLY_WAKE_WINDOW_MINUTES;
}

export function secondsUntilHourlyWakeWindow(now: Date, seed: string): number {
  if (isInHourlyWakeWindow(now, seed)) return 0;
  const wakeMinute = hourlyWakeMinute(seed);
  const minute = now.getUTCMinutes();
  const second = now.getUTCSeconds();
  const offset = (minute - wakeMinute + 60) % 60;
  if (offset >= HOURLY_WAKE_WINDOW_MINUTES) {
    const minutesUntil = 60 - minute + wakeMinute;
    return minutesUntil * 60 - second;
  }
  const minutesUntil = wakeMinute - minute;
  return minutesUntil * 60 - second;
}

export function resolveReachabilityConfig(
  options: ResolveReachabilityOptions = {},
): ReachabilityConfig {
  const env = options.env ?? (process.env as ReachabilityEnvInput);
  const forceAlwaysOn = isCommunityHostForcedAlwaysOn(
    env,
    options.agentKind,
    options.communityHostMode,
  );
  const wakeSeed =
    options.agentId?.trim() ||
    options.publicBaseUrl?.trim() ||
    env.PUBLIC_BASE_URL?.trim() ||
    "atom-agent";

  const explicit = parseReachabilityRaw(env.ATOM_REACHABILITY);
  let mode: ReachabilityMode;
  if (forceAlwaysOn) {
    mode = "always_on";
  } else if (explicit) {
    mode = explicit;
  } else if (env.ATOM_BRAIN_ALWAYS_ON === "0" || env.ATOM_BRAIN_ALWAYS_ON === "false") {
    mode = "session";
  } else {
    mode = "always_on";
  }

  return { mode, wakeSeed, forceAlwaysOn };
}

export function effectiveReachabilityMode(config: ReachabilityConfig): ReachabilityMode {
  return config.forceAlwaysOn ? "always_on" : config.mode;
}

/** Brain heartbeat / standing intents — session and sleep stay duty-cycled. */
export function isBrainReachable(
  config: ReachabilityConfig,
  now: Date = new Date(),
): boolean {
  const mode = effectiveReachabilityMode(config);
  if (mode === "always_on") return true;
  if (mode === "hourly_wake") return isInHourlyWakeWindow(now, config.wakeSeed);
  return false;
}

export interface InboundReachabilityVerdict {
  accept: boolean;
  error?: "agent_asleep";
  message?: string;
  retryAfterSec?: number;
}

export function evaluateInboundReachability(
  config: ReachabilityConfig,
  now: Date = new Date(),
): InboundReachabilityVerdict {
  const mode = effectiveReachabilityMode(config);
  if (mode === "always_on" || mode === "session") {
    return { accept: true };
  }
  if (mode === "sleep") {
    return {
      accept: false,
      error: "agent_asleep",
      message: "asleep, try later",
    };
  }
  if (mode === "hourly_wake") {
    if (isInHourlyWakeWindow(now, config.wakeSeed)) {
      return { accept: true };
    }
    return {
      accept: false,
      error: "agent_asleep",
      message: "asleep, try later",
      retryAfterSec: secondsUntilHourlyWakeWindow(now, config.wakeSeed),
    };
  }
  return { accept: true };
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/** Best-effort issuer DID from JSON-RPC body (opaque path — no decrypt). */
export function extractFromDidFromRawBody(raw: Buffer): string | undefined {
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as {
      params?: Record<string, unknown>;
    };
    const params = parsed.params;
    if (!params || typeof params !== "object") return undefined;
    for (const value of Object.values(params)) {
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const issuerDid = record.issuerDid;
        if (typeof issuerDid === "string" && issuerDid.trim()) {
          return issuerDid.trim();
        }
      }
    }
  } catch {
    /* opaque blob */
  }
  return undefined;
}

export interface InboundReachabilityGateDeps {
  config: ReachabilityConfig;
  now?: () => Date;
  enqueue: (input: { blob: Buffer; fromDid?: string }) => void | Promise<void>;
}

/** Express middleware — rejects A2A POST when agent is asleep and queues ciphertext blob. */
export function createInboundReachabilityMiddleware(
  deps: InboundReachabilityGateDeps,
): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void {
  const now = deps.now ?? (() => new Date());
  return (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    const verdict = evaluateInboundReachability(deps.config, now());
    if (verdict.accept) {
      next();
      return;
    }
    void (async () => {
      try {
        const raw = await readRawBody(req);
        await deps.enqueue({
          blob: raw,
          fromDid: extractFromDidFromRawBody(raw),
        });
        const body: Record<string, unknown> = {
          error: verdict.error ?? "agent_asleep",
          message: verdict.message ?? "asleep, try later",
        };
        if (verdict.retryAfterSec !== undefined) {
          body.retryAfterSec = verdict.retryAfterSec;
          res.setHeader("Retry-After", String(verdict.retryAfterSec));
        }
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(body));
      } catch (error) {
        next(error);
      }
    })();
  };
}

/** Wake tick: expire stale blobs and log pending count (no auto-processing). */
export function runAsleepInboxWakeNotification(
  list: () => { id: string }[],
  purgeExpired: () => number,
): number {
  purgeExpired();
  const pending = list();
  if (pending.length > 0) {
    console.log(
      `[chronicle] asleep-inbox: ${pending.length} encrypted message(s) pending owner wake (not auto-processed)`,
    );
  }
  return pending.length;
}
