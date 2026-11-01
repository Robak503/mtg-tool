/**
 * abilityLossShapes.test.js — the ability-loss shape registry (abilityLossShapes.js, ABILITY-LOSS-PROGRAM.md §2) with every stage
 * off (S0), and its four consult points.
 *   · OFF: no stage is on and no shape is registered, so the predicate answers null for every sentence of the family the program
 *     credits later (real bundled text) at every consult point — the cards stay parked, no parse and no game changes.
 *   · THE HOOK: a well-formed shape registered for a test (fresh text: every consult point caches by card object or text) is
 *     answered by each consult point when its stage is on — the attached-clause parser (and through it the layer engine: a static
 *     loss from an attached Aura at the Aura's attach timestamp, its `grantedWith: true` sibling kept), the static clause reader, the
 *     spell clause parser and auraPrintedSide — and ignored when its stage is off.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ABILITY_LOSS_STAGES, ABILITY_LOSS_CONTEXTS, abilityLossShape, abilityLossShapes, shapeIsWellFormed, _withAbilityLossShapesForTests } from "./abilityLossShapes.js";
import { parseAttachedBonus, parseStaticAbilities } from "./staticAbilityParser.js";
import { parseEffectProgram } from "./effects/parser.js";
import { printedAuraReading } from "./auraPrintedSide.js";
import { permanentHasKeyword, abilityLossOf, collectContinuousEffects, addContinuousEffect } from "./layers.js";
import { createGameState, createPermanent, attachPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// The family's printed text (bundled oracle — generated, never typed): the Auras, the spells and the global statics S1–S5 credit.
const FAMILY = [
  {"name":"Lignify","type":"Kindred Enchantment — Treefolk Aura","oracle":"Enchant creature\nEnchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities."},
  {"name":"Kenrith's Transformation","type":"Enchantment — Aura","oracle":"Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3. (It loses all other card types and creature types.)"},
  {"name":"Darksteel Mutation","type":"Enchantment — Aura","oracle":"Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types."},
  {"name":"Imprisoned in the Moon","type":"Enchantment — Aura","oracle":"Enchant creature, land, or planeswalker\nEnchanted permanent is a colorless land with \"{T}: Add {C}\" and loses all other card types and abilities."},
  {"name":"Amphibian Downpour","type":"Enchantment — Aura","oracle":"Flash\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies. Copies become tokens.)\nEnchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1."},
  {"name":"Stasis Field","type":"Enchantment — Aura","oracle":"Enchant creature\nEnchanted creature has base power and toughness 0/2, has defender, and loses all other abilities."},
  {"name":"Turn to Frog","type":"Instant","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1."},
  {"name":"Sudden Spoiling","type":"Instant","oracle":"Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nUntil end of turn, creatures target player controls lose all abilities and have base power and toughness 0/2."},
  {"name":"Humility","type":"Enchantment","oracle":"All creatures lose all abilities and have base power and toughness 1/1."},
  {"name":"Dress Down","type":"Enchantment","oracle":"Flash\nWhen this enchantment enters, draw a card.\nCreatures lose all abilities.\nAt the beginning of the end step, sacrifice this enchantment."},
  {"name":"Blood Sun","type":"Enchantment","oracle":"When this enchantment enters, draw a card.\nAll lands lose all abilities except mana abilities."},
];
const SERRA = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]};

const sentencesOf = (text) => String(text).split(/\n|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);

function boardOf(perms) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = perms.map((p, i) => ({ ...createPermanent({ id: p.id, card: p.card, controller: "user", summoningSick: false }), timestamp: i + 1 }));
  return { ...s0, timestampCounter: perms.length + 1, players: { ...s0.players, user: { ...s0.players.user, battlefield: bf } } };
}

describe("S0: every stage off, no shape registered", () => {
  it("no stage is on and the registry is empty", () => {
    expect(ABILITY_LOSS_STAGES).toEqual({ S1: false, S2: false, S3: false, S4: false, S5: false });
    expect(abilityLossShapes()).toEqual([]);
    expect(abilityLossShapes().every(shapeIsWellFormed)).toBe(true);
  });

  it("the predicate answers null for every sentence of the family, at every consult point, in any case", () => {
    let n = 0;
    for (const c of FAMILY) {
      for (const s of sentencesOf(c.oracle)) {
        for (const ctx of ABILITY_LOSS_CONTEXTS) {
          expect([c.name, s, ctx, abilityLossShape(s, ctx)]).toEqual([c.name, s, ctx, null]);
          expect(abilityLossShape(s.toLowerCase().replace(/\.$/, ""), ctx)).toBe(null);
          n += 1;
        }
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it("the family emits no loss op anywhere: no static, no attached bonus, no program atom", () => {
    for (const c of FAMILY) {
      const statics = [...parseStaticAbilities(c), ...parseAttachedBonus(c)];
      expect([c.name, statics.some((d) => d.op?.layerOp === "loseAllAbilities")]).toEqual([c.name, false]);
      const prog = parseEffectProgram(c);
      expect([c.name, JSON.stringify(prog ?? null).includes("loseAllAbilities")]).toEqual([c.name, false]);
    }
  });
});

describe("the hook: a shape is honoured at each consult point only while its stage is on", () => {
  const LOSS = { layer: 6, op: { layerOp: "loseAllAbilities" }, duration: { kind: "permanent" } };
  const SIBLING = { layer: 6, op: { layerOp: "addKeyword", keyword: "indestructible" }, grantedWith: true, duration: { kind: "permanent" } };
  const ATTACHED = { id: "test-attached", stage: "S1", pattern: /^enchanted creature loses all abilities and has indestructible and is a shapetest$/i, emit: { attached: [LOSS, SIBLING] } };
  const STATIC = { id: "test-static", stage: "S3", pattern: /^creatures you control with flying lose all abilities and are shapetests$/i,
    emit: { static: [{ ...LOSS, affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], withKeyword: "flying" } } }] } };
  const SPELL = { id: "test-spell", stage: "S1", pattern: /^target creature loses all shapetest(?:one|two) abilities until end of turn$/i, emit: { spell: () => ({ op: "draw", amount: 1, targetType: null, shapeId: "test-shape-atom" }) } }; // a known atom: a program keeps only those
  const SIDE = { id: "test-side", stage: "S1", pattern: /^enchanted creature loses all abilities and becomes a shapetest$/i, emit: { side: "enemy" } };
  const ALL = [ATTACHED, STATIC, SPELL, SIDE];

  it("attached: the Aura's loss applies at its attach timestamp, its own grantedWith sibling stays, a later grant works", () => {
    const aura = (n) => ({ name: `Shape Test Aura ${n}`, type: "Enchantment — Aura", mana: "{1}{U}", oracle: "Enchant creature\nEnchanted creature loses all abilities and has indestructible and is a shapetest.", colors: ["U"] });
    _withAbilityLossShapesForTests(ALL, { S1: true }, () => {
      const a = aura(1);
      expect(parseAttachedBonus(a).map((d) => d.op.layerOp)).toEqual(["loseAllAbilities", "addKeyword"]);
      let s = attachPermanent(boardOf([{ id: "angel", card: SERRA }, { id: "aura", card: a }]), { equipId: "aura", targetId: "angel" });
      const auraTs = s.players.user.battlefield.find((p) => p.id === "aura").timestamp;
      expect(abilityLossOf(s, "angel")?.timestamp).toBe(auraTs);
      expect(["flying", "vigilance", "indestructible"].map((k) => permanentHasKeyword(s, "angel", k))).toEqual([false, false, true]);
      s = addContinuousEffect(s, { layer: 6, op: { layerOp: "addKeyword", keyword: "Flying" }, affects: { mode: "fixed", permanentIds: ["angel"] }, duration: { kind: "permanent" } }).state;
      expect(permanentHasKeyword(s, "angel", "flying")).toBe(true);
    });
    _withAbilityLossShapesForTests(ALL, { S1: false }, () => {
      const a = aura(2);
      expect(parseAttachedBonus(a)).toEqual([]);
      const s = attachPermanent(boardOf([{ id: "angel", card: SERRA }, { id: "aura", card: a }]), { equipId: "aura", targetId: "angel" });
      expect([abilityLossOf(s, "angel"), permanentHasKeyword(s, "angel", "flying")]).toEqual([null, true]);
    });
  });

  it("static: a global loss parsed off a permanent's text reaches the creatures its selector picks", () => {
    const ench = (n) => ({ name: `Shape Test Enchantment ${n}`, type: "Enchantment", mana: "{2}{W}", oracle: "Creatures you control with flying lose all abilities and are shapetests.", colors: ["W"] });
    _withAbilityLossShapesForTests(ALL, { S3: true }, () => {
      const s = boardOf([{ id: "angel", card: SERRA }, { id: "ench", card: ench(1) }]);
      expect(collectContinuousEffects(s).some((e) => e.op?.layerOp === "loseAllAbilities" && e.source?.permanentId === "ench")).toBe(true);
      expect([permanentHasKeyword(s, "angel", "flying"), permanentHasKeyword(s, "angel", "vigilance")]).toEqual([false, false]);
    });
    _withAbilityLossShapesForTests(ALL, { S3: false }, () => {
      const s = boardOf([{ id: "angel", card: SERRA }, { id: "ench", card: ench(2) }]);
      expect(permanentHasKeyword(s, "angel", "flying")).toBe(true);
    });
  });

  it("spell: the clause parser answers the shape's atom", () => {
    const spell = (n) => ( // the spell parse is memoized by TEXT (effects/parseMemo.js): each run reads its own text
      { name: `Shape Test Instant ${n}`, type: "Instant", mana: "{U}", oracle: `Target creature loses all shapetest${n === 1 ? "one" : "two"} abilities until end of turn.`, colors: ["U"] });
    _withAbilityLossShapesForTests(ALL, { S1: true }, () => {
      expect(JSON.stringify(parseEffectProgram(spell(1)))).toContain("test-shape-atom");
    });
    _withAbilityLossShapesForTests(ALL, { S1: false }, () => {
      expect(JSON.stringify(parseEffectProgram(spell(2)) ?? null)).not.toContain("test-shape-atom");
    });
  });

  it("side: auraPrintedSide reads the shape's side", () => {
    const aura = (n) => ({ name: `Shape Test Side Aura ${n}`, type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature loses all abilities and becomes a shapetest." });
    _withAbilityLossShapesForTests(ALL, { S1: true }, () => {
      expect(printedAuraReading(aura(1)).side).toBe("enemy");
    });
    _withAbilityLossShapesForTests(ALL, { S1: false }, () => {
      expect(printedAuraReading(aura(2)).side).not.toBe("enemy");
    });
  });

  it("refuses a malformed shape and restores the registry after a throw", () => {
    expect(shapeIsWellFormed({ id: "x", stage: "S1", pattern: /loses all abilities/, emit: {} })).toBe(false); // unanchored
    expect(shapeIsWellFormed({ id: "x", stage: "S9", pattern: /^x$/, emit: {} })).toBe(false);
    expect(shapeIsWellFormed({ id: "x", stage: "S1", pattern: /^x$/, emit: { elsewhere: 1 } })).toBe(false);
    expect(() => _withAbilityLossShapesForTests([{ id: "bad", stage: "S1", pattern: /x/, emit: {} }], {}, () => 0)).toThrow(/malformed/);
    expect(() => _withAbilityLossShapesForTests(ALL, { S1: true }, () => { throw new Error("inner"); })).toThrow("inner");
    expect(abilityLossShape("enchanted creature loses all abilities and has indestructible and is a shapetest", "attached")).toBe(null);
  });
});
