/**
 * escapeToTheWilds.test.js — ESCAPE TO THE WILDS (2026-08-14), the "cards exiled this way" referent.
 * "Exile the top five cards of your library. You may play cards exiled this way until the end of
 * your next turn.\nYou may play an additional land this turn."
 *
 * ⭐ A REFERENT widening, not a new machine. The extended-window impulse (CR 611.2a, owner+stamp
 * expiry) was built for "them / those cards" referents (impulseExtendedWindow.test.js, 11 witnesses);
 * Escape prints the FOURTH referent form — "cards exiled this way" — which is the same just-exiled
 * set. Two regexes name the referents and BOTH had to widen (unlisted-=-dropped, instance by rote):
 * the templateMatchers extended arm AND the splitClauses keep-whole fold — the splitter severs the
 * two sentences before the matcher ever sees them joined, so widening only the matcher flips nothing.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · templateMatchers referent reverted → the joined clause parses null (card parks).
 *   · splitClauses fold referent reverted → the splitter severs; classify falls to arbiter-spell.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text, both lines).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";

const ESCAPE = { name: "Escape to the Wilds", type: "Sorcery", mana: "{3}{R}{G}", keywords: [],
  oracle: "Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn.\nYou may play an additional land this turn." };

describe("the carrier and the referent", () => {
  it("⭐ Escape to the Wilds flips native-spell; the program is [impulse-exile ×5 extended, extra land]", () => {
    expect(classifyCard(ESCAPE)).toBe("native-spell");
    const p = parseEffectProgram(ESCAPE);
    expect(p.confidence).toBe("high");
    const row = p.atoms.map((a) => a.op);
    console.log("  WITNESS escapeToTheWilds", JSON.stringify({ ops: row, count: p.atoms[0].count, extended: p.atoms[0].extendedWindow })); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual(["impulse-exile", "play-extra-land-this-turn"]);
    expect(p.atoms[0]).toMatchObject({ count: 5, extendedWindow: true });
  });

  it("⭐ the splitter KEEPS the impulse pair whole under the new referent (the second site)", () => {
    const clauses = splitClauses("Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn.\nYou may play an additional land this turn.");
    expect(clauses).toEqual([
      "Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn",
      "You may play an additional land this turn",
    ]);
  });

  it("⛔ the referent stays window-scoped: 'cards exiled this way' WITHOUT the next-turn tail still severs", () => {
    // "…this turn" printings with this referent are a different (unadmitted) wording — the fold's
    // anchor requires the extended tail, so the plain form must NOT ride in on this widening.
    const clauses = splitClauses("Exile the top three cards of your library. You may play cards exiled this way this turn.");
    expect(clauses).toEqual([
      "Exile the top three cards of your library",
      "You may play cards exiled this way this turn",
    ]);
  });
});
