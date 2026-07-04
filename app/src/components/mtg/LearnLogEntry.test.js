import { describe, it, expect } from "vitest";
import { groupLogByTurn } from "./LearnLogEntry.jsx";

describe("groupLogByTurn — per-turn segments for the P7 replay scrubber", () => {
  it("groups a chronological log into contiguous per-turn segments", () => {
    const log = [
      { turn: 1, actor: "user", action: { kind: "play-land", name: "Forest" } },
      { turn: 1, actor: "user", action: { kind: "cast-spell", name: "Llanowar Elves" } },
      { turn: 2, actor: "ai", action: { kind: "play-land", name: "Island" } },
      { turn: 3, actor: "user", action: { kind: "declare-attacker", name: "Bear" } },
    ];
    const groups = groupLogByTurn(log);
    expect(groups.map((g) => g.turn)).toEqual([1, 2, 3]);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].entries).toHaveLength(1);
    expect(groups[2].entries[0].action.name).toBe("Bear");
  });

  it("starts a fresh segment when the turn number repeats after a gap (chronological, not merged)", () => {
    const log = [
      { turn: 1, actor: "user", action: { kind: "play-land" } },
      { turn: 2, actor: "ai", action: { kind: "play-land" } },
      { turn: 1, actor: "user", action: { kind: "cast-spell" } }, // turn came back around (extra-turn edge)
    ];
    const groups = groupLogByTurn(log);
    expect(groups.map((g) => g.turn)).toEqual([1, 2, 1]);
  });

  it("buckets string/legacy entries (no numeric turn) under turn: null", () => {
    const groups = groupLogByTurn(["cast Bolt", "pass"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].turn).toBeNull();
    expect(groups[0].entries).toEqual(["cast Bolt", "pass"]);
  });

  it("is null-safe / empty-safe", () => {
    expect(groupLogByTurn(null)).toEqual([]);
    expect(groupLogByTurn(undefined)).toEqual([]);
    expect(groupLogByTurn([])).toEqual([]);
  });
});
