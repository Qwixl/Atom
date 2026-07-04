import type { Express } from "express";
import type { QualifyClaimSummary, QualifyVerificationMethod } from "@qwixl/a2a-transport";
import type { QualifyStore } from "./qualifyStore.js";

export interface QualifyAdminDeps {
  store: QualifyStore;
}

function parseClaims(body: Record<string, unknown>): QualifyClaimSummary {
  const claims = body.claims;
  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) {
    throw new Error("claims must be an object");
  }
  return claims as QualifyClaimSummary;
}

function parseMethod(value: unknown): QualifyVerificationMethod {
  if (
    value !== "vc-sd-jwt" &&
    value !== "vc-jwt" &&
    value !== "psi-result" &&
    value !== "attestation-only"
  ) {
    throw new Error("verificationMethod is invalid");
  }
  return value;
}

export function registerQualifyAdminRoutes(adminApp: Express, deps: QualifyAdminDeps): void {
  adminApp.get("/qualify", async (req, res) => {
    try {
      const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
      res.json({ qualifications: deps.store.list(subjectId) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/qualify/present", async (req, res) => {
    const body = req.body as {
      subjectId?: string;
      transactionId?: string;
      verificationMethod?: string;
      presentation?: string;
      claims?: QualifyClaimSummary;
      attestationRef?: string;
      peerUrl?: string;
      peerDid?: string;
      encrypt?: boolean;
      issuerHint?: string;
    };
    if (
      !body.subjectId?.trim() ||
      !body.presentation?.trim() ||
      !body.attestationRef?.trim() ||
      !body.verificationMethod?.trim()
    ) {
      res.status(400).json({
        error: "subjectId, verificationMethod, presentation, and attestationRef required",
      });
      return;
    }
    try {
      const result = await deps.store.present({
        payload: {
          subjectId: body.subjectId.trim(),
          transactionId: body.transactionId?.trim(),
          verificationMethod: parseMethod(body.verificationMethod.trim()),
          presentation: body.presentation.trim(),
          claims: parseClaims(body as Record<string, unknown>),
          attestationRef: body.attestationRef.trim(),
          peerDid: body.peerDid?.trim(),
          issuerHint: body.issuerHint?.trim(),
        },
        peerUrl: body.peerUrl?.trim(),
        peerDid: body.peerDid?.trim(),
        encrypt: body.encrypt,
      });
      res.json({ object: result.object, qualification: result.record });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
