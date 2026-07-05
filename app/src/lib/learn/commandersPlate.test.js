/**
 * commandersPlate.test.js — COMMANDER'S PLATE slice: a two-subsystem Equipment.
 *
 * Commander's Plate: "Equipped creature gets +3/+3 and has protection from each color that's not in your
 * commander's color identity. Equip commander {3}. Equip {5}." Two modeled subsystems land here:
 *
 *   (1) EQUIP-[QUALITY] restricted equip (CR 702.6c). "Equip commander {3}" is a SECOND equip ability whose
 *       legal targets are narrowed to a commander you control (the sole modeled quality); the plain "Equip
 *       {5}" still targets any creature you control. parseActivatedAbilities tags equipQuality:"commander";
 *       legalChoices enforces the target restriction; the ATTACH resolver is unchanged.
 *
 *   (2) EQUIP-PROTECTION-DYNAMIC (CR 702.16j). "protection from each color that's not in your commander's
 *       color identity" is a state-resolved quality: parseAttachedClause emits a DYNAMIC layer-6
 *       addProtection op (dynamicColors:"notCommanderIdentity"), and layers.permanentProtectionColors
 *       computes WUBRG minus the equipped creature's controller's commander color identity at read time.
 *
 * CREED: model BOTH faithfully or park. A non-"commander" equip quality, or any OTHER dynamic protection
 * phrase, stays body-only (safe FN). The +3/+3 rides with the protection all-or-nothing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, attachPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEquipmentBonus } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness, permanentProtectionColors } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { classifyCard, permanentEquipmentCovered } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PLATE = {
  id: "c-plate", name: "Commander's Plate", type: "Artifact — Equipment", mana: "{3}",
  oracle: "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip commander {3}\nEquip {5}",
};

// A board with an explicit command zone so "your commander's color identity" is well-defined. `pool` is
// generous so both equip costs are affordable.
function boardState({ user = [], ai = [], userCommand = [], pool = { C: 9 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, command: userCommand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}

const creature = (id, name, power, toughness, controller, extra = {}) =>
  createPermanent({ id, card: { id: `${id}-card`, name, type_line: "Creature", power, toughness, oracle: "", ...extra }, controller, summoningSick: false });

// ─── parser ─────────────────────────────────────────────────────────────────────

describe("parser — the two equip abilities + the dynamic-protection bonus", () => {
  it("parses BOTH 'Equip commander {3}' (equipQuality) and plain 'Equip {5}'", () => {
    const abilities = parseActivatedAbilities(PLATE);
    expect(abilities).toEqual([
      expect.objectContaining({ isEquipAbility: true, modeled: true, manaPips: "{3}", equipQuality: "commander" }),
      expect.objectContaining({ isEquipAbility: true, modeled: true, manaPips: "{5}" }),
    ]);
    // The plain equip carries NO equipQuality (targets any creature you control).
    expect(abilities[1].equipQuality).toBeUndefined();
  });

  it("bonus = +3/+3 AND a DYNAMIC addProtection op (not a static color list)", () => {
    expect(parseEquipmentBonus(PLATE)).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addProtection", dynamicColors: "notCommanderIdentity" }, duration: { kind: "permanent" } },
    ]);
  });
});

// ─── coverage ─────────────────────────────────────────────────────────────────────

describe("coverage — the whole card flips native-equipment", () => {
  it("Commander's Plate is native-equipment (both subsystems modeled)", () => {
    expect(classifyCard(PLATE)).toBe("native-equipment");
    expect(permanentEquipmentCovered(PLATE)).toBe(true);
  });

  it("CREED near-miss: a NON-modeled equip quality stays body-only", () => {
    // "Equip Human {3}" is a quality the runtime can't evaluate → residue → Arbiter. (Only "commander" and
    // "legendary creature" — qualities readable from state — are modeled; a subtype quality like Human is not.)
    expect(classifyCard({ name: "X", type: "Artifact — Equipment", oracle: "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip Human {3}\nEquip {5}" })).toBe("body-only");
  });

  it("CREED near-miss: a DIFFERENT dynamic protection phrase drops the whole card", () => {
    // Only the exact commander-identity phrase is modeled; anything else → the bonus drops → body-only.
    expect(classifyCard({ name: "Y", type: "Artifact — Equipment", oracle: "Equipped creature gets +3/+3 and has protection from the color of your choice.\nEquip commander {3}\nEquip {5}" })).toBe("body-only");
  });
});

// ─── runtime — restricted equip targeting ─────────────────────────────────────────

describe("runtime — 'Equip commander {3}' targets only a commander you control", () => {
  it("the {3} ability enumerates ONLY the commander; the {5} ability enumerates every own creature", () => {
    const cmdr = creature("cmdr", "Najeela", 3, 3, "user", { isCommander: true });
    const bear = creature("bear", "Grizzly Bears", 2, 2, "user");
    const plate = createPermanent({ id: "plate", card: PLATE, controller: "user", summoningSick: false });
    const s = boardState({ user: [cmdr, bear, plate], userCommand: [{ id: "najeela-cmd", name: "Najeela", colorIdentity: ["W", "U", "B", "R", "G"] }] });

    const equips = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter(a => a.isEquipAbility);
    // The {3} restricted ability (equipQuality via abilityText) may target ONLY the commander.
    const restricted = equips.filter(a => /commander/i.test(a.abilityText));
    expect(restricted.map(a => a.targets[0].id).sort()).toEqual(["cmdr"]);
    // The plain {5} ability targets BOTH own creatures.
    const plain = equips.filter(a => !/commander/i.test(a.abilityText));
    expect(plain.map(a => a.targets[0].id).sort()).toEqual(["bear", "cmdr"]);
  });

  it("with NO commander on the battlefield, the {3} ability offers no target (plain {5} still does)", () => {
    const bear = creature("bear", "Grizzly Bears", 2, 2, "user");
    const plate = createPermanent({ id: "plate", card: PLATE, controller: "user", summoningSick: false });
    const s = boardState({ user: [bear, plate] });
    const equips = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter(a => a.isEquipAbility);
    expect(equips.filter(a => /commander/i.test(a.abilityText))).toHaveLength(0);
    expect(equips.filter(a => !/commander/i.test(a.abilityText)).map(a => a.targets[0].id)).toEqual(["bear"]);
  });
});

// ─── runtime — dynamic protection resolves against commander color identity ────────

describe("runtime — protection = WUBRG minus the controller's commander color identity", () => {
  function equippedBearProt(commanderIdentity) {
    const bear = creature("bear", "Grizzly Bears", 2, 2, "user");
    const plate = createPermanent({ id: "plate", card: PLATE, controller: "user", summoningSick: false });
    const s0 = boardState({ user: [bear, plate], userCommand: [{ id: "cmd", name: "Cmd", colorIdentity: commanderIdentity }] });
    const s = attachPermanent(s0, { equipId: "plate", targetId: "bear" });
    return { s, colors: [...permanentProtectionColors(s, "bear")].sort() };
  }

  it("a mono-white commander (identity [W]) → protection from U,B,R,G (NOT white)", () => {
    const { s, colors } = equippedBearProt(["W"]);
    expect(colors).toEqual(["B", "G", "R", "U"]);
    expect(permanentPower(s, "bear")).toBe(5);      // +3/+3 rides along
    expect(permanentToughness(s, "bear")).toBe(5);
  });

  it("a five-color commander (WUBRG) → protection from NOTHING (all colors are in identity)", () => {
    expect(equippedBearProt(["W", "U", "B", "R", "G"]).colors).toEqual([]);
  });

  it("a colorless commander (identity []) → protection from ALL five colors", () => {
    expect(equippedBearProt([]).colors).toEqual(["B", "G", "R", "U", "W"]);
  });

  it("reads color_identity (raw Scryfall field) as well as colorIdentity (publicCard field)", () => {
    const bear = creature("bear", "Grizzly Bears", 2, 2, "user");
    const plate = createPermanent({ id: "plate", card: PLATE, controller: "user", summoningSick: false });
    const s0 = boardState({ user: [bear, plate], userCommand: [{ id: "cmd", name: "Cmd", color_identity: ["G"] }] });
    const s = attachPermanent(s0, { equipId: "plate", targetId: "bear" });
    expect([...permanentProtectionColors(s, "bear")].sort()).toEqual(["B", "R", "U", "W"]); // not green
  });

  it("the protection vanishes when the Plate detaches (keyed on attachedTo)", () => {
    const { s } = equippedBearProt(["W"]);
    const s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map(p => p.id === "plate" ? { ...p, attachedTo: null } : (p.id === "bear" ? { ...p, attachments: [] } : p)) } } };
    expect(permanentProtectionColors(s2, "bear").size).toBe(0);
  });
});

// ─── runtime — the dynamic protection is ENFORCED (block, CR 702.16f) ──────────────

describe("runtime — dynamic protection is enforced at block time", () => {
  it("a Green-commander creature equipped with the Plate can't be blocked by a red creature but can by green", () => {
    const attacker = creature("hero", "Hero", 2, 2, "user");
    const plate = createPermanent({ id: "plate", card: PLATE, controller: "user", summoningSick: false });
    const redBlk = creature("goblin", "Goblin", 2, 2, "ai", { colors: ["R"] });
    const greenBlk = creature("wurm", "Wurm", 3, 3, "ai", { colors: ["G"] });
    const s0 = boardState({ user: [attacker, plate], ai: [redBlk, greenBlk], userCommand: [{ id: "cmd", name: "Cmd", colorIdentity: ["G"] }] });
    const s = attachPermanent(s0, { equipId: "plate", targetId: "hero" });
    // Identity = {G}; protection from W,U,B,R. Red can't block; green CAN (green is in identity → no protection).
    expect(canBlockAttacker(s, "goblin", "hero", "ai")).toBe(false);
    expect(canBlockAttacker(s, "wurm", "hero", "ai")).toBe(true);
  });
});
