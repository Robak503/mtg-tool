/**
 * castKeywordLineBlocksBody.test.js — a vacuous CAST-KEYWORD line ("Spectacle {B}", "Prowl {U}") sat in
 * front of a fully modeled body and hid it from every whole-oracle matcher (Drill Bit, Thieves' Fortune).
 *
 * THE CHAIN, because no single piece of it was the bug:
 *   1. a keyword line carries NO trailing period, so `\.\s+` never fires at the newline after it;
 *   2. `stripReminder` deliberately COLLAPSES whitespace — newlines included — so by the time the
 *      splitter runs, that line has no identity left and is welded onto the first body sentence
 *      ("Spectacle {B} Target player reveals their hand"), which matches nothing;
 *   3. and the whole-oracle collapses upstream never matched either, because they are `^`-anchored and
 *      the keyword line was still sitting at the front.
 * Cards whose body happens to be claimed by a collapse survived it anyway (Light Up the Stage welds
 * identically and is native), which is exactly why this read as card-specific rather than structural.
 *
 * THE FIX IS AN ORDERING FIX, in two places, and each half is worthless alone:
 *   · splitClauses strips cast-keyword lines from the RAW multi-line text BEFORE stripReminder collapses
 *     it — the anchors are `^…$` per line and only work while lines still exist;
 *   · parseEffectProgramInner joins them to the strip chain that already peels devoid / storm /
 *     self-cost-reduction, so the collapses see the body they were written for.
 *
 * ⛔ TWO MEASURED WRONG TURNS ARE RECORDED HERE BECAUSE BOTH LOOKED RIGHT:
 *   · doing it in the other order (`stripCastKeywordLines(stripReminder(x))`) makes the LINE-anchored
 *     pattern match the ENTIRE collapsed oracle and DELETE the card's whole body — splitClauses returned
 *     `[]`. It measured 0/0/0 only because every affected card was already parked;
 *   · stripCastKeywordLines BLANKS the line rather than removing it, so the body arrived as
 *     "\nTarget player reveals…" and the `^`-anchored matchers still saw nothing. The strip bought
 *     exactly zero until the leading blank went too. Half a fix here is worth nothing at all.
 *
 * Mutation-checked (2026-08-04, each verified applied): the parser-side strip removed -> both flip pins
 * go red; the leading-blank trim removed -> both flip pins go red (the strip alone does nothing).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DRILL_BIT = { id: "c-db", name: "Drill Bit", type: "Sorcery", mana: "{1}{B}",
  oracle: "Spectacle {B} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nTarget player reveals their hand. You choose a nonland card from it. That player discards that card." };
const THIEVES_FORTUNE = { id: "c-tf", name: "Thieves' Fortune", type: "Kindred Instant — Rogue", mana: "{2}{U}",
  oracle: "Prowl {U} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Rogue.)\nLook at the top four cards of your library. Put one of them into your hand and the rest into your graveyard." };

describe("the keyword line no longer welds onto the body", () => {
  it("⭐ Drill Bit splits into its three real clauses (the weld is gone)", () => {
    expect(splitClauses(DRILL_BIT.oracle)).toEqual([
      "Target player reveals their hand",
      "You choose a nonland card from it",
      "That player discards that card",
    ]);
  });

  it("both carriers flip, with the body's own atom intact", () => {
    expect(classifyCard(DRILL_BIT)).toBe("native-spell");
    expect((parseEffectProgram(DRILL_BIT).atoms || []).map((a) => a.op)).toEqual(["discard-chosen"]);
    expect(classifyCard(THIEVES_FORTUNE)).toBe("native-spell");
    expect((parseEffectProgram(THIEVES_FORTUNE).atoms || []).map((a) => a.op)).toEqual(["impulse-dig"]);
  });

  it("the cards that already worked are unchanged (they were rescued by a collapse, not by luck)", () => {
    expect(classifyCard({ id: "c-lu", name: "Light Up the Stage", type: "Sorcery", mana: "{2}{R}",
      oracle: "Spectacle {R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nExile the top two cards of your library. Until the end of your next turn, you may play those cards." })).toBe("native-spell");
    expect(classifyCard({ id: "c-sk", name: "Skewer the Critics", type: "Sorcery", mana: "{2}{R}",
      oracle: "Spectacle {R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nSkewer the Critics deals 3 damage to any target." })).toBe("native-spell");
  });

  it("⛔ an UNMODELED body behind a keyword line still parks (the strip adds no permission)", () => {
    expect(classifyCard({ ...DRILL_BIT, id: "c-x", name: "Odd Bit",
      oracle: "Spectacle {B}\nInterpret the omens however you like." })).toBe("arbiter-spell");
  });

  it("a card with NO keyword line is untouched", () => {
    const plain = { id: "c-p", name: "Plain Duress", type: "Sorcery", mana: "{B}",
      oracle: "Target player reveals their hand. You choose a nonland card from it. That player discards that card." };
    expect(programConfidence(parseEffectProgram(plain))).toBe("high");
    expect(classifyCard(plain)).toBe("native-spell");
  });
});
