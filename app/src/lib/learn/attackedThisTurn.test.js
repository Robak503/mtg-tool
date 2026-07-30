/**
 * attackedThisTurn.test.js — RAID (CR 508.1): the "you attacked this turn" intervening-if, mirroring the
 * creaturesDiedThisTurn per-turn history flag. Read side (interveningIfParseable / evaluateInterveningIf),
 * reset side (resetAttackedThisTurnAllPlayers @ untap), and the WRITE side (declare-attacker stamps the flag
 * — the load-bearing runtime piece the classifier flip-diff can't prove on its own).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { interveningIfParseable, evaluateInterveningIf } from "./interveningIf.js";
import { _resetIdsForTests, createGameState, createPermanent, resetAttackedThisTurnAllPlayers } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

describe("RAID — 'you attacked this turn' intervening-if (read side)", () => {
  it("interveningIfParseable: the exact shape is parseable; near-misses are NOT (stay Arbiter)", () => {
    expect(interveningIfParseable("you attacked this turn")).toBe(true);
    // ⭐ TWO NEAR-MISSES GRADUATED 2026-07-30 — both read the SAME flag this pin already trusted.
    // "with a creature" is not a narrowing at all: only creatures are ever declared as attackers (CR 508.1a),
    // so the qualifier is flavour. And the negation is the exact inverse of one boolean — an unstamped seat
    // has not attacked, which is what "didn't attack" means. Neither needed new tracking.
    for (const now of ["you attacked with a creature this turn", "you didn't attack this turn",
      "you didn't attack with a creature this turn", "you haven't attacked this turn"]) {
      expect(interveningIfParseable(now), now).toBe(true);
    }
    // ⛔ THE BOUNDARY HOLDS where the SCOPE genuinely differs — a per-CREATURE or per-permanent subject asks
    // about an object, not the seat, and the flag cannot answer that. Those still park.
    for (const near of [
      "this creature attacked this turn",            // per-creature variant — a different referent
      "a creature you control attacked this turn",   // scoped to an object, not the seat
      "an opponent attacked this turn",              // opponent-scoped — a different seat's flag
    ]) expect(interveningIfParseable(near), near).toBe(false);
  });
  it("evaluateInterveningIf reads the controller's flag: set→true, unset→false, missing→false", () => {
    const s = { players: { user: { attackedThisTurn: true }, ai: { attackedThisTurn: false } } };
    expect(evaluateInterveningIf(s, "you attacked this turn", "user")).toBe(true);
    expect(evaluateInterveningIf(s, "you attacked this turn", "ai")).toBe(false);
    expect(evaluateInterveningIf({ players: { user: {} } }, "you attacked this turn", "user")).toBe(false); // undefined flag → false
  });
});

describe("RAID — reset clears every seat at untap", () => {
  it("resetAttackedThisTurnAllPlayers clears ALL seats (not just active) — closes the off-turn stale-read", () => {
    const s = { players: { user: { attackedThisTurn: true }, ai: { attackedThisTurn: true } } };
    const after = resetAttackedThisTurnAllPlayers(s);
    expect(after.players.user.attackedThisTurn).toBe(false);
    expect(after.players.ai.attackedThisTurn).toBe(false);
  });
});

describe("RAID — declare-attacker stamps the flag (write side)", () => {
  it("declaring an attacker sets the attacking player's attackedThisTurn; the opponent's stays false", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const atk = createPermanent({ id: "atk", card: { id: "c-atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    s = {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user",
      combat: { attackers: [], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [atk] } },
    };
    expect(s.players.user.attackedThisTurn).toBe(false); // createPlayerState default
    const after = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk" });
    expect(after.players.user.attackedThisTurn).toBe(true);  // stamped at the sole attack chokepoint
    expect(after.players.ai.attackedThisTurn).toBe(false);   // opponent untouched
  });
});
