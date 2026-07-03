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
}

/** Express app with agent card + JSON-RPC A2A endpoint. */
export function createAtomA2aExpressApp(options: CreateAtomA2aExpressAppOptions): express.Express {
  const requestHandler = new DefaultRequestHandler(
    options.agentCard,
    new InMemoryTaskStore(),
    options.executor,
  );

  const app = express();
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  app.use(
    "/a2a/jsonrpc",
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }),
  );
  return app;
}
