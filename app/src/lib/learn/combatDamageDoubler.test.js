/**
 * combatDamageDoubler.test.js — BLITZ CM-1: the combat-damage MULTIPLIER family.
 *
 * DN-1 (Doran) modified the ASSIGNMENT amount (CR 510.1a — a creature assigns combat damage equal to its
 * toughness instead of its power) via the combatResolution.combatDamageAmount seam. The mission asked whether
 * the double/triple "combat-damage multiplier" siblings could ride that SAME assignment seam. They CANNOT:
 * every real double/triple card is a CR 614 REPLACEMENT effect ("If … would deal … it deals double/triple that
 * damage instead"), which applies at DEAL time, AFTER assignment. Riding the assignment seam would double the
 * ASSIGNED amount and mis-distribute trample (a trampler assigns lethal off NORMAL toughness — CR 510.1c — then
 * the doubling lands on the DEALT chunks), a forbidden FP. So the multiplier rides the EXISTING deal-time
 * consult (damageReplacements.js → consultDamageAmount, called at every combat AND noncombat damage-amount
 * finalization) — combatResolution.js is UNTOUCHED, so the no-doubler combat path stays byte-identical by
 * construction.
 *
 * This slice extends parseDamageReplacements with four printed scopes, each flipping its whole-card-clean
 * carrier native-static via the already-registered classifyDamageReplacementBody:
 *   - SYMMETRIC-ALL  ×2  {side:"any"}                       — Furnace of Rath, Dictate of the Twin Gods
 *   - source-you-control ×3 {side:"source",controller:"you"} — Fiery Emancipation, City on Fire
 *   - creature-you-control ×2 (+sourceIsCreature)           — Gratuitous Violence
 *   - self combat-to-player ×2 (+combatOnly,targetPlayerOnly) — Charging Tuskodon
 *
 * CREED: false NEGATIVE safe, false POSITIVE forbidden, whole-card-or-park. Every carrier flips ONLY when its
 * whole body (after stripping the modeled replacement sentence) is keyword-only.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";
import { parseDamageReplacements, boardHasDamageReplacement } from "./damageReplacements.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle text (verified against the bundled Scryfall snapshot).
const FURNACE = "If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.";
const DICTATE = "Flash\nIf a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.";
const FIERY = "If a source you control would deal damage to a permanent or player, it deals triple that damage to that permanent or player instead.";
const CITY_ON_FIRE = "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nIf a source you control would deal damage to a permanent or player, it deals triple that damage instead.";
const GRAT_VIOLENCE = "If a creature you control would deal damage to a permanent or player, it deals double that damage instead.";
const TUSKODON = "Trample\nIf this creature would deal combat damage to a player, it deals double that damage to that player instead.";

function perm(name, power, toughness, controller, { oracle = "", type_line = "Creature", keywords = [] } = {}) {
  return createPermanent({
    card: { id: `${name}-card`, name, power, toughness, type_line, oracle, keywords },
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
const inGy = (s, pid) => s.players[pid].graveyard.map(c => c.name);
const onBf = (s, pid) => s.players[pid].battlefield.map(p => p.card.name);

// ─────────────────────────────── RECOGNITION (real oracle) ───────────────────────────────

describe("CM-1 recognition — the whole-card flips", () => {
  it("Furnace of Rath → native-static (symmetric-all ×2)", () => {
    const c = { id: "furnace", name: "Furnace of Rath", type: "Enchantment", oracle: FURNACE };
    expect(classifyCard(c)).toBe("native-static");
    expect(parseDamageReplacements(c)).toEqual([{ op: { op: "multiply", factor: 2 }, scope: { side: "any" } }]);
  });

  it("Dictate of the Twin Gods → native-static (Flash + symmetric-all ×2)", () => {
    const c = { id: "dictate", name: "Dictate of the Twin Gods", type: "Enchantment", oracle: DICTATE };
    expect(classifyCard(c)).toBe("native-static");
    expect(parseDamageReplacements(c)).toEqual([{ op: { op: "multiply", factor: 2 }, scope: { side: "any" } }]);
  });

  it("Fiery Emancipation → native-static (source-you-control ×3)", () => {
    const c = { id: "fiery", name: "Fiery Emancipation", type: "Enchantment", oracle: FIERY };
    expect(classifyCard(c)).toBe("native-static");
    expect(parseDamageReplacements(c)).toEqual([{ op: { op: "multiply", factor: 3 }, scope: { side: "source", controller: "you" } }]);
  });

  it("City on Fire → native-static (Convoke + source-you-control ×3)", () => {
    const c = { id: "city", name: "City on Fire", type: "Enchantment", oracle: CITY_ON_FIRE };
    expect(classifyCard(c)).toBe("native-static");
    expect(parseDamageReplacements(c)).toEqual([{ op: { op: "multiply", factor: 3 }, scope: { side: "source", controller: "you" } }]);
  });

  it("Gratuitous Violence → native-static (creature-you-control ×2, sourceIsCreature)", () => {
    const c = { id: "grat", name: "Gratuitous Violence", type: "Enchantment", oracle: GRAT_VIOLENCE };
    expect(classifyCard(c)).toBe("native-static");
    expect(parseDamageReplacements(c)).toEqual([{ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true } }]);
  });

  it("Charging Tuskodon → native-static (Trample + self combat-to-player ×2)", () => {
    const c = { id: "tusk", name: "Charging Tuskodon", type: "Creature — Dinosaur", power: 4, toughness: 4, oracle: TUSKODON };
    expect(classifyCard(c)).toBe("native-static");
    expect(parseDamageReplacements(c)).toEqual([{ op: { op: "multiply", factor: 2 }, scope: { side: "source", self: true, combatOnly: true, targetPlayerOnly: true } }]);
  });
});

describe("CM-1 recognition — CREED parks (whole-card law)", () => {
  it("a symmetric doubler with an EXTRA unmodeled trigger stays body-only", () => {
    const c = { id: "x", name: "Stronghold-ish", type: "Enchantment",
      oracle: FURNACE + "\nWhenever chaos ensues, this enchantment deals 1 damage to any target." };
    expect(classifyCard(c)).toBe("body-only");
  });

  it("an INSTANT/SORCERY doubler is NOT a synthesized-on-read static (permanents only)", () => {
    const c = { id: "y", name: "Blast", type: "Sorcery", oracle: FIERY };
    expect(classifyCard(c)).not.toBe("native-static");
  });
});

// ─────────────────────────────── RUNTIME (the deal-time consult) ───────────────────────────────

describe("CM-1 runtime — byte-identical baseline (no doubler on board)", () => {
  it("a 2/2 attacker deals its power (2) — no doubler present", () => {
    const a = perm("Bear", 2, 2, "user");
    const s = makeState({ userBf: [a] }, {
      attackers: [{ permanentId: a.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(boardHasDamageReplacement(s)).toBe(false);
    expect(resolveCombatDamage(s).players.ai.life).toBe(38); // 40 - 2, un-doubled
  });
});

describe("CM-1 runtime — Furnace of Rath (symmetric ×2, both directions)", () => {
  it("an unblocked 2/2 deals DOUBLE (4) to the defending player", () => {
    const furnace = perm("Furnace of Rath", 0, 0, "user", { oracle: FURNACE, type_line: "Enchantment" });
    const a = perm("Bear", 2, 2, "user");
    const s = makeState({ userBf: [furnace, a] }, {
      attackers: [{ permanentId: a.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(36); // 40 - (2 × 2)
  });

  it("SYMMETRIC: an OPPONENT's attacker is doubled too (side:any, not controller-scoped)", () => {
    const furnace = perm("Furnace of Rath", 0, 0, "user", { oracle: FURNACE, type_line: "Enchantment" });
    const enemy = perm("Ogre", 3, 3, "ai");
    const s = makeState({ userBf: [furnace], aiBf: [enemy] }, {
      attackers: [{ permanentId: enemy.id, attackingPlayer: "ai", defender: "user" }], blockers: [],
    });
    expect(resolveCombatDamage(s).players.user.life).toBe(34); // 40 - (3 × 2) — the doubler is symmetric
  });
});

describe("CM-1 runtime — Fiery Emancipation (source-you-control ×3)", () => {
  it("your attacker deals TRIPLE (2 → 6); an opponent's attacker is UNAFFECTED", () => {
    const fiery = perm("Fiery Emancipation", 0, 0, "user", { oracle: FIERY, type_line: "Enchantment" });
    const mine = perm("Bear", 2, 2, "user");
    const s = makeState({ userBf: [fiery, mine] }, {
      attackers: [{ permanentId: mine.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(34); // 40 - (2 × 3)

    // Opponent's source is NOT tripled (controller-scoped to the Fiery controller).
    const enemy = perm("Raider", 4, 4, "ai");
    const s2 = makeState({ userBf: [fiery], aiBf: [enemy] }, {
      attackers: [{ permanentId: enemy.id, attackingPlayer: "ai", defender: "user" }], blockers: [],
    });
    expect(resolveCombatDamage(s2).players.user.life).toBe(36); // 40 - 4, un-tripled
  });
});

describe("CM-1 runtime — Gratuitous Violence (creature-you-control ×2)", () => {
  it("your CREATURE's combat damage is doubled (2 → 4)", () => {
    const grat = perm("Gratuitous Violence", 0, 0, "user", { oracle: GRAT_VIOLENCE, type_line: "Enchantment" });
    const mine = perm("Bear", 2, 2, "user");
    const s = makeState({ userBf: [grat, mine] }, {
      attackers: [{ permanentId: mine.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(36); // 40 - (2 × 2)
  });

  it("FN GUARD (sourceIsCreature): a NONCREATURE source you control is NOT doubled", () => {
    const grat = perm("Gratuitous Violence", 0, 0, "user", { oracle: GRAT_VIOLENCE, type_line: "Enchantment" });
    const artifact = perm("Pinger", 0, 0, "user", { type_line: "Artifact" });
    const creature = perm("Blaze Elemental", 0, 0, "user"); // a creature source → doubled
    const s = makeState({ userBf: [grat, artifact, creature] });
    // Noncreature (artifact) ability damage → NOT doubled (Gratuitous Violence is creature-only).
    const outArt = applyDamageEffect(s, { controller: "user", amount: 3, targets: [{ type: "player", id: "ai" }], source: artifact });
    expect(outArt.players.ai.life).toBe(37); // 40 - 3, un-doubled
    // Creature ability damage → doubled.
    const outCre = applyDamageEffect(s, { controller: "user", amount: 3, targets: [{ type: "player", id: "ai" }], source: creature });
    expect(outCre.players.ai.life).toBe(34); // 40 - (3 × 2)
  });
});

describe("CM-1 runtime — Charging Tuskodon (self, combat-to-PLAYER ×2, the trample proof)", () => {
  it("unblocked: deals DOUBLE (4 → 8) to the defending player", () => {
    const tusk = perm("Charging Tuskodon", 4, 4, "user", { oracle: TUSKODON, keywords: ["Trample"] });
    const s = makeState({ userBf: [tusk] }, {
      attackers: [{ permanentId: tusk.id, attackingPlayer: "user", defender: "ai" }], blockers: [],
    });
    expect(resolveCombatDamage(s).players.ai.life).toBe(32); // 40 - (4 × 2)
  });

  it("TRAMPLE: lethal to the blocker is assigned off NORMAL toughness (un-doubled); only the player spill is doubled", () => {
    const tusk = perm("Charging Tuskodon", 4, 4, "user", { oracle: TUSKODON, keywords: ["Trample"] });
    const chump = perm("Goblin", 2, 2, "ai");
    const s = makeState({ userBf: [tusk], aiBf: [chump] }, {
      attackers: [{ permanentId: tusk.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: chump.id, blockingPlayer: "ai", attackerId: tusk.id }],
    });
    const out = resolveCombatDamage(s);
    // Assign lethal 2 to the 2/2 (undoubled — damage to a CREATURE is not "to a player"), trample the remaining
    // 2 to the player and DOUBLE only that spill → player takes 4. (Riding the assignment seam would instead
    // assign 8, kill the chump with 2, and spill 6 — a wrong distribution. This proves the deal-time seam.)
    expect(inGy(out, "ai")).toEqual(["Goblin"]);   // chump dies to its undoubled lethal 2
    expect(out.players.ai.life).toBe(36);          // 40 - (2 trampled × 2)
    expect(onBf(out, "user")).toEqual(["Charging Tuskodon"]); // took 2 back from the 2/2 → survives (4 toughness)
  });
});

describe("CM-1 runtime — first strike reads the doubled amount", () => {
  it("a Furnace'd 2/2 first-striker deals 4 in the FS step, killing a 3/3 before it swings back", () => {
    const furnace = perm("Furnace of Rath", 0, 0, "user", { oracle: FURNACE, type_line: "Enchantment" });
    const striker = perm("Vanguard", 2, 2, "user", { keywords: ["First strike"] });
    const blk = perm("Bear", 3, 3, "ai");
    const s = makeState({ userBf: [furnace, striker], aiBf: [blk] }, {
      attackers: [{ permanentId: striker.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: striker.id }],
    });
    const afterFS = resolveCombatDamage(s, { firstStrikeStep: true });
    expect(inGy(afterFS, "ai")).toEqual(["Bear"]);   // 2 doubled → 4 ≥ 3 toughness → dead in the FS step
    const afterReg = resolveCombatDamage(afterFS, { firstStrikeStep: false });
    expect(onBf(afterReg, "user")).toEqual(["Furnace of Rath", "Vanguard"]); // striker survived — blocker gone before the regular step
  });
});
