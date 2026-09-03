/**
 * graveyardReturnPick.test.js — ④-AA (2026-09-03 night): the NON-targeted single return — "Return a <filter> card from
 * your graveyard to your hand." No target is chosen at cast; the card is chosen as the effect resolves (CR 608.2), so it
 * rides the milled-pick pause aimed at the controller with toZone "hand" (a human picks; the AI takes the first,
 * most-valuable candidate). The filter is the targeted lane's own vocabulary. Real oracle fixtures where named.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { graveyardReturnPickClauseParser } from "./effects/atoms/zones.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveMilledPickChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SPELL = { id: "h-rr", name: "Probe Recall", type: "Sorcery", mana: "{1}{B}", mana_cost: "{1}{B}", cmc: 2, keywords: [], oracle: "Return a creature card from your graveyard to your hand." };
const gy = (id, name, type, cmc) => ({ id, name, type, cmc, keywords: [], oracle: "" });

function board(graveyard) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [SPELL], graveyard, battlefield: [], manaPool: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 1 } } } };
}
const cast = (s) => { const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-rr"); expect(act).toBeTruthy(); return resolveTopOfStack(dispatchAction(s, act)); };

describe("the parse", () => {
  it("⭐ the non-targeted single return parses with the shared filter vocabulary; a count, another zone or an unmodeled filter stay out", () => {
    expect(graveyardReturnPickClauseParser("return a creature card from your graveyard to your hand")).toEqual({ op: "return-from-graveyard-pick", cardFilter: "creature", targetType: null });
    expect(graveyardReturnPickClauseParser("return a creature or planeswalker card from your graveyard to your hand")).toEqual({ op: "return-from-graveyard-pick", cardFilter: "creature|planeswalker", targetType: null });
    expect(graveyardReturnPickClauseParser("return a card from your graveyard to your hand")).toEqual({ op: "return-from-graveyard-pick", cardFilter: "any", targetType: null });
    expect(graveyardReturnPickClauseParser("return up to two creature cards from your graveyard to your hand")).toBeNull();
    expect(graveyardReturnPickClauseParser("return a creature card from your graveyard to the battlefield")).toBeNull();
    expect(graveyardReturnPickClauseParser("return a goblin card from your graveyard to your hand")).toBeNull();
    expect(parseEffectClause("Return a creature card from your graveyard to your hand.", "Sorcery").confidence).toBe("high");
  });
  it("⭐ the real carriers the flip-diff surfaced (audited whole-card): Corpse Churn, Grapple with the Past, Takenuma's channel", () => {
    expect(classifyCard({ id: "c-cc", name: "Corpse Churn", type: "Instant", mana: "{1}{B}", cmc: 2, keywords: [], oracle: "Mill three cards, then you may return a creature card from your graveyard to your hand." })).toBe("native-spell");
    expect(classifyCard({ id: "c-gp", name: "Grapple with the Past", type: "Instant", mana: "{G}", cmc: 1, keywords: [], oracle: "Mill three cards, then you may return a creature or land card from your graveyard to your hand." })).toBe("native-spell");
    expect(classifyCard({ id: "c-tk", name: "Takenuma, Abandoned Mire", type: "Legendary Land", mana: "", cmc: 0, keywords: [],
      oracle: "{T}: Add {B}.\nChannel — {3}{B}, Discard this card: Mill three cards, then return a creature or planeswalker card from your graveyard to your hand. This ability costs {1} less to activate for each legendary creature you control." })).toBe("land");
  });
});

describe("runtime — chosen as it resolves", () => {
  it("⭐ two creature cards: the pause belongs to the caster, aimed at the hand, most valuable first; settling returns the pick", () => {
    const paused = cast(board([gy("g1", "Small Bear", "Creature — Bear", 2), gy("g2", "Big Wurm", "Creature — Wurm", 6), gy("g3", "Shock", "Instant", 1)]));
    expect(paused.pendingChoice).toMatchObject({ kind: "milled-pick", controller: "user", toZone: "hand" });
    expect(paused.pendingChoice.candidates.map((c) => c.name)).toEqual(["Big Wurm", "Small Bear"]);
    const out = resolveMilledPickChoice(paused, "g1");
    expect(out.pendingChoice).toBeUndefined();
    expect(out.players.user.hand.map((c) => c.name)).toEqual(["Small Bear"]);
    expect(out.players.user.graveyard.map((c) => c.name).sort()).toEqual(["Big Wurm", "Probe Recall", "Shock"]);
  });
  it("one creature card: returned with no pause; none: a no-op", () => {
    const one = cast(board([gy("g1", "Small Bear", "Creature — Bear", 2), gy("g3", "Shock", "Instant", 1)]));
    expect(one.pendingChoice).toBeUndefined();
    expect(one.players.user.hand.map((c) => c.name)).toEqual(["Small Bear"]);
    const none = cast(board([gy("g3", "Shock", "Instant", 1)]));
    expect(none.pendingChoice).toBeUndefined();
    expect(none.players.user.hand).toEqual([]);
  });
});
