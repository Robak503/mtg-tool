/**
 * duringYourTurnBuff.test.js — BLITZ DT-1: "During your turn, this creature gets +N/+M." — the
 * ptModifyGated lane with a turn-phase gate ({kind:"yourTurn"}, layers.gateMet reads
 * state.activePlayer === controller, re-evaluated every derive pass so the buff flips exactly at
 * the turn boundary). Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HARDY_VETERAN = { id: "hv", name: "Hardy Veteran", type: "Creature — Human Warrior", mana: "{1}{G}",
  power: "2", toughness: "1", oracle: "During your turn, this creature gets +0/+2." };

describe("classify + the live gate", () => {
  it("Hardy Veteran flips native-static", () => {
    expect(classifyCard(HARDY_VETERAN)).toBe("native-static");
  });
  it("the buff applies on the controller's turn and lifts on an opponent's", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const vet = createPermanent({ id: "vperm", card: HARDY_VETERAN, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [vet] } } };
    const myTurn = { ...s, activePlayer: "user" };
    const theirTurn = { ...s, activePlayer: "ai1" };
    const perm = (st) => st.players.user.battlefield[0];
    // Toughness is the buffed side (+0/+2): read power (unchanged) as the control and derive toughness
    // via the layer engine — creaturePower must be identical both turns; the toughness delta is the gate.
    expect(creaturePower(perm(myTurn), myTurn)).toBe(2);
    expect(creaturePower(perm(theirTurn), theirTurn)).toBe(2);
    expect(creatureToughness(perm(myTurn), myTurn)).toBe(3);     // 1 + 2 on your turn
    expect(creatureToughness(perm(theirTurn), theirTurn)).toBe(1); // the gate lifts off-turn
  });
});
