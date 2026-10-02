/**
 * PLUNDER THE TROLLSHAWS — the cast-from-a-graveyard BRANCH.
 *   "Draw a card. If this spell was cast from a graveyard, draw two cards instead. Flashback {3}{U}"
 *
 * THE SEAM: the parser builds one conditional atom keyed on "this spell was cast from a graveyard" (draw 2 / draw 1). The
 * condition reader (interveningIf.evaluateSingleCondition) answers from the resolving spell's cast-time stamp,
 * params.context.castFromGraveyard, which actionDispatcher.applyCastSpell writes on a graveyard cast and runProgram spreads
 * into the atom context. The branch node (effectAtoms.applyConditional) built its own evaluator context and dropped the
 * stamp, so a flashback cast always took the "draw a card" branch. A copy was never cast (CR 707.10) and carries no stamp
 * (stack.spellCopyPayload strips it): it draws one.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ---- real card fixtures (generated from the bundled Scryfall data — never typed by hand) ----
const PLUNDER = {"name":"Plunder the Trollshaws","type":"Instant","mana":"{1}{U}","cmc":2,"keywords":["Flashback"],"colors":["U"],"oracle":"Draw a card. If this spell was cast from a graveyard, draw two cards instead.\nFlashback {3}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // native-spell
const REVERBERATE = {"name":"Reverberate","type":"Instant","mana":"{R}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy."}; // native-spell
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const plunder = { ...PLUNDER, id: "plunder" };
const reverberate = { ...REVERBERATE, id: "reverb" };
const library = (n) => Array.from({ length: n }, (_, i) => ({ ...ISLAND, id: `lib-${i}` }));

function board({ hand = [], graveyard = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, hand, graveyard, library: library(10), manaPool: { ...s.players.user.manaPool, ...pool } } },
  };
}
const castPlunder = (s, flashback) => {
  const a = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((x) => x.cardId === "plunder" && !!x.flashbackCast === flashback);
  expect(a).toBeTruthy();
  return dispatchAction(s, a);
};
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 10) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const zones = (s) => {
  const u = s.players.user;
  return { hand: u.hand.length, library: u.library.length, graveyard: u.graveyard.map((c) => c.name), exile: u.exile.map((c) => c.name), stack: s.stack.length };
};

describe("parse + classify", () => {
  it("one conditional atom on the cast-from-a-graveyard read: draw two, otherwise draw one; native-spell", () => {
    const p = parseEffectProgram(plunder);
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "conditional", branchOn: "this spell was cast from a graveyard", ifTrue: [{ op: "draw", amount: 2, targetType: null }], ifFalse: [{ op: "draw", amount: 1, targetType: null }], targetType: null }]);
    expect(classifyCard(plunder)).toBe("native-spell");
  });
});

describe("runtime", () => {
  it("cast from hand: draws ONE card and goes to the graveyard", () => {
    const s = settle(castPlunder(board({ hand: [plunder], pool: { U: 1, C: 1 } }), false));
    expect(zones(s)).toEqual({ hand: 1, library: 9, graveyard: ["Plunder the Trollshaws"], exile: [], stack: 0 });
  });

  it("⭐ flashback from the graveyard: draws TWO cards instead (not one, not three) and is exiled (CR 702.34a)", () => {
    const s = settle(castPlunder(board({ graveyard: [plunder], pool: { U: 1, C: 3 } }), true));
    expect(zones(s)).toEqual({ hand: 2, library: 8, graveyard: [], exile: ["Plunder the Trollshaws"], stack: 0 });
  });

  it("⭐ a Reverberate copy of a flashbacked Plunder draws ONE (a copy was never cast, CR 707.10); the original still draws two", () => {
    // {U} + {R}x5: the flashback's generic {3} may be paid with red, and {R}{R} is still left for Reverberate.
    const cast = castPlunder(board({ hand: [reverberate], graveyard: [plunder], pool: { U: 1, R: 5 } }), true);
    const spell = cast.stack.find((o) => o.source?.name === "Plunder the Trollshaws");
    expect(spell).toBeTruthy();
    const copyAction = filterActions(legalActionsForPlayer(cast, "user"), "cast-spell")
      .find((x) => x.cardId === "reverb" && (x.targets || []).some((t) => t.id === spell.id));
    expect(copyAction).toBeTruthy();
    const s = settle(dispatchAction(cast, copyAction));
    // 1 (the copy) + 2 (the flashbacked original) = 3 cards drawn; Reverberate left the hand.
    expect(zones(s)).toEqual({ hand: 3, library: 7, graveyard: ["Reverberate"], exile: ["Plunder the Trollshaws"], stack: 0 });
  });
});
