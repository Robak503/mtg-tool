/**
 * activateOncePerTurn.test.js — BLITZ ONCE-1: the "Activate only once each turn." frequency
 * restriction (the Rootwalla / Hollow Scavenger frame, 31 corpus carriers). The rider is stripped
 * for the effect parse ONLY because the runtime enforces it: legalChoices' offer gate reads the
 * state.activatedOncePerTurn ledger (keyed permId:rawLine against state.turn — self-expiring), and
 * applyActivateAbility stamps it the moment the ability hits the stack.
 * CREED FP guarded: a second same-turn activation must NEVER be offered; the ledger must expire on
 * the next turn. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ROOTWALLA = { id: "rw", name: "Rootwalla", type: "Creature — Lizard", mana: "{2}{G}",
  power: "2", toughness: "2", oracle: "{1}{G}: This creature gets +2/+2 until end of turn. Activate only once each turn." };

describe("parse + classify", () => {
  it("the rider strips for the parse and records activationLimit 1 on the ability", () => {
    const abs = parseActivatedAbilities(ROOTWALLA);
    expect(abs).toHaveLength(1);
    expect(abs[0].activationLimit).toBe(1);
    expect(abs[0].modeled).toBe(true);
    expect(abs[0].effectClause.toLowerCase()).not.toContain("activate only");
  });
  it("Rootwalla flips native-activated", () => {
    expect(classifyCard(ROOTWALLA)).toBe("native-activated");
  });
});

describe("runtime — offered once per turn, ledger self-expires", () => {
  function board() {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const walla = createPermanent({ id: "wperm", card: ROOTWALLA, controller: "user", summoningSick: false });
    const forest = (id) => createPermanent({ id, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    return {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 3,
      players: { ...s.players, user: { ...s.players.user, battlefield: [walla, forest("f1"), forest("f2")] } },
    };
  }
  const pumpOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "wperm");

  it("offered before; NOT offered again the same turn after activating; offered again next turn", () => {
    let s = board();
    const offers = pumpOffers(s);
    expect(offers.length).toBe(1);
    expect(offers[0].oncePerTurnKey).toBe(`wperm:${parseActivatedAbilities(ROOTWALLA)[0].raw}`);
    s = dispatchAction(s, offers[0]);
    expect(s.activatedOncePerTurn?.[offers[0].oncePerTurnKey]).toEqual({ turn: 3, n: 1 });
    // Same turn: the pump is spent (mana pool refilled for a clean affordability read).
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: false })) } } };
    expect(pumpOffers(s)).toHaveLength(0);
    // Next turn: the ledger entry (keyed to turn 3) no longer matches — offered again.
    const nextTurn = { ...s, turn: 4 };
    expect(pumpOffers(nextTurn).length).toBe(1);
  });
});
