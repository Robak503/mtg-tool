/**
 * EXEMPLAR OF LIGHT (EDHREC #1189) — "Flying / Whenever you gain life, put a +1/+1 counter on this creature. / Whenever you put one
 * or more +1/+1 counters on this creature, draw a card. This ability triggers only once each turn."
 *
 * The receiving permanent's own counters-put event (CR 122.6 — counters put on it on the battlefield or as it enters), with the
 * PLAYER WHO PUT them its controller: the controller of the effect that puts them (CR 122.6a for an entering one). One placement is
 * one event, however many counters land; the once-each-turn rider limits the triggering itself (the descriptor's latch). The bundled
 * rulings: the last ability triggers whenever you put +1/+1 counters on it for any reason, not only by its lifegain ability; each
 * life-gaining event triggers the lifegain ability once.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkLifegainTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, gainLife, addCounter, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";

beforeEach(() => _resetIdsForTests());

const EXEMPLAR = {"name":"Exemplar of Light","type":"Creature — Angel","mana":"{2}{W}{W}","cmc":4,"power":"3","toughness":"3","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhenever you gain life, put a +1/+1 counter on this creature.\nWhenever you put one or more +1/+1 counters on this creature, draw a card. This ability triggers only once each turn."};
const BATTLEGROWTH = {"name":"Battlegrowth","type":"Instant","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Put a +1/+1 counter on target creature."};
const KNIGHT_OF_WUNDAGORE = {"name":"Knight of Wundagore","type":"Creature — Cat Knight Villain","mana":"{1}{G}","cmc":2,"power":"2","toughness":"1","keywords":["Trample"],"colors":["G"],"oracle":"Trample\nWhenever you put a +1/+1 counter on another creature, put a +1/+1 counter on this creature. This ability triggers only once each turn."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const lib = (pid) => Array.from({ length: 8 }, (_, i) => ({ ...BEARS, id: `L-${pid}-${i}` }));
function table({ caster = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players,
    user: { ...s0.players.user, battlefield: [createPermanent({ id: "ex", card: { ...EXEMPLAR, id: "c-ex" }, controller: "user", summoningSick: false })], hand: [], library: lib("user") },
    ai: { ...s0.players.ai, battlefield: [], hand: [], library: lib("ai") } };
  players[caster] = { ...players[caster], hand: [{ ...BATTLEGROWTH, id: "h-bg" }, { ...BATTLEGROWTH, id: "h-bg2" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 } };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, stack: [], pendingTriggers: [], consecutivePasses: 0 };
}
const settle = (s) => {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 20 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
};
/** `caster` casts Battlegrowth (card `cardId`) at the Exemplar; everything resolves. */
function growth(s, caster, cardId = "h-bg") {
  const a = legalActionsForPlayer(s, caster).find((x) => x.kind === "cast-spell" && x.cardId === cardId && (x.targets || []).some((t) => t.id === "ex"));
  expect(a, `${caster}'s Battlegrowth at the Exemplar`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
const counters = (s) => s.players.user.battlefield.find((p) => p.id === "ex")?.counters?.["+1/+1"] || 0;

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(EXEMPLAR))).toBe(true);
  });
  it("⭐ the watcher: its own counters, put by its controller, once each turn", () => {
    const d = detectTriggers(EXEMPLAR).find((x) => x.event === "countersPut");
    expect(d && { scope: d.scope, placedByController: d.placedByController, once: d.oncePerTurnTrigger, routes: triggerRoutesNatively(d) })
      .toEqual({ scope: "self", placedByController: true, once: true, routes: true });
  });
  it("CONTROL — Knight of Wundagore (\"a +1/+1 counter on another creature\", singular) stays parked", () => {
    expect(isNativeTier(classifyCard(KNIGHT_OF_WUNDAGORE))).toBe(false);
  });
});

describe("the game", () => {
  it("⭐ its controller gains life: a counter (its first ability), then a card (its last)", () => {
    const s = settle(checkLifegainTriggers(gainLife(table(), { playerId: "user", amount: 2 }), "user", 2));
    expect({ counters: counters(s), drew: 8 - s.players.user.library.length }).toEqual({ counters: 1, drew: 1 });
  });
  it("⭐ its ruling — any reason counts: its controller's Battlegrowth on it draws a card", () => {
    const s = growth(table(), "user");
    expect({ counters: counters(s), drew: s.players.user.library.length }).toEqual({ counters: 1, drew: 7 });
  });
  it("⭐ only once each turn: a second Battlegrowth the same turn puts the counter and draws nothing", () => {
    const s = growth(growth(table(), "user"), "user", "h-bg2");
    expect({ counters: counters(s), drew: 8 - s.players.user.library.length }).toEqual({ counters: 2, drew: 1 });
  });
  it("⭐ \"you put\": an opponent's Battlegrowth on it puts the counter and draws its controller nothing", () => {
    const s = growth(table({ caster: "ai" }), "ai");
    expect({ counters: counters(s), drew: 8 - s.players.user.library.length }).toEqual({ counters: 1, drew: 0 });
  });
});

// ── WHO PUTS the counters when another player's permanent does (the integrator's review, 2026-11-01) ──
// Panther Habit ("If equipped creature would be dealt damage, prevent that damage and put that many +1/+1 counters on it.") is a
// replacement effect controlled by the EQUIPMENT's controller (CR 616.1, 122.6): left on an Exemplar that changed control, the
// counters are its controller's to put, not the Exemplar's controller's. A placement whose placer can't be named never fires it.
describe("the placer is the replacement effect's controller", () => {
  const PANTHER_HABIT = {"name":"Panther Habit","type":"Artifact — Equipment","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"If equipped creature would be dealt damage, prevent that damage and put that many +1/+1 counters on it.\nEquip {2}"};
  const RAIDER = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
  /** The user controls the Exemplar; `habitOwner` controls the Panther Habit attached to it; ai holds a Bears. */
  function habitBoard(habitOwner) {
    const s0 = table();
    const ex = { ...s0.players.user.battlefield[0], attachments: ["habit"] };
    const habit = { ...createPermanent({ id: "habit", card: { ...PANTHER_HABIT, id: "c-habit" }, controller: habitOwner, summoningSick: false }), attachedTo: "ex" };
    const bears = createPermanent({ id: "raider", card: { ...RAIDER, id: "c-raider" }, controller: "ai", summoningSick: false });
    const players = { ...s0.players, user: { ...s0.players.user, battlefield: [ex], hand: [] } };
    players[habitOwner] = { ...players[habitOwner], battlefield: [...players[habitOwner].battlefield, habit] };
    players.ai = { ...players.ai, battlefield: [...players.ai.battlefield, bears] };
    return { ...s0, players };
  }
  const drew = (s) => 8 - s.players.user.library.length;
  const spellHit = (habitOwner) => settle(applyDamageEffect(habitBoard(habitOwner), { controller: "ai", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "ex" }], source: null }));
  const combatHit = (habitOwner) => {
    const s = habitBoard(habitOwner);
    return settle(resolveCombatDamage({ ...s, activePlayer: "ai", phase: "combat", step: "combat-damage",
      combat: { attackers: [{ permanentId: "raider", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "ex", attackerId: "raider" }] } }));
  };
  it("⭐ a Shock prevented by an OPPONENT's Panther Habit on it: two counters, and its controller draws nothing", () => {
    const s = spellHit("ai");
    expect({ counters: counters(s), drew: drew(s) }).toEqual({ counters: 2, drew: 0 });
  });
  it("⭐ the same in combat: blocking, the opponent's Panther Habit pays out the counters and its controller draws nothing", () => {
    const s = combatHit("ai");
    expect({ counters: counters(s), drew: drew(s) }).toEqual({ counters: 2, drew: 0 });
  });
  it("⭐ a placement that names no placer never fires it (false-negative safe): +1/+1 counters put with no placedBy, nothing drawn; named as its controller, one card", () => {
    const none = settle(addCounter(table(), { permanentId: "ex", type: "+1/+1", amount: 1 }));
    const named = settle(addCounter(table(), { permanentId: "ex", type: "+1/+1", amount: 1, placedBy: "user" }));
    expect({ none: [counters(none), drew(none)], named: [counters(named), drew(named)] }).toEqual({ none: [1, 0], named: [1, 1] });
  });
  it("CONTROL — its controller's own Panther Habit: the counters are theirs to put, and they draw (both damage paths)", () => {
    const a = spellHit("user"), b = combatHit("user");
    expect({ spell: [counters(a), drew(a)], combat: [counters(b), drew(b)] }).toEqual({ spell: [2, 1], combat: [2, 1] });
  });
});
