/**
 * cloneAndOptionalCounter.test.js — two tiny coverage extensions (overnight grind batch).
 *
 * 1) CLONE COST-KEYWORD PRE-STRIP: classifyCard's clone gate feeds isCloneCard a cost-only-keyword-stripped
 *    oracle, so a "Plot {cost}" (Visage Bandit) / Convoke / Affinity line no longer makes parseCloneSpec
 *    require the whole oracle be the copy clause. Cost-only keywords hard-cast at full cost (CREED-safe).
 *    Flip: Visage Bandit body-only → native-clone.
 * 2) OPTIONAL OWN-SIDE +1/+1 COUNTER: the counter-placement parser now models "on up to one target creature
 *    you control" (creatureYouControl + optionalTarget) — the combination of the two existing branches.
 *    Flip-diff GAINED: Essence Capture, Closing Statement, Combat Tutorial, The Art of Tea. LOST = 0.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

const C = (name, oracle, type) => ({ name, oracle, type, keywords: [], mana: "" });

describe("CLONE cost-keyword pre-strip — a Plot clone flips native-clone", () => {
  it("Visage Bandit (copy-clause creature + Plot) is native-clone", () => {
    const card = C(
      "Visage Bandit",
      "You may have Visage Bandit enter the battlefield as a copy of a creature you control, except it's a Shapeshifter Rogue in addition to its other types.\nPlot {2}{U} (You may pay {2}{U} and exile this card from your hand as a sorcery. Cast it as a sorcery on a later turn without paying its mana cost.)",
      "Creature — Shapeshifter Rogue",
    );
    expect(classifyCard(card)).toBe("native-clone");
  });

  it("CREED guard: a NON-clone creature carrying Plot does NOT become a clone", () => {
    // Stripping Plot must not manufacture a clone out of a card that has no copy clause.
    const card = C("Plot Ranger", "Plot {1}{G}\nWhenever this creature attacks, exile the top card of your library and you may play it this turn.", "Creature — Elf Ranger");
    expect(classifyCard(card)).not.toBe("native-clone");
  });
});

describe("OPTIONAL own-side +1/+1 counter — 'on up to one target creature you control'", () => {
  it("Essence Capture (counter a creature spell + optional own +1/+1 counter) is native-spell", () => {
    expect(classifyCard(C("Essence Capture", "Counter target creature spell. Put a +1/+1 counter on up to one target creature you control.", "Instant"))).toBe("native-spell");
  });

  it("CREED guard: an unmodeled counter-placement filter stays non-native", () => {
    // "on up to one target creature an opponent controls" is NOT a modeled placement → the spell stays Arbiter.
    expect(classifyCard(C("Fake Capture", "Counter target creature spell. Put a +1/+1 counter on up to one target creature an opponent controls.", "Instant"))).not.toMatch(/^native/);
  });
});
