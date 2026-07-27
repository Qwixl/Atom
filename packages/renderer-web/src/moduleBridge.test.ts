import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModuleBridge } from "./moduleBridge.js";

/**
 * The module iframe is always sandboxed without allow-same-origin, so its document has
 * an opaque origin no matter which host served the bundle. These tests pin the two
 * consequences a cross-origin store bundle depends on: init must be posted to "*", and
 * replies arriving as origin "null" must be accepted. Before this was fixed, a
 * cross-origin bundle was posted an init it could never receive.
 */
const SHELL_ORIGIN = "https://atom.qwixl.com";
const STORE_BUNDLE = "https://atom.apps.qwixl.com/v1/bundles/demo/1.0.0/index.html";
const SHELL_BUNDLE = "/modules/games-tictactoe/index.html";

function fakeWindow() {
  return { postMessage: vi.fn() } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> };
}

/** First postMessage call, as [message, targetOrigin]. Throws if init never fired. */
function initCall(win: ReturnType<typeof fakeWindow>): [Record<string, unknown>, string] {
  const call = win.postMessage.mock.calls[0];
  if (!call) throw new Error("sendInit did not post a message");
  return call as [Record<string, unknown>, string];
}

function initTarget(bundleUrl: string): string {
  const win = fakeWindow();
  createModuleBridge(bundleUrl).sendInit(win, { a: 1 });
  return initCall(win)[1];
}

describe("createModuleBridge", () => {
  beforeEach(() => {
    // No jsdom in this repo, so stand up only what the bridge and theme reader touch.
    vi.stubGlobal("window", { location: { origin: SHELL_ORIGIN } });
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts init to \"*\" for a shell-served bundle", () => {
    expect(initTarget(SHELL_BUNDLE)).toBe("*");
  });

  it("posts init to \"*\" for a cross-origin store bundle, which cannot be addressed by origin", () => {
    expect(initTarget(STORE_BUNDLE)).toBe("*");
  });

  it("accepts replies from an opaque origin for a shell-served bundle", () => {
    expect(createModuleBridge(SHELL_BUNDLE).isAllowedMessageOrigin("null")).toBe(true);
  });

  it("accepts replies from an opaque origin for a cross-origin store bundle", () => {
    expect(createModuleBridge(STORE_BUNDLE).isAllowedMessageOrigin("null")).toBe(true);
  });

  it("still accepts the bundle origin, for a frame that is not sandboxed", () => {
    expect(
      createModuleBridge(STORE_BUNDLE).isAllowedMessageOrigin("https://atom.apps.qwixl.com"),
    ).toBe(true);
  });

  it("rejects an unrelated origin", () => {
    expect(createModuleBridge(STORE_BUNDLE).isAllowedMessageOrigin("https://evil.example")).toBe(
      false,
    );
  });

  it("sends the init envelope the module API expects", () => {
    const win = fakeWindow();
    createModuleBridge(SHELL_BUNDLE).sendInit(win, { greeting: "hi" });
    const [message] = initCall(win);
    expect(message).toMatchObject({ type: "init", props: { greeting: "hi" } });
    expect(message).toHaveProperty("theme");
  });
});
