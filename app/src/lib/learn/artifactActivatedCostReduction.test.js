/**
 * artifactActivatedCostReduction.test.js — "Activated abilities of ARTIFACTS you control cost {1} less to
 * activate" (Forensic Gadgeteer #1374), the third arm of the Training Grounds family.
 *
 * The SUBJECT is a filter, not decoration. Training Grounds discounts a CREATURE's abilities; Forensic
 * Gadgeteer discounts an ARTIFACT's. Crediting one under the other's gate discounts the wrong abilities —
 * a wrong PRICE rather than a missing effect, and one the coverage tier cannot see because the card
 * classifies native either way.
 *
 * The two pools are disjoint EXCEPT on artifact creatures, where both legitimately apply and stack. That
 * overlap is the interesting case and it's pinned.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GADGETEER = { id: "c-fg", name: "Forensic Gadgeteer", type: "Creature — Vedalken Detective", mana: "{2}{U}", power: 2, toughness: 3, keywords: [],
  oracle: "Activated abilities of artifacts you control cost {1} less to activate.\nWhenever you cast an artifact spell, you may pay {1}. If you do, investigate." };
const TRAINING_GROUNDS = { id: "c-tg", name: "Training Grounds", type: "Enchantment", mana: "{U}", keywords: [],
  oracle: "Activated abilities of creatures you control cost {2} less to activate." };

// Two pingers with an identical {3} ability, differing only in type line.
const ART_PINGER = { id: "c-ap", name: "Gadget", type: "Artifact", oracle: "{3}: Draw a card." };
const CRE_PINGER = { id: "c-cp", name: "Sage", type: "Creature — Human", power: 1, toughness: 1, oracle: "{3}: Draw a card." };
const ARTCRE_PINGER = { id: "c-acp", name: "Golem", type: "Artifact Creature — Golem", power: 2, toughness: 2, oracle: "{3}: Draw a card." };
const ISLAND = { id: "c-is", name: "Island", type: "Basic Land — Island", oracle: "" };

function board(reducers, pinger) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: [
          createPermanent({ id: "p", card: pinger, controller: "user", summoningSick: false }),
          ...reducers.map((c, i) => createPermanent({ id: `r${i}`, card: c, controller: "user", summoningSick: false })),
          ...Array.from({ length: 3 }, (_, i) => createPermanent({ id: `l${i}`, card: { ...ISLAND, id: `c-is${i}` }, controller: "user", summoningSick: false })),
        ],
      },
    },
  };
}
/** Is the pinger's {3} ability offered? With only 2 lands untapped it is offered ONLY when discounted. */
function offeredOnTwoLands(reducers, pinger) {
  const s = board(reducers, pinger);
  const tapped = { ...s, players: { ...s.players, user: { ...s.players.user,
    battlefield: s.players.user.battlefield.map((p) => (p.id === "l2" ? { ...p, tapped: true } : p)) } } };
  return legalActionsForPlayer(tapped, "user").some((a) => a.kind === "activate-ability" && a.permanentId === "p");
}

describe("the parser — the subject rides the descriptor", () => {
  it("Forensic Gadgeteer carries subject:'artifact'; Training Grounds carries none", () => {
    expect(parseStaticAbilities(GADGETEER).find((d) => d.activatedCostReduction).activatedCostReduction)
      .toEqual({ amount: 1, subject: "artifact" });
    expect(parseStaticAbilities(TRAINING_GROUNDS).find((d) => d.activatedCostReduction).activatedCostReduction)
      .toEqual({ amount: 2 });   // creatures stays the unmarked default — every existing descriptor unchanged
  });

  it("GRADUATED 2026-09-05 (samLoyalAttendant.test.js): 'lands you control' is a modeled subject now — its OWN descriptor with its own runtime gate; an unmodeled subject word is still refused", () => {
    expect(parseStaticAbilities({ oracle: "Activated abilities of lands you control cost {1} less to activate." })
      .find((d) => d.activatedCostReduction).activatedCostReduction).toEqual({ amount: 1, subject: "land" });
    // CREED — the refusal class lives on: a word that is neither a card type nor a real subtype stays body-only
    expect(parseStaticAbilities({ oracle: "Activated abilities of widgets you control cost {1} less to activate." })
      .find((d) => d.activatedCostReduction)).toBeUndefined();
  });
});

describe("RUNTIME — each reducer discounts only its own pool", () => {
  it("baseline: with no reducer the {3} ability is NOT offered on two lands", () => {
    expect(offeredOnTwoLands([], ART_PINGER)).toBe(false);
    expect(offeredOnTwoLands([], CRE_PINGER)).toBe(false);
  });

  it("THE LOAD-BEARING PAIR — Gadgeteer discounts the ARTIFACT's ability and not the CREATURE's", () => {
    expect(offeredOnTwoLands([GADGETEER], ART_PINGER)).toBe(true);
    expect(offeredOnTwoLands([GADGETEER], CRE_PINGER)).toBe(false);
  });

  it("REGRESSION PIN — Training Grounds is exactly inverted", () => {
    expect(offeredOnTwoLands([TRAINING_GROUNDS], CRE_PINGER)).toBe(true);
    expect(offeredOnTwoLands([TRAINING_GROUNDS], ART_PINGER)).toBe(false);
  });

  it("an ARTIFACT CREATURE is in BOTH pools — either reducer alone discounts it", () => {
    expect(offeredOnTwoLands([GADGETEER], ARTCRE_PINGER)).toBe(true);
    expect(offeredOnTwoLands([TRAINING_GROUNDS], ARTCRE_PINGER)).toBe(true);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Forensic Gadgeteer #1374 flips", () => {
    expect(classifyCard(GADGETEER)).toMatch(/^native/);
  });
});
