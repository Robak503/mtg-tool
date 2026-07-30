/**
 * modifiedAnthem.test.js — the MODIFIED qualifier (CR 700.9).
 *
 * > CR 700.9: "A permanent is modified if it has one or more counters on it (see rule 122), if it is equipped
 * > (see rule 301.5), or if it is enchanted by an Aura that is controlled by that permanent's controller
 * > (see rule 303.4)."
 *
 * Verified against knowledge/mtg-judge/data/cr/cr_current.json. ⚠️ I first wrote this citation as "CR 701.48"
 * from memory; 701.48 is **Learn**. Never write a rule number without looking it up.
 *
 * ⭐ THE SAME GRADUATION TEST `nontoken` PASSED: a board-quality word earns a selector once it has live,
 * carrier-backed fields. `modified` has three, all already tracked — the counters map, and the `attachedTo`
 * back-pointers that gateMet's `isEquipped` walk already reads.
 *
 * ⛔ THE CONTROLLER SCOPE ON THE AURA CLAUSE IS THE FP TRAP, AND IT IS THE POINT OF THIS FILE. An Aura counts
 * only when the permanent's OWN controller controls it — an opponent's Pacifism does NOT make your creature
 * modified. A naive "any Aura attached" read would hand the anthem to creatures the printed card excludes.
 * Equipment carries no such clause (CR 301.5b): equipped is equipped, whoever owns the Equipment.
 */
import { describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { deriveCharacteristics } from "./layers.js";

const REMINDER = "(Equipment, Auras you control, and counters are modifications.)";
const ENCH = { name: "Enthusiast", type: "Enchantment", mana: "{2}{R}" };

const kwOf = (d) => {
  const k = d.keywords;
  if (!k) return [];
  if (Array.isArray(k)) return k.map((x) => String(x).toLowerCase());
  if (k instanceof Set) return [...k].map((x) => String(x).toLowerCase());
  return Object.keys(k).filter((x) => k[x]).map((x) => x.toLowerCase());
};

describe("⭐ the modified anthem parses, reminder text and all", () => {
  it("bare and 'other' spellings both classify native — asserted as a pair (ordering guard)", () => {
    // The determiner arm matches "OTHER modified creatures you control" with word="modified", hits the
    // exclusion set and returns null, so placement above it is load-bearing — same trap as nontoken.
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: `Modified creatures you control have menace. ${REMINDER}` }))).toBe(true);
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: `Other modified creatures you control have vigilance and trample. ${REMINDER}` }))).toBe(true);
  });

  it("the printed reminder is inert (CR 207.2) — with or without it reads the same", () => {
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: "Modified creatures you control have menace." }))).toBe(true);
    expect(isNativeTier(classifyCard({ ...ENCH, oracle: `Modified creatures you control have menace. ${REMINDER}` }))).toBe(true);
  });
});

describe("⛔⭐ RUNTIME — all three CR 700.9 clauses, and only those", () => {
  const src = { id: "src", controller: "me", card: { name: "Artillery Enthusiast", type: "Enchantment", oracle: "Modified creatures you control have menace." } };
  const bear = (id) => ({ id, controller: "me", card: { name: id, type: "Creature — Bear", power: 2, toughness: 2 } });
  const plain = bear("plain");
  const counter = { ...bear("ctr"), counters: { "+1/+1": 1 } };
  const zero = { ...bear("zero"), counters: { "+1/+1": 0 } };
  const equipped = bear("eq");
  const myEnchanted = bear("ma");
  const oppEnchanted = bear("oa");
  const sword = { id: "sword", controller: "me", attachedTo: "eq", card: { name: "Sword", type: "Artifact — Equipment" } };
  const myAura = { id: "myaura", controller: "me", attachedTo: "ma", card: { name: "Blessing", type: "Enchantment — Aura" } };
  const oppAura = { id: "oppaura", controller: "opp", attachedTo: "oa", card: { name: "Pacifism", type: "Enchantment — Aura" } };
  const state = { players: {
    me: { battlefield: [src, plain, counter, zero, equipped, myEnchanted, oppEnchanted, sword, myAura], life: 40, hand: [], graveyard: [] },
    opp: { battlefield: [oppAura], life: 40, hand: [], graveyard: [] },
  } };
  const hasMenace = (id) => kwOf(deriveCharacteristics(state, id)).includes("menace");

  it("an UNmodified creature gets nothing", () => {
    expect(hasMenace("plain")).toBe(false);
  });

  it("clause 1 — one or more counters on it (CR 122)", () => {
    expect(hasMenace("ctr")).toBe(true);
  });

  it("⛔ a counters map holding only ZERO is NOT modified (the count is read, not the key)", () => {
    // A permanent that once had a counter keeps the key at 0. Reading key-presence instead of the value would
    // permanently mark it modified — quietly wrong forever after the first counter is removed.
    expect(hasMenace("zero")).toBe(false);
  });

  it("clause 2 — equipped (CR 301.5b), whoever controls the Equipment", () => {
    expect(hasMenace("eq")).toBe(true);
  });

  it("clause 3 — enchanted by an Aura ITS CONTROLLER controls (CR 303.4)", () => {
    expect(hasMenace("ma")).toBe(true);
  });

  it("⛔⭐ an OPPONENT's Aura does NOT make it modified — the FP trap in CR 700.9", () => {
    // THE test. Drop the controller comparison and this is the one assertion that fails: an opposing Pacifism
    // would hand your creature the anthem, doing something the printed card forbids.
    expect(hasMenace("oa")).toBe(false);
  });
});

describe("⛔ the 'other' spelling excludes the source (CR 113.7)", () => {
  it("a modified creature source does not buff itself but does buff a modified neighbour", () => {
    const src = { id: "src", controller: "me", counters: { "+1/+1": 1 }, card: { name: "Red XIII", type: "Legendary Creature — Beast Warrior", power: 3, toughness: 3, oracle: "Other modified creatures you control have trample." } };
    const mate = { id: "mate", controller: "me", counters: { "+1/+1": 1 }, card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 } };
    const st = { players: { me: { battlefield: [src, mate], life: 40, hand: [], graveyard: [] } } };
    expect(kwOf(deriveCharacteristics(st, "src"))).not.toContain("trample");
    expect(kwOf(deriveCharacteristics(st, "mate"))).toContain("trample");
  });
});
