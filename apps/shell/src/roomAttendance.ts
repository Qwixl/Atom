import { loadJsonFromStorage, saveJsonToStorage } from "@qwixl/shell-core";

const ATTENDANCE_KEY = "atom-room-attendance";

export type RoomAttendanceMode = "present" | "away";

export function loadRoomAttendance(roomId: string): RoomAttendanceMode {
  const map = loadJsonFromStorage<Record<string, RoomAttendanceMode>>(ATTENDANCE_KEY);
  const mode = map?.[roomId];
  return mode === "away" ? "away" : "present";
}

export function saveRoomAttendance(roomId: string, mode: RoomAttendanceMode): void {
  const map = loadJsonFromStorage<Record<string, RoomAttendanceMode>>(ATTENDANCE_KEY) ?? {};
  map[roomId] = mode;
  saveJsonToStorage(ATTENDANCE_KEY, map);
}
