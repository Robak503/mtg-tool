/**
 * dealtDamageThisTurn.test.js — DD-1: "target creature that was dealt damage this turn" and its 17 carriers.
 * Fatal Blow, Rooftop Assassin, Vraska's Finisher, Ogre Siegebreaker, Witch's Mist, Opportunist, Crushing
 * Pain, Hooded Assassin, Lurking Deadeye, Stingblade Assassin, Final-Sting Faerie, Downwind Ambusher,
 * Unsparing Boltcaster, Fathom Fleet Cutthroat, You Are Already Dead, Mirrodin Avenged, Jarl of the Forsaken.
 *
 * ⭐ FOUND BY CENSUS, NOT BY GUESSING. A residue census over the whole target grammar ranked every phrase
 * that survives it by PARKED CARRIER COUNT; this phrase sat at the top with 26 carriers. A ceiling probe
 * (strip the phrase from the oracle, reclassify) then said 18 of them park on this phrase ALONE — the
 * measurement that made this worth building before any of the smaller veins beside it.
 *
 * ⭐⭐ THE STATE ALREADY EXISTED AND IS ALREADY CR-CORRECT, which is the only reason this is a restriction
 * and not a subsystem. It needed no new tracking, only an honest reading of two fields that were already
 * there — and reading only ONE of them would have been wrong in a way no test of the common case shows.
 *
 * ⛔⛔ NEITHER WITNESS IS COMPLETE ALONE, AND THE GAP IN EACH IS THE OTHER'S STRENGTH:
 *   · `damageMarked` is the scalar total. Infect/wither damage becomes -1/-1 counters and NEVER marks, so a
 *     creature hit by an infect creature would be refused as a Fatal Blow target — yet it WAS dealt damage.
 *   · `damagedBy` records who dealt it, but is deliberately OPTIONAL: gameState says a call site that cannot
 *     name its source records nothing. So it is empty for plenty of genuine damage.
 * EITHER being non-empty proves the fact. Requiring BOTH would refuse legal targets — the direction the
 * creed calls safe, and which the colorDisjunction slice already showed can quietly reduce a card to hitting
 * nothing at all. Both clear together at cleanup (clearCombatDamage, CR 514.2 — "this turn" ends there).
 *
 * ⛔ NEEDLE DROP IS DELIBERATELY LEFT PARKED, and it is the one card in the vein that must be. "Any target
 * that was dealt damage this turn" includes PLAYERS, and player damage-this-turn is not tracked.
 * `lifeLostThisTurn` is the nearest field and gameState explicitly warns it is NOT the same fact — a drain
 * or a pay-life cost loses life with no damage dealt — so reusing it would offer an illegal target. A safe
 * false negative, chosen over a false positive, pinned below so nobody "completes the vein" by reaching for
 * the wrong field.
 *
 * ⚠️ THE UNION LANE NEEDED A SECOND EDIT AND THE FIRST FLIP-DIFF SHOWED IT: 15 cards flipped while Vraska's
 * Finisher and Jarl of the Forsaken did not, even though their restrictions parsed correctly. Their atom was
 * never built — removal.js's union pattern is fully ANCHORED (`^…$`) with an optional CONTROLLER-SCOPE group
 * and nowhere for a trailing qualifier to go. Added as a SEPARATE optional group, never by widening the
 * scope alternation: that group feeds `controllerWho`, which defaults to "opponent" for any value it does
 * not recognise, so a qualifier smuggled in there would silently become a controller restriction on a card
 * the tier reports as native.
 *
 * Mutation-checked (2026-08-06, each grep-verified as applied AND verified to reach the case under test):
 *   · the `dealtDamageThisTurn` branch removed from creatureRestrictions -> the pool goes EMPTY, not open.
 *     Worth stating precisely because the prediction was "open": the fail-closed default added for unknown
 *     restriction kinds earlier in this run catches it, so an unrecognised kind refuses everything instead
 *     of satisfying everything. The mutation still dies; the guard that kills it is the one below it.
 *   · `damagedBy` dropped from the evaluator (damageMarked only) -> the infect-damaged creature vanishes
 *     from the pool while the suite's tier assertions all still pass. THE TIER NUMBER CANNOT SEE THIS ONE.
 *   · `damageMarked` dropped from the evaluator (damagedBy only) -> the source-less damaged creature
 *     vanishes, same silence.
 *   · the phrase removed from MODELED_RESTRICTION_RES -> Fatal Blow drops native-spell → arbiter-spell. The
 *     phrase survives into cleanedOracle, and the fold re-checks isCleanClause(cleanedOracle), where
 *     UNMODELED_MARKERS names `that (?:…|was|…)`.
 *
 * ⚠️⚠️ THAT LAST MUTATION WAS TWICE RECORDED AS SURVIVING, AND BOTH READINGS WERE FALSE — the most
 * expensive mistake of this slice, and a pure instrumentation failure. The perl doing the removal silently
 * failed to apply, while `grep -c` on a pattern containing regex metacharacters (`|`, `(`, `?`) reported
 * zero occurrences and was taken as proof the line was gone. Believing it, I then "confirmed" the entry was
 * dead with a corpus-wide flip-diff showing 0 of 34,245 cards changed — a rigorous measurement of an
 * unmutated file, which is worse than no measurement because of how convincing it looks. I removed the
 * line, wrote a confident comment explaining the general rule for when such entries are dead, and only
 * caught it because the FULL SUITE went red on this file's own first assertion.
 * ⛔ THE RULE, PAID FOR: a mutation is not applied until the changed line has been PRINTED BACK. grep
 * answering "0" proves the pattern didn't match — never that the edit landed. Corrections 22/30/31 say
 * verify the mutant reaches the guarded case; this adds the step before it, verify the mutant EXISTS.
 * ⭐ The suite caught what four layers of hand-verification did not, which is the argument for running it
 * by bare exit code before believing any mutation result.
 *   · the trailing-qualifier group removed from removal.js's anchored union pattern -> Vraska's Finisher and
 *     Jarl of the Forsaken park, the other 15 unaffected (the two-edit split, reproduced on demand).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets, parseCreatureTargetRestrictions } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FATAL_BLOW = { id: "c-fb", name: "Fatal Blow", type: "Instant", mana: "{B}",
  oracle: "Destroy target creature that was dealt damage this turn. It can't be regenerated." };
const OGRE_SIEGEBREAKER = { id: "c-os", name: "Ogre Siegebreaker", type: "Creature — Ogre Berserker", mana: "{2}{B}{R}", power: "4", toughness: "3",
  oracle: "{2}{B}{R}: Destroy target creature that was dealt damage this turn." };
const ROOFTOP_ASSASSIN = { id: "c-ra", name: "Rooftop Assassin", type: "Creature — Vampire Assassin", mana: "{3}{B}", power: "2", toughness: "2",
  oracle: "Flash\nFlying, lifelink\nWhen this creature enters, destroy target creature an opponent controls that was dealt damage this turn." };
const VRASKAS_FINISHER = { id: "c-vf", name: "Vraska's Finisher", type: "Creature — Gorgon Assassin", mana: "{2}{B}", power: "3", toughness: "2",
  oracle: "When this creature enters, destroy target creature or planeswalker an opponent controls that was dealt damage this turn." };
const OPPORTUNIST = { id: "c-op", name: "Opportunist", type: "Creature — Human Soldier", mana: "{2}{R}", power: "2", toughness: "2",
  oracle: "{T}: This creature deals 1 damage to target creature that was dealt damage this turn." };
// ⛔ The card that must NOT flip.
const NEEDLE_DROP = { id: "c-nd", name: "Needle Drop", type: "Instant", mana: "{R}",
  oracle: "Needle Drop deals 1 damage to any target that was dealt damage this turn.\nDraw a card." };

describe("the carriers", () => {
  it("⭐ the phrase no longer parks a card whose whole text is otherwise modeled", () => {
    for (const c of [FATAL_BLOW, OGRE_SIEGEBREAKER, ROOFTOP_ASSASSIN, VRASKAS_FINISHER, OPPORTUNIST]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⛔⛔ NEEDLE DROP STAYS PARKED — 'any target' includes players, and player damage is not tracked", () => {
    // If this ever goes native, someone has wired the restriction to `lifeLostThisTurn`. That field counts
    // life LOST (drains, pay-life costs), not damage DEALT, and using it here offers an illegal target.
    expect(classifyCard(NEEDLE_DROP)).not.toMatch(/^native/);
  });

  it("⭐⭐ the parsed restriction, on both the creature lane and the anchored union lane", () => {
    const row = {
      creature: parseCreatureTargetRestrictions({ oracle: "destroy target creature that was dealt damage this turn" }),
      union: parseEffectClause("destroy target creature or planeswalker an opponent controls that was dealt damage this turn",
        "Instant", { sourceScoped: true })?.atoms,
      // The scope-only form must be unchanged — the new group is optional and additive.
      unionBare: parseEffectClause("destroy target creature or planeswalker an opponent controls",
        "Instant", { sourceScoped: true })?.atoms,
    };
    console.log("  WITNESS dealtDamageParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.creature.clean).toBe(true);
    expect(row.creature.restrictions).toEqual([{ kind: "dealtDamageThisTurn", value: true }]);
    expect(row.union).toEqual([{ op: "destroy", targetType: "creatureOrPlaneswalker",
      restrictions: [{ kind: "controller", who: "opponent" }, { kind: "dealtDamageThisTurn", value: true }] }]);
    expect(row.unionBare).toEqual([{ op: "destroy", targetType: "creatureOrPlaneswalker",
      restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
});

// A board carrying all three states the evaluator has to tell apart. The two DAMAGED creatures are damaged
// by DIFFERENT mechanisms on purpose — a board where every damaged creature carries both witnesses would
// pass with either half of the check deleted, and prove nothing about the one that matters.
function damageBoard() {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const mk = (id, extra) => ({
    ...createPermanent({ id, controller: "ai1", summoningSick: false,
      card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 3, toughness: 3, oracle: "", colors: ["G"] } }),
    ...extra,
  });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [
      // Ordinary damage with a known source: BOTH witnesses present.
      mk("BOTH", { damageMarked: 2, damagedBy: ["c-src"] }),
      // ⭐ INFECT / WITHER: the damage became -1/-1 counters, so damageMarked is 0 — but it WAS dealt.
      // This row is the entire reason the evaluator reads damagedBy.
      mk("INFECT_ONLY", { damageMarked: 0, damagedBy: ["c-infecter"] }),
      // ⭐ Damage whose source could not be named — damagedBy stays empty by design.
      // This row is the entire reason the evaluator still reads damageMarked.
      mk("MARKED_ONLY", { damageMarked: 3, damagedBy: [] }),
      // ⛔ The illegal target.
      mk("UNDAMAGED", { damageMarked: 0, damagedBy: [] }),
    ] } } };
}

describe("⭐⭐ LAW 6 — the enumerated pool, with the undamaged creature named", () => {
  it("⭐⭐ both witnesses count, and an undamaged creature is never offered", () => {
    const s = damageBoard();
    const pool = (restrictions) => enumerateTargets(s, "user", { targetType: "creature", restrictions }, []).map((t) => t.id).sort();
    const row = {
      dealtDamage: pool([{ kind: "dealtDamageThisTurn", value: true }]),
      // The control: with no restriction the whole board is offered, so the exclusion above is the
      // restriction doing work rather than the board being short of candidates.
      unrestricted: pool([]),
    };
    console.log("  WITNESS dealtDamagePool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      // ⛔ UNDAMAGED absent. ⭐ INFECT_ONLY present (damageMarked-only check would drop it).
      // ⭐ MARKED_ONLY present (damagedBy-only check would drop it).
      dealtDamage: ["BOTH", "INFECT_ONLY", "MARKED_ONLY"],
      unrestricted: ["BOTH", "INFECT_ONLY", "MARKED_ONLY", "UNDAMAGED"],
    });
  });

  it("⭐ the restriction is a live gate, not a decoration — an all-undamaged board offers nothing", () => {
    // A pool that stays full when nothing qualifies is the failure mode a positive-only assertion misses.
    const s = damageBoard();
    const clean = { ...s, players: { ...s.players, ai1: { ...s.players.ai1,
      battlefield: s.players.ai1.battlefield.map((p) => ({ ...p, damageMarked: 0, damagedBy: [] })) } } };
    expect(enumerateTargets(clean, "user", { targetType: "creature", restrictions: [{ kind: "dealtDamageThisTurn", value: true }] }, [])).toEqual([]);
  });
});
