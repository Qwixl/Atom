import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptInstallHandoffUrl,
  assertInstallEntitlementReady,
  clearPendingInstallHandoff,
  INSTALL_HANDOFF_EVENT,
  isInstallHandoffUrl,
  loadPendingInstallHandoff,
  parseInstallHandoff,
  savePendingInstallHandoff,
} from "./installHandoff.js";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
  const bus = new EventTarget();
  vi.stubGlobal("window", {
    dispatchEvent: (event: Event) => bus.dispatchEvent(event),
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => bus.addEventListener(type, listener, options),
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => bus.removeEventListener(type, listener, options),
  });
  vi.stubGlobal(
    "CustomEvent",
    class CustomEvent extends Event {
      detail: unknown;
      constructor(type: string, init?: CustomEventInit) {
        super(type, init);
        this.detail = init?.detail;
      }
    },
  );
});

afterEach(() => {
  clearPendingInstallHandoff();
  vi.unstubAllGlobals();
});

describe("installHandoff", () => {
  it("parses atom://install with encoded moduleId", () => {
    const result = parseInstallHandoff(
      "atom://install?moduleId=demo%2Fhello-store&version=1.0.0&source=store",
    );
    expect(result).toEqual({
      kind: "ok",
      handoff: {
        moduleId: "demo/hello-store",
        version: "1.0.0",
        source: "store",
      },
    });
  });

  it("parses HTTPS /install twin", () => {
    const result = parseInstallHandoff(
      "https://atom.qwixl.com/install?moduleId=demo%2Fhello-store&version=1.0.0&source=store",
    );
    expect(result?.kind).toBe("ok");
    if (result?.kind !== "ok") return;
    expect(result.handoff.moduleId).toBe("demo/hello-store");
    expect(result.handoff.version).toBe("1.0.0");
  });

  it("parses /app/install path", () => {
    expect(
      isInstallHandoffUrl(
        new URL("http://localhost:5200/app/install?moduleId=x&version=1.0.0"),
      ),
    ).toBe(true);
  });

  it("rejects missing params with actionable error", () => {
    const result = parseInstallHandoff("https://atom.qwixl.com/install?moduleId=only");
    expect(result).toEqual({
      kind: "error",
      message:
        "Install link is missing moduleId or version. Open the App Store and try Install again.",
    });
  });

  it("ignores non-install URLs", () => {
    expect(parseInstallHandoff("https://atom.qwixl.com/app/?auth=login")).toBeNull();
  });

  it("refuses paid cert until Milestone C", () => {
    expect(() =>
      assertInstallEntitlementReady({
        moduleId: "paid/mod",
        version: "1.0.0",
        cert: "abc",
      }),
    ).toThrow(/entitlement certificate/i);
  });

  it("round-trips pending handoff in sessionStorage", () => {
    savePendingInstallHandoff({
      moduleId: "demo/hello-store",
      version: "1.0.0",
      source: "store",
    });
    expect(loadPendingInstallHandoff()).toEqual({
      moduleId: "demo/hello-store",
      version: "1.0.0",
      source: "store",
    });
    clearPendingInstallHandoff();
    expect(loadPendingInstallHandoff()).toBeNull();
  });

  it("acceptInstallHandoffUrl persists pending and dispatches", () => {
    const seen: string[] = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      seen.push(detail?.result?.kind ?? "missing");
    };
    window.addEventListener(INSTALL_HANDOFF_EVENT, listener);
    try {
      const result = acceptInstallHandoffUrl(
        "atom://install?moduleId=demo%2Fhello-store&version=1.0.0&source=store",
      );
      expect(result?.kind).toBe("ok");
      expect(loadPendingInstallHandoff()?.moduleId).toBe("demo/hello-store");
      expect(seen).toEqual(["ok"]);
    } finally {
      window.removeEventListener(INSTALL_HANDOFF_EVENT, listener);
    }
  });
});
