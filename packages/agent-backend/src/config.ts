export interface AgentBackendConfig {
  port: number;
  host: string;
  publicBaseUrl: string;
  agentName: string;
  allowedOrigins: ReadonlySet<string>;
  googleCalendarAccessToken: string | null;
  stripeSecretKey: string | null;
  stripePublishableKey: string | null;
  stripeProductId: string | null;
}

const DEFAULT_SHELL_ORIGINS = [
  "http://localhost:5200",
  "http://127.0.0.1:5200",
  "http://localhost:5203",
  "http://127.0.0.1:5203",
  "https://shell-atom.vercel.app",
];

export function loadAgentBackendConfig(env: NodeJS.ProcessEnv = process.env): AgentBackendConfig {
  const host = env.HOST?.trim() || "127.0.0.1";
  const port = Number(env.PORT ?? 5204);
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
    googleCalendarAccessToken:
      env.GOOGLE_CALENDAR_ACCESS_TOKEN?.trim() ||
      env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() ||
      null,
    stripeSecretKey: env.STRIPE_SECRET_KEY?.trim() || null,
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY?.trim() || null,
    stripeProductId: env.ATOM_STRIPE_PRODUCT_ID?.trim() || null,
  };
}
