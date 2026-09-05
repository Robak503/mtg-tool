/**
 * BELIEVE IT! FILLS — POD-SIM THREE · BI-3 (2026-09-05): Force of Despair + Sea Gate Restoration.
 *
 * Force of Despair — "If it's not your turn, you may exile a black card from your hand rather than pay this spell's mana
 * cost. Destroy all creatures that entered this turn." The mass destroy narrowed by the shared entered-this-turn
 * restriction; the not-your-turn pitch was already modeled and composes.
 * Sea Gate Restoration — "Draw cards equal to the number of cards in your hand plus one. You have no maximum hand size for
 * the rest of the game." A hand-count-plus draw, and the rest-of-game rider as a FLAG atom the cleanup step reads
 * (the old clause-level strip predates cleanup discard).
 *
 * Mutation-checked: see the run ledger (docs-sk50).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution, cleanupDiscardExcess } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FORCE = { id: "fod", name: "Force of Despair", type: "Instant", mana: "{1}{B}{B}", cmc: 3, colors: ["B"], oracle: "If it's not your turn, you may exile a black card from your hand rather than pay this spell's mana cost.\nDestroy all creatures that entered this turn." };
const SEAGATE = { id: "sgr", name: "Sea Gate Restoration", type: "Sorcery", mana: "{4}{U}{U}{U}", cmc: 7, colors: ["U"], oracle: "Draw cards equal to the number of cards in your hand plus one. You have no maximum hand size for the rest of the game." };
const BLACK = { id: "blk", name: "Dark Ritual", type: "Instant", mana: "{B}", cmc: 1, colors: ["B"], oracle: "Add {B}{B}{B}." };
const filler = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}`, type: "Sorcery", cmc: 1 }));
const perm = (id, controller, name, enteredOnTurn) => ({ ...createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Beast", power: 3, toughness: 3, oracle: "" }, controller, summoningSick: false }), enteredOnTurn });
function state({ hand = [], userBf = [], aiBf = [], userPool = {}, userLib = [], active = "user", turn = 5 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand, battlefield: userBf, library: userLib, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
}
const castsOf = (s, id) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === id);
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const alive = (s, pid) => s.players[pid].battlefield.map((p) => p.card.name).sort();

describe("parse + classify", () => {
  it("Force is a restricted mass destroy; Sea Gate is a hand-plus-one draw followed by the no-max-hand-size flag; both native-spell", () => {
    const f = parseEffectProgram(FORCE); const g = parseEffectProgram(SEAGATE);
    const row = { force: f?.atoms, seaGate: g?.atoms, tiers: [classifyCard({ ...FORCE, keywords: [] }), classifyCard({ ...SEAGATE, keywords: [] })] };
    console.log("  WITNESS bi3Parse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.force).toEqual([{ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "enteredThisTurn" }] }]);
    expect(row.seaGate).toEqual([{ op: "draw", amountCount: { kind: "cardsInHand", plus: 1 }, targetType: null }, { op: "no-max-hand-size-game", targetType: null }]);
    expect(row.tiers).toEqual(["native-spell", "native-spell"]);
  });
});

describe("Force of Despair", () => {
  it("destroys ONLY the creatures that entered this turn — theirs and mine — and leaves the older ones", () => {
    const s = state({ hand: [FORCE], userPool: { B: 3 }, turn: 5,
      userBf: [perm("oldbear", "user", "Old Bear", 2), perm("newbear", "user", "New Bear", 5)],
      aiBf: [perm("oldogre", "ai", "Old Ogre", 3), perm("newogre", "ai", "New Ogre", 5)] });
    const after = settle(dispatchAction(s, castsOf(s, "fod")[0]));
    const row = { mine: alive(after, "user"), theirs: alive(after, "ai") };
    console.log("  WITNESS forceDespair", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.mine).toEqual(["Old Bear"]);
    expect(row.theirs).toEqual(["Old Ogre"]);
  });

  it("the pitch composes: on the OPPONENT's turn with no mana it is castable by exiling a black card; on my own turn with no mana it is not", () => {
    const theirs = state({ hand: [FORCE, BLACK], active: "ai", aiBf: [perm("newogre", "ai", "New Ogre", 5)] });
    const mine = state({ hand: [FORCE, BLACK], active: "user", aiBf: [perm("newogre", "ai", "New Ogre", 5)] });
    const row = { onTheirs: castsOf(theirs, "fod").length, onMine: castsOf(mine, "fod").length };
    console.log("  WITNESS forcePitch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.onTheirs).toBeGreaterThan(0);
    expect(row.onMine).toBe(0);
  });
});

describe("Sea Gate Restoration", () => {
  it("with three other cards in hand it draws FOUR (the spell itself is on the stack); the flag is set and cleanup keeps every card for the rest of the game", () => {
    const s = state({ hand: [SEAGATE, ...filler("h", 3)], userPool: { U: 3, C: 4 }, userLib: filler("L", 10) });
    const after = settle(dispatchAction(s, castsOf(s, "sgr")[0]));
    const u = after.players.user;
    const big = { ...after, players: { ...after.players, user: { ...u, hand: [...u.hand, ...filler("x", 6)] } } };
    const row = { hand: u.hand.length, library: u.library.length, flag: !!u.noMaxHandSizeForGame, excessWithFlag: cleanupDiscardExcess(big, "user"), excessWithout: cleanupDiscardExcess({ ...big, players: { ...big.players, user: { ...big.players.user, noMaxHandSizeForGame: false } } }, "user") };
    console.log("  WITNESS seaGate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.hand).toBe(7);
    expect(row.library).toBe(6);
    expect(row.flag).toBe(true);
    expect(row.excessWithFlag).toBe(0);
    expect(row.excessWithout).toBe(6);
  });
});
