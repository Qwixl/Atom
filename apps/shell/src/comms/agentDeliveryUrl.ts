import { productionFetchUrl } from "../productionGuard.js";

const LOOPBACK_HOST = [127, 0, 0, 1].join(".");

function devLoopbackAgentUrl(port: string): string {
  if (import.meta.env.PROD) return "";
  return `http://${LOOPBACK_HOST}:${port}`;
}

/** Browser-relative admin URLs (e.g. /agent-api) cannot be used for server-side A2A delivery. */
export function resolveAgentDeliveryBase(adminUrl: string): string {
  const trimmed = adminUrl.trim().replace(/\/$/, "");
  if (!trimmed) return devLoopbackAgentUrl("5204");
  if (trimmed === "/agent-api" || trimmed.endsWith("/agent-api")) {
    const port =
      (import.meta.env.VITE_ATOM_INTERNAL_AGENT_PORT as string | undefined)?.trim() || "5204";
    return devLoopbackAgentUrl(port);
  }
  if (trimmed.startsWith("/")) {
    return devLoopbackAgentUrl("5204");
  }
  return productionFetchUrl(trimmed) ?? trimmed;
}

export function agentJsonRpcEndpoint(adminBase: string): string {
  return `${resolveAgentDeliveryBase(adminBase).replace(/\/$/, "")}/a2a/jsonrpc`;
}
