/**
 * massRemovalFilterDelegation.test.js — the mass DESTROY/EXILE filter vocabulary, delegated (19 cards).
 *
 * Aligned Hedron Network · Citywide Bust · Cleanse · Crystalline Entity · Extinguish All Hope ·
 * Guan Yu's 1,000-Li March · Mass Calcify · Nature's Ruin · Organic Extinction · Perish · Plague Wind ·
 * Planar Outburst · Realm-Cloaked Giant // Cast Off · Split Up · Sunblast Angel · Their Name Is Death ·
 * Vault 75: Middle School · Virtue's Ruin · Whirlwind.
 *
 * ⭐ THE AXIS, ONE LAYER UP FROM A VOCABULARY. Two subsystems filtered creature SETS and had drifted apart:
 * the damage side carried a 16-kind `restrictions` array evaluated by `creatureSatisfiesRestrictions`, while
 * mass destroy/exile/bounce hand-rolled a parallel, much narrower one on bespoke atom fields
 * (`subtypeFilter`/`subtypeNegate`, `powerCmp`, `mvCmp`, `landSubtype`) inside `massCreatureTargets`. The same
 * printed filter was sayable to one verb and not its neighbour.
 *
 * ⭐ IT COULD NOT SIMPLY BE IMPORTED. `effects/atoms/shared.js` is a STRICT LEAF and `spellEffects.js` is not,
 * so the satisfier was EXTRACTED to its own leaf (`creatureRestrictions.js`) that both sides import. Its only
 * edges are gameState + layers + keywords, every one of which `atoms/shared.js` already had — so the move adds
 * no cycle in either direction. The body was copied verbatim, never retyped, so the move alone cannot change
 * behaviour; the existing damage-side suites are the witness for that half.
 *
 * ⛔ TWO PEELS HAPPEN AT THE CALL SITE, NOT IN THE GRAMMAR, and the second one was a silent failure:
 *   (a) "all" — the grammar's filler list has "each" but not "all", so it would survive as residue;
 *   (b) the PLURAL noun — mass removal says "destroy all creatureS" while the grammar's entry gate is
 *       `\bcreature\b`, which does not match "creatures". Left plural, the probe returned
 *       `{restrictions: [], clean: true}` for EVERY card — clean because nothing was ever examined. That is
 *       the quietest failure shape there is: it looks exactly like "this card has no filters".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargets } from "./effects/atoms/shared.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (clause, type = "Sorcery") => (parseEffectClause(clause, type, { hasX: false })?.atoms || [])[0] || null;

describe("⭐ the delegated filter vocabulary — kinds mass removal could never say", () => {
  const CASES = [
    ["Destroy all creatures you don't control.", { kind: "controller", who: "opponent" }],
    ["Destroy all nonwhite creatures.", { kind: "colorNeg", color: "W" }],
    ["Destroy all black creatures.", { kind: "color", color: "B" }],
    ["Destroy all tapped creatures.", { kind: "tapped", value: true }],
    ["Destroy all nonartifact creatures.", { kind: "typeNeg", type: "artifact" }],
    ["Destroy all creatures with flying.", { kind: "hasKeyword", keyword: "flying", negate: false }],
  ];
  for (const [clause, restriction] of CASES) {
    it(`«${clause}»`, () => {
      expect(atomOf(clause)).toEqual({ op: "destroy", targetType: "eachCreature", restrictions: [restriction] });
    });
  }

  it("the EXILE verb gets the same vocabulary (parity was the point)", () => {
    expect(atomOf("Exile all tapped creatures.")).toEqual({ op: "exile", targetType: "eachCreature",
      restrictions: [{ kind: "tapped", value: true }] });
  });
});

describe("⛔ THE INCUMBENT MATCHERS ARE BYTE-IDENTICAL (the ordering rule)", () => {
  it("the bare wipe, the subtype wipe, the power wipe and the MV wipe still use their own fields", () => {
    expect(atomOf("Destroy all creatures.")).toEqual({ op: "destroy", targetType: "eachCreature" });
    expect(atomOf("Destroy all Dragon creatures.")).toMatchObject({ subtypeFilter: "Dragon" });
    expect(atomOf("Destroy all non-Dragon creatures.")).toMatchObject({ subtypeFilter: "Dragon", subtypeNegate: true });
    expect(atomOf("Destroy all creatures with power 4 or greater.")).toMatchObject({ powerCmp: ">=", powerVal: 4 });
    expect(atomOf("Destroy all creatures with mana value 3 or less.")).toMatchObject({ mvCmp: "<=", mvVal: 3 });
    // None of them carries a `restrictions` array — the general arm never ran for these.
    for (const c of ["Destroy all creatures.", "Destroy all Dragon creatures.", "Destroy all creatures with power 4 or greater."]) {
      expect(atomOf(c).restrictions, c).toBeUndefined();
    }
  });
});

describe("⛔ the CREED gate — an unmodeled qualifier parks the wipe", () => {
  const REFUSED = [
    "Destroy all creatures that dealt damage to you this turn.",
    "Destroy all creatures with no counters on them.",
    "Destroy all creatures with power greater than target creature's power.",
  ];
  for (const clause of REFUSED) {
    it(`⛔ «${clause.slice(0, 56)}…» parks`, () => expect(atomOf(clause)).toBe(null));
  }
  it("⛔ a non-creature mass recipient never reaches the creature grammar", () => {
    expect(atomOf("Destroy all nonland permanents.")).toBe(null);
  });
});

describe("⛔⭐ RUNTIME — atomTargets resolves the filtered set, not every creature", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, ctrl, extra = {}) => createPermanent({ id, card: { id: `c${id}`, name: id, type: "Creature — Test", power: 2, toughness: 2, ...extra }, controller: ctrl });
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [mk("u-white", "user", { colors: ["W"] }), mk("u-black", "user", { colors: ["B"] })] },
      ai: { ...s.players.ai, battlefield: [mk("a-white", "ai", { colors: ["W"] })] } } };
  }
  const idsFor = (atom, ctx = { controller: "user" }) => atomTargets(board(), atom, ctx).map((t) => t.id).sort();

  it("⭐ a colour-filtered wipe resolves ONLY the matching creatures, on every board", () => {
    // THE test this slice rests on: without the restrictions pass-through, atomTargets returns every creature
    // and Cleanse becomes Wrath of God.
    expect(idsFor({ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "color", color: "W" }] }))
      .toEqual(["a-white", "u-white"]);
  });

  it("⛔ a CONTROLLER-scoped wipe spares the caster's board (Plague Wind)", () => {
    expect(idsFor({ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "controller", who: "opponent" }] }))
      .toEqual(["a-white"]);
  });

  it("⛔ an UNRESTRICTED wipe is unchanged — every creature, as before", () => {
    expect(idsFor({ op: "destroy", targetType: "eachCreature" })).toEqual(["a-white", "u-black", "u-white"]);
  });
});

describe("⭐ the cards this slice graduated", () => {
  const CARDS = [
    { name: "Plague Wind", type: "Sorcery", mana: "{7}{B}{B}", oracle: "Destroy all creatures you don't control. They can't be regenerated." },
    { name: "Cleanse", type: "Sorcery", mana: "{3}{W}", oracle: "Destroy all black creatures. They can't be regenerated." },
    { name: "Perish", type: "Sorcery", mana: "{2}{B}", oracle: "Destroy all green creatures. They can't be regenerated." },
    { name: "Whirlwind", type: "Sorcery", mana: "{3}{G}", oracle: "Destroy all creatures with flying." },
  ];
  for (const card of CARDS) {
    it(`${card.name} is native`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});
