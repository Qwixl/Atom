import type { Express } from "express";
import type { VoiceBackend } from "./types.js";

export function registerVoiceAdminRoutes(app: Express, voice: VoiceBackend): void {
  app.get("/voice/status", (_req, res) => {
    res.json({ ok: true, ...voice.status() });
  });

  app.post("/voice/synthesize", async (req, res) => {
    const body = req.body as { text?: string; voiceId?: string };
    const text = body.text?.trim();
    if (!text) {
      res.status(400).json({ error: "text required" });
      return;
    }
    try {
      const result = await voice.synthesize({ text, voiceId: body.voiceId?.trim() });
      res.json({ ok: true, ...result, provider: voice.id });
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
