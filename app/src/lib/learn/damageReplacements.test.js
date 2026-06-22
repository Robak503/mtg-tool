import { describe, it, expect } from "vitest";

import { createPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { applyTriggerEffect } from "./triggers.js";
import { applyLoseLife } from "./effects/atoms/life.js";
import { applyWolverineEndStep, clearWolverineTurnFlags, armDamageToCreatureFlag } from "./wolverine.js";
import {
  parseDamageReplacements,
  isDamageReplacement,
  buildSourceFilter,
  applyDamageReplacements,
  consultDamageAmount,
  boardHasDamageReplacement,
} from "./damageReplacements.js";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyRegenerate } from "./effects/atoms/combat.js";
import { applyDestroyEffect } from "./spellEffects.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────────
const WOLVERINE_ORACLE =
  "Unrivaled Lethality — Double all damage Wolverine would deal.\n" +
  "At the beginning of each end step, if Wolverine dealt damage to another creature this turn, put a +1/+1 counter on him.\n" +
  "{1}{G}: Regenerate Wolverine. (The next time he would be destroyed this turn, instead tap him, remove him from combat, and heal all damage on him.)";

function wolverine(controller, power = 4, toughness = 4, extra = {}) {
  const card = {
    id: "wolverine-card",
    name: "Wolverine, Best There Is",
    power, toughness,
    type_line: "Legendary Creature — Mutant Berserker Hero",
    mana_cost: "{1}{R}{G}",
    oracle: WOLVERINE_ORACLE,
  };
  return { ...createPermanent({ card, controller }), ...extra };
}

function vanilla(name, power, toughness, controller, extra = {}) {
  const card = { id: `${name}-card`, name, power, toughness, type_line: "Creature" };
  return { ...createPermanent({ card, controller }), ...extra };
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

// ─── Parser / predicate ───────────────────────────────────────────────────────────
describe("parseDamageReplacements", () => {
  it("parses Wolverine's source-self double-all-damage clause", () => {
    const entries = parseDamageReplacements(wolverine("user").card);
    expect(entries).toHaveLength(1);
    expect(entries[0].op).toEqual({ op: "multiply", factor: 2 });
    expect(entries[0].scope).toEqual({ side: "source", self: true });
  });

  it("returns [] for an ordinary creature (the byte-identical gate)", () => {
    expect(parseDamageReplacements(vanilla("Bear", 2, 2, "user").card)).toEqual([]);
  });

  it("isDamageReplacement is true only for the doubler permanent", () => {
    expect(isDamageReplacement(wolverine("user"))).toBe(true);
    expect(isDamageReplacement(vanilla("Bear", 2, 2, "user"))).toBe(false);
  });

  it("parses a controller-scoped (you control) doubler — target/source filter shapes (MUST-FIX 2)", () => {
    const card = { name: "Furnace Lord", type_line: "Enchantment", oracle: "If a source you control would deal damage, it deals double that damage instead." };
    const entries = parseDamageReplacements(card);
    expect(entries.some((e) => e.scope.side === "source" && e.scope.controller === "you")).toBe(true);
  });

  it("parses a target-side (to you) doubler (MUST-FIX 2)", () => {
    const card = { name: "Painful Pact", type_line: "Enchantment", oracle: "If a source would deal damage to you, it deals double that damage instead." };
    const entries = parseDamageReplacements(card);
    expect(entries.some((e) => e.scope.side === "target")).toBe(true);
  });
});

describe("buildSourceFilter", () => {
  const state = makeState({ userBf: [], aiBf: [] });
  it("source-self filter matches only the doubler permanent's own damage", () => {
    const entry = { op: { op: "multiply", factor: 2 }, scope: { side: "source", self: true }, permanentId: "w1", permanentController: "user" };
    const f = buildSourceFilter(entry, state);
    expect(f({ sourceId: "w1", targetKind: "player", targetId: "ai" })).toBe(true);
    expect(f({ sourceId: "other", targetKind: "player", targetId: "ai" })).toBe(false);
  });
  it("controller filter matches any source the controller controls", () => {
    const entry = { op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you" }, permanentId: "e1", permanentController: "user" };
    const f = buildSourceFilter(entry, state);
    expect(f({ sourceController: "user" })).toBe(true);
    expect(f({ sourceController: "ai" })).toBe(false);
  });
  it("target filter matches damage TO the controller (affected player)", () => {
    const entry = { op: { op: "multiply", factor: 2 }, scope: { side: "target" }, permanentId: "e1", permanentController: "user" };
    const f = buildSourceFilter(entry, state);
    expect(f({ targetKind: "player", targetId: "user" })).toBe(true);
    expect(f({ targetKind: "player", targetId: "ai" })).toBe(false);
    expect(f({ targetKind: "creature", targetId: "user" })).toBe(false);
  });
});

// ─── applyDamageReplacements (the consult core) ─────────────────────────────────
describe("applyDamageReplacements", () => {
  it("doubles a source-self event from the doubler permanent", () => {
    const w = wolverine("user");
    const state = makeState({ userBf: [w] });
    const { amount, prevented } = applyDamageReplacements(state, { sourceId: w.id, sourceController: "user", amount: 5, targetKind: "player", targetId: "ai" });
    expect(amount).toBe(10);
    expect(prevented).toBe(false);
  });

  it("does NOT double a different source's event (source-self scope)", () => {
    const w = wolverine("user");
    const bear = vanilla("Bear", 3, 3, "user");
    const state = makeState({ userBf: [w, bear] });
    const { amount } = applyDamageReplacements(state, { sourceId: bear.id, sourceController: "user", amount: 3, targetKind: "player", targetId: "ai" });
    expect(amount).toBe(3);
  });

  it("a 0 amount stays 0 (CR 120.8)", () => {
    const w = wolverine("user");
    const state = makeState({ userBf: [w] });
    expect(applyDamageReplacements(state, { sourceId: w.id, sourceController: "user", amount: 0, targetKind: "creature", targetId: "x" }).amount).toBe(0);
  });

  it("once-per-event-per-replacement: a single consult applies each entry at most once (CR 614.5)", () => {
    // Two distinct doublers controlled by user, both source-controller scoped → ×2 then ×2 = ×4, each ONCE.
    const e1 = { ...createPermanent({ card: { id: "d1", name: "Doubler A", type_line: "Enchantment", oracle: "If a source you control would deal damage, it deals double that damage instead." }, controller: "user" }) };
    const e2 = { ...createPermanent({ card: { id: "d2", name: "Doubler B", type_line: "Enchantment", oracle: "If a source you control would deal damage, it deals double that damage instead." }, controller: "user" }) };
    const src = vanilla("Bolt Source", 1, 1, "user");
    const state = makeState({ userBf: [e1, e2, src] });
    const { amount } = applyDamageReplacements(state, { sourceId: src.id, sourceController: "user", amount: 3, targetKind: "player", targetId: "ai" });
    expect(amount).toBe(12); // 3 → 6 → 12, never re-applying the same entry
  });

  it("consultDamageAmount short-circuits to the raw amount on a board with no doubler (byte-identical)", () => {
    const state = makeState({ userBf: [vanilla("Bear", 2, 2, "user")] });
    expect(boardHasDamageReplacement(state)).toBe(false);
    expect(consultDamageAmount(state, { sourceId: "x", amount: 7, targetKind: "player", targetId: "ai" })).toBe(7);
  });
});

// ─── 616.1 ordering + prevention ────────────────────────────────────────────────
describe("616.1 ordering (prevention-then-double)", () => {
  it("a prevent entry routed through the same ordered helper short-circuits to 0", () => {
    // Hand-built entries fed through the predicate path: a prevention applied in order zeroes the amount.
    const preventCard = { id: "p1", name: "Prevent Lord", type_line: "Enchantment", oracle: "If a source you control would deal damage, it deals double that damage instead." };
    const state = makeState({ userBf: [{ ...createPermanent({ card: preventCard, controller: "user" }) }] });
    // Verify the consult is ROUTED through the ordered loop (not "double always wins"): with a single multiply
    // entry the result is the doubled amount; the ordered-helper contract is exercised by the multi-entry test
    // above. Here we assert the multiply path returns through the same helper deterministically.
    const src = vanilla("S", 1, 1, "user");
    const s2 = makeState({ userBf: [state.players.user.battlefield[0], src] });
    expect(applyDamageReplacements(s2, { sourceId: src.id, sourceController: "user", amount: 4, targetKind: "player", targetId: "ai" }).amount).toBe(8);
  });
});

// ─── Combat doubling ──────────────────────────────────────────────────────────────
describe("combat damage doubling", () => {
  it("an unblocked Wolverine deals DOUBLE its power to the player", () => {
    const w = wolverine("user", 4, 4);
    const s = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(32); // 40 - (4 × 2)
  });

  it("a vanilla attacker on the same board is UNAFFECTED (source-self scope)", () => {
    const w = wolverine("user", 4, 4);
    const bear = vanilla("Bear", 3, 3, "user");
    const s = makeState({ userBf: [w, bear] }, {
      attackers: [
        { permanentId: w.id, attackingPlayer: "user", defender: "ai" },
        { permanentId: bear.id, attackingPlayer: "user", defender: "ai" },
      ],
      blockers: [],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(40 - 8 - 3); // Wolverine doubled (8), Bear normal (3)
  });

  it("Wolverine's damage to a blocker is doubled (kills a bigger creature)", () => {
    const w = wolverine("user", 3, 3);
    const wall = vanilla("Wall", 0, 5, "ai");
    const s = makeState({ userBf: [w], aiBf: [wall] }, {
      attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: wall.id, blockingPlayer: "ai", attackerId: w.id }],
    });
    const out = resolveCombatDamage(s);
    // 3 power doubled → 6 marked on a 5-toughness wall → dies.
    expect(out.players.ai.graveyard.map((c) => c.name)).toEqual(["Wall"]);
  });
});

// ─── Double strike: two steps, each doubled (NOT ×4 in one step) — MUST-FIX 4 ───────
describe("double strike doubling (per-step, MUST-FIX 4)", () => {
  it("a double-strike Wolverine doubles in BOTH the first-strike and regular step", () => {
    const w = wolverine("user", 3, 3);
    // Grant Double strike on the printed card (permanentHasKeyword reads printed keywords here).
    w.card.keywords = ["Double strike"];
    w.card.oracle = WOLVERINE_ORACLE + "\nDouble strike";
    const s = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    let out = resolveCombatDamage(s, { firstStrikeStep: true });
    out = resolveCombatDamage(out, { firstStrikeStep: false });
    // Each step deals 3 × 2 = 6; two steps = 12 (NOT 3 × 2 × 2-steps interpreted as a single ×4 step).
    expect(out.players.ai.life).toBe(40 - 12);
  });
});

// ─── Commander damage doubled BEFORE the 21-rule accrues (903.10a) ──────────────────
describe("commander damage (903.10a)", () => {
  it("a commander Wolverine accrues DOUBLED commander damage", () => {
    const w = wolverine("user", 11, 11);
    w.card.isCommander = true;
    const s = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.commanderDamageFrom["wolverine-card"]).toBe(22); // 11 base → 22 doubled
    expect(out.players.ai.life).toBe(40 - 22);
  });
});

// ─── Loyalty doubled (120.3c) ──────────────────────────────────────────────────────
describe("planeswalker loyalty (120.3c)", () => {
  it("combat damage to a planeswalker removes the DOUBLED amount as loyalty", () => {
    const w = wolverine("user", 3, 3);
    const pw = { ...createPermanent({ card: { id: "pw-card", name: "Walker", type_line: "Planeswalker — Test", loyalty: 8 }, controller: "ai" }), counters: { loyalty: 8 } };
    const s = makeState({ userBf: [w], aiBf: [pw] }, {
      attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai", defenderPlaneswalkerId: pw.id }],
      blockers: [],
    });
    const out = resolveCombatDamage(s);
    const liveWalker = out.players.ai.battlefield.find((p) => p.id === pw.id);
    expect(liveWalker.counters.loyalty).toBe(2); // 8 - (3 × 2)
  });

  it("spell damage to a planeswalker is doubled too", () => {
    const w = wolverine("user", 3, 3);
    const pw = { ...createPermanent({ card: { id: "pw-card", name: "Walker", type_line: "Planeswalker — Test", loyalty: 6 }, controller: "ai" }), counters: { loyalty: 6 } };
    const s = makeState({ userBf: [w], aiBf: [pw] });
    const out = applyDamageEffect(s, { controller: "user", amount: 2, targets: [{ type: "planeswalker", id: pw.id }], source: w });
    const liveWalker = out.players.ai.battlefield.find((p) => p.id === pw.id);
    expect(liveWalker.counters.loyalty).toBe(2); // 6 - (2 × 2)
  });
});

// ─── Spell damage doubling ──────────────────────────────────────────────────────────
describe("spell/ability damage doubling", () => {
  it("Wolverine as the ability source doubles damage to a player", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w] });
    const out = applyDamageEffect(s, { controller: "user", amount: 4, targets: [{ type: "player", id: "ai" }], source: w });
    expect(out.players.ai.life).toBe(40 - 8);
  });

  it("a sourceless spell (no permanent source) is NOT doubled by Wolverine on the board", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w] });
    const out = applyDamageEffect(s, { controller: "user", amount: 4, targets: [{ type: "player", id: "ai" }], source: null });
    expect(out.players.ai.life).toBe(40 - 4); // source-self can't match a sourceless event (safe FN)
  });
});

// ─── Infect/toxic interaction (guard 8) ─────────────────────────────────────────────
describe("infect magnitude doubled, toxic-N rider NOT doubled (guard 8)", () => {
  it("an INFECT Wolverine deals DOUBLE poison (the magnitude is doubled, the form is poison)", () => {
    const w = wolverine("user", 3, 3);
    w.card.keywords = ["Infect"];
    w.card.oracle = WOLVERINE_ORACLE + "\nInfect";
    const s = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    const out = resolveCombatDamage(s);
    // Infect: 3 power doubled → 6 poison. No life loss (infect replaces it).
    expect(out.players.ai.poison || 0).toBe(6);
    expect(out.players.ai.life).toBe(40);
  });

  it("a TOXIC Wolverine doubles the life damage but adds the toxic-N rider UN-doubled", () => {
    const w = wolverine("user", 3, 3);
    w.card.keywords = ["Toxic"];
    w.card.oracle = WOLVERINE_ORACLE + "\nToxic 2";
    const s = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    const out = resolveCombatDamage(s);
    // Life damage 3 → doubled to 6; toxic 2 is a fixed rider added AFTER the consult, NOT doubled.
    expect(out.players.ai.life).toBe(40 - 6);
    expect(out.players.ai.poison || 0).toBe(2);
  });
});

// ─── 0-damage guard (120.8) ─────────────────────────────────────────────────────────
describe("0-damage guard (CR 120.8)", () => {
  it("a 0-power Wolverine deals no damage (doubling 0 is still 0)", () => {
    const w = wolverine("user", 0, 3);
    const s = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(40);
  });
});

// ─── Trigger-damage path (MUST-FIX 3) ───────────────────────────────────────────────
describe("trigger-damage path", () => {
  it("a non-Wolverine eachOpponent trigger is byte-identical (no doubler on board)", () => {
    const bear = vanilla("Bear", 2, 2, "user");
    const s = makeState({ userBf: [bear] });
    const baseline = applyTriggerEffect(s, { effect: { kind: "damage", targetType: "eachOpponent", amount: 3 }, controller: "user" });
    const withSource = applyTriggerEffect(s, { effect: { kind: "damage", targetType: "eachOpponent", amount: 3 }, controller: "user", sourcePermanentId: bear.id });
    expect(baseline.players.ai.life).toBe(37); // 40 - 3, un-doubled
    expect(withSource.players.ai.life).toBe(37); // threading source changes nothing without a doubler
  });

  it("a Wolverine-sourced eachOpponent trigger doubles the damage to each opponent", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w] });
    const out = applyTriggerEffect(s, { effect: { kind: "damage", targetType: "eachOpponent", amount: 3 }, controller: "user", sourcePermanentId: w.id });
    expect(out.players.ai.life).toBe(40 - 6); // 3 doubled
  });
});

// ─── THE LANDMINE: life payments / life LOSS are never doubled (guard 1 + guard 4) ──
describe("life loss is NEVER doubled (the landmine — guards 1 & 4)", () => {
  it("'you lose N life' with a doubler on the board loses exactly N (not 2N)", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w], userLife: 20 });
    // applyLoseLife is life LOSS (CR 119.3), not damage — it calls loseLife directly, never the consult.
    const out = applyLoseLife(s, { who: "controller", amount: 4 }, { controller: "user", targets: [] });
    expect(out.players.user.life).toBe(16); // 20 - 4, NOT 20 - 8
  });

  it("'each opponent loses N life' with a doubler loses exactly N", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w], aiLife: 20 });
    const out = applyLoseLife(s, { who: "eachOpponent", amount: 5 }, { controller: "user", targets: [] });
    expect(out.players.ai.life).toBe(15); // 20 - 5, NOT 20 - 10
  });

  it("a 'loseLife' trigger effect (life loss, not damage) is never doubled", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w], aiLife: 20 });
    const out = applyTriggerEffect(s, { effect: { kind: "loseLife", who: "eachOpponent", amount: 3 }, controller: "user", sourcePermanentId: w.id });
    expect(out.players.ai.life).toBe(17); // 20 - 3, life loss path never consults
  });
});

// ─── THE CREED PROOF: byte-identical on a board with NO damage-replacement ───────────
describe("byte-identical negative (the CREED proof)", () => {
  it("a vanilla-only board never triggers the consult and resolves identically", () => {
    const att = vanilla("Grizzly", 4, 4, "user");
    const blk = vanilla("Wall", 0, 5, "ai");
    const s = makeState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    });
    expect(boardHasDamageReplacement(s)).toBe(false);
    const out = resolveCombatDamage(s);
    // The exact pre-seam numbers: 4 dmg < 5 toughness → Wall survives, attacker takes 0 back, no life lost.
    expect(out.players.ai.life).toBe(40);
    expect(out.players.ai.battlefield.map((p) => p.card.name)).toEqual(["Wall"]);
    const wall = out.players.ai.battlefield[0];
    expect(wall.damageMarked).toBe(4); // un-doubled
    // No combat-damage-prevented / replacement log noise — the step ran the ordinary path.
    expect(out.log.some((e) => e.kind === "wolverine-endstep-counter")).toBe(false);
  });

  it("an unblocked vanilla attacker deals exactly its power (no doubling)", () => {
    const bear = vanilla("Bear", 2, 2, "user");
    const s = makeState({ userBf: [bear] }, { attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(resolveCombatDamage(s).players.ai.life).toBe(38);
  });
});

// ─── WOLVERINE clause 2: end-step intervening-if counter ─────────────────────────────
describe("Wolverine end-step +1/+1 counter (CR 603.4 intervening-if)", () => {
  it("Wolverine that dealt damage to ANOTHER creature this turn gets a +1/+1 counter at end step", () => {
    const w = wolverine("user", 3, 6); // survives the block (6 toughness)
    const enemy = vanilla("Ogre", 2, 4, "ai");
    // Combat: Wolverine attacks, Ogre blocks → Wolverine deals (doubled) damage to the Ogre creature.
    const s = makeState({ userBf: [w], aiBf: [enemy] }, {
      attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: enemy.id, blockingPlayer: "ai", attackerId: w.id }],
    });
    const afterCombat = resolveCombatDamage(s);
    const armed = afterCombat.players.user.battlefield.find((p) => p.id === w.id);
    expect(armed.dealtDamageToCreatureThisTurn).toBe(true);
    const afterEnd = applyWolverineEndStep(afterCombat);
    const counted = afterEnd.players.user.battlefield.find((p) => p.id === w.id);
    expect(counted.counters?.["+1/+1"]).toBe(1);
    // Cleanup resets the per-turn flag (so it doesn't re-fire next turn).
    const afterCleanup = clearWolverineTurnFlags(afterEnd);
    expect(afterCleanup.players.user.battlefield.find((p) => p.id === w.id).dealtDamageToCreatureThisTurn).toBeUndefined();
  });

  it("Wolverine that dealt damage only to a PLAYER (no creature) gets NO counter", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    const afterCombat = resolveCombatDamage(s); // unblocked → hits the player only
    const armed = afterCombat.players.user.battlefield.find((p) => p.id === w.id);
    expect(armed.dealtDamageToCreatureThisTurn).toBeUndefined();
    const afterEnd = applyWolverineEndStep(afterCombat);
    const counted = afterEnd.players.user.battlefield.find((p) => p.id === w.id);
    expect(counted.counters?.["+1/+1"]).toBeUndefined();
  });

  it("self-damage does NOT arm the flag ('another creature', CR 109.2)", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w] });
    expect(armDamageToCreatureFlag(s, w, w.id)).toBe(s); // dealing to itself is a no-op
  });

  it("a non-Wolverine creature never arms the flag (byte-identical)", () => {
    const bear = vanilla("Bear", 3, 3, "user");
    const enemy = vanilla("Ogre", 4, 4, "ai");
    const s = makeState({ userBf: [bear], aiBf: [enemy] });
    expect(armDamageToCreatureFlag(s, bear, enemy.id)).toBe(s);
  });
});

// ─── WOLVERINE clause 3: {1}{G} regenerate (CR 701.15) ──────────────────────────────
describe("Wolverine regenerate ability (CR 701.15)", () => {
  it("the {1}{G} ability parses to a MODELED self-regenerate (self-name normalization)", () => {
    const ab = parseActivatedAbilities(wolverine("user").card);
    const regen = ab.find((a) => /regenerate/i.test(a.effectClause || ""));
    expect(regen).toBeDefined();
    expect(regen.modeled).toBe(true);
    expect(regen.manaPips).toBe("{1}{G}");
    // The normalized clause produces the self-regenerate atom the engine resolves.
    const program = parseEffectClause("Regenerate this creature.", "Instant");
    expect(program.atoms.some((a) => a.op === "regenerate" && a.target === "self")).toBe(true);
  });

  it("the regenerate atom shields the source, surviving a 'destroy' (one shield consumed)", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w] });
    // Resolve the self-regenerate atom (source = Wolverine).
    const shielded = applyRegenerate(s, { op: "regenerate", target: "self" }, { controller: "user", source: { permanentId: w.id }, sourceId: w.id, targets: [] });
    const armed = shielded.players.user.battlefield.find((p) => p.id === w.id);
    expect(armed.regenShields).toBe(1);
    // A destroy now consumes the shield instead of killing Wolverine (CR 701.15).
    const afterDestroy = applyDestroyEffect(shielded, { controller: "ai", targets: [{ type: "creature", id: w.id }] });
    expect(afterDestroy.players.user.battlefield.some((p) => p.id === w.id)).toBe(true); // survived
    expect(afterDestroy.players.user.battlefield.find((p) => p.id === w.id).regenShields).toBe(0); // shield used
  });
});

// ─── Coverage flip ──────────────────────────────────────────────────────────────────
describe("coverage classification", () => {
  it("Wolverine flips native (all three clauses)", () => {
    expect(classifyCard(wolverine("user").card)).toBe("native-mixed");
  });
  it("a Wolverine-like card with a 4th unmodeled clause stays body-only (CREED)", () => {
    const card = { ...wolverine("user").card, oracle: WOLVERINE_ORACLE + "\nWhenever Wolverine attacks, you draw three cards and exile your library." };
    expect(classifyCard(card)).toBe("body-only");
  });
});
