import type { Express } from "express";
import { createActionReserve, type ActionReserveRefKind } from "@qwixl/a2a-transport";
import type { AgentKeyPair } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsSessionStore } from "./mlsSessions.js";

export interface ActionAdminDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
}

interface PeerSendBody {
  peerUrl?: string;
  peerDid?: string;
  encrypt?: boolean;
  threadId?: string;
}

export function registerActionAdminRoutes(adminApp: Express, deps: ActionAdminDeps): void {
  adminApp.post("/actions/reserve", async (req, res) => {
    const body = req.body as PeerSendBody & {
      refId?: string;
      refKind?: ActionReserveRefKind;
      attestationRef?: string;
      subjectId?: string;
      label?: string;
      start?: string;
      end?: string;
    };
    if (!body.refId?.trim() || !body.refKind || !body.attestationRef?.trim()) {
      res.status(400).json({ error: "refId, refKind, and attestationRef required" });
      return;
    }
    try {
      const object = await createActionReserve({
        identity: deps.identity,
        payload: {
          refId: body.refId.trim(),
          refKind: body.refKind,
          attestationRef: body.attestationRef.trim(),
          subjectId: body.subjectId?.trim() || undefined,
          label: body.label?.trim() || undefined,
          start: body.start?.trim() || undefined,
          end: body.end?.trim() || undefined,
          threadId: body.threadId?.trim() || undefined,
          peerDid: body.peerDid?.trim() || undefined,
        },
      });

      if (body.peerUrl?.trim()) {
        const result = await deliverSignedObject({
          mlsStore: deps.mlsStore,
          peerUrl: body.peerUrl,
          peerDid: body.peerDid,
          object,
          encrypt: body.encrypt,
        });
        res.json({ object, sent: { objectId: result.objectId, encrypted: result.encrypted } });
        return;
      }

      res.json({ object });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
