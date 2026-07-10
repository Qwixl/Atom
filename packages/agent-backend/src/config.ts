import { PRODUCTION_SHELL_ORIGIN } from "@qwixl/shell-core";

export interface AgentBackendConfig {
  port: number;
  host: string;
  publicBaseUrl: string;
  agentName: string;
  allowedOrigins: ReadonlySet<string>;
  stripeSecretKey: string | null;
  stripePublishableKey: string | null;
  stripeProductId: string | null;
  businessMode: boolean;
  businessDomain: string | null;
  demoPeerMode: boolean;
  /** Seed the Qwixl Coffee Shop room on startup (community host agents). */
  communityHostMode: boolean;
  /** Pluggable business reference index (M12.8). v1 default: json. */
  businessKnowledgeBackend: import("./businessKnowledgeBackend.js").BusinessKnowledgeBackendKind;
  businessKnowledgeRemoteUrl: string | null;
  /** Prompt on port conflict when using default PORT (dev CLI). */
  interactivePortResolve: boolean;
  /**
   * Agent Brain always-on heartbeat (D078 / BK-45 entitlement).
   * When false, BrainScheduler still starts but skips firing (duty-cycle).
   */
  brainAlwaysOn: boolean;
  /** BrainScheduler tick interval ms (default 60000). */
  brainIntervalMs: number;
}

const DEFAULT_SHELL_ORIGINS = [
  "http://localhost:5200",
  "http://127.0.0.1:5200",
  "http://localhost:5203",
  "http://127.0.0.1:5203",
  PRODUCTION_SHELL_ORIGIN,
];

function parseBusinessKnowledgeBackend(
  raw: string | undefined,
): import("./businessKnowledgeBackend.js").BusinessKnowledgeBackendKind {
  const value = raw?.trim().toLowerCase();
  if (value === "json" || value === "sqlite" || value === "remote") return value;
  return "json";
}

export function loadAgentBackendConfig(env: NodeJS.ProcessEnv = process.env): AgentBackendConfig {
  const host = env.HOST?.trim() || "127.0.0.1";
  const portExplicit = env.PORT !== undefined && env.PORT.trim() !== "";
  const port = Number(env.PORT ?? 5204);
  const publicBaseUrlExplicit = Boolean(env.PUBLIC_BASE_URL?.trim());
  const publicBaseUrl = env.PUBLIC_BASE_URL?.trim() || `http://${host}:${port}`;
  const agentName = env.AGENT_NAME?.trim() || "Atom agent";
  const extra =
    env.ATOM_SHELL_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  return {
    port,
    host,
    publicBaseUrl,
    agentName,
    allowedOrigins: new Set([...DEFAULT_SHELL_ORIGINS, ...extra]),
    stripeSecretKey: env.STRIPE_SECRET_KEY?.trim() || null,
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY?.trim() || null,
    stripeProductId: env.ATOM_STRIPE_PRODUCT_ID?.trim() || null,
    businessMode:
      env.ATOM_BUSINESS_MODE === "1" ||
      env.ATOM_BUSINESS_MODE === "true" ||
      env.ATOM_WORKSPACE_KIND?.trim().toLowerCase() === "business",
    businessDomain: env.ATOM_BUSINESS_DOMAIN?.trim() || null,
    demoPeerMode: env.ATOM_DEMO_PEER === "1" || env.ATOM_DEMO_PEER === "true",
    communityHostMode:
      env.ATOM_COMMUNITY_HOST === "1" ||
      env.ATOM_COMMUNITY_HOST === "true" ||
      env.ATOM_COFFEE_SHOP === "1" ||
      env.ATOM_COFFEE_SHOP === "true",
    businessKnowledgeBackend: parseBusinessKnowledgeBackend(env.ATOM_BUSINESS_KNOWLEDGE_BACKEND),
    businessKnowledgeRemoteUrl: env.ATOM_BUSINESS_KNOWLEDGE_REMOTE_URL?.trim() || null,
    interactivePortResolve:
      (env.ATOM_PORT_PROMPT === "1" || env.ATOM_PORT_PROMPT === "true") &&
      !portExplicit &&
      !publicBaseUrlExplicit,
    brainAlwaysOn:
      env.ATOM_BRAIN_ALWAYS_ON !== "0" && env.ATOM_BRAIN_ALWAYS_ON !== "false",
    brainIntervalMs: Math.max(
      5_000,
      Number(env.ATOM_BRAIN_INTERVAL_MS?.trim() || 60_000) || 60_000,
    ),
  };
}
