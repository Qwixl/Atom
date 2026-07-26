/**
 * ElevenLabs Conversational AI (ElevenAgents) — server-side token mint.
 * Browser never sees ELEVENLABS_API_KEY; shell uses short-lived conversation tokens.
 */

export type ElevenLabsConvAiConfig = {
  apiKey: string;
  agentId: string;
  apiBaseUrl: string;
};

export function loadElevenLabsConvAiConfig(
  env: NodeJS.ProcessEnv = process.env,
): ElevenLabsConvAiConfig | null {
  const apiKey =
    env.ELEVENLABS_API_KEY?.trim() ||
    env.ATOM_PLATFORM_ELEVENLABS_KEY?.trim() ||
    env.XI_API_KEY?.trim() ||
    "";
  const agentId =
    env.ELEVENLABS_AGENT_ID?.trim() ||
    env.ATOM_ELEVENLABS_AGENT_ID?.trim() ||
    env.ATOM_PLATFORM_ELEVENLABS_AGENT_ID?.trim() ||
    "";
  if (!apiKey || !agentId) return null;
  const apiBaseUrl = (env.ELEVENLABS_API_BASE_URL?.trim() || "https://api.elevenlabs.io").replace(
    /\/$/,
    "",
  );
  return { apiKey, agentId, apiBaseUrl };
}

export type ConvAiTokenResult = {
  token: string;
  agentId: string;
};

/** Mint a WebRTC conversation token for a private ElevenLabs agent. */
export async function mintElevenLabsConversationToken(
  config: ElevenLabsConvAiConfig,
  options?: { participantName?: string },
): Promise<ConvAiTokenResult> {
  const params = new URLSearchParams({ agent_id: config.agentId });
  const participant = options?.participantName?.trim();
  if (participant) params.set("participant_name", participant);

  const resp = await fetch(
    `${config.apiBaseUrl}/v1/convai/conversation/token?${params.toString()}`,
    {
      method: "GET",
      headers: { "xi-api-key": config.apiKey },
    },
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs ConvAI token HTTP ${resp.status}: ${errText.slice(0, 240)}`);
  }
  const body = (await resp.json()) as { token?: string };
  const token = body.token?.trim();
  if (!token) throw new Error("ElevenLabs ConvAI token response missing token");
  return { token, agentId: config.agentId };
}
