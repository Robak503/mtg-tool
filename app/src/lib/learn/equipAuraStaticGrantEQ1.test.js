/**
 * equipAuraStaticGrantEQ1.test.js — BLITZ EQ-1 (EQUIPMENT/AURA STATIC — the grant-vocabulary gap).
 *
 * The "Equipped/Enchanted creature has <keyword>" grant only ever admitted keywords in
 * GRANTABLE_STATIC_KEYWORDS. Five more keywords are now grantable — each already a COVERED_KEYWORDS native on
 * a vanilla creature AND read at its enforcement site via the LAYER-AWARE permanentHasKeyword, so a layer-6
 * addKeyword grant switches it on/off with the attachment exactly like a printed one:
 *   - infect / wither (CR 702.90b/702.80a) — combatResolution reroutes combat damage (creature → -1/-1,
 *     infect player → poison).
 *   - intimidate / skulk / horsemanship (CR 702.13b/702.118b/702.31b) — canBlockAttacker block restrictions.
 *   - basic landwalk (plains/island/swamp/mountain/forest-walk, CR 702.14) — canBlockAttacker unblockable
 *     gated on the DEFENDING player's lands.
 * And "has ward {N}" (fixed generic, CR 702.21) now emits a layer-6 addWard grant, scoped to the attached
 * creature by staticEffectsOf and unioned with any printed ward at ward.js's soft-counter tax site.
 *
 * CREED discipline pinned below: toxic is NOT grantable (toxicValue reads the printed oracle, not layer-aware),
 * nonbasic landwalk has no enforcement path, and a colored/{X} ward grant has no enforced granted-cost — each
 * drops the WHOLE bonus (a safe false-negative), and any dropped-tail rider parks the card.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPermanent, createGameState, attachPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEquipmentBonus, parseAuraBonus } from "./staticAbilityParser.js";
import { permanentHasKeyword, permanentGrantedWardCosts } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { wardTaxForStackObject } from "./ward.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, power, toughness, controller, { colors = [], oracle = "", type_line = "Creature" } = {}, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, power, toughness, type_line, colors, oracle }, controller });
const equip = (name, oracle, controller, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, type_line: "Artifact — Equipment", oracle }, controller });
const aura = (name, oracle, controller, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, type_line: "Enchantment — Aura", oracle }, controller });
const land = (name, subtype, controller, id) =>
  createPermanent({ id: id || name, card: { id: `${name}-card`, name, type_line: `Basic Land — ${subtype}` }, controller });

function boardState(userBf = [], aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn: 3,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}

// ─── (A) parser — the new grantable keywords + ward {N} on REAL oracle ────────────

describe("parseAttachedClause — new grantable keywords (real oracle)", () => {
  it("Phyresis 'Enchanted creature has infect' → a lone layer-6 addKeyword(infect)", () => {
    expect(parseAuraBonus({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has infect. (Reminder.)" })).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "infect" }, duration: { kind: "permanent" } },
    ]);
  });
  it("Executioner's Hood 'Equipped creature has intimidate' → addKeyword(intimidate)", () => {
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature has intimidate.\nEquip {2}" })).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "intimidate" }, duration: { kind: "permanent" } },
    ]);
  });
  it("Volcanic Strength '+2/+2 and has mountainwalk' → ptModify + addKeyword(mountainwalk)", () => {
    expect(parseAuraBonus({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +2/+2 and has mountainwalk." })).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 2 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "mountainwalk" }, duration: { kind: "permanent" } },
    ]);
  });
  it("Blight Sickle '+1/+0 and has wither' → ptModify + addKeyword(wither)", () => {
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+0 and has wither.\nEquip {2}" })).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 1, toughness: 0 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "wither" }, duration: { kind: "permanent" } },
    ]);
  });
});

describe("parseAttachedClause — EQUIP-WARD (has ward {N}, fixed generic)", () => {
  it("Lavaspur Boots '+1/+0 and has haste and ward {1}' → ptModify + addKeyword(Haste) + addWard(1)", () => {
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+0 and has haste and ward {1}. (Reminder.)\nEquip {1}" })).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 1, toughness: 0 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Haste" }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addWard", generic: 1 }, duration: { kind: "permanent" } },
    ]);
  });
  it("Crystal Carapace '+3/+3 and has ward {2}' → ptModify + addWard(2)", () => {
    expect(parseAuraBonus({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +3/+3 and has ward {2}." })).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addWard", generic: 2 }, duration: { kind: "permanent" } },
    ]);
  });
  it("a COLORED / {X} ward grant is NOT modeled → whole bonus drops (safe FN)", () => {
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature has ward {W}.\nEquip {2}" })).toEqual([]);
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature has ward {X}.\nEquip {2}" })).toEqual([]);
    expect(parseAuraBonus({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has ward—pay 3 life." })).toEqual([]);
  });
});

// ─── (B) runtime — the grant reaches the attached creature and LIFTS when unattached ──

describe("runtime — granted keyword reaches the attached creature and lifts on unattach", () => {
  it("infect via aura reaches the enchanted creature; gone the instant it unattaches", () => {
    const bear = creature("Bear", 2, 2, "user", {}, "bear");
    const aur = aura("Phyresis", "Enchant creature\nEnchanted creature has infect.", "user", "aur");
    let s = boardState([bear, aur]);
    expect(permanentHasKeyword(s, "bear", "Infect")).toBe(false); // not yet attached
    s = attachPermanent(s, { equipId: "aur", targetId: "bear" });
    expect(permanentHasKeyword(s, "bear", "Infect")).toBe(true);
    // Unattach → the layer-6 grant (keyed on attachedTo) disappears.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map(p => p.id === "aur" ? { ...p, attachedTo: null } : (p.id === "bear" ? { ...p, attachments: [] } : p)) } } };
    expect(permanentHasKeyword(s, "bear", "Infect")).toBe(false);
  });

  it("a MULTI-keyword grant grants ALL listed keywords (Lavaspur Boots: haste + ward {1})", () => {
    const bear = creature("Bear", 2, 2, "user", {}, "bear");
    const boots = equip("Lavaspur Boots", "Equipped creature gets +1/+0 and has haste and ward {1}.\nEquip {1}", "user", "boots");
    let s = boardState([bear, boots]);
    s = attachPermanent(s, { equipId: "boots", targetId: "bear" });
    expect(permanentHasKeyword(s, "bear", "Haste")).toBe(true);
    expect(permanentGrantedWardCosts(s, "bear")).toEqual([{ generic: 1 }]);
    // …and ward.js raises a soft-counter tax when an OPPONENT targets the equipped creature.
    const tax = wardTaxForStackObject(s, { controller: "ai", targets: [{ type: "creature", id: "bear" }] });
    expect(tax?.cost).toEqual({ kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
  });
});

// ─── (B) runtime — each keyword is actually ENFORCED on the attached creature ─────

describe("runtime enforcement — granted evasion keywords", () => {
  it("granted intimidate: a non-artifact off-color blocker can't block; an artifact / shared-color one can", () => {
    const hero = creature("Hero", 2, 2, "user", { colors: ["R"] }, "hero");
    const hood = equip("Executioner's Hood", "Equipped creature has intimidate.\nEquip {2}", "user", "hood");
    const greenBlk = creature("Wurm", 3, 3, "ai", { colors: ["G"] }, "wurm");
    const redBlk = creature("Goblin", 1, 1, "ai", { colors: ["R"] }, "goblin");
    const artBlk = createPermanent({ id: "golem", card: { id: "golem-card", name: "Golem", power: 3, toughness: 3, type_line: "Artifact Creature", colors: [] }, controller: "ai" });
    let s = boardState([hero, hood], [greenBlk, redBlk, artBlk]);
    s = attachPermanent(s, { equipId: "hood", targetId: "hero" });
    expect(canBlockAttacker(s, "wurm", "hero", "ai")).toBe(false);  // off-color, non-artifact → blocked
    expect(canBlockAttacker(s, "goblin", "hero", "ai")).toBe(true); // shares red
    expect(canBlockAttacker(s, "golem", "hero", "ai")).toBe(true);  // artifact
  });

  it("granted skulk: a GREATER-power blocker can't block; an equal/lesser one can", () => {
    const rogue = creature("Rogue", 2, 2, "user", {}, "rogue");
    const sword = equip("Segovian Sword", "Equipped creature has skulk.\nEquip {1}", "user", "sword");
    const big = creature("Ogre", 3, 3, "ai", {}, "ogre");
    const small = creature("Rat", 1, 1, "ai", {}, "rat");
    let s = boardState([rogue, sword], [big, small]);
    s = attachPermanent(s, { equipId: "sword", targetId: "rogue" });
    expect(canBlockAttacker(s, "ogre", "rogue", "ai")).toBe(false); // greater power
    expect(canBlockAttacker(s, "rat", "rogue", "ai")).toBe(true);   // lesser power
  });

  it("granted islandwalk: unblockable while the DEFENDING player controls an Island", () => {
    const fish = creature("Fish", 2, 2, "user", {}, "fish");
    const oil = aura("Fishliver Oil", "Enchant creature\nEnchanted creature has islandwalk.", "user", "oil");
    const blk = creature("Bear", 2, 2, "ai", {}, "blk");
    // Defender controls an Island → unblockable.
    let s = boardState([fish, oil], [blk, land("Island", "Island", "ai", "isl")]);
    s = attachPermanent(s, { equipId: "oil", targetId: "fish" });
    expect(canBlockAttacker(s, "blk", "fish", "ai")).toBe(false);
    // No Island on the defender's side → the block is legal again.
    let s2 = boardState([fish, oil], [blk]);
    s2 = attachPermanent(s2, { equipId: "oil", targetId: "fish" });
    expect(canBlockAttacker(s2, "blk", "fish", "ai")).toBe(true);
  });
});

describe("runtime enforcement — granted infect reroutes combat damage", () => {
  it("an unblocked infect attacker deals POISON to the player, not life loss", () => {
    const hero = creature("Hero", 3, 3, "user", {}, "hero");
    const aur = aura("Phyresis", "Enchant creature\nEnchanted creature has infect.", "user", "aur");
    let s = boardState([hero, aur]);
    s = attachPermanent(s, { equipId: "aur", targetId: "hero" });
    const lifeBefore = s.players.ai.life;
    const out = resolveCombatDamage({
      ...s,
      combat: { attackers: [{ permanentId: "hero", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    });
    expect(out.players.ai.poison).toBe(3);        // 3 poison from the infect attacker
    expect(out.players.ai.life).toBe(lifeBefore); // life untouched (damage became poison)
  });
});

// ─── (C) coverage — clean flips and pinned false-negatives (CREED) ────────────────

describe("coverage — clean EQ-1 flips (real cards)", () => {
  it("keyword-grant equipment/auras flip to their native tier", () => {
    expect(classifyCard({ name: "Phyresis", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has infect. (It deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)" })).toBe("native-aura");
    expect(classifyCard({ name: "Executioner's Hood", type: "Artifact — Equipment", oracle: "Equipped creature has intimidate. (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" })).toBe("native-equipment");
    expect(classifyCard({ name: "Blight Sickle", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+0 and has wither. (It deals damage to creatures in the form of -1/-1 counters.)\nEquip {2}" })).toBe("native-equipment");
    expect(classifyCard({ name: "Fishliver Oil", type: "Enchantment — Aura", oracle: "Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\nEnchanted creature has islandwalk. (It can't be blocked as long as defending player controls an Island.)" })).toBe("native-aura");
    expect(classifyCard({ name: "Lavaspur Boots", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+0 and has haste and ward {1}. (Whenever it becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\nEquip {1}" })).toBe("native-equipment");
    expect(classifyCard({ name: "Crystal Carapace", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +3/+3 and has ward {2}.\nCycling {2} ({2}, Discard this card: Draw a card.)" })).toBe("native-aura");
  });
});

describe("coverage — PINNED false-negatives (whole-card-or-park)", () => {
  it("toxic is NOT grantable (not layer-aware) → the whole grant drops → body-only", () => {
    expect(parseAuraBonus({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has toxic 1." })).toEqual([]);
    expect(classifyCard({ name: "Toxic Aura", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has toxic 1." })).toBe("body-only");
    // A dropped-tail (infect + toxic) parks the whole grant — never a partial-credit flip.
    expect(parseAuraBonus({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has infect and toxic 1." })).toEqual([]);
  });
  it("nonbasic landwalk has no enforcement path → body-only (Trailblazer's Boots)", () => {
    expect(parseEquipmentBonus({ type: "Artifact — Equipment", oracle: "Equipped creature has nonbasic landwalk.\nEquip {1}" })).toEqual([]);
  });
  it("⭐ GRADUATED — the control-theft rider is now MODELED, so Corrupted Conscience flips", () => {
    // This pin used to assert body-only. It was a CAPABILITY pin ("control theft has no enforcement path"),
    // grouped with toxic and nonbasic landwalk for exactly that reason — and it graduated when
    // controlAura.js gave the line a runtime: attachPermanent moves the host, detachPermanentFromAll sends
    // it home by every route the Aura can leave. Verified BEFORE flipping it, not after: the other half
    // (infect) is genuinely granted and enforced — permanentHasKeyword reads it on the host after attach —
    // so the whole-card rule is satisfied on both lines rather than half-credited.
    expect(classifyCard({ name: "Corrupted Conscience", type: "Enchantment — Aura", oracle: "Enchant creature\nYou control enchanted creature.\nEnchanted creature has infect." })).toBe("native-aura");
  });

  it("⛔ but the WHOLE-CARD rule still holds — control plus an UNMODELED rider still parks", () => {
    // The principle the old pin existed to protect, re-pointed onto a rider that is still genuinely
    // unmodeled (toxic is not grantable — the pin above). Modelling control must not become a licence to
    // credit whatever else the card happens to print alongside it.
    expect(classifyCard({ name: "Corrupt Toxin", type: "Enchantment — Aura", oracle: "Enchant creature\nYou control enchanted creature.\nEnchanted creature has toxic 1." })).toBe("body-only");
  });
});
