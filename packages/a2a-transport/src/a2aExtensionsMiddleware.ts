/**
 * Observe `A2A-Extensions` on inbound A2A HTTP (D130).
 *
 * Missing header never refuses Governed Object parts. Required-extension
 * refusal is only for cards that mark an extension `required: true` and is
 * evaluated separately via `missingRequiredExtensions`.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  A2A_EXTENSIONS_HEADER,
  parseA2aExtensionsHeader,
} from "./a2aExtensions.js";

export type AtomA2aExtensionsRequest = Request & {
  atomA2aExtensions?: string[];
};

export function createA2aExtensionsObserveMiddleware(): RequestHandler {
  return (req: AtomA2aExtensionsRequest, _res: Response, next: NextFunction) => {
    const raw =
      req.header(A2A_EXTENSIONS_HEADER) ?? req.header("X-A2A-Extensions") ?? undefined;
    req.atomA2aExtensions = parseA2aExtensionsHeader(raw);
    next();
  };
}
