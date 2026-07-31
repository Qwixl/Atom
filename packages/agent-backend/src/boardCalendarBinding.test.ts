import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCalendarBoardSurfacePin } from "@qwixl/shell-core";
import type { PersistedSurface } from "@qwixl/owner-store";
import { ConnectorVault } from "./connectorVault.js";
import { createReadOnlyConnectorExecutor } from "./readOnlyConnectorExecutor.js";
import { invokeWebcalConnector } from "./webcalConnector.js";
import { refreshDueSurfaces } from "./boardRefresh.js";
import { resetConnectorResultCacheForTests } from "./connectorCache.js";

const SAMPLE_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:evt-1",
  "SUMMARY:Standup",
  "DTSTART:20260730T090000Z",
  "DTEND:20260730T093000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function evaluateJsonPointer(doc: unknown, pointer: string): unknown {
  if (!pointer.startsWith("/")) return undefined;
  const segments = pointer.slice(1).split("/");
  let current: unknown = doc;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function pinToPersistedSurface(pin: ReturnType<typeof buildCalendarBoardSurfacePin>): PersistedSurface {
  const now = 1_700_000_000_000;
  return {
    surfaceId: pin.composition.surfaceId,
    composition: pin.composition,
    bindings: pin.bindings ?? [],
    refresh: pin.refresh,
    placement: pin.placement ?? { screen: 0 },
    ownerOverrides: [],
    lastRefreshedAt: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe("webcal calendar board binding", () => {
  afterEach(() => {
    resetConnectorResultCacheForTests();
    vi.unstubAllGlobals();
  });

  it("listEvents returns { events } at the executor result root (select is /events, not /result/events)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(SAMPLE_ICS, { status: 200 })),
    );
    const dir = mkdtempSync(path.join(tmpdir(), "atom-cal-bind-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.addWebcalFeed({ label: "Work", url: "https://example.com/work.ics" });

    const invoked = await invokeWebcalConnector({ vault }, "listEvents", {
      timeMin: "2026-07-30T00:00:00.000Z",
      timeMax: "2026-07-30T23:59:59.000Z",
    });
    expect(invoked.result).toMatchObject({
      events: [{ summary: "Standup", start: "2026-07-30T09:00:00.000Z" }],
    });

    const executor = createReadOnlyConnectorExecutor(vault);
    const executorResult = await executor({
      connectorId: "webcal",
      operation: "listEvents",
      input: {
        timeMin: "2026-07-30T00:00:00.000Z",
        timeMax: "2026-07-30T23:59:59.000Z",
      },
    });
    expect(executorResult).toEqual(invoked.result);
    expect(evaluateJsonPointer(executorResult, "/events")).toHaveLength(1);
    expect(evaluateJsonPointer(executorResult, "/result/events")).toBeUndefined();
  });

  it("refreshDueSurfaces fills calendar table rows from /events", async () => {
    const executor = vi.fn(async () => ({
      events: [
        {
          uid: "evt-1",
          summary: "Standup",
          start: "2026-07-30T09:00:00.000Z",
          end: "2026-07-30T09:30:00.000Z",
        },
      ],
    }));
    const pin = buildCalendarBoardSurfacePin({
      timeMin: "2026-07-30T00:00:00.000Z",
      timeMax: "2026-07-30T23:59:59.000Z",
    });
    const result = await refreshDueSurfaces({
      surfaces: [pinToPersistedSurface(pin)],
      executor,
      entitledConnectors: ["webcal"],
      now: 1_700_000_000_000,
    });
    const rows = result.surfaces[0]?.composition.root.props?.rows as string[][];
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.[1]).toBe("Standup");
    expect(typeof rows?.[0]?.[0]).toBe("string");
  });
});
