/**
 * approachOfTheSecondSun.test.js — APPROACH OF THE SECOND SUN (the play-weighted program, EDHREC #979):
 *
 *   "If this spell was cast from your hand and you've cast another spell named Approach of the Second Sun this game, you win the game.
 *    Otherwise, put Approach of the Second Sun into its owner's library seventh from the top and you gain 7 life."
 *
 * One atom (effects/atoms/life.applyApproachWinOrTuck). Cast from your hand: the cast-time fact on the spell's context (`castFromHand`,
 * stripped from a copy — a copy isn't cast, CR 707.10). Another spell of that name cast this game: the controller's game-long tally,
 * counted at the one cast chokepoint (gameState.recordSpellCast — this cast among them). Otherwise the card goes seventh from the top of
 * its owner's library (runProgram.finishSpellResolution — under six cards, or at the bottom of a shorter library) and its controller
 * gains 7 life. Every bundled ruling witnessed: fewer than six cards → the bottom; a countered first Approach still counts; a copy
 * counts as neither (and its own resolution wins nothing); the same card cast again later is "another spell" (CR 400.7); the first may
 * have been cast from anywhere, the second must come from the hand; nothing happens until it resolves (a countered second wins nothing).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, drawCards } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const APPROACH = {"name":"Approach of the Second Sun","type":"Sorcery","mana":"{6}{W}","oracle":"If this spell was cast from your hand and you've cast another spell named Approach of the Second Sun this game, you win the game. Otherwise, put Approach of the Second Sun into its owner's library seventh from the top and you gain 7 life.","layout":"normal","cmc":7,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #979
const SNAPCASTER = {"name":"Snapcaster Mage","type":"Creature — Human Wizard","mana":"{1}{U}","oracle":"Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Flash"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1444
const REVERBERATE = {"name":"Reverberate","type":"Instant","mana":"{R}{R}","oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1418
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #16
const PERSECUTOR = {"name":"Abyssal Persecutor","type":"Creature — Demon","mana":"{2}{B}{B}","oracle":"Flying, trample\nYou can't win the game and your opponents can't lose the game.","layout":"normal","cmc":4,"power":"6","toughness":"6","loyalty":null,"keywords":["Flying","Trample"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #6440
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const POOL = { W: 1, U: 2, B: 0, R: 2, G: 0, C: 6 };
const lib = (n) => Array.from({ length: n }, (_, i) => ({ ...PLAINS, id: `l${i}` }));
/** The user's precombat main: `hand`, `library`, `graveyard`, `bf` permanents, a floating pool; the AI holds `aiHand` with {U}{U}. */
function table({ hand = [{ ...APPROACH, id: "a1" }], library = lib(10), graveyard = [], bf = [], aiHand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...g.players,
    user: { ...g.players.user, life: 20, hand, library, graveyard, battlefield: bf, manaPool: { ...POOL } },
    ai: { ...g.players.ai, life: 20, hand: aiHand, library: lib(5).map((c) => ({ ...c, id: `ai-${c.id}` })), graveyard: [], battlefield: [], manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } },
  };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}
const refill = (s) => ({ ...s, priorityHolder: "user", players: { ...s.players, user: { ...s.players.user, manaPool: { ...POOL } } } });
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
/** The user casts card `id` (from wherever the offer says) and it stays on the stack. */
function castOnly(s, id, pred = () => true) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === id && pred(x));
  expect(a, `no cast of ${id}`).toBeTruthy();
  return flushTriggers(dispatchAction(s, a), { chooseTargets: chooseTriggerTargets });
}
const cast = (s, id, pred) => settle(castOnly(s, id, pred));
const ids = (cards) => (cards || []).map((c) => c.id);

describe("the card", () => {
  it("⭐ native: one atom, the name read off the printed text", () => {
    expect({ tier: classifyCard(APPROACH), atoms: parseEffectProgram(APPROACH)?.atoms })
      .toEqual({ tier: "native-spell", atoms: [{ op: "approach-win-or-tuck", name: "Approach of the Second Sun", fromTop: 7, life: 7, readsCastFromHand: true, targetType: null }] });
  });
});

describe("the first Approach", () => {
  it("⭐ from the hand, the first of the game: no win — it goes seventh from the top (under six cards) and you gain 7 life", () => {
    const s = cast(table(), "a1");
    expect({ won: !!s.players.user.wonGame, life: s.players.user.life, at: ids(s.players.user.library).indexOf("a1"), size: s.players.user.library.length, gy: ids(s.players.user.graveyard), tally: s.players.user.castNamesThisGame })
      .toEqual({ won: false, life: 27, at: 6, size: 11, gy: [], tally: { "Approach of the Second Sun": 1 } });
  });
  it("⭐ its ruling — fewer than six cards in the library: it goes to the bottom", () => {
    const s = cast(table({ library: lib(3) }), "a1");
    expect({ lib: ids(s.players.user.library), life: s.players.user.life }).toEqual({ lib: ["l0", "l1", "l2", "a1"], life: 27 });
  });
  it("⭐ exactly six cards: under all six — seventh from the top, the bottom", () => {
    const s = cast(table({ library: lib(6) }), "a1");
    expect(ids(s.players.user.library).indexOf("a1")).toBe(6);
  });
});

describe("the second Approach", () => {
  it("⭐ its ruling — the same card cast again on a later draw is another spell: cast, drawn seven cards later, cast from the hand again → you win", () => {
    let s = cast(table(), "a1");
    s = drawCards(s, { playerId: "user", count: 7 });
    expect(ids(s.players.user.hand)).toContain("a1");
    s = cast(refill(s), "a1");
    expect({ won: !!s.players.user.wonGame, life: s.players.user.life, gy: ids(s.players.user.graveyard), tally: s.players.user.castNamesThisGame["Approach of the Second Sun"] })
      .toEqual({ won: true, life: 27, gy: ["a1"], tally: 2 });
  });
  it("⭐ two Approaches in hand: the second one cast wins", () => {
    let s = cast(table({ hand: [{ ...APPROACH, id: "a1" }, { ...APPROACH, id: "a2" }] }), "a1");
    s = cast(refill(s), "a2");
    expect({ won: !!s.players.user.wonGame, a2: ids(s.players.user.graveyard) }).toEqual({ won: true, a2: ["a2"] });
  });
  it("⭐ its ruling — a countered first Approach still counts: the AI counters it, the next one wins", () => {
    let s = castOnly(table({ hand: [{ ...APPROACH, id: "a1" }, { ...APPROACH, id: "a2" }], aiHand: [{ ...COUNTERSPELL, id: "cs" }] }), "a1");
    s = { ...s, priorityHolder: "ai" };
    const spell = s.stack.find((o) => o.kind === "spell");
    const c = legalActionsForPlayer(s, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "cs" && (x.targets || []).some((t) => t.id === spell.id));
    expect(c, "Counterspell at the Approach").toBeTruthy();
    s = settle(dispatchAction(s, c));
    expect({ countered: ids(s.players.user.graveyard), life: s.players.user.life }).toEqual({ countered: ["a1"], life: 20 });
    s = cast(refill(s), "a2");
    expect(!!s.players.user.wonGame).toBe(true);
  });
  it("⭐ its ruling — nothing happens until it resolves: a countered second Approach wins nothing", () => {
    let s = cast(table({ hand: [{ ...APPROACH, id: "a1" }, { ...APPROACH, id: "a2" }], aiHand: [{ ...COUNTERSPELL, id: "cs" }] }), "a1");
    s = { ...castOnly(refill(s), "a2"), priorityHolder: "ai" };
    const spell = s.stack.find((o) => o.kind === "spell");
    s = settle(dispatchAction(s, legalActionsForPlayer(s, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "cs" && (x.targets || []).some((t) => t.id === spell.id))));
    expect({ won: !!s.players.user.wonGame, gy: ids(s.players.user.graveyard) }).toEqual({ won: false, gy: ["a2"] });
  });
  it("⭐ its ruling — the first may have been cast from anywhere: from the graveyard with Snapcaster Mage's flashback (no win, 7 life, exiled — CR 702.34a), then the one in hand wins", () => {
    const snap = createPermanent({ id: "snap", card: { ...SNAPCASTER, id: "c-snap" }, controller: "user", summoningSick: false });
    let s = table({ hand: [{ ...APPROACH, id: "a2" }], graveyard: [{ ...APPROACH, id: "a1" }], bf: [snap] });
    s = settle(flushTriggers(checkEnterTriggers(s, snap), { chooseTargets: chooseTriggerTargets }));
    s = cast(refill(s), "a1", (x) => !!x.flashbackCast);
    expect({ won: !!s.players.user.wonGame, life: s.players.user.life, exiled: ids(s.players.user.exile), inLib: ids(s.players.user.library).includes("a1") })
      .toEqual({ won: false, life: 27, exiled: ["a1"], inLib: false });
    s = cast(refill(s), "a2");
    expect(!!s.players.user.wonGame).toBe(true);
  });
  it("⛔ its ruling — the second must be cast from your hand: one cast from the graveyard after one from the hand wins nothing (7 life, exiled)", () => {
    const snap = createPermanent({ id: "snap", card: { ...SNAPCASTER, id: "c-snap" }, controller: "user", summoningSick: false });
    let s = cast(table({ hand: [{ ...APPROACH, id: "a1" }], graveyard: [{ ...APPROACH, id: "a2" }], bf: [snap] }), "a1");
    s = settle(flushTriggers(checkEnterTriggers(refill(s), snap), { chooseTargets: chooseTriggerTargets }));
    s = cast(refill(s), "a2", (x) => !!x.flashbackCast);
    expect({ won: !!s.players.user.wonGame, life: s.players.user.life, tally: s.players.user.castNamesThisGame["Approach of the Second Sun"], exiled: ids(s.players.user.exile) })
      .toEqual({ won: false, life: 34, tally: 2, exiled: ["a2"] });
  });
  it("⭐ its ruling — a copy isn't cast: your Reverberate copy of the second Approach resolves first and wins nothing (7 life, it goes nowhere), then the Approach wins", () => {
    let s = cast(table({ hand: [{ ...APPROACH, id: "a1" }, { ...APPROACH, id: "a2" }, { ...REVERBERATE, id: "rev" }] }), "a1");
    s = castOnly(refill(s), "a2");
    const spell = s.stack.find((o) => o.kind === "spell");
    s = flushTriggers(dispatchAction(s, legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "rev" && (x.targets || []).some((t) => t.id === spell.id))), { chooseTargets: chooseTriggerTargets });
    s = resolveTopOfStack(s); // Reverberate: the copy goes on the stack
    expect(s.stack.filter((o) => o.isCopy).length).toBe(1);
    s = resolveTopOfStack(s); // the copy
    expect({ won: !!s.players.user.wonGame, life: s.players.user.life, libCount: ids(s.players.user.library).filter((x) => x === "a2").length }).toEqual({ won: false, life: 34, libCount: 0 });
    s = settle(s); // the Approach itself
    expect({ won: !!s.players.user.wonGame, tally: s.players.user.castNamesThisGame["Approach of the Second Sun"], a2InGy: ids(s.players.user.graveyard).includes("a2"), a2InLib: ids(s.players.user.library).includes("a2"), request: s.spellResolutionPlacement ?? null })
      .toEqual({ won: true, tally: 2, a2InGy: true, a2InLib: false, request: null }); // the copy's "Otherwise" request died with the copy (the review's F5c)
  });
  it("⛔ a can't-win effect: under your Abyssal Persecutor the second Approach wins nothing and leaves nothing behind (the Persecutor gone later, still no win), and its \"Otherwise\" doesn't happen — no 7 life, to the graveyard", () => {
    const pers = createPermanent({ id: "pers", card: { ...PERSECUTOR, id: "c-pers" }, controller: "user", summoningSick: false });
    let s = cast(table({ hand: [{ ...APPROACH, id: "a1" }, { ...APPROACH, id: "a2" }], bf: [pers] }), "a1");
    s = cast(refill(s), "a2");
    expect({ won: !!s.players.user.wonGame, life: s.players.user.life, gy: ids(s.players.user.graveyard), inLib: ids(s.players.user.library).includes("a2") }).toEqual({ won: false, life: 27, gy: ["a2"], inLib: false });
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(!!gone.players.user.wonGame).toBe(false);
  });
});
