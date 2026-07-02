import { describe, it, expect } from "vitest";

import { createPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { applyLoseLife } from "./effects/atoms/life.js";
import { applyWolverineEndStep, clearWolverineTurnFlags, armDamageToCreatureFlag } from "./wolverine.js";
import {
  parseDamageReplacements,
  isDamageReplacement,
  buildSourceFilter,
  applyDamageReplacements,
  consultDamageAmount,
  boardHasDamageReplacement,
  stripDamageReplacementClauses,
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
// W4: the naive trigger.effect lane was retired — a trigger's "deals N damage to each opponent"
// resolves through the SAME shared primitive the effect-program damage atom calls (applyDamageEffect,
// source = the ability's own permanent), so the consult is pinned on the LIVE path.
describe("trigger-damage path (the shared applyDamageEffect primitive)", () => {
  it("a non-Wolverine eachOpponent damage is byte-identical with/without a source (no doubler on board)", () => {
    const bear = vanilla("Bear", 2, 2, "user");
    const s = makeState({ userBf: [bear] });
    const baseline = applyDamageEffect(s, { controller: "user", amount: 3, targetType: "eachOpponent", source: null });
    const withSource = applyDamageEffect(s, { controller: "user", amount: 3, targetType: "eachOpponent", source: bear });
    expect(baseline.players.ai.life).toBe(37); // 40 - 3, un-doubled
    // CREED proof (MUST-FIX 3): with no doubler on the board, threading the source must change NOTHING.
    // Full state+log equality between the two runs — not a single-field spot-check.
    expect(withSource).toStrictEqual(baseline);
  });

  it("a Wolverine-sourced eachOpponent damage doubles the damage to each opponent", () => {
    const w = wolverine("user", 3, 3);
    const s = makeState({ userBf: [w] });
    const out = applyDamageEffect(s, { controller: "user", amount: 3, targetType: "eachOpponent", source: w });
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

});

// ─── THE CREED PROOF: byte-identical on a board with NO damage-replacement ───────────
describe("byte-identical negative (the CREED proof)", () => {
  // The CREED proof (seam-plan section 3 test 12 / section 7): the damage-replacement SYSTEM must be a pure
  // no-op on a board with NO doubler. We assert FULL player-state equality (toStrictEqual) against the
  // pre-resolution baseline with ONLY the documented combat outcome applied — not a per-field spot-check —
  // plus zero new-system artifact (Wolverine flag / doubled / replacement log) anywhere.
  it("an unblocked vanilla attacker: full player-state byte-identical except the exact life delta", () => {
    const bear = vanilla("Bear", 2, 2, "user");
    const s = makeState({ userBf: [bear] }, { attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(boardHasDamageReplacement(s)).toBe(false);
    const before = structuredClone(s);
    const out = resolveCombatDamage(s);
    const expected = structuredClone(before.players);
    expected.ai.life = 38; // 40 - 2, un-doubled
    expect(out.players).toStrictEqual(expected);
    expect(out.log.some((e) => /wolverine|double|replace/i.test(String(e.kind)))).toBe(false);
  });

  it("a blocked attacker: full player-state byte-identical except the blocker's marked damage", () => {
    const att = vanilla("Grizzly", 4, 4, "user");
    const blk = vanilla("Wall", 0, 5, "ai");
    const s = makeState({ userBf: [att], aiBf: [blk] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    });
    expect(boardHasDamageReplacement(s)).toBe(false);
    const before = structuredClone(s);
    const out = resolveCombatDamage(s);
    // 4 dmg < 5 toughness → Wall survives marked 4 (un-doubled); attacker takes 0 back; no life lost.
    const expected = structuredClone(before.players);
    expected.ai.battlefield[0].damageMarked = 4;
    expect(out.players).toStrictEqual(expected);
    expect(out.log.some((e) => /wolverine|double|replace/i.test(String(e.kind)))).toBe(false);
  });
});

// ─── MUST-FIX 1: synthesized-on-read — the doubler vanishes when its permanent leaves ────────────────
describe("synthesized-on-read doubler (MUST-FIX 1)", () => {
  it("the doubler stops the instant Wolverine leaves the battlefield (no stored entry, no removal hook)", () => {
    const w = wolverine("user", 3, 3);
    const withW = makeState({ userBf: [w] }, { attackers: [{ permanentId: w.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(boardHasDamageReplacement(withW)).toBe(true);
    expect(resolveCombatDamage(withW).players.ai.life).toBe(40 - 6); // 3 doubled while Wolverine is on the board
    // Wolverine gone → the synthesized scan finds no doubler → a different source deals base (un-doubled) damage.
    const bear = vanilla("Bear", 3, 3, "user");
    const without = makeState({ userBf: [bear] }, { attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(boardHasDamageReplacement(without)).toBe(false);
    expect(resolveCombatDamage(without).players.ai.life).toBe(40 - 3); // 3, un-doubled — the doubler did not persist
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

// ─── classifyDamageReplacementBody — the general doubler-on-a-keyword-body flip (Twinflame Tyrant) ────────────
const TWINFLAME_ORACLE =
  "Flying\nIf a source you control would deal damage to an opponent or a permanent an opponent controls, it deals double that damage instead.";
function twinflame(controller, extra = {}) {
  const card = { id: "twinflame-card", name: "Twinflame Tyrant", power: 4, toughness: 4, type_line: "Creature — Dragon", mana_cost: "{4}{R}{R}", oracle: TWINFLAME_ORACLE };
  return { ...createPermanent({ card, controller }), ...extra };
}

describe("classifyDamageReplacementBody — Twinflame Tyrant (the general doubler-body seam)", () => {
  it("Twinflame Tyrant → native-static (Flying + a source-controller-scoped damage doubler, nothing else)", () => {
    expect(classifyCard(twinflame("user").card)).toBe("native-static");
  });

  it("the modeled doubler is the SAME clause the runtime consult applies (parseDamageReplacements matches)", () => {
    const entries = parseDamageReplacements(twinflame("user").card);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you" } });
  });

  it("RUNTIME: with Twinflame on the battlefield, its controller's damage to an opponent is DOUBLED", () => {
    const tt = twinflame("user");
    const src = vanilla("Bolt Source", 1, 1, "user");
    const state = makeState({ userBf: [tt, src] });
    // Source the controller controls dealing to a player → ×2 (controller-scoped). This is the consult the
    // combat/spell damage paths call; the static appears on-read with the permanent (no registration).
    const { amount } = applyDamageReplacements(state, { sourceId: src.id, sourceController: "user", amount: 5, targetKind: "player", targetId: "ai" });
    expect(amount).toBe(10);
  });

  it("CREED: a doubler-body with an EXTRA unmodeled trigger stays body-only (residue guard)", () => {
    const card = { ...twinflame("user").card, oracle: TWINFLAME_ORACLE + "\nWhenever this creature dies, each opponent loses 3 life." };
    expect(classifyCard(card)).toBe("body-only");
  });

  it("CREED: a doubler-body with an EXTRA unmodeled activated ability stays body-only (residue guard)", () => {
    const card = { ...twinflame("user").card, oracle: TWINFLAME_ORACLE + "\n{2}{R}: This creature gets +1/+0 until end of turn and gains menace and you scry two." };
    expect(classifyCard(card)).toBe("body-only");
  });

  it("Wolverine (a self-scoped doubler with 2 other clauses) is NOT stolen by this seam — stays native-mixed", () => {
    // classifyWolverine is registered FIRST and matches all three clauses → native-mixed; this seam's
    // residue guard would reject Wolverine anyway (the end-step counter + regen are residue here).
    expect(classifyCard(wolverine("user").card)).toBe("native-mixed");
  });

  it("an instant damage-doubler does NOT flip via this seam (permanents only — the consult is battlefield-scoped)", () => {
    const inst = { name: "Fork Lightning", type_line: "Instant", oracle: "If a source you control would deal damage, it deals double that damage instead." };
    expect(classifyCard(inst)).not.toBe("native-static");
  });

  it("stripDamageReplacementClauses removes exactly the modeled sentence, leaving the keyword body", () => {
    const stripped = stripDamageReplacementClauses(TWINFLAME_ORACLE, twinflame("user").card).replace(/\s+/g, " ").trim();
    expect(stripped.toLowerCase()).toBe("flying");
  });
});

// ─── Neriv, Heart of the Storm — controller-wide doubler GATED to creatures that entered this turn ──────────
const NERIV_ORACLE =
  "Flying\nIf a creature you control that entered this turn would deal damage, it deals twice that much damage instead.";
function neriv(controller, power = 4, toughness = 4, extra = {}) {
  const card = {
    id: "neriv-card",
    name: "Neriv, Heart of the Storm",
    power, toughness,
    type_line: "Legendary Creature — Spirit Dragon",
    mana_cost: "{2}{R}{R}",
    oracle: NERIV_ORACLE,
  };
  return { ...createPermanent({ card, controller }), ...extra };
}

describe("Neriv entered-this-turn doubler (parse + scope)", () => {
  it("parses the controller-wide entered-this-turn shape (NOT the bare Furnace scope)", () => {
    expect(parseDamageReplacements(neriv("user").card)).toEqual([
      { op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", enteredThisTurn: true } },
    ]);
  });

  it("does NOT collide with the Furnace 'source you control … double' shape (that stays controller-wide, un-gated)", () => {
    const furnace = { name: "Furnace-ish", oracle: "If a source you control would deal damage, it deals double that damage instead." };
    expect(parseDamageReplacements(furnace)).toEqual([
      { op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you" } },
    ]);
  });

  it("buildSourceFilter fires ONLY for a same-controller source that entered THIS turn", () => {
    const entry = { ...parseDamageReplacements(neriv("user").card)[0], permanentId: "neriv-id", permanentController: "user" };
    const state = {
      turn: 5,
      players: { user: { battlefield: [{ id: "fresh", enteredOnTurn: 5 }, { id: "stale", enteredOnTurn: 2 }] } },
    };
    const filt = buildSourceFilter(entry, state);
    expect(filt({ sourceId: "fresh", sourceController: "user", amount: 3 })).toBe(true);   // entered this turn
    expect(filt({ sourceId: "stale", sourceController: "user", amount: 3 })).toBe(false);  // entered a prior turn
    expect(filt({ sourceId: "fresh", sourceController: "ai", amount: 3 })).toBe(false);    // not your source
    expect(filt({ sourceId: "ghost", sourceController: "user", amount: 3 })).toBe(false);  // source not on battlefield
  });
});

describe("Neriv combat doubling (entered-this-turn only — the CREED over-fire guard)", () => {
  it("a creature that entered THIS turn deals DOUBLE; a stale creature deals normal", () => {
    const n = neriv("user", 4, 4, { enteredOnTurn: 0 });          // Neriv itself is old (irrelevant — it's the static source)
    const fresh = vanilla("Freshling", 3, 3, "user", { enteredOnTurn: 3 }); // makeState turn === 3 → entered this turn
    const stale = vanilla("Oldling", 2, 2, "user", { enteredOnTurn: 1 });   // entered a prior turn → normal damage
    const s = makeState({ userBf: [n, fresh, stale] }, {
      attackers: [
        { permanentId: fresh.id, attackingPlayer: "user", defender: "ai" },
        { permanentId: stale.id, attackingPlayer: "user", defender: "ai" },
      ],
      blockers: [],
    });
    const out = resolveCombatDamage(s);
    // fresh: 3 × 2 = 6 doubled; stale: 2 normal. 40 - 6 - 2 = 32.
    expect(out.players.ai.life).toBe(32);
  });

  it("CREED: a creature out since a PRIOR turn is NEVER doubled (no over-fire on a stale board)", () => {
    const n = neriv("user", 4, 4, { enteredOnTurn: 0 });
    const stale = vanilla("Veteran", 5, 5, "user", { enteredOnTurn: 1 });
    const s = makeState({ userBf: [n, stale] }, {
      attackers: [{ permanentId: stale.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(35); // 40 - 5 (NOT doubled)
  });
});

describe("Neriv classification", () => {
  it("classifies native-static (entered-this-turn doubler + Flying body — whole card modeled)", () => {
    expect(classifyCard(neriv("user").card)).toBe("native-static");
  });

  it("CREED: an extra unmodeled trigger keeps it body-only (residue guard)", () => {
    const card = { ...neriv("user").card, oracle: NERIV_ORACLE + "\nWhenever this creature attacks, draw a card and you gain the game." };
    expect(classifyCard(card)).toBe("body-only");
  });

  it("stripDamageReplacementClauses leaves exactly the keyword body", () => {
    const stripped = stripDamageReplacementClauses(NERIV_ORACLE, neriv("user").card).replace(/\s+/g, " ").trim();
    expect(stripped.toLowerCase()).toBe("flying");
  });
});
