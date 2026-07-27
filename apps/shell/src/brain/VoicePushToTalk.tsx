import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { getChatSessionToken } from "../comms/chatSessionToken.js";
import { notifyVoiceOptInChanged } from "./voiceOptIn.js";

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

/** Prefer short-lived chat session, then vault admin token. */
async function resolveVoiceBearer(adminToken?: string): Promise<string | null> {
  const session = getChatSessionToken()?.trim();
  if (session) return session;
  if (adminToken?.trim()) return adminToken.trim();
  const secure = await loadCommsAgentConfigSecure();
  return secure.adminToken?.trim() || null;
}

export function VoicePushToTalk({
  enabled,
  onTranscript,
  onSpokenReply,
  humanFilter = true,
}: {
  enabled: boolean;
  onTranscript: (text: string) => Promise<string | null>;
  onSpokenReply?: (text: string) => void;
  humanFilter?: boolean;
}) {
  const { config } = useAgentConfig(true);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  /** True from press until stop finishes — survives async getUserMedia race. */
  const holdingRef = useRef(false);
  const recordingRef = useRef(false);

  const releaseMic = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
  }, []);

  const stopAndSend = useCallback(async () => {
    holdingRef.current = false;
    const recorder = mediaRef.current;
    if (!recorder) {
      releaseMic();
      setRecording(false);
      recordingRef.current = false;
      return;
    }
    setRecording(false);
    recordingRef.current = false;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try {
        if (recorder.state !== "inactive") recorder.stop();
        else resolve();
      } catch {
        resolve();
      }
    });
    mediaRef.current = null;
    releaseMic();
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
      const bearer = await resolveVoiceBearer(config.adminToken);
      if (!bearer) throw new Error("Unlock your vault / sign in to use voice.");
      const admin = config.adminUrl?.trim()
        ? config
        : await loadCommsAgentConfigSecure();
      const base = admin.adminUrl.replace(/\/$/, "");
      const audioBase64 = await blobToBase64(blob);
      const tr = await fetch(`${base}/voice/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
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
      const syn = await fetch(`${base}/voice/synthesize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ text: reply.slice(0, 2000), humanFilter }),
      });
      const synBody = (await syn.json().catch(() => ({}))) as {
        audioBase64?: string | null;
        mimeType?: string | null;
        error?: string;
      };
      if (!syn.ok) throw new Error(synBody.error || `Voice failed (${syn.status})`);
      if (synBody.audioBase64) {
        const mime = synBody.mimeType || "audio/mpeg";
        const audio = new Audio(`data:${mime};base64,${synBody.audioBase64}`);
        await audio.play();
      } else {
        throw new Error("Voice returned no audio.");
      }
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [config, onTranscript, onSpokenReply, humanFilter, releaseMic]);

  const startRecording = useCallback(async () => {
    setError(null);
    holdingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!holdingRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
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
      mediaRef.current = recorder;
      recorder.start();
      recordingRef.current = true;
      setRecording(true);
      setStatus("Listening… release to send");
      if (!holdingRef.current) {
        void stopAndSend();
      }
    } catch (err) {
      holdingRef.current = false;
      releaseMic();
      setError(err instanceof Error ? err.message : "Microphone permission denied");
    }
  }, [releaseMic, stopAndSend]);

  const onRelease = useCallback(() => {
    holdingRef.current = false;
    if (recordingRef.current || mediaRef.current) {
      void stopAndSend();
    } else {
      releaseMic();
    }
  }, [stopAndSend, releaseMic]);

  useEffect(() => {
    return () => {
      holdingRef.current = false;
      try {
        mediaRef.current?.stop();
      } catch {
        /* ignore */
      }
      releaseMic();
    };
  }, [releaseMic]);

  if (!enabled) return null;

  return (
    <div className="voice-ptt" aria-live="polite">
      <button
        type="button"
        className={`chrome-approve voice-ptt-btn${recording ? " voice-ptt-btn--active" : ""}`}
        disabled={busy}
        onMouseDown={() => void startRecording()}
        onMouseUp={onRelease}
        onMouseLeave={() => {
          if (holdingRef.current || recordingRef.current) onRelease();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          void startRecording();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onRelease();
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
  const [providerNote, setProviderNote] = useState<string | null>(null);

  useEffect(() => {
    if (!config.adminUrl?.trim()) return;
    void (async () => {
      try {
        const bearer = await resolveVoiceBearer(config.adminToken);
        if (!bearer) return;
        const base = config.adminUrl.replace(/\/$/, "");
        const resp = await fetch(`${base}/voice/status`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!resp.ok) return;
        const body = (await resp.json()) as {
          message?: string;
          configured?: boolean;
          provider?: string;
        };
        setProviderNote(
          `${body.provider ?? "voice"}: ${body.message ?? (body.configured ? "ready" : "not configured")}`,
        );
      } catch {
        setProviderNote(null);
      }
    })();
  }, [config]);

  const fields = (
    <>
      <p className="settings-note">
        <strong>Talk</strong> (chat bar) is live conversation — billed per minute while connected.
        <br />
        <strong>Hold to talk</strong> is short voice notes; replies can be spoken aloud.
      </p>
      {providerNote ? <p className="settings-note">{providerNote}</p> : null}
      <SettingsToggle
        checked={optIn}
        label="Show Hold to talk in Chat"
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
