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
    // Owner sinks the agent fleet (bottom row as three ships: 30-31, 32-33, 34-35)
    for (const cell of [30, 31, 32, 33, 34]) {
      const shot = engine.applyMove(state, { action: "fire", cell }, "owner");
      expect(shot.ok).toBe(true);
      if (!shot.ok) return;
      state = shot.state;
      const agentReply = engine.applyMove(state, { action: "fire", cell: cell % 12 }, "agent");
      expect(agentReply.ok).toBe(true);
      if (!agentReply.ok) return;
      state = agentReply.state;
    }
    const finishing = engine.applyMove(state, { action: "fire", cell: 35 }, "owner");
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
    expect(engine.applyMove(first.state, { action: "fire", cell: 31 }, "owner").ok).toBe(false);
    expect(engine.applyMove(first.state, { action: "fire", cell: 30 }, "agent").ok).toBe(true);
  });

  it("hides foe ships from owner props and preserves state via _state", () => {
    const state = placedBoth([0, 1, 3, 4, 12, 13], [30, 31, 32, 33, 34, 35]);
    const fired = engine.applyMove(state, { action: "fire", cell: 30 }, "owner");
    expect(fired.ok).toBe(true);
    if (!fired.ok) return;
    const props = engine.toProps(fired.state);
    expect(props.foeBoard).toEqual(expect.arrayContaining(["hit", "unknown"]));
    expect((props.foeBoard as string[])[30]).toBe("hit");
    expect(props.ownBoard).toBeDefined();
    expect(props.agentShips).toBeUndefined();
    const recovered = engine.fromProps(props);
    expect(recovered.agentShips).toEqual([30, 31, 32, 33, 34, 35]);
    expect(recovered.ownerShots[0]).toEqual({ cell: 30, hit: true });
  });

  it("agentView during setup asks for place; during battle lists legalCells", () => {
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
  });
});
