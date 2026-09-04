/**
 * rashmi.test.js — SHELF-85 runbook Phase 2 · K5 (2026-09-04): Rashmi, Eternities Crafter (Kellan).
 *
 *   "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its
 *    mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand."
 *
 * The first-spell cast watcher already threads the triggering spell's mana value (castSpellMv). The effect is one
 * three-sentence atom: reveal the top; a NONLAND with STRICTLY lesser mana value is exiled and parked behind the DISCOVER
 * decision (cast it free as the ability resolves, or — discover's default decline — into the hand); a land, an
 * equal-or-greater card, or a missing cast mana value sends the card straight to the hand. Never a free cast by default.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RASHMI = { id: "c-rashmi", name: "Rashmi, Eternities Crafter", type: "Legendary Creature — Elf Druid", mana: "{2}{G}{U}", keywords: [], power: 2, toughness: 3,
  oracle: "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." };
const BEAR = { id: "t-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const WURM = { id: "t-wurm", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", oracle: "", power: 6, toughness: 4 };
const ISLAND = { id: "t-isl", name: "Island", type: "Basic Land — Island", oracle: "" };
const filler = { id: "f", name: "Filler", type: "Creature — Bear", oracle: "", power: 1, toughness: 1 };
const ATOM = { op: "reveal-top-cast-or-hand", lesserThanCastMv: true, targetType: null };

const board = (top) => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, hand: [], library: top ? [top, filler] : [], battlefield: [createPermanent({ id: "R", card: RASHMI, controller: "user" })] } } };
};
const fire = (s, castSpellMv) => ATOM_RESOLVERS["reveal-top-cast-or-hand"](s, ATOM, { controller: "user", sourceId: "R", ...(castSpellMv === undefined ? {} : { castSpellMv }) });

describe("parse", () => {
  it("the first-spell watcher, and the three-sentence effect as one atom", () => {
    const t = detectTriggers(RASHMI);
    expect(t.map((x) => x.event)).toEqual(["castNth"]);
    const r = parseEffectClause(t[0].effectClause, "Creature");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([ATOM]);
  });
});

describe("runtime", () => {
  it("a lesser nonland: parked behind the free-cast decision; the decline puts it in hand", () => {
    let s = fire(board(BEAR), 4); // Bear (2) < the cast spell (4)
    expect(s.pendingDiscover).toEqual({ controller: "user", cardId: "t-bear", mv: 2 });
    expect(s.players.user.exile.some((c) => c.id === "t-bear")).toBe(true);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["f"]);
    const acts = legalActionsForPlayer(s, "user");
    const free = acts.find((a) => a.kind === "cast-spell" && a.cardId === "t-bear");
    expect(free?.fromZone).toBe("exile");
    const toHand = acts.find((a) => a.kind === "discover-to-hand" && a.cardId === "t-bear");
    expect(toHand).toBeTruthy();
    expect(toHand.leaveExiled).toBeUndefined(); // discover's default decline: the hand, as printed
    const declined = dispatchAction(s, toHand);
    expect(declined.pendingDiscover).toBeUndefined();
    expect(declined.players.user.hand.some((c) => c.id === "t-bear")).toBe(true);
    let cast = dispatchAction(s, free);
    while (cast.stack.length && !cast.pendingChoice) cast = resolveTopOfStack(cast);
    expect(cast.players.user.battlefield.some((p) => p.card?.id === "t-bear")).toBe(true);
  });
  it("equal mana value, a greater one, a land, or a missing cast mana value: straight to hand, never a free cast", () => {
    for (const [top, mv] of [[BEAR, 2], [WURM, 3], [ISLAND, 9], [BEAR, undefined]]) {
      const s = fire(board(top), mv);
      expect(s.pendingDiscover).toBeUndefined();
      expect(s.players.user.hand.map((c) => c.id)).toEqual([top.id]);
      expect(s.players.user.exile.some((c) => c.id === top.id)).toBe(false);
    }
    const empty = fire(board(null), 5);
    expect(empty.players.user.hand).toEqual([]);
    expect(empty.pendingDiscover).toBeUndefined();
  });
});

describe("classifier", () => {
  it("Rashmi is native-trigger", () => {
    expect(classifyCard(RASHMI)).toBe("native-trigger");
  });
});
