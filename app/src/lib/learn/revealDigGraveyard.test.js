/**
 * revealDigGraveyard.test.js — THE REVEALED DIG WITH A GRAVEYARD REST (2026-08-14). Malevolent Rumble
 * + the self-mill staple family: Scout the Borders, Grisly Salvage ("creature or land"), Commune with
 * the Gods ("creature or enchantment"), Satyr Wayfinder (the ETB-trigger carrier, "land").
 *
 * ⭐ ONE MATCHER FORM (matchImpulseDig form 3): "Reveal the top N cards of your library. You may put a
 * <type> card from among them into your hand. Put the rest into your graveyard." — the SAME impulse-dig
 * atom + the SAME parseTutorFilter gate as the look-reveal form, with restTo:"graveyard" (already
 * implemented in the resolver). The union filters ("creature or land") were already in the vocabulary
 * (groups-of-OR). Rumble's trailing Eldrazi Spawn token rides `rest` through the normal pipeline.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · form 3 disabled -> all five carriers park.
 *   · restTo hardcoded to "bottom" in the form -> the graveyard witness dies (the rest lands in the
 *     wrong zone — the exact partial the disposition field exists to prevent).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { matchImpulseDig } from "./effects/spanMatchers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RUMBLE_ORACLE = "Reveal the top four cards of your library. You may put a permanent card from among them into your hand. Put the rest into your graveyard.";

function boardWithLibrary(cards) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...g, players: { ...g.players, user: { ...g.players.user, library: cards, hand: [], graveyard: [] } } };
}

describe("the carriers and the atom", () => {
  it("⭐ all five flip native; the form yields impulse-dig with restTo graveyard + the filter", () => {
    expect(classifyCard({ name: "Malevolent Rumble", type: "Sorcery", mana: "{1}{G}",
      oracle: RUMBLE_ORACLE + ' Create a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice this token: Add {C}."' })).toBe("native-spell");
    expect(classifyCard({ name: "Grisly Salvage", type: "Instant", mana: "{B}{G}",
      oracle: "Reveal the top five cards of your library. You may put a creature or land card from among them into your hand. Put the rest into your graveyard." })).toBe("native-spell");
    expect(classifyCard({ name: "Commune with the Gods", type: "Sorcery", mana: "{1}{G}",
      oracle: "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard." })).toBe("native-spell");
    expect(classifyCard({ name: "Satyr Wayfinder", type: "Creature — Satyr", mana: "{1}{G}", power: "1", toughness: "1",
      oracle: "When this creature enters, reveal the top four cards of your library. You may put a land card from among them into your hand. Put the rest into your graveyard." })).toBe("native-trigger");
    const m = matchImpulseDig(RUMBLE_ORACLE.toLowerCase());
    expect(m?.atom).toMatchObject({ op: "impulse-dig", amount: 4, restTo: "graveyard", filter: { permanentOnly: true } });
  });
});

describe("⭐⭐ LAW 6 — the kept card reaches the hand, the REST reaches the GRAVEYARD", () => {
  const LIB = [
    { id: "L1", name: "Forest", type: "Basic Land — Forest" },
    { id: "I1", name: "Shock", type: "Instant" },
    { id: "C1", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2" },
    { id: "I2", name: "Opt", type: "Instant" },
    { id: "DEEP", name: "Island", type: "Basic Land — Island" }, // the fifth card — must stay in the library
  ];
  const atom = () => matchImpulseDig(RUMBLE_ORACLE.toLowerCase()).atom;

  it("⭐⭐ keep the Bear: hand [Bear], graveyard [Forest, Shock, Opt], the fifth card untouched", () => {
    let s = ATOM_RESOLVERS["impulse-dig"](boardWithLibrary(LIB), atom(), { controller: "user", targets: [] });
    expect(s.pendingChoice).toBeTruthy(); // the pick pends (permanents among the four: Forest + Bear)
    s = resolveImpulseDigChoice(s, "C1");
    const row = { hand: s.players.user.hand.map((c) => c.id), gy: s.players.user.graveyard.map((c) => c.id).sort(), lib: s.players.user.library.map((c) => c.id) };
    console.log("  WITNESS rumbleKeep", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ hand: ["C1"], gy: ["I1", "I2", "L1"], lib: ["DEEP"] });
  });

  it("⛔ NO matching card among the four: all four to the graveyard, nothing pends", () => {
    const noMatch = LIB.map((c) => (c.id === "L1" || c.id === "C1" ? { ...c, type: "Instant", name: "Spell " + c.id } : c));
    const s = ATOM_RESOLVERS["impulse-dig"](boardWithLibrary(noMatch), atom(), { controller: "user", targets: [] });
    const row = { pending: !!s.pendingChoice, gy: s.players.user.graveyard.length, hand: s.players.user.hand.length, lib: s.players.user.library.length };
    console.log("  WITNESS rumbleNoMatch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pending: false, gy: 4, hand: 0, lib: 1 });
  });
});
