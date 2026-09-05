/**
 * auraEnchantRestrictions.test.js — qualified "Enchant <X>" subjects (CR 303.4a), census slice 17.
 *
 * The engine modeled exactly two Aura subjects, "creature" and "creature you control". Three more are
 * admitted here because each maps EXACTLY onto a restriction creatureSatisfiesRestrictions already
 * enforces — layer-aware and fail-closed — so this is wiring, not new targeting machinery:
 *
 *   "Enchant tapped creature"              -> { tapped: true }              Entangling Vines, Glimmerdust Nap
 *   "Enchant creature without flying"      -> { hasKeyword flying, negate } Roots, Trapped in the Tower
 *   "Enchant creature with power N or less"-> { power <= N }                Runner's Bane
 *
 * THE FALSE POSITIVE THIS GUARDS is a wrongly-LEGAL target: crediting the wording without narrowing the
 * offer would let Roots enchant a flier. Every restriction is therefore proven at the OFFER layer below,
 * on a board containing both a legal and an illegal creature — a classification test alone would not
 * catch it, because classification is exactly the half that can lie here.
 *
 * FOUND BY the census's new BUG SIGNATURES report: "enchanted creature doesn't untap during its
 * controller's untap step" showed 19 native carriers while still blocking 4 cards, which led to the real
 * difference — Roots is Waterknot plus the words "without flying" on its Enchant line.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { auraEnchantRestrictions } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ROOTS = { id: "c-roots", name: "Roots", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant creature without flying\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step." };
const VINES = { id: "c-vines", name: "Entangling Vines", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant tapped creature\nEnchanted creature doesn't untap during its controller's untap step." };
const BANE = { id: "c-bane", name: "Runner's Bane", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature with power 3 or less\nEnchanted creature doesn't untap during its controller's untap step." };

describe("the subject maps onto an already-enforced restriction", () => {
  it("tapped creature", () => {
    expect(auraEnchantRestrictions(VINES)).toEqual([{ kind: "tapped", value: true }]);
  });
  it("creature without flying", () => {
    expect(auraEnchantRestrictions(ROOTS)).toEqual([{ kind: "hasKeyword", keyword: "flying", negate: true }]);
  });
  it("creature with power N or less", () => {
    expect(auraEnchantRestrictions(BANE)).toEqual([{ kind: "power", op: "<=", value: 3 }]);
  });
  it("the two original subjects are untouched", () => {
    expect(auraEnchantRestrictions({ name: "A", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1." })).toEqual([]);
    expect(auraEnchantRestrictions({ name: "B", type: "Enchantment — Aura", oracle: "Enchant creature you control\nEnchanted creature gets +1/+1." }))
      .toEqual([{ kind: "controller", who: "you" }]);
  });

  it("CREED — an inexpressible subject still returns null (Aura parks, never a fabricated target set)", () => {
    // ⭐ "green creature" MOVED OUT of this list on 2026-08-03: creatureRestrictions has a layer-aware
    // positive `color` kind (CR 105.2), so the subject became expressible and is pinned as a POSITIVE
    // below. What remains here is genuinely inexpressible: a colour DISJUNCTION (restrictions are ANDed,
    // so it needs a new disjunctive kind), a type UNION against a fixed targetType "creature", and the
    // exotic subjects with no predicate at all.
    // ⚠️ TWO ENTRIES LEFT THIS LIST AND BOTH LEFT FOR REAL REASONS, not by weakening the assertion.
    // "creature or Vehicle" became a targetType (ES-1); "red or green creature" became a colorAny
    // restriction (CD-1) once the evaluator learned OR. Each is now pinned POSITIVELY in its own file.
    // What remains here is still genuinely inexpressible: no predicate exists for either.
    // "modified creature" GRADUATED (SH20, 2026-08-16 — Lion Umbra; it maps onto the layer-aware
    // isModifiedPermanent predicate now). "creature with another Aura attached to it" GRADUATED too (SHELF-85 · Daybreak
    // Coronet, 2026-09-05 — it maps onto the `enchanted` restriction kind). A counter KIND no restriction reads keeps the pin.
    for (const subject of ["creature with a shield counter on it"]) {
      expect(auraEnchantRestrictions({ name: "X", type: "Enchantment — Aura", oracle: `Enchant ${subject}\nEnchanted creature gets +1/+1.` })).toBeNull();
    }
  });

  it("the three subjects added 2026-08-03 map onto existing restriction kinds (see auraQualifiedSubjects.test.js)", () => {
    const mk = (subject) => ({ name: "X", type: "Enchantment — Aura", oracle: `Enchant ${subject}\nEnchanted creature gets +1/+1.` });
    expect(auraEnchantRestrictions(mk("green creature"))).toEqual([{ kind: "color", color: "G" }]);
    expect(auraEnchantRestrictions(mk("nonblack creature"))).toEqual([{ kind: "colorNeg", color: "B" }]);
    expect(auraEnchantRestrictions(mk("creature with mana value 2 or less"))).toEqual([{ kind: "manaValue", op: "<=", value: 2 }]);
  });
});

describe("classification", () => {
  it.each([[ROOTS], [VINES], [BANE]])("$name flips native-aura", (card) => {
    expect(classifyCard(card)).toBe("native-aura");
  });
});

describe("RUNTIME — the restriction actually narrows the OFFER (the FP this guards)", () => {
  function boardWith(auraCard, creatures) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    // Any-color sources so the harness never fails a cast for mana reasons — the assertion is about the
    // TARGET SET, and a mana miss would masquerade as a correctly-narrowed offer.
    const lands = ["l1", "l2", "l3", "l4"].map((id) => createPermanent({ id, card: { name: "City of Brass", type: "Land", oracle: "{T}: Add one mana of any color." }, controller: "user", summoningSick: false }));
    const perms = creatures.map((c) => ({ ...createPermanent({ id: c.id, card: c.card, controller: "user", summoningSick: false }), tapped: !!c.tapped }));
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [...lands, ...perms], hand: [auraCard] } } };
  }
  // NOTE: the cast action carries the card NAME directly (a.name), not a nested card object — filtering on
  // a.card?.name silently matches nothing and every assertion below would vacuously "pass" as [].
  const auraTargets = (s, name) => legalActionsForPlayer(s, "user")
    .filter((a) => a.isAuraSpell && a.name === name).map((a) => a.targets[0].id);

  const FLIER = { id: "fl", card: { id: "c-fl", name: "Flier", type: "Creature — Bird", power: 2, toughness: 2, oracle: "Flying" } };
  const GROUND = { id: "gr", card: { id: "c-gr", name: "Grounded", type: "Creature — Bear", power: 2, toughness: 2 } };

  it("Roots is offered on the GROUND creature and NOT on the flier", () => {
    const ids = auraTargets(boardWith(ROOTS, [FLIER, GROUND]), "Roots");
    expect(ids).toEqual(["gr"]);
  });

  it("Entangling Vines is offered only on a TAPPED creature", () => {
    const ids = auraTargets(boardWith(VINES, [{ ...GROUND, tapped: true }, { ...FLIER, tapped: false }]), "Entangling Vines");
    expect(ids).toEqual(["gr"]);
  });

  it("Runner's Bane is offered on power 3, not on power 4 (the boundary is inclusive)", () => {
    const p3 = { id: "p3", card: { id: "c-p3", name: "Three", type: "Creature — Bear", power: 3, toughness: 3 } };
    const p4 = { id: "p4", card: { id: "c-p4", name: "Four", type: "Creature — Bear", power: 4, toughness: 4 } };
    expect(auraTargets(boardWith(BANE, [p3, p4]), "Runner's Bane")).toEqual(["p3"]);
  });

  it("with NO legal creature the Aura is not castable at all (CR 303.4a)", () => {
    expect(auraTargets(boardWith(ROOTS, [FLIER]), "Roots")).toEqual([]);
  });
});
