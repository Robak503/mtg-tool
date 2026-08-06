/**
 * colorDisjunction.test.js — CD-1: "target green or white creature" and its family. Deathmark, Wallop,
 * Rending Volley, Celestial Purge, Slithery Stalker, Lightwielder Paladin, Controlled Instincts,
 * Encase in Ice.
 *
 * ⛔⛔ EVERY OTHER RESTRICTION IN THIS SYSTEM NARROWS A POOL. THIS ONE DESCRIBES A UNION, AND THAT MAKES
 * ITS BUG DIRECTION THE FORBIDDEN ONE. A too-TIGHT restriction under-offers, which is safe and also
 * VISIBLE — a missing option gets noticed. A too-LOOSE disjunction offers an ILLEGAL target, and nothing
 * about it ever looks wrong in play: the card simply appears to have more reach than it prints. Every
 * assertion below therefore names the EXCLUDED colours explicitly rather than only checking that the
 * legal ones are present.
 *
 * ⛔ WHY IT COULD NOT RIDE THE EXISTING `color` KIND, which is the whole reason these cards parked: the
 * restriction list is ANDed. Pushing {color:"G"} and {color:"W"} for "green or white" demands a creature
 * be BOTH — so every mono-green and mono-white creature, i.e. essentially every real target, drops out of
 * the pool. The card would read as working and hit almost nothing. `colorAny` is one restriction holding
 * a colour LIST, satisfied by any member. THE MONO-COLOUR ROWS BELOW ARE THAT PIN: they are exactly the
 * targets an ANDed pair would lose.
 *
 * ⛔ FOUR EMITTERS, ONE EVALUATOR — and the emitters were found by measurement, not by guessing. A probe
 * over the corpus flipped 13 cards when the disjunction was collapsed to one colour; only 8 of those reach
 * `creatureSatisfiesRestrictions`. The other 5 are DIFFERENT consumers and are deliberately NOT in this
 * slice (see the closing describe) — grouping them here because they share a SYMPTOM would have been the
 * gate-20 error this project has already made once.
 *
 * ⚠️ THE VEIN WAS FIRST MEASURED AT **ZERO**. The probe's pattern had been assembled from a template string
 * through a shell heredoc, a backslash level was eaten, and the word-boundary escape became a literal
 * BACKSPACE character — so it matched nothing and reported a clean, well-formed "0 flips". Caught only
 * because the number contradicted an earlier probe. Probes now carry a sanity gate; see
 * scripts/probe-color-disjunction.mjs.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test):
 *   · the `colorAny` branch removed from creatureRestrictions -> the evaluator throws its pool open and the
 *     OFF-COLOUR creature appears in every enumerated row (the illegal-target FP, by name).
 *   · the disjunction match removed from removal.js's colour slot -> Celestial Purge / Lightwielder Paladin
 *     go back to arbiter-spell / body-only.
 *   · the disjunction match removed from spellEffects' target parse -> Deathmark / Rending Volley park.
 *   · the pair match moved AFTER the single-colour match in spellEffects' target parse -> Deathmark and
 *     Rending Volley park (the pair must be consumed first on free-form text).
 * ⚠️ A FIFTH MUTATION SURVIVED, AND THE CLAIM WAS WRONG RATHER THAN THE PIN: reordering the same alternation
 * in removal.js changes nothing, because that pattern is ANCHORED and the noun group must consume the rest,
 * so backtracking finds the pair either way. The code comment there was corrected instead of the test being
 * strengthened — same-looking code, opposite conclusion from its sibling, and worth saying out loud.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { auraEnchantHostSpec } from "./staticAbilityParser.js";
import { parseEffectProgram } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DEATHMARK = { id: "c-dm", name: "Deathmark", type: "Sorcery", mana: "{B}", oracle: "Destroy target green or white creature." };
const WALLOP = { id: "c-wa", name: "Wallop", type: "Sorcery", mana: "{1}{G}", oracle: "Destroy target blue or black creature with flying." };
const RENDING_VOLLEY = { id: "c-rv", name: "Rending Volley", type: "Instant", mana: "{R}",
  oracle: "This spell can't be countered.\nRending Volley deals 4 damage to target white or blue creature." };
const CELESTIAL_PURGE = { id: "c-cp", name: "Celestial Purge", type: "Instant", mana: "{1}{W}", oracle: "Exile target black or red permanent." };
const SLITHERY_STALKER = { id: "c-ss", name: "Slithery Stalker", type: "Creature — Nightmare Horror", mana: "{1}{B}{B}", power: "2", toughness: "2",
  oracle: "Swampwalk\nWhen this creature enters, exile target green or white creature an opponent controls.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control." };
const LIGHTWIELDER = { id: "c-lp", name: "Lightwielder Paladin", type: "Creature — Human Knight", mana: "{3}{W}{W}", power: "3", toughness: "3",
  oracle: "First strike\nWhenever this creature deals combat damage to a player, you may exile target black or red permanent that player controls." };
const CONTROLLED_INSTINCTS = { id: "c-ci", name: "Controlled Instincts", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant red or green creature\nEnchanted creature doesn't untap during its controller's untap step." };
const ENCASE_IN_ICE = { id: "c-ei", name: "Encase in Ice", type: "Enchantment — Aura", mana: "{1}{U}{U}",
  oracle: "Flash\nEnchant red or green creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step." };

describe("the eight cards", () => {
  it("⭐ all eight flip", () => {
    for (const c of [DEATHMARK, WALLOP, RENDING_VOLLEY, CELESTIAL_PURGE, SLITHERY_STALKER, LIGHTWIELDER, CONTROLLED_INSTINCTS, ENCASE_IN_ICE]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ THE PARSED RESTRICTION, per card — the pin a hand-built spec cannot give you", () => {
    // ⚠️ WRITTEN SECOND, BECAUSE A MUTANT SURVIVED. Every pool assertion below feeds enumerateTargets a
    // HAND-BUILT spec, which tests the EVALUATOR and says nothing about what each card actually parses to.
    // With the removal lane's disjunction match disabled, Celestial Purge still classified NATIVE while
    // parsing to `{kind:"color"}` with NO color field — a restriction matching nothing, on a card the tier
    // says plays. Asserting the parser's own output is the only thing that catches that.
    const atomsOf = (c) => parseEffectProgram(c)?.atoms;
    const row = {
      celestialPurge: atomsOf(CELESTIAL_PURGE),
      deathmark: atomsOf(DEATHMARK),
    };
    console.log("  WITNESS colorDisjunctionParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.celestialPurge).toEqual([{ op: "exile", targetType: "permanent", restrictions: [{ kind: "colorAny", colors: ["B", "R"] }] }]);
    expect(row.deathmark).toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "colorAny", colors: ["G", "W"] }] }]);
  });

  it("⭐ the Aura subject emits ONE restriction holding a colour LIST, never two ANDed ones", () => {
    // The shape of the emitted restriction IS the fix. Two entries here would be the silent-narrowing bug.
    expect(auraEnchantHostSpec(CONTROLLED_INSTINCTS)).toEqual({
      targetType: "creature", restrictions: [{ kind: "colorAny", colors: ["R", "G"] }],
    });
  });
});

// A board carrying one MONO-coloured creature of each colour, plus a colourless one. Every enumeration
// row below is read against this same board, so the excluded colours are always present and available to
// be wrongly offered — an exclusion assertion against a board with no off-colour creature proves nothing.
function fiveColorBoard(extra = []) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const mk = (id, name, colors, type = "Creature — Bear", extraCard = {}) => createPermanent({
    id, controller: "user", summoningSick: false,
    card: { id: `c-${id}`, name, type, power: 2, toughness: 2, oracle: "", colors, ...extraCard },
  });
  const perms = [
    mk("w", "Whitey", ["W"]), mk("u", "Bluey", ["U"]), mk("b", "Blacky", ["B"]),
    mk("r", "Reddy", ["R"]), mk("g", "Greeny", ["G"]), mk("c", "Colorless", []),
    ...extra,
  ];
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const pool = (state, spec) => enumerateTargets(state, "user", spec, []).map((t) => t.id).sort();

describe("⭐⭐ LAW 6 — the enumerated pools, with the EXCLUDED colours named", () => {
  it("⭐⭐ a disjunction offers exactly its two colours — and this is the pin an ANDed pair would fail", () => {
    const s = fiveColorBoard();
    const row = {
      greenOrWhite: pool(s, { targetType: "creature", restrictions: [{ kind: "colorAny", colors: ["G", "W"] }] }),
      blackOrRed: pool(s, { targetType: "creature", restrictions: [{ kind: "colorAny", colors: ["B", "R"] }] }),
      // The single-colour kind is untouched by this slice — the control that says the change is additive.
      greenOnly: pool(s, { targetType: "creature", restrictions: [{ kind: "color", color: "G" }] }),
      // ⛔ THE AND-TRAP, MEASURED: this is what the old vocabulary would have produced for "green or white".
      // It is EMPTY, because no mono-coloured creature is both. A card shipped this way reads native and
      // hits nothing — worse than parking, and completely silent.
      andedPair: pool(s, { targetType: "creature", restrictions: [{ kind: "color", color: "G" }, { kind: "color", color: "W" }] }),
      // ⛔ FAIL-CLOSED: an empty colour list must match NOTHING, never everything.
      emptyList: pool(s, { targetType: "creature", restrictions: [{ kind: "colorAny", colors: [] }] }),
    };
    console.log("  WITNESS colorDisjunctionPools", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      greenOrWhite: ["g", "w"],   // ⛔ NOT u, b, r, and NOT the colourless one
      blackOrRed: ["b", "r"],
      greenOnly: ["g"],
      andedPair: [],
      emptyList: [],
    });
  });

  it("⛔ a COLOURLESS permanent is never swept in by a disjunction", () => {
    // Colourless satisfies colorNeg ("nonblack") but must satisfy NO positive colour requirement.
    const s = fiveColorBoard();
    for (const colors of [["W", "U"], ["B", "R"], ["G", "W"]]) {
      expect(pool(s, { targetType: "creature", restrictions: [{ kind: "colorAny", colors }] })).not.toContain("c");
    }
  });

  it("⛔ MULTICOLOURED hosts: a card of EITHER colour qualifies, and an off-colour gold card does not", () => {
    // CR 105.2 — "green or white" is satisfied by a G/U gold creature (it IS green). A U/B gold creature
    // is neither, and must stay out. This is the case where a naive "colors.length === 1" check would fail.
    const s = fiveColorBoard([
      createPermanent({ id: "gu", controller: "user", summoningSick: false,
        card: { id: "c-gu", name: "Gold GU", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", colors: ["G", "U"] } }),
      createPermanent({ id: "ub", controller: "user", summoningSick: false,
        card: { id: "c-ub", name: "Gold UB", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", colors: ["U", "B"] } }),
    ]);
    const row = pool(s, { targetType: "creature", restrictions: [{ kind: "colorAny", colors: ["G", "W"] }] });
    console.log("  WITNESS colorDisjunctionGold", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual(["g", "gu", "w"]);   // ⛔ "ub" is absent
  });

  it("⛔ the PERMANENT lane excludes by colour too (Celestial Purge is not 'exile anything')", () => {
    // Non-creature permanents share the evaluator through addPermanents. A red artifact is legal for
    // "black or red permanent"; a blue one is not.
    const s = fiveColorBoard([
      createPermanent({ id: "art-r", controller: "user", summoningSick: false,
        card: { id: "c-ar", name: "Red Rock", type: "Artifact", oracle: "", colors: ["R"] } }),
      createPermanent({ id: "art-u", controller: "user", summoningSick: false,
        card: { id: "c-au", name: "Blue Rock", type: "Artifact", oracle: "", colors: ["U"] } }),
    ]);
    const row = pool(s, { targetType: "permanent", restrictions: [{ kind: "colorAny", colors: ["B", "R"] }] });
    console.log("  WITNESS colorDisjunctionPermanents", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual(["art-r", "b", "r"]);   // ⛔ no art-u, no w/u/g creature, no colourless
  });
});

describe("⛔ what this slice deliberately does NOT claim", () => {
  it("⛔ the other FIVE disjunction carriers stay parked — different consumers, not one cause", () => {
    // ⛔⛔ THE GATE-20 LINE. The probe grouped these by SYMPTOM ("collapse the disjunction and it flips"),
    // and they do all share a missing concept. They do NOT share an evaluator: a spell-cast trigger filter,
    // a counter's spellFilter, a board-state condition and a hand-zone card filter are four separate
    // gates. Shipping them here on the strength of the symptom would be exactly the error this project
    // already recorded once. Each is worth 1-2 cards and needs its own slice.
    const OTHERS = [
      { id: "c-ma", name: "Mold Adder", type: "Creature — Fungus Snake", mana: "{G}", power: "0", toughness: "1",
        oracle: "Whenever an opponent casts a blue or black spell, you may put a +1/+1 counter on this creature." },
      { id: "c-sp", name: "Snake Pit", type: "Enchantment", mana: "{3}{G}",
        oracle: "Whenever an opponent casts a blue or black spell, you may create a 1/1 green Snake creature token." },
      { id: "c-ff", name: "Flashfreeze", type: "Instant", mana: "{1}{U}", oracle: "Counter target red or green spell." },
      { id: "c-wc", name: "Wandering Champion", type: "Creature — Human Monk", mana: "{1}{W}", power: "2", toughness: "1",
        oracle: "Whenever this creature deals combat damage to a player, if you control a blue or red permanent, you may discard a card. If you do, draw a card." },
      { id: "c-ml", name: "Mindwrack Liege", type: "Creature — Horror", mana: "{3}{U/R}{U/R}{U/R}", power: "4", toughness: "4",
        oracle: "Other blue creatures you control get +1/+1.\nOther red creatures you control get +1/+1.\n{U/R}{U/R}{U/R}{U/R}: You may put a blue or red creature card from your hand onto the battlefield." },
    ];
    for (const c of OTHERS) expect(classifyCard(c), c.name).not.toMatch(/^native/);
  });
});
