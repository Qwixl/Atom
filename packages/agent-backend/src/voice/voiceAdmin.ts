import type { Express } from "express";
import { reportSpeechUsageToControlPlane } from "../controlPlaneCredits.js";
import { applyHumanFilter } from "./humanFilter.js";
import {
  loadElevenLabsConvAiConfig,
  mintElevenLabsConversationToken,
} from "./elevenLabsConvAi.js";
import type { VoiceBackend } from "./types.js";

export function registerVoiceAdminRoutes(app: Express, voice: VoiceBackend): void {
  app.get("/voice/status", (_req, res) => {
    const convai = loadElevenLabsConvAiConfig();
    res.json({
      ok: true,
      ...voice.status(),
      convai: {
        configured: Boolean(convai),
        agentId: convai?.agentId ?? null,
      },
    });
  });

  /**
   * Mint a short-lived ElevenLabs ConvAI WebRTC token.
   * Platform API key stays on the agent; browser only gets the token.
   */
  app.post("/voice/convai/token", async (req, res) => {
    const config = loadElevenLabsConvAiConfig();
    if (!config) {
      res.status(503).json({
        error:
          "ElevenLabs Conversational AI not configured (set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID)",
      });
      return;
    }
    const body = (req.body ?? {}) as { participantName?: string };
    try {
      const result = await mintElevenLabsConversationToken(config, {
        participantName: body.participantName?.trim(),
      });
      res.json({
        ok: true,
        token: result.token,
        agentId: result.agentId,
        connectionType: "webrtc",
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * After a ConvAI session ends, report billed duration to the control plane.
   */
  app.post("/voice/convai/session-ended", (req, res) => {
    const body = (req.body ?? {}) as {
      durationSeconds?: number;
      conversationId?: string;
    };
    const durationSeconds = Math.max(0, Math.floor(Number(body.durationSeconds ?? 0)));
    if (durationSeconds <= 0) {
      res.status(400).json({ error: "durationSeconds required" });
      return;
    }
    const conversationId = body.conversationId?.trim();
    reportSpeechUsageToControlPlane({
      durationSeconds,
      idempotencyKey: conversationId ? `convai:${conversationId}` : undefined,
    });
    res.json({ ok: true, durationSeconds });
  });

  app.post("/voice/synthesize", async (req, res) => {
    const body = req.body as { text?: string; voiceId?: string; humanFilter?: boolean };
    const text = body.text?.trim();
    if (!text) {
      res.status(400).json({ error: "text required" });
      return;
    }
    try {
      const filtered =
        body.humanFilter === false ? { text, emotion: "neutral" as const } : applyHumanFilter(text);
      const result = await voice.synthesize({
        text: filtered.text,
        voiceId: body.voiceId?.trim(),
      });
      // Atom Credits speech meter (MC prices chars; no-op unless hosted Standard/BYOK).
      if (voice.id !== "stub") {
        reportSpeechUsageToControlPlane({ charCount: filtered.text.length });
      }
      res.json({
        ok: true,
        ...result,
        provider: voice.id,
        spokenText: filtered.text,
        emotion: filtered.emotion,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/voice/transcribe", async (req, res) => {
    const body = req.body as {
      audioBase64?: string;
      mimeType?: string;
      filename?: string;
    };
    const audioBase64 = body.audioBase64?.trim();
    if (!audioBase64) {
      res.status(400).json({ error: "audioBase64 required" });
      return;
    }
    if (!voice.transcribe) {
      res.status(501).json({ error: "Transcription not supported by current voice provider" });
      return;
    }
    try {
      const result = await voice.transcribe({
        audioBase64,
        mimeType: body.mimeType?.trim(),
        filename: body.filename?.trim(),
      });
      res.json({ ok: true, ...result, provider: voice.id });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
