import { describe, expect, it } from "vitest";
import { BattleshipsA2AHost, seatToPlayer } from "./battleshipsA2a.js";
import { randomFleetPlacement } from "./battleships.js";

describe("BattleshipsA2AHost", () => {
  it("maps seat A to owner player", () => {
    expect(seatToPlayer("A")).toBe("owner");
    expect(seatToPlayer("B")).toBe("agent");
  });

  it("syncs public state after both players place", () => {
    const host = BattleshipsA2AHost.create();
    const fleetA = randomFleetPlacement(6, [2, 2, 2])!;
    const fleetB = randomFleetPlacement(6, [2, 2, 2])!;
    expect(host.applyMove("A", { action: "place", cells: fleetA }).ok).toBe(true);
    expect(host.applyMove("B", { action: "place", cells: fleetB }).ok).toBe(true);
    const pub = host.toPublicState();
    expect(pub.phase).toBe("battle");
    expect(pub.boards.A.own.some((cell) => cell === "ship")).toBe(true);
    expect(pub.boards.B.own.some((cell) => cell === "ship")).toBe(true);
    expect(pub.boards.A.foe.every((cell) => cell === "unknown")).toBe(true);
  });
});
