import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { getChatSessionToken } from "../comms/chatSessionToken.js";
import { supabaseAccessToken } from "../auth/hostedAccount.js";
import { CONTROL_PLANE_URL } from "../hostConfig.js";
import { VOICE_OPTIN_EVENT } from "./voiceOptIn.js";
import {
  loadSpeechVoiceId,
  loadVoiceMode,
  loadVoiceOptIn,
  saveSpeechVoiceId,
  saveVoiceMode,
  saveVoiceOptIn,
  type VoiceMode,
} from "./voiceMode.js";

export { loadVoiceOptIn, saveVoiceOptIn, loadVoiceMode, saveVoiceMode };

type CatalogEntry = { handle: string; voiceId: string; label: string };

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
  humanFilter: _humanFilter = true,
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
      const admin = config.adminUrl?.trim() ? config : await loadCommsAgentConfigSecure();
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
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [config, onTranscript, onSpokenReply, releaseMic]);

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
  const [mode, setMode] = useState<VoiceMode>(loadVoiceMode);
  const [voiceId, setVoiceId] = useState(loadSpeechVoiceId);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [creditNote, setCreditNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setMode(loadVoiceMode());
      setVoiceId(loadSpeechVoiceId());
    };
    window.addEventListener(VOICE_OPTIN_EVENT, sync);
    return () => window.removeEventListener(VOICE_OPTIN_EVENT, sync);
  }, []);

  useEffect(() => {
    const cp = CONTROL_PLANE_URL.replace(/\/$/, "");
    if (!cp) return;
    void (async () => {
      try {
        const token = await supabaseAccessToken();
        const resp = await fetch(`${cp}/voice/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) return;
        const body = (await resp.json()) as {
          catalog?: CatalogEntry[];
          credits?: {
            canUsePaid?: boolean;
            balancePence?: number;
            speechEnabled?: boolean;
            voiceId?: string;
          };
        };
        if (Array.isArray(body.catalog) && body.catalog.length) {
          setCatalog(body.catalog);
        }
        if (body.credits?.voiceId) {
          setVoiceId(body.credits.voiceId);
          saveSpeechVoiceId(body.credits.voiceId);
        }
        if (body.credits) {
          const pounds = ((body.credits.balancePence ?? 0) / 100).toFixed(2);
          if (!body.credits.speechEnabled) {
            setCreditNote("Conversational is off for this account (speech disabled).");
          } else if (!body.credits.canUsePaid) {
            setCreditNote(`Atom Credits £${pounds} — top up to use Conversational.`);
          } else {
            setCreditNote(`Atom Credits £${pounds} — Conversational available.`);
          }
        }
      } catch {
        setCreditNote(null);
      }
    })();
  }, []);

  const applyMode = (next: VoiceMode) => {
    saveVoiceMode(next);
    setMode(next);
    if (next === "conversational") {
      void (async () => {
        const cp = CONTROL_PLANE_URL.replace(/\/$/, "");
        const token = await supabaseAccessToken();
        if (!cp || !token) return;
        try {
          await fetch(`${cp}/voice/speech-enable`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: "{}",
          });
          await applyVoice(loadSpeechVoiceId());
        } catch {
          /* preference save best-effort */
        }
      })();
    }
  };

  const applyVoice = async (nextId: string) => {
    setVoiceId(nextId);
    saveSpeechVoiceId(nextId);
    setSaveError(null);
    const cp = CONTROL_PLANE_URL.replace(/\/$/, "");
    const token = await supabaseAccessToken();
    if (!cp || !token) return;
    try {
      const resp = await fetch(`${cp}/voice/preference`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ voiceId: nextId, enableSpeech: true }),
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        setSaveError(body.error || "Could not save voice preference.");
      }
    } catch {
      setSaveError("Could not save voice preference.");
    }
  };

  const fields = (
    <>
      <p className="settings-note">
        Default is off. Free uses your device voice. Conversational uses Atom Credits (Talk +
        spoken replies).
      </p>
      <fieldset className="settings-fieldset" style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="settings-note" style={{ padding: 0 }}>
          Voice
        </legend>
        {(
          [
            ["off", "Off"],
            ["free", "Atom’s Voice (Free)"],
            ["conversational", "Atom’s Voice – Conversational (Paid)"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="settings-note"
            style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}
          >
            <input
              type="radio"
              name="atom-voice-mode"
              checked={mode === value}
              onChange={() => applyMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {mode === "conversational" ? (
        <>
          {creditNote ? <p className="settings-note">{creditNote}</p> : null}
          {catalog.length > 0 ? (
            <label className="settings-note" style={{ display: "block", marginTop: 8 }}>
              Conversational voice
              <select
                value={voiceId}
                onChange={(e) => void applyVoice(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              >
                {catalog.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="settings-note">Voice list loads when Mission Control is reachable.</p>
          )}
          {saveError ? <p className="settings-note settings-error">{saveError}</p> : null}
        </>
      ) : null}
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
