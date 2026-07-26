import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { loadConvAiOptIn, saveConvAiOptIn } from "./VoiceConvAi.js";

const VOICE_OPT_IN_KEY = "atom.voice.pushToTalk";

export function loadVoiceOptIn(): boolean {
  try {
    return localStorage.getItem(VOICE_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveVoiceOptIn(enabled: boolean): void {
  localStorage.setItem(VOICE_OPT_IN_KEY, enabled ? "1" : "0");
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function VoicePushToTalk({
  enabled,
  onTranscript,
  onSpokenReply,
  humanFilter = true,
}: {
  enabled: boolean;
  /** Send transcribed text as a user chat turn; return agent reply text when ready. */
  onTranscript: (text: string) => Promise<string | null>;
  onSpokenReply?: (text: string) => void;
  /** Apply agent-backend spoken-path human filter before TTS (default on). */
  humanFilter?: boolean;
}) {
  const { config } = useAgentConfig(true);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopAndSend = useCallback(async () => {
    const recorder = mediaRef.current;
    if (!recorder) return;
    setRecording(false);
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    mediaRef.current = null;
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
    chunksRef.current = [];
    if (blob.size < 200) {
      setError("Recording too short.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Transcribing…");
    try {
      const admin = config.adminToken?.trim()
        ? config
        : await loadCommsAgentConfigSecure();
      const base = admin.adminUrl.replace(/\/$/, "");
      const audioBase64 = await blobToBase64(blob);
      const tr = await fetch(`${base}/voice/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(admin.adminToken?.trim()
            ? { Authorization: `Bearer ${admin.adminToken.trim()}` }
            : {}),
        },
        body: JSON.stringify({
          audioBase64,
          mimeType: blob.type || "audio/webm",
          filename: "ptt.webm",
        }),
      });
      const trBody = (await tr.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!tr.ok) throw new Error(trBody.error || `Transcribe failed (${tr.status})`);
      const text = trBody.text?.trim();
      if (!text) throw new Error("No speech detected.");
      setStatus("Thinking…");
      const reply = await onTranscript(text);
      if (!reply?.trim()) {
        setStatus(null);
        return;
      }
      onSpokenReply?.(reply);
      setStatus("Speaking…");
      const syn = await fetch(`${base}/voice/synthesize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(admin.adminToken?.trim()
            ? { Authorization: `Bearer ${admin.adminToken.trim()}` }
            : {}),
        },
        body: JSON.stringify({ text: reply.slice(0, 2000), humanFilter }),
      });
      const synBody = (await syn.json().catch(() => ({}))) as {
        audioBase64?: string | null;
        mimeType?: string | null;
        error?: string;
      };
      if (!syn.ok) throw new Error(synBody.error || `Synthesize failed (${syn.status})`);
      if (synBody.audioBase64) {
        const mime = synBody.mimeType || "audio/mpeg";
        const audio = new Audio(`data:${mime};base64,${synBody.audioBase64}`);
        await audio.play();
      }
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [config, onTranscript, onSpokenReply, humanFilter]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus("Listening… release to send");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone permission denied");
    }
  }, []);

  if (!enabled) return null;

  return (
    <div className="voice-ptt" aria-live="polite">
      <button
        type="button"
        className={`chrome-approve voice-ptt-btn${recording ? " voice-ptt-btn--active" : ""}`}
        disabled={busy}
        onMouseDown={() => void startRecording()}
        onMouseUp={() => {
          if (recording) void stopAndSend();
        }}
        onMouseLeave={() => {
          if (recording) void stopAndSend();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          void startRecording();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          if (recording) void stopAndSend();
        }}
      >
        {busy ? "Working…" : recording ? "Release to send" : "Hold to talk"}
      </button>
      {status ? <span className="settings-note">{status}</span> : null}
      {error ? <span className="settings-note settings-error">{error}</span> : null}
    </div>
  );
}

export function VoiceSettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const { config } = useAgentConfig(true);
  const [optIn, setOptIn] = useState(loadVoiceOptIn);
  const [convAiOptIn, setConvAiOptIn] = useState(loadConvAiOptIn);
  const [providerNote, setProviderNote] = useState<string | null>(null);
  const [convaiNote, setConvaiNote] = useState<string | null>(null);

  useEffect(() => {
    if (!config.adminToken?.trim()) return;
    void (async () => {
      try {
        const base = config.adminUrl.replace(/\/$/, "");
        const resp = await fetch(`${base}/voice/status`, {
          headers: { Authorization: `Bearer ${config.adminToken!.trim()}` },
        });
        if (!resp.ok) return;
        const body = (await resp.json()) as {
          message?: string;
          configured?: boolean;
          provider?: string;
          convai?: { configured?: boolean; agentId?: string | null };
        };
        setProviderNote(
          `${body.provider ?? "voice"}: ${body.message ?? (body.configured ? "ready" : "not configured")}`,
        );
        setConvaiNote(
          body.convai?.configured
            ? `Conversational AI ready${body.convai.agentId ? ` (${body.convai.agentId})` : ""}.`
            : "Conversational AI not configured on this agent.",
        );
      } catch {
        setProviderNote(null);
        setConvaiNote(null);
      }
    })();
  }, [config]);

  const fields = (
    <>
      <p className="settings-note">
        Live voice chat uses ElevenLabs Conversational AI (human-like duplex). Your agent mints a
        short-lived session token — the platform API key never reaches the browser. Minutes debit
        Atom Credits when billed.
      </p>
      {convaiNote ? <p className="settings-note">{convaiNote}</p> : null}
      <SettingsToggle
        checked={convAiOptIn}
        label="Show live voice chat in Chat"
        onChange={(enabled) => {
          saveConvAiOptIn(enabled);
          setConvAiOptIn(enabled);
        }}
      />
      <p className="settings-note">
        Push-to-talk (optional): hold the mic, speak a short request, hear a TTS reply via your
        agent&apos;s OpenAI-compatible key.
      </p>
      {providerNote ? <p className="settings-note">{providerNote}</p> : null}
      <SettingsToggle
        checked={optIn}
        label="Show push-to-talk in Chat"
        onChange={(enabled) => {
          saveVoiceOptIn(enabled);
          setOptIn(enabled);
        }}
      />
    </>
  );

  if (embedded) {
    return (
      <section className="settings-section" aria-labelledby="settings-voice-heading">
        <h3 id="settings-voice-heading">Agent voice</h3>
        <div className="settings-panel-fields connector-settings">{fields}</div>
      </section>
    );
  }
  return (
    <section className="settings-section connector-settings">
      <h3>Agent voice</h3>
      {fields}
    </section>
  );
}
