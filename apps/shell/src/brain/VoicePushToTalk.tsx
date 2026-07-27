import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { getChatSessionToken } from "../comms/chatSessionToken.js";
import { supabaseAccessToken } from "../auth/hostedAccount.js";
import { CONTROL_PLANE_URL } from "../hostConfig.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
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

type CatalogEntry = {
  handle: string;
  voiceId: string;
  label: string;
  displayLabel?: string;
};

const SILENCE_AUTO_OFF_MS = 60_000;
const SPEECH_RMS_THRESHOLD = 0.02;
const END_SILENCE_MS = 1_200;
const MAX_UTTERANCE_MS = 20_000;
const MIN_UTTERANCE_MS = 500;

function catalogOptionLabel(entry: CatalogEntry): string {
  if (entry.displayLabel?.trim()) return entry.displayLabel.trim();
  const raw = entry.handle.replace(/^#?atom-/, "");
  const name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : entry.label;
  return `${name} — ${entry.label}`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

async function resolveVoiceBearer(adminToken?: string): Promise<string | null> {
  const session = getChatSessionToken()?.trim();
  if (session) return session;
  if (adminToken?.trim()) return adminToken.trim();
  const secure = await loadCommsAgentConfigSecure();
  return secure.adminToken?.trim() || null;
}

async function chargePaidMinute(sequence: number, sessionId: string): Promise<boolean> {
  const cp = CONTROL_PLANE_URL.replace(/\/$/, "");
  const token = await supabaseAccessToken();
  if (!cp || !token) return false;
  const resp = await fetch(`${cp}/voice/convai/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sliceSeconds: 60,
      conversationId: sessionId,
      sequence,
    }),
  });
  return resp.ok;
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
  const [micOn, setMicOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [costPounds, setCostPounds] = useState(0.1);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(loadVoiceMode);

  const micOnRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const loopAbortRef = useRef<AbortController | null>(null);
  const lastSpeechAtRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const paidSessionIdRef = useRef("");
  const paidMinuteSeqRef = useRef(0);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sync = () => setVoiceMode(loadVoiceMode());
    window.addEventListener(VOICE_OPTIN_EVENT, sync);
    return () => window.removeEventListener(VOICE_OPTIN_EVENT, sync);
  }, []);

  const releaseMic = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
  }, []);

  const clearTick = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const stopMicSession = useCallback(
    (opts?: { error?: string; paidOff?: boolean }) => {
      micOnRef.current = false;
      setMicOn(false);
      loopAbortRef.current?.abort();
      loopAbortRef.current = null;
      releaseMic();
      clearTick();
      setBusy(false);
      setStatus(null);
      setElapsedMs(0);
      setCostPounds(0.1);
      sessionStartedAtRef.current = 0;
      if (opts?.error) setError(opts.error);
      if (opts?.paidOff) {
        saveVoiceMode("off");
        setVoiceMode("off");
      }
    },
    [clearTick, releaseMic],
  );

  const recordUtterance = useCallback(
    async (stream: MediaStream, signal: AbortSignal): Promise<Blob | null> => {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const started = Date.now();
      let heardSpeech = false;
      let silenceMs = 0;

      recorder.start(250);

      await new Promise<void>((resolve) => {
        const tick = () => {
          if (signal.aborted || !micOnRef.current) {
            resolve();
            return;
          }
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const elapsed = Date.now() - started;
          if (rms >= SPEECH_RMS_THRESHOLD) {
            heardSpeech = true;
            silenceMs = 0;
          } else if (heardSpeech) {
            silenceMs += 100;
            if (silenceMs >= END_SILENCE_MS && elapsed >= MIN_UTTERANCE_MS) {
              resolve();
              return;
            }
          }
          if (elapsed >= MAX_UTTERANCE_MS) {
            resolve();
            return;
          }
          window.setTimeout(tick, 100);
        };
        tick();
      });

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        try {
          if (recorder.state !== "inactive") recorder.stop();
          else resolve();
        } catch {
          resolve();
        }
      });
      try {
        await audioCtx.close();
      } catch {
        /* ignore */
      }

      if (!heardSpeech || chunks.length === 0) return null;
      return new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    },
    [],
  );

  const processBlob = useCallback(
    async (blob: Blob): Promise<boolean> => {
      if (blob.size < 400) return false;
      setBusy(true);
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
            filename: "mic.webm",
          }),
        });
        const trBody = (await tr.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!tr.ok) throw new Error(trBody.error || `Could not hear that (${tr.status})`);
        const text = trBody.text?.trim();
        if (!text) return false;
        lastSpeechAtRef.current = Date.now();
        setStatus("Thinking…");
        const reply = await onTranscript(text);
        if (reply?.trim()) onSpokenReply?.(reply);
        setStatus(micOnRef.current ? "Mic on — speak anytime" : null);
        setError(null);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [config, onTranscript, onSpokenReply],
  );

  const runMicLoop = useCallback(async () => {
    const abort = new AbortController();
    loopAbortRef.current = abort;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!micOnRef.current || abort.signal.aborted) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      setStatus("Mic on — speak anytime");
      setError(null);

      while (micOnRef.current && !abort.signal.aborted) {
        if (Date.now() - lastSpeechAtRef.current >= SILENCE_AUTO_OFF_MS) {
          const paid = loadVoiceMode() === "conversational";
          stopMicSession({
            error: paid
              ? "No speech for a minute — mic and Conversational voice turned off."
              : "No speech for a minute — mic turned off.",
            paidOff: paid,
          });
          return;
        }
        const blob = await recordUtterance(stream, abort.signal);
        if (!micOnRef.current || abort.signal.aborted) break;
        if (!blob) continue;
        try {
          await processBlob(blob);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus(micOnRef.current ? "Mic on — speak anytime" : null);
        }
      }
    } catch (err) {
      stopMicSession({
        error: err instanceof Error ? err.message : "Microphone permission denied",
      });
    }
  }, [processBlob, recordUtterance, stopMicSession]);

  const startMicSession = useCallback(async () => {
    const mode = loadVoiceMode();
    setVoiceMode(mode);
    micOnRef.current = true;
    setMicOn(true);
    lastSpeechAtRef.current = Date.now();
    sessionStartedAtRef.current = Date.now();
    setElapsedMs(0);
    setCostPounds(0.1);
    setError(null);

    if (mode === "conversational") {
      paidSessionIdRef.current = `mic-${Date.now()}`;
      paidMinuteSeqRef.current = 0;
      const ok = await chargePaidMinute(0, paidSessionIdRef.current);
      if (!ok) {
        stopMicSession({
          error: "Insufficient Atom Credits — Conversational paused.",
          paidOff: true,
        });
        return;
      }
      paidMinuteSeqRef.current = 1;
    }

    clearTick();
    tickTimerRef.current = setInterval(() => {
      if (!micOnRef.current || !sessionStartedAtRef.current) return;
      const elapsed = Date.now() - sessionStartedAtRef.current;
      setElapsedMs(elapsed);
      if (loadVoiceMode() === "conversational") {
        const minutes = Math.floor(elapsed / 60_000) + 1;
        setCostPounds(minutes * 0.1);
        while (paidMinuteSeqRef.current < minutes) {
          const seq = paidMinuteSeqRef.current;
          paidMinuteSeqRef.current = seq + 1;
          void chargePaidMinute(seq, paidSessionIdRef.current).then((ok) => {
            if (!ok) {
              stopMicSession({
                error: "Credits ran out — mic and Conversational voice turned off.",
                paidOff: true,
              });
            }
          });
        }
      }
      if (Date.now() - lastSpeechAtRef.current >= SILENCE_AUTO_OFF_MS) {
        const paid = loadVoiceMode() === "conversational";
        stopMicSession({
          error: paid
            ? "No speech for a minute — mic and Conversational voice turned off."
            : "No speech for a minute — mic turned off.",
          paidOff: paid,
        });
      }
    }, 1000);

    void runMicLoop();
  }, [clearTick, runMicLoop, stopMicSession]);

  const onMicToggle = useCallback(
    (on: boolean) => {
      if (on) void startMicSession();
      else stopMicSession();
    },
    [startMicSession, stopMicSession],
  );

  useEffect(() => {
    return () => {
      micOnRef.current = false;
      loopAbortRef.current?.abort();
      releaseMic();
      clearTick();
    };
  }, [clearTick, releaseMic]);

  useEffect(() => {
    if (!enabled && micOnRef.current) stopMicSession();
  }, [enabled, stopMicSession]);

  if (!enabled) return null;

  const showPaidMeter = voiceMode === "conversational" && micOn;

  return (
    <div className="voice-ptt" aria-live="polite">
      <SettingsToggle
        checked={micOn}
        disabled={busy && !micOn}
        label={micOn ? "Mic on" : "Mic"}
        onChange={onMicToggle}
      />
      {showPaidMeter ? (
        <span className="settings-note voice-ptt-meter">
          {formatElapsed(elapsedMs)} · £{costPounds.toFixed(2)}
        </span>
      ) : null}
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
            setCreditNote(`Atom Credits £${pounds} — top up to use Conversational (£0.10/min).`);
          } else {
            setCreditNote(`Atom Credits £${pounds} — Conversational £0.10 per minute.`);
          }
        }
      } catch {
        setCreditNote(null);
      }
    })();
  }, []);

  const applyVoice = async (nextId: string) => {
    setVoiceId(nextId);
    saveSpeechVoiceId(nextId);
    setSaveError(null);
    const cp = CONTROL_PLANE_URL.replace(/\/$/, "");
    const token = await supabaseAccessToken();
    if (!cp || !token) return;
    try {
      const resp = await fetch(`${cp}/voice/preference`, {
        method: "POST",
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

  const fields = (
    <>
      <p className="settings-note">
        Default is off. Free uses your device voice. Conversational uses Atom Credits at £0.10 per
        started minute (Talk + mic).
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
                    {catalogOptionLabel(v)}
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
