/**
 * triggerEffectTailStrip.test.js — the residue chain's trigger strip stops guessing.
 *
 * Every residue chain in coverage.js removed trigger sentences with `…(When|Whenever|At)\b[^.]+\.` —
 * and `[^.]+` stops at the FIRST period. A trigger whose EFFECT spans sentences (Adaptive Omnitool's
 * "look at the top six… You may reveal… Put the rest on the bottom…") was therefore verified as fully
 * modeled and then left its 2nd and 3rd sentences behind as APPARENT residue, sinking a card every piece
 * of which is understood. The hand-written tails that accumulated above it — the entering-pronoun pump,
 * the reflexive "if you do", the optional-payment "when you do" — are each a special case of that one
 * wrong assumption. detectTriggers already folded the whole effect into `effectClause`; strip what it
 * names.
 *
 * ⚠️ MY FIRST LICENCE FOR THIS WAS WRONG, and four FP pins caught it. I claimed
 * allTriggerSentencesModeled had already proved every sentence parses HIGH, so stripping was free. It
 * hasn't: that gate passes for some triggers whose folded follow-up is unmodeled, and for those cards
 * THE RESIDUE CHECK IS THE ONLY GUARD. The real licence is per descriptor — `triggerRoutesNatively(d)`.
 * A trigger whose follow-up drags its program LOW doesn't route, isn't stripped, keeps its residue, and
 * parks its card, exactly as before.
 *
 * ⚠️ AND THE SECOND BUG WAS ONE THIS FILE HAD ALREADY SHIPPED ONCE. `\s` matches a NEWLINE, so the
 * strip swallowed the line break and welded the NEXT oracle line onto the stripped one, hiding it —
 * Drowner of Hope credited native with a real unmodeled ability on it. tokenAbilityGrantResidue.test.js
 * pins that exact card for that exact reason, from a previous author's previous attempt. Horizontal
 * whitespace only, now, on both sides and inside the sentence.
 *
 * Corpus effect, measured per card with scripts/tier-snapshot.mjs: GAINED 49 · LOST 0 · RETIERED 0.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";

const C = (name, type, oracle) => ({ name, type, oracle, mana: "{2}", keywords: [] });

describe("the general case — a trigger whose EFFECT spans sentences", () => {
  it("THE LOAD-BEARING ONE — Adaptive Omnitool's three-sentence dig no longer reads as residue", () => {
    expect(classifyCard(C("Adaptive Omnitool", "Artifact — Equipment",
      "Equipped creature gets +1/+1 for each artifact you control.\nWhenever equipped creature attacks, look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nEquip {3}")))
      .toMatch(/^native/);
  });

  it("a two-sentence ETB effect on an ordinary creature flips too", () => {
    expect(classifyCard(C("Voldaren Epicure", "Creature — Vampire",
      "When this creature enters, it deals 1 damage to each opponent. Create a Blood token.")))
      .toMatch(/^native/);
  });
});

describe("the licence — per-descriptor routing (belt-and-suspenders, MEASURED as inert today)", () => {
  // ⚠️ SAID PLAINLY SO IT ISN'T MISREAD AS A GUARD: removing the `triggerRoutesNatively` line leaves the
  // full suite green and the corpus tier-diff at ZERO cards. The three cards that first caught its
  // absence all had stale premises. It stays because the hazard is real — allTriggerSentencesModeled
  // does NOT imply the effect routes — but nothing in the index exercises it, and these two assertions
  // pass with or without it. The NEWLINE block below is what actually holds the line.

  it("a trigger whose follow-up is UNMODELED does not route, so nothing is stripped and the card parks", () => {
    // Recon Craft Theta's shape: a 0/0 token then a +1/+1 counter rider. Firing only the token leaves a
    // 0/0 that dies to SBA, which is why the whole thing must route or none of it.
    const card = C("Recon Craft", "Creature — Beast",
      "When this creature enters, create a 0/0 blue Alien creature token. Put a +1/+1 counter on it.");
    expect(detectTriggers(card).every(triggerRoutesNatively)).toBe(false);
    expect(classifyCard(card)).toBe("body-only");
  });

  it("…and one whose follow-up IS modeled routes, so the strip is licensed", () => {
    const card = C("Drawer", "Creature — Beast", "When this creature enters, draw a card. You may discard a card.");
    expect(detectTriggers(card).every(triggerRoutesNatively)).toBe(true);
    expect(classifyCard(card)).toMatch(/^native/);
  });
});

describe("⚠️ THE NEWLINE — the FP this file already shipped once", () => {
  it("THE PIN — a following LINE stays visible; Drowner of Hope keeps its unmodeled ability", () => {
    // `\s` matches a newline. Swallowing it welds the NEXT line onto the stripped one and hides it: the
    // "Sacrifice an Eldrazi Scion: Tap target creature." ability vanishes from the residue and the card
    // is credited native with a real unmodeled ability on board. Restore `\s` in the strip and this goes
    // red — which is how it was caught the second time, too.
    expect(classifyCard({
      name: "Drowner of Hope", type: "Creature — Eldrazi", mana: "{5}{U}", power: "5", toughness: "5", keywords: [],
      oracle: 'Devoid (This card has no color.)\nWhen this creature enters, create two 1/1 colorless Eldrazi Scion creature tokens. They have "Sacrifice this token: Add {C}."\nSacrifice an Eldrazi Scion: Tap target creature.',
    })).not.toMatch(/^native/);
  });

  it("a following line that is genuinely unmodeled still parks the card", () => {
    expect(classifyCard(C("Two Liner", "Creature — Beast",
      "When this creature enters, draw a card. You may discard a card.\nChoose a card name at random from outside the game.")))
      .toBe("body-only");
  });
});

describe("CREED — the strip is conservative where it can't be sure", () => {
  it("a SENTINEL-rewritten effectClause simply doesn't match, and the card keeps its old verdict", () => {
    // Event-specific rewrites ("put that many lifegain +1/+1 counters on this creature") no longer
    // resemble their printed text, so the replace never fires — no strip, no change, no risk.
    const sunbond = C("Sunbond", "Enchantment — Aura",
      'Enchant creature\nEnchanted creature has "Whenever you gain life, put that many +1/+1 counters on this creature."');
    expect(classifyCard(sunbond)).toBe("native-trigger");   // unchanged: it never needed the strip
  });

  it("a trigger with a single-sentence effect is untouched (nothing past the first sentence to strip)", () => {
    expect(classifyCard(C("Simple", "Creature — Beast", "When this creature enters, draw a card."))).toBe("native-trigger");
  });
});
