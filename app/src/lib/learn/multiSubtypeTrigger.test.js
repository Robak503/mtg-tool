/**
 * multiSubtypeTrigger.test.js — MULTI-SUBTYPE-LIST combat-damage trigger (deck wave).
 *
 * The subtypeYouControl scope recognized a SINGLE subtype ("a Dinosaur you control deals combat damage to a
 * player" — Curious Altisaur). A multi-subtype LIST ("a Kraken, Leviathan, Octopus, or Serpent you control
 * deals combat damage to a player, draw a card" — Spawning Kraken, Koma deck) was body-only. parseSubtypeList
 * now returns an ARRAY for a list (a string for one word — unchanged), and the subtypeYouControl matcher
 * (subtypeFilterMatches) fires when the triggering permanent carries ANY listed subtype.
 *
 * CREED: a non-member creature dealing combat damage does NOT fire the watcher (the subtype filter is exact);
 * a list with a card-TYPE word (creature/permanent/…) is rejected by parseSubtypeList → Arbiter (no over-fire).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkCombatDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KRAKEN = 'Whenever a Kraken, Leviathan, Octopus, or Serpent you control deals combat damage to a player, draw a card.';

// user controls Spawning Kraken (the watcher) + `attacker` (the creature that dealt combat damage). The
// combat-damage event is fed exactly as combatResolution feeds checkCombatDamageTriggers (the real path).
function combatState(attackerType) {
  const watcher = createPermanent({ id: "watcher", card: { name: "Spawning Kraken", type: "Creature — Kraken", power: 5, toughness: 5, oracle: KRAKEN }, controller: "user" });
  const attacker = createPermanent({ id: "atk", card: { name: "Attacker", type: attackerType, power: 4, toughness: 4, oracle: "" }, controller: "user" });
  const s = createGameState({ userDeck: [{ name: "Top", type: "Instant", oracle: "" }], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage",
    players: { ...s.players, user: { ...s.players.user, battlefield: [watcher, attacker] }, ai: { ...s.players.ai, life: 20 } },
  };
}
const dmgEvent = (attackerId) => [{ kind: "combat-damage-player", attackerId, attackingPlayer: "user", defender: "ai", amount: 4 }];

describe("MULTI-SUBTYPE-LIST combat-damage trigger — recognition", () => {
  it("a multi-subtype list → native-trigger; a single subtype still works", () => {
    expect(classifyCard({ name: "Spawning Kraken", type: "Creature — Kraken", oracle: KRAKEN })).toBe("native-trigger");
    expect(classifyCard({ name: "Altisaur", type: "Creature — Dinosaur", oracle: "Whenever a Dinosaur you control deals combat damage to a player, draw a card." })).toBe("native-trigger");
  });
  it("FN boundary — a list containing a card-TYPE word stays Arbiter (no over-fire)", () => {
    expect(classifyCard({ name: "Bad", type: "Creature — Bear", oracle: "Whenever a creature, artifact, or enchantment you control deals combat damage to a player, draw a card." })).toBe("body-only");
  });
});

describe("MULTI-SUBTYPE-LIST combat-damage trigger — runtime fires through the real path", () => {
  it("a LISTED-subtype creature (Octopus) dealing combat damage fires the watcher's draw", () => {
    let s = combatState("Creature — Octopus");
    s = checkCombatDamageTriggers(s, dmgEvent("atk"));
    expect((s.pendingTriggers || []).length).toBe(1);          // Spawning Kraken fired (Octopus ∈ the list)
    const hand0 = s.players.user.hand.length;
    s = resolveTopOfStack(flushTriggers(s));
    expect(s.players.user.hand.length).toBe(hand0 + 1);        // drew a card
  });

  it("the watcher fires for ITSELF when it is the one dealing damage (Kraken ∈ list, self-inclusion)", () => {
    let s = combatState("Creature — Bear");                     // the non-Kraken attacker won't matter
    s = checkCombatDamageTriggers(s, dmgEvent("watcher"));      // the Kraken watcher itself dealt damage
    expect((s.pendingTriggers || []).length).toBe(1);
  });

  it("CREED — a NON-member creature (Bear) dealing combat damage does NOT fire the watcher", () => {
    let s = combatState("Creature — Bear");
    s = checkCombatDamageTriggers(s, dmgEvent("atk"));          // a Bear dealt damage; Bear ∉ {Kraken,Leviathan,Octopus,Serpent}
    expect((s.pendingTriggers || []).length).toBe(0);
  });
});
