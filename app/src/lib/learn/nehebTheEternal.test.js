/**
 * nehebTheEternal.test.js — NEHEB, THE ETERNAL (the play-weighted program, EDHREC #1195):
 *
 *   "Afflict 3 (Whenever this creature becomes blocked, defending player loses 3 life.)
 *    At the beginning of each of your postcombat main phases, add {R} for each 1 life your opponents have lost this turn."
 *
 * The second line was the one unread, on two counts: the phase trigger's "each of your postcombat main phases" (triggerScheduler —
 * the secondMain event, fired at the beginning of every postcombat main, an additional one included, CR 505.1a), and the count "for
 * each 1 life your opponents have lost this turn" (parseCountSource's `opponentsLifeLostThisTurn` → countForSpec: every opponent's
 * lifeLostThisTurn ledger — damage, paid life and drains, CR 119.3, 119.4, 120.3a — plus the life lost this turn by an opponent who
 * has since left the game, playerLeavesGame's `departedLifeLostThisTurn`). Its rulings: the life LOST counts, not the net change (an
 * opponent who lost 2 and gained 8 still gives {R}{R}); a player who lost life and then lost the game still counts; the ability uses
 * the stack (it isn't a mana ability, CR 605.1b); Neheb gone before the postcombat main — nothing; each postcombat main triggers.
 * The mana is the controller's to spend in that phase; it empties as the phase ends (CR 106.4, 500.4).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { removePlayerFromGame } from "./playerLeavesGame.js";

beforeEach(() => _resetIdsForTests());

const NEHEB = {"name":"Neheb, the Eternal","type":"Legendary Creature — Zombie Minotaur Warrior","mana":"{3}{R}{R}","oracle":"Afflict 3 (Whenever this creature becomes blocked, defending player loses 3 life.)\nAt the beginning of each of your postcombat main phases, add {R} for each 1 life your opponents have lost this turn.","layout":"normal","cmc":5,"power":"4","toughness":"6","loyalty":null,"keywords":["Afflict"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1195
const LAVA_SPIKE = {"name":"Lava Spike","type":"Sorcery — Arcane","mana":"{R}","oracle":"Lava Spike deals 3 damage to target player or planeswalker.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #12524
const REVITALIZE = {"name":"Revitalize","type":"Instant","mana":"{1}{W}","oracle":"You gain 3 life.\nDraw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #4234
const RELENTLESS = {"name":"Relentless Assault","type":"Sorcery","mana":"{2}{R}{R}","oracle":"Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1566
const NIGHTS_WHISPER = {"name":"Night's Whisper","type":"Sorcery","mana":"{1}{B}","oracle":"You draw two cards and lose 2 life.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #182
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (pid) => Array.from({ length: 6 }, (_, i) => ({ ...MOUNTAIN, id: `lib${i}-${pid}` }));
/** `seat` active in its precombat main; `pod` a four-seat Commander pod. */
function table({ seat = "user", boards = {}, hands = {}, pools = {}, life = {}, pod = false } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: hands[pid] || [], library: lib(pid),
      manaPool: { ...EMPTY, ...(pools[pid] || {}) }, ...(life[pid] != null ? { life: life[pid] } : {}) };
  }
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
const cast = (s, seat, cardId, pred = () => true) => offered(legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === cardId && pred(a)), `casting ${cardId}`);
/** Resolve the stack (flushing triggers on the way). */
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 20 && ((s.stack || []).length || (s.pendingTriggers || []).length) && !s.pendingChoice; i++) {
    s = (s.pendingTriggers || []).length ? flushTriggers(s, { chooseTargets: chooseTriggerTargets }) : flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  }
  const crash = (s.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return s;
}
/** Step forward (resolving what each step puts on the stack) until `phase`/`step`, at most 20 steps; the state on arrival, resolved. */
function stepTo(s0, phase, step = "main") {
  let s = s0;
  for (let i = 0; i < 20 && !(s.phase === phase && s.step === step); i++) s = settle(nextStep(s));
  expect({ phase: s.phase, step: s.step }).toEqual({ phase, step });
  return s;
}
/** The trigger's own stack object as the postcombat main begins (before it resolves), for "it uses the stack". */
function arriveUnresolved(s0, phase = "postcombat-main") {
  let s = s0;
  for (let i = 0; i < 20 && !(s.phase === phase && s.step === "main"); i++) s = settle(nextStep(s));
  return s;
}
const red = (s, seat = "user") => s.players[seat].manaPool.R;

describe("the card", () => {
  it("⭐ native: afflict, and the postcombat-main trigger that adds {R} per 1 life the opponents have lost this turn", () => {
    expect(isNativeTier(classifyCard(NEHEB))).toBe(true);
    const d = detectTriggers(NEHEB).find((x) => x.event === "secondMain");
    expect({ whose: d?.whose, routes: !!d && triggerRoutesNatively(d) }).toEqual({ whose: "yours", routes: true });
  });
});

describe("the game", () => {
  it("⭐ Lava Spike at the AI precombat (3 life lost) — at the beginning of the postcombat main Neheb's ability goes on the stack and adds {R}{R}{R}, which casts Hill Giant with a Mountain", () => {
    const s0 = table({ boards: { user: [on("user", "neheb", NEHEB), on("user", "mtn", MOUNTAIN)] }, hands: { user: [{ ...LAVA_SPIKE, id: "h-spike" }, { ...HILL_GIANT, id: "h-giant" }] }, pools: { user: { R: 1 } } });
    const spiked = settle(dispatchAction(s0, cast(s0, "user", "h-spike", (a) => a.targets?.[0]?.id === "ai")));
    expect(spiked.players.ai.lifeLostThisTurn).toBe(3);
    const atMain = arriveUnresolved(spiked);
    expect({ phase: atMain.phase, red: red(atMain) }).toEqual({ phase: "postcombat-main", red: 3 });
    const giant = settle(dispatchAction(atMain, cast(atMain, "user", "h-giant")));
    expect({ giant: giant.players.user.battlefield.some((p) => p.card?.name === "Hill Giant"), red: red(giant), mtnTapped: giant.players.user.battlefield.find((p) => p.id === "mtn")?.tapped }).toEqual({ giant: true, red: 0, mtnTapped: true });
  });
  it("⭐ the precombat main adds nothing (the trigger is the postcombat main's), and the mana empties as the postcombat main ends (CR 500.4)", () => {
    const s0 = { ...table({ boards: { user: [on("user", "neheb", NEHEB)] }, hands: { user: [{ ...BOLT, id: "h-bolt" }] }, pools: { user: { R: 1 } } }), phase: "beginning", step: "upkeep" };
    const bolted = settle(dispatchAction(s0, cast(s0, "user", "h-bolt", (a) => a.targets?.[0]?.id === "ai")));
    expect(bolted.players.ai.lifeLostThisTurn).toBe(3);
    const main1 = stepTo(bolted, "precombat-main");
    expect(red(main1)).toBe(0);
    const main2 = stepTo(main1, "postcombat-main");
    expect(red(main2)).toBe(3);
    const end = stepTo(main2, "ending", "end");
    expect(red(end)).toBe(0);
  });
  it("⭐ afflict counts: Neheb blocked by the AI's Bears — the AI loses 3 to afflict, and the postcombat main adds {R}{R}{R}", () => {
    const s0 = table({ boards: { user: [on("user", "neheb", NEHEB, { tapped: true })], ai: [on("ai", "bears", BEARS)] } });
    const blocked = { ...s0, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "neheb", attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "bears", blockingPlayer: "ai", attackerId: "neheb" }], _blockTriggersFired: false } };
    const main2 = stepTo(blocked, "postcombat-main");
    expect({ aiLife: main2.players.ai.life, lost: main2.players.ai.lifeLostThisTurn, red: red(main2) }).toEqual({ aiLife: s0.players.ai.life - 3, lost: 3, red: 3 });
  });
  it("⭐ life LOST, not the net change (its ruling): the AI loses 3, then gains 3 (Revitalize) — still {R}{R}{R}", () => {
    const s0 = table({ boards: { user: [on("user", "neheb", NEHEB)] }, hands: { user: [{ ...LAVA_SPIKE, id: "h-spike" }], ai: [{ ...REVITALIZE, id: "h-revit" }] }, pools: { user: { R: 1 }, ai: { W: 1, C: 1 } } });
    const spiked = settle(dispatchAction(s0, cast(s0, "user", "h-spike", (a) => a.targets?.[0]?.id === "ai")));
    const aiTurn = { ...spiked, priorityHolder: "ai" };
    const healed = settle(dispatchAction(aiTurn, cast(aiTurn, "ai", "h-revit")));
    expect(healed.players.ai.life).toBe(s0.players.ai.life);
    expect(red(stepTo({ ...healed, priorityHolder: "user" }, "postcombat-main"))).toBe(3);
  });
  it("⭐ only the opponents' loss: the user's own Night's Whisper (2 life) adds nothing; nobody lost life — nothing", () => {
    const s0 = table({ boards: { user: [on("user", "neheb", NEHEB)] }, hands: { user: [{ ...NIGHTS_WHISPER, id: "h-whisper" }] }, pools: { user: { B: 1, C: 1 } } });
    const whispered = settle(dispatchAction(s0, cast(s0, "user", "h-whisper")));
    expect(whispered.players.user.lifeLostThisTurn).toBe(2);
    expect(red(stepTo(whispered, "postcombat-main"))).toBe(0);
  });
  it("⭐ a pod: ai1 lost 3 and LEFT THE GAME (its ruling — it still counts), ai2 lost 3: {R} × 6", () => {
    const s0 = table({ pod: true, boards: { user: [on("user", "neheb", NEHEB)] }, hands: { user: [{ ...LAVA_SPIKE, id: "h-spike1" }, { ...LAVA_SPIKE, id: "h-spike2" }] }, pools: { user: { R: 2 } }, life: { ai1: 3 } });
    let s = settle(dispatchAction(s0, cast(s0, "user", "h-spike1", (a) => a.targets?.[0]?.id === "ai1")));
    s = settle(dispatchAction(s, cast(s, "user", "h-spike2", (a) => a.targets?.[0]?.id === "ai2")));
    expect(s.players.ai1.life).toBe(0);
    s = removePlayerFromGame(s, "ai1"); // the elimination the session runs as the loss is checked (CR 104.3b, 800.4a)
    expect(s.players.ai1).toBeUndefined();
    expect(red(stepTo(s, "postcombat-main"))).toBe(6);
  });
  it("⭐ only this turn's departure (pw27's review, F2): after ai1 left the game on the user's turn, the user's NEXT postcombat main adds nothing — the earlier turn's departed record is stale", () => {
    const s0 = table({ pod: true, boards: { user: [on("user", "neheb", NEHEB)] }, hands: { user: [{ ...LAVA_SPIKE, id: "h-spike1" }] }, pools: { user: { R: 1 } }, life: { ai1: 3 } });
    let s = settle(dispatchAction(s0, cast(s0, "user", "h-spike1", (a) => a.targets?.[0]?.id === "ai1")));
    s = removePlayerFromGame(s, "ai1");
    const first = s.turn;
    expect(s.departedLifeLostThisTurn).toEqual([{ playerId: "ai1", amount: 3, turn: first }]);
    s = stepTo(s, "postcombat-main");
    expect(red(s)).toBe(3);
    for (let i = 0; i < 60 && !(s.activePlayer === "user" && s.turn > first && s.phase === "postcombat-main" && s.step === "main"); i++) s = settle(nextStep(s));
    expect({ active: s.activePlayer, later: s.turn > first, phase: s.phase, departed: s.departedLifeLostThisTurn, red: red(s) })
      .toEqual({ active: "user", later: true, phase: "postcombat-main", departed: [{ playerId: "ai1", amount: 3, turn: first }], red: 0 });
  });
  it("⭐ each postcombat main (Relentless Assault): the additional main adds the turn's total again", () => {
    const s0 = table({ boards: { user: [on("user", "neheb", NEHEB)] }, hands: { user: [{ ...LAVA_SPIKE, id: "h-spike" }, { ...RELENTLESS, id: "h-assault" }] }, pools: { user: { R: 1 } } });
    const spiked = settle(dispatchAction(s0, cast(s0, "user", "h-spike", (a) => a.targets?.[0]?.id === "ai")));
    const main2 = stepTo(spiked, "postcombat-main");
    expect(red(main2)).toBe(3);
    const fed = { ...main2, players: { ...main2.players, user: { ...main2.players.user, manaPool: { ...EMPTY, R: 2, C: 2 } } } };
    const assault = settle(dispatchAction(fed, cast(fed, "user", "h-assault")));
    expect((assault.extraPhases || []).length).toBe(1);
    let s = settle(nextStep(assault));
    expect({ phase: s.phase, step: s.step }).toEqual({ phase: "combat", step: "beginning-of-combat" });
    s = stepTo(s, "postcombat-main");
    expect(red(s)).toBe(3);
  });
  it("⭐ \"your\" postcombat main: the AI's turn adds nothing to the user", () => {
    const s0 = table({ seat: "ai", boards: { user: [on("user", "neheb", NEHEB)] }, hands: { ai: [] } });
    const lost = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, life: s0.players.ai.life - 4, lifeLostThisTurn: 4 } } };
    const main2 = stepTo(lost, "postcombat-main");
    expect({ user: red(main2, "user"), ai: red(main2, "ai") }).toEqual({ user: 0, ai: 0 });
  });
  it("⭐ the default AI's Neheb: the user lost 3 this turn; the AI's postcombat main adds {R}{R}{R} to the AI, and the AI spends it casting Hill Giant", () => {
    const s0 = table({ seat: "ai", boards: { ai: [on("ai", "neheb", NEHEB), on("ai", "mtn", MOUNTAIN)] }, hands: { ai: [{ ...LAVA_SPIKE, id: "h-spike" }, { ...HILL_GIANT, id: "h-giant" }] }, pools: { ai: { R: 1 } } });
    const spiked = settle(dispatchAction(s0, cast(s0, "ai", "h-spike", (a) => a.targets?.[0]?.id === "user")));
    const main2 = stepTo(spiked, "postcombat-main");
    expect(red(main2, "ai")).toBe(3);
    const pick = pickAction(main2, "ai", legalActionsForPlayer(main2, "ai"));
    expect({ kind: pick?.kind, card: pick?.cardId }).toEqual({ kind: "cast-spell", card: "h-giant" });
    const giant = settle(dispatchAction(main2, pick));
    expect({ giant: giant.players.ai.battlefield.some((p) => p.card?.name === "Hill Giant"), red: red(giant, "ai") }).toEqual({ giant: true, red: 0 });
  });
  it("control: Neheb gone before the postcombat main begins (its ruling) — nothing", () => {
    const s0 = table({ boards: { user: [on("user", "mtn", MOUNTAIN)] }, hands: { user: [{ ...LAVA_SPIKE, id: "h-spike" }] }, pools: { user: { R: 1 } } });
    const spiked = settle(dispatchAction(s0, cast(s0, "user", "h-spike", (a) => a.targets?.[0]?.id === "ai")));
    expect(red(stepTo(spiked, "postcombat-main"))).toBe(0);
  });
});
