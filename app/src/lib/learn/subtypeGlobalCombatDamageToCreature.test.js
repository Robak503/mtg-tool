/**
 * subtypeGlobalCombatDamageToCreature.test.js — GLOBAL SUBTYPE combat-damage-TO-A-CREATURE triggered ability.
 *
 * Toxin Sliver: "Whenever a Sliver deals combat damage to a creature, destroy that creature. It can't be
 *                regenerated."
 *
 * Like Synapse/Brood (subtypeGlobalDamage.test.js) this is a GLOBAL subtype watcher (no "you control") — it
 * fires off ANY player's Sliver. UNLIKE them the trigger watches combat damage to a CREATURE (not a player),
 * and its effect ("destroy THAT creature") acts on the DAMAGED creature, not the dealing creature's
 * controller. The new scope:"subtypeGlobalToCreature" gates the SUBTYPE on the DEALER while threading the
 * DAMAGED creature as the triggering permanent (→ ctx.triggeringPermanentId → "destroy the triggering
 * creature" → thatCreature). "It can't be regenerated" rides the cannotRegenerate re-stamp.
 *
 * CREED proofs below:
 *  - YOU-control path: a Sliver you control dealing combat damage to an enemy creature → that creature dies.
 *  - GLOBAL path: an OPPONENT's Sliver dealing combat damage to YOUR creature → YOUR creature dies (proving the
 *    scope is GLOBAL, not you-control — a non-global model would silently drop the opponent's-Sliver case).
 *  - It targets the DAMAGED creature, never the dealer (the dealing Sliver survives).
 *  - "can't be regenerated" overrides a regeneration shield (the creature still dies).
 *  - A NON-member creature (a Bear) dealing combat damage to a creature does NOT fire (subtype exact).
 *  - End-to-end through resolveCombatDamage (the real combat path collects the dealer→damaged pair).
 *  - Synapse/Brood (subtypeGlobal to-a-player) + Spawning Kraken (subtypeYouControl) unchanged (must-not-regress).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkCombatDamageToCreatureTriggers, checkCombatDamageTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TOXIN = "Whenever a Sliver deals combat damage to a creature, destroy that creature. It can't be regenerated.";
const SYNAPSE = "Whenever a Sliver deals combat damage to a player, its controller may draw a card.";
const BROOD = "Whenever a Sliver deals combat damage to a player, its controller may create a 1/1 colorless Sliver creature token.";
const KRAKEN = "Whenever a Kraken, Leviathan, Octopus, or Serpent you control deals combat damage to a player, draw a card.";

// A battlefield permanent with a creature subtype (default Sliver). `oracle` empty = a vanilla attacker.
// `over` merges extra fields onto the CARD (power/toughness/name) and onto the PERMANENT (regenShields).
const perm = (id, oracle, controller, type = "Creature — Sliver", over = {}) => {
  const { regenShields, power = 2, toughness = 2, name = id, ...rest } = over;
  const p = createPermanent({ id, card: { id: `c-${id}`, name, type, power, toughness, oracle, ...rest }, controller, summoningSick: false });
  return regenShields != null ? { ...p, regenShields } : p;
};

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
// The dealer→damaged-creature pair exactly as combatResolution feeds checkCombatDamageToCreatureTriggers.
const cdmgCreatureEvent = (dealerId, dealerController, damagedCreatureId) => [{ dealerId, dealerController, damagedCreatureId }];
function resolveStack(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
  return s;
}

describe("GLOBAL SUBTYPE combat-damage-to-a-creature — classification", () => {
  it("Toxin Sliver is a native tier (no longer body-only)", () => {
    expect(classifyCard({ name: "Toxin Sliver", type: "Creature — Sliver", oracle: TOXIN })).toBe("native-trigger");
  });

  it("FN boundary — a you-control / non-subtype / qualified / wrong-effect form stays non-native (no mis-scope)", () => {
    // "you control" (Sosuke) is a different scope — not the global model; plus an end-of-combat rider.
    expect(classifyCard({ name: "Sosuke, Son of Seshiro", type: "Legendary Creature — Snake Warrior", oracle: "Whenever a Warrior you control deals combat damage to a creature, destroy that creature at end of combat." })).toBe("body-only");
    // a card-TYPE word in the subject → parseSubtypeList rejects → non-native (would over-fire on every creature).
    expect(classifyCard({ name: "BadType", type: "Creature — Bear", oracle: "Whenever a creature deals combat damage to a creature, destroy that creature." })).toBe("body-only");
    // a trailing qualifier ("…or planeswalker") fails the end-anchor → non-native (SAFE false-negative).
    expect(classifyCard({ name: "Qual", type: "Creature — Sliver", oracle: "Whenever a Sliver deals combat damage to a creature or planeswalker, destroy that creature." })).toBe("body-only");
    // a different effect ("you draw") on the to-a-creature subject → not the modeled destroy shape → non-native.
    expect(classifyCard({ name: "Hypo", type: "Creature — Sliver", oracle: "Whenever a Sliver deals combat damage to a creature, draw a card." })).toBe("body-only");
  });
});

describe("GLOBAL SUBTYPE combat-damage-to-a-creature — Toxin Sliver destroy fires through the real path", () => {
  it("a Sliver YOU control dealing combat damage to an ENEMY creature → that creature is destroyed", () => {
    let s = stateWith([perm("tox", TOXIN, "user")], [perm("enemy", "", "ai", "Creature — Goblin")]);
    s = checkCombatDamageToCreatureTriggers(s, cdmgCreatureEvent("tox", "user", "enemy"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].context.triggeringPermanentId).toBe("enemy"); // the DAMAGED creature, not the dealer
    s = resolveStack(s);
    expect(findPermanent(s, "enemy")).toBeFalsy();                  // destroyed
    expect((s.players.ai.graveyard || []).map((c) => c.name)).toContain("enemy");
    expect(findPermanent(s, "tox")).toBeTruthy();                   // the dealing Sliver survives — never self-destruct
  });

  it("CREED — an OPPONENT's Sliver dealing combat damage to YOUR creature → YOUR creature is destroyed (GLOBAL, not you-control)", () => {
    // user owns nothing relevant; AI controls the Toxin Sliver. user controls the damaged creature. A
    // you-control model would never fire here — proving the scope is GLOBAL.
    let s = stateWith([perm("mine", "", "user", "Creature — Goblin")], [perm("tox", TOXIN, "ai")]);
    s = checkCombatDamageToCreatureTriggers(s, cdmgCreatureEvent("tox", "ai", "mine"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].context.triggeringPermanentId).toBe("mine"); // YOUR creature is the destroy target
    expect(s.pendingTriggers[0].controller).toBe("ai");                      // beneficiary = the dealer's controller
    s = resolveStack(s);
    expect(findPermanent(s, "mine")).toBeFalsy();                            // YOUR creature died
    expect(findPermanent(s, "tox")).toBeTruthy();                            // the AI's Sliver survives
  });

  it("'can't be regenerated' overrides a regeneration shield — the damaged creature still dies", () => {
    // The damaged creature carries a regeneration shield (regenShields > 0); Toxin's no-regen ignores it.
    let s = stateWith([perm("tox", TOXIN, "user")], [perm("shielded", "", "ai", "Creature — Goblin", { regenShields: 1 })]);
    s = checkCombatDamageToCreatureTriggers(s, cdmgCreatureEvent("tox", "user", "shielded"));
    s = resolveStack(s);
    expect(findPermanent(s, "shielded")).toBeFalsy(); // shield ignored (cannotRegenerate stamped) → destroyed
  });

  it("CREED — a NON-member creature (a Bear) dealing combat damage to a creature does NOT fire the watcher", () => {
    let s = stateWith([perm("tox", TOXIN, "user"), perm("bear", "", "user", "Creature — Bear")], [perm("enemy", "", "ai", "Creature — Goblin")]);
    s = checkCombatDamageToCreatureTriggers(s, cdmgCreatureEvent("bear", "user", "enemy"));
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("the watcher fires for ITSELF when the Toxin Sliver IS the Sliver dealing the creature damage (self-inclusion)", () => {
    // Toxin (a Sliver) blocks/attacks and deals combat damage to an enemy creature → it destroys that creature.
    let s = stateWith([perm("tox", TOXIN, "user")], [perm("enemy", "", "ai", "Creature — Goblin")]);
    s = checkCombatDamageToCreatureTriggers(s, cdmgCreatureEvent("tox", "user", "enemy"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].context.triggeringPermanentId).toBe("enemy");
  });
});

describe("GLOBAL SUBTYPE combat-damage-to-a-creature — end-to-end through resolveCombatDamage", () => {
  it("a Sliver attacker that connects with a blocker destroys that blocker (the real combat pair collection)", () => {
    // Toxin Sliver (3/3 user) attacks; an enemy 2/4 Goblin blocks. Toxin's 3 combat damage doesn't kill a 4-tough
    // by marks, BUT Toxin's trigger destroys it outright (can't be regenerated). Proves the dealer→damaged pair
    // is collected at the real combat-damage chokepoint and the destroy resolves.
    const tox = perm("tox", TOXIN, "user", "Creature — Sliver", { name: "Toxin Sliver", power: 3, toughness: 3 });
    const wall = perm("wall", "", "ai", "Creature — Goblin", { name: "Wall", power: 2, toughness: 4 });
    let s = stateWith([tox], [wall]);
    s = { ...s, combat: { attackers: [{ permanentId: "tox", attackingPlayer: "user", defender: "ai" }], blockers: [{ attackerId: "tox", blockerId: "wall" }] } };
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    // The trigger landed in pendingTriggers off the real combat pair; flush + resolve it.
    expect((s.pendingTriggers || []).length).toBeGreaterThanOrEqual(1);
    s = resolveStack(s);
    expect(findPermanent(s, "wall")).toBeFalsy();   // the blocker that survived marks is destroyed by Toxin
    expect(findPermanent(s, "tox")).toBeTruthy();   // the attacking Sliver (3/3 vs 2 power) survives
  });
});

describe("must-not-regress — subtypeGlobal (to-a-player) + subtypeYouControl unchanged", () => {
  const dmgPlayerEvent = (attackerId, attackingPlayer, defender) => [{ kind: "combat-damage-player", attackerId, attackingPlayer, defender, amount: 2 }];
  function stateWithLib(userBf, aiBf, lib = {}) {
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

  it("Synapse Sliver (subtypeGlobal to-a-player) still fires for the dealer's controller and draws", () => {
    let s = stateWithLib([perm("syn", SYNAPSE, "user"), perm("atk", "", "user")], [], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgPlayerEvent("atk", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    expect(s.players.user.hand.length).toBe(1);
  });

  it("Brood Sliver (subtypeGlobal to-a-player) still fires; an opponent's Sliver makes that opponent the beneficiary", () => {
    let s = stateWithLib([perm("brood", BROOD, "user")], [perm("atk", "", "ai")]);
    s = checkCombatDamageTriggers(s, dmgPlayerEvent("atk", "ai", "user"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("ai");
  });

  it("Spawning Kraken (subtypeYouControl) still native + fires for its controller only", () => {
    expect(classifyCard({ name: "Spawning Kraken", type: "Creature — Kraken", oracle: KRAKEN })).toBe("native-trigger");
    let s = stateWithLib([perm("sk", KRAKEN, "user", "Creature — Kraken"), perm("k1", "", "user", "Creature — Kraken")], [], { user: libN(5) });
    s = checkCombatDamageTriggers(s, dmgPlayerEvent("k1", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(s.pendingTriggers[0].controller).toBe("user");
  });

  it("the to-a-creature path does NOT fire on a to-a-player combat-damage event (event isolation)", () => {
    // A Toxin Sliver dealing combat damage to a PLAYER must not destroy anything (no creature was damaged).
    let s = stateWithLib([perm("tox", TOXIN, "user")], []);
    s = checkCombatDamageTriggers(s, dmgPlayerEvent("tox", "user", "ai"));
    expect((s.pendingTriggers || []).length).toBe(0); // Toxin watches to-a-CREATURE, not to-a-player
  });
});
