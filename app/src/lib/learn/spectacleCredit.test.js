/**
 * spectacleCredit.test.js — SPECTACLE (CR 702.137a) credited on the PERMANENT side.
 * Blade Juggler · Hackrobat · Spawn of Mayhem · Spikewheel Acrobat.
 *
 * CR 702.137a: "You may pay [cost] rather than pay this spell's mana cost if an opponent lost life this
 * turn." A pure ALTERNATIVE COST — the card is fully castable at its printed cost and the permanent that
 * results is identical, so the unoffered alt entry is a missing OPTION, never a mis-resolution. That is the
 * same rationale coverage.js already applies to foretell / blitz / freerunning / madness / ninjutsu.
 *
 * ⭐ THE KEYWORD WAS ALREADY HANDLED ON THE SPELL SIDE (it sits in CAST_KEYWORD_LINE over in
 * textNormalize.js) — nothing credited it on the PERMANENT side, so an ordinary creature printing it parked
 * on the keyword line alone while its body was fully modelled. Handled-over-there is not handled-here.
 *
 * ⛔ ESCAPE IS DELIBERATELY NOT INCLUDED. Its cost is compound ("Escape—{2}{B}, Exile two other cards from
 * your graveyard.") and isKeywordOnly splits on commas BEFORE testing, so no whole-line pattern can match
 * it; crediting the bare "exile two other cards from your graveyard" fragment would credit a real effect.
 * It needs the line removed before the split — a different change, and 5 permanents wait on it.
 */
import { describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

// Real printed oracles, READ OUT OF THE SNAPSHOT.
// ⚠️ A first draft typed these from memory and got three of three wrong: Spawn of Mayhem's rider is
// "if YOU have 10 or less life" (not an opponent), Hackrobat's second ability is +2/-2 (not trample), and
// Blade Juggler costs {4}{B}. That is the THIRD time in this session that recalled card text failed a test
// it had no business failing. Fixtures come from the snapshot, always.
const BLADE_JUGGLER = { name: "Blade Juggler", type: "Creature — Human Rogue", power: "3", toughness: "2", mana: "{4}{B}",
  oracle: "Spectacle {2}{B} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nWhen this creature enters, it deals 1 damage to you and you draw a card." };
const HACKROBAT = { name: "Hackrobat", type: "Creature — Human Rogue", power: "2", toughness: "3", mana: "{1}{B}{R}",
  oracle: "Spectacle {B}{R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\n{B}: This creature gains deathtouch until end of turn.\n{R}: This creature gets +2/-2 until end of turn." };
const SPAWN_OF_MAYHEM = { name: "Spawn of Mayhem", type: "Creature — Demon", power: "4", toughness: "4", mana: "{2}{B}{B}",
  oracle: "Spectacle {1}{B}{B} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nFlying, trample\nAt the beginning of your upkeep, this creature deals 1 damage to each player. Then if you have 10 or less life, put a +1/+1 counter on this creature." };

describe("⭐ SPECTACLE is credited on the permanent side", () => {
  it("the bare cost clause is keyword-only", () => {
    expect(isKeywordOnly("spectacle {2}{b}")).toBe(true);
    expect(isKeywordOnly("spectacle {b}{r}")).toBe(true);
  });

  it("the carriers flip on their own bodies", () => {
    expect(classifyCard(BLADE_JUGGLER)).toBe("native-trigger");
    expect(classifyCard(HACKROBAT)).toBe("native-activated");
    expect(classifyCard(SPAWN_OF_MAYHEM)).toBe("native-trigger");
  });
});

describe("⛔ the credit is the COST LINE only", () => {
  it("a spectacle-REFERENCING clause is not credited", () => {
    // Only the printed "Spectacle {cost}" entry is vacuous. A rules-text mention is real text.
    expect(isKeywordOnly("whenever you cast a spell for its spectacle cost, draw a card")).toBe(false);
    expect(isKeywordOnly("spells you cast have spectacle {1}")).toBe(false);
  });

  it("an UNMODELED body still parks the card — the credit is not a licence", () => {
    const residue = { ...BLADE_JUGGLER, name: "Fake Juggler",
      oracle: "Spectacle {2}{B} (reminder)\nConsult an oracle and interpret its riddle however you like." };
    expect(classifyCard(residue)).not.toMatch(/^native/);
  });

  it("✅ ESCAPE graduated — credited by whole-LINE removal (escapeLineCredit.test.js)", () => {
    // A BOUNDARY MARKER re-pointed, not deleted: this file recorded "the clause split defeats it", which was
    // true of a CLAUSE-level pattern. The fix removes the LINE before the split, so the marker moves.
    expect(isKeywordOnly("escape—{2}{b}, exile two other cards from your graveyard")).toBe(true);
  });
});
