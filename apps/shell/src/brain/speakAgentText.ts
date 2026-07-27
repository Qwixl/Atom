import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import type { CommsAgentConfig } from "../comms/types.js";

/** Speak agent reply text via the agent voice API (best-effort). */
export async function speakAgentText(
  text: string,
  config: CommsAgentConfig,
  options?: { humanFilter?: boolean },
): Promise<void> {
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return;
  try {
    const admin = config.adminToken?.trim() ? config : await loadCommsAgentConfigSecure();
    const base = admin.adminUrl.replace(/\/$/, "");
    const syn = await fetch(`${base}/voice/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(admin.adminToken?.trim()
          ? { Authorization: `Bearer ${admin.adminToken.trim()}` }
          : {}),
      },
      body: JSON.stringify({
        text: trimmed,
        humanFilter: options?.humanFilter !== false,
      }),
    });
    const body = (await syn.json().catch(() => ({}))) as {
      audioBase64?: string | null;
      mimeType?: string | null;
    };
    if (!syn.ok || !body.audioBase64) return;
    const mime = body.mimeType || "audio/mpeg";
    const audio = new Audio(`data:${mime};base64,${body.audioBase64}`);
    await audio.play();
  } catch {
    /* best-effort */
  }
}
