import express from "express";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  type AgentExecutor,
} from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import type { AgentCard } from "@a2a-js/sdk";

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
}

/**
 * Express app with agent card + JSON-RPC A2A endpoint.
 *
 * Both protocol versions are served from the one `/a2a/jsonrpc` path. The SDK
 * dispatches on the `A2A-Version` header rather than the URL, so a v0.3 peer
 * needs no new address and no coordinated cutover — it keeps posting
 * `message/send` to the same place and the compat layer translates.
 */
export function createAtomA2aExpressApp(options: CreateAtomA2aExpressAppOptions): express.Express {
  const requestHandler = new DefaultRequestHandler(
    options.agentCard,
    new InMemoryTaskStore(),
    options.executor,
  );
  const legacyCompat = { enabled: options.legacyCompat ?? true };

  const app = express();
  app.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler, legacyCompat }),
  );
  app.use(
    "/a2a/jsonrpc",
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication, legacyCompat }),
  );
  return app;
}
