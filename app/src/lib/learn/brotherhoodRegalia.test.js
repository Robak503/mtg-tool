/**
 * brotherhoodRegalia.test.js — the THREE-GRANT equip line (Brotherhood Regalia, SHELF-TAIL W8).
 *
 * "Equipped creature has ward {2}, is an Assassin in addition to its other types, and can't be blocked."
 * ONE parser arm, three existing lanes: addWard (the Cathedral group grant's layer-6 op —
 * permanentGrantedWardCosts taxes it; attached bonuses reach it through staticEffectsOf →
 * collectContinuousEffects), the generic layer-4 subtype ADD (applyTypeColorLayers' animate lane), and
 * the "unblockable" pseudo-keyword (the until-EOT cant-be-blocked atom's op, read layer-aware at block
 * legality). The dual equip costs ("Equip legendary creature {1}" / "Equip {3}") were ALREADY modeled
 * (equipQuality:"legendary") — verified in the probe, which is why this slice is one arm.
 *
 * Mutation-checked: `false &&` on the reg arm → all three runtime pins die (the bonus drops to [] and
 * the card reverts body-only) — the single-arm slice needs the single mutation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { permanentGrantedWardCosts, permanentTypes, permanentHasKeyword } from "./layers.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const REGALIA = {
  name: "Brotherhood Regalia", type: "Artifact — Equipment", mana: "{2}",
  oracle: "Equipped creature has ward {2}, is an Assassin in addition to its other types, and can't be blocked.\nEquip legendary creature {1}\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)",
};

function cr(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear" } = {}) {
  return { id, card: { name, type, power, toughness, oracle }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function equip(id, controller, attachedTo) {
  return { id, card: { name: REGALIA.name, type: REGALIA.type, oracle: REGALIA.oracle }, controller, tapped: false, counters: {}, damageMarked: 0, attachments: [], attachedTo };
}
function st({ userBf = [], aiBf = [], blockers = [], step = "declare-blockers", activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer, step, phase: "combat", combat: { attackers: [], blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
function attachedBoard() {
  const host = cr("Host", "h", "user");
  host.attachments = ["eq"];
  return st({ userBf: [host, equip("eq", "user", "h")], aiBf: [cr("B1", "b1", "ai")] });
}

describe("Brotherhood Regalia — the three-grant line", () => {
  it("MUST STAY PARSED: all three descriptors emit; the card classifies native-equipment", () => {
    expect(parseAttachedBonus(REGALIA)).toEqual([
      { layer: 6, op: { layerOp: "addWard", generic: 2 }, duration: { kind: "permanent" } },
      { layer: 4, op: { subtypes: ["Assassin"] }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "unblockable" }, duration: { kind: "permanent" } },
    ]);
    expect(classifyCard(REGALIA)).toBe("native-equipment");
  });
  it("CREED near-miss: a variant tail drops the whole bonus", () => {
    expect(parseAttachedBonus({ ...REGALIA, oracle: REGALIA.oracle.replace("can't be blocked.", "can't be blocked by Wolves.") })).toEqual([]);
  });
  it("RUNTIME — the host is warded {2}, IS an Assassin (layer-aware), and is unblockable; all three lift unattached", () => {
    const s = attachedBoard();
    expect(permanentGrantedWardCosts(s, "h")).toEqual([{ generic: 2 }]);          // the ward taxes (mutation-check line)
    expect(permanentTypes(s, "h").subtypes).toContain("Assassin");                // the layer-4 add
    expect(permanentHasKeyword(s, "h", "unblockable")).toBe(true);                // the block-side keyword
    // The control: the same host WITHOUT the equipment has none of the three.
    const bare = st({ userBf: [cr("Host", "h", "user")], aiBf: [cr("B1", "b1", "ai")] });
    expect(permanentGrantedWardCosts(bare, "h")).toEqual([]);
    expect(permanentTypes(bare, "h").subtypes).not.toContain("Assassin");
    expect(permanentHasKeyword(bare, "h", "unblockable")).toBe(false);
  });
  it("BLOCK DECLARATION — the equipped attacker is offered ZERO blocks; the bare control is blockable", () => {
    const s = attachedBoard();
    expect(filterActions(legalActionsForPlayer(s, "ai", { declaredAttackers: ["h"] }), "declare-blocker")).toHaveLength(0);
    const bare = st({ userBf: [cr("Host", "h", "user")], aiBf: [cr("B1", "b1", "ai")] });
    expect(filterActions(legalActionsForPlayer(bare, "ai", { declaredAttackers: ["h"] }), "declare-blocker").length).toBeGreaterThanOrEqual(1);
  });
});
