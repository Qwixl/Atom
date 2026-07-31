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
import {
  assertRequiredExtensionsSupported,
  ExtensionSupportRequiredError,
} from "./a2aExtensions.js";
import {
  createA2aExtensionsObserveMiddleware,
  type AtomA2aExtensionsRequest,
} from "./a2aExtensionsMiddleware.js";
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
  /**
   * When true, refuse `/a2a/jsonrpc` if the card marks any extension
   * `required: true` that the client did not declare on `A2A-Extensions`.
   * Defaults false: Atom's GO extension is optional. Enable for fixture cards
   * that exercise binding-native required-extension refusal.
   */
  enforceRequiredExtensions?: boolean;
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
  app.use("/a2a/jsonrpc", createA2aExtensionsObserveMiddleware());
  if (options.enforceRequiredExtensions) {
    app.use("/a2a/jsonrpc", (req: AtomA2aExtensionsRequest, res, next) => {
      try {
        assertRequiredExtensionsSupported(
          options.agentCard,
          req.atomA2aExtensions ?? [],
        );
        next();
      } catch (error) {
        if (error instanceof ExtensionSupportRequiredError) {
          res.status(400).json({
            error: error.name,
            message: error.message,
            missingExtensionUris: error.missingExtensionUris,
          });
          return;
        }
        next(error);
      }
    });
  }
  app.use("/a2a/jsonrpc", createAtomTransportAuthMiddleware(authOpts));

  const userBuilder = createAtomTransportUserBuilder(authOpts);

  app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler, userBuilder, legacyCompat }));
  return app;
}
