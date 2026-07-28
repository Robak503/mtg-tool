/**
 * subtypeTapAugment.test.js — the BASIC-LAND-SUBTYPE tap augment (CR 605.1b / 305.6):
 * Crypt Ghast #525 · Nirkana Revenant #2848.
 *
 *   "Whenever you tap a SWAMP for mana, add an additional {B}."
 *
 * ⭐ THIS WAS A BANKED "CAN'T" THAT WASN'T TRUE. The parser's own note excluded subtype-gated subjects
 * on the grounds that "the tap site can't faithfully check the tapped land's subtype here" — and the
 * runtime it was describing already receives the tapped source PERMANENT and reads its type line for the
 * land / creature / nonland gates. A subtype word costs one more test on the same string. The refusal was
 * a stale guess about a sibling function, which is the kind that survives longest: it reads like a rules
 * limit and nobody re-derives it.
 *
 * ⚠️ AND IT CAME WITH A TRAP. staticAbilityParser has TWO subject lists — the parser's and
 * stripGlobalTapManaAugment's — and the coverage tier re-classifies the STRIPPED card. Widening only the
 * parser leaves the line in place, the stripped card parses as an augment again, and classifyCard
 * recurses until the stack blows. That is pinned below, because a stack overflow on one corpus card is
 * the loud version; a subtly wrong strip would be the quiet one.
 *
 * UNDER-COUNT, DELIBERATELY: the subtype is read off the PRINTED type line, like every sibling gate, so a
 * Mountain that is a Swamp only because of Urborg does NOT trigger Crypt Ghast. Safe direction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseGlobalTapManaAugment, stripGlobalTapManaAugment } from "./staticAbilityParser.js";
import { globalTapManaAugment, manaSources, planPayment } from "./manaModel.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CRYPT_GHAST = { id: "c-cg", name: "Crypt Ghast", type: "Creature — Spirit", mana: "{4}{B}", power: 2, toughness: 2, keywords: ["Extort"],
  oracle: "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nWhenever you tap a Swamp for mana, add an additional {B}." };
const NIRKANA = { id: "c-nr", name: "Nirkana Revenant", type: "Creature — Vampire Shade", mana: "{3}{B}{B}", power: 4, toughness: 4, keywords: [],
  oracle: "Whenever you tap a Swamp for mana, add an additional {B}.\n{B}: This creature gets +1/+1 until end of turn." };

const SWAMP = { id: "c-sw", name: "Swamp", type: "Basic Land — Swamp", oracle: "" };
const FOREST = { id: "c-fo", name: "Forest", type: "Basic Land — Forest", oracle: "" };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function board(lands) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: {
      ...s.players,
      user: {
        ...s.players.user, manaPool: { ...EMPTY_POOL },
        battlefield: [
          createPermanent({ id: "ghast", card: CRYPT_GHAST, controller: "user", summoningSick: false }),
          ...lands.map((card, i) => createPermanent({ id: `l${i}`, card, controller: "user", summoningSick: false })),
        ],
      },
    },
  };
}

describe("the parser — the subtype subject", () => {
  it("Crypt Ghast and Nirkana Revenant read as a Swamp-gated +{B}", () => {
    expect(parseGlobalTapManaAugment(CRYPT_GHAST)).toEqual({ subject: "swamp", colors: ["B"], amount: 1 });
    expect(parseGlobalTapManaAugment(NIRKANA)).toEqual({ subject: "swamp", colors: ["B"], amount: 1 });
  });

  it("THE RECURSION PIN — the strip must remove the subtype line too", () => {
    // The coverage tier re-classifies the stripped card. If this line survives, the stripped card parses
    // as an augment again and classifyCard recurses forever. Two subject lists, one meaning.
    expect(stripGlobalTapManaAugment(NIRKANA)).not.toMatch(/tap a Swamp/i);
    expect(parseGlobalTapManaAugment({ oracle: stripGlobalTapManaAugment(NIRKANA) })).toBeNull();
  });

  it("REGRESSION PIN — the land / creature subjects are untouched", () => {
    expect(parseGlobalTapManaAugment({ oracle: "Whenever you tap a creature for mana, add an additional {G}." }))
      .toEqual({ subject: "creature", colors: ["G"], amount: 1 });
    expect(parseGlobalTapManaAugment({ oracle: "Whenever you tap a land for mana, add one mana of any type that land produced." }))
      .toEqual({ subject: "land", sameAsProduced: true, amount: 1 });
  });
});

describe("RUNTIME — the subtype gate", () => {
  it("THE LOAD-BEARING ONE — a SWAMP tap carries the bonus, a FOREST tap does not", () => {
    const s = board([SWAMP, FOREST]);
    expect(globalTapManaAugment(s, "user", findPermanent(s, "l0").permanent)).toEqual([{ colors: ["B"], amount: 1 }]);
    expect(globalTapManaAugment(s, "user", findPermanent(s, "l1").permanent)).toEqual([]);
  });

  it("the payment planner sees a 2-B Swamp — one tap pays {B}{B}", () => {
    const s = board([SWAMP]);
    expect(planPayment(EMPTY_POOL, manaSources(s, "user"), { B: 2 })).not.toBeNull();
  });

  it("…and only one B off the Forest board (no phantom bonus)", () => {
    const s = board([FOREST]);
    expect(planPayment(EMPTY_POOL, manaSources(s, "user"), { B: 1 })).toBeNull();   // a Forest makes no B at all
    expect(planPayment(EMPTY_POOL, manaSources(s, "user"), { G: 2 })).toBeNull();   // and the augment doesn't fire
  });

  it("THE URBORG UNDER-COUNT, pinned as intended: a Swamp-in-name-only is read off the PRINTED line", () => {
    // A permanent whose type line doesn't print Swamp never triggers, however the board might have made
    // it one. Under-counting is the safe direction and this asserts it's the chosen behaviour, not a bug.
    const s = board([{ id: "c-x", name: "Bayou", type: "Land — Swamp Forest", oracle: "" }]);
    expect(globalTapManaAugment(s, "user", findPermanent(s, "l0").permanent)).toEqual([{ colors: ["B"], amount: 1 }]);
    const t = board([{ id: "c-y", name: "Mountain", type: "Basic Land — Mountain", oracle: "" }]);
    expect(globalTapManaAugment(t, "user", findPermanent(t, "l0").permanent)).toEqual([]);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Crypt Ghast #525 and Nirkana Revenant #2848 flip", () => {
    expect(classifyCard(CRYPT_GHAST)).toMatch(/^native/);
    expect(classifyCard(NIRKANA)).toMatch(/^native/);
  });
});
