/**
 * impulseExileClause.test.js — the impulse-exile effect could only be the WHOLE card. Beside any second
 * clause it dropped the entire spell to the Arbiter (Blazing Crescendo, Mjölnir's Might, Inspired
 * Tinkering — plus Molly Hayes's activated ability, which has the same shape inside one ability).
 *
 * THE CAUSE, isolated by combination rather than guessed at: "Exile the top N cards of your library.
 * Until the end of your next turn, you may play <them>." is owned by a WHOLE-ORACLE collapse
 * (matchImpulseExilePlay in parseEffectClauseImpl) that returns a program of exactly ONE atom. So it fired
 * only when the impulse was the entire effect — Reckless Impulse and Light Up the Stage parsed, and the
 * same clause next to a pump, a damage clause, or a treasure clause parsed to LOW with ZERO atoms. Proven
 * in BOTH orders (impulse-first and impulse-last both failed), so it was never about sequence, and against
 * a control (pump + draw parses HIGH), so multi-clause spells were never the problem.
 *
 * ⛔ THE COLLAPSE'S OWN STATED REASON IS STALE, and that is what makes this a fix rather than a second
 * copy of a grammar. Its comment says the two-sentence effect "would shatter under the clause splitter
 * (each half is individually unmatchable), so it's collapsed up front." True when written. Not true since
 * the 2026-08-01 two-sentence FOLD in splitClauses, which re-joins "Until the end of your next turn, you
 * may play …" onto "Exile the top N cards of your library" — verified here, because a premise that load-
 * bearing should be pinned rather than trusted. The splitter hands the clause over WHOLE, so the SAME
 * matcher now matches it per-clause. No new grammar, no widened anchor; the collapse still runs first.
 *
 * Mutation-checked (2026-08-03, verified applied): the per-clause matcher call removed -> all three
 * multi-clause spells and the Molly pin go red, while the two single-clause carriers stay green (which is
 * the point — those go through the collapse and must be untouched).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const IMPULSE_1 = "Exile the top card of your library. Until the end of your next turn, you may play that card.";
const BLAZING_CRESCENDO = { id: "c-bc", name: "Blazing Crescendo", type: "Instant", mana: "{1}{R}",
  oracle: `Target creature gets +3/+1 until end of turn.\n${IMPULSE_1}` };
const MJOLNIRS_MIGHT = { id: "c-mm", name: "Mjölnir's Might", type: "Sorcery", mana: "{2}{R}",
  oracle: `Mjölnir's Might deals 4 damage to target player.\n${IMPULSE_1}` };
const INSPIRED_TINKERING = { id: "c-it", name: "Inspired Tinkering", type: "Sorcery", mana: "{3}{R}",
  oracle: "Exile the top three cards of your library. Until the end of your next turn, you may play those cards.\nCreate three Treasure tokens." };
// The two single-clause carriers the WHOLE-ORACLE collapse owns — they must not move.
const RECKLESS_IMPULSE = { id: "c-ri", name: "Reckless Impulse", type: "Sorcery", mana: "{1}{R}",
  oracle: "Exile the top two cards of your library. Until the end of your next turn, you may play those cards." };

describe("the splitter premise this fix rests on", () => {
  it("⭐ splitClauses hands the two-sentence impulse over WHOLE, both alone and after another clause", () => {
    // The collapse's comment claims each half is individually unmatchable and must be collapsed up front.
    // That was true before the 2026-08-01 two-sentence fold; pinned here because the whole fix depends on
    // it still holding.
    expect(splitClauses(IMPULSE_1)).toEqual(["Exile the top card of your library. Until the end of your next turn, you may play that card"]);
    expect(splitClauses(BLAZING_CRESCENDO.oracle)).toEqual([
      "Target creature gets +3/+1 until end of turn",
      "Exile the top card of your library. Until the end of your next turn, you may play that card",
    ]);
  });
});

describe("recognition — impulse composes with a second clause, in either order", () => {
  it("the three multi-clause carriers flip to native-spell", () => {
    expect(classifyCard(BLAZING_CRESCENDO)).toBe("native-spell");
    expect(classifyCard(MJOLNIRS_MIGHT)).toBe("native-spell");
    expect(classifyCard(INSPIRED_TINKERING)).toBe("native-spell");   // impulse FIRST, treasure second
  });

  it("the program carries BOTH atoms — the impulse is composed, not swallowed", () => {
    const p = parseEffectProgram(BLAZING_CRESCENDO);
    expect(programConfidence(p)).toBe("high");
    expect((p.atoms || []).map((a) => a.op)).toEqual(["pump", "impulse-exile"]);
    const q = parseEffectProgram(INSPIRED_TINKERING);
    expect((q.atoms || []).map((a) => a.op)[0]).toBe("impulse-exile");   // and it works impulse-first
  });

  it("the count rides through (three cards, not one)", () => {
    const p = parseEffectProgram(INSPIRED_TINKERING);
    expect(p.atoms.find((a) => a.op === "impulse-exile")).toMatchObject({ count: 3 });
  });

  it("⛔ the single-clause carriers the COLLAPSE owns are untouched", () => {
    expect(classifyCard(RECKLESS_IMPULSE)).toBe("native-spell");
    const p = parseEffectProgram(RECKLESS_IMPULSE);
    expect((p.atoms || []).map((a) => a.op)).toEqual(["impulse-exile"]);
  });

  it("⛔ an UNMODELED second clause still parks the spell (nothing is loosened)", () => {
    expect(classifyCard({ id: "c-x", name: "Odd Crescendo", type: "Instant", mana: "{1}{R}",
      oracle: `Interpret the omens however you like.\n${IMPULSE_1}` })).toBe("arbiter-spell");
  });
});

describe("the same shape inside an ACTIVATED ability (Molly Hayes, Runaway)", () => {
  const MOLLY = { id: "c-mh", name: "Molly Hayes, Runaway", type: "Legendary Creature — Mutant Hero", mana: "{2}{R}", power: "2", toughness: "2",
    oracle: "Power-up — {5}{R}: Put two +1/+1 counters on Molly Hayes. Exile the top card of your library. Until the end of your next turn, you may play that card. (Activate each power-up ability only once. Reduce the cost by her mana cost if she entered this turn.)" };

  it("her ability's effect composes both atoms and the whole card flips", () => {
    const abs = parseActivatedAbilities(MOLLY);
    expect(abs).toHaveLength(1);
    expect(abs[0].modeled).toBe(true);
    expect((abs[0].program?.atoms || []).map((a) => a.op)).toEqual(["add-counter", "impulse-exile"]);
    expect(classifyCard(MOLLY)).toBe("native-activated");
  });

  it("⭐ and her once-per-GAME power-up limit survives the credit (the FP a composed effect could hide)", () => {
    // Crediting an ability whose activation limit went unenforced would make the card materially stronger
    // than printed. The limit lives ONLY in reminder text, so it is worth asserting here rather than
    // assuming the parser kept it (powerUpKeyword.test.js owns the enforcement itself).
    expect(parseActivatedAbilities(MOLLY)[0].activationLimit).toBe(1);
  });
});
