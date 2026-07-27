/**
 * fuseSplitCard.test.js — unparking fuse on split cards (CR 702.102a, census slice 54).
 *
 * `parseSplitCard` used to refuse any fuse card outright, with the note "a fuse card lets you cast BOTH
 * halves at once (an unmodeled option)". That was the right call when it was written and the wrong one once
 * the optional-mode family existed: fuse only ADDS a casting mode. Both halves stay individually castable
 * from hand exactly as on any other split card, and the engine already offers each. Declining the fused
 * mode leaves a real, complete, legal cast — an under-offer, the safe direction.
 *
 * A CLASSIFIER FLIP IS A CLAIM ABOUT THE RUNTIME, so this file checks the runtime rather than the tier. The
 * card being "native" says the engine plays it; these tests are what make that checkable.
 *
 * AFTERMATH followed one slice later (55), and the ORDER is the point. Its second half is castable ONLY
 * from the graveyard (CR 702.127a) while this engine's split lane offered both halves from HAND, so simply
 * deleting its park would not have under-offered — it would have produced an ILLEGAL cast. Slice 54 refused
 * it with a stated precondition ("until the hand-cast lane learns to withhold that half"); slice 55 built
 * exactly that, and only then lifted the refusal. The withholding is tested here as the load-bearing
 * assertion: delete the skip and this file fails.
 */
import { describe, expect, it } from "vitest";

import { parseSplitCard } from "./splitCard.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

const FUSE_CARD = {
  id: "fz", name: "Alive // Well", type: "Sorcery // Sorcery", mana: "{3}{G} // {W}",
  oracle: [
    "Alive - Sorcery {3}{G}",
    "Create a 3/3 green Centaur creature token.",
    "Fuse (You may cast one or both halves of this card from your hand.)",
    "//",
    "Well - Sorcery {W}",
    "You gain 2 life for each creature you control.",
    "Fuse (You may cast one or both halves of this card from your hand.)",
  ].join("\n"),
};

// A REAL corpus aftermath card whose BOTH halves are modeled, so the CREED gate lets it through and the
// hand-cast behaviour is actually observable. (An earlier draft used Claim // Fame, whose reanimation half
// is unmodeled — the card was correctly refused outright, which made the "front half still casts" assertion
// unobservable rather than wrong. The fixture was the bug, not the engine.)
const AFTERMATH_CARD = {
  id: "af", name: "Road // Ruin", type: "Instant // Sorcery", mana: "{2}{G} // {1}{R}{R}",
  oracle: [
    "Road - Instant {2}{G}",
    "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
    "//",
    "Ruin - Sorcery {1}{R}{R}",
    "Aftermath (Cast this spell only from your graveyard. Then exile it.)",
    "Ruin deals damage to target creature equal to the number of lands you control.",
  ].join("\n"),
};

describe("the shape module now accepts a fuse card", () => {
  it("parses both halves", () => {
    const parsed = parseSplitCard(FUSE_CARD);
    expect(parsed).not.toBeNull();
    expect(parsed.left.name).toBe("Alive");
    expect(parsed.right.name).toBe("Well");
  });

  it("an AFTERMATH card now parses too — but carries its graveyard-only fact (slice 55)", () => {
    // PIN MOVED, one slice later, and only once its CONDITION was met. Slice 54 refused aftermath with a
    // stated precondition: "until the hand-cast lane learns to withhold that half". Slice 55 built exactly
    // that, so the refusal is lifted — but the fact travels with the shape rather than being forgotten.
    const parsed = parseSplitCard(AFTERMATH_CARD);
    expect(parsed).not.toBeNull();
    expect(parsed.rightGraveyardOnly).toBe(true);
  });
});

describe("RUNTIME — the flip is a claim that the engine plays it, so check the engine", () => {
  function boardWithCardInHand(card) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [];
    for (let i = 0; i < 8; i++) {
      bf.push(createPermanent({ id: `f${i}`, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false }));
    }
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: bf, hand: [card], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } },
      },
    };
  }

  it("BOTH halves are offered as real casts from hand", () => {
    const casts = legalActionsForPlayer(boardWithCardInHand(FUSE_CARD), "user")
      .filter((a) => String(a.kind).startsWith("cast") && a.cardId === "fz");
    const names = new Set(casts.map((a) => a.name));
    expect(names.has("Alive")).toBe(true);
    expect(names.has("Well")).toBe(true);
  });

  it("THE LOAD-BEARING ONE — the aftermath half is NEVER offered from hand", () => {
    // This is the assertion that makes unparking aftermath legal at all. Its second half casts only from
    // the graveyard (CR 702.127a); offering it from hand would be an ILLEGAL play, which is strictly worse
    // than leaving the card on the Arbiter. Delete the `face.graveyardOnly` skip and this fails.
    const casts = legalActionsForPlayer(boardWithCardInHand(AFTERMATH_CARD), "user")
      .filter((a) => String(a.kind).startsWith("cast") && a.cardId === "af" && a.name === "Ruin");
    expect(casts).toHaveLength(0);
  });

  it("…while its FRONT half still plays from hand exactly as printed", () => {
    // The other side of the bargain: withholding the aftermath half must not cost the card its normal cast.
    const casts = legalActionsForPlayer(boardWithCardInHand(AFTERMATH_CARD), "user")
      .filter((a) => String(a.kind).startsWith("cast") && a.cardId === "af" && a.name === "Road");
    expect(casts.length).toBeGreaterThan(0);
  });
});

describe("classification", () => {
  it("the fuse carrier flips", () => {
    expect(classifyCard(FUSE_CARD)).toMatch(/^native/);
  });

  it("CREED — an unmodeled clause on either half still parks the whole card", () => {
    const broken = { ...FUSE_CARD, oracle: FUSE_CARD.oracle.replace("You gain 2 life for each creature you control.", "Each opponent glorbulates.") };
    expect(classifyCard(broken)).not.toMatch(/^native/);
  });
});
