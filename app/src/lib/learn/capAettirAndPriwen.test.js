/**
 * capAettirAndPriwen.test.js — the DYNAMIC layer-7b base-P/T set (SHELF CAP8 — Aettir and Priwen:
 * "Equipped creature has base power and toughness X/X, where X is your life total").
 *
 * Three seams:
 *   1. parseEquipmentBonus's dynamic arm — op { countSpec:{kind:"lifeTotal"}, setPower, setToughness }
 *      on sublayer 7b (whole-clause anchored: any other metric falls to the literal arm and drops).
 *   2. layers' 7b applier — a countSpec op resolves through the LOCAL countForSpec twin at every
 *      derive (CR 613.7 — the base tracks life BOTH directions). ⚠️ The twin was the trap: the kind
 *      was added to BOTH countForSpec copies (shared.js + layers.js) per their both-must-agree rule —
 *      shared-only would classify native while the runtime derived base 0/0, the vacuous-native FP.
 *   3. 7c still stacks ON TOP of the 7b set (counters/anthems add after — CR 613.4).
 * CREED FP = a base that doesn't track a life change, or an unequipped creature affected.
 *
 * Real oracle fixture (bundled Scryfall snapshot, pulled 2026-08-30 — never from memory).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEquipmentBonus } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const AETTIR = { id: "c-ap", name: "Aettir and Priwen", type: "Legendary Artifact — Equipment", mana: "{6}",
  oracle: "Equipped creature has base power and toughness X/X, where X is your life total.\nEquip {5}" };

const perm = (card, id, controller = "user", over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });

function board({ life = 27, equipped = true } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const bear = perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "bear", "user", equipped ? { attachments: ["ap"] } : {});
  const aettir = perm(AETTIR, "ap", "user", equipped ? { attachedTo: "bear" } : {});
  return { ...b, players: { ...b.players, user: { ...b.players.user, life, battlefield: [bear, aettir] } } };
}

describe("parse + classify", () => {
  it("⭐ the dynamic arm emits the 7b countSpec op; Aettir flips native-equipment", () => {
    const ops = parseEquipmentBonus(AETTIR);
    expect(ops).toEqual([
      { layer: 7, sublayer: "7b", op: { countSpec: { kind: "lifeTotal" }, setPower: true, setToughness: true }, duration: { kind: "permanent" } },
    ]);
    expect(classifyCard(AETTIR)).toBe("native-equipment");
  });

  it("⛔ any OTHER 'where X is …' metric drops the whole bonus (safe FN, the pre-existing park)", () => {
    const v = { ...AETTIR, id: "c-v", name: "Odd Blades",
      oracle: "Equipped creature has base power and toughness X/X, where X is the number of Zombies you control.\nEquip {5}" };
    expect(parseEquipmentBonus(v)).toEqual([]);
    expect(classifyCard(v)).toBe("body-only");
  });
});

describe("⭐ LAW 6 — the base TRACKS the live life total, both directions", () => {
  it("at 27 life the equipped bear is 27/27; life changes move the base immediately (CR 613.7)", () => {
    let s = board({ life: 27 });
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([27, 27]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, life: 5 } } };
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([5, 5]);   // shrank with the life
    s = { ...s, players: { ...s.players, user: { ...s.players.user, life: 40 } } };
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([40, 40]); // grew back
  });

  it("7c stacks ON TOP of the dynamic set — a +1/+1 counter lands after the 7b base (CR 613.4)", () => {
    let s = board({ life: 10 });
    s = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: s.players.user.battlefield.map((p) => p.id === "bear" ? { ...p, counters: { "+1/+1": 2 } } : p) } } };
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([12, 12]);
  });

  it("⛔ FP guard — UNEQUIPPED, the bear keeps its printed 2/2", () => {
    const s = board({ life: 27, equipped: false });
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([2, 2]);
  });
});
