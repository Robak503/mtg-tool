/**
 * celestialMantle.test.js — Celestial Mantle (shelf decks D40, 2026-09-30: Light-Paws Voltron).
 *
 *   "Enchant creature / Enchanted creature gets +3/+3. / Whenever enchanted creature deals combat damage to a player, double
 *    its controller's life total."
 *
 * CR 701.10d: doubling a life total means gaining or losing the amount that makes it twice its current value. The new
 * double-life atom gains (so lifegain triggers fire, CR 119.3) on a positive total and loses on a negative one. "its
 * controller" is the ENCHANTED creature's controller: detectTriggers rewrites the whole clause to the triggering-permanent
 * sentinel for an attached combat-damage trigger, and checkCombatDamageTriggers binds the attacker as that permanent — so a
 * Mantle on an opponent's creature doubles THEIR life, not its own controller's.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkCombatDamageTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MANTLE = { name: "Celestial Mantle", type: "Enchantment — Aura", mana: "{3}{W}{W}{W}", keywords: ["Enchant", "Double"],
  oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nWhenever enchanted creature deals combat damage to a player, double its controller's life total." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const PRIDEMATE = { name: "Ajani's Pridemate", type: "Creature — Cat Soldier", mana: "{1}{W}", power: "2", toughness: "2", keywords: [], oracle: "Whenever you gain life, put a +1/+1 counter on this creature." };
const PLATINUM = { name: "Platinum Angel", type: "Artifact Creature — Angel", mana: "{7}", power: "4", toughness: "4", keywords: ["Flying"], oracle: "Flying\nYou can't lose the game and your opponents can't win the game." };

/** The Mantle (always the user's) on a Bear controlled by `hostController`, plus each player's Pridemate. */
function table({ hostController = "user", userLife = 40, aiLife = 40, platinum = false } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const host = { ...createPermanent({ id: "HOST", card: { ...BEARS, id: "c-host" }, controller: hostController, summoningSick: false }), attachments: ["MANTLE"] };
  const mantle = { ...createPermanent({ id: "MANTLE", card: { ...MANTLE, id: "c-mantle" }, controller: "user", summoningSick: false }), attachedTo: "HOST" };
  const mine = [mantle, createPermanent({ id: "UPRIDE", card: { ...PRIDEMATE, id: "c-up" }, controller: "user", summoningSick: false })];
  const theirs = [createPermanent({ id: "APRIDE", card: { ...PRIDEMATE, id: "c-ap" }, controller: "ai", summoningSick: false })];
  (hostController === "user" ? mine : theirs).push(host);
  if (platinum) mine.push(createPermanent({ id: "PLAT", card: { ...PLATINUM, id: "c-plat" }, controller: "user", summoningSick: false }));
  return { ...g, turn: 5, activePlayer: hostController, priorityHolder: hostController, phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, life: userLife, battlefield: mine }, ai: { ...g.players.ai, life: aiLife, battlefield: theirs } } };
}
/** The host deals combat damage to the other player; settle every trigger; fail loudly on a logged resolver crash. */
function hit(s) {
  const attacker = s.activePlayer;
  let n = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "HOST", attackingPlayer: attacker, defender: attacker === "user" ? "ai" : "user", amount: 5 }]);
  let g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 20) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const counters = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;

describe("the card", () => {
  it("reads native; its trigger's clause is the double-life atom on the triggering permanent's controller", () => {
    const trig = detectTriggers(MANTLE).find((d) => d.event === "combatDamageToPlayer");
    expect({ tier: classifyCard(MANTLE), scope: trig?.scope, atoms: parseEffectClause(trig?.effectClause || "", "Enchantment").atoms })
      .toEqual({ tier: "native-trigger", scope: "equippedCreature", atoms: [{ op: "double-life", who: "triggeringPermanentController", targetType: null }] });
  });

  it("fences (synthetic): a targeted double and a different subject stay unread", () => {
    const conf = (text) => parseEffectClause(text, "Sorcery")?.confidence ?? "low";
    expect([conf("Double target player's life total."), conf("Double its controller's life total.")]).toEqual(["low", "low"]);
  });
});

describe("in play", () => {
  it("on your own creature it doubles YOUR life, and that gain fires your lifegain trigger (WITNESS)", () => {
    const s = hit(table({ hostController: "user", userLife: 37 }));
    const witness = { userLife: s.players.user.life, aiLife: s.players.ai.life, yourPridemate: counters(s, "user", "UPRIDE"), theirPridemate: counters(s, "ai", "APRIDE") };
    console.log(`WITNESS celestialMantle ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ userLife: 74, aiLife: 40, yourPridemate: 1, theirPridemate: 0 });
  });

  it("on an opponent's creature it doubles THEIR life — its controller is the enchanted creature's, not the Mantle's", () => {
    const s = hit(table({ hostController: "ai", aiLife: 21 }));
    expect({ userLife: s.players.user.life, aiLife: s.players.ai.life, theirPridemate: counters(s, "ai", "APRIDE"), yourPridemate: counters(s, "user", "UPRIDE") })
      .toEqual({ userLife: 40, aiLife: 42, theirPridemate: 1, yourPridemate: 0 });
  });

  it("a NEGATIVE total doubles downward — a loss, no lifegain (CR 701.10d), alive only under Platinum Angel", () => {
    const s = hit(table({ hostController: "user", userLife: -5, platinum: true }));
    expect({ userLife: s.players.user.life, yourPridemate: counters(s, "user", "UPRIDE") }).toEqual({ userLife: -10, yourPridemate: 0 });
  });

  it("a life total of 0 stays 0 (twice nothing), and no lifegain trigger fires", () => {
    const s = hit(table({ hostController: "user", userLife: 0 }));
    expect({ userLife: s.players.user.life, yourPridemate: counters(s, "user", "UPRIDE") }).toEqual({ userLife: 0, yourPridemate: 0 });
  });
});
