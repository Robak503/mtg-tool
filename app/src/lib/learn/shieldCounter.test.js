/**
 * SHIELD COUNTER (CR 122.1c) — the protective counter placed by Titan of Industry's ETB "choose two —"
 * mode ("Put a shield counter on a creature you control") and its clean siblings. A shield counter on a
 * permanent creates a single replacement + a single prevention effect (CR 122.1c):
 *   • "If this permanent would be DESTROYED as the result of an effect, instead REMOVE a shield counter."
 *   • "If DAMAGE would be DEALT to this permanent, PREVENT that damage and REMOVE a shield counter."
 *
 * This suite proves the FOUR gates the mechanic touches:
 *   1. the shield-counter ATOM places a real `shield` counter (parser + resolver);
 *   2. the DESTRUCTION replacement at both destroy sites (applyDestroyEffect + the lethal-damage SBA);
 *   3. the DAMAGE prevention at both damage sites (applyDamageEffect + combat);
 *   4. the coverage FLIP (Titan → native-trigger, Boon of Safety → native-spell) PLUS CREED near-misses
 *      (an unmodeled shield form stays non-native — a partial model would be a forbidden FP).
 */
import { describe, it, expect } from "vitest";

import { createPermanent, destroyLethalCreatures, hasShieldCounter } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect, applyDestroyEffect } from "./spellEffects.js";
import { applyShieldCounter } from "./effects/atoms/counters.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────────
function vanilla(name, power, toughness, controller, extra = {}) {
  const card = { id: `${name}-card`, name, power, toughness, type_line: "Creature" };
  return { ...createPermanent({ card, controller }), ...extra };
}
/** A creature carrying N shield counters (in the standard counters map). */
function shielded(name, power, toughness, controller, n = 1) {
  const p = vanilla(name, power, toughness, controller);
  return { ...p, counters: { ...p.counters, shield: n } };
}
function makeState({ userBf = [], aiBf = [], userLife = 40, aiLife = 40 }, combat) {
  return {
    turn: 3,
    log: [],
    players: {
      user: { life: userLife, battlefield: userBf, graveyard: [], commanderDamageFrom: {} },
      ai: { life: aiLife, battlefield: aiBf, graveyard: [], commanderDamageFrom: {} },
    },
    combat,
  };
}
const C = (type, oracle, extra = {}) => ({ name: "Test", type, oracle, ...extra });

// ─── 1. PARSER + ATOM ───────────────────────────────────────────────────────────
describe("shield-counter clause parser (CR 122.1c)", () => {
  it("parses 'put a shield counter on a creature you control' → scope oneYouControl, HIGH", () => {
    const p = parseEffectClause("Put a shield counter on a creature you control.", "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "shield-counter", scope: "oneYouControl" }]);
  });
  it("parses 'put a shield counter on target creature' → targetType creature, HIGH", () => {
    const p = parseEffectClause("Put a shield counter on target creature.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "shield-counter", targetType: "creature" }]);
  });
  it("CREED near-miss: an UNMODELED shield form stays LOW (→ Arbiter, never a partial model)", () => {
    // Each of these carries cardinality/scope the atom does NOT model — must NOT parse to a shield atom.
    for (const clause of [
      "Put a shield counter on target permanent.",                          // Proud Pack-Rhino mode (permanent)
      "Put a shield counter on each of up to three target creatures.",      // Protection Magic (multi-target)
      "Put another shield counter on target creature you don't control.",   // opponent-side (Kros/Shield Broker shape)
      "Put a shield counter on another target creature you control.",       // Singer of Swift Rivers (another)
      "Put two shield counters on a creature you control.",                 // multi-count
    ]) {
      const p = parseEffectClause(clause, "Instant");
      expect(programConfidence(p)).toBe("low");
      expect((p.atoms || []).some((a) => a.op === "shield-counter")).toBe(false);
    }
  });
});

describe("applyShieldCounter resolver", () => {
  it("scope oneYouControl places one shield counter on the controller's HIGHEST-POWER own creature", () => {
    const small = vanilla("Squire", 1, 1, "user");
    const big = vanilla("Titan", 7, 7, "user");
    const enemy = vanilla("Ogre", 5, 5, "ai");
    const s = makeState({ userBf: [small, big], aiBf: [enemy] });
    const out = applyShieldCounter(s, { op: "shield-counter", scope: "oneYouControl" }, { controller: "user" });
    // The best own creature (highest power) is protected; never an opponent's, never the small one.
    expect(hasShieldCounter(out.players.user.battlefield.find((p) => p.id === big.id))).toBe(true);
    expect(hasShieldCounter(out.players.user.battlefield.find((p) => p.id === small.id))).toBe(false);
    expect(hasShieldCounter(out.players.ai.battlefield.find((p) => p.id === enemy.id))).toBe(false);
  });
  it("empty own board → a clean no-op (never a fabricated counter)", () => {
    const s = makeState({ userBf: [], aiBf: [vanilla("Ogre", 5, 5, "ai")] });
    const out = applyShieldCounter(s, { op: "shield-counter", scope: "oneYouControl" }, { controller: "user" });
    expect(out.players.ai.battlefield.every((p) => !hasShieldCounter(p))).toBe(true);
  });
  it("targetType creature places a shield on each chosen target", () => {
    const bear = vanilla("Bear", 2, 2, "user");
    const s = makeState({ userBf: [bear] });
    const out = applyShieldCounter(s, { op: "shield-counter", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: bear.id }] });
    expect(hasShieldCounter(out.players.user.battlefield[0])).toBe(true);
  });
});

// ─── 2. DESTRUCTION replacement (CR 122.1c) ──────────────────────────────────────
describe("shield counter replaces DESTRUCTION (CR 122.1c)", () => {
  it("a destroy effect removes a shield counter INSTEAD of killing (no dies, one shield consumed)", () => {
    const bear = shielded("Bear", 2, 2, "user", 1);
    const s = makeState({ userBf: [bear] });
    const out = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: bear.id }] });
    const live = out.players.user.battlefield.find((p) => p.id === bear.id);
    expect(live).toBeTruthy();                       // survived
    expect(hasShieldCounter(live)).toBe(false);       // the shield was consumed
    expect(out.players.user.graveyard.some((c) => c.id === bear.card.id)).toBe(false); // never died
  });
  it("a 'can't be regenerated' destroy STILL removes a shield counter (the rider is regen-specific, CR 122.1c)", () => {
    const bear = shielded("Bear", 2, 2, "user", 1);
    const s = makeState({ userBf: [bear] });
    const out = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: bear.id }], cannotRegenerate: true });
    expect(out.players.user.battlefield.some((p) => p.id === bear.id)).toBe(true); // shield still saved it
  });
  it("a second destroy (shield already spent) kills the creature", () => {
    const bear = shielded("Bear", 2, 2, "user", 1);
    let s = makeState({ userBf: [bear] });
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: bear.id }] });
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: bear.id }] });
    expect(s.players.user.battlefield.some((p) => p.id === bear.id)).toBe(false); // dead now
  });
  it("the lethal-damage SBA consumes a shield instead of destroying (no tap — unlike regen)", () => {
    // 2/2 with a shield, carrying 2 marked damage (bypassing the prevention site) — the SBA sees lethal.
    const bear = { ...shielded("Bear", 2, 2, "user", 1), damageMarked: 2 };
    const s = makeState({ userBf: [bear] });
    const { state: out } = destroyLethalCreatures(s);
    const live = out.players.user.battlefield.find((p) => p.id === bear.id);
    expect(live).toBeTruthy();                    // survived the lethal SBA
    expect(hasShieldCounter(live)).toBe(false);   // shield consumed
    expect(live.tapped).toBeFalsy();              // shield does NOT tap (a regen shield would)
  });
});

// ─── 3. DAMAGE prevention (CR 122.1c) ────────────────────────────────────────────
describe("shield counter PREVENTS damage (CR 122.1c)", () => {
  it("a direct-damage spell is prevented and one shield is removed (no marked damage)", () => {
    const bear = shielded("Bear", 2, 2, "user", 1);
    const s = makeState({ userBf: [bear] });
    const out = applyDamageEffect(s, { controller: "ai", amount: 5, targets: [{ type: "creature", id: bear.id }], targetType: "creature" });
    const live = out.players.user.battlefield.find((p) => p.id === bear.id);
    expect(live).toBeTruthy();                     // survived (5 damage prevented on a 2/2)
    expect(live.damageMarked || 0).toBe(0);        // nothing marked
    expect(hasShieldCounter(live)).toBe(false);    // shield consumed
  });
  it("combat damage to a shielded blocker is prevented (blocker survives, shield consumed)", () => {
    const attacker = vanilla("Ogre", 5, 5, "ai");
    const blocker = shielded("Wall", 0, 3, "user", 1);
    const s = makeState(
      { userBf: [blocker], aiBf: [attacker] },
      { attackers: [{ permanentId: attacker.id, attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: blocker.id, attackerId: attacker.id }] },
    );
    const out = resolveCombatDamage(s);
    const live = out.players.user.battlefield.find((p) => p.id === blocker.id);
    expect(live).toBeTruthy();                     // 5-power attacker's damage prevented on a 0/3
    expect(live.damageMarked || 0).toBe(0);
    expect(hasShieldCounter(live)).toBe(false);    // one shield consumed for the whole (simultaneous) event
  });
  it("an attacker's lifelink does NOT gain life when its combat damage to a shielded blocker is prevented (CR 120.8)", () => {
    const attacker = { ...vanilla("Vamp", 5, 5, "ai"), card: { ...vanilla("Vamp", 5, 5, "ai").card, keywords: ["Lifelink"], oracle: "Lifelink" } };
    const blocker = shielded("Wall", 0, 6, "user", 1);
    const s = makeState(
      { userBf: [blocker], aiBf: [attacker], aiLife: 20 },
      { attackers: [{ permanentId: attacker.id, attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: blocker.id, attackerId: attacker.id }] },
    );
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(20); // no lifelink — the 5 damage was prevented, 0 dealt
  });
});

// ─── 4. COVERAGE FLIP + intent ───────────────────────────────────────────────────
describe("coverage classification (the flip)", () => {
  it("Titan of Industry flips to native-trigger (all four ETB modes modeled, incl. shield counter)", () => {
    const titan = C(
      "Creature — Elemental",
      "Reach, trample\nWhen this creature enters, choose two —\n• Destroy target artifact or enchantment.\n• Target player gains 5 life.\n• Create a 4/4 green Rhino Warrior creature token.\n• Put a shield counter on a creature you control.",
    );
    expect(classifyCard(titan)).toBe("native-trigger");
  });
  it("Boon of Safety flips native (shield-on-target + scry, a clean spell)", () => {
    const boon = C("Instant", "Put a shield counter on target creature. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)\nScry 1.");
    expect(classifyCard(boon)).toBe("native-spell");
  });
  it("CREED: a modal ETB with an UNMODELED shield form (on target permanent) stays non-native", () => {
    // Proud Pack-Rhino's real "on target permanent" mode is NOT modeled → the whole modal stays body-only.
    const packRhino = C(
      "Creature — Rhino",
      "When this creature enters, choose one —\n• Put a shield counter on target permanent.\n• Proliferate.",
    );
    expect(classifyCard(packRhino)).toBe("body-only");
  });
  it("gain-life to a target player is OWN-intent (beneficial — the controller targets itself)", () => {
    expect(atomTargetIntent({ op: "gain-life", who: "target", targetType: "player" })).toBe("own");
  });
});
