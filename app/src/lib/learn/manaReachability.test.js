/**
 * manaReachability.test.js — the native-mana tier must mean the engine can actually GET the mana (slice 38).
 *
 * `hasManaAbility` is a TEXT check: it sees "Add {G}" and says yes. The runtime produces mana through
 * `manaProduction`, which refuses anything that is not a standing source. Crediting on text alone tiered
 * 154 cards native-mana whose mana the engine cannot obtain BY ANY PATH.
 *
 * HOW THAT WAS ESTABLISHED, because the first attempt got it wrong: `manaProduction` returning null is NOT
 * the same question. It only answers "is this a standing source". Burning-Tree Emissary returns null there
 * and yet genuinely delivers {R}{G} — through its ETB trigger. The honest test is to put the card on a
 * board and ask whether the mana can be obtained by ANY path: manaSources, an offered ability, or a trigger
 * that resolves. Measured that way the count was 154, and after this gate it is 0.
 *
 * WHAT THIS IS NOT: it does not delete the triggered-mana cards. They fall through to the trigger tier,
 * where they belong — the mana is real, it is simply not a standing source. 15 cards reclassified that way
 * (13 native-trigger, 2 native-mixed) and 142 were genuinely dropped.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { manaProduction } from "./manaModel.js";

const card = (o) => ({ keywords: [], ...o });

describe("cards the engine CANNOT tap are no longer tiered native-mana", () => {
  it("a COSTED activation (non-mana cost item)", () => {
    expect(classifyCard(card({ name: "Goblin Clearcutter", type: "Creature — Goblin", mana: "{2}{R}", power: 3, toughness: 3,
      oracle: "{T}, Sacrifice a Forest: Add three mana in any combination of {R} and/or {G}." }))).not.toBe("native-mana");
  });
  it("a DYNAMIC amount", () => {
    expect(classifyCard(card({ name: "Everflowing Chalice", type: "Artifact", mana: "{0}",
      oracle: "{T}: Add {C} for each charge counter on this artifact." }))).not.toBe("native-mana");
  });
  it("a COLOUR chosen as the permanent entered", () => {
    expect(classifyCard(card({ name: "Coldsteel Heart", type: "Artifact", mana: "{2}",
      oracle: "This artifact enters tapped.\nAs this artifact enters, choose a color.\n{T}: Add one mana of the chosen color." }))).not.toBe("native-mana");
  });
  it("⭐⭐ RE-POINTED — tap-OTHER is a cost the engine CAN pay now; the unpayable ones still refuse", () => {
    // This file's subject is REACHABILITY: a card is credited native-mana only when the sim can actually pay
    // the cost. Heritage Druid was the tap-OTHER example, and the guard it stood for said why — "the sim
    // doesn't tap the other Elves". It does now: manaSources resolves real untapped payers off the board and
    // refuses to offer the source without them, and commitManaTap taps them. So the card is reachable, and
    // this assertion flips rather than weakens.
    expect(classifyCard(card({ name: "Heritage Druid", type: "Creature — Elf Druid", mana: "{G}", power: 1, toughness: 1,
      oracle: "Tap three untapped Elves you control: Add {G}{G}{G}." }))).toBe("native-mana");

    // ⛔ AND THE FILE'S CLAIM IS UNCHANGED for every cost that is still unreachable. These are the stand-ins
    // now: a FINITE counter pool the sim would treat as infinite, and a non-self sacrifice it never spends.
    expect(classifyCard(card({ name: "Sphere-like", type: "Artifact", mana: "{2}",
      oracle: "{T}, Remove a charge counter from this artifact: Add one mana of any color." }))).not.toBe("native-mana");
    expect(classifyCard(card({ name: "Altar-like", type: "Artifact", mana: "{2}",
      oracle: "Sacrifice a creature: Add {C}{C}." }))).not.toBe("native-mana");
  });
});

describe("what must still be credited — the gate is not a blanket ban", () => {
  it("a plain standing source is untouched (a mana rock — LANDS hit the unconditional land tier first)", () => {
    expect(classifyCard(card({ name: "Mana Rock", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}." }))).toBe("native-mana");
  });
  it("a mana dork is untouched", () => {
    expect(classifyCard(card({ name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: 1, toughness: 1,
      oracle: "{T}: Add {G}." }))).toBe("native-mana");
  });
  it("a TRIGGERED mana card keeps a native tier — it is reclassified, not dropped", () => {
    // Burning-Tree Emissary really does deliver {R}{G}; it just isn't a standing source, so the trigger
    // tier is the honest label. Losing the native-MANA name is the correction, not a loss of coverage.
    const tier = classifyCard(card({ name: "Burning-Tree Emissary", type: "Creature — Human Shaman", mana: "{R}{G}",
      power: 2, toughness: 2, oracle: "When this creature enters, add {R}{G}." }));
    expect(tier).toBe("native-trigger");
    expect(tier).toMatch(/^native/);
  });
  it("a ritual SPELL is unaffected (the spell path never went through this gate)", () => {
    expect(classifyCard(card({ name: "Dark Ritual", type: "Instant", mana: "{B}", oracle: "Add {B}{B}{B}." }))).toBe("native-spell");
  });
});

describe("the gate mirrors the runtime rather than guessing", () => {
  it("every card it now refuses is one manaProduction refuses", () => {
    for (const o of [
      { name: "Goblin Clearcutter", type: "Creature — Goblin", oracle: "{T}, Sacrifice a Forest: Add three mana in any combination of {R} and/or {G}." },
      { name: "Everflowing Chalice", type: "Artifact", oracle: "{T}: Add {C} for each charge counter on this artifact." },
      { name: "Coldsteel Heart", type: "Artifact", oracle: "This artifact enters tapped.\nAs this artifact enters, choose a color.\n{T}: Add one mana of the chosen color." },
    ]) expect(manaProduction(o)).toBeFalsy();
  });
  it("and every card it still credits is one manaProduction accepts", () => {
    expect(manaProduction({ name: "Mana Rock", type: "Artifact", oracle: "{T}: Add {C}." })).toBeTruthy();
  });
});
