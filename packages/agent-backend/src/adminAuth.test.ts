import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadOrCreateAdminToken, requireAdminAuth } from "./adminAuth.js";

describe("adminAuth", () => {
  it("loads a fixed token from ATOM_ADMIN_TOKEN", async () => {
    const prev = process.env.ATOM_ADMIN_TOKEN;
    process.env.ATOM_ADMIN_TOKEN = "test-token-123";
    try {
      const auth = await loadOrCreateAdminToken();
      expect(auth.token).toBe("test-token-123");
      expect(auth.isNew).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ATOM_ADMIN_TOKEN;
      else process.env.ATOM_ADMIN_TOKEN = prev;
    }
  });

  it("generates and persists a token when unset", async () => {
    const prevToken = process.env.ATOM_ADMIN_TOKEN;
    const prevData = process.env.ATOM_DATA_DIR;
    const dir = await mkdtemp(path.join(tmpdir(), "atom-admin-auth-"));
    delete process.env.ATOM_ADMIN_TOKEN;
    process.env.ATOM_DATA_DIR = dir;
    try {
      const first = await loadOrCreateAdminToken();
      expect(first.isNew).toBe(true);
      expect(first.token.length).toBeGreaterThan(20);
      const second = await loadOrCreateAdminToken();
      expect(second.token).toBe(first.token);
      expect(second.isNew).toBe(false);
    } finally {
      if (prevToken === undefined) delete process.env.ATOM_ADMIN_TOKEN;
      else process.env.ATOM_ADMIN_TOKEN = prevToken;
      if (prevData === undefined) delete process.env.ATOM_DATA_DIR;
      else process.env.ATOM_DATA_DIR = prevData;
    }
  });

  it("requireAdminAuth rejects missing bearer token", () => {
    const middleware = requireAdminAuth("secret");
    const next = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    middleware({ headers: {}, method: "GET", path: "/inbox" } as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts chat:agui session token for POST /agent", async () => {
    const { mintSessionToken } = await import("./sessionToken.js");
    const middleware = requireAdminAuth("secret");
    const next = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const token = mintSessionToken("secret", { scopes: ["chat:agui"], ttlMs: 60_000 });
    const req = {
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      path: "/agent",
    };
    middleware(req as never, res as never, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("accepts owner:runtime session token for custody routes", async () => {
    const { mintSessionToken } = await import("./sessionToken.js");
    const middleware = requireAdminAuth("secret");
    const next = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const token = mintSessionToken("secret", { scopes: ["owner:runtime"], ttlMs: 60_000 });
    middleware(
      {
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
        path: "/custody/unlock/options",
      } as never,
      res as never,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects owner:runtime session token for export", async () => {
    const { mintSessionToken } = await import("./sessionToken.js");
    const middleware = requireAdminAuth("secret");
    const next = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const token = mintSessionToken("secret", { scopes: ["owner:runtime"], ttlMs: 60_000 });
    middleware(
      {
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
        path: "/admin/export",
      } as never,
      res as never,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts connector:read for GET /connectors list", async () => {
    const { mintSessionToken } = await import("./sessionToken.js");
    const middleware = requireAdminAuth("secret");
    const next = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const token = mintSessionToken("secret", { scopes: ["connector:read"], ttlMs: 60_000 });
    middleware(
      {
        headers: { authorization: `Bearer ${token}` },
        method: "GET",
        path: "/connectors",
      } as never,
      res as never,
      next,
    );
    expect(next).toHaveBeenCalled();
  });
});
