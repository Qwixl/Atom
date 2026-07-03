import type { Express, Response } from "express";
import {
  createRsvpRequest,
  createRsvpResponse,
  createSchedulingProposal,
  createSchedulingResponse,
  type RsvpAnswer,
  type SchedulingResponseKind,
  type SchedulingSlot,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsSessionStore } from "./mlsSessions.js";

export interface CoordinationAdminDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
}

interface PeerSendBody {
  peerUrl?: string;
  peerDid?: string;
  encrypt?: boolean;
  threadId?: string;
}

function readPeerTarget(body: PeerSendBody): { peerUrl: string; peerDid?: string; encrypt: boolean } {
  const peerUrl = body.peerUrl?.trim();
  if (!peerUrl) throw new Error("peerUrl required");
  const peerDid = body.peerDid?.trim() || undefined;
  return { peerUrl, peerDid, encrypt: body.encrypt ?? true };
}

async function sendCoordinationObject(
  deps: CoordinationAdminDeps,
  res: Response,
  body: PeerSendBody,
  object: Awaited<ReturnType<typeof createSchedulingProposal>>,
): Promise<void> {
  try {
    const target = readPeerTarget(body);
    const result = await deliverSignedObject({
      mlsStore: deps.mlsStore,
      peerUrl: target.peerUrl,
      peerDid: target.peerDid,
      object,
      encrypt: target.encrypt,
    });
    res.json({ sent: { objectId: result.objectId, encrypted: result.encrypted, purpose: object.governance.purpose } });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes("MLS session") ? 409 : 502).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function registerCoordinationAdminRoutes(adminApp: Express, deps: CoordinationAdminDeps): void {
  adminApp.post("/coordination/scheduling-proposal", async (req, res) => {
    const body = req.body as PeerSendBody & {
      title?: string;
      slots?: SchedulingSlot[];
    };
    if (!body.title?.trim() || !Array.isArray(body.slots) || body.slots.length === 0) {
      res.status(400).json({ error: "title and slots required" });
      return;
    }
    try {
      const object = await createSchedulingProposal({
        identity: deps.identity,
        payload: {
          title: body.title.trim(),
          slots: body.slots,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/scheduling-response", async (req, res) => {
    const body = req.body as PeerSendBody & {
      proposalId?: string;
      response?: SchedulingResponseKind;
      slotId?: string;
    };
    if (!body.proposalId?.trim() || !body.response) {
      res.status(400).json({ error: "proposalId and response required" });
      return;
    }
    try {
      const object = await createSchedulingResponse({
        identity: deps.identity,
        payload: {
          proposalId: body.proposalId.trim(),
          response: body.response,
          slotId: body.slotId?.trim() || undefined,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/rsvp", async (req, res) => {
    const body = req.body as PeerSendBody & {
      eventTitle?: string;
      eventAt?: string;
      location?: string;
    };
    if (!body.eventTitle?.trim() || !body.eventAt?.trim()) {
      res.status(400).json({ error: "eventTitle and eventAt required" });
      return;
    }
    try {
      const object = await createRsvpRequest({
        identity: deps.identity,
        payload: {
          eventTitle: body.eventTitle.trim(),
          eventAt: body.eventAt.trim(),
          location: body.location?.trim() || undefined,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/rsvp-response", async (req, res) => {
    const body = req.body as PeerSendBody & {
      rsvpId?: string;
      response?: RsvpAnswer;
    };
    if (!body.rsvpId?.trim() || !body.response) {
      res.status(400).json({ error: "rsvpId and response required" });
      return;
    }
    try {
      const object = await createRsvpResponse({
        identity: deps.identity,
        payload: {
          rsvpId: body.rsvpId.trim(),
          response: body.response,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
