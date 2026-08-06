/**
 * turnedFaceUpVacuous.test.js — the morph / megamorph / disguise FLIP payoff (CR 707.9), treated as vacuous:
 * "When/Whenever/As ~ is turned face up, <effect>." Willbender, Brine Elemental, Stormwing Dragon, Hooded
 * Hydra, Echo Tracer, Nantuko Vigilante and ~70 more.
 *
 * ⭐⭐ THE BIGGEST SINGLE CAUSE LEFT ON THE SHELF, AND IT WAS AN INCONSISTENCY RATHER THAN A GAP. The
 * codebase ALREADY strips `morph {cost}` as vacuous, with the reasoning written out at reMorphCost: there is
 * no morph lane in legalChoices, every morph card carries a normal mana cost, so the engine hard-casts it
 * FACE UP and its body resolves correctly. That same note then concludes the flip TRIGGER "keeps that
 * residue and stays body-only" — **the identical unreachable path treated two different ways**, which is
 * what left 75 cards parked on an ability the engine can never fire.
 *
 * ⛔ RE-VERIFIED, NOT INHERITED (the escape-rider slice's rule — vacuity is not transitive):
 *   · legalChoices has NO morph / face-down cast lane.
 *   · There is no turn-face-up action anywhere in the runtime. Face-down permanents DO exist (manifest
 *     creates them), and manifest.js states its own limit: "that turn-up is NOT modeled here". Nothing flips.
 *   · Every carrier is playable by its normal route — all have a printed mana cost except Branch of
 *     Vitu-Ghazi, a LAND (played, not cast) that already reads `land` tier.
 *
 * ⛔⛔ SENTENCE-ANCHORED AT THE CONDITION, AND ILLUSIONARY MASK IS WHY. Its activated ability contains
 * "…has not been turned face up … instead it's turned face up and…" MID-SENTENCE. A phrase-level strip
 * would carve a hole in that clause and could credit the card for the mangled remainder. The anchor requires
 * when/whenever/as to LEAD the sentence. Pinned.
 *
 * ⛔ THE COMPOUND "enters OR is turned face up" IS EXCLUDED — it routes as a normal ETB and DOES fire on the
 * face-up hard cast. Stripping it would delete a WORKING trigger, the same failure the Polukranos
 * sentence-scope note records. Pinned in both directions.
 *
 * ⓘ AUDITED PROGRAMMATICALLY, because 75 rows cannot be eyeballed: across all 116 touched cards, every
 * removal was a pure trigger sentence, and ZERO credited cards were left with a dangling continuation
 * ("If you do …", "That creature …") whose subject lived in the removed sentence. Roalesk, Prime Specimen is
 * the instructive near-miss — its first sentence is stripped, its conjure/cloak continuation survives as
 * residue, and it correctly stays parked.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * strip removed -> the whole family parks again; the leading anchor dropped -> Illusionary Mask is mangled;
 * the enters-exclusion dropped -> the compound ETB carriers lose a working trigger.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MORPH = "Morph {1}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)";

describe("the flip payoff stops blocking", () => {
  it("⭐ a morph creature whose only other text is the flip trigger flips native", () => {
    expect(classifyCard({ name: "Willbender", type: "Creature — Human Wizard", mana: "{1}{U}", power: "1", toughness: "2",
      oracle: `${MORPH}\nWhen this creature is turned face up, change the target of target spell or ability with a single target.` })).toBe("native-body");
    expect(classifyCard({ name: "Brine Elemental", type: "Creature — Elemental", mana: "{4}{U}{U}", power: "5", toughness: "4",
      oracle: "Morph {5}{U}{U}\nWhen this creature is turned face up, each opponent skips their next untap step." })).toBe("native-body");
  });

  it("⭐ the megamorph and 'As …' wordings ride along", () => {
    expect(classifyCard({ name: "Stormwing Dragon", type: "Creature — Dragon", mana: "{5}{R}", power: "4", toughness: "4",
      oracle: "Flying, first strike\nMegamorph {5}{R}{R}\nWhen this creature is turned face up, put a +1/+1 counter on each other Dragon creature you control." })).toBe("native-body");
    // ⚠️ THE "As …" PIN USES A MINIMAL FIXTURE ON PURPOSE. My first cut asserted the real Hooded Hydra
    // flips; it does not, and the failure was correct — its dies-trigger ("create a 1/1 Snake for EACH
    // +1/+1 counter on it") is the blocker, not the flip line. Asserting the wording in isolation proves the
    // strip; asserting Hooded Hydra would have been asserting a coincidence.
    expect(classifyCard({ name: "Probe Hydra", type: "Creature — Hydra", mana: "{2}{G}", power: "3", toughness: "3",
      oracle: "Morph {3}{G}{G}\nAs this creature is turned face up, put five +1/+1 counters on it." })).toBe("native-body");
  });

  it("⭐ …and the real Hooded Hydra is NOW NATIVE — its dies trigger was the blocker, exactly as pinned", () => {
    // ⚠️ THIS ASSERTED body-only WHEN THE SLICE ABOVE SHIPPED, and the assertion carried a claim: that the
    // flip line was NOT what parked this card — its dies trigger ("create a Snake for each +1/+1 counter on
    // it") was. That claim has now been tested the only way it can be: the counters-on-source count shipped
    // (plusCountersOnSource.test.js), the dies trigger became modelled, and the card flipped without the
    // flip line ever mattering. **The pin predicted its own resolution**, which is what a reason-carrying
    // assertion is for.
    expect(classifyCard({ name: "Hooded Hydra", type: "Creature — Snake Hydra", mana: "{X}{G}{G}", power: "0", toughness: "0",
      oracle: "This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 green Snake creature token for each +1/+1 counter on it.\nMorph {3}{G}{G}\nAs this creature is turned face up, put five +1/+1 counters on it." })).toBe("native-trigger");
  });

  it("⭐ it composes — a flip creature keeps its OTHER real abilities", () => {
    // The strip must not be doing the work that the rest of the card's coverage does.
    expect(classifyCard({ name: "Nantuko Vigilante", type: "Creature — Insect Druid Mutant", mana: "{3}{G}", power: "3", toughness: "2",
      oracle: "Morph {1}{G}\nWhen this creature is turned face up, destroy target artifact or enchantment." })).toBe("native-body");
  });
});

describe("⛔⛔ THE TWO EXCLUSIONS — each is a card that would break if the anchor slipped", () => {
  it("⛔⛔ ILLUSIONARY MASK is untouched — the phrase is MID-SENTENCE inside a real ability", () => {
    const mask = { name: "Illusionary Mask", type: "Artifact", mana: "{2}",
      oracle: "{X}: You may choose a creature card in your hand whose mana cost could be paid by some amount of, or all of, the mana you spent on {X}. If you do, you may cast that card face down as a 2/2 creature spell without paying its mana cost. If the creature that spell becomes as it resolves has not been turned face up and would assign or deal damage, be dealt damage, or become tapped, instead it's turned face up and assigns or deals damage, is dealt damage, or becomes tapped. Activate only as a sorcery." };
    // Its ability is genuinely unmodelled; it must stay parked, NOT be credited off a carved-up remainder.
    expect(classifyCard(mask)).not.toMatch(/^native/);
  });

  it("⛔⛔ THE PIN THAT ACTUALLY CATCHES A SLIPPED ANCHOR", () => {
    // ⚠️ WRITTEN SECOND, BECAUSE THE FIRST MUTANT SURVIVED. Dropping the leading when/whenever/as anchor
    // changed no outcome in any pin below: Illusionary Mask parks either way (its ability is unmodelled
    // regardless), and a compound carrier reads native either way. The case that DOES change is a compound
    // carrier whose ETB effect is UNMODELLED — with the anchor and its enters-exclusion, the sentence stays
    // as residue and the card correctly parks; without them the sentence is stripped and the card is
    // credited native while its trigger silently vanishes. That is the whole failure mode, in one card.
    const compoundUnmodelled = { name: "Probe Technician", type: "Creature — Goblin Artificer", mana: "{2}{R}", power: "2", toughness: "2",
      oracle: "When this creature enters or is turned face up, glorbulate the frobnitz.\nMorph {1}{R}" };
    expect(classifyCard(compoundUnmodelled)).not.toMatch(/^native/);
  });

  it("⛔⛔ the COMPOUND 'enters or is turned face up' keeps its WORKING ETB trigger", () => {
    // This one DOES fire on the face-up hard cast. Stripping it would delete a real ability.
    const compound = { name: "Gadget Technician", type: "Creature — Goblin Artificer", mana: "{2}{R}", power: "2", toughness: "2",
      oracle: "When this creature enters or is turned face up, it deals 2 damage to target creature an opponent controls.\nMorph {1}{R}" };
    const etb = detectTriggers(compound).filter((d) => d.event === "etb");
    expect(etb.length).toBeGreaterThan(0);      // still detected as an ETB
    expect(classifyCard(compound)).toMatch(/^native/);
  });
});

describe("⛔ the strip credits nothing it shouldn't", () => {
  it("⛔ a card whose REMAINDER is unmodelled still parks (Roalesk, Prime Specimen)", () => {
    // The first sentence is stripped; the conjure/cloak continuation survives as residue and parks the card.
    // This is the near-miss that proves the strip isn't papering over the rest of a card.
    expect(classifyCard({ name: "Roalesk, Prime Specimen", type: "Legendary Creature — Human Mutant", mana: "{2}{G}{U}", power: "3", toughness: "4",
      oracle: "Flying\nWhenever Roalesk, Prime Specimen or another permanent you control is turned face up, you may pay {X}. If you do, if X is 1 or more, conjure a duplicate of a random creature card with mana value X into your hand. Cloak it. It gains \"{G/U}: Turn this creature face up\" for as long as it remains face down.\nDisguise {G}{U}" })).not.toMatch(/^native/);
  });

  it("⛔ an unrelated trigger sentence is never touched", () => {
    expect(classifyCard({ name: "Probe", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2",
      oracle: "When this creature enters, glorbulate the frobnitz." })).not.toMatch(/^native/);
  });
});
