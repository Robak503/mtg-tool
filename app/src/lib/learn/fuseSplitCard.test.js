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
 * AFTERMATH IS NOT UNPARKED, and the contrast is the point. Its second half is castable ONLY from the
 * graveyard (CR 702.127a), while this engine's split lane offers both halves from HAND — so unparking it
 * would not under-offer, it would produce an ILLEGAL cast. That is the false-positive direction, and the
 * refusal is pinned below so nobody "finishes the job" by deleting the other line too.
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

const AFTERMATH_CARD = {
  id: "af", name: "Claim // Fame", type: "Sorcery // Sorcery", mana: "{B} // {1}{R}",
  oracle: [
    "Claim - Sorcery {B}",
    "Return target creature card with mana value 2 or less from your graveyard to the battlefield.",
    "//",
    "Fame - Sorcery {1}{R}",
    "Aftermath (Cast this spell only from your graveyard. Then exile it.)",
    "Target creature gets +2/+0 and gains haste until end of turn.",
  ].join("\n"),
};

describe("the shape module now accepts a fuse card", () => {
  it("parses both halves", () => {
    const parsed = parseSplitCard(FUSE_CARD);
    expect(parsed).not.toBeNull();
    expect(parsed.left.name).toBe("Alive");
    expect(parsed.right.name).toBe("Well");
  });

  it("CREED — an AFTERMATH card is still refused", () => {
    expect(parseSplitCard(AFTERMATH_CARD)).toBeNull();
    expect(classifyCard(AFTERMATH_CARD)).not.toMatch(/^native/);
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

  it("the AFTERMATH card is offered NO cast at all — refused end to end, not just in the tier", () => {
    // The important half of the contrast. If the classifier refused it but the runtime still offered the
    // graveyard-only half from hand, the engine would be making an illegal play regardless of coverage.
    const casts = legalActionsForPlayer(boardWithCardInHand(AFTERMATH_CARD), "user")
      .filter((a) => String(a.kind).startsWith("cast") && a.cardId === "af" && a.name === "Fame");
    expect(casts).toHaveLength(0);
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
