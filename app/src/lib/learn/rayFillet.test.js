/**
 * RAY FILLET, WAVE WARRIOR — the WITH-A-COUNTER dealer filter. SHELF-85 · Halfshell Q3, 2026-09-05.
 * "Whenever a creature you control with a counter on it deals combat damage to a player, draw a card."
 *
 * The combat-damage family carves out precisely-checkable dealer filters (a keyword, power above base, the modified
 * predicate) before a generic "with …" reject. "With a counter on it" is one more: ANY counter kind, read LIVE off the
 * DEALING permanent at the fire site (the scope matcher's per-descriptor gate, the modified flag's twin), so an unmarked
 * attacker connecting never fires it — and the watcher's own counters (Ray Fillet evolves) are not the dealer's.
 *
 * Mutation-checked: see the run ledger (docs-sk87).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkCombatDamageTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RAY = { id: "c-ray", name: "Ray Fillet, Wave Warrior", type: "Legendary Creature — Fish Mutant", mana: "{2}{U}", power: 1, toughness: 3, keywords: ["Flying", "Evolve"],
  oracle: "Flying\nEvolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever a creature you control with a counter on it deals combat damage to a player, draw a card." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

const permObj = (card, controller, id, over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
function board(perms) {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const s = { ...base, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage" };
  const players = { ...s.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...s, players };
}
const hit = (attackerId, attackingPlayer = "user") => [{ kind: "combat-damage-player", attackerId, attackingPlayer, defender: attackingPlayer === "user" ? "ai1" : "user", amount: 2 }];
const firedFor = (s, pid) => (s.pendingTriggers || []).filter((t) => t.controller === pid).map((t) => t.descriptor.effectClause);

describe("detection + classification", () => {
  it("reads the creature-you-control scope with the counter flag; a counted variant is refused; Ray Fillet flips native", () => {
    const row = { ray: detectTriggers(RAY).filter((d) => d.event === "combatDamageToPlayer").map((d) => [d.scope, d.requiresCounter]),
      two: detectTriggers({ ...RAY, oracle: "Whenever a creature you control with two or more counters on it deals combat damage to a player, draw a card." }).filter((d) => d.event === "combatDamageToPlayer").length,
      tier: classifyCard(RAY) };
    console.log("  WITNESS rayFillet", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ray).toEqual([["creatureYouControl", "any"]]);
    expect(row.two).toBe(0);
    expect(row.tier).toMatch(/^native/);
  });
});

describe("RUNTIME — the counter is read off the DEALER, live", () => {
  it("a marked attacker connecting fires the draw; an unmarked one does not — even while Ray Fillet itself carries a counter", () => {
    const s = board([permObj(RAY, "user", "ray", { counters: { "+1/+1": 1 } }), permObj(BEAR, "user", "bear", { counters: { "+1/+1": 1 } }), permObj({ ...BEAR, id: "c-plain" }, "user", "plain")]);
    const marked = firedFor(checkCombatDamageTriggers(s, hit("bear")), "user");
    const plain = firedFor(checkCombatDamageTriggers(s, hit("plain")), "user");
    const row = { marked, plain };
    console.log("  WITNESS rayFilletRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(marked).toEqual(["draw a card"]);
    expect(plain).toEqual([]);
  });

  it("any counter kind counts (a charge counter), and an opponent's marked creature never fires Ray Fillet", () => {
    const s = board([permObj(RAY, "user", "ray"), permObj(BEAR, "user", "bear", { counters: { charge: 1 } }), permObj({ ...BEAR, id: "c-ob" }, "ai1", "obear", { counters: { "+1/+1": 2 } })]);
    expect(firedFor(checkCombatDamageTriggers(s, hit("bear")), "user")).toEqual(["draw a card"]);
    expect(firedFor(checkCombatDamageTriggers(s, hit("obear", "ai1")), "user")).toEqual([]);
  });
});
