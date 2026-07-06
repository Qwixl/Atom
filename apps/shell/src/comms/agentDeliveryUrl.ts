/** Browser-relative admin URLs (e.g. /agent-api) cannot be used for server-side A2A delivery. */
export function resolveAgentDeliveryBase(adminUrl: string): string {
  const trimmed = adminUrl.trim().replace(/\/$/, "");
  if (!trimmed) return "http://127.0.0.1:5204";
  if (trimmed === "/agent-api" || trimmed.endsWith("/agent-api")) {
    const port =
      (import.meta.env.VITE_ATOM_INTERNAL_AGENT_PORT as string | undefined)?.trim() || "5204";
    return `http://127.0.0.1:${port}`;
  }
  if (trimmed.startsWith("/")) {
    return "http://127.0.0.1:5204";
  }
  return trimmed;
}

export function agentJsonRpcEndpoint(adminBase: string): string {
  return `${resolveAgentDeliveryBase(adminBase).replace(/\/$/, "")}/a2a/jsonrpc`;
}
