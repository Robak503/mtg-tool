/**
 * SILENCE — the play-weighted program, P·31 (EDHREC #412).
 *   "Your opponents can't cast spells this turn."
 *
 * Permission Denied's turn-stamped cast lock (SHELF-85 S11, effects/atoms/misc.js applyOpponentsCastLockTurn) with the filter
 * "all": legalChoices' shared cast builder (the one source of every cast action) refuses every card for a locked seat while the
 * stamp's turn is the current one, and the stamp self-expires with the turn. The controller is untouched, and so is everything
 * that isn't casting a spell.
 *
 * Fix riding along: the lock REPLACED a seat's existing same-turn lock, so an opponent's own Irencrag Feat limit ("You can cast
 * only one more spell this turn") vanished the moment Ranger-Captain of Eos or Permission Denied locked them. It merges now.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); each cast or activation run for real (legal action → dispatch).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SILENCE = { name: "Silence", type: "Instant", mana: "{W}", cmc: 1, keywords: [], oracle: "Your opponents can't cast spells this turn." };
const RANGER = { name: "Ranger-Captain of Eos", type: "Creature — Human Soldier Ranger", mana: "{1}{W}{W}", cmc: 3, power: "3", toughness: "3", keywords: [], oracle: "When this creature enters, you may search your library for a creature card with mana value 1 or less, reveal it, put it into your hand, then shuffle.\nSacrifice this creature: Your opponents can't cast noncreature spells this turn." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const VIPER = { name: "Ambush Viper", type: "Creature — Snake", mana: "{1}{G}", cmc: 2, power: "2", toughness: "1", keywords: ["Flash", "Deathtouch"], oracle: "Flash\nDeathtouch" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

const P = (id, ctrl, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false });
function board({ user = [], userHand = [], userPool = {}, aiLock = null, aiCast = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    ...(aiLock ? { castLocksThisTurn: { ai: aiLock } } : {}),
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userPool }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...s.players.ai, hand: [{ ...BOLT, id: "bolt" }, { ...VIPER, id: "viper" }], manaPool: { ...s.players.ai.manaPool, R: 1, G: 2 }, spellsCastThisTurn: aiCast, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
const casts = (s, pid) => [...new Set(filterActions(legalActionsForPlayer({ ...s, priorityHolder: pid }, pid), "cast-spell").map((a) => a.cardId))].sort();
const play = (s, pick) => resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find(pick)));

describe("parse + classify", () => {
  it("the all-spells form of the lock; Silence classifies native-spell", () => {
    expect(parseEffectClause("your opponents can't cast spells this turn", "Instant").atoms).toEqual([{ op: "opponents-cast-lock-turn", filter: "all", targetType: null }]);
    expect(classifyCard(SILENCE)).toBe("native-spell");
  });
});

describe("Silence — your opponents can't cast spells this turn", () => {
  it("⭐ once it resolves, an opponent may cast nothing this turn (instant or flash creature); you still may; next turn they may again", () => {
    const s0 = board({ userHand: [{ ...SILENCE, id: "silence" }, { ...BEARS, id: "ubears" }], userPool: { W: 1, G: 2 } });
    const s = play(s0, (a) => a.kind === "cast-spell" && a.cardId === "silence");
    const nextTurn = { ...s, turn: 5, activePlayer: "ai", priorityHolder: "ai" };
    const row = { before: casts(s0, "ai"), after: casts(s, "ai"), you: casts(s, "user"), theirNextTurn: casts(nextTurn, "ai") };
    console.log("  WITNESS silence", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ before: ["bolt", "viper"], after: [], you: ["ubears"], theirNextTurn: ["bolt", "viper"] });
  });
});

describe("the lock merges into a seat's same-turn lock (the fix)", () => {
  it("Ranger-Captain's noncreature lock leaves a flash creature castable — but not past the seat's own one-more-spell limit", () => {
    const sac = (s) => play(s, (a) => a.kind === "activate-ability" && a.permanentId === "ranger");
    const plain = sac(board({ user: [P("ranger", "user", RANGER)] }));
    // Synthetic: the opponent's own Irencrag Feat limit this turn ("only one more spell"), already spent (one cast since).
    const limited = sac(board({ user: [P("ranger", "user", RANGER)], aiLock: { turn: 4, spellLimit: { spellsCastAtLock: 0, more: 1 } }, aiCast: 1 }));
    // A lock left from an EARLIER turn is spent: it never merges into this turn's (its old limit would forbid a legal cast).
    const stale = sac(board({ user: [P("ranger", "user", RANGER)], aiLock: { turn: 3, spellLimit: { spellsCastAtLock: 0, more: 1 } }, aiCast: 1 }));
    expect({ plain: casts(plain, "ai"), limited: casts(limited, "ai"), lock: limited.castLocksThisTurn.ai, stale: casts(stale, "ai") })
      .toEqual({ plain: ["viper"], limited: [], lock: { turn: 4, spellLimit: { spellsCastAtLock: 0, more: 1 }, noncreature: true }, stale: ["viper"] });
  });
});
