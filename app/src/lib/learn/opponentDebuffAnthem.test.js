/**
 * opponentDebuffAnthem.test.js — BLITZ OD-1: "Creatures your opponents control get -N/-M." (Cumber
 * Stone / Haunter of Nightveil / Azorius Skyguard / Dampening Pulse / Elesh Norn's second line).
 * parseCreatureSelector's opponents branch → matchesSelector's existing "opponents" scope (the exact
 * mirror of the you-control anthem); the negative P/T rides the 7c ptModify and the lethal SBA reads
 * layer-aware toughness. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ELESH_NORN = { id: "en", name: "Elesh Norn, Grand Cenobite", type: "Legendary Creature — Phyrexian Praetor", power: "4", toughness: "7", mana: "{5}{W}{W}",
  oracle: "Vigilance\nOther creatures you control get +2/+2.\nCreatures your opponents control get -2/-2." };

describe("OD-1 — the opponent-debuff anthem", () => {
  it("classify: the flat debuffs and the two-sided Praetor flip", () => {
    expect(classifyCard({ id: "cs", name: "Cumber Stone", type: "Artifact", mana: "{4}",
      oracle: "Creatures your opponents control get -1/-0." })).toBe("native-static");
    expect(classifyCard(ELESH_NORN)).toBe("native-static");
  });
  it("runtime: the debuff hits ONLY opponents' creatures; the own-side anthem still pumps", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const norn = createPermanent({ id: "en", card: ELESH_NORN, controller: "user", summoningSick: false });
    const own = createPermanent({ id: "ob", card: { id: "obc", name: "Own Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const foe = createPermanent({ id: "fb", card: { id: "fbc", name: "Foe Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [norn, own] }, ai1: { ...s.players.ai1, battlefield: [foe] } } };
    expect(permanentPower(s, "ob")).toBe(4);      // +2/+2 own anthem
    expect(permanentPower(s, "fb")).toBe(0);      // -2/-2 debuff
    expect(permanentToughness(s, "fb")).toBe(0);  // an X/2 under Norn is dead to the SBA downstream
    expect(permanentPower(s, "en")).toBe(4);      // "other creatures" — Norn pumps neither herself…
    expect(permanentToughness(s, "en")).toBe(7);  // …nor is she debuffed (she's not an opponent's)
  });
});
