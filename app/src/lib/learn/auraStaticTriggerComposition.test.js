/**
 * auraStaticTriggerComposition.test.js — an Aura's STATIC half composed with its OWN TRIGGER half.
 *
 * ⭐ THIS FILE HAS BEEN A PARK-PIN AND A CREDIT, IN THAT ORDER, AND BOTH RECORDS STAY.
 *
 * The original slice composed the two halves — each verified through its own gate — and flipped ten cards.
 * It was REVERTED, correctly: each half had been verified on text the composition INVENTED, while the
 * runtime delivered NEITHER on the printed card. `parseAttachedBonus` is all-or-nothing and an aura-own
 * trigger line was not on its skip list, so the static half was dropped (Elephant Guide's host stayed 2/2,
 * Failed Conversion's -4/-4 — removal! — did nothing); and `checkDiesTriggers` never enqueued an aura-own
 * dies trigger, because the Aura is binned with its host before the scan (CR 704.5n) and the watcher sweep
 * is battlefield-only. Seven cards were credited native while doing neither thing.
 *
 * That refusal set explicit acceptance criteria: "To make the seven honestly native the ENGINE must change,
 * not the metric: parseAuraBonus has to skip a modeled aura-own host trigger, AND checkDiesTriggers has to
 * scan auras attached to a dying creature."
 *
 * 2026-08-01 — BOTH ENGINE HALVES LANDED, in that order, runtime first:
 *   1. checkDiesTriggers captures the Auras binned on the way in (from pendingLeaveEvents, before
 *      checkLeavesTriggers clears them) and offers them as trigger sources — CR 603.10a's look-back.
 *      Bequeathal went from drawing 0 to drawing 2 end-to-end. See auraHostDiesTrigger.test.js.
 *   2. parseAttachedBonus now skips a VALIDATOR-APPROVED aura-own trigger, on the same registry seam the
 *      ETB and granted-ability validators already use — so the bonus survives. Elephant Guide's host reads
 *      5/5 where it read 2/2.
 *
 * So the credit below is not the old argument re-run; it is the old argument's own conditions being met.
 * The runtime proof lives in qaShippedSlices.test.js (bonus applied AND the Elephant token created, on one
 * board, through the engine's real death path) — deliberately NOT in the tier's opinion of itself.
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

describe("✅ the COMBINATION classifies — and the bonus is genuinely kept", () => {
  it("THE LOAD-BEARING ONE — Elephant Guide's shape is native, and its bonus SURVIVES the parse", () => {
    const card = aura(`Enchant creature
${PUMP}
${DIES}`);
    expect(classifyCard(card)).toMatch(/^native/);
    // The REASON, not the tier's opinion of it. This assertion is the one that was 0 for the whole life of
    // the refusal; it is what the engine fix changed, and it is what makes the credit honest.
    expect(parseAuraBonus(card).length).toBeGreaterThan(0);
  });

  it("order does not matter (trigger printed before the static)", () => {
    const card = aura(`Enchant creature
${DIES}
${PUMP}`);
    expect(classifyCard(card)).toMatch(/^native/);
    expect(parseAuraBonus(card).length).toBeGreaterThan(0);
  });

  it("a keyword-grant static is no different (Sleeper's Robe shape)", () => {
    expect(classifyCard(aura("Enchant creature\nEnchanted creature has fear.\nWhenever enchanted creature deals combat damage to an opponent, you may draw a card."))).toMatch(/^native/);
  });

  it("⭐ THE OLD DIVIDING LINE IS GONE — an aura-own UPKEEP trigger composed before, and still does", () => {
    // Demonic Appetite's shape. It always worked, because its trigger never references the enchanted
    // creature and so never poisoned the bonus parse. Kept as the control: the fix widened the set that
    // composes, it did not change this one.
    const ok = aura(`Enchant creature you control
${PUMP}
At the beginning of your upkeep, sacrifice a creature.`);
    expect(parseAuraBonus(ok).length).toBeGreaterThan(0);
    expect(classifyCard(ok)).toMatch(/^native/);
  });
});

describe("CREED — composed, not loosened: each half still has to earn it", () => {
  it("an UNMODELED static parks the card even though the trigger is fine", () => {
    expect(classifyCard(aura(`Enchant creature\nEnchanted creature glorbulates each turn.\n${DIES}`))).not.toMatch(/^native/);
  });

  it("an UNROUTED trigger parks the card even though the static is fine", () => {
    // ⚠️ THE FIXTURE HERE WAS SWAPPED 2026-08-01. It used Forced Adaptation ("put a +1/+1 counter on
    // enchanted creature") on the comment's claim that the counter atom rejects target:'enchanted'. That
    // claim went STALE — the atom gained enchanted-referent support and nobody re-checked, so the guard was
    // silently asserting a card that had started working. Verified on a board before swapping: the bonus
    // applies (5/5) AND the upkeep counter really lands (6/6, counters {+1/+1: 1}).
    // The PROPERTY is unchanged and is now pinned with a trigger the engine genuinely cannot route.
    expect(classifyCard(aura(`Enchant creature
${PUMP}
When enchanted creature dies, its controller shuffles their graveyard into their library and loses 3 life.`))).not.toMatch(/^native/);
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
