import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMicrosoftGraphBoardSurfacePin } from "@qwixl/shell-core";
import type { PersistedSurface } from "@qwixl/owner-store";
import { ConnectorVault } from "./connectorVault.js";
import { createReadOnlyConnectorExecutor } from "./readOnlyConnectorExecutor.js";
import { invokeMicrosoftGraphConnector } from "./microsoftGraphConnector.js";
import { refreshDueSurfaces } from "./boardRefresh.js";
import { resetConnectorResultCacheForTests } from "./connectorCache.js";
import { MICROSOFT_OAUTH_PROVIDER } from "./microsoftOAuth.js";

const TEST_CLIENT_ID = "11111111-2222-3333-4444-555555555555";

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

function pinToPersistedSurface(
  pin: ReturnType<typeof buildMicrosoftGraphBoardSurfacePin>,
): PersistedSurface {
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

async function vaultWithMicrosoftAuth(dir: string): Promise<ConnectorVault> {
  const vault = new ConnectorVault(
    path.join(dir, "vault-master.key"),
    path.join(dir, "vault.enc"),
  );
  await vault.load();
  await vault.setOAuthClient(MICROSOFT_OAUTH_PROVIDER, {
    clientId: TEST_CLIENT_ID,
    clientSecret: "",
    configuredAt: Date.now(),
  });
  await vault.setOAuth(MICROSOFT_OAUTH_PROVIDER, {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 3_600_000,
  });
  return vault;
}

describe("microsoft-graph calendar board binding", () => {
  const originalClientId = process.env.MICROSOFT_CLIENT_ID;

  afterEach(() => {
    resetConnectorResultCacheForTests();
    vi.unstubAllGlobals();
    if (originalClientId === undefined) delete process.env.MICROSOFT_CLIENT_ID;
    else process.env.MICROSOFT_CLIENT_ID = originalClientId;
  });

  it("listEvents returns { events } at the executor result root (select is /events, not /result/events)", async () => {
    process.env.MICROSOFT_CLIENT_ID = TEST_CLIENT_ID;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          value: [
            {
              id: "evt-1",
              subject: "Standup",
              start: { dateTime: "2026-07-30T09:00:00.000Z", timeZone: "UTC" },
              end: { dateTime: "2026-07-30T09:30:00.000Z", timeZone: "UTC" },
              isAllDay: false,
            },
          ],
        }),
      ),
    );
    const dir = mkdtempSync(path.join(tmpdir(), "atom-ms-cal-"));
    const vault = await vaultWithMicrosoftAuth(dir);

    const invoked = await invokeMicrosoftGraphConnector({ vault }, "listEvents", {
      timeMin: "2026-07-30T00:00:00.000Z",
      timeMax: "2026-07-30T23:59:59.000Z",
    });
    expect(invoked.result).toMatchObject({
      events: [{ subject: "Standup", start: "2026-07-30T09:00:00.000Z" }],
    });

    const executor = createReadOnlyConnectorExecutor(vault);
    const executorResult = await executor({
      connectorId: "microsoft-graph",
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

  it("projects all-day events with date-only start values", async () => {
    process.env.MICROSOFT_CLIENT_ID = TEST_CLIENT_ID;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          value: [
            {
              id: "evt-all-day",
              subject: "Company offsite",
              start: { date: "2026-07-30" },
              end: { date: "2026-07-31" },
              isAllDay: true,
            },
          ],
        }),
      ),
    );
    const dir = mkdtempSync(path.join(tmpdir(), "atom-ms-cal-allday-"));
    const vault = await vaultWithMicrosoftAuth(dir);
    const invoked = await invokeMicrosoftGraphConnector({ vault }, "listEvents", {
      timeMin: "2026-07-30T00:00:00.000Z",
      timeMax: "2026-07-31T23:59:59.000Z",
    });
    const events = (invoked.result as { events: Array<{ start: string }> }).events;
    expect(events[0]?.start).toBe("2026-07-30");
    expect(events[0]?.start).not.toContain("T");

    const executor = vi.fn(async () => invoked.result);
    const pin = buildMicrosoftGraphBoardSurfacePin({
      timeMin: "2026-07-30T00:00:00.000Z",
      timeMax: "2026-07-31T23:59:59.000Z",
    });
    const result = await refreshDueSurfaces({
      surfaces: [pinToPersistedSurface(pin)],
      executor,
      entitledConnectors: ["microsoft-graph"],
      now: 1_700_000_000_000,
    });
    const rows = result.surfaces[0]?.composition.root.props?.rows as string[][];
    expect(rows).toEqual([["2026-07-30", "Company offsite"]]);
  });

  it("refreshDueSurfaces fills calendar table rows from /events", async () => {
    const executor = vi.fn(async () => ({
      events: [
        {
          id: "evt-1",
          subject: "Standup",
          start: "2026-07-30T09:00:00.000Z",
          end: "2026-07-30T09:30:00.000Z",
          isAllDay: false,
        },
      ],
      timeMin: "2026-07-30T00:00:00.000Z",
      timeMax: "2026-07-30T23:59:59.000Z",
    }));
    const pin = buildMicrosoftGraphBoardSurfacePin({
      timeMin: "2026-07-30T00:00:00.000Z",
      timeMax: "2026-07-30T23:59:59.000Z",
    });
    const result = await refreshDueSurfaces({
      surfaces: [pinToPersistedSurface(pin)],
      executor,
      entitledConnectors: ["microsoft-graph"],
      now: 1_700_000_000_000,
    });
    const rows = result.surfaces[0]?.composition.root.props?.rows as string[][];
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.[1]).toBe("Standup");
    expect(rows?.[0]?.[0]).toBe("2026-07-30T09:00:00.000Z");
  });
});
