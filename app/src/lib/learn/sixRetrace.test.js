/**
 * sixRetrace.test.js — SIX (the play-weighted program, EDHREC #588):
 *
 *   "Reach
 *    Whenever Six attacks, mill three cards. You may put a land card from among them into your hand.
 *    During your turn, nonland permanent cards in your graveyard have retrace. (You may cast permanent cards from your graveyard by
 *    discarding a land card in addition to paying their other costs.)"
 *
 * Reach and the attack trigger already read; the grant had no lane. Granted retrace (CR 702.81a — "You may cast this card from your
 * graveyard by discarding a land card as an additional cost to cast it"): on its controller's own turn, each nonland permanent card
 * in their graveyard (front face, CR 712.8a) is offered through the shared cast builder from the graveyard — its mana cost and timing
 * (a flash creature at instant speed, the rest at sorcery speed) — plus one land card discarded from hand (CR 601.2f–h, 701.9a).
 * Its bundled ruling: a spell cast with retrace that is countered goes back to the graveyard and may be retraced again.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkAttackTriggers } from "./triggers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SIX = {"name":"Six","type":"Legendary Creature — Treefolk","mana":"{2}{G}","oracle":"Reach\nWhenever Six attacks, mill three cards. You may put a land card from among them into your hand.\nDuring your turn, nonland permanent cards in your graveyard have retrace. (You may cast permanent cards from your graveyard by discarding a land card in addition to paying their other costs.)","layout":"normal","cmc":3,"power":"2","toughness":"4","loyalty":null,"keywords":["Reach","Mill"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #588
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const RAIDERS = {"name":"Mons's Goblin Raiders","type":"Creature — Goblin","mana":"{R}","oracle":"","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #24664
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","oracle":"Destroy target creature.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #861
const VIPER = {"name":"Ambush Viper","type":"Creature — Snake","mana":"{1}{G}","oracle":"Flash\nDeathtouch","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Flash","Deathtouch"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #4832
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #16
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","oracle":"{T}: Add {C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #—
const TOWER = {"name":"Command Tower","type":"Land","mana":"","oracle":"{T}: Add one mana of any color in your commander's color identity.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #2
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const gyCard = (id, card) => ({ ...card, id });
const lib = (seat, cards = []) => [...cards, ...Array.from({ length: 5 }, (_, i) => ({ ...PLAINS, id: `L-${seat}-${i}` }))];
/** `seat`'s main phase (or `phase`/`step`): Six on the battlefield (unless `six: false`), `mountains` untapped Mountains, `hand`, `graveyard`. */
function table({ seat = "user", six = true, mountains = 4, hand = [], graveyard = [], library = [], phase = "precombat-main", step = "main", active = seat, oppBf = [], oppHand = [], bf = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const mine = [...(six ? [on(seat, "six", SIX)] : []), ...Array.from({ length: mountains }, (_, i) => on(seat, `m${i}`, MOUNTAIN)), ...bf];
  const players = { ...g.players,
    [seat]: { ...g.players[seat], battlefield: mine, hand, graveyard, library: lib(seat, library), landsPlayedThisTurn: 1 },
    [opp]: { ...g.players[opp], battlefield: oppBf, hand: oppHand, graveyard: [], library: lib(opp) } };
  return { ...g, turn: 5, phase, step, activePlayer: active, priorityHolder: seat, consecutivePasses: 0, players, stack: [], pendingTriggers: [] };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
const retraces = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell" && a.fromZone === "graveyard" && a.retraceCast);
const names = (cards) => (cards || []).map((c) => c.name).sort();
const named = (s, seat, name) => s.players[seat].battlefield.find((p) => p.card?.name === name);

describe("the card", () => {
  it("⭐ native: reach, the attack trigger and the retrace grant", () => {
    expect(classifyCard(SIX)).toBe("native-mixed");
  });
  it("⭐ Six attacks: three cards milled, and the land among them may be put into the hand", () => {
    const s0 = table({ library: [{ ...FOREST, id: "t-forest" }, { ...GIANT, id: "t-giant" }, { ...MURDER, id: "t-murder" }] });
    const atk = { ...s0, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "six", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    let s = settle(checkAttackTriggers(atk));
    expect(s.pendingChoice?.kind).toBe("optional-effect"); // "You may put a land card from among them into your hand."
    s = settle(resolveOptionalChoice(s, true));
    expect({ hand: names(s.players.user.hand), gy: names(s.players.user.graveyard), lib: s.players.user.library.length }).toEqual({ hand: ["Forest"], gy: ["Hill Giant", "Murder"], lib: 5 });
  });
});

describe("granted retrace", () => {
  it("⭐ on its controller's turn: the Giant is cast from the graveyard, a land card discarded, its mana paid — and it enters", () => {
    const s0 = table({ hand: [{ ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-giant", GIANT)] });
    const offers = retraces(s0);
    expect(offers.map((a) => ({ card: a.cardId, discard: a.retraceCast.discardId, name: a.retraceName }))).toEqual([{ card: "g-giant", discard: "h-forest", name: "retrace: discard Forest" }]);
    const s = settle(dispatchAction(s0, offers[0]));
    expect({ giant: !!named(s, "user", "Hill Giant"), hand: names(s.players.user.hand), gy: names(s.players.user.graveyard), tapped: s.players.user.battlefield.filter((p) => p.card?.name === "Mountain" && p.tapped).length })
      .toEqual({ giant: true, hand: [], gy: ["Forest"], tapped: 4 });
  });
  it("⭐ a basic land is discarded before a nonbasic one", () => {
    const s0 = table({ hand: [{ ...TOWER, id: "h-tower" }, { ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-giant", GIANT)] });
    expect(retraces(s0).map((a) => a.retraceCast.discardId)).toEqual(["h-forest"]);
  });
  it("⛔ no land card in hand: no retrace cast", () => {
    expect(retraces(table({ hand: [{ ...MURDER, id: "h-murder" }], graveyard: [gyCard("g-giant", GIANT)] }))).toEqual([]);
  });
  it("⛔ only nonland permanent cards: not a land card, not an instant", () => {
    const s0 = table({ hand: [{ ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-wastes", WASTES), gyCard("g-murder", MURDER), gyCard("g-stone", MIND_STONE)] });
    expect([...new Set(retraces(s0).map((a) => a.cardId))]).toEqual(["g-stone"]);
  });
  it("⛔ not on an opponent's turn — not even a flash creature", () => {
    const s0 = table({ hand: [{ ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-viper", VIPER), gyCard("g-giant", GIANT)], active: "ai", bf: [on("user", "f0", FOREST)] });
    expect(retraces(s0)).toEqual([]);
  });
  it("⭐ timing is the card's own: in combat on its controller's turn, the flash Viper is offered and the Giant is not", () => {
    const s0 = table({ hand: [{ ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-viper", VIPER), gyCard("g-giant", GIANT)], phase: "combat", step: "declare-blockers", bf: [on("user", "f0", FOREST)] });
    expect(retraces({ ...s0, combat: { attackers: [], blockers: [] } }).map((a) => a.cardId)).toEqual(["g-viper"]);
  });
  it("⛔ Six gone from the battlefield: nothing has retrace", () => {
    expect(retraces(table({ six: false, hand: [{ ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-giant", GIANT)] }))).toEqual([]);
  });
  it("⛔ not enough mana for the card's own cost: not offered (the discard is in addition to its other costs)", () => {
    expect(retraces(table({ mountains: 3, hand: [{ ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-giant", GIANT)] }))).toEqual([]);
  });
  it("⭐ countered, it goes back to the graveyard and may be retraced again (its ruling)", () => {
    const s0 = table({ mountains: 8, hand: [{ ...FOREST, id: "h-f1" }, { ...FOREST, id: "h-f2" }], graveyard: [gyCard("g-giant", GIANT)], oppHand: [{ ...COUNTERSPELL, id: "o-cs" }] });
    expect(retraces(s0).length, "the retrace cast").toBeGreaterThan(0);
    let s = dispatchAction(s0, retraces(s0)[0]);
    s = { ...s, priorityHolder: "ai", players: { ...s.players, ai: { ...s.players.ai, manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } } };
    const counter = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "o-cs");
    s = settle(dispatchAction(s, counter));
    expect({ gy: names(s.players.user.graveyard), again: retraces({ ...s, priorityHolder: "user" }).map((a) => a.cardId) }).toEqual({ gy: ["Forest", "Hill Giant"], again: ["g-giant"] });
  });
});

describe("the default AI", () => {
  it("⭐ a cast from hand comes first (the retrace's land discard is a cost its cast scorer doesn't price); the retrace follows", () => {
    const s0 = table({ seat: "ai", mountains: 5, hand: [{ ...RAIDERS, id: "h-raiders" }, { ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-giant", GIANT)] });
    const p1 = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect({ kind: p1?.kind, cardId: p1?.cardId }).toEqual({ kind: "cast-spell", cardId: "h-raiders" });
    const s1 = settle(dispatchAction(s0, p1));
    const p2 = pickAction(s1, "ai", legalActionsForPlayer(s1, "ai"));
    expect({ kind: p2?.kind, cardId: p2?.cardId, discard: p2?.retraceCast?.discardId }).toEqual({ kind: "cast-spell", cardId: "g-giant", discard: "h-forest" });
  });
  it("⭐ on its own turn with a spare land in hand, it casts the Giant back from its graveyard, discarding the land", () => {
    const s0 = table({ seat: "ai", hand: [{ ...FOREST, id: "h-forest" }], graveyard: [gyCard("g-giant", GIANT)] });
    const pick = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect({ kind: pick?.kind, cardId: pick?.cardId, fromZone: pick?.fromZone, discard: pick?.retraceCast?.discardId }).toEqual({ kind: "cast-spell", cardId: "g-giant", fromZone: "graveyard", discard: "h-forest" });
    const s = settle(dispatchAction(s0, pick));
    expect({ giant: !!named(s, "ai", "Hill Giant"), gy: names(s.players.ai.graveyard) }).toEqual({ giant: true, gy: ["Forest"] });
  });
});
