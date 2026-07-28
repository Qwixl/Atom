import express from "express";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  type AgentExecutor,
} from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import type { AgentCard } from "@a2a-js/sdk";
import {
  createAtomTransportAuthMiddleware,
  createAtomTransportUserBuilder,
  type AtomTransportAudience,
} from "./transportAuthMiddleware.js";
import { agentCardUrl } from "./agentCard.js";

export interface CreateAtomA2aExpressAppOptions {
  agentCard: AgentCard;
  executor: AgentExecutor;
  /**
   * Accept A2A v0.3 callers as well as v1.0. On by default: the Atom network has
   * peers we do not deploy — self-hosted shells, the reference peer sample, and
   * anything built against the published `@qwixl/a2a-transport` — and turning
   * this off drops every one of them that has not upgraded.
   *
   * Requires the card to declare a v0.3 interface, which `buildAtomAgentCard`
   * does unless `legacyInterface` is false.
   */
  legacyCompat?: boolean;
  /**
   * Public base URL used as the Atom DID Bearer token audience. Defaults to a
   * getter that reads the card's first interface URL (so listen(0) + rebind
   * still works). Prefer a fixed string in production.
   */
  transportAuthAudience?: AtomTransportAudience;
  /**
   * Require a valid Atom DID Bearer on `/a2a/jsonrpc`. Defaults to true.
   * Set false only for protocol-compat tests that exercise unauthenticated
   * legacy peers; production agents leave this on.
   */
  requireTransportAuth?: boolean;
}

function audienceFromCard(card: AgentCard): string {
  const interfaceUrl = agentCardUrl(card);
  if (!interfaceUrl) return "";
  return interfaceUrl.replace(/\/a2a\/jsonrpc\/?$/i, "").replace(/\/$/, "");
}

/**
 * Express app with agent card + JSON-RPC A2A endpoint.
 *
 * Both protocol versions are served from the one `/a2a/jsonrpc` path. The SDK
 * dispatches on the `A2A-Version` header rather than the URL, so a v0.3 peer
 * needs no new address and no coordinated cutover — it keeps posting
 * `message/send` to the same place and the compat layer translates.
 *
 * Message submission is authenticated with Atom DID Bearer tokens declared on
 * the agent card (`atomDidBearer`), unless `requireTransportAuth` is false.
 */
export function createAtomA2aExpressApp(options: CreateAtomA2aExpressAppOptions): express.Express {
  const requestHandler = new DefaultRequestHandler(
    options.agentCard,
    new InMemoryTaskStore(),
    options.executor,
  );
  const legacyCompat = { enabled: options.legacyCompat ?? true };
  const requireTransportAuth = options.requireTransportAuth ?? true;
  const audience: AtomTransportAudience =
    options.transportAuthAudience ?? (() => audienceFromCard(options.agentCard));

  const app = express();
  app.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler, legacyCompat }),
  );

  const authOpts = { audience, required: requireTransportAuth };
  app.use("/a2a/jsonrpc", createAtomTransportAuthMiddleware(authOpts));

  const userBuilder = createAtomTransportUserBuilder(authOpts);

  app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler, userBuilder, legacyCompat }));
  return app;
}
