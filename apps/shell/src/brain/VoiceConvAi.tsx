import { Conversation } from "@elevenlabs/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";

const VOICE_CONVAI_OPT_IN_KEY = "atom.voice.convai";

export function loadConvAiOptIn(): boolean {
  try {
    return localStorage.getItem(VOICE_CONVAI_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveConvAiOptIn(enabled: boolean): void {
  localStorage.setItem(VOICE_CONVAI_OPT_IN_KEY, enabled ? "1" : "0");
}

type ConvAiStatus = {
  configured: boolean;
  agentId: string | null;
};

async function adminFetch(
  path: string,
  init: RequestInit & { adminUrl: string; adminToken?: string },
): Promise<Response> {
  const { adminUrl, adminToken, ...rest } = init;
  const base = adminUrl.replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken?.trim() ? { Authorization: `Bearer ${adminToken.trim()}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
}

export function VoiceConvAiButton({ enabled }: { enabled: boolean }) {
  const { config } = useAgentConfig(true);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convaiReady, setConvaiReady] = useState(false);
  const sessionRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !config.adminToken?.trim()) {
      setConvaiReady(false);
      return;
    }
    void (async () => {
      try {
        const resp = await adminFetch("/voice/status", {
          method: "GET",
          adminUrl: config.adminUrl,
          adminToken: config.adminToken,
        });
        if (!resp.ok) return;
        const body = (await resp.json()) as { convai?: ConvAiStatus };
        setConvaiReady(Boolean(body.convai?.configured));
      } catch {
        setConvaiReady(false);
      }
    })();
  }, [enabled, config]);

  const reportSessionEnded = useCallback(
    async (durationSeconds: number, conversationId?: string) => {
      try {
        const admin = config.adminToken?.trim()
          ? config
          : await loadCommsAgentConfigSecure();
        await adminFetch("/voice/convai/session-ended", {
          method: "POST",
          adminUrl: admin.adminUrl,
          adminToken: admin.adminToken,
          body: JSON.stringify({ durationSeconds, conversationId }),
        });
      } catch {
        /* metering is best-effort */
      }
    },
    [config],
  );

  const endLive = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    const startedAt = startedAtRef.current;
    startedAtRef.current = null;
    setLive(false);
    setStatus(null);
    if (!session) return;
    let conversationId: string | undefined;
    try {
      conversationId = session.getId?.() ?? undefined;
    } catch {
      conversationId = undefined;
    }
    try {
      await session.endSession();
    } catch {
      /* already closed */
    }
    if (startedAt != null) {
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      await reportSessionEnded(durationSeconds, conversationId);
    }
  }, [reportSessionEnded]);

  const startLive = useCallback(async () => {
    setError(null);
    setBusy(true);
    setStatus("Connecting…");
    try {
      const admin = config.adminToken?.trim()
        ? config
        : await loadCommsAgentConfigSecure();
      const tokenResp = await adminFetch("/voice/convai/token", {
        method: "POST",
        adminUrl: admin.adminUrl,
        adminToken: admin.adminToken,
        body: JSON.stringify({}),
      });
      const tokenBody = (await tokenResp.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!tokenResp.ok || !tokenBody.token) {
        throw new Error(tokenBody.error || `ConvAI token failed (${tokenResp.status})`);
      }

      const session = await Conversation.startSession({
        conversationToken: tokenBody.token,
        connectionType: "webrtc",
        onDisconnect: () => {
          void endLive();
        },
        onError: (message) => {
          setError(typeof message === "string" ? message : "Voice session error");
        },
      });
      sessionRef.current = session;
      startedAtRef.current = Date.now();
      setLive(true);
      setStatus("Live — tap to end");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
      setLive(false);
    } finally {
      setBusy(false);
    }
  }, [config, endLive]);

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        void session.endSession().catch(() => undefined);
      }
    };
  }, []);

  if (!enabled || !convaiReady) return null;

  return (
    <div className="voice-ptt voice-convai" aria-live="polite">
      <button
        type="button"
        className={`chrome-approve voice-ptt-btn${live ? " voice-ptt-btn--active" : ""}`}
        disabled={busy}
        onClick={() => {
          if (live) void endLive();
          else void startLive();
        }}
      >
        {busy ? "Connecting…" : live ? "End voice chat" : "Start voice chat"}
      </button>
      {status ? <span className="settings-note">{status}</span> : null}
      {error ? <span className="settings-note settings-error">{error}</span> : null}
    </div>
  );
}
