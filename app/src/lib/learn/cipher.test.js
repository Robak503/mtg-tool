/**
 * cipher.test.js — CIPHER (CR 702.98a). Eight carriers: Paranoid Delusions, Last Thoughts, Midnight
 * Recovery, Whispering Madness, Call of the Nightwing, Hands of Binding, Mental Vapors, Shadow Slice.
 *
 * "Cipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature
 * deals combat damage to a player, its controller may cast a copy of the encoded card without paying its
 * mana cost.)"
 *
 * ⭐ CREDITED ON THE UNTAKEN-OPTION RATIONALE, AND IT MEETS THAT FAMILY'S STATED CRITERION RATHER THAN AN
 * ANALOGY. optionalModeKeywords.test.js sets the bar in its own words: "the option has to be one the player
 * may simply decline with no consequence to the rest of the card. A keyword whose UNPAID state still
 * changes the board (or whose reminder hides a mandatory rider) is a different animal."
 *   · Declining leaves the spell resolving normally and going to the graveyard — a real, complete, legal
 *     play. Every carrier was ALREADY native once this one line was removed, which is the proof.
 *   · The unpaid state changes NOTHING on the board. ⛔ Contrast CHAMPION, whose unpaid state SACRIFICES the
 *     creature — which is exactly why champion is credited only because it is ENFORCED, never for being
 *     declinable. The two sit on opposite sides of this line on purpose.
 *   · The reminder hides no mandatory rider: the encoded-copy trigger exists only if the option was taken.
 *     VERIFIED, not assumed — detectTriggers returns ZERO for a cipher carrier, so the reminder's
 *     "Whenever that creature deals combat damage…" never leaks in as a phantom descriptor. Pinned.
 *   · The carriers all have real mana costs and hard-cast normally — the exact point on which the SUSPEND
 *     precedent was refused (no mana cost ⇒ cannot be hard-cast at all).
 * Myriad is the closest sibling already in the family: another "you may create a copy" rider.
 *
 * TWO HALVES, because a spell and a permanent take different paths and one alone bought nothing:
 *   ① coverage's keyword-only credit — the PERMANENT-residue side. Measured alone: GAINED 0, because every
 *      carrier is an instant or sorcery and goes through the effect-program path instead.
 *   ② the CAST_KEYWORD_LINE strip — the SPELL side, joined on that block's own basis (the line changes the
 *      resolution only when taken; the engine never takes it; a normal cast resolves the printed body
 *      byte-identically). Bare keyword after reminder-strip, anchored on the word alone like conspire.
 *
 * ⛔ FN-SAFE: the player loses access to the encode mode and never gains anything.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * cast-keyword strip entry removed -> every flip pin red; the keyword-only credit removed -> the
 * permanent-side pin red while the spells stay native (which is what proves the two halves are distinct).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectProgram } from "./effects/parser.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CIPHER_REMINDER = "Cipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)";
const LAST_THOUGHTS = { id: "c-lt", name: "Last Thoughts", type: "Sorcery", mana: "{3}{U}",
  oracle: `Draw a card.\n${CIPHER_REMINDER}` };
const SHADOW_SLICE = { id: "c-ss", name: "Shadow Slice", type: "Sorcery", mana: "{3}{B}",
  oracle: `Target opponent loses 3 life.\n${CIPHER_REMINDER}` };

describe("the keyword is credited, and the spell's own effect is untouched", () => {
  it("the carriers flip, each keeping its printed atom", () => {
    expect(classifyCard(LAST_THOUGHTS)).toBe("native-spell");
    expect((parseEffectProgram(LAST_THOUGHTS).atoms || []).map((a) => a.op)).toEqual(["draw"]);
    expect(classifyCard(SHADOW_SLICE)).toBe("native-spell");
    expect((parseEffectProgram(SHADOW_SLICE).atoms || []).map((a) => a.op)).toEqual(["lose-life"]);
  });

  it("⭐ ⛔ the reminder hides NO trigger — zero phantom descriptors", () => {
    // The load-bearing check for the "no mandatory rider" half of the criterion. The reminder contains a
    // full "Whenever that creature deals combat damage to a player…" sentence; if it leaked in, the card
    // would carry a trigger for an ability it never gained.
    expect(detectTriggers(LAST_THOUGHTS)).toEqual([]);
    expect(detectTriggers(SHADOW_SLICE)).toEqual([]);
  });

  it("the keyword-only credit covers the permanent-residue side", () => {
    expect(isKeywordOnly("Cipher")).toBe(true);
  });

  it("⛔ an UNMODELED sibling line still parks the card (the strip adds no permission)", () => {
    expect(classifyCard({ ...LAST_THOUGHTS, id: "c-x", name: "Odd Thoughts",
      oracle: `Interpret the omens however you like.\n${CIPHER_REMINDER}` })).toBe("arbiter-spell");
  });
});

describe("⛔ the line it sits beside — CHAMPION — stays on the OTHER side of the criterion", () => {
  it("champion is native because it is ENFORCED, not because it is declinable", () => {
    // Recorded here deliberately: these two keywords are both "you may", and they are credited for
    // OPPOSITE reasons. Champion's unpaid state sacrifices the creature, so it had to be modeled; cipher's
    // unpaid state changes nothing, so declining it is complete. If a future slice credits a keyword for
    // being declinable, this pair is the test to run it against.
    expect(classifyCard({ id: "c-tt", name: "Thoughtweft Trio", type: "Creature — Kithkin Soldier", mana: "{4}{W}",
      power: 3, toughness: 3,
      oracle: "First strike, vigilance\nChampion a Kithkin (When this enters, sacrifice it unless you exile another Kithkin you control. When this leaves the battlefield, that card returns to the battlefield.)" }))
      .toBe("native-body");
  });
});
