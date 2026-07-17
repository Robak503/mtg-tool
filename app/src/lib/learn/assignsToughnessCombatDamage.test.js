/**
 * assignsToughnessCombatDamage.test.js — BLITZ DN-1: the Doran family.
 *
 * "<subject> assigns combat damage equal to its toughness rather than its power" (modifies CR 510.1a — combat
 * damage is otherwise assigned equal to power) — a rule-modifying static that changes the AMOUNT of combat
 * damage a creature assigns (its layer-aware effective TOUGHNESS in place of its power). staticAbilityParser
 * recognizes the UNCONDITIONAL board-static
 * scopes (global "each creature", controller "each creature you control", a per-creature toughness>power
 * predicate, and self "this creature"); layers.assignsCombatDamageWithToughness reads the live static via the
 * shared selector machinery; combatResolution.resolveCombatDamage substitutes the amount at both deal sites.
 *
 * CREED: false NEGATIVE safe, false POSITIVE forbidden, whole-card-or-park. A carrier flips native ONLY when
 * its WHOLE body clears (Doran = vanilla + the static; Belligerent Brontodon = controller-scoped vanilla;
 * Ancient Lumberknot = the toughness>power predicate). Carriers with an unmodeled rider (Arcades' defender
 * grant, Assault Formation's activated abilities, Baldin's "during your turn" gate, Streetwise's Backup) stay
 * body-only — the static is still faithfully modeled for RUNTIME, but the card isn't claimed native.
 *
 * The no-static combat path is BYTE-IDENTICAL: assignsCombatDamageWithToughness returns false on the empty
 * board, so the substitution branch collapses to the exact `Math.max(0, creaturePower(...))` the deal sites
 * used before this seam (pinned directly in "byte-identical without a static" below).
 */

import { describe, it, expect, beforeEach } from "vitest";

import { createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle text (verified against the bundled Scryfall snapshot via publicCard).
const DORAN = "Each creature assigns combat damage equal to its toughness rather than its power.";
const BRONTODON = "Each creature you control assigns combat damage equal to its toughness rather than its power.";
const LUMBERKNOT = "Each creature you control with toughness greater than its power assigns combat damage equal to its toughness rather than its power.";

function perm(name, power, toughness, controller, { oracle = "", keywords = [] } = {}) {
  return createPermanent({
    card: { id: `${name}-card`, name, power, toughness, type_line: "Creature", oracle, keywords },
    controller,
  });
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
const onBf = (s, pid) => s.players[pid].battlefield.map(p => p.card.name);
const inGy = (s, pid) => s.players[pid].graveyard.map(c => c.name);

// ─────────────────────────────── RECOGNITION (metric) ───────────────────────────────

describe("DN-1 recognition — the whole-card flips", () => {
  it("Doran, the Siege Tower → native-static (global, any controller)", () => {
    const c = { id: "doran", name: "Doran, the Siege Tower", type: "Legendary Creature — Treefolk Shaman", power: 0, toughness: 5, oracle: DORAN };
    expect(classifyCard(c)).toBe("native-static");
    const st = parseStaticAbilities(c).filter(s => s.op?.layerOp === "assignsCombatDamageWithToughness");
    expect(st).toHaveLength(1);
    expect(st[0].affects).toEqual({ mode: "dynamic", selector: { cardTypes: ["Creature"] } });
  });

  it("Belligerent Brontodon → native-static (creatures you control)", () => {
    const c = { id: "bronto", name: "Belligerent Brontodon", type: "Creature — Dinosaur", power: 2, toughness: 6, oracle: BRONTODON };
    expect(classifyCard(c)).toBe("native-static");
    const st = parseStaticAbilities(c).filter(s => s.op?.layerOp === "assignsCombatDamageWithToughness");
    expect(st[0].affects).toEqual({ mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"] } });
  });

  it("Ancient Lumberknot → native-static (toughness>power predicate)", () => {
    const c = { id: "lumber", name: "Ancient Lumberknot", type: "Creature — Treefolk", power: 0, toughness: 5, oracle: LUMBERKNOT };
    expect(classifyCard(c)).toBe("native-static");
    const st = parseStaticAbilities(c).filter(s => s.op?.layerOp === "assignsCombatDamageWithToughness");
    expect(st[0].affects).toEqual({ mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], toughnessGreaterThanPower: true } });
  });
});

describe("DN-1 recognition — the CREED parks (whole-card law)", () => {
  it("Arcades, the Strategist stays body-only — the 'with defender … and can attack' compound is unmodeled", () => {
    const c = { id: "arcades", name: "Arcades, the Strategist", type: "Legendary Creature — Elder Dragon", power: 3, toughness: 5,
      oracle: "Flying, vigilance\nWhenever a creature you control with defender enters, draw a card.\nEach creature you control with defender assigns combat damage equal to its toughness rather than its power and can attack as though it didn't have defender." };
    expect(classifyCard(c)).toBe("body-only");
    // The compound clause is NOT matched as an unconditional static (no phantom flip).
    expect(parseStaticAbilities(c).filter(s => s.op?.layerOp === "assignsCombatDamageWithToughness")).toHaveLength(0);
  });

  it("Baldin's 'during your turn' gated form is NOT matched (parks body-only)", () => {
    const c = { id: "baldin", name: "Baldin, Century Herdmaster", type: "Legendary Creature — Human Warrior", power: 3, toughness: 5,
      oracle: "During your turn, each creature assigns combat damage equal to its toughness rather than its power.\nWhenever Baldin attacks, up to one hundred target creatures each get +0/+X until end of turn, where X is the number of cards in your hand." };
    expect(classifyCard(c)).toBe("body-only");
    expect(parseStaticAbilities(c).filter(s => s.op?.layerOp === "assignsCombatDamageWithToughness")).toHaveLength(0);
  });

  it("Assault Formation stays body-only (unmodeled activated abilities) yet still EMITS the static for runtime", () => {
    const c = { id: "assault", name: "Assault Formation", type: "Enchantment", power: null, toughness: null,
      oracle: "Each creature you control assigns combat damage equal to its toughness rather than its power.\n{G}: Target creature with defender can attack this turn as though it didn't have defender.\n{2}{G}: Creatures you control get +0/+1 until end of turn." };
    expect(classifyCard(c)).toBe("body-only"); // the activated abilities aren't modeled → not claimed native
    expect(parseStaticAbilities(c).filter(s => s.op?.layerOp === "assignsCombatDamageWithToughness")).toHaveLength(1); // but the static IS modeled (runtime honors it)
  });
});

// ─────────────────────────────── RUNTIME (resolveCombatDamage) ───────────────────────────────

describe("DN-1 runtime — the amount substitution", () => {
  it("byte-identical WITHOUT a static: a 1/4 attacker deals its POWER (1)", () => {
    const a = perm("Watcher", 1, 4, "user");
    const s = makeState({ userBf: [a] }, {
      attackers: [{ permanentId: a.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(39); // 40 - 1 power
  });

  it("a Doran-affected attacker deals its TOUGHNESS (0/5 → 5), not its power (0)", () => {
    const doran = perm("Doran, the Siege Tower", 0, 5, "user", { oracle: DORAN });
    const s = makeState({ userBf: [doran] }, {
      attackers: [{ permanentId: doran.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(35); // 40 - 5 toughness (would be 40 on power 0)
  });

  it("global scope: Doran also flips the OPPONENT's blocker (each creature, any controller)", () => {
    const doran = perm("Doran, the Siege Tower", 0, 5, "user", { oracle: DORAN });
    const att = perm("Grizzly", 2, 2, "user");        // 2/2 attacker → assigns 2 (toughness)
    const wall = perm("Steel Wall", 0, 4, "ai");      // 0/4 blocker → assigns 4 (toughness) back, not 0
    const s = makeState({ userBf: [doran, att], aiBf: [wall] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: wall.id, blockingPlayer: "ai", attackerId: att.id }],
    });
    const out = resolveCombatDamage(s);
    // Attacker assigns 2 to the 0/4 wall (survives); the wall assigns 4 back → kills the 2/2 attacker.
    expect(onBf(out, "ai")).toEqual(["Steel Wall"]);  // wall survives (2 < 4 toughness)
    expect(inGy(out, "user")).toEqual(["Grizzly"]);   // 4 toughness-damage from the wall is lethal to the 2/2
    expect(onBf(out, "user")).toEqual(["Doran, the Siege Tower"]);
  });

  it("controller scope: Belligerent Brontodon flips ONLY its controller's creature; the opponent deals power", () => {
    const bronto = perm("Belligerent Brontodon", 2, 6, "user", { oracle: BRONTODON });
    const mine = perm("Guard", 0, 5, "user");         // mine → assigns 5 (toughness)
    const theirs = perm("Ogre", 4, 1, "ai");          // theirs → assigns 4 (POWER — not controlled by Brontodon)
    const s = makeState({ userBf: [bronto, mine], aiBf: [theirs] }, {
      attackers: [{ permanentId: mine.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: theirs.id, blockingPlayer: "ai", attackerId: mine.id }],
    });
    const out = resolveCombatDamage(s);
    // mine assigns 5 → kills the 4/1 blocker; theirs assigns 4 (power) → 4 < 5 toughness, mine survives.
    expect(inGy(out, "ai")).toEqual(["Ogre"]);
    expect(onBf(out, "user")).toEqual(["Belligerent Brontodon", "Guard"]);
  });

  it("first strike reads the substituted amount: a Doran 0/4 first-striker kills a 2/3 in the FS step", () => {
    const doran = perm("Doran, the Siege Tower", 0, 5, "user", { oracle: DORAN });
    const striker = perm("Vanguard", 0, 4, "user", { keywords: ["First strike"] }); // assigns 4 (toughness) at FS
    const blk = perm("Bear", 2, 3, "ai");
    const s = makeState({ userBf: [doran, striker], aiBf: [blk] }, {
      attackers: [{ permanentId: striker.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: striker.id }],
    });
    const afterFS = resolveCombatDamage(s, { firstStrikeStep: true });
    expect(inGy(afterFS, "ai")).toEqual(["Bear"]);          // 4 ≥ 3 toughness → dead in the first-strike step
    const afterReg = resolveCombatDamage(afterFS, { firstStrikeStep: false });
    expect(onBf(afterReg, "user")).toEqual(["Doran, the Siege Tower", "Vanguard"]); // took no damage back
  });

  it("trample reads the substituted amount: a Doran 0/5 trampler over a 2/2 spills 3", () => {
    const doran = perm("Doran, the Siege Tower", 0, 5, "user", { oracle: DORAN });
    const tramp = perm("Roller", 0, 5, "user", { keywords: ["Trample"] });   // assigns 5 (toughness)
    const chump = perm("Goblin", 2, 2, "ai");
    const s = makeState({ userBf: [doran, tramp], aiBf: [chump] }, {
      attackers: [{ permanentId: tramp.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: chump.id, blockingPlayer: "ai", attackerId: tramp.id }],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(37);          // 5 assigned − 2 lethal to the chump = 3 trampled
    expect(inGy(out, "ai")).toEqual(["Goblin"]);
  });

  it("toughness>power predicate: Ancient Lumberknot flips a 1/4 but NOT a 4/1 (reads power)", () => {
    const lumber = perm("Ancient Lumberknot", 0, 5, "user", { oracle: LUMBERKNOT });
    const big = perm("Thick", 1, 4, "user");   // toughness 4 > power 1 → assigns 4
    const wide = perm("Wide", 4, 1, "user");   // toughness 1 < power 4 → assigns power 4
    const s1 = makeState({ userBf: [lumber, big] }, {
      attackers: [{ permanentId: big.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(resolveCombatDamage(s1).players.ai.life).toBe(36); // 40 − 4 toughness
    const s2 = makeState({ userBf: [lumber, wide] }, {
      attackers: [{ permanentId: wide.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(resolveCombatDamage(s2).players.ai.life).toBe(36); // 40 − 4 power (predicate false → unchanged)
  });

  it("FN guard: a Doran-less board leaves the attacker on its POWER even for a defensive body", () => {
    const wall = perm("Wall of Wood", 0, 3, "user"); // 0 power, no static anywhere → deals 0
    const s = makeState({ userBf: [wall] }, {
      attackers: [{ permanentId: wall.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(40); // 0 power, unchanged
  });
});
