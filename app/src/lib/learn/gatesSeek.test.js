/**
 * gatesSeek.test.js — LANDS-14b (2026-09-03): the Alchemy Gates — "{3}{G}, {T}: Seek a nonland card. Activate
 * only once." (Gate to Manorborn / Gate of the Black Dragon / Gate to Seatower / Gate to Tumbledown / Gate to
 * the Citadel — the stage ② "Gates' once-only draw" family). Two pieces: SEEK (CR 701.55 — a random matching
 * library card to hand, no reveal, no shuffle, on the engine's seeded RNG) and the bare "Activate only once."
 * as a once-per-GAME limit through the existing game-scoped activation ledger.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { seekClauseParser } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GATE = { id: "c-gate", name: "Gate to Manorborn", type: "Land — Forest Gate", mana: "", keywords: [], oracle: "({T}: Add {G}.)\nGate to Manorborn enters the battlefield tapped.\n{3}{G}, {T}: Seek a nonland card. Activate only once." };
const land = (id) => ({ id, name: "Forest", type: "Basic Land — Forest" });
const BEAR = { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };

describe("the parses", () => {
  it("seek: the four modeled filters; a rider parks", () => {
    expect(seekClauseParser("seek a nonland card")).toEqual({ op: "seek", filter: "nonland", targetType: null });
    expect(seekClauseParser("seek a creature card")).toEqual({ op: "seek", filter: "creature", targetType: null });
    expect(seekClauseParser("seek a land card and put it onto the battlefield tapped")).toBeNull();
    expect(seekClauseParser("seek a nonland card with mana value 3 or less")).toBeNull();
  });

  it("the bare 'Activate only once.' is a once-per-GAME limit; 'each turn' stays per turn", () => {
    const ab = parseActivatedAbilities(GATE).find((a) => /seek/i.test(a.raw));
    expect(ab).toBeTruthy();
    expect(ab.activationLimit).toBe(1);
    expect(ab.activationLimitScope).toBe("game");
    expect(ab.modeled).toBe(true);
    const perTurn = parseActivatedAbilities({ ...GATE, oracle: GATE.oracle.replace("Activate only once.", "Activate only once each turn.") }).find((a) => /seek/i.test(a.raw));
    expect(perTurn.activationLimit).toBe(1);
    expect(perTurn.activationLimitScope).toBeUndefined();
  });
});

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, rngSeed: 12345,
    players: {
      ...s0.players,
      user: { ...s0.players.user, hand: [], graveyard: [], library: [land("L1"), BEAR, land("L2"), BOLT, land("L3")], battlefield: [{ ...createPermanent({ id: "gate", card: GATE, controller: "user", summoningSick: false }), enteredOnTurn: 2 }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 4, C: 0 } },
    },
  };
}
const seekAction = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "gate" && /seek/i.test(a.abilityText || a.raw || a.label || JSON.stringify(a)));

describe("runtime", () => {
  it("⭐ the seek puts a random NONLAND card in hand (never a Forest), the library shrinks by one, no shuffle of the rest", () => {
    const s = board();
    const act = seekAction(s);
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.hand).toHaveLength(1);
    expect(["bear", "bolt"]).toContain(out.players.user.hand[0].id);
    expect(out.players.user.library).toHaveLength(4);
    expect(out.players.user.library.filter((c) => c.name === "Forest").map((c) => c.id)).toEqual(["L1", "L2", "L3"]);
  });

  it("deterministic: the same seed picks the same card", () => {
    const a = resolveTopOfStack(dispatchAction(board(), seekAction(board()))).players.user.hand[0].id;
    const b = resolveTopOfStack(dispatchAction(board(), seekAction(board()))).players.user.hand[0].id;
    expect(a).toBe(b);
  });

  it("⛔ once per GAME: on a later turn, untapped and with mana, the ability is not offered again", () => {
    const s = board();
    const out = resolveTopOfStack(dispatchAction(s, seekAction(s)));
    const later = { ...out, turn: out.turn + 2, players: { ...out.players, user: { ...out.players.user, battlefield: out.players.user.battlefield.map((p) => ({ ...p, tapped: false })), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 4, C: 0 } } } };
    expect(seekAction(later)).toBeUndefined();
  });

  it("no nonland card in the library → a logged no-op, nothing moves", () => {
    const s = board();
    s.players.user.library = [land("L1"), land("L2")];
    const out = resolveTopOfStack(dispatchAction(s, seekAction(s)));
    expect(out.players.user.hand).toHaveLength(0);
    expect(out.players.user.library).toHaveLength(2);
  });
});

describe("classification", () => {
  it("the Gate is a fully covered land; a seek with a rider parks", () => {
    expect(classifyCard(GATE)).toBe("land");
    expect(classifyCard({ ...GATE, oracle: GATE.oracle.replace("Seek a nonland card.", "Seek a land card and put it onto the battlefield tapped.") })).not.toBe("land");
  });
});
