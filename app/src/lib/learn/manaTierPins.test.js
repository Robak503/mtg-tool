/**
 * MANA-TIER CREED PINS (C4, 2026-07-18) — corpus pins for the `native-mana` gate.
 *
 * `classifyCard` credits native-mana only when `hasManaAbility(...) && manaCardResidueModeled(...)`. The
 * RESIDUE half is the load-bearing one: a card that taps for mana AND does something unmodeled must stay
 * `body-only`, because crediting it is an OVER-CLAIM — the metric says "we model this card" while the
 * runtime silently ignores half of it. That inflates coverage instead of failing, so no number catches it.
 *
 * 589 corpus cards currently earn native-mana; 319 more carry a mana ability but are correctly parked on
 * residue. That whole class had ~5 pinned exemplars, so a refactor loosening the residue gate could have
 * moved hundreds of cards across the line with nothing going red. These pins are REAL corpus cards (oracle
 * text copied verbatim from the index), chosen by EDHREC rank so they're the ones that matter in play, and
 * spread deliberately across the distinct residue SHAPES so a regression names which shape broke.
 *
 * Fixtures are hardcoded card shapes — deterministic and index-free, per coverage.test.js's convention
 * (CI has no Scryfall bulk data).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const C = (name, type, oracle) => ({ name, type, oracle, mana: "" });

describe("MUST_STAY_HIGH — clean mana sources keep the native-mana tier", () => {
  const CASES = [
    ["Sol Ring", "Artifact", "{T}: Add {C}{C}.", "fixed colorless — the most-played card in the format"],
    ["Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", "creature dork, single colored pip"],
    ["Birds of Paradise", "Creature — Bird", "Flying\n{T}: Add one mana of any color.", "any-color dork; a bare keyword is modeled residue"],
    ["Arcane Signet", "Artifact", "{T}: Add one mana of any color in your commander's color identity.", "commander-identity any-color"],
    ["Fellwar Stone", "Artifact", "{T}: Add one mana of any color that a land an opponent controls could produce.", "opponent-derived any-color"],
    ["Thought Vessel", "Artifact", "You have no maximum hand size.\n{T}: Add {C}.", "mana + a MODELED static"],
    ["Mind Stone", "Artifact", "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.", "mana + a modeled sac-to-draw activated ability"],
    ["Commander's Sphere", "Artifact", "{T}: Add one mana of any color in your commander's color identity.\nSacrifice this artifact: Draw a card.", "mana + modeled sacrifice rider"],
    ["Mana Vault", "Artifact", "This artifact doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this artifact.\nAt the beginning of your draw step, if this artifact is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}.", "graduated 2026-07-30 — a self-untap lock, its pay-to-untap escape and a draw-step self-damage trigger, all three modeled"],
    ["Selvala, Heart of the Wilds", "Legendary Creature — Elf Scout",
      "Whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power.\n{G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control.",
      "graduated 2026-10-01 (P·32) — the power-comparison draw trigger is modeled beside its variable-X add"],
    ["Midnight Clock", "Artifact",
      "{T}: Add {U}.\n{2}{U}: Put an hour counter on this artifact.\nAt the beginning of each upkeep, put an hour counter on this artifact.\nWhen the twelfth hour counter is put on this artifact, shuffle your hand and graveyard into your library, then draw seven cards. Exile this artifact.",
      "graduated 2026-10-17 (play-weighted #645) — the twelfth-counter trigger, the controller's wheel and the self exile are modeled (midnightClock.test.js runs them)"],
  ];

  for (const [name, type, oracle, why] of CASES) {
    it(`${name} — ${why}`, () => {
      expect(classifyCard(C(name, type, oracle))).toBe("native-mana");
    });
  }
});

// BOUNDARY-MARKER GRADUATED 2026-07-30 — MANA VAULT moved from MUST_NOT_OVER-CLAIM up to MUST_STAY_HIGH.
// It was pinned below for three residue clauses: the self-untap lock, its pay-to-untap escape, and the
// draw-step self-damage trigger. All three are now modeled — the last one ("untap this artifact") closed by
// teaching the self-untap parse arm its non-creature nouns AND widening applyTapEffect's creature-only type
// check so the artifact is really untapped (selfUntapNonCreature.test.js asserts the RUNTIME, not the tier).
// The guard this block exists for is untouched: seven cards with genuinely unmodeled residue remain, still
// spread across the distinct residue shapes. A pin graduates when its stated reason is closed — it is never
// deleted for going green.
// BOUNDARY-MARKER GRADUATED 2026-10-01 (P·32) — SELVALA, HEART OF THE WILDS moved up to MUST_STAY_HIGH: its
// power-comparison draw trigger is modeled (the entering creature's controller decides; selvala.test.js runs it). Its
// shape — a trigger beside a variable-X add — keeps a live fixture here in Helga, Skittish Seer, still parked.
// BOUNDARY-MARKER GRADUATED 2026-10-17 (play-weighted #645) — MIDNIGHT CLOCK moved up to MUST_STAY_HIGH: its counter-threshold
// trigger ("When the twelfth hour counter is put on this artifact"), the controller's shuffle-and-draw-seven and the self exile are
// modeled. Its shape — counters accumulating toward a payoff — keeps a live fixture here in Black Market, still parked.
describe("MUST_NOT_OVER-CLAIM — a mana ability plus UNMODELED residue stays parked", () => {
  // Every card here taps for mana, so ONLY the residue gate keeps it honest. If one of these ever reports
  // native-mana, the runtime is ignoring the rest of the card while the metric counts it fully modeled.
  const CASES = [
    ["Black Market", "Enchantment",
      "Whenever a creature dies, put a charge counter on this enchantment.\nAt the beginning of your first main phase, add {B} for each charge counter on this enchantment.",
      "counter accumulation feeding a scaled phase-triggered add"],
    ["Helga, Skittish Seer", "Legendary Creature — Frog Druid",
      "Whenever you cast a creature spell with mana value 4 or greater, you draw a card, gain 1 life, and put a +1/+1 counter on Helga.\n{T}: Add X mana of any one color, where X is Helga's power. Spend this mana only to cast creature spells with mana value 4 or greater or creature spells with {X} in their mana costs.",
      "a cast trigger beside a spend-restricted variable-X add (Selvala's shape, still parked)"],
    ["Rishkar, Peema Renegade", "Legendary Creature — Elf Druid",
      "When Rishkar enters, put a +1/+1 counter on each of up to two target creatures.\nEach creature you control with a counter on it has \"{T}: Add {G}.\"",
      "GRANTS the mana ability to other creatures — it has none itself"],
    ["Jaheira, Friend of the Forest", "Legendary Creature — Human Elf Druid",
      "Tokens you control have \"{T}: Add {G}.\"\nChoose a Background (You can have a Background as a second commander.)",
      "grants the ability to tokens — the card itself taps for nothing"],
    ["Imprisoned in the Moon", "Enchantment — Aura",
      "Enchant creature, land, or planeswalker\nEnchanted permanent is a colorless land with \"{T}: Add {C}\" and loses all other card types and abilities.",
      "the mana ability belongs to the ENCHANTED permanent, not the Aura"],
  ];

  for (const [name, type, oracle, why] of CASES) {
    it(`${name} — ${why}`, () => {
      expect(classifyCard(C(name, type, oracle))).not.toBe("native-mana");
    });
  }
});

// ⚠️ RE-PINNED 2026-10-16 (the gate's static leg — manaTierStaticResidue.test.js). This pair said Chromatic Lantern
// "earns the tier on its OWN ability, despite also granting one". True of the READER — its own ability is a real
// source and the grant is not mistaken for one — but the tier also claimed the GRANT, which the gate never read.
// Measured on a board: a Forest beside the Lantern still taps only for {G}, because parseStaticAbilities emits
// nothing for "Lands you control have …" (a Cryptolith Rite control on the same harness shows a grant that IS
// applied: its bear taps for any color). The Lantern now parks on that sentence. The pair's point stands, stated
// honestly: a grant the runtime applies does not disqualify a card; one it does not apply does.
// ⚠️ RE-PINNED AGAIN 2026-10-17 (play-weighted #85). The runtime applies the Lantern's land grant now (a Forest beside it taps
// for any colour, once — chromaticLantern.test.js), so the Lantern moved to the APPLIED side. The not-applied witness is
// Orochi Merge-Keeper: a real "{T}: Add {G}." of its own and a conditional self-grant ("As long as this creature is modified,
// it has \"{T}: Add {G}{G}.\"") nothing emits a descriptor for.
describe("GRANTED vs OWN mana ability — the pair that keeps the reader honest", () => {
  it("a grant the runtime APPLIES does not disqualify the card — Enduring Vitality's creature grant is a parsed static", () => {
    expect(classifyCard(C("Enduring Vitality", "Enchantment Creature — Elk Glimmer",
      "Vigilance\nCreatures you control have \"{T}: Add one mana of any color.\"\nWhen Enduring Vitality dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)"))).toBe("native-mana");
  });

  it("a grant the runtime APPLIES to lands does not disqualify the card either — Chromatic Lantern (since 2026-10-17)", () => {
    expect(classifyCard(C("Chromatic Lantern", "Artifact",
      "Lands you control have \"{T}: Add one mana of any color.\"\n{T}: Add one mana of any color."))).toBe("native-mana");
  });

  it("a grant the runtime does NOT apply parks the card, however real its own ability — Orochi Merge-Keeper", () => {
    expect(classifyCard(C("Orochi Merge-Keeper", "Creature — Snake Druid",
      "{T}: Add {G}.\nAs long as this creature is modified, it has \"{T}: Add {G}{G}.\" (Equipment, Auras you control, and counters are modifications.)"))).not.toBe("native-mana");
  });

  it("a granter with NO ability of its own is never credited", () => {
    expect(classifyCard(C("Jaheira, Friend of the Forest", "Legendary Creature — Human Elf Druid",
      "Tokens you control have \"{T}: Add {G}.\"\nChoose a Background (You can have a Background as a second commander.)"))).not.toBe("native-mana");
  });
});
