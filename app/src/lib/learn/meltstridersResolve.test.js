/**
 * meltstridersResolve.test.js — the ENCHANTED-HOST fight + the ATTACHED block-cap (Meltstrider's Resolve,
 * SHELF-TAIL W7 — CR 303.4 + 701.12 + 509.1c).
 *
 * Four seams, each riding an existing convention:
 *  ① the fight arm "ENCHANTED CREATURE fights (up to one) target creature you don't control / an opponent
 *    controls" → the op:"fight" atom + fighterReferent:"enchantedHost" (the sourceAnchored sibling);
 *  ② fightCreature resolves the fighter as the aura's live attachedTo (unattached → clean no-op);
 *  ③ parseAttachedBonus's "+X/+Y and can't be blocked by more than one creature" → ptModify + the
 *    blockCapOne pseudo-keyword (the cantAttack/mustAttack layer-6 convention — lifts when the aura leaves);
 *  ④ legalBlockerActions' cap read is now printed-OR-granted.
 *
 * RIDERS (whole-card audited): Pitiless Fists + Warbriar Blessing (the same fight ETB + simple bonuses)
 * and Wolfrider's Saddle (equipment: the cap static; its create+attach ETB verified riding the REAL
 * attachSourceToCreated rider — checked, not assumed).
 *
 * Mutation-checked: disabling the fight arm kills the parse/tier pins; `false &&` on the fighterReferent
 * resolution kills "the HOST fights" (the aura would fight instead — the mis-bind); dropping the
 * blockCapOne read at the block site kills "no second blocker offered" (the over-block direction).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { fightCreature } from "./effects/atoms/combat.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MELT = {
  name: "Meltstrider's Resolve", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature you control\nWhen this Aura enters, enchanted creature fights up to one target creature an opponent controls. (Each deals damage equal to its power to the other.)\nEnchanted creature gets +0/+2 and can't be blocked by more than one creature.",
};

function cr(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear" } = {}) {
  return { id, card: { name, type, power, toughness, oracle }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function aura(id, controller, attachedTo) {
  return { id, card: { name: MELT.name, type: MELT.type, oracle: MELT.oracle }, controller, tapped: false, counters: {}, damageMarked: 0, attachments: [], attachedTo };
}
function st({ userBf = [], aiBf = [], attackers = [], blockers = [], step = "declare-blockers", activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer, step, phase: "combat", combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}

describe("Meltstrider's — parse + classify (the four carriers)", () => {
  it("MUST STAY HIGH: both fight-clause variants → fighterReferent:'enchantedHost' + optionalTarget", () => {
    for (const clause of [
      "enchanted creature fights up to one target creature an opponent controls",
      "enchanted creature fights up to one target creature you don't control",
    ]) {
      const p = parseEffectClause(clause, "Instant", { sourceScoped: true });
      expect(programConfidence(p)).toBe("high");
      expect(p.atoms[0]).toMatchObject({ op: "fight", fighterReferent: "enchantedHost", optionalTarget: true, sourceAnchored: true });
    }
  });
  it("the attached bonus parses BOTH halves (never a silent cap drop)", () => {
    expect(parseAttachedBonus(MELT)).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 0, toughness: 2 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "blockCapOne" }, duration: { kind: "permanent" } },
    ]);
  });
  it("the four carriers classify native (whole-card audited riders)", () => {
    expect(classifyCard(MELT)).toBe("native-aura");
    expect(classifyCard({ name: "Pitiless Fists", type: "Enchantment — Aura", oracle: "Enchant creature you control\nWhen this Aura enters, enchanted creature fights up to one target creature an opponent controls.\nEnchanted creature gets +2/+2." })).toBe("native-aura");
    expect(classifyCard({ name: "Wolfrider's Saddle", type: "Artifact — Equipment", oracle: "When this Equipment enters, create a 2/2 green Wolf creature token, then attach this Equipment to it.\nEquipped creature gets +1/+1 and can't be blocked by more than one creature.\nEquip {3}" })).toBe("native-equipment");
  });
  it("CREED near-miss: a rider on the cap clause drops the WHOLE bonus", () => {
    expect(parseAttachedBonus({ name: "X", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +0/+2 and can't be blocked by more than one creature and has flying." })).toEqual([]);
  });
});

describe("Meltstrider's — the HOST fights (CR 701.12 via CR 303.4)", () => {
  const atom = { op: "fight", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], optionalTarget: true, sourceAnchored: true, fighterReferent: "enchantedHost" };
  it("the aura's HOST exchanges damage with the target — the aura itself never fights (mutation-check line)", () => {
    const host = cr("Host", "h", "user", { power: 3, toughness: 4 });
    host.attachments = ["au"];
    const enemy = cr("Enemy", "e", "ai", { power: 2, toughness: 5 });
    const s = st({ userBf: [host, aura("au", "user", "h")], aiBf: [enemy], step: "main" });
    const after = fightCreature(s, atom, { controller: "user", sourceId: "au", targets: [{ type: "creature", id: "e" }] });
    expect(after.players.ai.battlefield.find((p) => p.id === "e").damageMarked).toBe(3);   // the HOST's power
    expect(after.players.user.battlefield.find((p) => p.id === "h").damageMarked).toBe(2); // the enemy hits the HOST
    expect(after.players.user.battlefield.find((p) => p.id === "au").damageMarked).toBe(0); // never the aura
  });
  it("an unattached aura → nothing fights (clean no-op)", () => {
    const enemy = cr("Enemy", "e", "ai");
    const s = st({ userBf: [aura("au", "user", null)], aiBf: [enemy], step: "main" });
    const after = fightCreature(s, atom, { controller: "user", sourceId: "au", targets: [{ type: "creature", id: "e" }] });
    expect(after.players.ai.battlefield.find((p) => p.id === "e").damageMarked).toBe(0);
  });
});

describe("Meltstrider's — the GRANTED block cap at declaration (CR 509.1c)", () => {
  it("with the aura attached: one blocker declared → NO second offer; without it → the second IS offered", () => {
    const att = cr("Attacker", "a", "user", { power: 3, toughness: 3 });
    att.attachments = ["au"];
    const capped = st({
      userBf: [att, aura("au", "user", "a")],
      aiBf: [cr("B1", "b1", "ai"), cr("B2", "b2", "ai")],
      blockers: [{ blockerId: "b1", attackerId: "a" }],
    });
    expect(filterActions(legalActionsForPlayer(capped, "ai", { declaredAttackers: ["a"] }), "declare-blocker")).toHaveLength(0); // the cap holds (mutation-check line)
    const uncapped = st({
      userBf: [cr("Attacker", "a", "user", { power: 3, toughness: 3 })],
      aiBf: [cr("B1", "b1", "ai"), cr("B2", "b2", "ai")],
      blockers: [{ blockerId: "b1", attackerId: "a" }],
    });
    expect(filterActions(legalActionsForPlayer(uncapped, "ai", { declaredAttackers: ["a"] }), "declare-blocker").length).toBeGreaterThanOrEqual(1); // the seen-to-fail control
  });
});
