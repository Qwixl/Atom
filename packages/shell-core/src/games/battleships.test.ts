import { describe, expect, it } from "vitest";
import {
  BattleshipsEngine,
  canPartitionIntoShips,
  isStraightShip,
  randomFleetPlacement,
  type BattleshipsState,
} from "./battleships.js";

const engine = new BattleshipsEngine();

function placedBoth(owner: number[], agent: number[]): BattleshipsState {
  return {
    size: 6,
    shipLengths: [2, 2, 2],
    phase: "battle",
    ownerShips: owner,
    agentShips: agent,
    ownerShots: [],
    agentShots: [],
  };
}

describe("battleships placement helpers", () => {
  it("accepts straight ships only", () => {
    expect(isStraightShip(6, [0, 1], 2)).toBe(true);
    expect(isStraightShip(6, [0, 6], 2)).toBe(true);
    expect(isStraightShip(6, [0, 7], 2)).toBe(false);
  });

  it("partitions three length-2 ships", () => {
    expect(canPartitionIntoShips(6, [0, 1, 3, 4, 12, 13], [2, 2, 2])).toBe(true);
    // Diagonals / gaps are not straight orthogonal ships
    expect(canPartitionIntoShips(6, [0, 7, 2, 9, 4, 11], [2, 2, 2])).toBe(false);
    expect(canPartitionIntoShips(6, [0, 1, 2, 3, 4], [2, 2, 2])).toBe(false);
  });

  it("randomFleetPlacement returns a valid partition", () => {
    const fleet = randomFleetPlacement(6, [2, 2, 2], () => 0.1);
    expect(fleet).not.toBeNull();
    expect(canPartitionIntoShips(6, fleet!, [2, 2, 2])).toBe(true);
  });
});

describe("BattleshipsEngine", () => {
  it("starts in setup with the owner to place", () => {
    const state = engine.initialState();
    expect(state.phase).toBe("setup");
    expect(engine.turn(state)).toBe("owner");
    expect(engine.status(state).phase).toBe("active");
  });

  it("places owner then agent fleets and enters battle", () => {
    let state = engine.initialState();
    const ownerPlace = engine.applyMove(state, { action: "place", cells: [0, 1, 3, 4, 12, 13] }, "owner");
    expect(ownerPlace.ok).toBe(true);
    if (!ownerPlace.ok) return;
    state = ownerPlace.state;
    expect(engine.turn(state)).toBe("agent");

    const agentPlace = engine.applyMove(state, { action: "place", cells: [30, 31, 32, 33, 34, 35] }, "agent");
    expect(agentPlace.ok).toBe(true);
    if (!agentPlace.ok) return;
    expect(agentPlace.state.phase).toBe("battle");
    expect(engine.turn(agentPlace.state)).toBe("owner");
  });

  it("rejects illegal placement shapes", () => {
    const state = engine.initialState();
    const result = engine.applyMove(
      state,
      { action: "place", cells: [0, 7, 2, 9, 4, 11] },
      "owner",
    );
    expect(result.ok).toBe(false);
  });

  it("rejects firing before fleets are locked", () => {
    const state = engine.initialState();
    expect(engine.applyMove(state, { action: "fire", cell: 0 }, "owner").ok).toBe(false);
  });

  it("records hits/misses and awards the win when all foe ship cells are hit", () => {
    let state = placedBoth([0, 1, 3, 4, 12, 13], [30, 31, 32, 33, 34, 35]);
    // First hit on a ship sinks the whole ship (auto-reveals remaining cells).
    for (const cell of [30, 32]) {
      const shot = engine.applyMove(state, { action: "fire", cell }, "owner");
      expect(shot.ok).toBe(true);
      if (!shot.ok) return;
      state = shot.state;
      expect(state.ownerShots.some((entry) => entry.cell === cell + 1 && entry.auto)).toBe(true);
      const agentReply = engine.applyMove(state, { action: "fire", cell: cell % 12 }, "agent");
      expect(agentReply.ok).toBe(true);
      if (!agentReply.ok) return;
      state = agentReply.state;
    }
    const finishing = engine.applyMove(state, { action: "fire", cell: 34 }, "owner");
    expect(finishing.ok).toBe(true);
    if (!finishing.ok) return;
    expect(finishing.state.phase).toBe("won");
    expect(finishing.state.winner).toBe("owner");
    expect(engine.status(finishing.state).phase).toBe("won");
  });

  it("rejects repeat shots and out-of-turn fire", () => {
    const state = placedBoth([0, 1, 3, 4, 12, 13], [30, 31, 32, 33, 34, 35]);
    const first = engine.applyMove(state, { action: "fire", cell: 30 }, "owner");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // 31 was auto-revealed when 30 sank that ship
    expect(engine.applyMove(first.state, { action: "fire", cell: 31 }, "owner").ok).toBe(false);
    expect(engine.applyMove(first.state, { action: "fire", cell: 0 }, "agent").ok).toBe(true);
  });

  it("hides foe ships from owner props and preserves state via _state", () => {
    const state = placedBoth([0, 1, 3, 4, 12, 13], [30, 31, 32, 33, 34, 35]);
    const fired = engine.applyMove(state, { action: "fire", cell: 30 }, "owner");
    expect(fired.ok).toBe(true);
    if (!fired.ok) return;
    const props = engine.toProps(fired.state);
    expect((props.foeBoard as string[])[30]).toBe("hit");
    expect((props.foeBoard as string[])[31]).toBe("hit");
    expect(props.ownBoard).toBeDefined();
    expect(props.agentShips).toBeUndefined();
    const recovered = engine.fromProps(props);
    expect(recovered.agentShips).toEqual([30, 31, 32, 33, 34, 35]);
    expect(recovered.ownerShots.some((shot) => shot.cell === 30 && shot.hit)).toBe(true);
    expect(recovered.ownerShots.some((shot) => shot.cell === 31 && shot.auto)).toBe(true);
  });

  it("rankMoves scatters instead of raster-scanning from cell 0", () => {
    const state = placedBoth([0, 1, 3, 4, 12, 13], [18, 19, 20, 21, 22, 23]);
    const miss = engine.applyMove(state, { action: "fire", cell: 5 }, "owner");
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    const legal = engine.legalMoves(miss.state, "agent");
    const scores = engine.rankMoves(miss.state, "agent", legal);
    expect(scores.length).toBe(legal.length);
    const byCell = new Map(
      legal.map((move, index) => [move.action === "fire" ? move.cell : -1, scores[index]!] as const),
    );
    const score0 = byCell.get(0)!;
    const maxScore = Math.max(...scores);
    // Top-left must not be the unique best target under scramble+parity.
    expect(score0).toBeLessThan(maxScore);
    const preferred = engine.agentView(miss.state).preferredCells as number[];
    expect(preferred[0]).not.toBe(0);
  });

  it("agentView during setup asks for place; during battle lists preferredCells", () => {
    const setup = engine.initialState();
    const afterOwner = engine.applyMove(setup, { action: "place", cells: [0, 1, 3, 4, 12, 13] }, "owner");
    expect(afterOwner.ok).toBe(true);
    if (!afterOwner.ok) return;
    const placeView = engine.agentView(afterOwner.state);
    expect(placeView.action).toBe("place");
    expect(placeView.samplePlace).toBeDefined();

    const battle = placedBoth([0, 1, 3, 4, 12, 13], [30, 31, 32, 33, 34, 35]);
    const afterOwnerShot = engine.applyMove(battle, { action: "fire", cell: 0 }, "owner");
    expect(afterOwnerShot.ok).toBe(true);
    if (!afterOwnerShot.ok) return;
    const fireView = engine.agentView(afterOwnerShot.state);
    expect(fireView.action).toBe("fire");
    expect(Array.isArray(fireView.legalCells)).toBe(true);
    expect(Array.isArray(fireView.preferredCells)).toBe(true);
    expect((fireView.legalCells as number[])[0]).toBe((fireView.preferredCells as number[])[0]);
  });
});
