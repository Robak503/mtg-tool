/**
 * ESSENCE SLIVER PLAYS ITS WHOLE TEXT — "Whenever a Sliver deals damage, its controller gains that much life." Any damage: to a
 * player, a planeswalker or a creature, in combat or out of it (CR 120.1; no recipient and no "combat" in the text). Until now its
 * descriptor was the combat-damage-to-a-player event (the Synapse Sliver machinery), so a Sliver's damage to a blocker or a blocked
 * attacker, and its damage from a fight or an ability, gained nothing while the card was credited native. Now it is a dealt-by
 * watcher of any player's Sliver (scope subtypeGlobal): checkDealtByTriggers fires it once per damage event per Sliver, with what
 * that Sliver dealt in the event ("that much" — CR 603.2c, the Drinker of Sorrow / Angel of Deliverance rulings for the event), for
 * the Sliver's controller ("its controller"). Each Essence Sliver triggers separately (its bundled ruling: the abilities
 * Slivers grant are cumulative).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-21).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveCombatDamage } from "./combatResolution.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ESSENCE_SLIVER = {"name":"Essence Sliver","type":"Creature — Sliver","mana":"{3}{W}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["W"],"oracle":"Whenever a Sliver deals damage, its controller gains that much life."};
const METALLIC_SLIVER = {"name":"Metallic Sliver","type":"Artifact Creature — Sliver","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const PREY_UPON = {"name":"Prey Upon","type":"Sorcery","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":["Fight"],"colors":["G"],"oracle":"Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)"};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const LIB = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat game in the user's precombat main phase: both at 20 life, the user's pool full, both libraries stocked. */
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life: 20, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...s.players.ai, life: 20, battlefield: ai, hand: [], library: LIB("ai") } } };
}
/** `attackers` [id, attackingPlayer] attack the other seat; `blocks` pairs [blocker, attacker]. The regular combat damage step. */
function combat(s, attackers, blocks = []) {
  const other = (pid) => (pid === "user" ? "ai" : "user");
  return resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage",
    combat: { attackers: attackers.map(([id, pid]) => ({ permanentId: id, attackingPlayer: pid, defender: other(pid) })),
      blockers: blocks.map(([blockerId, attackerId]) => ({ blockerId, blockingPlayer: findController(s, blockerId), attackerId })) } });
}
const findController = (s, id) => (s.players.user.battlefield.some((p) => p.id === id) ? "user" : "ai");
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
/** Cast Prey Upon from the user's hand: the user's `fighter` fights the AI's `target`; paid, resolved and settled. */
function preyUpon(s, fighter, target) {
  const role = (a, r, id) => (a.targets || []).some((t) => t.role === r && t.id === id);
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-prey" && role(a, "fighter", fighter) && role(a, "target", target));
  expect(act, "Prey Upon is offered with the intended targets").toBeTruthy();
  const resolved = resolveTopOfStack(dispatchAction(s, act));
  expect((resolved.log || []).filter((l) => l.kind === "stack-resolve-error")).toEqual([]);
  return resolved;
}
const essenceFires = (s) => (s.pendingTriggers || []).filter((t) => t.source?.name === "Essence Sliver" && t.event === "dealtBy").map((t) => ({ controller: t.controller, amount: t.context?.combatDamageAmount }));
const life = (s) => ({ user: s.players.user.life, ai: s.players.ai.life });
const HAND = [{ id: "h-prey", ...PREY_UPON }];

describe("damage to a creature in combat", () => {
  it("⭐ Essence Sliver blocked by a Bears deals its 3 to it — its controller gains 3", () => {
    const hit = combat(board({ user: [P("ess", ESSENCE_SLIVER, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), [["ess", "user"]], [["bears", "ess"]]);
    expect(essenceFires(hit)).toEqual([{ controller: "user", amount: 3 }]);
    expect(life(settle(hit))).toEqual({ user: 23, ai: 20 });
  });
  it("⭐ another Sliver's damage to a blocker: Metallic Sliver blocked by a Bears deals 1 — its controller gains 1", () => {
    const hit = combat(board({ user: [P("ess", ESSENCE_SLIVER, "user"), P("met", METALLIC_SLIVER, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), [["met", "user"]], [["bears", "met"]]);
    expect(life(settle(hit))).toEqual({ user: 21, ai: 20 });
  });
  it("⭐ an opponent's Sliver blocking deals damage — ITS controller gains (the AI's Metallic Sliver blocks the user's Bears)", () => {
    const hit = combat(board({ user: [P("ess", ESSENCE_SLIVER, "user"), P("bears", GRIZZLY_BEARS, "user")], ai: [P("met", METALLIC_SLIVER, "ai")] }), [["bears", "user"]], [["met", "bears"]]);
    expect(essenceFires(hit)).toEqual([{ controller: "ai", amount: 1 }]);
    expect(life(settle(hit))).toEqual({ user: 20, ai: 21 });
  });
  it("⭐ damage to two blockers at once is one event — Essence Sliver blocked by two Bears triggers once, for all 3", () => {
    const hit = combat(board({ user: [P("ess", ESSENCE_SLIVER, "user")], ai: [P("b1", GRIZZLY_BEARS, "ai"), P("b2", GRIZZLY_BEARS, "ai")] }), [["ess", "user"]], [["b1", "ess"], ["b2", "ess"]]);
    expect(essenceFires(hit)).toEqual([{ controller: "user", amount: 3 }]);
    expect(life(settle(hit))).toEqual({ user: 23, ai: 20 });
  });
});

describe("damage outside combat", () => {
  it("⭐ a fight: Essence Sliver fights the AI's Bears (Prey Upon) and deals 3 — its controller gains 3; the Bears' 2 gains nothing", () => {
    const out = settle(preyUpon(board({ user: [P("ess", ESSENCE_SLIVER, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], hand: HAND }), "ess", "bears"));
    expect(life(out)).toEqual({ user: 23, ai: 20 });
  });
  it("⭐ an opponent's Sliver in a fight: the user's Hill Giant fights the AI's Metallic Sliver, which deals 1 — the AI gains 1", () => {
    const out = settle(preyUpon(board({ user: [P("ess", ESSENCE_SLIVER, "user"), P("giant", HILL_GIANT, "user")], ai: [P("met", METALLIC_SLIVER, "ai")], hand: HAND }), "giant", "met"));
    expect(life(out)).toEqual({ user: 20, ai: 21 });
  });
});

describe("CONTROLS — unchanged", () => {
  it("CONTROL — Essence Sliver reads native-trigger", () => {
    expect(classifyCard(ESSENCE_SLIVER)).toBe("native-trigger");
  });
  it("CONTROL — an unblocked Sliver's 3 to a player: exactly one trigger (no double fire for the watcher itself), its controller gains 3", () => {
    const out = settle(combat(board({ user: [P("ess", ESSENCE_SLIVER, "user")] }), [["ess", "user"]]));
    expect(life(out)).toEqual({ user: 23, ai: 17 });
  });
  it("CONTROL — two Essence Slivers each trigger once for one Sliver's damage (cumulative, its ruling): +2", () => {
    const out = settle(combat(board({ user: [P("e1", ESSENCE_SLIVER, "user"), P("e2", ESSENCE_SLIVER, "user"), P("met", METALLIC_SLIVER, "user")] }), [["met", "user"]]));
    expect(life(out)).toEqual({ user: 22, ai: 19 });
  });
  it("CONTROL — a creature that is not a Sliver deals damage: nothing gained (a Bears connects, a Hill Giant fights)", () => {
    const hit = settle(combat(board({ user: [P("ess", ESSENCE_SLIVER, "user"), P("bears", GRIZZLY_BEARS, "user")] }), [["bears", "user"]]));
    const fought = settle(preyUpon(board({ user: [P("ess", ESSENCE_SLIVER, "user"), P("giant", HILL_GIANT, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], hand: HAND }), "giant", "bears"));
    expect({ hit: life(hit), fought: life(fought) }).toEqual({ hit: { user: 20, ai: 18 }, fought: { user: 20, ai: 20 } });
  });
});
