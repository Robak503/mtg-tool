/**
 * combatEvasionTextMemo.test.js — the block gate's card-text readers are memoized by NAME and TEXT (2026-10-04).
 *
 * Found in self-play: a 389-attacker Scute Swarm turn took 411 seconds, 74% of it in canBlockAttacker — each call
 * re-normalising every card's rules text and rebuilding a RegExp from its name. The readers are pure functions of the
 * card's name and text, so the answers are kept: the same game runs in 111 seconds.
 *
 * What a memo can get wrong is the KEY. These cases pin it: the answer follows the name and the text, never the card
 * object and never one of the two alone. Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-04);
 * the edited copies are labelled.
 */
import { describe, expect, it } from "vitest";

import { blockableOnlyBySubtypeOf, groupBlockRestrictionOf, isBlockedByAtMostOne, teamPowerBlockGateOf } from "./combatEvasion.js";

const HUANG = {"name":"Huang Zhong, Shu General","type":"Legendary Creature — Human Soldier","mana":"{2}{W}{W}","cmc":4,"power":"2","toughness":"3","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"Huang Zhong can't be blocked by more than one creature."};
const SHIFTING = {"name":"Shifting Sliver","type":"Creature — Sliver","mana":"{3}{U}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Slivers can't be blocked except by Slivers."};
const CHAMPION = {"name":"Champion of Lambholt","type":"Creature — Human Warrior","mana":"{1}{G}{G}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Creatures with power less than this creature's power can't block creatures you control.\nWhenever another creature you control enters, put a +1/+1 counter on this creature."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};

describe("the answer follows the card's name AND its text", () => {
  it("the real cards read as before", () => {
    expect([HUANG, BEARS, CHAMPION].map(isBlockedByAtMostOne)).toEqual([true, false, false]);
    expect([CHAMPION, BEARS, HUANG].map(teamPowerBlockGateOf)).toEqual([true, false, false]);
    expect([SHIFTING, BEARS].map(blockableOnlyBySubtypeOf)).toEqual(["Sliver", null]);
  });

  it("the same NAME with different text is a different answer (EDITED copies)", () => {
    // asked first with the real text, so a memo keyed by name alone would answer `true` for all three
    expect(isBlockedByAtMostOne(HUANG)).toBe(true);
    expect(isBlockedByAtMostOne({ ...HUANG, oracle: "" })).toBe(false);
    expect(isBlockedByAtMostOne({ ...HUANG, oracle: "Flying" })).toBe(false);
    expect(blockableOnlyBySubtypeOf(SHIFTING)).toBe("Sliver");
    expect(blockableOnlyBySubtypeOf({ ...SHIFTING, oracle: "Goblins can't be blocked except by Goblins." })).toBe("Goblin");
    expect(blockableOnlyBySubtypeOf({ ...SHIFTING, oracle: "" })).toBe(null);
  });

  it("the same TEXT under a different name is a different answer (EDITED copies)", () => {
    // "Huang Zhong can't be blocked…" is a self-clause only on a card NAMED Huang Zhong
    expect(isBlockedByAtMostOne(HUANG)).toBe(true);
    expect(isBlockedByAtMostOne({ ...HUANG, name: "Grizzly Bears" })).toBe(false);
    expect(isBlockedByAtMostOne({ ...HUANG, name: "Huang Zhong" })).toBe(true);
  });

  it("a card edited IN PLACE reads its new text: the key is the text, not the object", () => {
    const card = { ...HUANG };
    expect(isBlockedByAtMostOne(card)).toBe(true);
    card.oracle = "";
    expect(isBlockedByAtMostOne(card)).toBe(false);
    card.oracle = HUANG.oracle;
    expect(isBlockedByAtMostOne(card)).toBe(true);
    const sliver = { ...SHIFTING };
    expect(blockableOnlyBySubtypeOf(sliver)).toBe("Sliver");
    sliver.oracle = "";
    expect(blockableOnlyBySubtypeOf(sliver)).toBe(null);
  });

  it("no card at all, and a card with no text, answer without throwing", () => {
    expect([null, undefined, {}].map(isBlockedByAtMostOne)).toEqual([false, false, false]);
    expect([null, undefined, {}].map(groupBlockRestrictionOf)).toEqual([null, null, null]);
  });

  it("the raw Scryfall field is read for the group restriction", () => {
    expect(groupBlockRestrictionOf({ name: "Shifting Sliver", oracle_text: SHIFTING.oracle })).toEqual({ subtypes: ["Sliver"], controllerScope: "any" });
  });
});

describe("what is kept", () => {
  it("the group restriction is one shared, frozen object per name and text", () => {
    const first = groupBlockRestrictionOf(SHIFTING);
    expect(first).toEqual({ subtypes: ["Sliver"], controllerScope: "any" });
    expect(groupBlockRestrictionOf({ ...SHIFTING })).toBe(first); // another card object, the same answer object
    expect(Object.isFrozen(first) && Object.isFrozen(first.subtypes)).toBe(true);
    expect(() => { first.subtypes.push("Goblin"); }).toThrow();
    expect(() => { first.controllerScope = "you"; }).toThrow();
  });

  it("past the memo's limit the answers are still right, for old cards and new", () => {
    // 8,300 distinct names is more than the memo holds: it starts again part-way through.
    for (let i = 0; i < 8300; i++) {
      const selfClause = i % 2 === 0;
      const card = { name: `Probe ${i}`, oracle: selfClause ? `Probe ${i} can't be blocked by more than one creature.` : "Flying" };
      if (isBlockedByAtMostOne(card) !== selfClause) throw new Error(`wrong answer for card ${i}`);
    }
    expect(isBlockedByAtMostOne(HUANG)).toBe(true);
    expect(isBlockedByAtMostOne({ name: "Probe 0", oracle: "Probe 0 can't be blocked by more than one creature." })).toBe(true);
    expect(isBlockedByAtMostOne({ name: "Probe 0", oracle: "Flying" })).toBe(false);
    const again = groupBlockRestrictionOf(SHIFTING);
    expect(groupBlockRestrictionOf(SHIFTING)).toBe(again);
  });
});
