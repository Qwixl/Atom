import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { resolveDataPath } from "./dataDir.js";
import { verifySessionToken, type SessionScope } from "./sessionToken.js";

export type AdminAuthContext =
  | { kind: "admin" }
  | { kind: "session"; scopes: SessionScope[] };

export interface AuthenticatedRequest extends Request {
  auth?: AdminAuthContext;
}

const TOKEN_FILE = "agent-admin-token.txt";

export interface AdminAuthState {
  token: string;
  /** True when the token was just generated and should be printed once at startup. */
  isNew: boolean;
}

export async function loadOrCreateAdminToken(): Promise<AdminAuthState> {
  const envToken = process.env.ATOM_ADMIN_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, isNew: false };
  }

  const tokenPath = resolveDataPath(TOKEN_FILE);
  try {
    const token = (await readFile(tokenPath, "utf8")).trim();
    if (token) return { token, isNew: false };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const token = randomBytes(32).toString("base64url");
  await mkdir(path.dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
  return { token, isNew: true };
}

export function adminTokenPath(): string {
  return resolveDataPath(TOKEN_FILE);
}

const PUBLIC_ADMIN_PATHS = new Set(["/mls/key-package"]);

function isPublicOAuthCallback(req: Request): boolean {
  return req.method === "GET" && req.path === "/connectors/microsoft/callback";
}

function isPublicRoomRoute(req: Request): boolean {
  if (req.method === "POST" && /^\/rooms\/[^/]+\/(join|relay|leave)$/.test(req.path)) return true;
  if (req.method !== "GET") return false;
  if (/^\/rooms\/[^/]+$/.test(req.path)) return true;
  return /^\/rooms\/[^/]+\/(members|messages|stats)$/.test(req.path);
}

export function requireAdminAuth(expectedToken: string) {
  return createAdminAuthMiddleware(expectedToken);
}

/** Routes that require the root admin bearer even when a session scope is otherwise broad. */
function isSessionAdminDenied(req: Request): boolean {
  // Root-only: minting sessions and vault export/import.
  if (req.method === "POST" && req.path === "/admin/session-token") return true;
  if (req.method === "POST" && (req.path === "/admin/export" || req.path === "/admin/import")) {
    return true;
  }
  return false;
}

function allowsSessionAuth(req: Request, scopes: SessionScope[]): boolean {
  if (isSessionAdminDenied(req)) return false;

  // Broad owner runtime: custody, comms, brain, settings writes — short-lived only (AS-09 / M21.4).
  if (scopes.includes("owner:runtime")) return true;

  if (
    (req.method === "GET" && (req.path === "/connectors" || /^\/connectors\//.test(req.path))) ||
    (req.method === "POST" && /^\/connectors\/[^/]+\/invoke$/.test(req.path))
  ) {
    return scopes.includes("connector:read");
  }
  // AG-UI Chat SSE — short-lived chat:agui only.
  if (req.method === "POST" && (req.path === "/agent" || req.path.endsWith("/agent"))) {
    return scopes.includes("chat:agui");
  }
  return false;
}

export function createAdminAuthMiddleware(expectedToken: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.method === "GET" && PUBLIC_ADMIN_PATHS.has(req.path)) {
      next();
      return;
    }
    if (isPublicOAuthCallback(req)) {
      next();
      return;
    }
    if (isPublicRoomRoute(req)) {
      next();
      return;
    }
    const header = req.headers.authorization;
    if (header === `Bearer ${expectedToken}`) {
      req.auth = { kind: "admin" };
      next();
      return;
    }
    const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (bearer) {
      const payload = verifySessionToken(expectedToken, bearer);
      if (payload) {
        if (!allowsSessionAuth(req, payload.scopes)) {
          res.status(403).json({ error: "Session token not valid for this route" });
          return;
        }
        req.auth = { kind: "session", scopes: payload.scopes };
        next();
        return;
      }
    }
    res.status(401).json({ error: "Unauthorized" });
  };
}

export function isAdminAuth(req: AuthenticatedRequest): boolean {
  return req.auth?.kind === "admin";
}

export function hasSessionScope(req: AuthenticatedRequest, scope: SessionScope): boolean {
  if (req.auth?.kind === "admin") return true;
  if (req.auth?.kind === "session") return req.auth.scopes.includes(scope);
  return false;
}
