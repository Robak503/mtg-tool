/**
 * supertypeTarget.test.js — ST-1: "destroy target LEGENDARY creature" (CR 205.4).
 * Hero's Demise, Tsabo Tavoc.
 *
 * ⭐⭐ ELEVENTH "BUILT ENGINE, PARTIAL IGNITION" OF THIS RUN. The `supertype` restriction kind and its
 * evaluator — word-bounded, FRONT-FACE only (CR 712.4a), fail-closed on a missing type line — already
 * existed, with exactly ONE emitter: the Mithril Coat / Mjölnir self-attach in stack.js. The shared target
 * grammar never emitted it, so every targeted legendary-removal card in the corpus parked.
 *
 * ⭐ THE MASS LANE WAS CHECKED BEFORE THE FLIP-DIFF, NOT AFTER. CT-1 earlier today added a restriction to
 * this same shared grammar and only discovered its mass-lane reach when the suite went red. So this slice
 * probed the three mass forms first, and the result is the shape that makes the change safe:
 *   · "Destroy target legendary creature."  -> native, restriction carried  (the target of the slice)
 *   · "Destroy all legendary creatures."    -> native on eachCreature, restriction carried — and the
 *     eachCreature resolver honours restrictions (proven end-to-end in massNonCreature.test.js).
 *   · "Destroy all legendary permanents."   -> STILL PARKS. The non-creature mass lane has no
 *     restriction-honouring resolver, and this change does not reach it. That lane is the hazard, and it
 *     is untouched.
 *
 * ⛔ ONLY `legendary` IS ADMITTED although the evaluator handles any supertype. "basic" belongs to lands and
 * is already served by the nonbasicLand predicate; "snow" and "world" have no targeted-removal carriers
 * worth the surface. Anything else survives as residue → unclean → Arbiter.
 *
 * ⚠️ FLAGGED, PRE-EXISTING, NOT INTRODUCED HERE: Tsabo Tavoc's body reads "protection from legendary
 * creatures". Protection from a COLOUR is enforced at targeting (CR 702.16b, canBeTargetedBy); protection
 * from a SUPERTYPE is not. That is worth its own look — but it is not a wrong admission by this slice: 40
 * cards carrying non-colour protection were ALREADY native before it, so the classifier's policy on that
 * clause long predates ST-1 and Tsabo Tavoc is consistent with it. Measured rather than assumed, because
 * "my change let this in" and "my change is the first to reveal it" are different facts.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the arm removed -> both cards park (clean:false, zero restrictions).
 *   · the word boundary dropped from the match -> "Destroy target legendary creature." is unaffected, but
 *     the arm would fire on any word CONTAINING "legendary". Kept anchored; the evaluator is word-bounded
 *     too, so this is belt-and-braces rather than the sole guard (a lesson from CT-1, where two successive
 *     comments each named the wrong single guard).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets, parseCreatureTargetRestrictions } from "./spellEffects.js";
import { parseEffectProgram } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HEROS_DEMISE = { id: "c-hd", name: "Hero's Demise", type: "Instant", mana: "{1}{B}",
  oracle: "Destroy target legendary creature." };
const TSABO_TAVOC = { id: "c-tt", name: "Tsabo Tavoc", type: "Legendary Creature — Phyrexian Horror", mana: "{5}{B}{R}", power: "6", toughness: "4",
  oracle: "First strike, protection from legendary creatures\n{B}{B}, {T}: Destroy target legendary creature. It can't be regenerated." };

describe("the carriers", () => {
  it("⭐ both flip native", () => {
    for (const c of [HEROS_DEMISE, TSABO_TAVOC]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the parsed restriction", () => {
    const r = parseCreatureTargetRestrictions({ oracle: "destroy target legendary creature" });
    console.log("  WITNESS supertypeParsed", JSON.stringify(r.restrictions)); // vitest 4 needs --disable-console-intercept
    expect(r).toMatchObject({ clean: true, restrictions: [{ kind: "supertype", value: "legendary" }] });
  });

  it("⭐⭐ the MASS forms — the creature wipe carries it, the NON-CREATURE lane still parks", () => {
    // ⛔ THE THIRD ROW IS THE SAFETY ASSERTION. The non-creature mass lane has no restriction-honouring
    // resolver, so a "legendary permanents" wipe going native would destroy every permanent. It must stay
    // parked, and this pin is what stops a later widening from taking it native by accident.
    const I = (o) => ({ id: "m", name: "M", type: "Instant", mana: "{B}", oracle: o });
    const row = {
      massCreature: parseEffectProgram(I("Destroy all legendary creatures."))?.atoms,
      massPermanentTier: classifyCard(I("Destroy all legendary permanents.")),
      massArtifactTier: classifyCard(I("Destroy all legendary artifacts.")),
    };
    console.log("  WITNESS supertypeMassForms", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.massCreature).toEqual([{ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "supertype", value: "legendary" }] }]);
    expect(row.massPermanentTier).not.toMatch(/^native/);
    expect(row.massArtifactTier).not.toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the enumerated pool, with the DFC named", () => {
  it("⭐⭐ offers only the legendary creature — and a DFC whose BACK face is legendary is excluded", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, type) => createPermanent({ id, controller: "ai1", summoningSick: false,
      card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, oracle: "", colors: ["W"] } });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [
        mk("LEGEND", "Legendary Creature — Human Wizard"),
        mk("PLAIN", "Creature — Bear"),
        // ⭐ CR 712.4a — the combined "Front // Back" type line contains the word "Legendary", but the FRONT
        // face is not legendary. A naive substring read would offer it; the evaluator reads front-face only.
        mk("LEGEND_ON_BACK_FACE", "Creature — Bear // Legendary Creature — Angel"),
      ] } } };
    const pool = (restrictions) => enumerateTargets(st, "user", { targetType: "creature", restrictions }, []).map((t) => t.id).sort();
    const row = { legendary: pool([{ kind: "supertype", value: "legendary" }]), unrestricted: pool([]) };
    console.log("  WITNESS supertypePool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      legendary: ["LEGEND"],  // ⛔ NOT the DFC, NOT the plain creature
      unrestricted: ["LEGEND", "LEGEND_ON_BACK_FACE", "PLAIN"],
    });
  });
});
