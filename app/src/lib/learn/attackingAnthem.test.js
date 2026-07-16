/**
 * attackingAnthem.test.js — BLITZ AT-1: the combat-state anthem "Attacking creatures you control get
 * +1/+0." (Orcish Oriflamme / Goblin Oriflamme / War Horn). parseCreatureSelector emits a selector with
 * `attacking: true`; layers.matchesSelector gates it on state.combat.attackers — NON-layered state (the
 * requiresCounter class, no recursion) re-evaluated per query, so the pump appears the moment a creature
 * is declared and vanishes when combat clears (CR 611.2c continuous). Real oracle fixtures (bundled
 * Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ORIFLAMME = { id: "ofc", name: "Orcish Oriflamme", type: "Enchantment", mana: "{3}{R}",
  oracle: "Attacking creatures you control get +1/+0." };

describe("AT-1 — the attacking anthem", () => {
  it("classify: the three carriers flip native-static", () => {
    expect(classifyCard(ORIFLAMME)).toBe("native-static");
    expect(classifyCard({ id: "wh", name: "War Horn", type: "Artifact", mana: "{3}",
      oracle: "Attacking creatures you control get +1/+0." })).toBe("native-static");
  });
  it("runtime: +1/+0 only while declared; an opponent's attacker is never pumped", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const flame = createPermanent({ id: "of", card: ORIFLAMME, controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "br", card: { id: "brc", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const foe = createPermanent({ id: "fo", card: { id: "foc", name: "Raider", type: "Creature — Human", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [flame, bear] }, ai1: { ...s.players.ai1, battlefield: [foe] } } };
    expect(permanentPower(s, "br")).toBe(2); // idle — no pump
    const combat = { ...s, combat: { attackers: [{ permanentId: "br", attackingPlayer: "user", defender: "ai1" }, { permanentId: "fo", attackingPlayer: "ai1", defender: "user" }], blockers: [] } };
    expect(permanentPower(combat, "br")).toBe(3); // declared → +1/+0
    expect(permanentPower(combat, "fo")).toBe(2); // "you control" — the foe's attacker is untouched
    expect(permanentPower({ ...combat, combat: { attackers: [], blockers: [] } }, "br")).toBe(2); // combat clears → pump gone
  });
});
