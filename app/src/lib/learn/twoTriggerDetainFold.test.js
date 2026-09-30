/**
 * twoTriggerDetainFold.test.js — the OLD two-trigger printing of detain (CR 610.3): Journey to Nowhere,
 * Oblivion Ring, Faceless Butcher, Petravark.
 *
 * ⭐ THE MECHANISM WAS ALREADY COMPLETE, for the MODERN one-sentence printing:
 *     "exile target creature an opponent controls UNTIL THIS CREATURE LEAVES THE BATTLEFIELD"
 * (Banisher Priest) — removal.js stamps `untilSourceLeaves`, zones.applyExileUntilLeaves links the card to
 * its source as a `detainedExile`, and checkLeavesTriggers synthesizes the return on ANY exit.
 *
 * The OLDER printing splits the IDENTICAL effect across two triggers:
 *     "When this enchantment enters, exile target creature."
 *     "When this enchantment leaves the battlefield, return the exiled card to the battlefield …"
 * Same rules meaning, different wording — and nothing recognised it, so real staples sat on the Arbiter
 * beside a mechanism built to run them.
 *
 * THE FOLD REWRITES PRINTING, NOT SEMANTICS: the enters-clause gains the "until this <type> leaves the
 * battlefield" tail so the EXISTING detain parser claims it, and the leaves-clause is DROPPED — because the
 * detain mechanism already synthesizes exactly that return. ⛔ KEEPING IT WOULD RETURN THE CARD TWICE, which
 * is why the trigger count is pinned at exactly 1 below rather than merely "native".
 *
 * ⛔ IT HAD TO BE APPLIED ON BOTH SIDES OF THE shaped===detected INVARIANT. Folding only in detectTriggers
 * left every carrier at body-only: coverage counted 2 printed trigger sentences against 1 detected
 * descriptor, mismatched, and parked the card. Measured — the cards read native-trigger in detection and
 * body-only in classification at the same moment, which is the tell for that invariant.
 *
 * ⛔ ALL-OR-NOTHING, AND BOTH HALVES MUST MATCH. A lone enters-exile is a PERMANENT exile; folding it would
 * silently hand the card back. A lone leaves-return has nothing to fold onto. An OPTIONAL exile
 * ("you may exile" — Fiend Hunter) was excluded here until 2026-09-30 (stage ③ · 21); it folds now, keeping
 * its "you may" — see the graduated pin below. All pinned.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied AND verified on the case under test): the
 * leaves-clause left in place instead of spliced out -> the exactly-one-trigger pin goes red (two triggers,
 * a double return); the fold removed from coverage's shaped count -> every flip pin goes red while
 * detection still reports one trigger.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, foldTwoTriggerDetain, _resetIdsForTests as _unusedReset } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests } from "./gameState.js";

void _unusedReset;
beforeEach(() => _resetIdsForTests());

const JOURNEY_TO_NOWHERE = { id: "c-jtn", name: "Journey to Nowhere", type: "Enchantment", mana: "{1}{W}",
  oracle: "When this enchantment enters, exile target creature.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control." };
const OBLIVION_RING = { id: "c-or", name: "Oblivion Ring", type: "Enchantment", mana: "{2}{W}",
  oracle: "When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return that card to the battlefield under its owner's control." };
const FACELESS_BUTCHER = { id: "c-fb", name: "Faceless Butcher", type: "Creature — Nightmare Horror", mana: "{2}{B}{B}",
  power: 2, toughness: 3, oracle: "When this creature enters, exile another target creature.\nWhen this creature leaves the battlefield, return that card to the battlefield under its owner's control." };

describe("the fold rewrites printing, not semantics", () => {
  it("⭐ produces the modern one-sentence detain text", () => {
    expect(foldTwoTriggerDetain(JOURNEY_TO_NOWHERE.oracle, JOURNEY_TO_NOWHERE))
      .toBe("When this enchantment enters, exile target creature until this enchantment leaves the battlefield.");
  });

  it("uses the SOURCE's own noun so the detain parser's alternation matches", () => {
    // A creature source must say "until this CREATURE leaves", not "enchantment".
    expect(foldTwoTriggerDetain(FACELESS_BUTCHER.oracle, FACELESS_BUTCHER)).toMatch(/until this creature leaves the battlefield\.$/);
  });

  it("⭐ ⛔ yields EXACTLY ONE trigger — a surviving leaves-clause would return the card twice", () => {
    const d = detectTriggers(JOURNEY_TO_NOWHERE);
    expect(d).toHaveLength(1);
    expect(d[0].event).toBe("etb");
    const atoms = parseEffectClause(d[0].effectClause, "Enchantment").atoms || [];
    expect(atoms).toHaveLength(1);
    expect(atoms[0]).toMatchObject({ op: "exile", untilSourceLeaves: true });
  });

  it("the carriers flip", () => {
    expect(classifyCard(JOURNEY_TO_NOWHERE)).toBe("native-trigger");
    expect(classifyCard(OBLIVION_RING)).toBe("native-trigger");
    expect(classifyCard(FACELESS_BUTCHER)).toBe("native-trigger");
  });
});

describe("⛔ all-or-nothing — a half-match is never folded", () => {
  it("a LONE enters-exile is a PERMANENT exile and must not gain a return", () => {
    const lone = "When this enchantment enters, exile target creature.";
    expect(foldTwoTriggerDetain(lone, { type: "Enchantment" })).toBe(lone);
  });

  it("a LONE leaves-return has nothing to fold onto", () => {
    const lone = "When this enchantment leaves the battlefield, return that card to the battlefield under its owner's control.";
    expect(foldTwoTriggerDetain(lone, { type: "Enchantment" })).toBe(lone);
  });

  // GRADUATED (the 09-06 plan's stage ③ · 21, 2026-09-30): this pinned "an OPTIONAL exile is excluded", on the claim
  // that "you may" makes it a different effect. The bundled rulings name the two ways the two-trigger printing differs
  // from the one-sentence frame — the source leaving before its enters-trigger resolves (Oblivion Ring 2007-10-01, Leonin
  // Relic-Warder 2011-06-01, Fiend Hunter 2018-12-07) — and they hold for the MANDATORY carriers this fold already claims;
  // none turns on the "you may". It rides into the folded sentence; fiendHunterOptionalDetain.test.js runs both answers.
  it("GRADUATED — an OPTIONAL exile folds too, keeping its \"you may\" (Fiend Hunter)", () => {
    const opt = "When this creature enters, you may exile another target creature.\nWhen this creature leaves the battlefield, return that card to the battlefield under its owner's control.";
    expect(foldTwoTriggerDetain(opt, { type: "Creature — Human" }))
      .toBe("When this creature enters, you may exile another target creature until this creature leaves the battlefield.");
  });

  it("a LONE optional enters-exile is still a permanent exile — never folded", () => {
    const lone = "When this creature enters, you may exile another target creature.";
    expect(foldTwoTriggerDetain(lone, { type: "Creature — Human" })).toBe(lone);
  });

  it("⛔ the MODERN one-sentence form is left exactly as printed (no double-fold)", () => {
    const modern = "When this creature enters, exile target creature an opponent controls until this creature leaves the battlefield.";
    expect(foldTwoTriggerDetain(modern, { type: "Creature — Human Cleric" })).toBe(modern);
    expect(classifyCard({ id: "c-bp", name: "Banisher Priest", type: "Creature — Human Cleric", mana: "{1}{W}{B}",
      power: 2, toughness: 2, oracle: modern })).toBe("native-trigger");
  });
});
