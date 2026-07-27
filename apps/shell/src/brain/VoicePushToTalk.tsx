import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { loadConvAiOptIn, saveConvAiOptIn } from "./VoiceConvAi.js";
import { notifyVoiceOptInChanged } from "./voiceOptIn.js";
import { speakAgentText } from "./speakAgentText.js";

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
  notifyVoiceOptInChanged();
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
    setStatus("Listening…");
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
      if (!tr.ok) throw new Error(trBody.error || `Could not hear that (${tr.status})`);
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
      await speakAgentText(reply, admin, { humanFilter });
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
  const [optIn, setOptIn] = useState(loadVoiceOptIn);
  const [convAiOptIn, setConvAiOptIn] = useState(loadConvAiOptIn);

  const fields = (
    <>
      <p className="settings-note">
        Live voice chat - your agent will talk to you like a real person.
        <br />
        <strong>Billed item</strong> (£0.10p per minute)
      </p>
      <SettingsToggle
        checked={convAiOptIn}
        label="Show live voice chat in Chat"
        onChange={(enabled) => {
          saveConvAiOptIn(enabled);
          setConvAiOptIn(enabled);
        }}
      />
      <p className="settings-note">
        Push-to-talk - hold the mic, to talk to your agent.
        <br />
        <strong>Billed item</strong> (£0.10p per minute)
      </p>
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
