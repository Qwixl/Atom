/**
 * Express middleware and A2A UserBuilder for Atom DID Bearer transport auth.
 */

import type { Request, RequestHandler, Response, NextFunction } from "express";
import {
  ATOM_TRANSPORT_AUTH_SCHEME,
  extractBearerToken,
  verifyAtomTransportToken,
} from "./transportAuth.js";

/** Authenticated caller whose `userName` is their `did:key`. */
export class AtomDidUser {
  constructor(readonly did: string) {}

  get isAuthenticated(): boolean {
    return true;
  }

  get userName(): string {
    return this.did;
  }
}

export type AtomTransportAudience = string | (() => string | Promise<string>);

export interface AtomTransportAuthOptions {
  /**
   * Public base URL this agent advertises (token `aud`). May be a getter so
   * tests that rebind the card after listen(0) still verify against the live URL.
   */
  audience: AtomTransportAudience;
  /**
   * When true, reject requests without a valid Atom DID Bearer token.
   * Agent cards still advertise the scheme either way.
   */
  required?: boolean;
}

async function resolveAudience(audience: AtomTransportAudience): Promise<string> {
  return typeof audience === "function" ? audience() : audience;
}

function unauthorized(res: Response, detail: string): void {
  res
    .status(401)
    .set(
      "WWW-Authenticate",
      `Bearer realm="atom", error="invalid_token", error_description="${detail.replace(/"/g, "")}"`,
    )
    .json({ error: "unauthorized", detail });
}

/**
 * Middleware for `/a2a/jsonrpc`. Verifies `Authorization: Bearer atom.…`
 * when `required` is true; otherwise attaches a verified user when present.
 */
export function createAtomTransportAuthMiddleware(
  options: AtomTransportAuthOptions,
): RequestHandler {
  const required = options.required ?? true;
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const audience = await resolveAudience(options.audience);
      if (!audience) {
        if (required) {
          unauthorized(res, "transport auth audience not configured");
          return;
        }
        next();
        return;
      }
      const token = extractBearerToken(
        typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
      );
      if (!token) {
        if (required) {
          unauthorized(res, "missing bearer token");
          return;
        }
        next();
        return;
      }
      try {
        const { did } = await verifyAtomTransportToken({ token, audience });
        (req as Request & { atomCallerDid?: string }).atomCallerDid = did;
        next();
      } catch (error) {
        if (required) {
          unauthorized(res, error instanceof Error ? error.message : "invalid token");
          return;
        }
        next();
      }
    })().catch(next);
  };
}

/** Build an A2A SDK User from a verified Atom DID Bearer, or unauthenticated. */
export function createAtomTransportUserBuilder(options: AtomTransportAuthOptions) {
  const required = options.required ?? true;
  return async (req: Request): Promise<AtomDidUser | { isAuthenticated: false; userName: string }> => {
    const fromMiddleware = (req as Request & { atomCallerDid?: string }).atomCallerDid;
    if (fromMiddleware) {
      return new AtomDidUser(fromMiddleware);
    }
    const audience = await resolveAudience(options.audience);
    const token = extractBearerToken(
      typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
    );
    if (!token) {
      if (required) {
        throw new Error("missing bearer token");
      }
      return { isAuthenticated: false, userName: "anonymous" };
    }
    const { did } = await verifyAtomTransportToken({ token, audience });
    return new AtomDidUser(did);
  };
}

export { ATOM_TRANSPORT_AUTH_SCHEME };
