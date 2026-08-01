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
 *
 * When `identity` is supplied, every JSON-RPC call carries an Atom DID Bearer
 * token (`Authorization: Bearer atom.…`) minted for the peer's public base URL.
 */

import type { AgentCard } from "@a2a-js/sdk";
import {
  ClientFactory,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  createAuthenticatingFetchWithRetry,
  type AuthenticationHandler,
  type Client,
} from "@a2a-js/sdk/client";
import type { AgentKeyPair } from "@qwixl/protocol";
import {
  authorizationHeaderFromToken,
  mintAtomTransportToken,
} from "./transportAuth.js";
import {
  A2A_EXTENSIONS_HEADER,
  defaultAtomA2aExtensionUris,
  formatA2aExtensionsHeader,
} from "./a2aExtensions.js";

const legacyCompat = { enabled: true };

/** Strip the JSON-RPC suffix so the card is resolved at the host root. */
export function normalizePeerBaseUrl(peerUrl: string): string {
  return peerUrl.replace(/\/a2a\/jsonrpc\/?$/i, "").replace(/\/$/, "");
}

export interface CreateAtomPeerClientOptions {
  /** Local agent identity — required when the peer enforces transport auth. */
  identity?: AgentKeyPair;
  /** Token audience; defaults to the normalised peer base URL. */
  audience?: string;
  fetchImpl?: typeof fetch;
}

function withA2aExtensionsHeader(fetchImpl: typeof fetch): typeof fetch {
  const uris = formatA2aExtensionsHeader(defaultAtomA2aExtensionUris());
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has(A2A_EXTENSIONS_HEADER) && !headers.has("X-A2A-Extensions")) {
      headers.set(A2A_EXTENSIONS_HEADER, uris);
    }
    return fetchImpl(input, { ...init, headers });
  };
}

function atomAuthFetch(opts: {
  identity: AgentKeyPair;
  audience: string;
  fetchImpl: typeof fetch;
}): typeof fetch {
  const authHandler: AuthenticationHandler = {
    headers: async () => {
      const token = await mintAtomTransportToken({
        identity: opts.identity,
        audience: opts.audience,
      });
      return { Authorization: authorizationHeaderFromToken(token) };
    },
    shouldRetryWithHeaders: async (_req, res) => {
      if (res.status !== 401) return undefined;
      const token = await mintAtomTransportToken({
        identity: opts.identity,
        audience: opts.audience,
      });
      return { Authorization: authorizationHeaderFromToken(token) };
    },
  };
  return createAuthenticatingFetchWithRetry(opts.fetchImpl, authHandler);
}

function atomClientFactory(fetchImpl?: typeof fetch): ClientFactory {
  return new ClientFactory({
    transports: [new JsonRpcTransportFactory({ legacyCompat, fetchImpl })],
    cardResolver: new DefaultAgentCardResolver({ legacyCompat, fetchImpl }),
  });
}

/**
 * Create a client for an Atom peer, given either its host root or its
 * `/a2a/jsonrpc` endpoint. Negotiates the protocol version from the peer's card.
 *
 * Atom→Atom requests SHOULD carry `A2A-Extensions` listing the GO URI (D130).
 * The header is telemetry / process completeness — not a GO security control.
 */
export async function createAtomPeerClient(
  peerUrl: string,
  options?: CreateAtomPeerClientOptions,
): Promise<Client> {
  const base = normalizePeerBaseUrl(peerUrl);
  const audience = options?.audience ?? base;
  let fetchImpl = options?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  fetchImpl = withA2aExtensionsHeader(fetchImpl);
  if (options?.identity) {
    fetchImpl = atomAuthFetch({
      identity: options.identity,
      audience,
      fetchImpl,
    });
  }
  return atomClientFactory(fetchImpl).createFromUrl(base);
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
