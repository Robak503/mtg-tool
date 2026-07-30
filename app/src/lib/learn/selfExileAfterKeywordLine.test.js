/**
 * selfExileAfterKeywordLine.test.js — the SELF-EXILE RETRY must look past a printed cast-keyword line.
 * Temporal Mastery (miracle) · Part the Waterveil (awaken) · Alrund's Epiphany (foretell).
 *
 * `stripSelfExileSentence` requires the "Exile <this>." sentence to be TRAILING. On these cards a vacuous
 * cast-keyword line prints AFTER the body:
 *
 *     "Take an extra turn after this one. Exile Temporal Mastery.
 *      Miracle {1}{U} (…)"
 *
 * …so the exile sentence is no longer last, the retry finds nothing, and the card parks with a body the
 * engine can otherwise resolve. Stripping the (already-vacuous) keyword line first restores the shape the
 * retry was written for.
 *
 * ⛔ SAFE BY CONSTRUCTION: the retry runs ONLY when the direct parse came back LOW, so no card that parses
 * today can change. It is an ORDERING fix, not a new permission — the same strip already runs downstream in
 * parseEffectClauseImpl.
 *
 * ⚠️ AND THE CAUSE WAS MISDIAGNOSED TWICE BEFORE IT WAS FOUND. First "the strip is never reached" (it is —
 * downstream). Then "stripReminder eats the newline, so the per-line anchor can't match" (a real property
 * of stripReminder, but a red herring here: parseEffectClauseImpl receives the raw multi-line oracle). The
 * measurement that settled it was ordering the SAME oracle two ways — keyword line last vs first — and
 * seeing only the trailing-exile arrangement parse.
 */
import { describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";

// Real printed oracles (bundled Scryfall snapshot).
const TEMPORAL_MASTERY = { name: "Temporal Mastery", type: "Sorcery", mana: "{4}{U}{U}",
  oracle: "Take an extra turn after this one. Exile Temporal Mastery.\nMiracle {1}{U} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" };
const PART_THE_WATERVEIL = { name: "Part the Waterveil", type: "Sorcery", mana: "{4}{U}{U}",
  oracle: "Take an extra turn after this one. Exile Part the Waterveil.\nAwaken 6—{6}{U}{U}{U} (If you cast this spell for {6}{U}{U}{U}, also put six +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It's still a land.)" };
const ALRUNDS_EPIPHANY = { name: "Alrund's Epiphany", type: "Sorcery", mana: "{5}{U}{U}",
  oracle: "Take an extra turn after this one. Create two 1/1 white Bird creature tokens with flying. Exile Alrund's Epiphany.\nForetell {4}{U}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" };

describe("⭐ the retry sees past a trailing cast-keyword line", () => {
  it("all three carriers flip to native-spell", () => {
    expect(classifyCard(TEMPORAL_MASTERY)).toBe("native-spell");
    expect(classifyCard(PART_THE_WATERVEIL)).toBe("native-spell");
    expect(classifyCard(ALRUNDS_EPIPHANY)).toBe("native-spell");
  });

  it("the program is the real body, and it is stamped selfExile", () => {
    const p = parseEffectProgram(TEMPORAL_MASTERY);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["extra-turn"]);
    // ⭐ The stamp is the point: GY-1 must EXILE the spell, not graveyard it. Losing the stamp while
    // gaining the parse would be a silent rules error on every one of these cards.
    expect(p.selfExile).toBe(true);
  });

  it("Alrund's Epiphany keeps its token half — the body is not truncated", () => {
    const p = parseEffectProgram(ALRUNDS_EPIPHANY);
    expect(p.atoms.map((a) => a.op)).toEqual(["extra-turn", "create-token"]);
    expect(p.selfExile).toBe(true);
  });

  it("ORDER-INDEPENDENT: the same card parses with the keyword line printed FIRST", () => {
    // The diagnostic that found the cause — only the trailing-exile arrangement used to parse.
    const flipped = { ...TEMPORAL_MASTERY,
      oracle: "Miracle {1}{U} (reminder)\nTake an extra turn after this one. Exile Temporal Mastery." };
    expect(programConfidence(parseEffectProgram(flipped))).toBe("high");
  });
});

describe("⛔ still all-or-nothing", () => {
  it("a card whose BODY is unmodeled stays parked even with the keyword line stripped", () => {
    const unmodeled = { ...TEMPORAL_MASTERY, name: "Fake Mastery",
      oracle: "Consult an oracle and interpret its riddle however you like. Exile Fake Mastery.\nMiracle {1}{U} (reminder)" };
    expect(classifyCard(unmodeled)).not.toMatch(/^native/);
  });

  it("no self-exile sentence → the retry does not fire", () => {
    const noExile = { ...TEMPORAL_MASTERY, name: "Fake Mastery 2",
      oracle: "Consult an oracle and interpret its riddle however you like.\nMiracle {1}{U} (reminder)" };
    expect(programConfidence(parseEffectProgram(noExile))).not.toBe("high");
  });
});
