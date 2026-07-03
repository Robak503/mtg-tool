/**
 * anthemProtection.test.js — STATIC-ANTHEM protection-from-COLOR grant slice.
 *
 * Extends the static-anthem path (staticAbilityParser.parseClause) so an anthem whose "have <tail>" mixes
 * grantable keywords with a PROTECTION-FROM-COLOR span flips native instead of being parked by the old
 * keyword-only all-or-nothing guard. The grant reuses the layer-6 addProtection op the EQUIP/Aura path
 * already emits — enforced LAYER-AWARE by layers.permanentProtectionColors over the anthem's DYNAMIC
 * `affects` selector, so exactly the selected creatures (yours only for "you control"; symmetric for
 * "all"/"each"; color-scoped for "<color> creatures you control") get protection at the same three sites a
 * printed/Equipment protection is enforced (combat damage / block / targeting — CR 702.16b/e/f).
 *
 * Cards (all previously body-only, all corpus-clean):
 *   - Akroma's Memorial — "Creatures you control have flying, first strike, vigilance, trample, haste, and
 *                          protection from black and from red." (multi-keyword + 2-color protection, you-ctrl)
 *   - Righteous War     — two color-scoped "<color> creatures you control have protection from <color>".
 *   - Absolute Grace / Absolute Law — symmetric "All creatures have protection from black / red."
 *
 * CREED: model the WHOLE tail or nothing. A non-color/dynamic protection quality, an unmodeled keyword
 * (afflict/ward), or any leftover rider drops the whole grant → body-only (a clean false-negative).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPermanent, createGameState, _resetIdsForTests } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword, permanentProtectionColors } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── (A) parser — anthem "have <tail>" with a protection-from-color span ─────────

describe("parseStaticAbilities — anthem protection-from-color grant", () => {
  it("Akroma's Memorial: 5 keyword grants + 1 addProtection(B,R), all scoped 'you control' creatures", () => {
    const descs = parseStaticAbilities({
      name: "Akroma's Memorial",
      type: "Legendary Artifact",
      oracle: "Creatures you control have flying, first strike, vigilance, trample, haste, and protection from black and from red.",
    });
    const youCreatures = { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"] } };
    expect(descs).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Flying" }, affects: youCreatures, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "First strike" }, affects: youCreatures, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Vigilance" }, affects: youCreatures, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Trample" }, affects: youCreatures, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Haste" }, affects: youCreatures, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addProtection", colors: ["B", "R"] }, affects: youCreatures, duration: { kind: "permanent" } },
    ]);
  });

  it("Righteous War: two COLOR-SCOPED protection grants (W creatures ← from B; B creatures ← from W)", () => {
    const descs = parseStaticAbilities({
      name: "Righteous War",
      type: "Enchantment",
      oracle: "White creatures you control have protection from black.\nBlack creatures you control have protection from white.",
    });
    expect(descs).toEqual([
      { layer: 6, op: { layerOp: "addProtection", colors: ["B"] }, affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], colors: ["W"] } }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addProtection", colors: ["W"] }, affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], colors: ["B"] } }, duration: { kind: "permanent" } },
    ]);
  });

  it("Absolute Grace: SYMMETRIC protection from black for ALL creatures (controllerScope 'each')", () => {
    const descs = parseStaticAbilities({ name: "Absolute Grace", type: "Enchantment", oracle: "All creatures have protection from black." });
    expect(descs).toEqual([
      { layer: 6, op: { layerOp: "addProtection", colors: ["B"] }, affects: { mode: "dynamic", selector: { controllerScope: "each", cardTypes: ["Creature"], excludeSelf: false } }, duration: { kind: "permanent" } },
    ]);
  });

  it("a keyword-then-protection mix ('flying and protection from red') emits BOTH", () => {
    const descs = parseStaticAbilities({ name: "Test", type: "Enchantment", oracle: "Creatures you control have flying and protection from red." });
    expect(descs.map((d) => d.op.layerOp)).toEqual(["addKeyword", "addProtection"]);
    expect(descs[1].op.colors).toEqual(["R"]);
  });
});

// ─── (A) parser — CREED false-negatives (the all-or-nothing guard) ───────────────

describe("parseStaticAbilities — anthem protection ALL-OR-NOTHING (CREED FNs)", () => {
  const parkable = [
    ["non-color protection quality", "Creatures you control have protection from instants and from sorceries."],
    ["dynamic protection quality", "Creatures you control have protection from the chosen color."],
    ["'protection from everything'", "Creatures you control have protection from everything."],
    ["'protection from all colors' (unmodeled here)", "Creatures you control have protection from all colors."],
    ["protection + an UNMODELED keyword (ward)", "Creatures you control have ward {2} and protection from red."],
    // NOTE: afflict USED to be parkable here, but the afflict subsystem (afflict.test.js) now models the
    // group-afflict grant — "Artifact creatures you control have afflict 3." emits a layer-6 quoted-triggered
    // grant. It is asserted native in afflict.test.js; a COMBINED tail (afflict + an ungrantable keyword) would
    // still park, but no such printed card exists, so the parkable list keeps only the ward case above.
  ];
  for (const [label, oracle] of parkable) {
    it(`PARKED: ${label} → no descriptors (body-only)`, () => {
      expect(parseStaticAbilities({ name: "X", type: "Enchantment", oracle })).toEqual([]);
    });
  }
});

// ─── (B) runtime — the grant applies live to the right creatures ─────────────────

const creature = (name, power, toughness, controller, { colors = [], oracle = "", type_line = "Creature" } = {}, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, power, toughness, type_line, colors, oracle }, controller });
const permanent = (name, oracle, controller, { type_line = "Enchantment" } = {}, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, type_line, oracle }, controller });

function boardState(userBf = [], aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn: 3,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}

const AKROMA = "Creatures you control have flying, first strike, vigilance, trample, haste, and protection from black and from red.";

describe("Akroma's Memorial — multi-keyword grant confers ALL listed keywords (yours only)", () => {
  it("a vanilla creature you control gains every listed keyword; an opponent's gains none", () => {
    const mine = creature("Grunt", 2, 2, "user", {}, "grunt");
    const theirs = creature("Foe", 2, 2, "ai", {}, "foe");
    const memorial = permanent("Akroma's Memorial", AKROMA, "user", { type_line: "Legendary Artifact" }, "memorial");
    const s = boardState([mine, memorial], [theirs]);
    for (const kw of ["Flying", "First strike", "Vigilance", "Trample", "Haste"]) {
      expect(permanentHasKeyword(s, "grunt", kw)).toBe(true);   // mine gets it
      expect(permanentHasKeyword(s, "foe", kw)).toBe(false);    // opponent does NOT
    }
  });

  it("grants protection from black AND red to your creatures, but not to opponents'", () => {
    const mine = creature("Grunt", 2, 2, "user", {}, "grunt");
    const theirs = creature("Foe", 2, 2, "ai", {}, "foe");
    const memorial = permanent("Akroma's Memorial", AKROMA, "user", { type_line: "Legendary Artifact" }, "memorial");
    const s = boardState([mine, memorial], [theirs]);
    expect([...permanentProtectionColors(s, "grunt")].sort()).toEqual(["B", "R"]);
    expect(permanentProtectionColors(s, "foe").size).toBe(0);   // opponent unaffected (CREED: no over-grant)
  });

  it("the grant DISAPPEARS when the source leaves (no Memorial on board → no protection/keywords)", () => {
    const mine = creature("Grunt", 2, 2, "user", {}, "grunt");
    const s = boardState([mine]); // no Memorial
    expect(permanentProtectionColors(s, "grunt").size).toBe(0);
    expect(permanentHasKeyword(s, "grunt", "Flying")).toBe(false);
  });
});

describe("Akroma's Memorial protection — the three enforcement sites (CR 702.16)", () => {
  it("BLOCK (702.16f): your creature can't be blocked by a RED creature, but a white flier can", () => {
    // The Memorial also grants flying, so a blocker needs flying/reach to be eligible AT ALL — both blockers
    // here have flying, isolating the protection check: red is barred by protection-from-red, white is not.
    const mine = creature("Grunt", 2, 2, "user", {}, "grunt");
    const memorial = permanent("Akroma's Memorial", AKROMA, "user", { type_line: "Legendary Artifact" }, "memorial");
    const redBlk = creature("Dragon", 3, 3, "ai", { colors: ["R"], oracle: "Flying" }, "dragon");
    const whiteBlk = creature("Angel", 3, 3, "ai", { colors: ["W"], oracle: "Flying" }, "angel");
    const s = boardState([mine, memorial], [redBlk, whiteBlk]);
    expect(canBlockAttacker(s, "dragon", "grunt", "ai")).toBe(false); // protection from red (red flier barred)
    expect(canBlockAttacker(s, "angel", "grunt", "ai")).toBe(true);   // white flier is fine
  });

  it("DAMAGE (702.16e): your creature takes NO combat damage from a BLACK blocker", () => {
    const mine = creature("Grunt", 2, 4, "user", {}, "grunt");
    const memorial = permanent("Akroma's Memorial", AKROMA, "user", { type_line: "Legendary Artifact" }, "memorial");
    const blackBlk = creature("Zombie", 3, 3, "ai", { colors: ["B"] }, "zombie");
    const s = boardState([mine, memorial], [blackBlk]);
    const out = resolveCombatDamage({
      ...s,
      combat: {
        attackers: [{ permanentId: "grunt", attackingPlayer: "user", defender: "ai" }],
        blockers: [{ blockerId: "zombie", blockingPlayer: "ai", attackerId: "grunt" }],
      },
    });
    const grunt = out.players.user.battlefield.find((p) => p.id === "grunt");
    expect(grunt.damageMarked || 0).toBe(0);
  });

  it("TARGET (702.16b): your creature can't be targeted by a BLACK spell, but a colorless one is fine", () => {
    const mine = creature("Grunt", 2, 2, "user", {}, "grunt");
    const memorial = permanent("Akroma's Memorial", AKROMA, "user", { type_line: "Legendary Artifact" }, "memorial");
    const s = boardState([mine, memorial]);
    const perm = s.players.user.battlefield.find((p) => p.id === "grunt");
    expect(canBeTargetedBy(s, perm, "user", "ai", ["B"])).toBe(false); // black spell can't target
    expect(canBeTargetedBy(s, perm, "user", "ai", ["R"])).toBe(false); // red spell can't target
    expect(canBeTargetedBy(s, perm, "user", "ai", [])).toBe(true);     // colorless ok
  });
});

describe("Righteous War — COLOR-SCOPED protection touches only the matching color", () => {
  it("a WHITE creature you control gets protection from black; a non-white one does NOT", () => {
    const whiteCreature = creature("Cleric", 2, 2, "user", { colors: ["W"] }, "cleric");
    const greenCreature = creature("Elf", 2, 2, "user", { colors: ["G"] }, "elf");
    const war = permanent("Righteous War", "White creatures you control have protection from black.\nBlack creatures you control have protection from white.", "user", {}, "war");
    const s = boardState([whiteCreature, greenCreature, war]);
    expect([...permanentProtectionColors(s, "cleric")].sort()).toEqual(["B"]); // white → prot black
    expect(permanentProtectionColors(s, "elf").size).toBe(0);                   // green → nothing
  });
});

describe("Absolute Grace — SYMMETRIC protection reaches EVERY controller's creatures", () => {
  it("both your AND an opponent's creature get protection from black", () => {
    const mine = creature("Mine", 2, 2, "user", {}, "mine");
    const theirs = creature("Theirs", 2, 2, "ai", {}, "theirs");
    const grace = permanent("Absolute Grace", "All creatures have protection from black.", "user", {}, "grace");
    const s = boardState([mine, grace], [theirs]);
    expect([...permanentProtectionColors(s, "mine")].sort()).toEqual(["B"]);
    expect([...permanentProtectionColors(s, "theirs")].sort()).toEqual(["B"]); // symmetric — opponent too
  });
});

// ─── coverage — the flips + pinned FNs ───────────────────────────────────────────

describe("coverage — anthem protection flips vs pinned false-negatives", () => {
  it("CLEAN flips: the four corpus anthems classify native-static", () => {
    expect(classifyCard({ name: "Akroma's Memorial", type: "Legendary Artifact", oracle: AKROMA })).toBe("native-static");
    expect(classifyCard({ name: "Righteous War", type: "Enchantment", oracle: "White creatures you control have protection from black.\nBlack creatures you control have protection from white." })).toBe("native-static");
    expect(classifyCard({ name: "Absolute Grace", type: "Enchantment", oracle: "All creatures have protection from black." })).toBe("native-static");
    expect(classifyCard({ name: "Absolute Law", type: "Enchantment", oracle: "All creatures have protection from red." })).toBe("native-static");
  });

  it("PINNED FNs: a rider / unmodeled keyword / non-color protection keeps the card body-only", () => {
    // Balefire Liege — two color anthems, but the cast-trigger riders are unmodeled residue → non-native.
    // (Murkfiend Liege's untap-rider IS now modeled — see murkfiendUntap.test.js; it flips native-static.)
    expect(classifyCard({ name: "Balefire Liege", type: "Creature — Spirit Horror", oracle: "Other red creatures you control get +1/+1.\nOther white creatures you control get +1/+1.\nWhenever you cast a red spell, this creature deals 3 damage to target player or planeswalker.\nWhenever you cast a white spell, you gain 3 life." })).toBe("body-only");
    // Cyberman Patrol — afflict IS now modeled as a group-triggered grant (afflict.test.js) → native-static.
    expect(classifyCard({ name: "Cyberman Patrol", type: "Artifact Creature — Cyberman", oracle: "Artifact creatures you control have afflict 3. (Whenever a creature with afflict 3 becomes blocked, defending player loses 3 life.)" })).toBe("native-static");
    // A non-color anthem protection quality stays body-only (model both colors or neither).
    expect(classifyCard({ name: "Hypothetical Ward", type: "Enchantment", oracle: "Creatures you control have protection from instants and from sorceries." })).toBe("body-only");
  });
});
