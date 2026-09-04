/**
 * arcaneDenial.test.js — ④-BD (2026-09-04 night): Arcane Denial — "Counter target spell. Its controller may draw up to two
 * cards at the beginning of the next turn's upkeep. You draw a card at the beginning of the next turn's upkeep." Three
 * shelf decks (Shorikai Vehicles, Nekusar Wheels, Veyran Cantrips — Veyran's 90th card). The counter's controller-rider
 * path (matchCounterControllerRider → applyControllerRider) learned a DELAYED optional draw: the rider schedules the
 * countered spell's CONTROLLER a next-upkeep trigger whose effect is N separate "you may draw a card" decisions (the
 * choice space {0..N} of "up to N", on the yes/no pause every optional draw already uses). The caster's own delayed
 * draw parsed already. Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DENIAL = { id: "h-ad", name: "Arcane Denial", type: "Instant", mana: "{1}{U}", mana_cost: "{1}{U}", cmc: 2, keywords: [],
  oracle: "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.\nYou draw a card at the beginning of the next turn's upkeep." };
const BEAR_SPELL = { id: "h-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };
const lib = (pid) => Array.from({ length: 6 }, (_, i) => ({ id: `${pid}-l${i}`, name: `Card ${pid}${i}`, type: "Instant", mana: "{U}", cmc: 1, keywords: [], oracle: "" }));

describe("the parse and the classifier", () => {
  it("⭐ the program: a hard counter carrying the delayed may-draw rider for the countered spell's controller, then the caster's own delayed draw", () => {
    const p = parseEffectProgram(DENIAL);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(2);
    expect(p.atoms[0]).toMatchObject({ op: "counter", targetType: "spell", controllerRider: { kind: "delayedMayDraw", count: 2, fireStep: "upkeep", fireScope: "any" } });
    expect(p.atoms[1]).toMatchObject({ op: "schedule-delayed", fireStep: "upkeep", fireScope: "any" });
    expect(p.atoms[1].delayedClause.toLowerCase()).toBe("you draw a card");
    expect(classifyCard(DENIAL)).toBe("native-spell");
  });
});

describe("runtime", () => {
  it("⭐ the AI's spell is countered; at the next upkeep the AI may draw up to two (takes both) and the user draws one", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    // the AI has just cast Grizzly Bears (on the stack); the user holds priority with Arcane Denial and {1}{U}
    let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
      stack: [{ id: "stk-bear", kind: "spell", source: BEAR_SPELL, controller: "ai", targets: [], cost: null, payload: { resolver: "permanent", params: {} } }],
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [DENIAL], library: lib("u"), battlefield: [], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 1 } },
        ai: { ...s0.players.ai, hand: [], library: lib("a"), battlefield: [] } } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-ad" && (a.targets || []).some((t) => t.type === "spell" && t.id === "stk-bear"));
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.stack).toHaveLength(0);
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
    expect(s.players.ai.battlefield).toHaveLength(0);
    // two delayed records: the AI's optional pair, the user's draw
    const recs = s.delayedTriggers;
    expect(recs).toHaveLength(2);
    expect(recs.find((r) => r.controller === "ai").effectClause).toBe("you may draw a card. you may draw a card");
    expect(recs.find((r) => r.controller === "user").effectClause.toLowerCase()).toBe("you draw a card");
    expect(recs.every((r) => r.fireStep === "upkeep" && r.fireScope === "any")).toBe(true);
    // the next upkeep — the user's turn 7 (fireScope "any": whoever's turn it is)
    const aiHand = s.players.ai.hand.length;
    const userHand = s.players.user.hand.length;
    let t = nextStep({ ...s, turn: 7, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 });
    expect(t.step).toBe("upkeep");
    if (!t.stack.length) t = flushTriggers(t);
    expect(t.stack).toHaveLength(2);
    expect(t.delayedTriggers).toHaveLength(0);
    // resolve both, taking every optional draw
    for (let guard = 0; guard < 6 && (t.stack.length || t.pendingChoice); guard++) {
      if (t.pendingChoice?.kind === "optional-effect") { t = resolveOptionalChoice(t, true); continue; }
      t = resolveTopOfStack(t);
    }
    expect(t.pendingChoice).toBeFalsy();
    expect(t.players.ai.hand.length - aiHand).toBe(2);
    expect(t.players.user.hand.length - userHand).toBe(1);
  });
  it("declining both optional draws leaves the AI's hand as it was", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, turn: 6, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      delayedTriggers: [{ id: "dly-1-6", controller: "ai", fireStep: "upkeep", fireScope: "any", effectClause: "you may draw a card. you may draw a card", sourceName: "Arcane Denial", sourceCardId: null, sourcePermanentId: null, createdTurn: 5 }],
      players: { ...s0.players, user: { ...s0.players.user, hand: [], library: lib("u"), battlefield: [] }, ai: { ...s0.players.ai, hand: [], library: lib("a"), battlefield: [] } } };
    s = nextStep(s);
    if (!s.stack.length) s = flushTriggers(s);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    expect(s.pendingChoice.controller).toBe("ai");
    s = resolveOptionalChoice(s, false);
    if (s.pendingChoice?.kind === "optional-effect") s = resolveOptionalChoice(s, false);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.ai.hand).toHaveLength(0);
  });
});
