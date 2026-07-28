/**
 * Dialling Atom peers, and reading their cards, on A2A v1.0.
 *
 * The compat layer has to be asked for on the client side too, and it takes two
 * pieces that must agree: the card resolver translates a v0.3-shaped card into
 * the v1.0 shape and stamps each interface it synthesizes with
 * `protocolVersion: '0.3'`, and the transport factory reads that stamp to decide
 * whether to speak v0.3 or v1.0 to this particular peer. Configure one without
 * the other and the negotiation silently stops working — which is why this lives
 * in one function instead of at each of the call sites that used to say
 * `new ClientFactory()`.
 *
 * The upshot for the network: an upgraded agent talks v1.0 to upgraded peers and
 * v0.3 to everyone else, per peer, decided by that peer's own card. No
 * coordinated cutover, and no flag day.
 */

import type { AgentCard } from "@a2a-js/sdk";
import {
  ClientFactory,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  type Client,
} from "@a2a-js/sdk/client";

const legacyCompat = { enabled: true };

/** Strip the JSON-RPC suffix so the card is resolved at the host root. */
export function normalizePeerBaseUrl(peerUrl: string): string {
  return peerUrl.replace(/\/a2a\/jsonrpc\/?$/i, "").replace(/\/$/, "");
}

function atomClientFactory(): ClientFactory {
  return new ClientFactory({
    transports: [new JsonRpcTransportFactory({ legacyCompat })],
    cardResolver: new DefaultAgentCardResolver({ legacyCompat }),
  });
}

/**
 * Create a client for an Atom peer, given either its host root or its
 * `/a2a/jsonrpc` endpoint. Negotiates the protocol version from the peer's card.
 */
export async function createAtomPeerClient(peerUrl: string): Promise<Client> {
  return atomClientFactory().createFromUrl(normalizePeerBaseUrl(peerUrl));
}

/**
 * Fetch a peer's agent card as a v1.0 card, whichever version the peer serves.
 *
 * Callers that only want to inspect a card — discovery, domain verification,
 * swarm labelling — should use this rather than fetching the well-known path
 * directly, because a peer on v0.3 returns a differently shaped document and the
 * resolver is what normalises it.
 */
export async function fetchAtomAgentCard(baseUrl: string): Promise<AgentCard> {
  return new DefaultAgentCardResolver({ legacyCompat }).resolve(normalizePeerBaseUrl(baseUrl));
}
