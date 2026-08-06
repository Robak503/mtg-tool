/**
 * keywordRestriction.test.js — KW-1: "target creature WITH <keyword>" beyond flying.
 * Clear a Path, Ogre Gatecrasher, Deface, Shadowstorm, Faceless Devourer, Smash to Dust.
 *
 * ⭐⭐ TENTH "BUILT ENGINE, PARTIAL IGNITION" OF THIS RUN, and the narrowest yet: the EVALUATOR was never
 * flying-specific. `hasKeyword` reads through `permanentHasKeyword`, which resolves ANY keyword generically
 * — printed text, keyword counters, and layer-6 grants, so a granted keyword counts. Only the PARSER's
 * allowlist said "flying". Widening that list is the entire change.
 *
 * ⛔⛔ THE SET IS CURATED, NOT OPEN, AND THE "WITHOUT" DIRECTION IS THE REASON. The two directions have
 * OPPOSITE failure modes on an unresolvable keyword:
 *   · "with X"    — unresolved reads as "does not have it" → the creature is NOT offered. A safe FN.
 *   · "without X" — the SAME unresolved answer SATISFIES the restriction → the whole board is offered.
 * So an untracked keyword is harmless in one direction and a false positive in the other. Every word in the
 * list is a printed keyword `hasKeyword` matches off the card in both directions; anything else survives as
 * residue → unclean → Arbiter. The `annihilator` row below is that boundary, asserted rather than assumed.
 *
 * ⭐ THE MASS LANE WAS THE SAFETY QUESTION, AND IT WAS RESOLVED BY RUNNING THE CARD. Six pins fired, one on
 * a mass effect ("Shadowstorm deals 1 damage to each creature with shadow"). The CT-1 slice earlier today
 * hit the same shape, read a pin's PROSE, concluded a board wipe had been admitted, and reverted a correct
 * change on a false alarm. Not repeated: the end-to-end row below casts Shadowstorm at a 1/1 with shadow
 * and a 1/1 without, and shows the shadow creature dying while the plain one lives.
 * ⛔ A test's prose documents what was true when written; only its assertion is a fact about now.
 *
 * ⚠️ ONE PIN WAS ADDED ON A WRONG ASSUMPTION AND REMOVED AGAIN: "Destroy target creature you control with
 * first strike." was moved into MUST_STAY_HIGH on the assumption it would flip. It is still LOW — the
 * controller scope and the keyword qualifier do not compose on that path. A safe FN, left alone rather than
 * chased, and named here so the gap is recorded instead of rediscovered.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the keyword list narrowed back to "flying" -> all six park.
 *   · `defender` removed from the list -> Clear a Path / Ogre Gatecrasher park, the shadow cards unaffected.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseCreatureTargetRestrictions } from "./spellEffects.js";
import { parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLEAR_A_PATH = { id: "c-cp", name: "Clear a Path", type: "Instant", mana: "{R}",
  oracle: "Destroy target creature with defender." };
const SHADOWSTORM = { id: "c-ss", name: "Shadowstorm", type: "Sorcery", mana: "{R}",
  oracle: "Shadowstorm deals 1 damage to each creature with shadow." };

describe("the parsed restriction", () => {
  it("⭐ a curated keyword parses in both directions; flying is unchanged", () => {
    const p = (o) => parseCreatureTargetRestrictions({ oracle: o });
    const row = {
      defender: p("destroy target creature with defender"),
      flying: p("destroy target creature with flying"),
      withoutFlying: p("destroy target creature without flying"),
      shadow: p("destroy target creature with shadow"),
      // ⛔ THE BOUNDARY. A keyword outside the curated set must still leave residue.
      outOfSet: p("destroy target creature with annihilator"),
    };
    console.log("  WITNESS keywordRestrictions", JSON.stringify(row.defender.restrictions) + " | outOfSet clean=" + row.outOfSet.clean); // vitest 4 needs --disable-console-intercept
    expect(row.defender).toMatchObject({ clean: true, restrictions: [{ kind: "hasKeyword", keyword: "defender", negate: false }] });
    expect(row.flying).toMatchObject({ clean: true, restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] });
    expect(row.withoutFlying).toMatchObject({ clean: true, restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] });
    expect(row.shadow).toMatchObject({ clean: true, restrictions: [{ kind: "hasKeyword", keyword: "shadow", negate: false }] });
    expect(row.outOfSet.clean).toBe(false);
  });

  it("⭐ the carriers flip native", () => {
    for (const c of [CLEAR_A_PATH, SHADOWSTORM]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });
});

describe("⭐⭐ the mass lane — resolved, not merely parsed", () => {
  it("⭐⭐ Shadowstorm kills the shadow creature and SPARES the one without it", () => {
    expect(parseEffectProgram(SHADOWSTORM).atoms).toEqual([
      { op: "deal-damage", amount: 1, targetType: "eachCreature", restrictions: [{ kind: "hasKeyword", keyword: "shadow", negate: false }] },
    ]);
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players,
        // ⚠️ THE POOL MUST CARRY {R}. A first attempt funded this with generic mana only; the cast action
        // simply did not appear and the probe read as "the spell is not castable" — a harness fault wearing
        // the costume of a finding. The all-zero rule, again.
        user: { ...base.players.user, hand: [SHADOWSTORM], manaPool: { ...base.players.user.manaPool, R: 4, C: 4 }, battlefield: [] },
        ai: { ...base.players.ai, battlefield: [
          createPermanent({ id: "shadowy", controller: "ai", summoningSick: false,
            card: { name: "Dauthi", type: "Creature — Dauthi Soldier", power: 1, toughness: 1, oracle: "Shadow" } }),
          createPermanent({ id: "plain", controller: "ai", summoningSick: false,
            card: { name: "Bear", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" } }),
        ] } } };
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-ss");
    expect(cast).toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    const row = { shadowCreature: !!findPermanent(after, "shadowy"), plainCreature: !!findPermanent(after, "plain") };
    console.log("  WITNESS shadowstormResolved", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ shadowCreature: false, plainCreature: true }); // ⛔ NOT a board sweep
  });
});
