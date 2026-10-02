/**
 * subtypeScaledMana.test.js — "{T}: Add {G} for each ELF you control" (Elvish Archdruid #942, Magus of
 * the Coffers #5409).
 *
 * countSelfSpecOnBoard has honoured a `subtype` on this spec shape the whole time — only the MANA-side
 * parser was card-types-only, so the counter was ready and nothing reached it.
 *
 * ⚠️ THE VOCABULARY GATE IS THE ENTIRE SAFETY ARGUMENT, and it's the opposite of the usual one. The
 * counter word-matches the type line CASE-SENSITIVELY, so an unvetted subtype word matches nothing, the
 * ability produces ZERO, and the card still classifies native — a mana source that makes no mana. That
 * is worse than parking it: the sim would count it as ramp and never get the mana. So a word earns
 * admission two ways, both checkable without a card index:
 *   • it is one of the five BASIC LAND types (a closed set, always real); or
 *   • the SOURCE CARD ITSELF carries it — an Elf counting Elves proves "Elf" is a printed subtype.
 * A card counting a subtype it doesn't share is refused. None exist in the top-5000; the refusal is an
 * under-count, the safe direction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaProduction, manaSources, planPayment } from "./manaModel.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ARCHDRUID = { id: "c-ea", name: "Elvish Archdruid", type: "Creature — Elf Druid", mana: "{1}{G}{G}", power: 2, toughness: 2, keywords: [],
  oracle: "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control." };
const MAGUS = { id: "c-mc", name: "Magus of the Coffers", type: "Creature — Human Wizard", mana: "{5}{B}", power: 3, toughness: 3, keywords: [],
  oracle: "{2}, {T}: Add {B} for each Swamp you control." };
const CIRCLE = { id: "c-cd", name: "Circle of Dreams Druid", type: "Creature — Elf Druid", mana: "{2}{G}", power: 2, toughness: 2, keywords: [],
  oracle: "{T}: Add {G} for each creature you control." };

const ELF = { id: "c-elf", name: "Llanowar Elves", type: "Creature — Elf Druid", power: 1, toughness: 1, oracle: "" };
const BEAR = { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

/** The Archdruid plus `elves` other Elves and `bears` non-Elf creatures. */
function board(elves, bears) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: {
        ...s.players.user, manaPool: { ...EMPTY_POOL },
        battlefield: [
          createPermanent({ id: "ad", card: ARCHDRUID, controller: "user", summoningSick: false }),
          ...Array.from({ length: elves }, (_, i) => createPermanent({ id: `e${i}`, card: { ...ELF, id: `c-elf${i}` }, controller: "user", summoningSick: false })),
          ...Array.from({ length: bears }, (_, i) => createPermanent({ id: `b${i}`, card: { ...BEAR, id: `c-bear${i}` }, controller: "user", summoningSick: false })),
        ],
      },
    },
  };
}
/** The most G a single Archdruid tap can pay for on this board. */
function maxGreen(elves, bears) {
  const srcs = manaSources(board(elves, bears), "user").filter((x) => x.permanentId === "ad");
  for (let n = 8; n >= 0; n--) if (planPayment(EMPTY_POOL, srcs, { G: n })) return n;
  return -1;
}

describe("the parser — the subtype spec", () => {
  it("Elvish Archdruid and Magus of the Coffers read as subtype counts", () => {
    expect(manaProduction(ARCHDRUID).amountSpec).toEqual({ kind: "permanentsYouControl", subtype: "Elf" });
    expect(manaProduction(MAGUS).amountSpec).toEqual({ kind: "permanentsYouControl", subtype: "Swamp" });
  });

  it("REGRESSION PIN — the card-TYPE form is untouched", () => {
    expect(manaProduction(CIRCLE).amountSpec).toEqual({ kind: "permanentsYouControl", cardType: "creature" });
  });

  it("THE VOCABULARY GATE — a subtype the source doesn't carry is REFUSED", () => {
    // A word that isn't a real subtype matches nothing case-sensitively, so the ability would produce ZERO
    // while the card still classified native — ramp the sim counts and never receives.
    expect(manaProduction({ name: "X", type: "Creature — Human Wizard", oracle: "{T}: Add {G} for each Elf you control." })).toBeNull();
    expect(manaProduction({ name: "X", type: "Creature — Human Wizard", oracle: "{T}: Add {G} for each Gobbledegook you control." })).toBeNull();
  });

  it("…but a BASIC LAND type is admitted from any source (a closed, always-real set)", () => {
    expect(manaProduction({ name: "X", type: "Creature — Human Wizard", oracle: "{T}: Add {B} for each Swamp you control." }).amountSpec)
      .toEqual({ kind: "permanentsYouControl", subtype: "Swamp" });
  });

  it("Priest of Titania reads a different SCOPE — 'on the battlefield' is every player's battlefield, never the 'you control' count", () => {
    // GRADUATED CAPABILITY PIN (play-weighted #766, 2026-10-02). This pinned null while the all-seats scope was unmodeled; the
    // scope landed (countForSpec subtypeOnBattlefield — decayChainPriest.test.js drives it on a board), so the pin moves: the
    // scope must stay DISTINCT from this file's own-board count.
    expect(manaProduction({ name: "Priest of Titania", type: "Creature — Elf Druid", oracle: "{T}: Add {G} for each Elf on the battlefield." }).amountSpec)
      .toEqual({ kind: "subtypeOnBattlefield", subtype: "Elf" });
  });
});

describe("RUNTIME — the amount actually tracks the Elf count", () => {
  it("THE LOAD-BEARING ONE — non-Elf creatures do NOT count", () => {
    // The card-type spec would say 4 here. The subtype spec says 2 (the Archdruid plus one Elf).
    expect(maxGreen(1, 2)).toBe(2);
  });

  it("the count scales: alone → 1, with three other Elves → 4", () => {
    expect(maxGreen(0, 0)).toBe(1);
    expect(maxGreen(3, 0)).toBe(4);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Elvish Archdruid #942 and Magus of the Coffers #5409 flip", () => {
    expect(classifyCard(ARCHDRUID)).toMatch(/^native/);
    expect(classifyCard(MAGUS)).toMatch(/^native/);
  });
});
