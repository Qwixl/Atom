import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hostedAuth = vi.hoisted(() => ({
  token: null as string | null,
}));

const firstRun = vi.hoisted(() => ({
  done: false,
}));

const demo = vi.hoisted(() => ({
  active: false,
  cleared: false,
}));

vi.mock("../hostConfig.js", () => ({
  MANAGED_HOSTING: true,
  isSupabaseConfigured: () => true,
}));

vi.mock("./hostedAccount.js", () => ({
  supabaseAccessToken: async () => hostedAuth.token,
}));

vi.mock("../firstRunStorage.js", () => ({
  loadFirstRunDone: () => firstRun.done,
}));

vi.mock("../demo/demoSessionStorage.js", () => ({
  isDemoSessionActive: () => demo.active,
  clearDemoSession: () => {
    demo.cleared = true;
    demo.active = false;
  },
}));

import { checkLiveAppAuth } from "./authGate.js";

describe("checkLiveAppAuth", () => {
  beforeEach(() => {
    hostedAuth.token = null;
    firstRun.done = false;
    demo.active = false;
    demo.cleared = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefers hosted session over leftover demo flag", async () => {
    hostedAuth.token = "jwt";
    firstRun.done = true;
    demo.active = true;
    const result = await checkLiveAppAuth();
    expect(result).toEqual({ status: "ready" });
    expect(demo.cleared).toBe(true);
  });

  it("redirects to demo when no session and demo flag set", async () => {
    demo.active = true;
    const result = await checkLiveAppAuth();
    expect(result).toEqual({ status: "redirect", href: "/app/?demo=session" });
  });

  it("redirects to login when hosted and signed out", async () => {
    const result = await checkLiveAppAuth();
    expect(result).toEqual({ status: "redirect", href: "/app/?auth=login" });
  });
});
