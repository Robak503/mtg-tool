/**
 * engineLogNarrator.test.js — engine log events → honest per-turn play-by-play strings.
 * Pins: deck-name mapping, per-turn grouping, the attack/block collapse, elimination causes,
 * noise filtering, and the silence rule (an unknown kind never renders a guessed line).
 */
import { describe, expect, it } from "vitest";
import { narrateEngineLog } from "./engineLogNarrator.js";

const NAMES = { user: "Omnath", ai1: "Slivers", ai2: "Koma", ai3: "Vihaan" };

describe("narrateEngineLog", () => {
  it("narrates the common kinds with deck names, grouped by turn in order", () => {
    const g = narrateEngineLog([
      { turn: 1, kind: "game-start", startingPlayer: "user" },
      { turn: 1, kind: "play-land", playerId: "user", cardName: "Forest" },
      { turn: 2, kind: "cast-spell", playerId: "ai1", cardName: "Sliver Hivelord" },
      { turn: 2, kind: "permanent-enters", cardName: "Sliver Hivelord", controller: "ai1" },
    ], NAMES);
    expect(g.map((x) => x.turn)).toEqual([1, 2]);
    expect(g[0].lines).toEqual(["⚑ Omnath is on the play", "Omnath plays Forest"]);
    expect(g[1].lines).toEqual(["Slivers casts Sliver Hivelord", "Sliver Hivelord enters under Slivers"]);
  });

  it("collapses consecutive attack/block declarations into one readable line each", () => {
    const g = narrateEngineLog([
      { turn: 9, kind: "attack-declared", attackerId: "p1", attackingPlayer: "ai2" },
      { turn: 9, kind: "attack-declared", attackerId: "p2", attackingPlayer: "ai2" },
      { turn: 9, kind: "attack-declared", attackerId: "p3", attackingPlayer: "ai2" },
      { turn: 9, kind: "block-declared", blockerId: "b1", attackerId: "p1" },
      { turn: 9, kind: "block-declared", blockerId: "b2", attackerId: "p2" },
      { turn: 9, kind: "combat-damage-player", attackingPlayer: "ai2", defender: "user", amount: 6 },
    ], NAMES);
    expect(g[0].lines).toEqual([
      "⚔ Koma attacks with 3 creatures",
      "🛡 2 blockers declared",
      "Koma hits Omnath for 6",
    ]);
  });

  it("tags commander hits, tracks commander-damage totals, and names elimination causes", () => {
    const g = narrateEngineLog([
      { turn: 20, kind: "combat-damage-player", attackingPlayer: "user", defender: "ai1", amount: 7, commanderName: "Omnath, Locus of Mana" },
      { turn: 20, kind: "commander-damage", commanderName: "Omnath, Locus of Mana", defender: "ai1", total: 21 },
      { turn: 20, kind: "player-eliminated", player: "ai1", life: 3, commanderLethal: true },
      { turn: 22, kind: "player-eliminated", player: "ai2", life: 0, poison: 10 },
    ], NAMES);
    expect(g[0].lines).toEqual([
      "Omnath, Locus of Mana hits Slivers for 7 (commander)",
      "Omnath, Locus of Mana has dealt 21 commander damage to Slivers",
      "☠ Slivers is eliminated — commander damage",
    ]);
    expect(g[1].lines).toEqual(["☠ Koma is eliminated — poison"]);
  });

  it("filters noise, stays SILENT on unknown kinds (never a guessed line), and never emits '?'", () => {
    const g = narrateEngineLog([
      { turn: 3, kind: "step", phase: "beginning", step: "untap", player: "user" },
      { turn: 3, kind: "stack-resolve", objectId: "s1" },
      { turn: 3, kind: "some-future-kind", data: 42 },
      { turn: 3, kind: "cleanup-discard", controller: "ai3" },
      { turn: 3, kind: "play-land", playerId: "ai3", cardName: "Swamp" },
    ], NAMES);
    expect(g).toHaveLength(1);
    expect(g[0].lines).toEqual(["Vihaan plays Swamp"]); // everything else stayed quiet
    expect(g[0].lines.some((l) => l.includes("?"))).toBe(false);
  });

  it("unmapped seats fall back to the raw seat id; empty/junk input yields []", () => {
    const g = narrateEngineLog([{ turn: 1, kind: "play-land", playerId: "ai9", cardName: "Island" }], {});
    expect(g[0].lines).toEqual(["ai9 plays Island"]);
    expect(narrateEngineLog(null, NAMES)).toEqual([]);
    expect(narrateEngineLog([], NAMES)).toEqual([]);
  });
});
