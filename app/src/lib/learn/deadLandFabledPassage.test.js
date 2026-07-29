/**
 * deadLandFabledPassage.test.js — a DEAD LAND: Fabled Passage offered no action at all.
 *
 * ⛔ THE COVERAGE METRIC CANNOT SEE THIS. Every land classifies `tier: "land"` no matter what it does, so a
 * land whose only ability never fires is counted as fully modelled while being, in play, a blank card. That
 * is the dead-card class NEXT-QUEUE D2 exists for — "higher value than coverage, and invisible to the
 * corpus number" — and Fabled Passage is rank #50 and sits in THREE of the shelf's decks (Earth Bent, Hulk
 * Smash, Halfshell heroes).
 *
 * The blocker was one trailing sentence. The fetch itself is the Evolving Wilds shape and parses fine; the
 * bonus rider "Then if you control four or more lands, untap that land." killed the WHOLE ability, so the
 * land offered nothing rather than offering a fetch.
 *
 * ⛔ THE FIX IS A DELIBERATE UNDER-DELIVERY, and that is the honest description. The rider is dropped, not
 * modelled: the fetched land now always stays TAPPED when it should sometimes untap. The player gets LESS
 * than printed. That is the safe direction, and it is the same asymmetry probe-ignored-restrictions is
 * built on —
 *     an ignored tail that ADDS an effect  → under-delivers → FN, safe
 *     an ignored tail that RESTRICTS       → over-delivers  → FP, forbidden
 * This tail only ever adds. A tail that took something away could never be handled this way.
 *
 * ⚠️ ONE-CARD SHAPE, corpus-verified: Fabled Passage is the only card printing this rider. The strip is
 * anchored to the printed sentence rather than being a general "drop the trailing sentence you cannot
 * parse" rule — that rule would eventually swallow a restriction and flip the direction to forbidden.
 *
 * How it was found: after removing the phantom {C} these lands were making, I asked whether they do their
 * REAL job. Two fetchlands did; this one did nothing.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Verbatim oracle (the test env has no oracle repo, so fixtures are inlined).
const FABLED_PASSAGE = { id: "cfp", name: "Fabled Passage", type: "Land", oracle: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land." };
const EVOLVING_WILDS = { id: "cew", name: "Evolving Wilds", type: "Land", oracle: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." };
const FOREST = { id: "cf", name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };

function table(card) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, life: 20, battlefield: [createPermanent({ id: "L", controller: "user", card })], library: [FOREST, FOREST] } },
  };
}
const actionsOn = (card) => legalActionsForPlayer(table(card), "user").filter((a) => a.permanentId === "L");

describe("⭐ the land is no longer dead", () => {
  it("⭐ Fabled Passage offers its fetch", () => {
    const acts = actionsOn(FABLED_PASSAGE);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts[0].kind).toBe("activate-ability");
  });

  it("⭐ and it offers the SAME thing as the rider-free card it is a copy of", () => {
    // The point of the strip: once the bonus tail is gone, this IS Evolving Wilds. If the two ever diverge,
    // the strip has started doing something other than removing the tail.
    expect(actionsOn(FABLED_PASSAGE).map((a) => a.kind)).toEqual(actionsOn(EVOLVING_WILDS).map((a) => a.kind));
  });

  it("CONTROL — the rider-free fetchland was never broken", () => {
    // Guards against a "fix" that works by loosening something for BOTH cards: if this had been failing
    // too, the assertion above would pass while proving nothing.
    expect(actionsOn(EVOLVING_WILDS).length).toBeGreaterThan(0);
  });
});

describe("⛔ the strip stays narrow", () => {
  it("⛔ a land with an unparsed tail that is NOT this rider is still refused", () => {
    // The whole risk of this fix is becoming a general trailing-sentence dropper. A different unparseable
    // tail must still park the ability rather than being silently discarded.
    const weird = { id: "cw", name: "Weird Passage", type: "Land", oracle: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then blorp the wibble frobnicator." };
    expect(actionsOn(weird)).toHaveLength(0);
  });

  it("⛔ the strip removes ONLY its own sentence — a different tail survives into the clause", () => {
    // ⚠️ THIS PIN REPLACED A WRONG ONE. It first asserted that a RESTRICTING tail ("…, sacrifice a
    // creature") would leave the land with no action — a guess about a card I invented, and false: that
    // tail parses to [tutor, sacrifice] at HIGH, so offering the action is correct and the engine was
    // right. Asserting on the CLAUSE is the honest version, because the claim I actually need is about the
    // strip's anchoring, not about a fabricated card's behaviour.
    const [ab] = parseActivatedAbilities({ name: "Other Passage", type: "Land",
      oracle: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, sacrifice a creature." });
    expect(ab.effectClause).toContain("sacrifice a creature");

    // …and Fabled Passage's own tail IS gone.
    const [fp] = parseActivatedAbilities(FABLED_PASSAGE);
    expect(fp.effectClause).not.toMatch(/untap that land/i);
  });
});
