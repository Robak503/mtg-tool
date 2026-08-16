/**
 * auraQualifiedSubjects.test.js — three more QUALIFIED "Enchant <qualified> creature" subjects
 * (CR 303.4a), admitted on exactly the terms the shipped three were: each maps onto a restriction
 * `creatureSatisfiesRestrictions` ALREADY enforces, so this is wiring and cannot mint a wrongly-legal
 * host.
 *   "nonblack creature"                  -> colorNeg   (Armor of Thorns)
 *   "green creature"                     -> color      (Wurmweaver Coil)
 *   "creature with mana value N or less" -> manaValue   (Threads of Disloyalty)
 *
 * ⭐ HOW THE SIZE WAS ESTABLISHED, because a grouped count is not a flip count (the runbook's rule, and
 * it mattered here): 120 non-native Auras carry a non-plain enchant subject, but a SUBSTITUTION probe —
 * swap the Enchant line for "Enchant creature", keep every other line byte-identical, re-classify —
 * found only 16 blocked SOLELY by the subject. The other 104 have further unmodeled text and would flip
 * nothing. Three of those 16 map onto existing restriction kinds; the rest are named as parks below.
 *
 * ⚠️ A STALE CLAIM CORRECTED IN PLACE. auraEnchantRestrictions' own comment said positive COLOUR subjects
 * "have no positive-color restriction kind". True when written, false now — creatureRestrictions grew a
 * layer-aware `color` branch (CR 105.2: it reads permanentColors, so a creature TURNED green is a legal
 * host and a printed-green one turned white is not). Believing the comment instead of reading the code
 * would have parked Wurmweaver Coil for nothing.
 *
 * FALL-OFF, stated plainly and unchanged: qualified subjects are enforced at CAST. The CR 704.5n sweep
 * checks only "Enchant creature|land|permanent", so an Aura does NOT fall off if its host later stops
 * matching. That is the module's existing documented policy ("a missed fall-off is the safe direction; a
 * wrong kill is the forbidden one") and it already governs the shipped subjects — followed here, not
 * reversed, because widening the sweep would trade a safe miss for the forbidden failure mode.
 *
 * Mutation-checked (2026-08-03, each verified applied before its result was read):
 *   • colorNeg -> color (sign flipped) -> the Armor of Thorns runtime pin goes red (it would offer the
 *     BLACK creature and refuse the green one — the wrongly-legal-host direction);
 *   • the manaValue cap raised 2 -> 9 -> the Threads of Disloyalty runtime pin goes red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { auraEnchantRestrictions } from "./staticAbilityParser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ARMOR_OF_THORNS = { id: "c-aot", name: "Armor of Thorns", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: "Enchant nonblack creature\nEnchanted creature gets +2/+2." };
const WURMWEAVER_COIL = { id: "c-wc", name: "Wurmweaver Coil", type: "Enchantment — Aura", mana: "{3}{G}{G}",
  oracle: "Enchant green creature\nEnchanted creature gets +6/+6.\n{G}{G}{G}, Sacrifice this Aura: Create a 6/6 green Wurm creature token." };
const THREADS_OF_DISLOYALTY = { id: "c-td", name: "Threads of Disloyalty", type: "Enchantment — Aura", mana: "{1}{U}{U}",
  oracle: "Enchant creature with mana value 2 or less\nYou control enchanted creature." };

const creature = (id, name, { colors = [], cmc = 3, power = "2", toughness = "2" } = {}) =>
  createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", power, toughness, colors, cmc, oracle: "" }, controller: "user", summoningSick: false });

function castBoard(auraCard, battlefield, pool) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield, hand: [auraCard],
      manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
}
const auraTargets = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
  .filter((a) => a.isAuraSpell).map((a) => a.targets?.[0]?.name);

describe("the subjects map onto restrictions the runtime already enforces", () => {
  it("each yields the expected restriction descriptor", () => {
    expect(auraEnchantRestrictions(ARMOR_OF_THORNS)).toEqual([{ kind: "colorNeg", color: "B" }]);
    expect(auraEnchantRestrictions(WURMWEAVER_COIL)).toEqual([{ kind: "color", color: "G" }]);
    expect(auraEnchantRestrictions(THREADS_OF_DISLOYALTY)).toEqual([{ kind: "manaValue", op: "<=", value: 2 }]);
  });
  it("the shipped subjects are unchanged (no regression in the three that already worked)", () => {
    expect(auraEnchantRestrictions({ ...ARMOR_OF_THORNS, id: "c-r1", oracle: "Enchant tapped creature\nEnchanted creature gets +2/+2." })).toEqual([{ kind: "tapped", value: true }]);
    expect(auraEnchantRestrictions({ ...ARMOR_OF_THORNS, id: "c-r2", oracle: "Enchant creature without flying\nEnchanted creature gets +2/+2." })).toEqual([{ kind: "hasKeyword", keyword: "flying", negate: true }]);
    expect(auraEnchantRestrictions({ ...ARMOR_OF_THORNS, id: "c-r3", oracle: "Enchant creature with power 3 or less\nEnchanted creature gets +2/+2." })).toEqual([{ kind: "power", op: "<=", value: 3 }]);
  });
  it("⛔ the subjects this slice deliberately does NOT model still return null (Arbiter)", () => {
    // A colour DISJUNCTION needs a new disjunctive kind (restrictions are ANDed); a TYPE UNION needs a
    // targetType that isn't fixed to "creature"; the exotic subjects have no predicate at all.
    // ⚠️ THREE ENTRIES GRADUATED OUT OF THIS LIST: the type unions became targetTypes (ES-1) and the
    // colour disjunction became a colorAny restriction (CD-1). The list is SHORTER, never weaker — the
    // survivors have no predicate at all, which is exactly the property this pin guards.
    // "modified creature" GRADUATED (SH20, 2026-08-16 — Lion Umbra). "creature with another Aura attached to
    // it" still has no predicate — the survivor that keeps this pin meaningful.
    for (const subj of ["creature with another Aura attached to it"]) {
      expect(auraEnchantRestrictions({ ...ARMOR_OF_THORNS, id: "c-n", oracle: `Enchant ${subj}\nEnchanted creature gets +2/+2.` }), subj).toBeNull();
    }
  });
});

describe("recognition", () => {
  it("the three carriers flip", () => {
    expect(classifyCard(ARMOR_OF_THORNS)).toBe("native-aura");
    expect(classifyCard(WURMWEAVER_COIL)).toBe("native-activated");   // via the EQ-2 self-sac composite
    expect(classifyCard(THREADS_OF_DISLOYALTY)).toBe("native-aura");
  });
  it("⛔ an unmodeled subject still parks the whole card even with a modeled body", () => {
    // ⚠️ THE FIXTURE WAS "red or green creature" UNTIL CD-1 MODELLED IT. A test whose fixture is chosen
    // for being UNMODELLED will rot every time this project does its job — the same lesson the
    // entersCountersStripAnchor fixture has now taught three times. Swapped for a subject that still has
    // no predicate, rather than the assertion being softened.
    expect(classifyCard({ ...ARMOR_OF_THORNS, id: "c-p", oracle: "Enchant creature with another Aura attached to it\nEnchanted creature gets +2/+2." })).toBe("body-only");
  });
});

describe("⭐ RUNTIME (law 6) — the restriction actually FILTERS the cast targets", () => {
  it("nonblack: the green creature is offered, the black one is not", () => {
    const s = castBoard(ARMOR_OF_THORNS, [creature("g", "Grizzly", { colors: ["G"] }), creature("b", "Zombie", { colors: ["B"] })], { G: 3 });
    expect(auraTargets(s)).toEqual(["Grizzly"]);
  });

  it("green: only the GREEN creature is offered", () => {
    const s = castBoard(WURMWEAVER_COIL, [creature("g", "Grizzly", { colors: ["G"] }), creature("r", "Goblin", { colors: ["R"] })], { G: 5 });
    expect(auraTargets(s)).toEqual(["Grizzly"]);
  });

  it("mana value 2 or less: the 2-drop is offered, the 5-drop is not", () => {
    const s = castBoard(THREADS_OF_DISLOYALTY, [creature("cheap", "Squire", { cmc: 2 }), creature("big", "Titan", { cmc: 5 })], { U: 3 });
    expect(auraTargets(s)).toEqual(["Squire"]);
  });

  it("⛔ with NO legal host the Aura is not castable at all (never a wrongly-legal target)", () => {
    const s = castBoard(ARMOR_OF_THORNS, [creature("b", "Zombie", { colors: ["B"] })], { G: 3 });
    expect(auraTargets(s)).toEqual([]);
  });

  it("⭐ the GRANT/composite cast lane honours the filter too — the FP this slice nearly shipped", () => {
    // Wurmweaver Coil tiers native-activated through the EQ-2 self-sac composite, whose cast is offered by
    // grantAuraCastHostType — a DIFFERENT lane from isNativeAura's, and one that read only `ownOnly`.
    // Its plain-subject regex was the only thing keeping it honest, so making the subject expressible
    // credited a card that lane still could not attach: it fell to the no-target push. Both halves now
    // read auraEnchantRestrictions, so tier and offer stand on one source. (Correction 20 in the flesh:
    // the tier diff was a clean +3/0/0 BEFORE this was found — a classification diff cannot see a card
    // the cast lane refuses to attach.)
    const s = castBoard(WURMWEAVER_COIL, [creature("g", "Grizzly", { colors: ["G"] }), creature("r", "Goblin", { colors: ["R"] })], { G: 5 });
    expect(auraTargets(s)).toEqual(["Grizzly"]);
  });
});
