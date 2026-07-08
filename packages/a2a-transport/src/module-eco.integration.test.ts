import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ClientFactory } from "@a2a-js/sdk/client";
import { generateAgentKeyPair, type AgentKeyPair } from "@qwixl/protocol";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COMMERCE_SPLIT_PROPOSAL_PURPOSE,
  COORDINATION_POLL_PURPOSE,
  COORDINATION_POLL_VOTE_PURPOSE,
  COORDINATION_SHARED_LIST_PURPOSE,
  COORDINATION_SHARED_LIST_UPDATE_PURPOSE,
  COORDINATION_LOCATION_PIN_PURPOSE,
  createPollRequest,
  createPollVote,
  createSharedList,
  createSharedListUpdate,
  createLocationPin,
  createSplitProposal,
  createTttMove,
  createTttState,
  GAME_TTT_MOVE_PURPOSE,
  GAME_TTT_STATE_PURPOSE,
  sendDataObject,
  verifyPollRequest,
  verifyPollVote,
  verifySharedList,
  verifySharedListUpdate,
  verifyLocationPin,
  verifySplitProposal,
  verifyTttMove,
  verifyTttState,
} from "./index.js";
import { createAtomA2aExpressApp } from "./server-entry.js";

/**
 * M-ECO-10: two-agent A2A round-trip per coordination/commerce module purpose.
 * Scheduling (M-ECO-01) is covered in coordination.integration.test.ts.
 */
describe("M-ECO module A2A round-trips", () => {
  async function withPeerReceiver(
    allowedPurposes: string[],
    run: (opts: {
      sender: AgentKeyPair;
      receiver: AgentKeyPair;
      peerBaseUrl: string;
      received: string[];
    }) => Promise<void>,
  ): Promise<void> {
    const sender = await generateAgentKeyPair();
    const receiver = await generateAgentKeyPair();
    const received: string[] = [];

    const executor = new AtomDataObjectExecutor({
      identity: receiver,
      allowedPurposes,
      sendReceipt: false,
      onReceive: (event) => {
        received.push(event.object.governance.purpose);
      },
    });

    const agentCard = buildAtomAgentCard({
      name: "M-ECO peer",
      description: "Module ecosystem integration peer",
      baseUrl: "http://127.0.0.1:0",
    });

    const app = createAtomA2aExpressApp({ agentCard, executor });
    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });

    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    agentCard.url = `${baseUrl}/a2a/jsonrpc`;
    agentCard.additionalInterfaces = [{ url: agentCard.url, transport: "JSONRPC" }];

    try {
      await run({ sender, receiver, peerBaseUrl: baseUrl, received });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it("M-ECO-02 poll request + vote", async () => {
    await withPeerReceiver(
      [COORDINATION_POLL_PURPOSE, COORDINATION_POLL_VOTE_PURPOSE],
      async ({ sender, receiver, peerBaseUrl, received }) => {
        const poll = await createPollRequest({
          identity: sender,
          payload: {
            question: "Lunch?",
            options: [
              { id: "a", label: "Pizza" },
              { id: "b", label: "Salad" },
            ],
          },
        });
        await verifyPollRequest(poll);

        const factory = new ClientFactory();
        const client = await factory.createFromUrl(peerBaseUrl);
        await sendDataObject(client, { object: poll, role: "user" });

        const vote = await createPollVote({
          identity: receiver,
          payload: { pollId: poll.id, optionId: "a" },
        });
        await verifyPollVote(vote);
        await sendDataObject(client, { object: vote, role: "user" });

        expect(received).toEqual([COORDINATION_POLL_PURPOSE, COORDINATION_POLL_VOTE_PURPOSE]);
      },
    );
  });

  it("M-ECO-03 tic-tac-toe state + move", async () => {
    await withPeerReceiver(
      [GAME_TTT_STATE_PURPOSE, GAME_TTT_MOVE_PURPOSE],
      async ({ sender, peerBaseUrl, received }) => {
        const state = await createTttState({
          identity: sender,
          payload: {
            gameId: "ttt-1",
            board: [null, null, null, null, null, null, null, null, null],
            turn: "X",
            status: "active",
          },
        });
        await verifyTttState(state);

        const factory = new ClientFactory();
        const client = await factory.createFromUrl(peerBaseUrl);
        await sendDataObject(client, { object: state, role: "user" });

        const move = await createTttMove({
          identity: sender,
          payload: { gameId: "ttt-1", cell: 4, mark: "X" },
        });
        await verifyTttMove(move);
        await sendDataObject(client, { object: move, role: "user" });

        expect(received).toEqual([GAME_TTT_STATE_PURPOSE, GAME_TTT_MOVE_PURPOSE]);
      },
    );
  });

  it("M-ECO-04 shared list + update", async () => {
    await withPeerReceiver(
      [COORDINATION_SHARED_LIST_PURPOSE, COORDINATION_SHARED_LIST_UPDATE_PURPOSE],
      async ({ sender, peerBaseUrl, received }) => {
        const list = await createSharedList({
          identity: sender,
          payload: {
            listId: "list-1",
            title: "Groceries",
            items: [{ id: "milk", text: "Milk", done: false }],
          },
        });
        await verifySharedList(list);

        const factory = new ClientFactory();
        const client = await factory.createFromUrl(peerBaseUrl);
        await sendDataObject(client, { object: list, role: "user" });

        const update = await createSharedListUpdate({
          identity: sender,
          payload: {
            listId: "list-1",
            items: [{ id: "milk", text: "Milk", done: true }],
          },
        });
        await verifySharedListUpdate(update);
        await sendDataObject(client, { object: update, role: "user" });

        expect(received).toEqual([
          COORDINATION_SHARED_LIST_PURPOSE,
          COORDINATION_SHARED_LIST_UPDATE_PURPOSE,
        ]);
      },
    );
  });

  it("BK-03 location pin", async () => {
    await withPeerReceiver([COORDINATION_LOCATION_PIN_PURPOSE], async ({ sender, peerBaseUrl, received }) => {
      const pin = await createLocationPin({
        identity: sender,
        payload: {
          pinId: "pin-1",
          label: "School gate",
          lat: 51.5074,
          lng: -0.1278,
          note: "Blue door",
        },
      });
      await verifyLocationPin(pin);

      const factory = new ClientFactory();
      const client = await factory.createFromUrl(peerBaseUrl);
      await sendDataObject(client, { object: pin, role: "user" });

      expect(received).toEqual([COORDINATION_LOCATION_PIN_PURPOSE]);
    });
  });

  it("M-ECO-05 split proposal", async () => {
    await withPeerReceiver([COMMERCE_SPLIT_PROPOSAL_PURPOSE], async ({ sender, peerBaseUrl, received }) => {
      const split = await createSplitProposal({
        identity: sender,
        payload: {
          splitId: "split-1",
          label: "Dinner",
          totalMinor: 4000,
          currency: "USD",
          splitCount: 2,
          shareMinor: 2000,
        },
      });
      await verifySplitProposal(split);

      const factory = new ClientFactory();
      const client = await factory.createFromUrl(peerBaseUrl);
      await sendDataObject(client, { object: split, role: "user" });

      expect(received).toEqual([COMMERCE_SPLIT_PROPOSAL_PURPOSE]);
    });
  });
});
