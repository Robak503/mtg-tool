/**
 * priestOfForgottenGods.test.js — PRIEST OF FORGOTTEN GODS (the play-weighted program, EDHREC #1391):
 *
 *   "{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You
 *    add {B}{B} and draw a card. (Activate only as an instant.)"
 *
 * The one line was unread on three counts: the effect (parser.matchEachTargetPlayerLoseSacrifice — the life loss on an any-number
 * player slot, every subset of the players offered, CR 601.2c, 115.1; the edict bound to exactly those players, each choosing their own
 * creature, CR 701.21a, in APNAP order, CR 101.4; then "you add {B}{B} and draw a card"); the ability being no mana ability because it
 * may have targets (CR 605.1a — abilities.js' targeted-add rule, Deathrite Shaman's); and the counted sacrifice, whose permanents are a
 * PERSON's choice (CR 602.2b, 601.2h — legalChoices' countedChoicesFor: one offer per set for a person's seat, the house pick for every
 * other seat). Its rulings: it may be activated with no targets and still adds {B}{B} and draws; it uses the stack and can be responded
 * to; a target who can't sacrifice a creature still loses 2 life.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { autoPickSacrificeCandidate, resolveSacrificeChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const PRIEST = {"name":"Priest of Forgotten Gods","type":"Creature — Human Cleric","mana":"{1}{B}","oracle":"{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and draw a card. (Activate only as an instant.)","layout":"normal","cmc":2,"power":"1","toughness":"2","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1391
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const SIGN_IN_BLOOD = {"name":"Sign in Blood","type":"Sorcery","mana":"{B}{B}","oracle":"Target player draws two cards and loses 2 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #233
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #—

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (pid) => Array.from({ length: 4 }, (_, i) => ({ ...SWAMP, id: `lib${i}-${pid}` }));
/** `seat` active with priority in its precombat main; the person plays the user seat; `pod` a four-seat Commander pod. */
function table({ seat = "user", boards = {}, hands = {}, human = true, pod = false } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: hands[pid] || [], library: lib(pid), manaPool: { ...EMPTY } };
  }
  return { ...g, ...(human ? { humanSeats: ["user"] } : {}), turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const flush = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });
const priestOffers = (s, seat) => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "priest");
const offer = (s, seat, targets, sac) => {
  const want = [...targets].sort().join("+");
  const wantSac = [...sac].sort().join("+");
  const a = priestOffers(s, seat).find((x) => (x.targets || []).map((t) => t.id).sort().join("+") === want && [...(x.sacCountIds || [])].sort().join("+") === wantSac);
  expect(a, `no offer targeting [${want}] sacrificing [${wantSac}]`).toBeTruthy();
  return a;
};
const ids = (s, seat, zone = "battlefield") => (s.players[seat][zone] || []).map((x) => x.id).sort();
/** Resolve the stack; an AI seat's sacrifice choice is answered by the driver's own pick (autoPickSacrificeCandidate), a person's stops it. */
const resolveAll = (s0) => {
  let s = s0;
  for (let i = 0; i < 12 && ((s.stack || []).length || s.pendingChoice); i++) {
    if (s.pendingChoice) {
      if (s.pendingChoice.kind !== "sacrifice-choice" || s.pendingChoice.controller === "user") break;
      s = flush(finalizeStackResolution(resolveSacrificeChoice(s, autoPickSacrificeCandidate(s, s.pendingChoice))));
      continue;
    }
    s = flush(finalizeStackResolution(resolveTopOfStack(s)));
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return s;
};

describe("the card", () => {
  it("⭐ native: its one ability — no mana ability (it may have targets, CR 605.1a), the whole effect HIGH", () => {
    expect(isNativeTier(classifyCard(PRIEST))).toBe(true);
    const [ab] = parseActivatedAbilities(PRIEST);
    expect({ isManaEffect: ab.isManaEffect, modeled: ab.modeled, sacCount: ab.sacCount, tapSelf: ab.tapSelf }).toEqual({ isManaEffect: false, modeled: true, sacCount: { type: "creature", count: 2, other: true }, tapSelf: true });
    expect(ab.program.atoms).toEqual([
      { op: "lose-life", amount: 2, who: "target", targetType: "player", minTargets: 0, maxTargets: 99, anyNumber: true },
      { op: "sacrifice", what: "creature", bindPreviousTargets: true },
      { op: "add-mana", mana: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 }, targetType: null },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
});

describe("the person's Priest", () => {
  const board = () => table({ boards: {
    user: [on("user", "priest", PRIEST), on("user", "elves", ELVES), on("user", "bears", BEARS), on("user", "giant", GIANT)],
    ai: [on("ai", "abears", BEARS), on("ai", "agiant", GIANT)],
  } });
  it("⭐ the person chooses WHICH two creatures pay: every pair of the three is offered, beside every subset of the players (the empty one included)", () => {
    const offers = priestOffers(board(), "user");
    const pairs = [...new Set(offers.map((a) => [...a.sacCountIds].sort().join("+")))].sort();
    const rows = [...new Set(offers.map((a) => (a.targets || []).map((t) => t.id).sort().join("+")))].sort();
    expect({ pairs, rows, n: offers.length }).toEqual({ pairs: ["bears+elves", "bears+giant", "elves+giant"], rows: ["", "ai", "ai+user", "user"], n: 12 });
    expect(offers.some((a) => a.sacCountIds.includes("priest"))).toBe(false); // "other" — never the Priest itself
  });
  it("⭐ sacrifices the Bears and the Giant (not the house's least valuable pair) targeting the AI: it uses the stack — nothing yet; then the AI loses 2 and sacrifices its Bears (its choice), the user adds {B}{B} and draws lib0-user", () => {
    const s0 = board();
    const activated = dispatchAction(s0, offer(s0, "user", ["ai"], ["bears", "giant"]));
    expect({ stack: activated.stack.length, B: activated.players.user.manaPool.B, userBoard: ids(activated, "user"), userGy: ids(activated, "user", "graveyard"), tapped: activated.players.user.battlefield.find((p) => p.id === "priest").tapped })
      .toEqual({ stack: 1, B: 0, userBoard: ["elves", "priest"], userGy: ["c-bears", "c-giant"], tapped: true });
    const done = resolveAll(activated);
    expect({ aiLife: done.players.ai.life, aiBoard: ids(done, "ai"), aiGy: ids(done, "ai", "graveyard"), B: done.players.user.manaPool.B, hand: ids(done, "user", "hand"), userLife: done.players.user.life })
      .toEqual({ aiLife: s0.players.ai.life - 2, aiBoard: ["agiant"], aiGy: ["c-abears"], B: 2, hand: ["lib0-user"], userLife: s0.players.user.life });
  });
  it("⭐ no targets (its ruling): still {B}{B} and a card; nobody loses life or sacrifices", () => {
    const s0 = board();
    const done = resolveAll(dispatchAction(s0, offer(s0, "user", [], ["elves", "bears"])));
    expect({ aiLife: done.players.ai.life, aiBoard: ids(done, "ai"), B: done.players.user.manaPool.B, hand: ids(done, "user", "hand") })
      .toEqual({ aiLife: s0.players.ai.life, aiBoard: ["abears", "agiant"], B: 2, hand: ["lib0-user"] });
  });
  it("⭐ a target with no creature (its ruling): the AI still loses 2 life", () => {
    const s0 = table({ boards: { user: [on("user", "priest", PRIEST), on("user", "elves", ELVES), on("user", "bears", BEARS)], ai: [] } });
    const done = resolveAll(dispatchAction(s0, offer(s0, "user", ["ai"], ["elves", "bears"])));
    expect({ aiLife: done.players.ai.life, B: done.players.user.manaPool.B }).toEqual({ aiLife: s0.players.ai.life - 2, B: 2 });
  });
  it("⭐ the {B}{B} is the user's to spend: Sign in Blood is cast with it after the ability resolves", () => {
    const s0 = { ...board(), players: { ...board().players, user: { ...board().players.user, hand: [{ ...SIGN_IN_BLOOD, id: "h-sib" }] } } };
    const done = resolveAll(dispatchAction(s0, offer(s0, "user", [], ["elves", "bears"])));
    const cast = legalActionsForPlayer(done, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-sib" && a.targets?.[0]?.id === "ai");
    expect(cast, "Sign in Blood is not castable with the {B}{B}").toBeTruthy();
    const after = resolveAll(dispatchAction(done, cast));
    expect({ B: after.players.user.manaPool.B, aiHand: ids(after, "ai", "hand").length }).toEqual({ B: 0, aiHand: 2 });
  });
  it("⭐ a pod: targets ai1 and ai3 — each loses 2 and sacrifices its only creature; ai2 is untouched", () => {
    const s0 = table({ pod: true, boards: {
      user: [on("user", "priest", PRIEST), on("user", "elves", ELVES), on("user", "bears", BEARS)],
      ai1: [on("ai1", "b1", BEARS)], ai2: [on("ai2", "b2", BEARS)], ai3: [on("ai3", "b3", BEARS)],
    } });
    const done = resolveAll(dispatchAction(s0, offer(s0, "user", ["ai1", "ai3"], ["elves", "bears"])));
    expect({ l1: done.players.ai1.life, l2: done.players.ai2.life, l3: done.players.ai3.life, b1: ids(done, "ai1"), b2: ids(done, "ai2"), b3: ids(done, "ai3") })
      .toEqual({ l1: s0.players.ai1.life - 2, l2: s0.players.ai2.life, l3: s0.players.ai3.life - 2, b1: [], b2: ["b2"], b3: [] });
  });
  it("⭐ activate only as an instant: offered on the AI's turn while the user holds priority", () => {
    const s0 = { ...board(), activePlayer: "ai", priorityHolder: "user", phase: "combat", step: "declare-attackers" };
    expect(priestOffers(s0, "user").length).toBe(12);
  });
  it("control: a summoning-sick Priest ({T}) and a Priest with one other creature are not offered", () => {
    const sick = table({ boards: { user: [on("user", "priest", PRIEST, { summoningSick: true }), on("user", "elves", ELVES), on("user", "bears", BEARS)] } });
    const lonely = table({ boards: { user: [on("user", "priest", PRIEST), on("user", "elves", ELVES)] } });
    expect({ sick: priestOffers(sick, "user").length, lonely: priestOffers(lonely, "user").length }).toEqual({ sick: 0, lonely: 0 });
  });
});

describe("the AI's Priest", () => {
  const board = () => table({ seat: "ai", boards: {
    ai: [on("ai", "priest", PRIEST), on("ai", "elves", ELVES), on("ai", "bears", BEARS), on("ai", "giant", GIANT)],
    user: [on("user", "ubears", BEARS), on("user", "ugiant", GIANT)],
  } });
  it("⭐ a seat no person plays: one sacrifice per row, the house's two least valuable (Elves and Bears), never the Giant", () => {
    const offers = priestOffers(board(), "ai");
    expect({ n: offers.length, pairs: [...new Set(offers.map((a) => [...a.sacCountIds].sort().join("+")))] }).toEqual({ n: 4, pairs: ["bears+elves"] });
  });
  it("⭐ the AI's Priest targets the user: the person chooses which of their creatures to sacrifice (they keep the Bears)", () => {
    const s0 = board();
    const asked = flush(finalizeStackResolution(resolveTopOfStack(dispatchAction(s0, offer(s0, "ai", ["user"], ["elves", "bears"])))));
    expect({ kind: asked.pendingChoice?.kind, controller: asked.pendingChoice?.controller, cands: (asked.pendingChoice?.candidates || []).map((c) => c.id).sort(), userLife: asked.players.user.life })
      .toEqual({ kind: "sacrifice-choice", controller: "user", cands: ["ubears", "ugiant"], userLife: s0.players.user.life - 2 });
    const done = resolveAll(resolveSacrificeChoice(asked, "ugiant"));
    expect({ userBoard: ids(done, "user"), aiB: done.players.ai.manaPool.B, aiHand: ids(done, "ai", "hand") }).toEqual({ userBoard: ["ubears"], aiB: 2, aiHand: ["lib0-ai"] });
  });
  it("the default AI holds the activation (every AI activation picker spends no counted sacrifice): pickAction takes no Priest activation", () => {
    const s = board();
    const offered = legalActionsForPlayer(s, "ai");
    expect(offered.filter((a) => a.kind === "activate-ability" && a.permanentId === "priest").length).toBe(4); // offered: one per row
    const pick = pickAction(s, "ai", offered);
    expect(pick?.permanentId === "priest").toBe(false);
  });
});
