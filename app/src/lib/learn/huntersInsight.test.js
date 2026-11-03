/**
 * huntersInsight.test.js — HUNTER'S INSIGHT (the play-weighted program, EDHREC #1061):
 *
 *   "Choose target creature you control. Whenever that creature deals combat damage to a player or planeswalker this turn, draw
 *    that many cards."
 *
 * Two atoms: `choose-target` (the creature, your own) and `watch-combat-damage-this-turn` bound to it (effects/atoms/delayedTrigger.js):
 * the spell creates a delayed triggered ability (CR 603.7) watching that one permanent until the turn ends. Each time it deals combat
 * damage to a player or a planeswalker this turn (CR 510.2 — each combat damage step is its own event, so a double striker triggers
 * twice), the spell's controller draws that many cards. Another creature's damage, damage to a creature, a blocked creature and a
 * later turn trigger nothing; a creature that left and came back is a new object (CR 400.7).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const INSIGHT = {"name":"Hunter's Insight","type":"Instant","mana":"{2}{G}","oracle":"Choose target creature you control. Whenever that creature deals combat damage to a player or planeswalker this turn, draw that many cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #1061
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)","layout":"normal","cmc":6,"power":"6","toughness":"6","loyalty":null,"keywords":["Trample"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #10474
const ACE = {"name":"Fencing Ace","type":"Creature — Human Soldier","mana":"{1}{W}","oracle":"Double strike (This creature deals both first-strike and regular combat damage.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Double strike"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #14566
const LILIANA = {"name":"Liliana of the Veil","type":"Legendary Planeswalker — Liliana","mana":"{1}{B}{B}","oracle":"+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"3","keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #2988
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ ...FOREST, id: `${pid}-l${i}` }));
/**
 * The person attacks the AI with `attackers` ([id, card, defenderPlaneswalkerId?]) in the declare blockers step, blocked as `blocks`
 * ([blockerId, attackerId]); the person holds priority with Hunter's Insight in hand and {2}{G} floating.
 */
function combatAt({ attackers = [], blockers = [], blocks = [], home = [], aiBoard = [], step = "declare-blockers" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...g.players,
    user: { ...g.players.user, battlefield: [...attackers.map(([id, card]) => on("user", id, card, { tapped: true })), ...home], hand: [{ ...INSIGHT, id: "h-insight" }],
      library: lib("user", 12), graveyard: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 2 } },
    ai: { ...g.players.ai, battlefield: [...blockers.map(([id, card]) => on("ai", id, card)), ...aiBoard], hand: [], library: lib("ai", 12), graveyard: [] },
  };
  const combat = {
    attackers: attackers.map(([id, , pw]) => ({ permanentId: id, attackingPlayer: "user", defender: "ai", ...(pw ? { defenderPlaneswalkerId: pw } : {}) })),
    blockers: blocks.map(([b, a]) => ({ blockerId: b, blockingPlayer: "ai", attackerId: a })), _blockTriggersFired: true,
  };
  return { ...g, turn: 6, phase: "combat", step, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players, combat };
}
const insightAt = (s, id) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-insight" && (a.targets || []).some((t) => t.id === id));
function castAt(s, id) {
  const a = insightAt(s, id);
  expect(a, `Hunter's Insight at ${id} is not offered`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, a));
}
/** Advance one step and resolve every trigger it raised. */
function step(s) {
  let n = nextStep(s), g = 0;
  while ((n.pendingTriggers?.length || n.stack?.length) && !n.pendingChoice && g++ < 30) n = n.pendingTriggers?.length ? flushTriggers(n, { chooseTargets: chooseTriggerTargets }) : resolveTopOfStack(n);
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return n;
}
const hand = (s) => s.players.user.hand.length;

describe("the card", () => {
  it("⭐ native: choose your creature, then the this-turn combat damage watch on it", () => {
    expect({ tier: classifyCard(INSIGHT), atoms: parseEffectProgram(INSIGHT)?.atoms }).toEqual({
      tier: "native-spell",
      atoms: [
        { op: "choose-target", targetType: "creatureYouControl" },
        { op: "watch-combat-damage-this-turn", bindPreviousTargets: true, targetType: null, recipients: "playerOrPlaneswalker", delayedClause: "draw that many cards" },
      ],
    });
  });
  it("its target is a creature you control — not the opponent's", () => {
    const s = combatAt({ attackers: [["hg", GIANT]], blockers: [["cw", WURM]] });
    const ids = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-insight").map((a) => a.targets.map((t) => t.id).join(",")).sort();
    expect(ids).toEqual(["hg"]);
  });
});

describe("the watch", () => {
  it("⭐ the unblocked Hill Giant deals 3 to the player: you draw three", () => {
    let s = castAt(combatAt({ attackers: [["hg", GIANT]] }), "hg");
    expect({ hand: hand(s), watches: (s.delayedTriggers || []).map((r) => r.watchCombatDamage) }).toEqual({ hand: 0, watches: ["hg"] });
    s = step(s);
    expect({ step: s.step, aiLife: s.players.ai.life, hand: hand(s) }).toEqual({ step: "combat-damage", aiLife: 37, hand: 3 });
  });
  it("⭐ a double striker triggers in each combat damage step: 1 and 1, two cards", () => {
    let s = castAt(combatAt({ attackers: [["ace", ACE]] }), "ace");
    s = step(s); // first-strike damage
    const afterFirst = hand(s);
    s = step(s); // regular damage
    expect({ afterFirst, after: hand(s), aiLife: s.players.ai.life }).toEqual({ afterFirst: 1, after: 2, aiLife: 38 });
  });
  it("⭐ combat damage to a planeswalker counts: the Giant hits Liliana for 3 — three cards, Liliana gone", () => {
    const lili = on("ai", "lili", LILIANA, { counters: { loyalty: 3 } });
    let s = castAt(combatAt({ attackers: [["hg", GIANT, "lili"]], aiBoard: [lili] }), "hg");
    s = step(s);
    expect({ hand: hand(s), aiLife: s.players.ai.life, lili: s.players.ai.battlefield.some((p) => p.id === "lili") }).toEqual({ hand: 3, aiLife: 40, lili: false });
  });
  it("⭐ trample over a chump: the Dreadmaw deals 2 to the Bears and 4 to the player — four cards (damage to the creature counts for nothing)", () => {
    let s = castAt(combatAt({ attackers: [["dm", DREADMAW]], blockers: [["gb", BEARS]], blocks: [["gb", "dm"]] }), "dm");
    s = step(s);
    expect({ hand: hand(s), aiLife: s.players.ai.life }).toEqual({ hand: 4, aiLife: 36 });
  });
  it("⛔ blocked with no trample: the Giant deals its damage to the Wurm — no card", () => {
    let s = castAt(combatAt({ attackers: [["hg", GIANT]], blockers: [["cw", WURM]], blocks: [["cw", "hg"]] }), "hg");
    s = step(s);
    expect({ hand: hand(s), aiLife: s.players.ai.life }).toEqual({ hand: 0, aiLife: 40 });
  });
  it("⛔ another creature's damage is not that creature's: the chosen Bears blocked, the unblocked Giant's 3 draw nothing", () => {
    let s = castAt(combatAt({ attackers: [["hg", GIANT], ["gb", BEARS]], blockers: [["cw", WURM]], blocks: [["cw", "gb"]] }), "gb");
    s = step(s);
    expect({ hand: hand(s), aiLife: s.players.ai.life }).toEqual({ hand: 0, aiLife: 37 });
  });
  it("⭐ cast in the main phase, the watch lasts the turn: the Giant attacks later and you draw three", () => {
    const main = { ...combatAt({ home: [on("user", "hg", GIANT)] }), phase: "precombat-main", step: "main", combat: null };
    let s = castAt(main, "hg");
    s = { ...s, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "hg", attackingPlayer: "user", defender: "ai" }], blockers: [], _blockTriggersFired: true } };
    s = step(s);
    expect(hand(s)).toBe(3);
  });
  it("⛔ the watch ends with the turn: next turn's combat damage draws nothing (CR 603.7b)", () => {
    let s = castAt(combatAt({ attackers: [["hg", GIANT]], step: "declare-attackers" }), "hg");
    s = { ...s, turn: 8, step: "declare-blockers" };
    s = step(s);
    expect({ hand: hand(s), aiLife: s.players.ai.life, watches: (s.delayedTriggers || []).length }).toEqual({ hand: 0, aiLife: 37, watches: 0 });
  });
  it("⛔ a new object: the Giant blinked after the watch is a new permanent, its damage draws nothing (CR 400.7)", () => {
    let s = castAt(combatAt({ attackers: [["hg", GIANT]] }), "hg");
    const giant = s.players.user.battlefield.find((p) => p.id === "hg");
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield.filter((p) => p.id !== "hg"), { ...giant, id: "hg2" }] } },
      combat: { ...s.combat, attackers: [{ permanentId: "hg2", attackingPlayer: "user", defender: "ai" }] } };
    s = step(s);
    expect({ hand: hand(s), aiLife: s.players.ai.life }).toEqual({ hand: 0, aiLife: 37 });
  });
});

describe("the default AI", () => {
  it("holds it: no cast in its main phases or after its blocks are declared (a hold, not a misplay — found, not fixed)", () => {
    const at = (phase, step, combat) => {
      const g = createGameState({ userDeck: [], aiDeck: [] });
      const s = { ...g, turn: 6, phase, step, activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, combat,
        players: { ...g.players, ai: { ...g.players.ai, battlefield: [on("ai", "hg", GIANT, combat ? { tapped: true } : {})], hand: [{ ...INSIGHT, id: "h-ins" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 2 } }, user: { ...g.players.user, battlefield: [], hand: [] } } };
      return pickAction(s, "ai", legalActionsForPlayer(s, "ai"))?.kind;
    };
    expect([at("precombat-main", "main", null), at("combat", "declare-blockers", { attackers: [{ permanentId: "hg", attackingPlayer: "ai", defender: "user" }], blockers: [], _blockTriggersFired: true }), at("postcombat-main", "main", null)])
      .toEqual(["pass-priority", "pass-priority", "pass-priority"]);
  });
});
