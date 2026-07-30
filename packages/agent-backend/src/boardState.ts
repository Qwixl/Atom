import type { JsonValue } from "@qwixl/shell-core";
import {
  PRESENTATION_BOARD_CATEGORY,
  PRESENTATION_BOARD_STATE_LABEL,
  parsePresentationBoardState,
  parsePresentationBoardStateV2,
  type PresentationBoardStateV2,
} from "@qwixl/owner-store";
import type { ConnectorVault } from "./connectorVault.js";

type BoardOwnerRecord = {
  id?: string;
  category: string;
  label: string;
  value: JsonValue;
  guarded: boolean;
  updated?: number;
};

export function loadPresentationBoardState(vault: ConnectorVault): {
  v2: PresentationBoardStateV2;
  v1Regions: ReturnType<typeof parsePresentationBoardState>["regions"];
} {
  const records = vault.getOwnerRecords<BoardOwnerRecord>();
  const record = records.find(
    (entry) =>
      entry.category === PRESENTATION_BOARD_CATEGORY &&
      entry.label === PRESENTATION_BOARD_STATE_LABEL,
  );
  const v1 = parsePresentationBoardState(record?.value);
  const v2 = parsePresentationBoardStateV2(record?.value);
  return { v2, v1Regions: v1.regions };
}

export async function savePresentationBoardState(
  vault: ConnectorVault,
  v2: PresentationBoardStateV2,
  v1Regions: ReturnType<typeof parsePresentationBoardState>["regions"],
): Promise<void> {
  const records = [...vault.getOwnerRecords<BoardOwnerRecord>()];
  const index = records.findIndex(
    (entry) =>
      entry.category === PRESENTATION_BOARD_CATEGORY &&
      entry.label === PRESENTATION_BOARD_STATE_LABEL,
  );
  const value = {
    ...v2,
    schemaVersion: 2 as const,
    regions: v1Regions,
    updatedAt: Date.now(),
  } as unknown as JsonValue;
  if (index >= 0) {
    records[index] = {
      ...records[index]!,
      value,
      updated: Date.now(),
    };
  } else {
    records.push({
      id: `presentation-board-${Date.now()}`,
      category: PRESENTATION_BOARD_CATEGORY,
      label: PRESENTATION_BOARD_STATE_LABEL,
      value,
      guarded: false,
      updated: Date.now(),
    });
  }
  await vault.setOwnerRecords(records);
}
