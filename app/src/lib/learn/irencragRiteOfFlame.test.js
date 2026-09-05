/**
 * irencragRiteOfFlame.test.js — POD-SIM THREE · Killer Turts KT-3 (2026-09-05): Irencrag Feat and Rite of Flame.
 *
 *  · Irencrag Feat "Add seven {R}. You can cast only one more spell this turn." — the WORD-number pip form (the pip form
 *    "Add {R}{R}{R}{R}{R}{R}{R}" already parsed) and a SELF cast limit for the turn: the controller may cast exactly one
 *    more spell after the ritual resolves. The limit is a castLocksThisTurn stamp keyed on the controller's own
 *    spellsCastThisTurn at resolution (Irencrag itself was counted at its cast, so the NEXT spell is the one more), read
 *    by the cast loop; it self-expires with the turn number. Abilities are never locked (spells only — CR 601).
 *  · Rite of Flame "Add {R}{R}, then add {R} for each card named Rite of Flame in each graveyard." — the second half is
 *    an add-mana whose amount is a count kind over EVERY graveyard by name (yours and your opponents').
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const IRENCRAG = { id: "irf", name: "Irencrag Feat", type: "Sorcery", mana: "{1}{R}{R}{R}", oracle: "Add seven {R}. You can cast only one more spell this turn." };
const RITE = { id: "rof", name: "Rite of Flame", type: "Sorcery", mana: "{R}", oracle: "Add {R}{R}, then add {R} for each card named Rite of Flame in each graveyard." };
const BOLT = { id: "blt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const BOLT2 = { ...BOLT, id: "blt2" };
const RITE_GY = (id) => ({ ...RITE, id });

function mainState({ userHand = [], userPool = {}, userGy = [], aiGy = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand: userHand, graveyard: userGy, manaPool: { ...s.players.user.manaPool, ...userPool } }, ai: { ...s.players.ai, graveyard: aiGy } },
  };
}
const castOf = (state, cardId) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell").find((c) => c.cardId === cardId);
const pool = (s) => s.players.user.manaPool;

describe("parser + classifier", () => {
  it("Irencrag = the word-number add + a self cast limit; Rite = a fixed add + a per-count add over every graveyard; both classify native", () => {
    const i = parseEffectProgram(IRENCRAG);
    expect(i.confidence).toBe("high");
    expect(i.atoms).toEqual([
      { op: "add-mana", mana: { W: 0, U: 0, B: 0, R: 7, G: 0, C: 0 }, targetType: null },
      { op: "self-cast-limit-turn", moreSpells: 1, targetType: null },
    ]);
    const r = parseEffectProgram(RITE);
    expect(r.confidence).toBe("high");
    expect(r.atoms).toEqual([
      { op: "add-mana", mana: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 }, targetType: null },
      { op: "add-mana", manaPerCount: "R", countSpec: { kind: "cardsNamedInAllGraveyards", name: "rite of flame" }, targetType: null },
    ]);
    expect(classifyCard({ ...IRENCRAG, keywords: [] })).toBe("native-spell");
    expect(classifyCard({ ...RITE, keywords: [] })).toBe("native-spell");
    // CREED: the word form takes ONE colour word and a number word; "add seven mana" or "add seven {R}{G}" stay unparsed
    expect(parseEffectProgram({ ...IRENCRAG, oracle: "Add seven mana of any one color." }).confidence).not.toBe("high");
  });
});

describe("runtime — Irencrag Feat", () => {
  it("resolving adds {R}×7; ONE more spell may be cast this turn, then no cast is offered; the limit lifts next turn", () => {
    let s = mainState({ userHand: [IRENCRAG, BOLT, BOLT2], userPool: { R: 4 } });
    const cast = castOf(s, "irf");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(pool(s).R).toBe(7);
    const one = castOf(s, "blt");
    expect(one).toBeTruthy();                         // the one more spell
    s = resolveTopOfStack(dispatchAction(s, one));
    expect(castOf(s, "blt2")).toBeUndefined();        // the limit: no second spell this turn
    const nextTurn = { ...s, turn: s.turn + 1 };       // the stamp self-expires with the turn number
    expect(castOf(nextTurn, "blt2")).toBeTruthy();
  });

  it("the limit is the caster's own: the opponent's casting is untouched (no lock stamped on other seats)", () => {
    let s = mainState({ userHand: [IRENCRAG], userPool: { R: 4 } });
    s = resolveTopOfStack(dispatchAction(s, castOf(s, "irf")));
    expect(s.castLocksThisTurn?.user).toBeTruthy();
    expect(s.castLocksThisTurn?.ai).toBeUndefined();
  });
});

describe("runtime — Rite of Flame", () => {
  it("with no Rite in any graveyard: {R}{R}; with one in yours and one in an opponent's: {R}{R} + {R}{R}", () => {
    let s = mainState({ userHand: [RITE], userPool: { R: 1 } });
    s = resolveTopOfStack(dispatchAction(s, castOf(s, "rof")));
    // the Rite itself is in the graveyard AS it resolves? No — CR 608.2m: a resolving spell goes to the graveyard as the LAST
    // step, after its effects; the count at resolution does not include itself.
    expect(pool(s).R).toBe(2);
    let t = mainState({ userHand: [RITE], userPool: { R: 1 }, userGy: [RITE_GY("g1")], aiGy: [RITE_GY("g2"), BOLT] });
    t = resolveTopOfStack(dispatchAction(t, castOf(t, "rof")));
    expect(pool(t).R).toBe(4);
    expect(countForSpec(t, { controller: "user" }, { kind: "cardsNamedInAllGraveyards", name: "rite of flame" })).toBe(3); // now three: g1, g2, the resolved one
  });
});
