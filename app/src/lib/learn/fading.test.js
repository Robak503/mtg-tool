/**
 * fading.test.js — KW-FADING (CR 702.32a) + KW-VANISHING (CR 702.63a): the parser, the ETB counter
 * read, and the upkeep remove-or-sacrifice. End-to-end ETB+upkeep through the real engine is pinned
 * by the engine-sim at the bottom.
 */
import { describe, it, expect } from "vitest";
import { createPermanent, createGameState, _resetIdsForTests } from "./gameState.js";
import { parseFadingVanishing, entersWithFadeCounters, applyFadeVanishUpkeep } from "./fading.js";

const fvCreature = (name, oracle, controller, counters) => {
  const p = createPermanent({ card: { id: `${name}-card`, name, power: 2, toughness: 2, type_line: "Creature", oracle }, controller });
  return { ...p, counters: { ...p.counters, ...counters } };
};
const stateWith = (activePlayer, ...perms) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...s, activePlayer, players };
};
const gy = (s, pid) => s.players[pid].graveyard.map((c) => c.name);
const counterOf = (s, pid, name, type) => (s.players[pid].battlefield.find((x) => x.card.name === name)?.counters?.[type] || 0);

describe("parseFadingVanishing", () => {
  it("parses Fading N and Vanishing N (keyword position)", () => {
    expect(parseFadingVanishing({ oracle: "Fading 2 (reminder)" })).toEqual({ kind: "fading", n: 2, counterType: "fade" });
    expect(parseFadingVanishing({ oracle: "Flying\nVanishing 3" })).toEqual({ kind: "vanishing", n: 3, counterType: "time" });
  });
  it("returns null when neither keyword is present", () => {
    expect(parseFadingVanishing({ oracle: "Vigilance, trample" })).toBeNull();
    expect(parseFadingVanishing({})).toBeNull();
  });
  it("entersWithFadeCounters → { type, n } for the ETB resolver", () => {
    expect(entersWithFadeCounters({ oracle: "Vanishing 2" })).toEqual({ type: "time", n: 2 });
    expect(entersWithFadeCounters({ oracle: "Fading 1" })).toEqual({ type: "fade", n: 1 });
    expect(entersWithFadeCounters({ oracle: "Flash" })).toBeNull();
  });
});

describe("applyFadeVanishUpkeep", () => {
  it("vanishing: removes the last time counter and sacrifices it (CR 702.63a)", () => {
    const out = applyFadeVanishUpkeep(stateWith("user", fvCreature("Spike", "Vanishing 1", "user", { time: 1 })));
    expect(gy(out, "user")).toEqual(["Spike"]);
  });
  it("vanishing: with 2 time counters, removes one and survives", () => {
    const out = applyFadeVanishUpkeep(stateWith("user", fvCreature("Whale", "Vanishing 2", "user", { time: 2 })));
    expect(gy(out, "user")).toEqual([]);
    expect(counterOf(out, "user", "Whale", "time")).toBe(1);
  });
  it("fading: removes a fade counter; sacrifices when it can't (CR 702.32a)", () => {
    expect(gy(applyFadeVanishUpkeep(stateWith("user", fvCreature("Sap", "Fading 1", "user", { fade: 0 }))), "user")).toEqual(["Sap"]);
    const out = applyFadeVanishUpkeep(stateWith("user", fvCreature("Elem", "Fading 2", "user", { fade: 1 })));
    expect(gy(out, "user")).toEqual([]);
    expect(counterOf(out, "user", "Elem", "fade")).toBe(0); // survives this upkeep, dies next
  });
  it("only the ACTIVE player's permanents are processed ('your upkeep')", () => {
    const out = applyFadeVanishUpkeep(stateWith("user", fvCreature("Spike", "Vanishing 1", "ai", { time: 1 })));
    expect(gy(out, "ai")).toEqual([]); // ai's creature, user's upkeep → untouched
    expect(counterOf(out, "ai", "Spike", "time")).toBe(1);
  });
  it("a vanilla creature is untouched (no fade/time keyword)", () => {
    const out = applyFadeVanishUpkeep(stateWith("user", fvCreature("Bear", "", "user", {})));
    expect(gy(out, "user")).toEqual([]);
    expect(out.players.user.battlefield.some((p) => p.card.name === "Bear")).toBe(true);
  });
});

describe("KW-FADING/VANISHING — end-to-end ETB counters + upkeep (engine-sim)", () => {
  it("enters with N time counters (the PERMANENT_ETB resolver) and loses one per upkeep", async () => {
    _resetIdsForTests();
    const { RESOLVERS, RESOLVER_KEYS } = await import("./resolvers.js");
    let s = createGameState({ userDeck: [], aiDeck: [] });
    // Resolve a Vanishing 2 creature spell → it enters with 2 time counters.
    const obj = { id: "stk", kind: "spell", controller: "user", source: { name: "Time Whale" },
      payload: { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card: { id: "whale", name: "Time Whale", power: 4, toughness: 4, type_line: "Creature", oracle: "Vanishing 2" }, controller: "user" } } };
    s = RESOLVERS[RESOLVER_KEYS.PERMANENT_ETB](s, obj);
    expect(counterOf(s, "user", "Time Whale", "time")).toBe(2); // entered with 2 time counters
    s = { ...s, activePlayer: "user" };
    s = applyFadeVanishUpkeep(s);
    expect(counterOf(s, "user", "Time Whale", "time")).toBe(1); // one removed at upkeep, still alive
    s = applyFadeVanishUpkeep(s);
    expect(gy(s, "user")).toContain("Time Whale"); // last removed → sacrificed
  });

  it("a vanishing LAND enters with time counters via the play-land path", async () => {
    _resetIdsForTests();
    const { dispatchAction } = await import("./actionDispatcher.js");
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const land = { id: "omen", name: "Omenpath", type: "Land", oracle: "Vanishing 4\n{T}: Add {R}." };
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players, user: { ...s.players.user, hand: [land], landsPlayedThisTurn: 0 } } };
    s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "omen" });
    expect(counterOf(s, "user", "Omenpath", "time")).toBe(4); // land entered with 4 time counters
  });
});
