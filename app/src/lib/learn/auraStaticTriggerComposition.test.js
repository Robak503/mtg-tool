/**
 * auraStaticTriggerComposition.test.js — an Aura whose STATIC half and TRIGGER half are each already
 * modeled, but whose COMBINATION was not.
 *
 * This is the residue census's "TWO-FLIP SIGNATURE": a tier COMPOSITION failure, not a missing mechanic.
 * Both gates were correct in isolation and neither knew about the other's half:
 *
 *     "Enchant creature / Enchanted creature gets +3/+3."                    -> native-aura
 *     "When enchanted creature dies, create a 3/3 green Elephant token."     -> native-trigger
 *     both together (Elephant Guide)                                        -> body-only  <-- the bug
 *
 * `permanentTriggersCovered`'s residue walk saw the static line as leftover text; `isNativeAura`'s residue
 * walk saw the trigger line the same way. Each refused for a reason that the other gate had already covered.
 *
 * COMPOSED, NOT LOOSENED — the whole safety argument. Nothing is relaxed: the static half must pass
 * `isNativeAura` ON ITS OWN (with the Enchant line restored, which that gate requires), and the trigger half
 * must pass `permanentTriggersCovered` ON ITS OWN. A card with an unmodeled static, an unrouted trigger, or
 * a third kind of line still fails whichever half owns it and stays on the Arbiter. The CREED's
 * all-or-nothing rule holds by construction rather than by a new gate, and the four CREED tests below are
 * what prove it rather than assert it.
 *
 * +10 corpus, every flip audited: Elephant Guide, Griffin Guide, Most Wanted (+A-), Failed Conversion,
 * Demonic Appetite, Elder Mastery, Mark of Fury, Recumbent Bliss, Sleeper's Robe. Each is a modeled static
 * plus a modeled trigger. Mark of Fury was named in the residue census's TWO-FLIP list, which is what
 * pointed here.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const aura = (oracle, over = {}) => ({ name: "Elephant Guide", type: "Enchantment — Aura", mana: "{2}{G}", keywords: [], ...over, oracle });

const PUMP = "Enchanted creature gets +3/+3.";
const DIES = "When enchanted creature dies, create a 3/3 green Elephant creature token.";

describe("each half classifies alone — the premise of the composition", () => {
  it("the STATIC half alone is a native aura", () => {
    expect(classifyCard(aura(`Enchant creature\n${PUMP}`))).toBe("native-aura");
  });

  it("the TRIGGER half alone is a native trigger", () => {
    expect(classifyCard(aura(`Enchant creature\n${DIES}`))).toMatch(/^native/);
  });
});

describe("the COMBINATION now classifies too", () => {
  it("Elephant Guide's shape flips", () => {
    expect(classifyCard(aura(`Enchant creature\n${PUMP}\n${DIES}`))).toMatch(/^native/);
  });

  it("order does not matter (trigger printed before the static)", () => {
    expect(classifyCard(aura(`Enchant creature\n${DIES}\n${PUMP}`))).toMatch(/^native/);
  });

  it("a keyword-grant static composes the same way (Sleeper's Robe shape)", () => {
    expect(classifyCard(aura("Enchant creature\nEnchanted creature has fear.\nWhenever enchanted creature deals combat damage to an opponent, you may draw a card."))).toMatch(/^native/);
  });
});

describe("CREED — composed, not loosened: each half still has to earn it", () => {
  it("an UNMODELED static parks the card even though the trigger is fine", () => {
    expect(classifyCard(aura(`Enchant creature\nEnchanted creature glorbulates each turn.\n${DIES}`))).not.toMatch(/^native/);
  });

  it("an UNROUTED trigger parks the card even though the static is fine (Forced Adaptation)", () => {
    // "put a +1/+1 counter on enchanted creature" is rejected by the counter atom parser (target:'enchanted'),
    // so the trigger never routes. The composition must not rescue it.
    expect(classifyCard(aura(`Enchant creature\n${PUMP}\nAt the beginning of your upkeep, put a +1/+1 counter on enchanted creature.`))).not.toMatch(/^native/);
  });

  it("a THIRD kind of line (an activated ability) still parks it", () => {
    expect(classifyCard(aura(`Enchant creature\n${PUMP}\n${DIES}\n{2}: Draw a card.`))).not.toMatch(/^native/);
  });

  it("an effect that NAMES THE DEAD CARD still parks (Demonic Vigor)", () => {
    // The referent hazard: "that card" is the dead host's graveyard card and nothing binds it. The effect
    // fails to parse, so the card parks rather than returning the wrong object.
    expect(classifyCard(aura(`Enchant creature\n${PUMP}\nWhen enchanted creature dies, return that card to its owner's hand.`))).not.toMatch(/^native/);
  });
});

describe("no regression — the single-half tiers are untouched", () => {
  it("a pure-static aura still lands on native-aura, not the composition path", () => {
    expect(classifyCard(aura("Enchant creature\nEnchanted creature gets +2/+2 and has flying."))).toBe("native-aura");
  });

  it("an aura with NO Enchant line is not claimed by this path", () => {
    expect(classifyCard(aura(`${PUMP}\n${DIES}`))).not.toBe("native-aura");
  });
});
