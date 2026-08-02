/**
 * shuffleInsteadOfGraveyard.test.js — CR 614 replacement: "If <this> would be put into a graveyard from
 * anywhere, reveal <this> and shuffle it into its owner's library instead."
 * Darksteel Colossus · Blightsteel Colossus · Progenitus · Nexus of Fate · Legacy Weapon.
 *
 * ⭐ IT IS A REPLACEMENT, NOT A CLEAN-UP, and that is the whole design. The card is NEVER put into a
 * graveyard, so it never DIES (CR 700.4 defines dying as being put into a graveyard from the battlefield).
 * Moving it and correcting afterwards would fire every dies-trigger and graveyard watcher on the way through
 * — the board would witness a death that did not happen. So it lives at the gameState.moveCardToZone
 * chokepoint, ahead of the move, and the Blood Artist case below is what proves it.
 *
 * ENFORCEMENT FIRST, CREDIT SECOND: the classifier strips the sentence only because the replacement really
 * runs, and both sides read the SAME predicate (shufflesIntoLibraryInsteadOfGraveyard) so they cannot
 * disagree about which cards are handled.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, moveCardToZone, shufflesIntoLibraryInsteadOfGraveyard } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const REPLACEMENT = "If Colossus would be put into a graveyard from anywhere, reveal Colossus and shuffle it into its owner's library instead.";
const COLOSSUS = { id: "cx", name: "Colossus", type: "Artifact Creature — Golem", power: 11, toughness: 11, oracle: `Trample\n${REPLACEMENT}` };
const PLAIN = { id: "cx", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function boardWith(card, { zone = "battlefield" } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const lib = [{ id: "L1", name: "Forest", type: "Basic Land — Forest" }];
  if (zone === "battlefield") {
    const perm = createPermanent({ id: "x", card, controller: "user" });
    return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [perm], library: lib, graveyard: [] } } };
  }
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, [zone]: [card], library: lib, graveyard: [] } } };
}
const gy = (s) => (s.players.user.graveyard || []).map((c) => c.name);
const lib = (s) => (s.players.user.library || []).map((c) => c.name).sort();

describe("⭐ the replacement redirects every graveyard-bound move", () => {
  it("battlefield → graveyard becomes a shuffle into the library", () => {
    const s = moveCardToZone(boardWith(COLOSSUS), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "x" });
    expect(gy(s)).toEqual([]);
    expect(lib(s)).toEqual(["Colossus", "Forest"]);
  });

  it("hand → graveyard (a discard) is redirected too — 'from anywhere' is not just the battlefield", () => {
    const s = moveCardToZone(boardWith(COLOSSUS, { zone: "hand" }), { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "cx" });
    expect(gy(s)).toEqual([]);
    expect(lib(s)).toEqual(["Colossus", "Forest"]);
  });

  it("CONTROL — an ordinary card in the same harness still goes to the graveyard", () => {
    // Without this a passing test above could just mean the harness never moved anything.
    const s = moveCardToZone(boardWith(PLAIN), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "x" });
    expect(gy(s)).toEqual(["Grizzly Bears"]);
    expect(lib(s)).toEqual(["Forest"]);
  });

  it("a non-graveyard destination is untouched (exile still exiles)", () => {
    const s = moveCardToZone(boardWith(COLOSSUS), { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: "x" });
    expect((s.players.user.exile || []).map((c) => c.name)).toEqual(["Colossus"]);
    expect(lib(s)).toEqual(["Forest"]);
  });
});

describe("⛔ CREED — it never DIES, so death watchers must not fire", () => {
  it("THE LOAD-BEARING ONE — a Blood Artist sees no death when the Colossus is destroyed", () => {
    // This is what separates a real replacement from a post-hoc fix. If the card were moved to the graveyard
    // and then shuffled back, the dies-trigger would already have fired and a life total would have moved.
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const artist = createPermanent({ id: "w", card: { id: "cw", name: "Blood Artist", type: "Creature — Vampire", power: 0, toughness: 1, oracle: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." }, controller: "user", summoningSick: false });
    const colossus = createPermanent({ id: "x", card: { ...COLOSSUS, power: 2, toughness: 2 }, controller: "user" });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [colossus, artist], library: [{ id: "L1", name: "Forest", type: "Basic Land — Forest" }], graveyard: [], life: 40 } },
    };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "x" ? { ...p, damageMarked: 99 } : p)) } } };
    const r = destroyLethalCreatures(s);
    let out = flushTriggers(checkDiesTriggers(r.state, r.dead), { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((out.stack || []).length && g++ < 20) out = resolveTopOfStack(out);

    expect(gy(out)).toEqual([]);                    // never reached the graveyard
    expect(lib(out)).toContain("Colossus");         // went to the library instead
    expect(out.players.user.life).toBe(40);         // ⭐ Blood Artist did NOT fire
    expect((out.log || []).filter((l) => l.kind === "stack-resolve-error")).toHaveLength(0);
  });
});

describe("the predicate is exact", () => {
  it("matches the printed replacement", () => {
    expect(shufflesIntoLibraryInsteadOfGraveyard(COLOSSUS)).toBe(true);
  });

  it("⛔ does NOT match a card that shuffles something ELSE away", () => {
    expect(shufflesIntoLibraryInsteadOfGraveyard({ oracle: "When this creature dies, shuffle target card from a graveyard into its owner's library." })).toBe(false);
  });

  it("⛔ does NOT match an exile-instead replacement", () => {
    expect(shufflesIntoLibraryInsteadOfGraveyard({ oracle: "If this creature would be put into a graveyard from anywhere, exile it instead." })).toBe(false);
  });
});

describe("classification — the five real carriers flip", () => {
  const CASES = [
    ["Darksteel Colossus", "Artifact Creature — Golem", "Trample\nIndestructible\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead."],
    ["Progenitus", "Legendary Creature — Hydra Avatar", "Protection from everything\nIf Progenitus would be put into a graveyard from anywhere, reveal Progenitus and shuffle it into its owner's library instead."],
  ];
  for (const [name, type, oracle] of CASES) {
    it(`${name}`, () => expect(classifyCard({ name, type, mana: "{11}", power: "11", toughness: "11", oracle })).toMatch(/^native/));
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Creature — Golem", mana: "{11}", power: "11", toughness: "11", oracle: `${REPLACEMENT}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
