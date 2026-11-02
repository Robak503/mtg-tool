/**
 * abilityLossShapes.test.js — the ability-loss shape registry (abilityLossShapes.js, ABILITY-LOSS-PROGRAM.md §2) with S1 and S2 on
 * and S3–S5 off, and its four consult points. (The S1 and S2 cards' play is abilityLossS1.test.js and abilityLossS2.test.js.)
 *   · S1 AND S2 ON, THE REST OFF: every registered shape is S1's or S2's; every sentence of the family S3–S5 credit (real bundled
 *     text) answers null at every consult point — those cards stay parked; S1's and S2's members answer where they are read, and only
 *     in their printed forms.
 *   · THE HOOK: a well-formed shape registered for a test (fresh text: every consult point caches by card object or text) is
 *     answered by each consult point when its stage is on — the attached-clause parser (and through it the layer engine: a static
 *     loss from an attached Aura at the Aura's attach timestamp, its `grantedWith: true` sibling kept), the static clause reader, the
 *     spell clause parser and auraPrintedSide — and ignored when its stage is off.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ABILITY_LOSS_STAGES, ABILITY_LOSS_CONTEXTS, abilityLossShape, abilityLossShapes, shapeIsWellFormed, _withAbilityLossShapesForTests } from "./abilityLossShapes.js";
import { parseAttachedBonus, parseStaticAbilities } from "./staticAbilityParser.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
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

// The family's members S1 and S2 read (Lignify, Turn to Frog — S1; Kenrith's Transformation, and Amphibian Downpour's sentence — S2);
// the rest are S3–S5's (ABILITY-LOSS-PROGRAM.md §3).
const READ_MEMBERS = new Set(["Lignify", "Turn to Frog", "Kenrith's Transformation", "Amphibian Downpour"]);

describe("S1 and S2 on, S3–S5 off (the S1 slice turned the first stage on, the S2 slice the second)", () => {
  it("only S1 and S2 are on; every shape is well formed, has a unique id and is S1's or S2's", () => {
    expect(ABILITY_LOSS_STAGES).toEqual({ S1: true, S2: true, S3: false, S4: false, S5: false });
    expect(abilityLossShapes().length).toBeGreaterThan(0);
    expect(abilityLossShapes().every(shapeIsWellFormed)).toBe(true);
    expect(new Set(abilityLossShapes().map((s) => s.id)).size).toBe(abilityLossShapes().length);
    expect([...new Set(abilityLossShapes().map((s) => s.stage))]).toEqual(["S1", "S2"]);
  });

  it("every sentence of the family S3–S5 build answers null at every consult point, in any case; S1's and S2's answer where they are read", () => {
    let n = 0;
    for (const c of FAMILY.filter((x) => !READ_MEMBERS.has(x.name))) {
      for (const s of sentencesOf(c.oracle)) {
        for (const ctx of ABILITY_LOSS_CONTEXTS) {
          expect([c.name, s, ctx, abilityLossShape(s, ctx)]).toEqual([c.name, s, ctx, null]);
          expect(abilityLossShape(s.toLowerCase().replace(/\.$/, ""), ctx)).toBe(null);
          n += 1;
        }
      }
    }
    expect(n).toBe(60); // 15 sentences of the seven S3–S5 cards × the four consult points
    const lig = "enchanted creature is a treefolk with base power and toughness 0/4 and loses all abilities";
    expect((abilityLossShape(lig, "attached", { subject: "enchanted", noun: "creature" }) ?? []).map((d) => d.op.layerOp)).toEqual(["replaceCreatureTypes", "ptSet", "loseAllAbilities"]);
    expect([abilityLossShape(lig, "side"), abilityLossShape(lig, "static"), abilityLossShape(lig, "spell")]).toEqual(["enemy", null, null]);
    expect(abilityLossShape(lig, "attached", { subject: "equipped", noun: "creature" })).toBe(null); // an Equipment's "equipped creature" never
    const frog = "Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1";
    expect(abilityLossShape(frog, "spell")).toEqual({ op: "lose-all-abilities", targetType: "creature", until: "endOfTurn", subtypes: ["Frog"], colors: ["U"], basePt: { power: 1, toughness: 1 } });
    expect([abilityLossShape(frog, "attached", { subject: "enchanted", noun: "creature" }), abilityLossShape(frog, "static"), abilityLossShape(frog, "side")]).toEqual([null, null, null]);
    const elk = "enchanted creature loses all abilities and is a green elk creature with base power and toughness 3/3";
    expect((abilityLossShape(elk, "attached", { subject: "enchanted", noun: "creature" }) ?? []).map((d) => d.op.layerOp)).toEqual(["loseAllAbilities", "setCardTypes", "replaceCreatureTypes", "setColor", "ptSet"]);
    expect([abilityLossShape(elk, "side"), abilityLossShape(elk, "static"), abilityLossShape(elk, "spell")]).toEqual(["enemy", null, null]);
    expect(abilityLossShape(elk, "attached", { subject: "equipped", noun: "creature" })).toBe(null);
  });

  it("the family emits a loss op only through its S1 and S2 members: Lignify's, Kenrith's Transformation's and Amphibian Downpour's attached bonus, Turn to Frog's program atom", () => {
    for (const c of FAMILY) {
      const statics = [...parseStaticAbilities(c), ...parseAttachedBonus(c)];
      expect([c.name, statics.some((d) => d.op?.layerOp === "loseAllAbilities")]).toEqual([c.name, ["Lignify", "Kenrith's Transformation", "Amphibian Downpour"].includes(c.name)]);
      const prog = parseEffectProgram(c);
      expect([c.name, JSON.stringify(prog ?? null).includes("lose-all-abilities")]).toEqual([c.name, c.name === "Turn to Frog"]);
    }
  });

  it("Retro-Mutation's \"It …\" is read as the enchanted creature only right after an \"Enchanted creature …\" sentence; anywhere else the Aura parks", () => {
    const retro = { name: "Shape Test Retro", type: "Enchantment — Aura", mana: "{2}{U}", oracle: "Enchant creature\nEnchanted creature is a Turtle with base power and toughness 0/1. It can't attack and loses all abilities." };
    expect(parseAttachedBonus(retro).map((d) => d.op.layerOp)).toEqual(["replaceCreatureTypes", "ptSet", "addKeyword", "loseAllAbilities"]);
    expect([classifyCard(retro), printedAuraReading(retro).side]).toEqual(["native-aura", "enemy"]);
    const orphan = { name: "Shape Test Orphan", type: "Enchantment — Aura", mana: "{2}{U}", oracle: "Enchant creature\nFlash\nIt can't attack and loses all abilities." };
    expect(parseAttachedBonus(orphan)).toEqual([]);
    expect(classifyCard(orphan)).not.toMatch(/^native/);
  });

  it("the S1 shapes are anchored to their printed forms: a reordered, duration-less, doubled-duration or card-type form answers null", () => {
    const at = (t) => abilityLossShape(t, "attached", { subject: "enchanted", noun: "creature" });
    expect([
      at("enchanted creature has base power and toughness 1/1 and loses all abilities"), // the reverse of Kasmina's order
      at("enchanted creature loses all abilities and is a blue glorb with base power and toughness 1/1"), // no CR creature type
      at("enchanted creature loses all abilities"), // a bare loss: no printed S1 form
      abilityLossShape("Target creature loses all abilities and has base power and toughness 0/1", "spell"), // no duration: a loss for good
      abilityLossShape("Until end of turn, target creature loses all abilities and has base power and toughness 0/1 until end of turn", "spell"),
      abilityLossShape("Until end of turn, target creature you control loses all abilities and has base power and toughness 0/1", "spell"),
      abilityLossShape("Until end of turn, target creature loses all abilities and becomes a blue Frog creature with base power and toughness 1/1", "spell"),
    ]).toEqual([null, null, null, null, null, null, null]);
  });

  it("the S2 shape is anchored to its printed form: the S2 sentence reordered, with no creature type, two colours, a name, \"artifact creature\" or \"in addition\" answers null", () => {
    const at = (t) => abilityLossShape(t, "attached", { subject: "enchanted", noun: "creature" });
    expect(at("enchanted creature loses all abilities and is a blue frog creature with base power and toughness 1/1")?.map((d) => d.op.layerOp)).toEqual(["loseAllAbilities", "setCardTypes", "replaceCreatureTypes", "setColor", "ptSet"]);
    expect(at("enchanted creature loses all abilities and is a coward creature with base power and toughness 0/1")?.map((d) => d.op.layerOp)).toEqual(["loseAllAbilities", "setCardTypes", "replaceCreatureTypes", "ptSet"]);
    expect([
      at("enchanted creature is a blue frog creature with base power and toughness 1/1 and loses all abilities"), // reordered: no printed form
      at("enchanted creature loses all abilities and is a blue glorb creature with base power and toughness 1/1"), // no CR creature type
      at("enchanted creature loses all abilities and is a green and white citizen creature with base power and toughness 1/1 named legitimate businessperson"), // Witness Protection: a name
      at("enchanted creature loses all abilities and is a toy artifact creature with base power and toughness 0/2 in addition to its other types"), // Unable to Scream: an add (CR 205.1b)
      at("enchanted creature loses all abilities and is an insect artifact creature with base power and toughness 0/1"), // "[creature type] artifact creature" (CR 205.1b)
      at("enchanted creature loses all abilities and is a blue frog creature with base power and toughness 1/1 until end of turn"),
      abilityLossShape("enchanted creature loses all abilities and is a blue frog creature with base power and toughness 1/1", "spell"),
    ]).toEqual([null, null, null, null, null, null, null]);
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
