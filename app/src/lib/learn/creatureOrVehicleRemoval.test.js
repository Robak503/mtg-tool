/**
 * creatureOrVehicleRemoval.test.js — CV-1: "destroy/exile target creature or Vehicle".
 * Daring Demolition, Spin Out, Ride's End, Scrap Compactor.
 *
 * ⭐⭐ THIS IS IGNITION, NOT NEW MACHINERY — the eighth time this run that a built engine turned out to have
 * no consumer on the lane that needed it. `PERMANENT_PREDICATES.creatureOrVehicle` and its whole
 * enumeration path already existed, built for "Enchant creature or Vehicle" (ES-1), with exactly ONE
 * caller: aura subjects. Removal never emitted the targetType, so the predicate sat correct and unused.
 * The fix is two additive entries in removal.js's anchored noun alternation and its TT map.
 *
 * ⭐ CR 301.7 — an uncrewed Vehicle is NOT a creature, so this union is not redundant phrasing; a crewed
 * Vehicle satisfies either arm. The pool assertion below names the uncrewed Vehicle explicitly, because
 * that is the permanent the union exists to reach and the one a plain "creature" targetType misses.
 *
 * ⚠️ SCOPE, STATED HONESTLY: a ceiling probe over the whole corpus put "target creature or Vehicle" at 18
 * flippable cards. This slice ships FOUR. The other 14 sit behind DIFFERENT noun tables — the bounce
 * matcher in zones.js takes a bare `creature` noun with no alternation at all, and the pump / keyword-grant
 * / graveyard lanes each carry their own. Same SYMPTOM, different CAUSES, so they are deliberately not
 * batched here (gate 20). The remaining map is banked in the run ledger rather than half-built.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK — grep -c on a pattern with
 * regex metacharacters lied about a mutation earlier today and cost the DD-1 slice an hour):
 *   · "creature or vehicle" removed from the TT map -> ⚠️ the cards DO NOT park. They stay native-spell with
 *     `targetType: undefined` — the alternation still matches, so an atom is still built, just a useless
 *     one. That is strictly worse than parking and completely silent, and the ONLY thing that catches it is
 *     the parsed-atom assertion below. (Predicted as "all four park"; the printed-back check proved
 *     otherwise, which is the second time today a mutation's symptom was not what the code reading said.)
 *   · "creature or vehicle" removed from the noun alternation -> the anchored pattern fails and all four
 *     DO park (arbiter-spell). This is the mutation the tier number can see.
 *   · PERMANENT_PREDICATES.creatureOrVehicle's Vehicle arm dropped (creature-only) -> the uncrewed Vehicle
 *     vanishes from the pool while ALL FOUR CARDS STILL CLASSIFY NATIVE. The tier number cannot see this
 *     one either: the cards read as working and simply never offer the permanent they were printed to
 *     answer. ⚠️ This mutation had to be run TWICE — the first attempt went through `sed`, which ate the
 *     backslashes and produced `/bCreatureb/`, a regex matching nothing. It killed the suite for the wrong
 *     reason and would have been recorded as confirming a claim it never tested.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DARING_DEMOLITION = { id: "c-dd", name: "Daring Demolition", type: "Sorcery", mana: "{2}{B}{B}",
  oracle: "Destroy target creature or Vehicle." };
const SPIN_OUT = { id: "c-so", name: "Spin Out", type: "Instant", mana: "{1}{B}{B}",
  oracle: "Destroy target creature or Vehicle." };
const RIDES_END = { id: "c-re", name: "Ride's End", type: "Instant", mana: "{4}{W}",
  oracle: "This spell costs {3} less to cast if it targets a tapped permanent.\nExile target creature or Vehicle." };
const SCRAP_COMPACTOR = { id: "c-sc", name: "Scrap Compactor", type: "Artifact", mana: "{1}",
  oracle: "{3}, {T}, Sacrifice this artifact: It deals 3 damage to target creature.\n{6}, {T}, Sacrifice this artifact: Destroy target creature or Vehicle." };

describe("the four cards", () => {
  it("⭐ all four flip native", () => {
    for (const c of [DARING_DEMOLITION, SPIN_OUT, RIDES_END, SCRAP_COMPACTOR]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐ the parsed atom carries the union targetType, on both verbs and with a scope", () => {
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      destroy: p("destroy target creature or vehicle"),
      exileScoped: p("exile target creature or vehicle an opponent controls"),
    };
    console.log("  WITNESS creatureOrVehicleParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.destroy).toEqual([{ op: "destroy", targetType: "creatureOrVehicle", restrictions: [] }]);
    expect(row.exileScoped).toEqual([{ op: "exile", targetType: "creatureOrVehicle",
      restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
});

describe("⭐⭐ LAW 6 — the enumerated pool, with the excluded permanents named", () => {
  it("⭐⭐ an UNCREWED Vehicle is offered and a plain artifact is not", () => {
    // ⛔ The uncrewed Vehicle is the whole point (CR 301.7 — it is not a creature). If this row ever loses
    // it, the union has quietly collapsed to "creature" and every card here still reads native while
    // failing to answer the permanent it was printed for.
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, type, extra = {}) => createPermanent({ id, controller: "ai1", summoningSick: false,
      card: { id: `c-${id}`, name: id, type, oracle: "", colors: ["W"], ...extra } });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [
        mk("CREATURE", "Creature — Bear", { power: 2, toughness: 2 }),
        mk("VEHICLE_UNCREWED", "Artifact — Vehicle", { power: 4, toughness: 3 }),
        mk("PLAIN_ARTIFACT", "Artifact"),
        mk("ENCHANTMENT", "Enchantment"),
        mk("LAND", "Land"),
      ] } } };
    const pool = (targetType) => enumerateTargets(st, "user", { targetType, restrictions: [] }, []).map((t) => t.id).sort();
    const row = { creatureOrVehicle: pool("creatureOrVehicle"), creatureOnly: pool("creature") };
    console.log("  WITNESS creatureOrVehiclePool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      // ⛔ PLAIN_ARTIFACT / ENCHANTMENT / LAND absent — the union widens to Vehicles, not to artifacts.
      creatureOrVehicle: ["CREATURE", "VEHICLE_UNCREWED"],
      // The control that proves the union is doing work rather than the board being small.
      creatureOnly: ["CREATURE"],
    });
  });
});
