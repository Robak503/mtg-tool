/**
 * forTheAncestorsReveal.test.js — the CHOSEN-TYPE REVEAL TO HAND spell effect (For the Ancestors).
 * "Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards
 * of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom
 * of your library in a random order." → ONE chosen-type-reveal-to-hand atom (the hand-destination sibling
 * of Gishath's reveal-put-filtered, gishathReveal.test.js). The type choice is resolved deterministically —
 * whichever creature type is held by the MOST revealed cards (the legal, maximizing pick for a
 * card-advantage spell) — mirroring matchChooseTypeDraw's own board-count-maximizing policy.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyChosenTypeRevealToHand } from "./effects/atoms/library.js";

const ancestors = (over = {}) => ({
  name: "For the Ancestors",
  type: "Instant",
  mana: "{2}{G}",
  oracle:
    "Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.\n" +
    "Flashback {3}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
  ...over,
});

const elf = (id) => ({ id: `E${id}`, name: `Elf${id}`, type: "Creature — Elf" });
const bear = (id) => ({ id: `B${id}`, name: `Bear${id}`, type: "Creature — Bear" });
const land = (id) => ({ id: `L${id}`, name: `Land${id}`, type: "Land — Forest" });
const changeling = (id) => ({ id: `C${id}`, name: `Changeling${id}`, type: "Creature — Shapeshifter", keywords: ["changeling"] });
const mkState = (library) => ({ rngSeed: 12345, players: { user: { battlefield: [], library, graveyard: [], hand: [], eliminated: false } }, log: [] });
const handNames = (s) => s.players.user.hand.map((c) => c.name);
const libNames = (s) => s.players.user.library.map((c) => c.name);

const parsedAtom = () => parseEffectClause(
  "Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.",
  "Instant",
).atoms[0];

describe("For the Ancestors — classification", () => {
  it("flips native-spell (the four-sentence effect is fully modeled + Flashback already known)", () => {
    expect(classifyCard(ancestors())).toBe("native-spell");
  });
  it("parses to the chosen-type-reveal-to-hand atom with amount=6", () => {
    expect(parsedAtom()).toMatchObject({ op: "chosen-type-reveal-to-hand", amount: 6 });
  });
  it("CREED: a DIFFERENT disposition ('into your graveyard') is not this shape → stays body-only", () => {
    const c = ancestors({
      oracle: "Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest into your graveyard.",
    });
    expect(classifyCard(c)).not.toMatch(/^native/);
  });
});

describe("For the Ancestors — resolution", () => {
  it("chooses the type with the MOST revealed matches, puts every one of that type to hand, bottoms the rest", () => {
    // top 6: Elf1, Bear1, Elf2, Land1, Elf3, Bear2 — Elf appears 3x, Bear 2x → Elf wins.
    let s = mkState([elf(1), bear(1), elf(2), land(1), elf(3), bear(2), elf(4)]);
    s = applyChosenTypeRevealToHand(s, parsedAtom(), { controller: "user" });
    expect(handNames(s).sort()).toEqual(["Elf1", "Elf2", "Elf3"]);
    expect(s.players.user.library.length).toBe(4); // 7 - 3 taken = 4 left (Bear1, Land1, Bear2 bottomed + Elf4 untouched)
    expect(libNames(s)[0]).toBe("Elf4"); // the un-revealed 7th card stays on top
    expect(libNames(s).slice(1).sort()).toEqual(["Bear1", "Bear2", "Land1"]); // bottomed (order random)
  });

  it("a changeling counts toward whichever type wins without skewing the count itself", () => {
    // top 6: Elf1, Elf2, Bear1, Changeling1, Land1, Land2 — Elf wins 2-1 on real Elves; the changeling
    // also qualifies as an Elf (CR 702.73a) and comes along, so 3 total go to hand.
    let s = mkState([elf(1), elf(2), bear(1), changeling(1), land(1), land(2)]);
    s = applyChosenTypeRevealToHand(s, parsedAtom(), { controller: "user" });
    expect(handNames(s).sort()).toEqual(["Changeling1", "Elf1", "Elf2"]);
  });

  it("no creature revealed → no type to choose → a clean no-op (never a fabricated take)", () => {
    let s = mkState([land(1), land(2)]);
    s = applyChosenTypeRevealToHand(s, parsedAtom(), { controller: "user" });
    expect(handNames(s)).toEqual([]);
    expect(s.players.user.library.length).toBe(2); // untouched — only 2 cards existed, both revealed, none matched
  });

  it("empty library → a clean no-op, never a throw", () => {
    let s = mkState([]);
    s = applyChosenTypeRevealToHand(s, parsedAtom(), { controller: "user" });
    expect(handNames(s)).toEqual([]);
  });
});
