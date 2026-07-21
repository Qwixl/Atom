import type { Express, Response } from "express";
import {
  createDatingIntro,
  createDatingIntroResponse,
  createPollRequest,
  createPollVote,
  createRsvpRequest,
  createRsvpResponse,
  type DatingIntroAnswer,
  createSchedulingProposal,
  createSchedulingResponse,
  createSharedList,
  createSharedListUpdate,
  createLocationPin,
  createSplitProposal,
  createTttMove,
  createTttState,
  createBattleshipsState,
  createBattleshipsShot,
  createBattleshipsMove,
  type RsvpAnswer,
  type SchedulingResponseKind,
  type SchedulingSlot,
  type SharedListItem,
  type TttBoard,
  type BsPlayer,
  type BsPhase,
  type BsShot,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { CalendarFeedStore } from "./calendarFeedStore.js";
import type { MlsSessionStore } from "./mlsSessions.js";

export interface CoordinationAdminDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  calendarFeed?: CalendarFeedStore;
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
      deps.calendarFeed?.recordProposal({
        id: object.id,
        title: body.title.trim(),
        slots: body.slots,
        recordedAt: new Date().toISOString(),
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
      title?: string;
      start?: string;
      end?: string;
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
      if (body.response === "accept" && body.slotId?.trim() && deps.calendarFeed) {
        deps.calendarFeed.recordAcceptedMeeting({
          proposalId: body.proposalId.trim(),
          slotId: body.slotId.trim(),
          title: body.title?.trim(),
          start: body.start?.trim(),
          end: body.end?.trim(),
        });
      }
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

  adminApp.post("/dating/intro", async (req, res) => {
    const body = req.body as PeerSendBody & {
      displayName?: string;
      oneLiner?: string;
      interests?: string[];
    };
    if (!body.displayName?.trim() || !body.oneLiner?.trim()) {
      res.status(400).json({ error: "displayName and oneLiner required" });
      return;
    }
    try {
      const object = await createDatingIntro({
        identity: deps.identity,
        payload: {
          displayName: body.displayName.trim(),
          oneLiner: body.oneLiner.trim(),
          interests: Array.isArray(body.interests) ? body.interests : undefined,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/dating/intro-response", async (req, res) => {
    const body = req.body as PeerSendBody & {
      introId?: string;
      response?: DatingIntroAnswer;
    };
    if (!body.introId?.trim() || !body.response) {
      res.status(400).json({ error: "introId and response required" });
      return;
    }
    try {
      const object = await createDatingIntroResponse({
        identity: deps.identity,
        payload: {
          introId: body.introId.trim(),
          response: body.response,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/poll", async (req, res) => {
    const body = req.body as PeerSendBody & {
      question?: string;
      options?: Array<{ id: string; label: string }>;
    };
    if (!body.question?.trim() || !Array.isArray(body.options) || body.options.length < 2) {
      res.status(400).json({ error: "question and at least two options required" });
      return;
    }
    try {
      const object = await createPollRequest({
        identity: deps.identity,
        payload: {
          question: body.question.trim(),
          options: body.options,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/poll-vote", async (req, res) => {
    const body = req.body as PeerSendBody & { pollId?: string; optionId?: string };
    if (!body.pollId?.trim() || !body.optionId?.trim()) {
      res.status(400).json({ error: "pollId and optionId required" });
      return;
    }
    try {
      const object = await createPollVote({
        identity: deps.identity,
        payload: {
          pollId: body.pollId.trim(),
          optionId: body.optionId.trim(),
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/shared-list", async (req, res) => {
    const body = req.body as PeerSendBody & {
      listId?: string;
      title?: string;
      items?: SharedListItem[];
    };
    if (!body.listId?.trim() || !body.title?.trim() || !Array.isArray(body.items)) {
      res.status(400).json({ error: "listId, title, and items required" });
      return;
    }
    try {
      const object = await createSharedList({
        identity: deps.identity,
        payload: {
          listId: body.listId.trim(),
          title: body.title.trim(),
          items: body.items,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/shared-list-update", async (req, res) => {
    const body = req.body as PeerSendBody & {
      listId?: string;
      title?: string;
      items?: SharedListItem[];
    };
    if (!body.listId?.trim() || !Array.isArray(body.items)) {
      res.status(400).json({ error: "listId and items required" });
      return;
    }
    try {
      const object = await createSharedListUpdate({
        identity: deps.identity,
        payload: {
          listId: body.listId.trim(),
          title: body.title?.trim() || undefined,
          items: body.items,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/location-pin", async (req, res) => {
    const body = req.body as PeerSendBody & {
      pinId?: string;
      label?: string;
      lat?: number;
      lng?: number;
      note?: string;
    };
    if (
      !body.pinId?.trim() ||
      !body.label?.trim() ||
      typeof body.lat !== "number" ||
      typeof body.lng !== "number"
    ) {
      res.status(400).json({ error: "pinId, label, lat, and lng required" });
      return;
    }
    try {
      const object = await createLocationPin({
        identity: deps.identity,
        payload: {
          pinId: body.pinId.trim(),
          label: body.label.trim(),
          lat: body.lat,
          lng: body.lng,
          note: body.note?.trim() || undefined,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/ttt-state", async (req, res) => {
    const body = req.body as PeerSendBody & {
      gameId?: string;
      board?: TttBoard;
      turn?: "X" | "O";
      status?: "active" | "won" | "draw";
      winner?: "X" | "O";
    };
    if (!body.gameId?.trim() || !Array.isArray(body.board) || body.board.length !== 9) {
      res.status(400).json({ error: "gameId and board[9] required" });
      return;
    }
    try {
      const object = await createTttState({
        identity: deps.identity,
        payload: {
          gameId: body.gameId.trim(),
          board: body.board,
          turn: body.turn === "O" ? "O" : "X",
          status: body.status === "won" || body.status === "draw" ? body.status : "active",
          winner: body.winner === "X" || body.winner === "O" ? body.winner : undefined,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/ttt-move", async (req, res) => {
    const body = req.body as PeerSendBody & {
      gameId?: string;
      cell?: number;
      mark?: "X" | "O";
    };
    if (!body.gameId?.trim() || typeof body.cell !== "number") {
      res.status(400).json({ error: "gameId and cell required" });
      return;
    }
    try {
      const object = await createTttMove({
        identity: deps.identity,
        payload: {
          gameId: body.gameId.trim(),
          cell: body.cell,
          mark: body.mark === "O" ? "O" : "X",
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/bs-state", async (req, res) => {
    const body = req.body as PeerSendBody & {
      gameId?: string;
      phase?: BsPhase;
      turn?: BsPlayer;
      commitA?: string;
      commitB?: string;
      shots?: BsShot[];
      winner?: BsPlayer;
      publicState?: Record<string, unknown>;
    };
    if (!body.gameId?.trim()) {
      res.status(400).json({ error: "gameId required" });
      return;
    }
    try {
      const object = await createBattleshipsState({
        identity: deps.identity,
        payload: {
          gameId: body.gameId.trim(),
          phase: body.phase === "battle" || body.phase === "won" ? body.phase : "setup",
          turn: body.turn === "B" ? "B" : "A",
          commitA: body.commitA?.trim() || undefined,
          commitB: body.commitB?.trim() || undefined,
          shots: Array.isArray(body.shots) ? body.shots : [],
          winner: body.winner === "A" || body.winner === "B" ? body.winner : undefined,
          publicState:
            body.publicState && typeof body.publicState === "object" && !Array.isArray(body.publicState)
              ? body.publicState
              : undefined,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/bs-move", async (req, res) => {
    const body = req.body as PeerSendBody & {
      gameId?: string;
      player?: BsPlayer;
      action?: "place" | "fire";
      cells?: number[];
      cell?: number;
    };
    if (!body.gameId?.trim()) {
      res.status(400).json({ error: "gameId required" });
      return;
    }
    try {
      const object = await createBattleshipsMove({
        identity: deps.identity,
        payload: {
          gameId: body.gameId.trim(),
          player: body.player === "B" ? "B" : "A",
          action: body.action === "fire" ? "fire" : "place",
          cells: Array.isArray(body.cells) ? body.cells : undefined,
          cell: typeof body.cell === "number" ? body.cell : undefined,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/coordination/bs-shot", async (req, res) => {
    const body = req.body as PeerSendBody & {
      gameId?: string;
      cell?: number;
      shooter?: BsPlayer;
      hit?: boolean;
    };
    if (!body.gameId?.trim() || typeof body.cell !== "number") {
      res.status(400).json({ error: "gameId and cell required" });
      return;
    }
    try {
      const object = await createBattleshipsShot({
        identity: deps.identity,
        payload: {
          gameId: body.gameId.trim(),
          cell: body.cell,
          shooter: body.shooter === "B" ? "B" : "A",
          hit: body.hit === true,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/commerce/split-bill", async (req, res) => {
    const body = req.body as PeerSendBody & {
      splitId?: string;
      label?: string;
      totalMinor?: number;
      currency?: string;
      splitCount?: number;
      shareMinor?: number;
    };
    if (
      !body.splitId?.trim() ||
      !body.label?.trim() ||
      typeof body.totalMinor !== "number" ||
      typeof body.shareMinor !== "number" ||
      typeof body.splitCount !== "number"
    ) {
      res.status(400).json({ error: "splitId, label, totalMinor, shareMinor, and splitCount required" });
      return;
    }
    try {
      const object = await createSplitProposal({
        identity: deps.identity,
        payload: {
          splitId: body.splitId.trim(),
          label: body.label.trim(),
          totalMinor: body.totalMinor,
          currency: (body.currency?.trim() || "USD").toUpperCase(),
          splitCount: body.splitCount,
          shareMinor: body.shareMinor,
          threadId: body.threadId?.trim() || undefined,
        },
      });
      await sendCoordinationObject(deps, res, body, object);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
