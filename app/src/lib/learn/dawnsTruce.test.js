/**
 * DAWN'S TRUCE — the play-weighted program, P·25 (EDHREC #359); Lazotep Plating prints the same sentence.
 *   "Gift a card (…)
 *    You and permanents you control gain hexproof until end of turn. If the gift was promised, permanents you control also
 *    gain indestructible until end of turn."
 *
 * Veil of Summer's "hexproof from <colours>" machinery, in its plain form: a player stamp for the turn and a target shield
 * fixed to the permanents the controller has as it resolves (CR 611.2c), both refusing EVERY opponent source (CR 702.11c/d)
 * when the colour list is null. Gift is an optional additional cost the engine never pays (castModifiers.stripGiftPromise),
 * so the promised-gift sentence never applies.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";
import { playerTargetableBy, canBeTargetedBy } from "./spellEffects.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TRUCE = { id: "truce", name: "Dawn's Truce", type: "Instant", mana: "{1}{W}", cmc: 2, keywords: ["Gift"], oracle: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nYou and permanents you control gain hexproof until end of turn. If the gift was promised, permanents you control also gain indestructible until end of turn." };
const PLATING = { id: "plating", name: "Lazotep Plating", type: "Instant", mana: "{1}{U}", cmc: 2, keywords: ["Amass"], oracle: "Amass Zombies 1. (Put a +1/+1 counter on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)\nYou and permanents you control gain hexproof until end of turn. (You and they can't be the targets of spells or abilities your opponents control.)" };
const VEIL_ATOM = { op: "hexproof-from-colors", colors: ["U", "B"], targetType: null };
const bear = (id, ctrl) => createPermanent({ id, card: { id: `c-${id}`, name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: ctrl, summoningSick: false });

function cast(card) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  let s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s0.players, user: { ...s0.players.user, hand: [card], battlefield: [bear("b1", "user")], manaPool: { ...s0.players.user.manaPool, W: 1, U: 1, C: 1 } }, ai: { ...s0.players.ai, battlefield: [bear("x1", "ai")] } } };
  const a = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((x) => x.cardId === card.id);
  expect(a).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, a));
}
const shielded = (s, permId) => {
  const p = s.players.user.battlefield.find((x) => x.id === permId);
  return { byOpponentRed: canBeTargetedBy(s, p, "user", "ai", ["R"]), byOpponentColorless: canBeTargetedBy(s, p, "user", "ai", []), byYou: canBeTargetedBy(s, p, "user", "user", ["W"]) };
};

describe("parse + classify", () => {
  it("the plain sentence is the hexproof op with no colour list; Dawn's Truce and Lazotep Plating classify native-spell", () => {
    // The cast path's parse: the cost-only keyword lines (Gift) stripped first, as legalChoices.parseCastProgram does.
    const castProgram = (card) => parseEffectProgram({ ...card, oracle: stripCostOnlyKeywordLines(card.oracle) });
    expect(castProgram(TRUCE).atoms).toEqual([{ op: "hexproof-from-colors", colors: null, targetType: null }]);
    expect(castProgram(PLATING).atoms.at(-1)).toEqual({ op: "hexproof-from-colors", colors: null, targetType: null });
    expect(classifyCard(TRUCE)).toBe("native-spell");
    expect(classifyCard(PLATING)).toBe("native-spell");
  });
});

describe("runtime", () => {
  it("after it resolves, no opponent source of any colour — colourless included — may target you or your permanents; you still may", () => {
    const s = cast(TRUCE);
    const row = {
      you: { byOpponentRed: playerTargetableBy(s, "user", "ai", ["R"]), byOpponentColorless: playerTargetableBy(s, "user", "ai", []), byYou: playerTargetableBy(s, "user", "user", ["W"]) },
      bear: shielded(s, "b1"),
      theirBear: canBeTargetedBy(s, s.players.ai.battlefield[0], "ai", "user", ["W"]),
      indestructible: permanentHasKeyword(s, "b1", "Indestructible"),
    };
    console.log("  WITNESS dawnsTruce", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      you: { byOpponentRed: false, byOpponentColorless: false, byYou: true },
      bear: { byOpponentRed: false, byOpponentColorless: false, byYou: true },
      theirBear: true,          // the opponent's side is untouched
      indestructible: false,    // the gift is never promised (the engine never pays an optional additional cost)
    });
  });

  it("the player stamp is for this turn only, and a permanent that arrives later is not shielded (the set is locked as it resolves)", () => {
    const s = cast(TRUCE);
    const later = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, bear("b2", "user")] } } };
    expect(playerTargetableBy({ ...s, turn: s.turn + 1 }, "user", "ai", ["R"])).toBe(true);
    expect(shielded(later, "b2").byOpponentRed).toBe(true);
  });

  it("Veil of Summer's coloured form is unchanged: a red source may still target you, a blue one may not", () => {
    const s = cast(TRUCE);
    const veiled = { ...s, players: { ...s.players, user: { ...s.players.user, hexproofFrom: { turn: s.turn, colors: VEIL_ATOM.colors } } } };
    expect(playerTargetableBy(veiled, "user", "ai", ["R"])).toBe(true);
    expect(playerTargetableBy(veiled, "user", "ai", ["U"])).toBe(false);
  });
});
