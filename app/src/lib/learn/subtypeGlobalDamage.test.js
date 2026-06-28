/**
 * subtypeGlobalDamage.test.js — GLOBAL SUBTYPE combat-damage-to-a-player triggered ability.
 *
 * Synapse Sliver: "Whenever a Sliver deals combat damage to a player, its controller may draw a card."
 * Brood Sliver:   "Whenever a Sliver deals combat damage to a player, its controller may create a 1/1
 *                  colorless Sliver creature token."
 *
 * UNLIKE the subtypeYouControl form (Spawning Kraken — "a … you control deals …") this is GLOBAL (no "you
 * control"): it fires off ANY player's matching-subtype creature, and "its controller" makes the DEALING
 * creature's controller the beneficiary — NOT the watcher's controller. Modeling it as you-control would be
 * a forbidden mis-scope (it would silently drop the opponent's-Sliver case). The new scope:"subtypeGlobal"
 * + the dealer-controller beneficiary override model the WHOLE card.
 *
 * CREED proofs below:
 *  - YOU-control path: a Sliver you control dealing combat damage → YOU draw.
 *  - GLOBAL/beneficiary path: an OPPONENT's Sliver dealing combat damage → that OPPONENT draws (the dealer's
 *    controller), proving the beneficiary is correct and the scope is NOT you-control.
 *  - "may" is optional (suspends for a take/decline; declining does nothing — never a do-nothing-while-native).
 *  - A non-member creature dealing damage does NOT fire (subtype filter exact — no over-fire).
 *  - No double-fire for a global watcher the attacking player controls.
 *  - Spawning Kraken (subtypeYouControl) stays native + fires for its controller only (must-not-regress).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkCombatDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SYNAPSE = "Whenever a Sliver deals combat damage to a player, its controller may draw a card.";
const BROOD = "Whenever a Sliver deals combat damage to a player, its controller may create a 1/1 colorless Sliver creature token.";
const KRAKEN = "Whenever a Kraken, Leviathan, Octopus, or Serpent you control deals combat damage to a player, draw a card.";

// A battlefield permanent with a creature subtype (default Sliver). `oracle` empty = a vanilla attacker.
const perm = (id, oracle, controller, type = "Creature — Sliver") =>
  createPermanent({ id, card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, oracle }, controller, summoningSick: false });

// Bare 2P state; seed each side's library so a draw has cards (drawCards is library-bounded).
function stateWith(userBf, aiBf, lib = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, library: lib.user || [], life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, library: lib.ai || [], life: 40 },
    },
  };
}
const libN = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: `Filler ${i}`, type: "Instant" }));
// The combat-damage event exactly as combatResolution feeds checkCombatDamageTriggers (the real path).
const dmgEvent = (attackerId, attackingPlayer, defender) => [{ kind: "combat-damage-player", attackerId, attackingPlayer, defender, amount: 2 }];
function resolveStack(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
  return s;
}
const tokensOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.card.token).length;

describe("GLOBAL SUBTYPE combat-damage — classification", () => {
  it("Synapse Sliver and Brood Sliver are a native tier (no longer body-only)", () => {
    expect(classifyCard({ name: "Synapse Sliver", type: "Creature — Sliver", oracle: SYNAPSE })).toBe("native-trigger");
    expect(classifyCard({ name: "Brood Sliver", type: "Creature — Sliver", oracle: BROOD })).toBe("native-trigger");
  });

  it("Spawning Kraken (subtypeYouControl) stays native-trigger (must-not-regress)", () => {
    expect(classifyCard({ name: "Spawning Kraken", type: "Creature — Kraken", oracle: KRAKEN })).toBe("native-trigger");
  });

  it("FN boundary — a global subject with a NON-'its controller' beneficiary stays non-native (no mis-scope)", () => {
    // "you draw" on a GLOBAL subject is not the modeled shape — fall through rather than guess the beneficiary.
    expect(classifyCard({ name: "Hypo", type: "Creature — Sliver", oracle: "Whenever a Sliver deals combat damage to a player, you draw a card." })).toBe("body-only");
    // a card-TYPE word in the subject → parseSubtypeList rejects → non-native (would over-fire on every creature).
    expect(classifyCard({ name: "Bad", type: "Creature — Bear", oracle: "Whenever a creature deals combat damage to a player, its controller may draw a card." })).toBe("body-only");
    // a trailing qualifier ("…or planeswalker") fails the end-anchor → non-native (SAFE false-negative).
    expect(classifyCard({ name: "Qual", type: "Creature — Sliver", oracle: "Whenever a Sliver deals combat damage to a player or planeswalker, its controller may draw a card." })).toBe("body-only");
  });
});

describe("GLOBAL SUBTYPE combat-damage — Synapse Sliver (draw) fires through the real path", () => {
  it("a Sliver YOU control dealing combat damage → YOU draw (take the optional)", () => {
    let s = stateWith([perm("syn", SYNAPSE, "user"), perm("atk", "", "user")], [], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect"); // "may" suspends (not auto-mandatory)
    expect(s.players.user.hand.length).toBe(0);            // not drawn yet
    s = resolveOptionalChoice(s, true);
    expect(s.players.user.hand.length).toBe(1);            // taking it draws for the controller
  });

  it("CREED — an OPPONENT's Sliver dealing combat damage → that OPPONENT draws (the dealer's controller)", () => {
    // user owns Synapse; AI controls the Sliver that connects. The beneficiary must be AI (the dealer's
    // controller), NOT user (the watcher's controller). This is the proof the scope is GLOBAL, not you-control.
    let s = stateWith([perm("syn", SYNAPSE, "user")], [perm("atk", "", "ai")], { user: libN(5), ai: libN(5) });
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "ai", "user"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("ai");   // beneficiary = the dealing creature's controller
    s = resolveStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    expect(s.players.ai.hand.length).toBe(1);             // the DEALER's controller drew
    expect(s.players.user.hand.length).toBe(0);           // the watcher's controller did NOT draw
  });

  it("declining the optional draws nothing (no do-nothing-while-claiming-native — the choice is real)", () => {
    let s = stateWith([perm("syn", SYNAPSE, "user"), perm("atk", "", "user")], [], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "user", "ai"));
    s = resolveStack(s);
    s = resolveOptionalChoice(s, false);
    expect(s.players.user.hand.length).toBe(0);
  });

  it("the watcher fires for ITSELF when it is the Sliver dealing damage (self-inclusion)", () => {
    let s = stateWith([perm("syn", SYNAPSE, "user")], [], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgEvent("syn", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("user");
  });

  it("CREED — a NON-member creature (a Bear) dealing combat damage does NOT fire the watcher", () => {
    let s = stateWith([perm("syn", SYNAPSE, "user")], [perm("bear", "", "ai", "Creature — Bear")], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgEvent("bear", "ai", "user"));
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("no double-fire — a global watcher whose controller IS the attacking player fires exactly once", () => {
    // Synapse (user) + a user Sliver attacker: the self/attacking-player paths skip subtypeGlobal, the
    // global all-players scan fires it once. Was a double-fire hazard before the scope-filter de-dup.
    let s = stateWith([perm("syn", SYNAPSE, "user"), perm("atk", "", "user")], [], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(1);
  });
});

describe("GLOBAL SUBTYPE combat-damage — Brood Sliver (token) beneficiary", () => {
  it("a Sliver YOU control dealing combat damage → YOU may create a Sliver token", () => {
    let s = stateWith([perm("brood", BROOD, "user"), perm("atk", "", "user")], []);
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    expect(tokensOf(s, "user")).toBe(1);
    expect(tokensOf(s, "ai")).toBe(0);
  });

  it("CREED — an OPPONENT's Sliver dealing combat damage → that OPPONENT gets the token", () => {
    let s = stateWith([perm("brood", BROOD, "user")], [perm("atk", "", "ai")]);
    s = checkCombatDamageTriggers(s, dmgEvent("atk", "ai", "user"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("ai");
    s = resolveStack(s);
    s = resolveOptionalChoice(s, true);
    expect(tokensOf(s, "ai")).toBe(1);   // the DEALER's controller got the token
    expect(tokensOf(s, "user")).toBe(0); // the watcher's controller did NOT
  });
});

describe("must-not-regress — Spawning Kraken (subtypeYouControl) fires for its controller only", () => {
  it("a Sliver you control connecting fires Spawning Kraken's controller's draw; an opponent's does NOT", () => {
    // user owns Spawning Kraken. A KRAKEN the user controls connects → user draws.
    let s = stateWith([perm("sk", KRAKEN, "user", "Creature — Kraken"), perm("k1", "", "user", "Creature — Kraken")], [], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgEvent("k1", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("user");
    const h0 = s.players.user.hand.length;
    s = resolveStack(s);
    expect(s.players.user.hand.length).toBe(h0 + 1);

    // An OPPONENT's Kraken connecting must NOT fire the user's you-control watcher (controller-gated).
    let s2 = stateWith([perm("sk", KRAKEN, "user", "Creature — Kraken")], [perm("k2", "", "ai", "Creature — Kraken")], { user: libN(5), ai: libN(5) });
    s2 = checkCombatDamageTriggers(s2, dmgEvent("k2", "ai", "user"));
    expect((s2.pendingTriggers || []).length).toBe(0);
  });
});
