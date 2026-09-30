/**
 * hostSubtypeAttachedBonus.test.js — "As long as equipped creature is a Human, it gets an additional +1/+0." and its family
 * (the 09-06 plan's stage ③, census row ⑨, 2026-09-30).
 *
 * The census named three Equipment (True-Faith Censer, Silver-Inlaid Dagger, Heavy Mattock). The same condition also
 * blocked five more cards, each run for real below: Sharpened Pitchfork ("… it gets +1/+1"), Butcher's Cleaver ("… it has
 * lifelink"), Bladed Bracers ("… is a Human or an Angel, it has vigilance") and the Aura twins Hope Against Hope and
 * Equestrian Skill ("As long as enchanted creature is a Human, it has first strike / trample").
 *
 * The build is a fourth attached-bonus condition kind, `hostHasSubtype`, read by layers.gateMet off the HOST: Changeling
 * plus effectiveTypeIdentity, the same recursion-free read a tribal lord's subtype filter makes. P/T rides the gated twin
 * (ptModifyGated, evaluated in the layer-7 applier inside the derive); a keyword takes the gate directly (evaluated by
 * permanentHasKeyword outside the derive and by the derive's keyword set inside it) — one read serves both.
 *
 * Documented under-read (the safe side): a creature type added by a SELF or dynamic layer-4 effect (Metallic Mimic's chosen
 * type) is not in that read, so such a host goes without the bonus.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parseEquipmentBonus } from "./staticAbilityParser.js";
import { deriveCharacteristics, permanentHasKeyword, permanentPower, permanentToughness, permanentTypes } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const EQUIP = "Artifact — Equipment";
const CENSER = { name: "True-Faith Censer", type: EQUIP, mana: "{2}",
  oracle: "Equipped creature gets +1/+1 and has vigilance.\nAs long as equipped creature is a Human, it gets an additional +1/+0.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" };
const DAGGER = { name: "Silver-Inlaid Dagger", type: EQUIP, mana: "{1}",
  oracle: "Equipped creature gets +2/+0.\nAs long as equipped creature is a Human, it gets an additional +1/+0.\nEquip {2}" };
const MATTOCK = { name: "Heavy Mattock", type: EQUIP, mana: "{3}",
  oracle: "Equipped creature gets +1/+1.\nAs long as equipped creature is a Human, it gets an additional +1/+1.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" };
const PITCHFORK = { name: "Sharpened Pitchfork", type: EQUIP, mana: "{2}",
  oracle: "Equipped creature has first strike.\nAs long as equipped creature is a Human, it gets +1/+1.\nEquip {1}" };
const CLEAVER = { name: "Butcher's Cleaver", type: EQUIP, mana: "{3}",
  oracle: "Equipped creature gets +3/+0.\nAs long as equipped creature is a Human, it has lifelink.\nEquip {3}" };
const BRACERS = { name: "Bladed Bracers", type: EQUIP, mana: "{1}",
  oracle: "Equipped creature gets +1/+1.\nAs long as equipped creature is a Human or an Angel, it has vigilance.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" };
const HOPE = { name: "Hope Against Hope", type: "Enchantment — Aura", mana: "{2}{W}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each creature you control.\nAs long as enchanted creature is a Human, it has first strike." };
const EQUESTRIAN = { name: "Equestrian Skill", type: "Enchantment — Aura", mana: "{3}{G}",
  oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nAs long as enchanted creature is a Human, it has trample." };

const VANGUARD = { name: "Elite Vanguard", type: "Creature — Human Soldier", mana: "{W}", power: 2, toughness: 1, oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const CHANGELING = { name: "Woodland Changeling", type: "Creature — Shapeshifter", mana: "{1}{G}", power: 2, toughness: 2,
  keywords: ["Changeling"], oracle: "Changeling (This card is every creature type.)" };
const ANGEL = { name: "Tormented Angel", type: "Creature — Angel", mana: "{3}{W}", power: 1, toughness: 5, keywords: ["Flying"], oracle: "Flying" };
const DREAMER = { name: "Mistform Dreamer", type: "Creature — Illusion", mana: "{2}{U}", power: 2, toughness: 1, keywords: ["Flying"],
  oracle: "Flying\n{1}: This creature becomes the creature type of your choice until end of turn." };

const perm = (card, id, controller = "user") => createPermanent({ id, card, controller, summoningSick: false });
// createPermanent builds a clean permanent, so the attachment is laid on AFTER, both halves of it — the host lists the
// attachment and the attachment names its host, the shape an Equip or Aura cast leaves (the dispatcher's audit checks both).
const hostWith = (hostCard, attachmentCard) => [
  { ...perm(hostCard, "h"), attachments: ["a"] },
  { ...perm(attachmentCard, "a"), attachedTo: "h" },
];

function base(user = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: [] } } };
}
// The host (id "h") carrying one attachment (id "a").
const board = (hostCard, attachmentCard) => base(hostWith(hostCard, attachmentCard));
const pt = (s, id = "h") => `${permanentPower(s, id)}/${permanentToughness(s, id)}`;

describe("classification", () => {
  it("the census row — True-Faith Censer, Silver-Inlaid Dagger, Heavy Mattock → native-equipment", () => {
    for (const card of [CENSER, DAGGER, MATTOCK]) expect(classifyCard(card), card.name).toBe("native-equipment");
  });

  it("⭐ UNPLANNED, the same condition — Sharpened Pitchfork, Butcher's Cleaver, Bladed Bracers (Equipment) and Hope Against Hope, Equestrian Skill (Auras)", () => {
    for (const card of [PITCHFORK, CLEAVER, BRACERS]) expect(classifyCard(card), card.name).toBe("native-equipment");
    for (const card of [HOPE, EQUESTRIAN]) expect(classifyCard(card), card.name).toBe("native-aura");
  });

  it("the gated P/T rides the gated twin (a gate stamped on a plain ptModify would reach every host)", () => {
    const gated = parseEquipmentBonus(CENSER).filter((d) => d.op.gate);
    expect(gated).toEqual([expect.objectContaining({ op: { layerOp: "ptModifyGated", power: 1, toughness: 0, gate: { kind: "hostHasSubtype", subtypes: ["human"] } } })]);
  });

  it("⛔ only CR creature types reach the gate: 'is a Food' (an artifact subtype) and 'is legendary' stay residue", () => {
    const food = { ...DAGGER, name: "Synthetic Food Dagger", oracle: DAGGER.oracle.replace("is a Human", "is a Food") };
    expect(parseEquipmentBonus(food)).toEqual([]);
    expect(classifyCard(food)).toBe("body-only");
    const helm = { name: "Champion's Helm", type: EQUIP, mana: "{3}",
      oracle: "Equipped creature gets +2/+2.\nAs long as equipped creature is legendary, it has hexproof. (It can't be the target of spells or abilities your opponents control.)\nEquip {1}" };
    expect(classifyCard(helm)).toBe("body-only");
  });
});

describe("RUNTIME — the P/T bonus reads the host's creature types", () => {
  it("VACUITY CONTROL — True-Faith Censer on Grizzly Bears: only the unconditional +1/+1", () => {
    expect(pt(board(BEARS, CENSER))).toBe("3/3");
  });

  it("⭐ True-Faith Censer on Elite Vanguard (a Human): the additional +1/+0 applies", () => {
    const s = board(VANGUARD, CENSER);
    expect(pt(s)).toBe("4/2");
    expect(permanentHasKeyword(s, "h", "vigilance")).toBe(true);
    console.log(`WITNESS censerOnHuman ${pt(s)} · onBear ${pt(board(BEARS, CENSER))}`);
  });

  it("⭐ Silver-Inlaid Dagger and Heavy Mattock: Human vs not", () => {
    expect([pt(board(VANGUARD, DAGGER)), pt(board(BEARS, DAGGER))]).toEqual(["5/1", "4/2"]);
    expect([pt(board(VANGUARD, MATTOCK)), pt(board(BEARS, MATTOCK))]).toEqual(["4/3", "3/3"]);
  });

  it("⭐ Sharpened Pitchfork (no 'additional'): +1/+1 on a Human only; first strike either way", () => {
    expect([pt(board(VANGUARD, PITCHFORK)), pt(board(BEARS, PITCHFORK))]).toEqual(["3/2", "2/2"]);
    expect(permanentHasKeyword(board(BEARS, PITCHFORK), "h", "first strike")).toBe(true);
  });

  it("⭐ a Changeling host is every creature type (CR 702.73a): Woodland Changeling gets the Censer's additional +1/+0", () => {
    expect(pt(board(CHANGELING, CENSER))).toBe("4/3");
  });

  it("⭐ LAYER-AWARE, run for real: Mistform Dreamer wearing the Censer becomes a Human with its own {1} ability, and the bonus follows", () => {
    const s0 = base([...hostWith(DREAMER, CENSER), perm(VANGUARD, "ev")]);
    expect(pt(s0)).toBe("3/2");
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { ...s0.players.user.manaPool, C: 1 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "h");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(permanentTypes(out, "h").subtypes).toContain("Human");
    expect(pt(out)).toBe("4/2");
    console.log(`WITNESS mistformBecomesHuman ${pt(s0)} → ${pt(out)} (${permanentTypes(out, "h").subtypes.join(" ")})`);
  });
});

describe("RUNTIME — the keyword grants read the same gate, outside and inside the derive", () => {
  it("⭐ Butcher's Cleaver: lifelink on a Human, not on the Bears (the +3/+0 lands on both)", () => {
    const human = board(VANGUARD, CLEAVER);
    const bear = board(BEARS, CLEAVER);
    expect([permanentHasKeyword(human, "h", "lifelink"), permanentHasKeyword(bear, "h", "lifelink")]).toEqual([true, false]);
    expect([deriveCharacteristics(human, "h").keywords.has("lifelink"), deriveCharacteristics(bear, "h").keywords.has("lifelink")]).toEqual([true, false]);
    expect([pt(human), pt(bear)]).toEqual(["5/1", "5/2"]);
  });

  it("⭐ Bladed Bracers: vigilance on a Human AND on an Angel (either named type), not on the Bears", () => {
    expect([VANGUARD, ANGEL, BEARS].map((host) => permanentHasKeyword(board(host, BRACERS), "h", "vigilance"))).toEqual([true, true, false]);
  });

  it("⭐ the Auras — Hope Against Hope's first strike and Equestrian Skill's trample need a Human host", () => {
    expect([permanentHasKeyword(board(VANGUARD, HOPE), "h", "first strike"), permanentHasKeyword(board(BEARS, HOPE), "h", "first strike")]).toEqual([true, false]);
    expect([permanentHasKeyword(board(VANGUARD, EQUESTRIAN), "h", "trample"), permanentHasKeyword(board(BEARS, EQUESTRIAN), "h", "trample")]).toEqual([true, false]);
    expect([pt(board(VANGUARD, EQUESTRIAN)), pt(board(BEARS, EQUESTRIAN))]).toEqual(["5/4", "5/5"]);
  });
});

// Found while scoping: the shared type read (effectiveTypeIdentity) only ever ADDED a Mistform choice, and the atom snapshotted
// only the PRINTED line as what the choice replaces. Both fixed here, because this gate reads exactly that.
describe("the shared type read honours a Mistform replacement", () => {
  const LORD = { name: "Lord of the Unreal", type: "Creature — Human Wizard", mana: "{U}{U}", power: 2, toughness: 2,
    oracle: "Illusion creatures you control get +1/+1 and have hexproof. (They can't be the targets of spells or abilities your opponents control.)" };
  // One activation of "h"'s {1} ability, run for real (legal action → dispatch → resolve) with {1} floating.
  const activate = (s) => {
    const withMana = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, C: 1 } } } };
    const act = legalActionsForPlayer(withMana, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "h");
    expect(act).toBeTruthy();
    return resolveTopOfStack(dispatchAction(withMana, act));
  };

  it("⭐ FP CLOSED — Lord of the Unreal stops pumping a Mistform Dreamer once it has become a Human", () => {
    const s0 = base([perm(LORD, "lord"), perm(DREAMER, "h")]);
    expect([pt(s0), permanentHasKeyword(s0, "h", "hexproof")]).toEqual(["3/2", true]);
    const out = activate(s0);
    expect(permanentTypes(out, "h").subtypes).toEqual(["Human"]);
    expect([pt(out), permanentHasKeyword(out, "h", "hexproof")]).toEqual(["2/1", false]);
    console.log(`WITNESS lordStopsAtHuman ${pt(s0)} hexproof → ${pt(out)} ${permanentHasKeyword(out, "h", "hexproof") ? "hexproof" : "no hexproof"}`);
  });

  it("⭐ a SECOND choice replaces the first (CR 613.7): the Censer's Human bonus leaves when the Dreamer then becomes a Bear", () => {
    const human = activate(base([...hostWith(DREAMER, CENSER), perm(VANGUARD, "ev")]));
    expect(pt(human)).toBe("4/2");
    const withBears = { ...human, players: { ...human.players, user: { ...human.players.user,
      battlefield: [...human.players.user.battlefield, perm(BEARS, "b1"), perm(BEARS, "b2")] } } };
    const bear = activate(withBears);
    expect(permanentTypes(bear, "h").subtypes).toEqual(["Bear"]);
    expect(pt(bear)).toBe("3/2");
    console.log(`WITNESS secondChoice Human ${pt(human)} → Bear ${pt(bear)}`);
  });

  it("⛔ only CREATURE types are replaced (CR 205.1a): a synthetic 'Artifact Creature — Food Illusion' keeps Food", () => {
    const FOOD_DREAMER = { ...DREAMER, name: "Synthetic Food Dreamer", type: "Artifact Creature — Food Illusion" };
    const out = activate(base([perm(FOOD_DREAMER, "h"), perm(VANGUARD, "ev")]));
    expect([...permanentTypes(out, "h").subtypes].sort()).toEqual(["Food", "Human"]);
  });
});
