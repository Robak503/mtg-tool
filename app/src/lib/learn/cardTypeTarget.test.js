/**
 * cardTypeTarget.test.js — CT-1: "destroy target ARTIFACT / ENCHANTMENT creature".
 * Leonin Iconoclast, Hearth Charm, Chandler, Molten Frame.
 *
 * ⭐⭐ NINTH "BUILT ENGINE, PARTIAL IGNITION" OF THIS RUN. The `cardType` restriction kind and its
 * evaluator — front-face only (CR 712.4a), fail-closed on missing type data — already existed, with exactly
 * TWO emitters: a prevent-damage clause and Modular's counter payoff. The SHARED target grammar never
 * emitted it, so every positive-type removal target in the corpus parked. One arm was the whole fix.
 *
 * ⛔ THE INVERTED-TARGET RISK: "nonartifact" CONTAINS "artifact", and emitting {cardType:"artifact"} for
 * Go for the Throat would restrict it to precisely the creatures it may not touch.
 * ⭐ TWO INDEPENDENT GUARDS STOP IT, EACH SUFFICIENT ALONE — and establishing that took three mutations,
 * because two successive drafts of this comment each named a different single guard as "the" one:
 *   1. ORDER — the negation arm runs first and removes "nonartifact" from the working text.
 *   2. THE WORD BOUNDARY — "non" and "artifact" are both word characters, so a boundary-anchored
 *      match on "artifact" cannot fire inside the negated word even if the positive arm ran first.
 * Removing either one alone SURVIVES. Removing both emits [{cardType:"artifact"},{typeNeg:"artifact"}] —
 * a self-contradictory pair no creature satisfies, so the card reads native and targets nothing.
 * ⭐ The general shape, third instance this run: "X is what makes this safe" is a hypothesis until the
 * mutation is run, and a redundant guard is indistinguishable from a load-bearing one by reading alone.
 *
 * ⚠️⚠️ THIS SLICE WAS MEASURED, REVERTED, AND THEN UN-REVERTED — the reversal is the lesson, not the code.
 * Four pins fired when the arm landed. One of them, massNonCreature's, is named "any FILTER fails the
 * anchor (eachX would wrongly hit the unfiltered set)". Read that, I concluded "Destroy all artifact
 * creatures." had just been let through as a board wipe, rolled the slice back, and BANKED THAT CLAIM IN
 * THE RUN LEDGER. It was false. `eachCreature` learned to honour the restriction grammar on 2026-07-30
 * (mass.test.js pins it), and the resolved outcome is the artifact creature dying while the plain creature
 * lives — asserted end-to-end in massNonCreature.test.js now, so the claim can never again be inherited
 * from a comment. All four pins were the same deliberate refusal this slice lifts, and all four graduated.
 * ⛔ THE RULE THIS EARNS: a test's PROSE is documentation of what was true when it was written. Only its
 * ASSERTION is a fact about now. A red pin says "a decision recorded here changed" — it does not say which
 * way, and it is not evidence of a defect until the behaviour itself has been run.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the arm removed -> all four park (clean:false, zero restrictions).
 *   · the arm MOVED ABOVE the negation arm -> SURVIVED (the boundary anchor still holds).
 *   · the boundary anchor dropped, order unchanged -> SURVIVED (the negation arm already consumed the phrase).
 *   · BOTH removed together -> "Destroy target nonartifact creature." emits
 *     [{cardType:"artifact"},{typeNeg:"artifact"}], a contradiction satisfied by no creature. Go for the
 *     Throat classifies native and hits an EMPTY pool. Only the combined mutation reproduces it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LEONIN_ICONOCLAST = { id: "c-li", name: "Leonin Iconoclast", type: "Creature — Cat Monk", mana: "{3}{W}", power: "3", toughness: "3",
  oracle: "Heroic — Whenever you cast a spell that targets this creature, destroy target enchantment creature an opponent controls." };
const HEARTH_CHARM = { id: "c-hc", name: "Hearth Charm", type: "Instant", mana: "{R}",
  oracle: "Choose one —\n• Destroy target artifact creature.\n• Attacking creatures get +1/+0 until end of turn.\n• Target creature with power 2 or less can't be blocked this turn." };
const CHANDLER = { id: "c-ch", name: "Chandler", type: "Legendary Creature — Human Rogue", mana: "{4}{R}", power: "3", toughness: "3",
  oracle: "{R}{R}{R}, {T}: Destroy target artifact creature." };
const MOLTEN_FRAME = { id: "c-mf", name: "Molten Frame", type: "Instant", mana: "{1}{R}",
  oracle: "Destroy target artifact creature.\nCycling {2} ({2}, Discard this card: Draw a card.)" };

describe("the four cards", () => {
  it("⭐ all four flip native", () => {
    for (const c of [LEONIN_ICONOCLAST, HEARTH_CHARM, CHANDLER, MOLTEN_FRAME]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });
});

describe("⭐⭐ LAW 6 — the enumerated pools, with the excluded creatures named", () => {
  it("⭐⭐ cardType offers ONLY that type, and typeNeg is its exact mirror", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, type) => createPermanent({ id, controller: "ai1", summoningSick: false,
      card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, oracle: "", colors: ["W"] } });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [
        mk("ARTIFACT_CRE", "Artifact Creature — Golem"),
        mk("ENCH_CRE", "Enchantment Creature — Nymph"),
        mk("PLAIN_CRE", "Creature — Bear"),
        // ⛔ A non-creature artifact. The targetType is `creature`, so this must never appear — a cardType
        // restriction narrows WITHIN creatures, it does not widen the class.
        mk("PLAIN_ARTIFACT", "Artifact"),
      ] } } };
    const pool = (restrictions) => enumerateTargets(st, "user", { targetType: "creature", restrictions }, []).map((t) => t.id).sort();
    const row = {
      artifact: pool([{ kind: "cardType", type: "artifact" }]),
      enchantment: pool([{ kind: "cardType", type: "enchantment" }]),
      // The mirror. If these two ever overlap, one of the arms is reading the wrong sign.
      nonArtifact: pool([{ kind: "typeNeg", type: "artifact" }]),
      unrestricted: pool([]),
    };
    console.log("  WITNESS cardTypePools", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      artifact: ["ARTIFACT_CRE"],                      // ⛔ NOT PLAIN_ARTIFACT — it is not a creature
      enchantment: ["ENCH_CRE"],
      nonArtifact: ["ENCH_CRE", "PLAIN_CRE"],          // ⛔ the exact complement of `artifact`
      unrestricted: ["ARTIFACT_CRE", "ENCH_CRE", "PLAIN_CRE"],
    });
  });
});
