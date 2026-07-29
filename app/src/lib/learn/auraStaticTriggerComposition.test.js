/**
 * auraStaticTriggerComposition.test.js — ⛔ THE COMPOSITION WAS A FALSE POSITIVE. This file pins the
 * REFUSAL now, and the reason, so nobody re-flips these cards on the same reasoning.
 *
 * The original slice composed an Aura's STATIC half with its own TRIGGER half, each verified through its
 * own gate, and flipped ten cards. Its safety argument was "composed, not loosened — each half must pass
 * its own tier ON ITS OWN." That argument is precisely the flaw: **each half is verified on text the
 * composition INVENTED, and the runtime sees neither.** On the PRINTED card:
 *
 *   • `parseAuraBonus` is all-or-nothing and an aura-own trigger line is NOT on its skip list, so the
 *     static half is DROPPED — Elephant Guide's host stays 2/2, Griffin Guide grants no flying, and
 *     Failed Conversion's "-4/-4" (removal!) does nothing at all;
 *   • `checkDiesTriggers` never enqueues an aura-own dies trigger — the Aura leaves the battlefield with
 *     its host and is never scanned — so the token/draw never happens either. Measured: pendingTriggers 0.
 *
 * Seven cards were credited native while doing NEITHER thing: Elephant Guide, Griffin Guide, Most Wanted,
 * A-Most Wanted, Failed Conversion, Sleeper's Robe, Elder Mastery. All seven verified on a board (host P/T
 * unchanged, no keywords granted) rather than through the tier.
 *
 * ⭐ THREE OF THE ORIGINAL TEN SURVIVE, and the split is the useful part: Demonic Appetite, Mark of Fury
 * and Recumbent Bliss carry the AURA'S OWN upkeep/end-step trigger, which never references the enchanted
 * creature and so never poisons the bonus parse. Their statics genuinely apply (5/5, haste,
 * cantAttack/cantBlock). **The dividing line is whether the trigger keys on the ENCHANTED CREATURE.**
 *
 * To make the seven honestly native the ENGINE must change, not the metric: parseAuraBonus has to skip a
 * modeled aura-own host trigger, AND checkDiesTriggers has to scan auras attached to a dying creature (an
 * LKI walk — the Aura is already gone by then). Until both exist, they park.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAuraBonus } from "./staticAbilityParser.js";

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

describe("⛔ the COMBINATION does NOT classify — the runtime delivers neither half", () => {
  it("THE LOAD-BEARING ONE — Elephant Guide's shape parks, and its bonus is genuinely dropped", () => {
    const card = aura(`Enchant creature\n${PUMP}\n${DIES}`);
    expect(classifyCard(card)).toBe("body-only");
    expect(parseAuraBonus(card)).toHaveLength(0);   // the REASON — not the tier's opinion of it
  });

  it("order does not matter (trigger printed before the static) — still parked", () => {
    expect(classifyCard(aura(`Enchant creature\n${DIES}\n${PUMP}`))).toBe("body-only");
  });

  it("a keyword-grant static is no different (Sleeper's Robe shape)", () => {
    expect(classifyCard(aura("Enchant creature\nEnchanted creature has fear.\nWhenever enchanted creature deals combat damage to an opponent, you may draw a card."))).toBe("body-only");
  });

  it("⭐ THE DIVIDING LINE — an aura-own UPKEEP trigger doesn't touch the host, so it composes fine", () => {
    // Demonic Appetite's shape. The trigger never references the enchanted creature, so parseAuraBonus is
    // not poisoned and the +3/+3 really applies. That is why the refusal above is narrow, not a blanket ban.
    const ok = aura(`Enchant creature you control\n${PUMP}\nAt the beginning of your upkeep, sacrifice a creature.`);
    expect(parseAuraBonus(ok).length).toBeGreaterThan(0);
    expect(classifyCard(ok)).toMatch(/^native/);
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
