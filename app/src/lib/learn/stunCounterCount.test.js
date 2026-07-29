/**
 * stunCounterCount.test.js — the stun rider parses its COUNT (CR 122.1c), not just "a".
 *
 * Found by probe-vocabulary-asymmetry.mjs's counter-placement family. The runtime has had full stun support
 * all along — gameState.untapOrConsumeStun implements CR 122.1c exactly (a tapped permanent with a stun
 * counter does not untap; one counter is removed instead), and applyTapEffect already passed
 * `amount: atom.stunCounter` straight to addCounter. Only the TEXT said "a".
 *
 * So N counters = N skipped untap steps, with no new runtime behaviour claimed: three counters keep the
 * creature down for three of its controller's untap steps and then it untaps normally.
 *
 * ⚠️ AND THE COUNT LIVES IN TWO PLACES THAT MUST MOVE TOGETHER. Widening only the matcher changed NOTHING,
 * because splitClauses had already torn "put three stun counters on it" off into its own clause — where the
 * pronoun has nothing to bind to and the card parks. The matcher never saw the whole sentence. Same shape as
 * the tutor destination's three whitelists: every layer looked right in isolation.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";

const atomOf = (clause) => parseEffectClause(clause, "Instant", { hasX: false })?.atoms?.[0] || null;

describe("⭐ the count is parsed", () => {
  it("the singular form is unchanged (stun 1)", () => {
    expect(atomOf("tap target creature an opponent controls and put a stun counter on it"))
      .toMatchObject({ op: "tap", stunCounter: 1 });
  });

  it("⭐ two and three counters ride the same atom", () => {
    expect(atomOf("tap target creature an opponent controls and put two stun counters on it"))
      .toMatchObject({ op: "tap", stunCounter: 2 });
    expect(atomOf("tap target creature an opponent controls and put three stun counters on it"))
      .toMatchObject({ op: "tap", stunCounter: 3 });
  });

  it("the up-to-N target form carries its own count too", () => {
    expect(atomOf("tap up to one target creature and put three stun counters on it"))
      .toMatchObject({ op: "tap", optionalTarget: true, stunCounter: 3 });
  });
});

describe("⛔ THE SPLITTER IS HALF THE FIX — the half that made the other half a no-op", () => {
  it("⭐ the whole tap-and-stun sentence stays ONE clause at every count", () => {
    // With the splitter's anchor still hardcoded to "a stun counter", the multi-count sentence split into
    // ["Tap target creature…", "put three stun counters on it"] and the pronoun had nothing to bind to.
    // The matcher was already widened at that point and it changed nothing.
    for (const n of ["a", "two", "three"]) {
      const s = `Tap target creature an opponent controls and put ${n} stun counter${n === "a" ? "" : "s"} on it.`;
      expect(splitClauses(s), s).toHaveLength(1);
    }
  });

  it("CONTROL — a genuinely separate following sentence still splits off", () => {
    // The fold must not swallow the rest of the card. Freeze in Place's "Scry 2." is its own clause.
    expect(splitClauses("Tap target creature an opponent controls and put three stun counters on it. Scry 2."))
      .toHaveLength(2);
  });
});

describe("⛔ CREED — the anchor stays tight", () => {
  it("⛔ an unlisted count parks rather than guessing", () => {
    expect(atomOf("tap target creature an opponent controls and put four stun counters on it")).toBeNull();
  });

  it("⛔ a stun placement with no tap is not this atom", () => {
    // "put a stun counter on target creature" alone has no tap to ride, and the pronoun form has no
    // referent — both stay out rather than inventing a tap.
    expect(atomOf("put a stun counter on target creature")).toBeNull();
  });
});

describe("tier", () => {
  it("⭐ Freeze in Place flips arbiter-spell → native-spell", () => {
    expect(classifyCard({ name: "Freeze in Place", type: "Sorcery", mana: "{2}{U}",
      oracle: "Tap target creature an opponent controls and put three stun counters on it.\nScry 2." }))
      .toBe("native-spell");
  });

  it("CONTROL — Gilded Scuttler (the singular form) was already native and stays native", () => {
    expect(classifyCard({ name: "Gilded Scuttler", type: "Creature — Lizard", mana: "{3}{U}", power: "3", toughness: "3",
      oracle: "This creature can't be blocked.\nWhen this creature enters, tap target creature an opponent controls and put a stun counter on it." }))
      .toBe("native-trigger");
  });
});
