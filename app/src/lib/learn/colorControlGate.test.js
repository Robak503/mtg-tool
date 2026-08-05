/**
 * colorControlGate.test.js — "as long as you control [ANOTHER] <colour> creature/permanent": the Cohort
 * cycle (Ballynock, Briarberry, Crabapple, Mudbrawler, Ashenmoor), the Scarecrow cycle (Watchwing,
 * Blazethorn, Thornwatch), Gearsmith Guardian, Minotaur Tactician, Toxic Iguanar and more.
 *
 * ⭐ THE SECOND BUG WAS THE EXPENSIVE ONE, AND IT WAS INVISIBLE. Adding the single-colour gate alone
 * measured **ZERO**. The clause never reached the gate parser: the control-gate arms above it matched
 * (their type group is `(.+)`, which matches anything) and then `return`ed UNCONDITIONALLY even when
 * parseControlGateSource — which only reads a SINGLE-WORD type — had failed to produce a gate. The clause
 * was swallowed before the fuller lane ever saw it.
 *
 * ⛔ AND IT WAS KILLING AN ALREADY-SHIPPED FEATURE. The colour-OR Runemark arm ("you control a black or
 * green permanent") has been in the parser for ages, and in THIS clause position it was dead — Abzan
 * Kin-Guard and Cliffrunner Behemoth flipped from this fix alone, with no new gate involved. **A feature
 * can be fully built, fully tested in isolation, and still unreachable from the position that matters.**
 * The arms now return only when a gate actually parsed; a clause nothing can read still fails closed.
 *
 * ⛔ "ANOTHER" IS THE FALSE-POSITIVE RISK AND IT IS DRIVEN BELOW, not merely parsed. Ballynock Cohort IS a
 * white creature. Without excludeSelf it satisfies its own gate on an empty board and buffs itself forever
 * — turning a printed conditional +1/+1 into an unconditional one. The pin isolates it exactly: the same
 * board, the same card, one word of oracle text different.
 *
 * ⓘ Colour is read PRINTED (colorsOf), not derived — the documented precedent of the colour-OR gate it
 * shares a branch with. A layer-aware read would re-enter deriveCharacteristics inside a gate evaluation.
 * The trade is stated there: a colour-ADD is missed (FN-safe), a colour-REMOVAL over-counts, and the gate
 * is only ever a presence test.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test):
 * excludeSelf dropped from the parser -> Ballynock buffs itself alone on the battlefield (power 2 -> 3);
 * the SUFFIX P/T arm's fall-through reverted to an unconditional return -> Gearsmith Guardian parks again.
 * ⓘ Precisely: that second mutant leaves Abzan Kin-Guard native, because the fall-through was fixed at
 * FOUR sites and the Kin-Guard reaches its gate through the KEYWORD arm, not the P/T one. Recorded rather
 * than glossed — a mutant that only covers one of four sites is evidence about that site alone.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentHasKeyword } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BALLYNOCK_COHORT = { id: "c-bc", name: "Ballynock Cohort", type: "Creature — Kithkin Soldier",
  mana: "{2}{W}", power: "2", toughness: "2", colors: ["W"],
  oracle: "First strike\nThis creature gets +1/+1 as long as you control another white creature." };
// ⛔ THE CONTROL: identical in every respect except the word "another".
const SELFCOUNTING_TWIN = { ...BALLYNOCK_COHORT, id: "c-tw", name: "Selfcounting Twin",
  oracle: "First strike\nThis creature gets +1/+1 as long as you control a white creature." };
const ABZAN_KIN_GUARD = { id: "c-akg", name: "Abzan Kin-Guard", type: "Creature — Human Soldier",
  mana: "{2}{W}", power: "3", toughness: "2", colors: ["W"],
  oracle: "This creature has lifelink as long as you control a white or black permanent." };
const WHITE_BEAR = { id: "c-wb", name: "Bear Cub", type: "Creature — Bear", mana: "{1}{W}", power: "2", toughness: "2", colors: ["W"], oracle: "" };

describe("the gates parse with the right narrowing", () => {
  it("⭐ 'another' carries excludeSelf; the plain form does not", () => {
    const spec = (c) => parseStaticAbilities(c)[0].op.gate.countSpec;
    expect(spec(BALLYNOCK_COHORT)).toEqual({ kind: "colorPermanentsYouControl", colors: ["W"], cardType: "Creature", excludeSelf: true });
    expect(spec(SELFCOUNTING_TWIN)).toEqual({ kind: "colorPermanentsYouControl", colors: ["W"], cardType: "Creature" });
    expect(classifyCard(BALLYNOCK_COHORT)).toBe("native-static");
  });

  it("⭐ the colour-OR arm was already built and simply unreachable here", () => {
    // No new gate parses this — only the fall-through fix made the existing Runemark arm reachable.
    expect(parseStaticAbilities(ABZAN_KIN_GUARD)[0].op.gate.countSpec)
      .toEqual({ kind: "colorPermanentsYouControl", colors: ["W", "B"] });
    expect(classifyCard(ABZAN_KIN_GUARD)).toBe("native-static");
  });
});

describe("⭐ LAW 6 — 'another' is driven on a board, because it is the false-positive risk", () => {
  function board(card, { withFriend }) {
    const sub = createPermanent({ id: "sub", card, controller: "user", summoningSick: false });
    const bf = [sub];
    if (withFriend) bf.push(createPermanent({ id: "pal", card: WHITE_BEAR, controller: "user", summoningSick: false }));
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: bf } } };
  }

  it("⛔ ALONE, Ballynock is a plain 2/2 — it does NOT count itself", () => {
    const rows = [
      { card: "Ballynock (another)", alone: permanentPower(board(BALLYNOCK_COHORT, { withFriend: false }), "sub"), withFriend: permanentPower(board(BALLYNOCK_COHORT, { withFriend: true }), "sub") },
      // Same board, same card, ONE WORD different — this is what isolates excludeSelf.
      { card: "Twin (no 'another')", alone: permanentPower(board(SELFCOUNTING_TWIN, { withFriend: false }), "sub"), withFriend: permanentPower(board(SELFCOUNTING_TWIN, { withFriend: true }), "sub") },
    ];
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      { card: "Ballynock (another)", alone: 2, withFriend: 3 },
      // ⭐ The twin IS a white creature, so it satisfies its own gate with nobody else out — which is
      // exactly why the printed word "another" has to survive the parse.
      { card: "Twin (no 'another')", alone: 3, withFriend: 3 },
    ]);
  });

  it("the colour-OR permanent gate turns on and off with the board", () => {
    expect(permanentHasKeyword(board(ABZAN_KIN_GUARD, { withFriend: false }), "sub", "lifelink")).toBe(true); // it is itself white
    const noWhite = board({ ...ABZAN_KIN_GUARD, colors: ["G"], mana: "{2}{G}" }, { withFriend: false });
    expect(permanentHasKeyword(noWhite, "sub", "lifelink")).toBe(false);
  });
});
