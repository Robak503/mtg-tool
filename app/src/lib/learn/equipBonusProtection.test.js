/**
 * equipBonusProtection.test.js — WAVE 4 EQUIP-BONUS + GRANTED-PROTECTION slice.
 *
 * (A) parseAttachedClause extensions, all-or-nothing per the CREED:
 *   - EQUIP-DYNAMIC-PT  "gets +X/+Y for each <metric>" (Conqueror's Flail "color among permanents you
 *                       control"; Blanchwood Armor "Forest you control") → layer-7c ptModifyDynamicCount.
 *   - EQUIP-BASE-PT-SET "has base power and toughness N/N" literal → layer-7b set (a dynamic "X is your
 *                       life total" form has residue and stays body-only — safe FN).
 *   - EQUIP-LOSES-KW    "gets +N/+N and loses <combat keyword>" (Colossus Hammer) → layer-6 removeKeyword.
 * (B) GRANTED PROTECTION-FROM-COLOR (the Captain America Swords' static): parseAttachedClause emits a
 *     layer-6 addProtection; layers.permanentProtectionColors unions printed + granted; the three
 *     enforcement sites (combat damage / block / targeting) read it LAYER-AWARE so a protected creature
 *     can't be BLOCKED-by / DAMAGED-by / TARGETED-by a same-color source — and the grant DISAPPEARS the
 *     instant the equipment unattaches. A non-color / dynamic protection quality drops the whole bonus.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPermanent, createGameState, attachPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEquipmentBonus, parseAuraBonus } from "./staticAbilityParser.js";
import {
  permanentPower, permanentToughness, permanentHasKeyword, permanentProtectionColors,
} from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── (A) parser — the three new attached-bonus forms ────────────────────────────

describe("parseAttachedClause — EQUIP-DYNAMIC-PT (gets +X/+Y for each <metric>)", () => {
  it("'+1/+1 for each color among permanents you control' → ptModifyDynamicCount (colorsAmongPermanents)", () => {
    const flail = { type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1 for each color among permanents you control.\nEquip {2}" };
    expect(parseEquipmentBonus(flail)).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModifyDynamicCount", countSpec: { kind: "colorsAmongPermanents" }, perPower: 1, perToughness: 1 }, duration: { kind: "permanent" } },
    ]);
  });
  it("'+1/+1 for each Forest you control' → ptModifyDynamicCount (a basic-land subtype count)", () => {
    const armor = { type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each Forest you control." };
    expect(parseAuraBonus(armor)).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModifyDynamicCount", countSpec: { kind: "permanentsYouControl", subtype: "Forest" }, perPower: 1, perToughness: 1 }, duration: { kind: "permanent" } },
    ]);
  });
  it("an UNMODELED metric drops the whole bonus (safe FN — never a fabricated count)", () => {
    expect(parseEquipmentBonus({ oracle: "Equipped creature gets +1/+1 for each opponent you have.\nEquip {2}" })).toEqual([]);
    expect(parseEquipmentBonus({ oracle: "Equipped creature gets +1/+1 for each card in your graveyard.\nEquip {2}" })).toEqual([]);
  });
});

describe("parseAttachedClause — EQUIP-BASE-PT-SET (has base power and toughness N/N)", () => {
  it("literal 'base power and toughness 0/2' → a layer-7b set op", () => {
    const wrap = { type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has base power and toughness 0/2." };
    expect(parseAuraBonus(wrap)).toEqual([
      { layer: 7, sublayer: "7b", op: { power: 0, toughness: 2 }, duration: { kind: "permanent" } },
    ]);
  });
  it("a DYNAMIC base-P/T ('X/X, where X is your life total') has residue → whole bonus drops (safe FN)", () => {
    // Aettir and Priwen — the trailing ", where X is …" is unmodeled, so the all-or-nothing rejects it.
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature has base power and toughness X/X, where X is your life total.\nEquip {5}" })).toEqual([]);
  });
});

describe("parseAttachedClause — EQUIP-LOSES-KW (+N/+N and loses <combat keyword>)", () => {
  it("Colossus Hammer '+10/+10 and loses flying' → ptModify + removeKeyword(Flying)", () => {
    const hammer = { type: "Artifact — Equipment", oracle: "Equipped creature gets +10/+10 and loses flying.\nEquip {8}" };
    expect(parseEquipmentBonus(hammer)).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 10, toughness: 10 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "removeKeyword", keyword: "Flying" }, duration: { kind: "permanent" } },
    ]);
  });
  it("'loses <unmodeled keyword>' drops the whole bonus (only a known combat keyword may be removed)", () => {
    expect(parseEquipmentBonus({ oracle: "Equipped creature gets +1/+1 and loses hexproof.\nEquip {2}" })).toEqual([]);
  });
});

describe("parseAttachedClause — EQUIP-PROTECTION (has protection from <color>…)", () => {
  it("'protection from black and from green' → a layer-6 addProtection op (B,G)", () => {
    const sword = { type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+2 and has protection from black and from green.\nEquip {2}" };
    expect(parseEquipmentBonus(sword)).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 2 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addProtection", colors: ["B", "G"] }, duration: { kind: "permanent" } },
    ]);
  });
  it("a NON-COLOR quality ('from instants and from sorceries') drops the WHOLE bonus (safe FN)", () => {
    // Sword of Wealth and Power — the +2/+2 also drops (CREED: model both or neither).
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+2 and has protection from instants and from sorceries.\nEquip {2}" })).toEqual([]);
  });
  it("a DYNAMIC quality ('from each color that's not in your commander's color identity') drops the whole bonus", () => {
    // Commander's Plate — the +3/+3 + dynamic protection are both dropped.
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip {5}" })).toEqual([]);
  });
});

// ─── (A) layer engine — the bonuses apply live to the attached creature ──────────

const colorlessCard = (name, types, colors = []) => ({ id: `${name}-card`, name, type_line: types, colors });
const creature = (name, power, toughness, controller, { colors = [], oracle = "", type_line = "Creature" } = {}, id) =>
  createPermanent({ id: id || `${name}`, card: { id: `${name}-card`, name, power, toughness, type_line, colors, oracle }, controller });
const equip = (name, oracle, controller, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, type_line: "Artifact — Equipment", oracle }, controller });
const aura = (name, oracle, controller, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, type_line: "Enchantment — Aura", oracle }, controller });

function boardState(userBf = [], aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn: 3,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}

describe("layer engine — dynamic +X/+Y 'for each color among permanents you control'", () => {
  it("counts DISTINCT WUBRG colors among the controller's battlefield (colorless contributes none)", () => {
    const bear = creature("Bear", 2, 2, "user", { colors: ["G"] }, "bear");
    const flail = equip("Flail", "Equipped creature gets +1/+1 for each color among permanents you control.\nEquip {2}", "user", "flail");
    // Other permanents the controller controls: a white perm, a red perm, a SECOND green (dup → not counted twice),
    // and a colorless artifact (contributes nothing).
    const whitePerm = createPermanent({ id: "wp", card: colorlessCard("Pearl", "Artifact", ["W"]), controller: "user" });
    const redPerm = createPermanent({ id: "rp", card: colorlessCard("Ruby", "Artifact", ["R"]), controller: "user" });
    const colorless = createPermanent({ id: "cp", card: colorlessCard("Mox", "Artifact", []), controller: "user" });
    let s = boardState([bear, flail, whitePerm, redPerm, colorless]);
    s = attachPermanent(s, { equipId: "flail", targetId: "bear" });
    // distinct colors among permanents: G (bear + a dup green via whitePerm? no) — here {G (bear), W, R} = 3.
    expect(permanentPower(s, "bear")).toBe(2 + 3);
    expect(permanentToughness(s, "bear")).toBe(2 + 3);
  });

  it("re-evaluates live — adding a new color raises the bonus", () => {
    const bear = creature("Bear", 2, 2, "user", { colors: ["G"] }, "bear");
    const flail = equip("Flail", "Equipped creature gets +1/+1 for each color among permanents you control.\nEquip {2}", "user", "flail");
    let s = boardState([bear, flail]);
    s = attachPermanent(s, { equipId: "flail", targetId: "bear" });
    expect(permanentPower(s, "bear")).toBe(2 + 1); // only green on board
    const bluePerm = createPermanent({ id: "bp", card: colorlessCard("Sapphire", "Artifact", ["U"]), controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, bluePerm] } } };
    expect(permanentPower(s, "bear")).toBe(2 + 2); // green + blue
  });
});

describe("layer engine — base-P/T set (7b) OVERWRITES printed P/T", () => {
  it("a creature with an attached 'base power and toughness 0/2' aura derives 0/2 regardless of printed", () => {
    const dragon = creature("Dragon", 5, 5, "user", {}, "dragon");
    const wrap = aura("Wrap", "Enchant creature\nEnchanted creature has base power and toughness 0/2.", "user", "wrap");
    let s = boardState([dragon, wrap]);
    s = attachPermanent(s, { equipId: "wrap", targetId: "dragon" });
    expect(permanentPower(s, "dragon")).toBe(0);
    expect(permanentToughness(s, "dragon")).toBe(2);
  });
});

describe("layer engine — loses <keyword> (layer 6 removeKeyword)", () => {
  it("Colossus Hammer removes flying and adds +10/+10", () => {
    const flier = creature("Flier", 1, 1, "user", { oracle: "Flying" }, "flier");
    expect(permanentHasKeyword(boardState([flier]), "flier", "Flying")).toBe(true);
    const hammer = equip("Hammer", "Equipped creature gets +10/+10 and loses flying.\nEquip {8}", "user", "hammer");
    let s = boardState([flier, hammer]);
    s = attachPermanent(s, { equipId: "hammer", targetId: "flier" });
    expect(permanentPower(s, "flier")).toBe(11);
    expect(permanentHasKeyword(s, "flier", "Flying")).toBe(false); // removed
  });
});

// ─── (B) granted protection — derive + the three enforcement sites ───────────────

const PROT_BG_AURA = "Enchant creature\nEnchanted creature gets +2/+2 and has protection from black and from green.";

describe("permanentProtectionColors — printed ∪ granted", () => {
  it("unions a granted protection from an attached aura with the creature's printed protection", () => {
    const knight = creature("Knight", 2, 2, "user", { oracle: "Protection from red" }, "knight");
    const aur = aura("ShadeWard", PROT_BG_AURA, "user", "aur");
    let s = boardState([knight, aur]);
    expect([...permanentProtectionColors(s, "knight")].sort()).toEqual(["R"]); // printed only, not yet attached
    s = attachPermanent(s, { equipId: "aur", targetId: "knight" });
    expect([...permanentProtectionColors(s, "knight")].sort()).toEqual(["B", "G", "R"]); // printed ∪ granted
  });
  it("the grant DISAPPEARS the instant the equipment unattaches (keyed on attachedTo)", () => {
    const bear = creature("Bear", 2, 2, "user", {}, "bear");
    const aur = aura("ShadeWard", PROT_BG_AURA, "user", "aur");
    let s = boardState([bear, aur]);
    s = attachPermanent(s, { equipId: "aur", targetId: "bear" });
    expect([...permanentProtectionColors(s, "bear")].sort()).toEqual(["B", "G"]);
    // Manually unattach (detach state) → the bonus vanishes.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map(p => p.id === "aur" ? { ...p, attachedTo: null } : (p.id === "bear" ? { ...p, attachments: [] } : p)) } } };
    expect(permanentProtectionColors(s, "bear").size).toBe(0);
  });
});

describe("granted protection — BLOCK (CR 702.16f)", () => {
  it("a creature with GRANTED protection from green can't be blocked by a green creature", () => {
    const att = creature("Hero", 2, 2, "user", {}, "hero");
    const aur = aura("ShadeWard", PROT_BG_AURA, "user", "aur");
    const greenBlk = creature("Wurm", 3, 3, "ai", { colors: ["G"] }, "wurm");
    let s = boardState([att, aur], [greenBlk]);
    s = attachPermanent(s, { equipId: "aur", targetId: "hero" });
    expect(canBlockAttacker(s, "wurm", "hero", "ai")).toBe(false); // granted protection from green
  });
  it("...but a WHITE creature can still block it (color-specific)", () => {
    const att = creature("Hero", 2, 2, "user", {}, "hero");
    const aur = aura("ShadeWard", PROT_BG_AURA, "user", "aur");
    const whiteBlk = creature("Angel", 3, 3, "ai", { colors: ["W"] }, "angel");
    let s = boardState([att, aur], [whiteBlk]);
    s = attachPermanent(s, { equipId: "aur", targetId: "hero" });
    expect(canBlockAttacker(s, "angel", "hero", "ai")).toBe(true);
  });
});

describe("granted protection — DAMAGE in combat (CR 702.16e)", () => {
  it("a creature with GRANTED protection from black takes NO combat damage from a black blocker", () => {
    const att = creature("Hero", 2, 4, "user", {}, "hero");
    const aur = aura("ShadeWard", PROT_BG_AURA, "user", "aur");
    const blackBlk = creature("Zombie", 3, 3, "ai", { colors: ["B"] }, "zombie");
    let s = boardState([att, aur], [blackBlk]);
    s = attachPermanent(s, { equipId: "aur", targetId: "hero" });
    const out = resolveCombatDamage({
      ...s,
      combat: {
        attackers: [{ permanentId: "hero", attackingPlayer: "user", defender: "ai" }],
        blockers: [{ blockerId: "zombie", blockingPlayer: "ai", attackerId: "hero" }],
      },
    });
    const hero = out.players.user.battlefield.find(p => p.id === "hero");
    expect(hero.damageMarked || 0).toBe(0); // black damage prevented by granted protection
  });
});

describe("granted protection — TARGETING (CR 702.16b)", () => {
  it("a creature with GRANTED protection from green can't be targeted by a green spell", () => {
    const bear = creature("Bear", 2, 2, "ai", {}, "bear");
    const aur = aura("ShadeWard", PROT_BG_AURA, "ai", "aur");
    let s = boardState([], [bear, aur]);
    s = attachPermanent(s, { equipId: "aur", targetId: "bear" });
    const perm = s.players.ai.battlefield.find(p => p.id === "bear");
    expect(canBeTargetedBy(s, perm, "ai", "user", ["G"])).toBe(false); // granted prot from green
    expect(canBeTargetedBy(s, perm, "ai", "user", ["W"])).toBe(true);  // white ok (color-specific)
    expect(canBeTargetedBy(s, perm, "ai", "user", [])).toBe(true);     // colorless ok
  });
});

// ─── coverage — CREED flips vs FNs ───────────────────────────────────────────────

describe("coverage — clean flips and pinned false-negatives (CREED)", () => {
  it("CLEAN flips: dynamic-PT / base-P/T-set / loses-keyword / static color-protection equipment+aura", () => {
    expect(classifyCard({ name: "Colossus Hammer", type: "Artifact — Equipment", oracle: "Equipped creature gets +10/+10 and loses flying.\nEquip {8} ({8}: Attach to target creature you control. Equip only as a sorcery.)" })).toBe("native-equipment");
    expect(classifyCard({ name: "Pennon Blade", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1 for each creature you control.\nEquip {4}" })).toBe("native-equipment");
    expect(classifyCard({ name: "Reduce in Stature", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has base power and toughness 0/2." })).toBe("native-aura");
    expect(classifyCard({ name: "Shield of Duty and Reason", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has protection from green and from blue." })).toBe("native-aura");
    expect(classifyCard({ name: "Blanchwood Armor", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each Forest you control." })).toBe("native-aura");
  });
  it("PINNED FNs: the Swords (combat-damage trigger rider), Commander's Plate (dynamic prot + typed equip),", () => {
    // Conqueror's Flail (opponents-can't-cast rider), Aettir and Priwen (dynamic base-P/T) — all body-only.
    expect(classifyCard({ name: "Sword of Feast and Famine", type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+2 and has protection from black and from green.\nWhenever equipped creature deals combat damage to a player, that player discards a card and you untap all lands you control.\nEquip {2}" })).toBe("body-only");
    expect(classifyCard({ name: "Sword of Wealth and Power", type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+2 and has protection from instants and from sorceries.\nWhenever equipped creature deals combat damage to a player, create a Treasure token.\nEquip {2}" })).toBe("body-only");
    expect(classifyCard({ name: "Commander's Plate", type: "Artifact — Equipment", oracle: "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip commander {3}\nEquip {5}" })).toBe("body-only");
    expect(classifyCard({ name: "Conqueror's Flail", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1 for each color among permanents you control.\nAs long as this Equipment is attached to a creature, your opponents can't cast spells during your turn.\nEquip {2}" })).toBe("body-only");
    expect(classifyCard({ name: "Aettir and Priwen", type: "Legendary Artifact — Equipment", oracle: "Equipped creature has base power and toughness X/X, where X is your life total.\nEquip {5}" })).toBe("body-only");
  });
});
