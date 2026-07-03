/**
 * essenceSliver.test.js — GLOBAL SUBTYPE damage → controller-lifegain triggered ability.
 *
 * Essence Sliver: "Whenever a Sliver deals damage, its controller gains that much life."
 *
 * A Sliver-wide TRIGGERED grant (CR 603 — every Sliver on the battlefield, any controller, has a
 * damage→lifegain trigger). It reuses the SAME subtypeGlobal + itsController machinery as Synapse/Brood
 * Sliver ("a Sliver deals combat damage to a player, its controller may …") — the differences Essence adds are
 * (1) the BARE "deals damage" condition (no "combat", no "to a player") and (2) an AMOUNT-SCALED effect
 * ("gains that much life" = ctx.combatDamageAmount, NOT a fixed N). checkCombatDamageTriggers' subtypeGlobal
 * all-players scan fires it on combat damage to a player, threading the amount + the dealer's controller as the
 * beneficiary override; the "gain that much life" sentinel reads the amount.
 *
 * CREED proofs below:
 *  - classification: Essence Sliver flips to native-trigger; the sibling Slivers must NOT regress.
 *  - YOU-control path: a Sliver you control connecting → YOU gain that-much life (= the damage amount).
 *  - GLOBAL/beneficiary path: an OPPONENT's Sliver connecting → that OPPONENT gains the life (the dealer's
 *    controller), proving the beneficiary is the dealer, not the watcher's controller (NOT you-control mis-scope).
 *  - AMOUNT SCALING: a 5-damage connect gains 5 life, a 2-damage connect gains 2 — the gain tracks the amount.
 *  - a non-member creature (a Bear) connecting does NOT fire (subtype filter exact — no over-fire).
 *  - FN boundaries: a fixed-N "gains 2 life", a "you gain" (non-'its controller') beneficiary, a card-TYPE
 *    subject ("a creature deals damage"), and a "you control" narrowing all stay non-native (SAFE false-negatives).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkCombatDamageTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ESSENCE = "Whenever a Sliver deals damage, its controller gains that much life.";
const SYNAPSE = "Whenever a Sliver deals combat damage to a player, its controller may draw a card.";
const TOXIN = "Whenever a Sliver deals combat damage to a creature, destroy that creature. It can't be regenerated.";

// A battlefield permanent with a creature subtype (default Sliver). `oracle` empty = a vanilla attacker.
const perm = (id, oracle, controller, type = "Creature — Sliver") =>
  createPermanent({ id, card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, oracle }, controller, summoningSick: false });

// Bare 2P state; both seats start at 40 life so a gain is observable and never fabricated from a low base.
function stateWith(userBf, aiBf) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, library: [], life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, library: [], life: 40 },
    },
  };
}
// The combat-damage event exactly as combatResolution feeds checkCombatDamageTriggers (the real path).
const dmgEvent = (attackerId, attackingPlayer, defender, amount = 2) => [{ kind: "combat-damage-player", attackerId, attackingPlayer, defender, amount }];
function resolveStack(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
  return s;
}

describe("Essence Sliver — classification", () => {
  it("flips to native-trigger (was body-only)", () => {
    expect(classifyCard({ name: "Essence Sliver", type: "Creature — Sliver", oracle: ESSENCE })).toBe("native-trigger");
  });

  it("the detected trigger routes natively (subtypeGlobal / itsController / combatDamageAmount)", () => {
    const t = detectTriggers({ name: "Essence Sliver", type: "Creature — Sliver", oracle: ESSENCE });
    expect(t.length).toBe(1);
    expect(t[0].scope).toBe("subtypeGlobal");
    expect(t[0].itsController).toBe(true);
    expect(t[0].subtypeFilter).toBe("Sliver");
    expect(t[0].effectClause).toBe("you gain that much life"); // the "its controller gains" → "you gain" rewrite
    expect(triggerRoutesNatively(t[0])).toBe(true);
  });

  it("sibling Slivers must NOT regress (Synapse draw, Toxin destroy stay native)", () => {
    expect(classifyCard({ name: "Synapse Sliver", type: "Creature — Sliver", oracle: SYNAPSE })).toBe("native-trigger");
    expect(classifyCard({ name: "Toxin Sliver", type: "Creature — Sliver", oracle: TOXIN })).toBe("native-trigger");
  });

  it("FN boundaries — a fixed-N / non-'its controller' / card-type / you-control variant stays non-native (SAFE)", () => {
    // fixed-N gain (not the amount-scaled shape this scope models) → the sentinel doesn't match → non-native.
    expect(classifyCard({ name: "Fixed", type: "Creature — Sliver", oracle: "Whenever a Sliver deals damage, its controller gains 2 life." })).toBe("body-only");
    // "you gain" on a GLOBAL subject is not the modeled beneficiary shape → fall through rather than guess.
    expect(classifyCard({ name: "YouGain", type: "Creature — Sliver", oracle: "Whenever a Sliver deals damage, you gain that much life." })).toBe("body-only");
    // a card-TYPE word in the subject → parseSubtypeList rejects → non-native (would over-fire on every creature).
    expect(classifyCard({ name: "AnyCreature", type: "Creature — Bear", oracle: "Whenever a creature deals damage, its controller gains that much life." })).toBe("body-only");
    // a "you control" narrowing is a different scope, not modeled here → non-native (SAFE false-negative).
    expect(classifyCard({ name: "YouControl", type: "Creature — Sliver", oracle: "Whenever a Sliver you control deals damage, its controller gains that much life." })).toBe("body-only");
  });
});

describe("Essence Sliver — lifegain fires through the real combat-damage path", () => {
  it("a Sliver YOU control dealing damage → YOU gain that-much life (= the amount)", () => {
    let s = stateWith([perm("ess", ESSENCE, "user"), perm("atk", "", "user")], []);
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "user", "ai", 2));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("user"); // beneficiary = the dealing creature's controller
    s = resolveStack(s);
    expect(s.players.user.life).toBe(42); // gained the 2 damage dealt
    expect(s.players.ai.life).toBe(40);   // opponent untouched by the lifegain
  });

  it("AMOUNT SCALING — a 5-damage connect gains exactly 5 life (not a fixed 1)", () => {
    let s = stateWith([perm("ess", ESSENCE, "user"), perm("atk", "", "user")], []);
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "user", "ai", 5));
    s = resolveStack(s);
    expect(s.players.user.life).toBe(45); // the gain tracks ctx.combatDamageAmount, not a hardcoded amount
  });

  it("CREED — an OPPONENT's Sliver dealing damage → that OPPONENT gains the life (the dealer's controller)", () => {
    // user owns Essence; AI controls the Sliver that connects. The beneficiary must be AI (the dealer's
    // controller), NOT user (the watcher's controller). This is the proof the scope is GLOBAL, not you-control.
    let s = stateWith([perm("ess", ESSENCE, "user")], [perm("atk", "", "ai")]);
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "ai", "user", 3));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("ai"); // beneficiary = the dealing creature's controller
    s = resolveStack(s);
    expect(s.players.ai.life).toBe(43);   // the DEALER's controller gained
    expect(s.players.user.life).toBe(40); // the watcher's controller did NOT gain
  });

  it("the watcher fires for ITSELF when it is the Sliver dealing damage (self-inclusion)", () => {
    let s = stateWith([perm("ess", ESSENCE, "user")], []);
    s = checkCombatDamageTriggers(s, dmgEvent("ess", "user", "ai", 2));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("user");
    s = resolveStack(s);
    expect(s.players.user.life).toBe(42);
  });

  it("CREED — a NON-member creature (a Bear) dealing damage does NOT fire the watcher (no over-fire)", () => {
    let s = stateWith([perm("ess", ESSENCE, "user")], [perm("bear", "", "ai", "Creature — Bear")]);
    s = checkCombatDamageTriggers(s, dmgEvent("bear", "ai", "user", 2));
    expect((s.pendingTriggers || []).length).toBe(0);
    s = resolveStack(s);
    expect(s.players.user.life).toBe(40); // no fabricated gain
    expect(s.players.ai.life).toBe(40);
  });

  it("no double-fire — a global watcher whose controller IS the attacking player fires exactly once", () => {
    let s = stateWith([perm("ess", ESSENCE, "user"), perm("atk", "", "user")], []);
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "user", "ai", 2));
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveStack(s);
    expect(s.players.user.life).toBe(42); // gained once, not twice
  });
});
