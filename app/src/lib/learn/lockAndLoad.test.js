/**
 * lockAndLoad.test.js — SHELF-85 runbook Phase 2 · K9 (2026-09-04): Lock and Load (Kellan).
 *
 *   "Draw a card, then draw a card for each other instant and sorcery spell you've cast this turn.
 *    Plot {3}{U}"
 *
 * Three pieces: a per-turn instant/sorcery cast tally (player.instantSorcerySpellsCastThisTurn — stamped at the one
 * cast chokepoint beside the noncreature tally, reset with it at untap); a countForSpec kind that reads it less the
 * printed "other" (this spell is already counted when it resolves, CR 608.2h); and a splitter keep-whole, because
 * "instant and sorcery" is a type pair the top-level " and " split would sever. Plot was already modeled.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, recordSpellCast, resetSpellsCastAllPlayers } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LOCK = { id: "c-ll", name: "Lock and Load", type: "Sorcery", mana: "{2}{U}", keywords: ["Plot"],
  oracle: "Draw a card, then draw a card for each other instant and sorcery spell you've cast this turn.\nPlot {3}{U} (You may pay {3}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" };
const PONDER = { id: "c-ponder", name: "Preordain-ish", type: "Sorcery", mana: "{U}", keywords: [], oracle: "Draw a card." };
const island = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller: "user" });
const filler = (id) => ({ id, name: "Filler " + id, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 });
const lib = (n, tag) => Array.from({ length: n }, (_, i) => filler(tag + i));

const board = (hand) => {
  let s = createGameState({ userDeck: lib(12, "u"), aiDeck: lib(12, "a") });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: [island("I1"), island("I2"), island("I3"), island("I4"), island("I5"), island("I6")] } } };
};
const cast = (s, cardId) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(act).toBeTruthy();
  s = dispatchAction(s, act);
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
};

describe("parse", () => {
  it("the compound survives the splitter: a fixed draw, then the tallied draw less one", () => {
    const r = parseEffectClause("Draw a card, then draw a card for each other instant and sorcery spell you've cast this turn.", "Sorcery");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "draw", amount: 1, targetType: null }, { op: "draw", amountCount: { kind: "instantSorcerySpellsCastThisTurn", minus: 1, per: 1 }, targetType: null }]);
    expect(programConfidence(parseEffectClause("Draw a card for each other creature spell you've cast this turn.", "Sorcery"))).toBe("low");
  });
});

describe("runtime — the tally", () => {
  it("stamped at the cast chokepoint for instants and sorceries only; reset at untap", () => {
    let s = board([]);
    s = recordSpellCast(s, { playerId: "user", spellCard: PONDER });
    s = recordSpellCast(s, { playerId: "user", spellCard: { id: "x", name: "Bear", type: "Creature — Bear", oracle: "" } });
    s = recordSpellCast(s, { playerId: "user", spellCard: { id: "y", name: "Bolt", type: "Instant", oracle: "" } });
    expect(s.players.user.instantSorcerySpellsCastThisTurn).toBe(2);
    expect(countForSpec(s, { controller: "user" }, { kind: "instantSorcerySpellsCastThisTurn", minus: 1 })).toBe(1);
    expect(countForSpec(s, { controller: "user" }, { kind: "instantSorcerySpellsCastThisTurn" })).toBe(2);
    expect(countForSpec(s, { controller: "ai" }, { kind: "instantSorcerySpellsCastThisTurn", minus: 1 })).toBe(0); // no tally → 0, never negative
    s = resetSpellsCastAllPlayers(s);
    expect(s.players.user.instantSorcerySpellsCastThisTurn).toBe(0);
  });
});

describe("runtime — the spell", () => {
  it("as the only spell this turn it draws exactly 1; after one other sorcery it draws 2", () => {
    let a = board([LOCK]);
    a = cast(a, "c-ll");
    expect(a.players.user.hand.length).toBe(1);
    let b = board([PONDER, LOCK]);
    b = cast(b, "c-ponder"); // hand: LOCK + 1 drawn = 2
    expect(b.players.user.hand.length).toBe(2);
    b = cast(b, "c-ll"); // hand: 1 (the drawn filler) + 1 + 1 = 3
    expect(b.players.user.hand.length).toBe(3);
    expect(b.players.user.instantSorcerySpellsCastThisTurn).toBe(2);
  });
});

describe("classifier", () => {
  it("Lock and Load is a native spell (Plot admitted, the compound draw modeled)", () => {
    expect(classifyCard(LOCK)).toBe("native-spell");
  });
});
