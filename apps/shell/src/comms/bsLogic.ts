import type { BsPlayer, BsShot, CommsThreadItem } from "./types.js";

export const BS_GRID_SIZE = 6;
export const BS_CELL_COUNT = BS_GRID_SIZE * BS_GRID_SIZE;
export const BS_SHIP_COUNT = 3;
export const BS_SHIP_LENGTH = 2;

export function bsOpponent(player: BsPlayer): BsPlayer {
  return player === "A" ? "B" : "A";
}

export function areAdjacentCells(a: number, b: number): boolean {
  const rowA = Math.floor(a / BS_GRID_SIZE);
  const colA = a % BS_GRID_SIZE;
  const rowB = Math.floor(b / BS_GRID_SIZE);
  const colB = b % BS_GRID_SIZE;
  return (
    (rowA === rowB && Math.abs(colA - colB) === 1) ||
    (colA === colB && Math.abs(rowA - rowB) === 1)
  );
}

function partitionIntoShips(cells: number[]): boolean {
  if (cells.length === 0) return true;
  const first = cells[0];
  if (first === undefined) return false;
  const rest = cells.slice(1);
  for (const second of rest) {
    if (!areAdjacentCells(first, second)) continue;
    const next = rest.filter((cell) => cell !== second);
    if (partitionIntoShips(next)) return true;
  }
  return false;
}

export function validateShipPlacement(cells: number[]): boolean {
  if (cells.length !== BS_SHIP_COUNT * BS_SHIP_LENGTH) return false;
  const unique = new Set(cells);
  if (unique.size !== cells.length) return false;
  for (const cell of cells) {
    if (cell < 0 || cell >= BS_CELL_COUNT) return false;
  }
  return partitionIntoShips([...cells]);
}

export async function shipCommitHash(
  gameId: string,
  player: BsPlayer,
  cells: number[],
): Promise<string> {
  const sorted = [...cells].sort((a, b) => a - b);
  const data = `${gameId}|${player}|${sorted.join(",")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function evaluateShot(ships: number[], cell: number): boolean {
  return ships.includes(cell);
}

export function shotAlreadyFired(shots: BsShot[], cell: number, shooter: BsPlayer): boolean {
  return shots.some((shot) => shot.cell === cell && shot.shooter === shooter);
}

export function countDefenderHits(ships: number[], shots: BsShot[], defender: BsPlayer): number {
  const shipSet = new Set(ships);
  const hitCells = new Set<number>();
  const opponent = bsOpponent(defender);
  for (const shot of shots) {
    if (shot.shooter === opponent && shot.hit && shipSet.has(shot.cell)) {
      hitCells.add(shot.cell);
    }
  }
  return hitCells.size;
}

export function allShipsSunk(ships: number[], shots: BsShot[], defender: BsPlayer): boolean {
  return countDefenderHits(ships, shots, defender) >= BS_SHIP_COUNT * BS_SHIP_LENGTH;
}

export function nextTurnAfterShot(
  current: BsPlayer,
  hit: boolean,
): BsPlayer {
  return hit ? current : bsOpponent(current);
}

export function bsShipsStorageKey(gameId: string, player: BsPlayer): string {
  return `atom-bs-ships:${gameId}:${player}`;
}

export function loadLocalShips(gameId: string, player: BsPlayer): number[] | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(bsShipsStorageKey(gameId, player));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const cells = parsed.filter((cell): cell is number => typeof cell === "number");
    return validateShipPlacement(cells) ? cells : null;
  } catch {
    return null;
  }
}

export function saveLocalShips(gameId: string, player: BsPlayer, cells: number[]): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(bsShipsStorageKey(gameId, player), JSON.stringify(cells));
}

export function myPlayerFromThread(
  gameId: string,
  items: Array<{ kind: string; gameId?: string; direction: "in" | "out" }>,
): BsPlayer {
  const firstState = items.find((item) => item.kind === "bs-state" && item.gameId === gameId);
  if (!firstState) return "A";
  return firstState.direction === "out" ? "A" : "B";
}

export function latestBsState(
  gameId: string,
  items: CommsThreadItem[],
): Extract<CommsThreadItem, { kind: "bs-state" }> | undefined {
  return [...items]
    .reverse()
    .find(
      (item): item is Extract<CommsThreadItem, { kind: "bs-state" }> =>
        item.kind === "bs-state" && item.gameId === gameId,
    );
}

export function hasCommitted(state: { commitA?: string; commitB?: string }, player: BsPlayer): boolean {
  return player === "A" ? !!state.commitA : !!state.commitB;
}
