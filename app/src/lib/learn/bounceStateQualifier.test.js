/**
 * bounceStateQualifier.test.js — BS-1: "return target TAPPED / ATTACKING creature to its owner's hand".
 * Selkie Hedge-Mage, Spellweaver Duo, Galestrike, Champion's Victory, Harbinger of the Tides, Remove,
 * Select for Inspection, Surrakar Banisher.
 *
 * ⭐⭐ NEITHER THE ATOM NOR THE RESTRICTION KINDS ARE NEW — the bounce parser simply had no lane for a state
 * qualifier, exactly like the SCOPED TUCK sitting a few dozen lines above it in the same file. `tapped` and
 * `combat` are the same restriction kinds the removal lane already emits, so one evaluator serves both.
 *
 * ⭐ FOUND BY TIER-SPLITTING THE NOUN, which is what makes the cause provable rather than plausible: the
 * BARE bounce is native on 53 carriers, while "tapped creature" was native on ZERO and "attacking creature"
 * on ZERO. Two families, one missing group. ⛔ The attacking/blocking cards are the OUT-OF-FAMILY
 * confirmation demanded by gate 20 — had only the tapped cards been checked, "something about tapped
 * permanents" would have been an equally good story and a wrong one.
 *
 * ⭐ A ceiling probe (swap the qualifier out, reclassify) put this at 8 of 9 carriers before a line was
 * written. It shipped 8. The ninth, Point to the Scoreboard, parks on unrelated text and is left alone.
 *
 * ⛔ THE QUALIFIER IS ITS OWN GROUP IN FRONT OF THE NOUN, not more alternatives inside the controller-scope
 * group, because the two COMPOSE — Harbinger of the Tides is "target tapped creature an opponent controls".
 * Folding them together would also have fed a qualifier into the `who` resolution, which defaults to
 * "opponent" for anything it does not recognise; the same trap the DD-1 removal edit avoided the same way.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK — `grep -c` and `sed` both
 * produced false mutation results earlier today, one costing an hour):
 *   · the state group removed from the pattern -> all 8 park (the anchored match fails).
 *   · `combat` emitted for "tapped" (the two qualifier arms swapped) -> Galestrike still classifies NATIVE
*     while its pool silently becomes EVERY CREATURE — see the closing describe. The tier cannot see it;
 *     only the parsed-atom row below can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

const GALESTRIKE = { id: "c-gs", name: "Galestrike", type: "Instant", mana: "{2}{U}",
  oracle: "Return target tapped creature to its owner's hand.\nDraw a card." };
const CHAMPIONS_VICTORY = { id: "c-cv", name: "Champion's Victory", type: "Instant", mana: "{U}",
  oracle: "Cast this spell only during the declare attackers step and only if you've been attacked this step.\nReturn target attacking creature to its owner's hand." };
const HARBINGER = { id: "c-ht", name: "Harbinger of the Tides", type: "Creature — Merfolk Wizard", mana: "{U}{U}", power: "2", toughness: "2",
  oracle: "You may cast this spell as though it had flash if you pay {2} more to cast it. (You may cast it any time you could cast an instant.)\nWhen this creature enters, you may return target tapped creature an opponent controls to its owner's hand." };
const SELECT_FOR_INSPECTION = { id: "c-si", name: "Select for Inspection", type: "Instant", mana: "{U}",
  oracle: "Return target tapped creature to its owner's hand. Scry 1. (Look at the top card of your library. You may put that card on the bottom.)" };

describe("the carriers", () => {
  it("⭐ the state qualifier no longer parks a bounce", () => {
    for (const c of [GALESTRIKE, CHAMPIONS_VICTORY, HARBINGER, SELECT_FOR_INSPECTION]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ the parsed atoms — qualifier alone, qualifier + scope, and the UNCHANGED incumbents", () => {
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      tapped: p("return target tapped creature to its owner's hand"),
      tappedOpponent: p("return target tapped creature an opponent controls to its owner's hand"),
      attacking: p("return target attacking creature to its owner's hand"),
      // ⛔ THE REGRESSION GUARD. This edit widened a matcher that four existing forms already ran through,
      // and "a rewrite is a rename" has bitten this file before (see the both-spellings note on the
      // damaged-player sentinel). These three must be BYTE-IDENTICAL to their pre-BS-1 shapes — in
      // particular `bare` must carry NO restrictions key at all, not an empty array.
      bare: p("return target creature to its owner's hand"),
      another: p("return another target creature to its owner's hand"),
      scoped: p("return target creature an opponent controls to its owner's hand"),
    };
    console.log("  WITNESS bounceStateQualifier", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tapped).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "tapped", value: true }] }]);
    expect(row.tappedOpponent).toEqual([{ op: "bounce", targetType: "creature",
      restrictions: [{ kind: "controller", who: "opponent" }, { kind: "tapped", value: true }] }]);
    expect(row.attacking).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "combat", value: "attacking" }] }]);
    expect(row.bare).toEqual([{ op: "bounce", targetType: "creature" }]);
    expect(row.another).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "notSource" }] }]);
    expect(row.scoped).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
});

describe("⭐⭐ the fail-closed hole the mutation exposed", () => {
  it("⭐⭐ an UNRECOGNISED combat value offers NOTHING, not everything", () => {
    // ⛔ This is a finding, not a feature of the slice. Mutation 2 emitted {kind:"combat", value:"tapped"}
    // expecting a pool of nothing; the three value checks in creatureRestrictions were each guarded by
    // their own value, so an unknown one matched none of them and fell through as SATISFIED — the whole
    // board offered to a restriction nobody could satisfy. Fail-open inside a known kind, one level below
    // the fail-closed default that already guards unknown KINDS.
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id) => createPermanent({ id, controller: "ai1", summoningSick: false,
      card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "", colors: ["G"] } });
    const st = { ...s, phase: "declare-attackers", step: "declare-attackers", activePlayer: "ai1", priorityHolder: "user", turn: 5,
      combat: { attackers: [{ permanentId: "ATTACKER" }], blockers: [] },
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [mk("ATTACKER"), mk("IDLE")] } } };
    const pool = (value) => enumerateTargets(st, "user", { targetType: "creature", restrictions: [{ kind: "combat", value }] }, []).map((t) => t.id).sort();
    const row = { attacking: pool("attacking"), unknown: pool("tapped"), alsoUnknown: pool("") };
    console.log("  WITNESS combatValueFailClosed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      attacking: ["ATTACKER"],   // the known value still works — the guard is additive
      unknown: [],               // ⛔ was ["ATTACKER","IDLE"] — the entire board
      alsoUnknown: [],
    });
  });
});
