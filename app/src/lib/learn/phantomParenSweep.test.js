/**
 * phantomParenSweep.test.js — the last two phantom-paren descriptors in the corpus, plus the sweep's own
 * negative result written down so it isn't re-derived.
 *
 * ⭐ THIS FILE IS THE PRODUCT OF AN INSTRUMENT, NOT OF A CARD. Six bugs now share one fingerprint
 * (fading, vanishing, squad, impending, graft, champion): reminder text read as rules text leaves a
 * descriptor whose effectClause carries an UNBALANCED ')'. After the fifth, the corpus got swept for
 * exactly that signature instead of waiting for a seventh card to trip over. The sweep returned three
 * hits — the two fixed here, plus one acorn joke card (Xerex Squire's hypotenuse reminder) deliberately
 * left alone. It is now at zero. RE-RUN IT AFTER ANY REMINDER-STRIP WORK.
 *
 * ⓘ ⛔ NEITHER FIX FLIPS A CARD — measured GAINED 0 / LOST 0 / RETIERED 0, and that is reported, not
 * buried. Both carriers have unrelated blockers. They ship anyway because a phantom is a WRONG DATA SHAPE,
 * not a missing feature: graft proved the cost, where the phantom sat as a hidden SECOND blocker behind
 * the real one and would have produced a bogus trigger the moment the first was cleared. Keeping the sweep
 * at zero is what makes it a usable instrument.
 *
 * ⚠️ ORDERING MATTERS AND IT IS THE INTERESTING PART. Champion's phantom appeared on exactly ONE of nine
 * carriers, because Scryfall re-worded most champion reminders from "When this creature leaves" to "When
 * this leaves" and the short form matches no anchor — so the other eight were not clean, they were
 * INVISIBLE. Widening the anchor to accept the re-worded form (the obvious "fix") would have manufactured
 * the phantom on Thoughtweft Trio, Nova Chaser and Mistbind Clique and LOST them. Gate 20 exactly: before
 * loosening a shared gate, ask what else reads it. The strip lands; the widening does not (see below).
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * champion strip removed -> Wren's Run Packmaster's phantom returns; "seven|twelve" removed from the
 * fading number-word alternation -> Saproling Burst's returns.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

const unbalanced = (card) => (detectTriggers(card) || [])
  .map((d) => String(d?.effectClause || ""))
  .filter((e) => (e.match(/\)/g) || []).length > (e.match(/\(/g) || []).length);

const WRENS_RUN_PACKMASTER = { id: "c-wrp", name: "Wren's Run Packmaster", type: "Creature — Elf Warrior",
  mana: "{3}{G}{G}", power: 3, toughness: 3,
  oracle: "Champion an Elf (When this creature enters, sacrifice it unless you exile another Elf you control. When this creature leaves the battlefield, that card returns to the battlefield.)\n{2}{G}: Create a 2/2 green Wolf creature token.\nWolves you control have deathtouch." };
const THOUGHTWEFT_TRIO = { id: "c-tt", name: "Thoughtweft Trio", type: "Creature — Kithkin Soldier",
  mana: "{3}{W}{W}", power: 3, toughness: 3,
  oracle: "First strike, vigilance\nChampion a Kithkin (When this enters, sacrifice it unless you exile another Kithkin you control. When this leaves the battlefield, that card returns to the battlefield.)" };
const SAPROLING_BURST = { id: "c-sb", name: "Saproling Burst", type: "Enchantment", mana: "{3}{G}{G}",
  oracle: "Fading 7 (This enchantment enters with seven fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\nRemove a fade counter from this enchantment: Create a green Saproling creature token. It has \"This token's power and toughness are each equal to the number of fade counters on Saproling Burst.\"\nWhen this enchantment leaves the battlefield, destroy all tokens created with this enchantment. They can't be regenerated." };

describe("⭐ the sweep is at zero — no descriptor carries an unbalanced ')'", () => {
  it("champion: the reminder's second sentence stops leaking", () => {
    expect(unbalanced(WRENS_RUN_PACKMASTER)).toEqual([]);
  });

  it("fading: 'seven' was missing from the number-word alternation", () => {
    expect(unbalanced(SAPROLING_BURST)).toEqual([]);
  });

  it("⛔ the champion KEYWORD survives the strip — the synthesis owns the enters half", () => {
    expect(detectTriggers(WRENS_RUN_PACKMASTER).map((d) => String(d.effectClause)))
      .toEqual(["[champion:elf] champion a elf"]);
  });

  it("⛔ NO REGRESSION on the re-worded carriers the strip also covers", () => {
    expect(classifyCard(THOUGHTWEFT_TRIO)).toBe("native-body");
    expect(detectTriggers(THOUGHTWEFT_TRIO).map((d) => String(d.effectClause)))
      .toEqual(["[champion:kithkin] champion a kithkin"]);
  });
});

describe("⛔ the widening that was BUILT, MEASURED AT ZERO CARRIERS, AND WITHHELD", () => {
  it("the re-worded self form stays undetected — a safe FN, pinned so the state is deliberate", () => {
    const probe = (oracle) => detectTriggers({ id: "c-p", name: "Probe", type: "Creature — Human",
      mana: "{1}{G}", power: 2, toughness: 2, oracle });
    // Sweeping the corpus with every parenthetical removed found ZERO cards printing either of these as
    // real rules text. Accepting them would be code no card can exercise. The patch is recorded in
    // triggers.js beside each anchor; re-run the sweep after a bulk Scryfall refresh.
    expect(probe("When this leaves the battlefield, draw a card.")).toEqual([]);
    expect(probe("When this becomes tapped, draw a card.")).toEqual([]);
    // ⭐ THE LONG FORM — which 121 cards actually print — is detected, and that is the half that matters.
    expect(probe("When this creature leaves the battlefield, draw a card.").map((d) => d.event))
      .toEqual(["leavesSelf"]);
    expect(probe("When this creature becomes tapped, draw a card.").map((d) => d.event))
      .toEqual(["becomesTapped"]);
  });
});
